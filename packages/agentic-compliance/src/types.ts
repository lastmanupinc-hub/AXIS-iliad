/**
 * Rail-agnostic dispute lifecycle types (WO-08).
 *
 * `stripe` is the live rail today (Visa/Mastercard/etc. disputes on charges
 * processed through Stripe). `vrol` (Visa Resolve Online / Verifi), `rdr`
 * (Rapid Dispute Resolution), and `cdrn` (Ethoca Consumer Clarity / Cardholder
 * Dispute Resolution Network) are integration-ready but require acquirer/PSP
 * provisioning — see dispute-clients.ts.
 */
export type DisputeRail = "stripe" | "vrol" | "rdr" | "cdrn";

/**
 * Internal lifecycle state of a dispute record. This is AXIS's own state,
 * distinct from (but derived from) whatever status vocabulary a given rail
 * uses on the wire (e.g. Stripe's `dispute.status`).
 */
export type DisputeState =
  | "needs_response"
  | "evidence_assembling"
  | "evidence_submitted"
  | "under_review"
  | "won"
  | "lost"
  | "accepted"
  | "warning_closed";

/** Events that drive transitions between `DisputeState`s. */
export type DisputeEvent =
  | "dispute_opened"
  | "evidence_ready"
  | "evidence_submitted"
  | "provider_won"
  | "provider_lost"
  | "operator_accepted"
  | "warning_closed";

export interface DisputeRecord {
  /** Provider dispute id, e.g. Stripe "dp_...". */
  id: string;
  rail: DisputeRail;
  chargeId: string | null;
  accountId: string | null;
  /** Network reason code, e.g. "10.4". */
  reasonCode: string;
  amountMinor: number;
  currency: string;
  state: DisputeState;
  /** ISO evidence-submission deadline, if known. */
  dueBy: string | null;
  createdAt: string;
  updatedAt: string;
  representmentId: string | null;
}

export interface DisputeTransition {
  from: DisputeState;
  to: DisputeState;
  at: string;
  event: DisputeEvent;
}
