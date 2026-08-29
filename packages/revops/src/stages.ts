// Stage derivation — the core of the "not a CRM" property.
//
// deriveState() is a PURE FOLD over a prospect's event log. Call it twice with
// the same events and you get the same answer; call it after appending one
// event and the stage moves on its own. Nothing is stored, so nothing drifts.
//
// The rule is: a prospect's stage is the FURTHEST stage whose entry condition
// its events satisfy — not "the last stage someone set". That distinction is
// what makes the pipeline honest. If a meeting got booked but nobody ever
// logged the outbound contact, the prospect is still in MEETING (the furthest
// satisfied condition), because the meeting is the stronger evidence.

import {
  type RevOpsEvent,
  type PipelineState,
  type RepliedPayload,
  type SnoozedPayload,
  type Stage,
  STAGE_ORDER,
  stageRank,
} from "./types.js";

export interface DerivedState {
  readonly state: PipelineState;
  /** The furthest non-terminal stage reached; useful even when terminal. */
  readonly stage: Stage;
  /** Count of `contacted` events — drives follow-up cadence. */
  readonly contact_attempts: number;
  /** ISO of the most recent `contacted`, if any. */
  readonly last_contacted_at?: string;
  /** ISO of the most recent inbound `replied`, if any. */
  readonly last_replied_at?: string;
  /** ISO of the newest event of any kind. */
  readonly last_event_at?: string;
  /** Set when a `snoozed` event with a future date is in effect. */
  readonly snoozed_until?: string;
  /** True when they asked us to stop. Suppresses all outbound forever. */
  readonly opt_out: boolean;
}

/** Sort by seq, which is authoritative — timestamps can collide or skew. */
function ordered(events: readonly RevOpsEvent[]): RevOpsEvent[] {
  return [...events].sort((a, b) => a.seq - b.seq);
}

function has(events: readonly RevOpsEvent[], type: string): boolean {
  return events.some((e) => e.type === type);
}

/**
 * Entry conditions, in STAGE_ORDER. Each answers only "has this stage been
 * reached?" — never "is this the current stage?". The fold takes the max.
 *
 * Note the deliberate asymmetry: later stages do NOT require earlier events.
 * `agreement_signed` alone proves ONBOARDING even if the outreach was never
 * logged (it happened offline, on a call, at a conference). Requiring the full
 * chain would make the pipeline lie whenever reality skipped a step — the most
 * common way funnel data rots.
 */
const ENTRY: Record<Stage, (e: readonly RevOpsEvent[]) => boolean> = {
  IDENTIFIED: () => true, // existing at all == identified
  QUALIFIED: (e) => has(e, "qualified"),
  DECISION_MAKER_FOUND: (e) => has(e, "decision_maker_found"),
  READY_TO_CONTACT: (e) => has(e, "contact_verified"),
  CONTACTED: (e) => has(e, "contacted"),
  ENGAGED: (e) => has(e, "replied"),
  MEETING: (e) => has(e, "meeting_booked") || has(e, "meeting_held"),
  PROPOSAL: (e) => has(e, "proposal_sent"),
  ONBOARDING: (e) => has(e, "agreement_signed"),
  LIVE: (e) => has(e, "went_live"),
  REVENUE: (e) => has(e, "first_revenue"),
};

/**
 * Fold the event log into current state.
 *
 * Terminal precedence (highest first):
 *   1. opt-out / disqualified  — absolute, never re-enters the queue
 *   2. lost                    — until an explicit `reopened`
 *   3. snoozed (future date)   — DORMANT until the date passes
 * A `reopened` event clears `lost` and any snooze, but NEVER clears an
 * opt-out: honoring "stop contacting me" is not a business decision.
 */
export function deriveState(events: readonly RevOpsEvent[]): DerivedState {
  const evs = ordered(events);

  let stage: Stage = "IDENTIFIED";
  for (const s of STAGE_ORDER) {
    if (ENTRY[s](evs)) stage = s;
  }

  let contact_attempts = 0;
  let last_contacted_at: string | undefined;
  let last_replied_at: string | undefined;
  let opt_out = false;
  let lost = false;
  let disqualified = false;
  let snoozed_until: string | undefined;

  for (const e of evs) {
    switch (e.type) {
      case "contacted":
        contact_attempts += 1;
        last_contacted_at = e.at;
        break;
      case "replied": {
        last_replied_at = e.at;
        const p = e.payload as RepliedPayload | undefined;
        if (p?.opt_out) opt_out = true;
        break;
      }
      case "disqualified":
        disqualified = true;
        break;
      case "lost":
        lost = true;
        break;
      case "snoozed": {
        const p = e.payload as SnoozedPayload | undefined;
        // No date == indefinite hold. Sentinel keeps the comparison total
        // rather than special-casing undefined at every read site.
        snoozed_until = p?.until ?? "9999-12-31T00:00:00.000Z";
        break;
      }
      case "reopened":
        lost = false;
        snoozed_until = undefined;
        break;
      default:
        break;
    }
  }

  const last_event_at = evs.length > 0 ? evs[evs.length - 1]!.at : undefined;

  let state: PipelineState = stage;
  if (disqualified || opt_out) state = "DISQUALIFIED";
  else if (lost) state = "LOST";
  else if (snoozed_until !== undefined) state = "DORMANT";

  return {
    state,
    stage,
    contact_attempts,
    last_contacted_at,
    last_replied_at,
    last_event_at,
    snoozed_until,
    opt_out,
  };
}

/**
 * True when a snooze has expired and the prospect should re-enter the queue.
 * Called by the queue builder so a DORMANT prospect revives on its own — no
 * sweeper job, no "review your snoozed items" chore.
 */
export function snoozeExpired(state: DerivedState, now: Date): boolean {
  if (!state.snoozed_until) return false;
  return new Date(state.snoozed_until).getTime() <= now.getTime();
}

/** Convenience for funnel math and tests. */
export function reachedStage(events: readonly RevOpsEvent[], stage: Stage): boolean {
  return stageRank(deriveState(events).stage) >= stageRank(stage);
}
