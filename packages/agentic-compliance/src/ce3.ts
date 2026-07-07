/**
 * Compelling Evidence 3.0 (CE 3.0) evidence assembler.
 *
 * `assembleCe3` is a pure, deterministic function: given the disputed
 * transaction + reason code, and a candidate transaction history, it finds
 * the undisputed prior transactions that qualify under the CE 3.0 rules
 * (see `./ce3-constants.js`) and returns a structured evidence packet plus
 * an eligibility verdict. It never calls a network — assembling a packet is
 * not the same as submitting one to Visa VROL/Verifi (that is a separate,
 * externally-gated concern).
 */

import {
  CE3_LOOKBACK_DAYS,
  CE3_MIN_MATCHING_DATA_ELEMENTS,
  CE3_MIN_PRIOR_TRANSACTION_AGE_DAYS,
  CE3_MIN_PRIOR_TRANSACTIONS,
  CE3_QUALIFIED_DATA_ELEMENTS,
  CE3_TARGET_REASON_CODES,
  type Ce3QualifiedElement,
} from "./ce3-constants.js";

export * from "./ce3-constants.js";

// ─── Types ─────────────────────────────────────────────────────────

export interface Txn {
  id: string;
  amount_minor: number;
  currency: string;
  /** ISO 8601 timestamp. */
  created_at: string;
  disputed: boolean;
  device_id?: string;
  ip_address?: string;
  email?: string;
  shipping_address?: string;
  login_id?: string;
}

export interface DisputeCtx {
  txn: Txn;
  reason_code: string;
  /** ISO 8601 timestamp the dispute/chargeback was filed. */
  disputed_at: string;
}

export interface Ce3Prior {
  txn_id: string;
  matched_elements: string[];
  age_days: number;
}

export interface Ce3Result {
  eligible: boolean;
  reason_code: "10.4";
  /** The >=2 qualifying priors, most-matching first, deterministic order. */
  qualifying_priors: Ce3Prior[];
  matched_element_union: string[];
  /** Set iff !eligible (e.g. "only 1 prior in window", "reason_code not 10.4"). */
  rejection_reason?: string;
  /** The structured, submission-ready packet (assembly only — see `caveat`). */
  evidence_packet: Record<string, unknown>;
  /** Fixed: "assembly only; not a submission to VROL/Verifi". */
  caveat: string;
}

// ─── Constants (module-private) ───────────────────────────────────

const CAVEAT = "assembly only; not a submission to VROL/Verifi" as const;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TARGET_REASON_CODE = CE3_TARGET_REASON_CODES[0];

// ─── Helpers ───────────────────────────────────────────────────────

/** Whole days between an earlier ISO timestamp and a later one (may be negative/NaN for bad input). */
function daysBetween(earlierIso: string, laterIso: string): number {
  const earlier = Date.parse(earlierIso);
  const later = Date.parse(laterIso);
  return Math.floor((later - earlier) / MS_PER_DAY);
}

/** The qualified data elements shared (non-empty, exact match) between two transactions, in canonical order. */
function matchedElements(disputed: Txn, candidate: Txn): Ce3QualifiedElement[] {
  const matched: Ce3QualifiedElement[] = [];
  for (const el of CE3_QUALIFIED_DATA_ELEMENTS) {
    const a = disputed[el];
    const b = candidate[el];
    if (a !== undefined && a !== "" && b !== undefined && b !== "" && a === b) {
      matched.push(el);
    }
  }
  return matched;
}

/** Deterministic union of matched elements across priors, in `CE3_QUALIFIED_DATA_ELEMENTS` canonical order. */
function unionElements(priors: Ce3Prior[]): string[] {
  const present = new Set<string>();
  for (const p of priors) {
    for (const el of p.matched_elements) present.add(el);
  }
  return CE3_QUALIFIED_DATA_ELEMENTS.filter((el) => present.has(el));
}

function rejected(reason: string, disputedTxnId: string): Ce3Result {
  return {
    eligible: false,
    reason_code: "10.4",
    qualifying_priors: [],
    matched_element_union: [],
    rejection_reason: reason,
    evidence_packet: {
      status: "not_assembled",
      disputed_transaction_id: disputedTxnId,
      rejection_reason: reason,
    },
    caveat: CAVEAT,
  };
}

function insufficientPriorsReason(qualifyingCount: number): string {
  const plural = qualifyingCount === 1 ? "" : "s";
  return (
    `only ${qualifyingCount} qualifying prior transaction${plural} found ` +
    `(need >= ${CE3_MIN_PRIOR_TRANSACTIONS}); each must be undisputed, ` +
    `${CE3_MIN_PRIOR_TRANSACTION_AGE_DAYS}-${CE3_LOOKBACK_DAYS} days before the disputed ` +
    `transaction, and share >= ${CE3_MIN_MATCHING_DATA_ELEMENTS} qualified data elements`
  );
}

// ─── Core ──────────────────────────────────────────────────────────

/**
 * Assemble a CE 3.0 evidence packet + eligibility verdict for a disputed
 * transaction, given its candidate prior transaction history.
 *
 * Deterministic: the same `(dispute, txHistory)` always produces a
 * byte-identical `Ce3Result` (stable prior ordering — most-matching first,
 * tie-broken by transaction id).
 */
export function assembleCe3(dispute: DisputeCtx, txHistory: Txn[]): Ce3Result {
  const disputedTxnId = dispute.txn.id;

  // CE 3.0 is scoped to card-absent fraud (10.4) only — 10.2/10.3 are
  // card-present conditions and are out of scope (see ce3-constants.ts).
  if (dispute.reason_code !== TARGET_REASON_CODE) {
    return rejected("CE3.0 applies to 10.4 only", disputedTxnId);
  }

  const candidates: Ce3Prior[] = [];
  for (const candidate of txHistory) {
    if (candidate.id === disputedTxnId) continue; // never match a txn against itself
    if (candidate.disputed) continue; // CE 3.0 priors must be undisputed

    const ageDays = daysBetween(candidate.created_at, dispute.txn.created_at);
    if (!Number.isFinite(ageDays)) continue; // malformed timestamp — skip, don't crash
    if (ageDays < CE3_MIN_PRIOR_TRANSACTION_AGE_DAYS || ageDays > CE3_LOOKBACK_DAYS) continue;

    const matched = matchedElements(dispute.txn, candidate);
    if (matched.length < CE3_MIN_MATCHING_DATA_ELEMENTS) continue;

    candidates.push({ txn_id: candidate.id, matched_elements: matched, age_days: ageDays });
  }

  // Most-matching first; tie-break on txn_id for full determinism regardless
  // of input ordering.
  candidates.sort((a, b) => {
    if (b.matched_elements.length !== a.matched_elements.length) {
      return b.matched_elements.length - a.matched_elements.length;
    }
    return a.txn_id < b.txn_id ? -1 : a.txn_id > b.txn_id ? 1 : 0;
  });

  if (candidates.length < CE3_MIN_PRIOR_TRANSACTIONS) {
    return rejected(insufficientPriorsReason(candidates.length), disputedTxnId);
  }

  const matchedElementUnion = unionElements(candidates);

  const evidencePacket: Record<string, unknown> = {
    compelling_evidence_3: {
      version: "3.0",
      reason_code: TARGET_REASON_CODE,
      disputed_transaction: {
        transaction_id: dispute.txn.id,
        date: dispute.txn.created_at,
        amount_minor: dispute.txn.amount_minor,
        currency: dispute.txn.currency,
      },
      dispute_filed_at: dispute.disputed_at,
      prior_undisputed_transactions: candidates.map((p) => ({
        transaction_id: p.txn_id,
        matched_elements: p.matched_elements,
        age_days: p.age_days,
      })),
      matched_element_union: matchedElementUnion,
      evidence_requirements: {
        min_prior_transactions: CE3_MIN_PRIOR_TRANSACTIONS,
        min_prior_transaction_age_days: CE3_MIN_PRIOR_TRANSACTION_AGE_DAYS,
        lookback_days: CE3_LOOKBACK_DAYS,
        min_matching_data_elements: CE3_MIN_MATCHING_DATA_ELEMENTS,
        qualified_data_elements: CE3_QUALIFIED_DATA_ELEMENTS,
      },
    },
  };

  return {
    eligible: true,
    reason_code: "10.4",
    qualifying_priors: candidates,
    matched_element_union: matchedElementUnion,
    evidence_packet: evidencePacket,
    caveat: CAVEAT,
  };
}
