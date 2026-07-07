/**
 * Minimal structural CE-3.0 (Compelling Evidence 3.0) types.
 *
 * WO-08 depends on WO-C2 (`assembleCe3` / `Ce3Result`), which was unbuilt at
 * the time this module was written. This file defines the minimal shape
 * `representment.ts` needs to consume a CE-3.0 packet. When WO-C2 ships its
 * own `Ce3Result`, swap the import in representment.ts to point there (and
 * delete this file) rather than maintaining two definitions.
 *
 * AXIS makes no guarantee about issuer outcomes from a CE-3.0 match — this
 * type only carries evidence data, never a win-probability estimate.
 */

/** A single prior, undisputed transaction matched against the current dispute. */
export interface Ce3MatchedElement {
  transactionId: string;
  /** ISO date of the prior transaction. */
  date: string;
  description: string;
  amountMinor: number;
}

export interface Ce3Result {
  /** True when the merchant has enough matched priors to attempt a CE-3.0 argument. */
  eligible: boolean;
  matchedElements: Ce3MatchedElement[];
  /** Merchant descriptor shared across the matched transactions, if consistent. */
  merchantDescriptor?: string;
  notes?: string;
}
