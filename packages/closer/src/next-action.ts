// "What do I do next?" — the reason this system exists.
//
// nextAction() is a pure function of (derived state, score, now). It is never
// stored. That means the daily queue is recomputed from facts on every read,
// so it cannot contain a stale task, and nobody ever has to groom it.
//
// Every stage answers exactly one question: what is the single next thing, and
// when is it due. "Do two things" is not expressible on purpose — a queue that
// hands you one action per prospect is a queue you actually work.

import type { DerivedState } from "./stages.js";
import { snoozeExpired } from "./stages.js";
import type { NextAction, NextActionKind, Prospect, Stage } from "./types.js";

/**
 * Cadence policy. Deliberately small and in one place — this is the knob a
 * human tunes, and everything else is derived from it.
 */
export interface Cadence {
  /** Days to wait after a contact before the follow-up is due. */
  readonly follow_up_days: readonly number[];
  /** After this many contacts with no reply, go DORMANT instead of nagging. */
  readonly max_attempts: number;
  /** Days a fresh prospect may sit un-enriched before it is due. */
  readonly enrich_within_days: number;
  /** Days a proposal may sit un-answered before chasing. */
  readonly proposal_chase_days: number;
  /** Days onboarding may stall before it is flagged. */
  readonly onboarding_stall_days: number;
}

/**
 * Default cadence: 3 touches at day 0 / +3 / +7, then stop.
 *
 * Stopping at 3 is a deliberate anti-spam floor, not a growth-hack default.
 * The escalating gap (3 then 4 days) is the standard decay — a 4th touch on a
 * silent prospect converts far below the cost of the sender reputation it burns,
 * which matters doubly here because outreach to high-risk merchants is exactly
 * the population most likely to report unsolicited mail.
 */
export const DEFAULT_CADENCE: Cadence = {
  follow_up_days: [3, 7],
  max_attempts: 3,
  enrich_within_days: 2,
  proposal_chase_days: 4,
  onboarding_stall_days: 5,
};

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function iso(d: Date): string {
  return d.toISOString();
}

/**
 * Priority: score dominates, then stage depth (late-stage work is worth more
 * than top-of-funnel), then overdue-ness. Kept as a single integer so the
 * queue sort is stable and explainable.
 */
function priorityFor(stage: Stage, score: number, overdueDays: number): number {
  const stageWeight: Record<Stage, number> = {
    IDENTIFIED: 0,
    QUALIFIED: 5,
    DECISION_MAKER_FOUND: 10,
    READY_TO_CONTACT: 30,
    CONTACTED: 25,
    ENGAGED: 60,
    MEETING: 70,
    PROPOSAL: 80,
    ONBOARDING: 90,
    LIVE: 40,
    REVENUE: 0,
  };
  const overdue = Math.max(0, Math.min(overdueDays, 30));
  return stageWeight[stage] * 10 + score + overdue;
}

function build(
  prospect: Prospect,
  stage: Stage,
  action: NextActionKind,
  due_at: string,
  reason: string,
  score: number,
  now: Date,
): NextAction {
  const dueMs = new Date(due_at).getTime();
  const due_now = dueMs <= now.getTime();
  const overdueDays = due_now ? (now.getTime() - dueMs) / 86_400_000 : 0;
  return {
    prospect_id: prospect.prospect_id,
    action,
    due_at,
    due_now,
    reason,
    stage,
    priority: priorityFor(stage, score, overdueDays),
  };
}

/** A terminal prospect yields an explicit no-op rather than being filtered out
 *  silently — callers can still show "why is this not in my queue?". */
function nothing(prospect: Prospect, stage: Stage, reason: string, now: Date): NextAction {
  return {
    prospect_id: prospect.prospect_id,
    action: "nothing",
    due_at: iso(now),
    due_now: false,
    reason,
    stage,
    priority: -1,
  };
}

/**
 * Compute the next action for one prospect.
 *
 * @param prospect  identity + facts
 * @param state     derived from the event log (see stages.ts#deriveState)
 * @param score     0-100 from score.ts; used only for ranking, never gating
 * @param now       injected for testability — never call Date.now() inside
 */
export function nextAction(
  prospect: Prospect,
  state: DerivedState,
  score: number,
  now: Date,
  cadence: Cadence = DEFAULT_CADENCE,
): NextAction {
  const stage = state.stage;

  // ── Terminal handling ────────────────────────────────────────────────
  if (state.opt_out) {
    return nothing(prospect, stage, "Opted out — no further contact, ever.", now);
  }
  if (state.state === "DISQUALIFIED") {
    return nothing(prospect, stage, "Disqualified.", now);
  }
  if (state.state === "LOST") {
    return nothing(prospect, stage, "Lost — reopen to work again.", now);
  }
  if (state.state === "DORMANT" && !snoozeExpired(state, now)) {
    return nothing(
      prospect,
      stage,
      `Snoozed until ${state.snoozed_until ?? "indefinitely"}.`,
      now,
    );
  }

  const anchor = state.last_event_at ?? prospect.created_at;

  switch (stage) {
    // Top of funnel: we know they exist, nothing else.
    case "IDENTIFIED": {
      const enriched = prospect.facts.vertical !== undefined;
      if (!enriched) {
        return build(
          prospect,
          stage,
          "enrich",
          addDays(anchor, cadence.enrich_within_days),
          "Identified but not enriched — no vertical or volume yet.",
          score,
          now,
        );
      }
      return build(
        prospect,
        stage,
        "qualify",
        iso(now),
        "Enriched — run qualification rules.",
        score,
        now,
      );
    }

    case "QUALIFIED":
      return build(
        prospect,
        stage,
        "find_decision_maker",
        iso(now),
        "Qualified — needs a named human with payment authority.",
        score,
        now,
      );

    case "DECISION_MAKER_FOUND":
      return build(
        prospect,
        stage,
        "verify_contact",
        iso(now),
        `Decision maker ${prospect.facts.decision_maker?.name ?? "found"} — verify a reachable channel.`,
        score,
        now,
      );

    // The money stage: everything is known, the only thing left is to reach out.
    case "READY_TO_CONTACT":
      return build(
        prospect,
        stage,
        "contact",
        iso(now),
        "Ready to contact — qualified, decision maker known, channel verified.",
        score,
        now,
      );

    // Contacted, no reply yet: follow up on cadence, then stop.
    case "CONTACTED": {
      const attempts = state.contact_attempts;
      if (attempts >= cadence.max_attempts) {
        return nothing(
          prospect,
          stage,
          `No reply after ${attempts} attempts — going dormant rather than nagging.`,
          now,
        );
      }
      // attempts=1 -> first gap, attempts=2 -> second gap, etc.
      const gapIdx = Math.min(attempts - 1, cadence.follow_up_days.length - 1);
      const gap = cadence.follow_up_days[Math.max(0, gapIdx)] ?? 3;
      const base = state.last_contacted_at ?? anchor;
      return build(
        prospect,
        stage,
        "follow_up",
        addDays(base, gap),
        `Attempt ${attempts} sent, no reply — follow up ${gap}d later.`,
        score,
        now,
      );
    }

    // They replied. This is the highest-value human moment in the pipeline.
    case "ENGAGED":
      return build(
        prospect,
        stage,
        "book_meeting",
        iso(now),
        "They replied — convert the reply into a meeting.",
        score,
        now,
      );

    case "MEETING":
      return build(
        prospect,
        stage,
        "hold_meeting",
        iso(now),
        "Meeting booked — hold it, then send terms.",
        score,
        now,
      );

    case "PROPOSAL":
      return build(
        prospect,
        stage,
        "chase_proposal",
        addDays(anchor, cadence.proposal_chase_days),
        `Proposal sent — chase after ${cadence.proposal_chase_days}d of silence.`,
        score,
        now,
      );

    case "ONBOARDING":
      return build(
        prospect,
        stage,
        "unblock_onboarding",
        addDays(anchor, cadence.onboarding_stall_days),
        "Signed — keep onboarding moving until they are live.",
        score,
        now,
      );

    // Live but no money yet. This gap is where "closed" deals quietly die, so
    // it stays in the queue instead of being treated as won.
    case "LIVE":
      return build(
        prospect,
        stage,
        "confirm_first_revenue",
        addDays(anchor, cadence.onboarding_stall_days),
        "Live but no first transaction yet — confirm real volume.",
        score,
        now,
      );

    case "REVENUE":
      return nothing(prospect, stage, "Revenue confirmed — closed won.", now);

    default:
      return nothing(prospect, stage, "No action.", now);
  }
}
