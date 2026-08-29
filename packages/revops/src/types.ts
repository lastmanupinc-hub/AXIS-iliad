// @axis/revops — shared revenue-pipeline engine for AXIS programs.
//
// DESIGN RULE #1 (why this is not a CRM): nothing in this package stores a
// stage. `stage` is DERIVED from an append-only event log every time it is
// read (see stages.ts#deriveStage), and `next_action` is DERIVED from that
// stage plus elapsed time (see next-action.ts#nextAction). A human never
// "moves a card", so a card can never be stale, and there is no board state
// to reconcile against reality. The only thing anyone writes is a fact:
// "we emailed them", "they replied", "they signed".
//
// DESIGN RULE #2 (neutrality firewall): this package is DEMAND-side only —
// who we sell to. It must never be imported by, or feed, any payment-routing
// or pricing decision. PAI'D's own PARTNER_NETWORK_TREE.yaml states the rule
// this mirrors: PSPs compete per TRANSACTION, and commercial standing must
// never enter rail candidacy. A prospect's score is a sales artifact and
// nothing else.

/**
 * Pipeline stages, in strict order. A prospect's stage is the furthest stage
 * whose entry condition its event log satisfies — see stages.ts.
 *
 * These are deliberately opinionated (per the founder's spec) rather than
 * user-configurable: a configurable pipeline becomes a database you maintain.
 */
export type Stage =
  | "IDENTIFIED"
  | "QUALIFIED"
  | "DECISION_MAKER_FOUND"
  | "READY_TO_CONTACT"
  | "CONTACTED"
  | "ENGAGED"
  | "MEETING"
  | "PROPOSAL"
  | "ONBOARDING"
  | "LIVE"
  | "REVENUE";

/**
 * Terminal states. A prospect in one of these is out of the working set and
 * produces NO next action — the single most important property for keeping a
 * daily queue honest. DORMANT is recoverable (a later signal revives it);
 * DISQUALIFIED and LOST are not, absent an explicit human reopen.
 */
export type TerminalState = "DISQUALIFIED" | "LOST" | "DORMANT";

export type PipelineState = Stage | TerminalState;

export const STAGE_ORDER: readonly Stage[] = [
  "IDENTIFIED",
  "QUALIFIED",
  "DECISION_MAKER_FOUND",
  "READY_TO_CONTACT",
  "CONTACTED",
  "ENGAGED",
  "MEETING",
  "PROPOSAL",
  "ONBOARDING",
  "LIVE",
  "REVENUE",
] as const;

export const TERMINAL_STATES: readonly TerminalState[] = [
  "DISQUALIFIED",
  "LOST",
  "DORMANT",
] as const;

export function isTerminal(state: PipelineState): state is TerminalState {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

export function stageRank(stage: Stage): number {
  return STAGE_ORDER.indexOf(stage);
}

/**
 * Event types — the ONLY things a caller writes. Each maps to a fact that
 * actually occurred, never to an intention or a status.
 *
 * Deliberately absent: any "set_stage" / "move_to" event. Adding one would
 * reintroduce hand-maintained state and defeat the whole design.
 */
export type RevOpsEventType =
  /** Ingested from a source. Always the first event. */
  | "identified"
  /** Facts attached (firmographics, tech stack, volume proxy). Repeatable. */
  | "enriched"
  /** Passed the qualification rules — carries the reasons. */
  | "qualified"
  /** Failed a hard disqualifier. Terminal. */
  | "disqualified"
  /** A named human with payment authority was found. */
  | "decision_maker_found"
  /** A reachable, verified channel exists for that human. */
  | "contact_verified"
  /** A buying signal was observed. Repeatable; each carries its own weight. */
  | "signal"
  /** Outbound touch sent. Repeatable — attempt N is counted from these. */
  | "contacted"
  /** They responded. Positive or negative is carried in the payload. */
  | "replied"
  /** A meeting is on the calendar. */
  | "meeting_booked"
  /** The meeting happened. */
  | "meeting_held"
  /** Commercial terms sent. */
  | "proposal_sent"
  /** They agreed — moves to onboarding. */
  | "agreement_signed"
  /** Merchant is technically live on the platform. */
  | "went_live"
  /** First real money processed. The only honest definition of REVENUE. */
  | "first_revenue"
  /** Explicitly lost. Terminal. */
  | "lost"
  /** Human override: pause this prospect until a date, or indefinitely. */
  | "snoozed"
  /** Human override: bring a terminal/dormant prospect back into the queue. */
  | "reopened";

export interface RevOpsEvent {
  /** Monotonic per prospect. Ties are broken by this, not by timestamp. */
  readonly seq: number;
  readonly prospect_id: string;
  readonly type: RevOpsEventType;
  /** ISO 8601 UTC. */
  readonly at: string;
  /** Free-form, type-specific. See the payload interfaces below. */
  readonly payload?: Readonly<Record<string, unknown>>;
  /** Who/what produced this event — an operator id, or a source adapter id. */
  readonly actor?: string;
}

/** Payload for a `signal` event. */
export interface SignalPayload {
  readonly kind: SignalKind;
  /** Where we saw it — required, so a score is always auditable back to evidence. */
  readonly evidence_url?: string;
  readonly note?: string;
}

/**
 * Buying signals, highest-intent first. Weights live in score.ts so this stays
 * a vocabulary rather than a policy.
 *
 * These are PAI'D-shaped (high-risk merchant acquisition) but the engine treats
 * them as opaque — another AXIS program can supply its own kinds and weights.
 */
export type SignalKind =
  /** Publicly dropped, frozen, or terminated by their current processor. */
  | "processor_terminated"
  /** Complaining publicly about holds, reserves, or freezes. */
  | "payment_pain_public"
  /** Hiring for a payments/risk/chargeback role. */
  | "hiring_payments_role"
  /** Checkout is visibly broken or disabled on their site. */
  | "checkout_down"
  /** Migrated or is migrating payment stack (tech-fingerprint change). */
  | "stack_change_detected"
  /** Expanding into a new market/geo that needs new rails. */
  | "geo_expansion"
  /** Chargeback-ratio or MATCH-list exposure indicators. */
  | "chargeback_exposure"
  /** Inbound: they touched us first (site visit, docs, signup, abandoned). */
  | "inbound_interest";

/** Payload for `contacted`. */
export interface ContactedPayload {
  readonly channel: "email" | "phone" | "linkedin" | "form" | "in_person";
  /** 1-based. Derived if absent, but callers should set it. */
  readonly attempt?: number;
  readonly template_id?: string;
}

/** Payload for `replied`. */
export interface RepliedPayload {
  readonly sentiment: "positive" | "neutral" | "negative";
  /** True when they asked to stop. Forces DISQUALIFIED, never re-contacted. */
  readonly opt_out?: boolean;
}

/** Payload for `snoozed`. */
export interface SnoozedPayload {
  /** ISO date. Absent = indefinite (treated as DORMANT until reopened). */
  readonly until?: string;
  readonly reason?: string;
}

/**
 * A prospect: durable identity + facts. Note what is NOT here — no `stage`,
 * no `next_action`, no `last_contacted_at`. All of those are derived, and
 * storing them would let them drift from the event log.
 */
export interface Prospect {
  readonly prospect_id: string;
  readonly legal_name: string;
  readonly website?: string;
  /** Where this came from — required for provenance on every ingested row. */
  readonly source_id: string;
  /** Free-form facts accumulated by `enriched` events. */
  readonly facts: Readonly<ProspectFacts>;
  readonly created_at: string;
}

/**
 * Facts used by qualification and scoring. Every field is optional because a
 * freshly-identified prospect has almost none of them — that is precisely why
 * it sits in IDENTIFIED and not QUALIFIED.
 */
export interface ProspectFacts {
  /** Merchant category, ideally an MCC-adjacent label. */
  readonly vertical?: string;
  /** True when the vertical is one PAI'D is built for. Set by qualify rules. */
  readonly high_risk?: boolean;
  readonly country?: string;
  /** Estimated monthly processing volume in minor units (cents). */
  readonly est_monthly_volume?: number;
  /** Detected current payment processor(s). */
  readonly current_processors?: readonly string[];
  /** Named human with payment authority. */
  readonly decision_maker?: DecisionMaker;
  /** True once a channel to the decision maker is verified reachable. */
  readonly contact_verified?: boolean;
  readonly employee_count?: number;
  readonly founded_year?: number;
}

export interface DecisionMaker {
  readonly name: string;
  readonly title?: string;
  readonly email?: string;
  readonly linkedin?: string;
  /** How we established this person has payment authority. */
  readonly basis?: string;
}

/**
 * The output that matters. Everything else in this package exists to produce
 * this: for a given prospect, what is the single next thing to do, and when.
 */
export interface NextAction {
  readonly prospect_id: string;
  /** The verb. Stable enough to route to a handler or a UI button. */
  readonly action: NextActionKind;
  /** ISO date this became/becomes due. Past = overdue and should be worked. */
  readonly due_at: string;
  /** True when due_at <= now. */
  readonly due_now: boolean;
  /** Plain-language reason, always populated — the queue must be explainable. */
  readonly reason: string;
  /** Derived stage this action was computed from. */
  readonly stage: Stage;
  /** Ranking hint for the daily queue; higher works first. */
  readonly priority: number;
}

export type NextActionKind =
  | "enrich"
  | "qualify"
  | "find_decision_maker"
  | "verify_contact"
  | "contact"
  | "follow_up"
  | "book_meeting"
  | "hold_meeting"
  | "send_proposal"
  | "chase_proposal"
  | "start_onboarding"
  | "unblock_onboarding"
  | "confirm_first_revenue"
  | "nothing";
