import type { DisputeEvent, DisputeState } from "./types.js";

/** Thrown by {@link nextDisputeState} when `(state, event)` has no legal edge. */
export class DisputeTransitionError extends Error {
  constructor(
    public readonly state: DisputeState,
    public readonly event: DisputeEvent,
  ) {
    super(`Illegal dispute transition: no edge for state "${state}" on event "${event}"`);
    this.name = "DisputeTransitionError";
  }
}

const TERMINAL_STATES: ReadonlySet<DisputeState> = new Set([
  "won",
  "lost",
  "accepted",
  "warning_closed",
]);

/**
 * The dispute lifecycle graph. Keyed by current state, then by the event
 * that may fire from that state, mapping to the resulting state.
 *
 * Design notes (this edge set is not dictated by any external rail spec —
 * it is AXIS's own internal model, chosen to be a faithful, idempotent
 * lifecycle over Stripe-style dispute webhooks):
 *  - `dispute_opened` on `needs_response` is a self-loop: webhook delivery
 *    is at-least-once, so a duplicate `charge.dispute.created` must be a
 *    no-op rather than an error.
 *  - `evidence_submitted` fires twice on the happy path: once when AXIS's
 *    own submitEvidence() call completes (evidence_assembling ->
 *    evidence_submitted), and again when the rail's webhook confirms the
 *    dispute has moved into formal review (evidence_submitted ->
 *    under_review).
 *  - `operator_accepted` and `warning_closed` are available as early exits
 *    from more than one non-terminal state, since a merchant (or an early
 *    fraud warning) can close a case before assembly/review completes.
 *  - Terminal states have no outgoing edges; every event on a terminal
 *    state throws.
 */
export const DISPUTE_TRANSITIONS: Readonly<
  Record<DisputeState, Partial<Record<DisputeEvent, DisputeState>>>
> = Object.freeze({
  needs_response: Object.freeze({
    dispute_opened: "needs_response",
    evidence_ready: "evidence_assembling",
    operator_accepted: "accepted",
    warning_closed: "warning_closed",
  }),
  evidence_assembling: Object.freeze({
    evidence_submitted: "evidence_submitted",
    operator_accepted: "accepted",
  }),
  evidence_submitted: Object.freeze({
    evidence_submitted: "under_review",
  }),
  under_review: Object.freeze({
    provider_won: "won",
    provider_lost: "lost",
    warning_closed: "warning_closed",
  }),
  won: Object.freeze({}),
  lost: Object.freeze({}),
  accepted: Object.freeze({}),
  warning_closed: Object.freeze({}),
});

/**
 * Pure transition function. Throws {@link DisputeTransitionError} on an
 * illegal `(state, event)` pair — including any event fired against a
 * terminal state.
 */
export function nextDisputeState(current: DisputeState, event: DisputeEvent): DisputeState {
  const next = DISPUTE_TRANSITIONS[current]?.[event];
  if (next === undefined) {
    throw new DisputeTransitionError(current, event);
  }
  return next;
}

/** True for exactly `won | lost | accepted | warning_closed`. */
export function isTerminal(state: DisputeState): boolean {
  return TERMINAL_STATES.has(state);
}
