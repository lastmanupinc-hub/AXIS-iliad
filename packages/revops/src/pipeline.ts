// The two views a human actually consumes:
//
//   funnel()      the shape of the business    (847 -> 126 -> 43 -> 17)
//   todayQueue()  the shape of your morning    ("contact these 8")
//
// Both are computed from the event log on every call. There is no materialized
// funnel table and no queue table, so neither can disagree with reality.

import { deriveState, snoozeExpired, type DerivedState } from "./stages.js";
import { nextAction, type Cadence, DEFAULT_CADENCE } from "./next-action.js";
import { score, type ScoreResult } from "./score.js";
import {
  type RevOpsEvent,
  type NextAction,
  type PipelineState,
  type Prospect,
  type Stage,
  STAGE_ORDER,
  stageRank,
} from "./types.js";

/** A prospect plus its full event log — the unit every view operates on. */
export interface ProspectRecord {
  readonly prospect: Prospect;
  readonly events: readonly RevOpsEvent[];
}

export interface EvaluatedProspect {
  readonly prospect: Prospect;
  readonly state: DerivedState;
  readonly score: ScoreResult;
  readonly next: NextAction;
}

/** Evaluate one record: derive state, score it, compute the next action. */
export function evaluate(
  record: ProspectRecord,
  now: Date,
  cadence: Cadence = DEFAULT_CADENCE,
): EvaluatedProspect {
  const state = deriveState(record.events);
  const sc = score(record.prospect.facts, record.events, now);
  const next = nextAction(record.prospect, state, sc.score, now, cadence);
  return { prospect: record.prospect, state, score: sc, next };
}

export interface FunnelCounts {
  /** Every non-terminal prospect that has reached at least this stage. */
  readonly reached: Readonly<Record<Stage, number>>;
  /** Prospects whose CURRENT state is exactly this stage. */
  readonly current: Readonly<Record<Stage, number>>;
  readonly terminal: Readonly<Record<string, number>>;
  /** Qualified + has a live high-intent signal — the "showing buying signals" line. */
  readonly hot: number;
  /** Actions due now — the "today: contact these N" line. */
  readonly due_today: number;
  readonly total: number;
}

function emptyStageMap(): Record<Stage, number> {
  return STAGE_ORDER.reduce(
    (acc, s) => {
      acc[s] = 0;
      return acc;
    },
    {} as Record<Stage, number>,
  );
}

/**
 * The funnel. `reached` is cumulative (a prospect in MEETING also counts in
 * QUALIFIED) because that is the shape people mean when they say "126 meet
 * criteria" — not "126 are sitting still in that stage".
 */
export function funnel(
  records: readonly ProspectRecord[],
  now: Date,
  cadence: Cadence = DEFAULT_CADENCE,
): FunnelCounts {
  const reached = emptyStageMap();
  const current = emptyStageMap();
  const terminal: Record<string, number> = {};
  let hot = 0;
  let due_today = 0;

  for (const r of records) {
    const ev = evaluate(r, now, cadence);
    const st: PipelineState = ev.state.state;

    if (st === "DISQUALIFIED" || st === "LOST") {
      terminal[st] = (terminal[st] ?? 0) + 1;
      continue;
    }
    if (st === "DORMANT" && !snoozeExpired(ev.state, now)) {
      terminal["DORMANT"] = (terminal["DORMANT"] ?? 0) + 1;
      continue;
    }

    const rank = stageRank(ev.state.stage);
    for (const s of STAGE_ORDER) {
      if (stageRank(s) <= rank) reached[s] += 1;
    }
    current[ev.state.stage] += 1;

    if (ev.score.hot && rank >= stageRank("QUALIFIED")) hot += 1;
    if (ev.next.due_now && ev.next.action !== "nothing") due_today += 1;
  }

  return { reached, current, terminal, hot, due_today, total: records.length };
}

/**
 * Today's work, ranked. This is the product.
 *
 * Only actions that are actually DUE appear — a queue padded with
 * not-yet-due work is a queue people stop trusting. `limit` exists because a
 * human can work ~10 real touches a day; handing them 200 is the same as
 * handing them nothing.
 */
export function todayQueue(
  records: readonly ProspectRecord[],
  now: Date,
  opts: { limit?: number; cadence?: Cadence } = {},
): readonly EvaluatedProspect[] {
  const cadence = opts.cadence ?? DEFAULT_CADENCE;
  const due = records
    .map((r) => evaluate(r, now, cadence))
    .filter((e) => e.next.due_now && e.next.action !== "nothing")
    .sort((a, b) => {
      if (b.next.priority !== a.next.priority) return b.next.priority - a.next.priority;
      // Stable tiebreak so the queue does not reshuffle between reads.
      return a.prospect.prospect_id.localeCompare(b.prospect.prospect_id);
    });
  return opts.limit === undefined ? due : due.slice(0, opts.limit);
}

/**
 * Render the funnel as the founder's own summary shape. Kept here (not in a UI)
 * so the CLI, the API and any dashboard all print identical numbers.
 */
export function funnelSummary(f: FunnelCounts): string {
  const lines = [
    `${f.reached.IDENTIFIED} potential merchants identified`,
    `${f.reached.QUALIFIED} meet your qualification criteria`,
    `${f.reached.DECISION_MAKER_FOUND} have identifiable payment decision makers`,
    `${f.hot} are currently showing strong buying signals`,
    `Today: work these ${f.due_today}`,
    `${f.reached.ENGAGED} replied`,
    `${f.reached.MEETING} meetings booked`,
    `${f.reached.REVENUE} producing revenue`,
  ];
  return lines.join("\n↓\n");
}
