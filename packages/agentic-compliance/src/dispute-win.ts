// packages/agentic-compliance/src/dispute-win.ts
//
// Transparent, deterministic dispute win-probability heuristic (WO-09).
//
// HONESTY NOTE — read before surfacing this anywhere:
// This is a hand-set, documented logistic-regression-shaped heuristic. It
// is NOT empirically calibrated against real Visa/network represented-
// outcome data, and the number it returns is NOT a Visa-published or
// Visa-endorsed win-rate. Treat every WinScore as a transparent, explain-
// able prioritization signal only — always follow your operator's dispute
// policy. `WIN_PROB_MODEL_VERSION` exists precisely so a future retrain on
// real represented-outcome data can be tracked and distinguished from this
// v0 heuristic. Do not describe this as "Visa-grade" or certified.

/** Bump this string (and only this string) when the coefficients below are retrained on real outcome data. */
export const WIN_PROB_MODEL_VERSION = "win-prob-v0";

export type RecommendedAction = "represent" | "accept" | "gather";
export type WinBand = "low" | "moderate" | "high";

/**
 * CE-3.0 + authorization evidence available for a disputed transaction.
 * Every field is optional on input (see `scoreWinProbability`); omitted
 * booleans default to `false` and omitted counts default to `0`.
 */
export interface EvidenceState {
  /** >=2 qualifying priors matched per Visa CE-3.0 rules. Scoped to reason code 10.4 only. */
  ce3Eligible: boolean;
  /** 0..5 CE-3.0 data elements matched (device_id/ip/email/shipping/login). */
  matchingDataElements: number;
  /** Count of prior undisputed transactions from the same cardholder/device. */
  priorUndisputedTransactions: number;
  /** Proof of delivery on file (tracking, signature, geolocation, etc). */
  hasDeliveryProof: boolean;
  /** Address Verification Service match at time of authorization. */
  hasAvsMatch: boolean;
  /** Card verification value match at time of authorization. */
  hasCvvMatch: boolean;
  /** 3-D Secure / SCA authentication completed -> liability shift to issuer. */
  has3dsAuthenticated: boolean;
  /** AP2 signed cart/mandate present for the disputed transaction. */
  hasSignedMandate: boolean;
  /** Documented customer communication / resolution attempt on file. */
  hasCustomerCommunication: boolean;
}

export interface WinScore {
  /** Echoes the input reason code, trimmed. */
  reasonCode: string;
  /** 0..1, rounded to 4 decimal places, fully deterministic. */
  probability: number;
  /** low <0.34, moderate <0.67, else high. */
  band: WinBand;
  /** Not-yet-present factors (weight > 0 for this reason code), ordered by weight desc. */
  topMissingEvidence: string[];
  recommendedAction: RecommendedAction;
  /** Present factors that contributed to the score, ordered by weight desc. */
  rationale: string[];
  /** === WIN_PROB_MODEL_VERSION. */
  modelVersion: string;
}

/** Documented, exported coefficient table keyed by reason-code family. All weights >= 0. */
export interface ReasonCodeModel {
  /** Negative baseline log-odds: the position with zero evidence on file. */
  intercept: number;
  /** >= 0 each; count fields are weighted per-unit up to a documented cap (see below). */
  weights: Record<keyof EvidenceState, number>;
}

/** Stable iteration/tie-break order for evidence fields (matches EvidenceState declaration order). */
const EVIDENCE_FIELD_ORDER: ReadonlyArray<keyof EvidenceState> = [
  "ce3Eligible",
  "matchingDataElements",
  "priorUndisputedTransactions",
  "hasDeliveryProof",
  "hasAvsMatch",
  "hasCvvMatch",
  "has3dsAuthenticated",
  "hasSignedMandate",
  "hasCustomerCommunication",
];

/** Documented per-unit caps for the two count-valued evidence fields. */
const MATCHING_DATA_ELEMENTS_CAP = 5; // CE-3.0 defines exactly 5 qualifying data elements.
const PRIOR_UNDISPUTED_TRANSACTIONS_CAP = 10; // Diminishing returns beyond a 10-transaction clean history.

/**
 * Hand-set, documented logistic coefficients per reason-code family.
 *
 *   z = intercept[family] + sum(weight_i * evidenceFactor_i)
 *   probability = sigmoid(z)
 *
 * All weights are >= 0 so that adding or strengthening evidence never
 * lowers the score (see the MONOTONICITY tests in dispute-win.test.ts).
 *
 * "10.1".."10.4" are literal Visa fraud-family reason codes — 3DS/SCA
 * liability shift (has3dsAuthenticated) is the strongest single defense
 * across all four, and CE-3.0 (ce3Eligible / matchingDataElements) is
 * scoped to 10.4 only, per Visa's Compelling Evidence 3.0 rules.
 * "13.x" and "12.x" are wildcard families: any reason code starting with
 * "13." or "12." resolves to them (consumer disputes and processing
 * errors respectively). "default" is the fallback for anything else,
 * including unrecognized/unknown reason codes.
 */
export const WIN_PROB_COEFFICIENTS: Record<string, ReasonCodeModel> = {
  // Fraud — Card-Absent Environment. The only family CE-3.0 applies to.
  "10.4": {
    intercept: -1.5,
    weights: {
      ce3Eligible: 1.8,
      matchingDataElements: 1.0,
      priorUndisputedTransactions: 0.5,
      hasDeliveryProof: 0.6,
      hasAvsMatch: 0.5,
      hasCvvMatch: 0.5,
      has3dsAuthenticated: 2.3,
      hasSignedMandate: 0.7,
      hasCustomerCommunication: 0.3,
    },
  },
  // Fraud-family variants — CE-3.0 does not apply here (ce3Eligible weight
  // is 0); 3DS/SCA liability shift remains the strongest single defense.
  "10.3": {
    intercept: -1.5,
    weights: {
      ce3Eligible: 0,
      matchingDataElements: 0.6,
      priorUndisputedTransactions: 0.5,
      hasDeliveryProof: 0.5,
      hasAvsMatch: 0.6,
      hasCvvMatch: 0.6,
      has3dsAuthenticated: 2.3,
      hasSignedMandate: 0.6,
      hasCustomerCommunication: 0.3,
    },
  },
  "10.2": {
    intercept: -1.5,
    weights: {
      ce3Eligible: 0,
      matchingDataElements: 0.6,
      priorUndisputedTransactions: 0.5,
      hasDeliveryProof: 0.5,
      hasAvsMatch: 0.6,
      hasCvvMatch: 0.6,
      has3dsAuthenticated: 2.3,
      hasSignedMandate: 0.6,
      hasCustomerCommunication: 0.3,
    },
  },
  "10.1": {
    intercept: -1.5,
    weights: {
      ce3Eligible: 0,
      matchingDataElements: 0.6,
      priorUndisputedTransactions: 0.5,
      hasDeliveryProof: 0.5,
      hasAvsMatch: 0.6,
      hasCvvMatch: 0.6,
      has3dsAuthenticated: 2.3,
      hasSignedMandate: 0.6,
      hasCustomerCommunication: 0.3,
    },
  },
  // Consumer disputes (merchandise/services not received or not as
  // described). Proof of delivery is the definitive defense here, not
  // fraud-authentication signals.
  "13.x": {
    intercept: -1.2,
    weights: {
      ce3Eligible: 0,
      matchingDataElements: 0.3,
      priorUndisputedTransactions: 0.6,
      hasDeliveryProof: 2.6,
      hasAvsMatch: 0.3,
      hasCvvMatch: 0.3,
      has3dsAuthenticated: 0.8,
      hasSignedMandate: 1.0,
      hasCustomerCommunication: 1.2,
    },
  },
  // Processing errors (duplicate processing, incorrect amount). Clean
  // authorization/mandate records are the strongest defense.
  "12.x": {
    intercept: -1.0,
    weights: {
      ce3Eligible: 0,
      matchingDataElements: 0.3,
      priorUndisputedTransactions: 0.7,
      hasDeliveryProof: 0.4,
      hasAvsMatch: 0.5,
      hasCvvMatch: 0.5,
      has3dsAuthenticated: 0.6,
      hasSignedMandate: 1.2,
      hasCustomerCommunication: 0.5,
    },
  },
  // Fallback for reason codes outside the families above.
  default: {
    intercept: -1.3,
    weights: {
      ce3Eligible: 0.3,
      matchingDataElements: 0.4,
      priorUndisputedTransactions: 0.4,
      hasDeliveryProof: 0.8,
      hasAvsMatch: 0.4,
      hasCvvMatch: 0.4,
      has3dsAuthenticated: 0.9,
      hasSignedMandate: 0.6,
      hasCustomerCommunication: 0.5,
    },
  },
};

function resolveFamily(reasonCode: string): string {
  const code = reasonCode.trim();
  if (Object.prototype.hasOwnProperty.call(WIN_PROB_COEFFICIENTS, code)) return code;
  if (/^13(\.|$)/.test(code)) return "13.x";
  if (/^12(\.|$)/.test(code)) return "12.x";
  return "default";
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** Clamps a possibly-missing/negative/NaN count to [0, cap]. */
function clampCount(value: number | undefined, cap: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, cap);
}

/** Fraction (0..1) of a count field's documented cap that is satisfied. */
function countFraction(value: number | undefined, cap: number): number {
  return clampCount(value, cap) / cap;
}

function capFor(field: keyof EvidenceState): number | undefined {
  if (field === "matchingDataElements") return MATCHING_DATA_ELEMENTS_CAP;
  if (field === "priorUndisputedTransactions") return PRIOR_UNDISPUTED_TRANSACTIONS_CAP;
  return undefined;
}

/** Whether an evidence field counts as "fully present" (used for topMissingEvidence). */
function isFieldPresent(field: keyof EvidenceState, evidence: Partial<EvidenceState>): boolean {
  const cap = capFor(field);
  if (cap !== undefined) {
    return clampCount(evidence[field] as number | undefined, cap) >= cap;
  }
  return evidence[field] === true;
}

/** Log-odds contribution (>=0) of a single evidence field under a given model. */
function fieldContribution(
  field: keyof EvidenceState,
  model: ReasonCodeModel,
  evidence: Partial<EvidenceState>,
): number {
  const weight = model.weights[field];
  const cap = capFor(field);
  if (cap !== undefined) {
    return weight * countFraction(evidence[field] as number | undefined, cap);
  }
  return evidence[field] === true ? weight : 0;
}

/**
 * Score a disputed transaction's represent-vs-accept win probability for a
 * given Visa dispute reason code, using the transparent, documented v0
 * logistic heuristic in `WIN_PROB_COEFFICIENTS`. Never throws: an unknown
 * reason code falls back to the `default` family.
 */
export function scoreWinProbability(reasonCode: string, evidence: Partial<EvidenceState>): WinScore {
  const family = resolveFamily(reasonCode);
  const model = WIN_PROB_COEFFICIENTS[family];

  let z = model.intercept;
  for (const field of EVIDENCE_FIELD_ORDER) {
    z += fieldContribution(field, model, evidence);
  }
  const probability = Math.round(sigmoid(z) * 10_000) / 10_000;

  const band: WinBand = probability < 0.34 ? "low" : probability < 0.67 ? "moderate" : "high";

  const byWeightDesc = (a: keyof EvidenceState, b: keyof EvidenceState) => model.weights[b] - model.weights[a];

  const topMissingEvidence = EVIDENCE_FIELD_ORDER.filter(
    (field) => model.weights[field] > 0 && !isFieldPresent(field, evidence),
  )
    .slice()
    .sort(byWeightDesc);

  const rationale = EVIDENCE_FIELD_ORDER.filter((field) => fieldContribution(field, model, evidence) > 0)
    .slice()
    .sort(byWeightDesc);

  const recommendedAction: RecommendedAction =
    probability >= 0.67 ? "represent" : probability < 0.34 && topMissingEvidence.length === 0 ? "accept" : "gather";

  return {
    reasonCode: reasonCode.trim(),
    probability,
    band,
    topMissingEvidence,
    recommendedAction,
    rationale,
    modelVersion: WIN_PROB_MODEL_VERSION,
  };
}
