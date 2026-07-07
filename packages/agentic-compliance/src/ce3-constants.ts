/**
 * Visa Compelling Evidence 3.0 (CE 3.0) — eligibility constants.
 *
 * CE 3.0 lets a merchant defend a card-absent-fraud dispute (reason code
 * **10.4 only** — 10.2/10.3 are card-present conditions and are out of
 * scope) by proving a prior undisputed relationship with the cardholder:
 * at least `MIN_PRIOR_TRANSACTIONS` undisputed prior transactions, each
 * between `MIN_PRIOR_TRANSACTION_AGE_DAYS` and `LOOKBACK_DAYS` days before
 * the disputed transaction, each sharing at least
 * `MIN_MATCHING_DATA_ELEMENTS` of the `QUALIFIED_DATA_ELEMENTS`.
 *
 * This module is the **single source of truth** for those numbers. They
 * were previously duplicated as inline literals in
 * `packages/generator-core/src/generators-agentic-purchasing.ts`
 * (`generateProductSchema` and `generateCommerceRegistry`) — that file now
 * imports them from here instead of hardcoding them a second time.
 */

/** Minimum number of qualifying prior undisputed transactions required for CE 3.0 eligibility. */
export const CE3_MIN_PRIOR_TRANSACTIONS = 2;

/** A prior transaction must be at least this many days before the disputed transaction. */
export const CE3_MIN_PRIOR_TRANSACTION_AGE_DAYS = 120;

/** A prior transaction must be no more than this many days before the disputed transaction. */
export const CE3_LOOKBACK_DAYS = 365;

/** A prior transaction must match the disputed transaction on at least this many qualified data elements. */
export const CE3_MIN_MATCHING_DATA_ELEMENTS = 2;

/** The CE 3.0 qualified data elements — shared identity signals a prior transaction can match on. */
export const CE3_QUALIFIED_DATA_ELEMENTS = [
  "device_id",
  "ip_address",
  "email",
  "shipping_address",
  "login_id",
] as const;

/** CE 3.0 applies to card-absent fraud (10.4) only — never 10.2/10.3 (card-present). */
export const CE3_TARGET_REASON_CODES = ["10.4"] as const;

/** A qualified data element name (one of `CE3_QUALIFIED_DATA_ELEMENTS`). */
export type Ce3QualifiedElement = (typeof CE3_QUALIFIED_DATA_ELEMENTS)[number];

/**
 * All CE 3.0 constants bundled as a single object — convenient for
 * generators/tests that want to embed or diff the whole rule set at once.
 */
export const CE3_CONSTANTS = {
  min_prior_transactions: CE3_MIN_PRIOR_TRANSACTIONS,
  min_prior_transaction_age_days: CE3_MIN_PRIOR_TRANSACTION_AGE_DAYS,
  lookback_days: CE3_LOOKBACK_DAYS,
  min_matching_data_elements: CE3_MIN_MATCHING_DATA_ELEMENTS,
  qualified_data_elements: CE3_QUALIFIED_DATA_ELEMENTS,
  target_reason_codes: CE3_TARGET_REASON_CODES,
} as const;
