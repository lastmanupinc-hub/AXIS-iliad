import type { Ce3Result } from "./ce3.js";
import type { DisputeRecord } from "./types.js";

/** Minimum matched CE-3.0 elements required before we cite them as representment evidence. */
export const CE3_MIN_MATCHED_ELEMENTS = 2;

export interface EvidenceInputs {
  customerEmail?: string;
  shippingAddress?: string;
  billingAddress?: string;
  serviceDate?: string;
  productDescription?: string;
  deliveryTracking?: string;
  threeDsAuthenticated?: boolean;
}

/** Field names mirror Stripe's `evidence` hash for `POST /v1/disputes/:id`. */
export interface StripeRepresentmentEvidence {
  uncategorized_text?: string;
  customer_email_address?: string;
  shipping_address?: string;
  billing_address?: string;
  product_description?: string;
  service_date?: string;
  shipping_tracking_number?: string;
  customer_purchase_ip?: string;
}

function formatAmount(amountMinor: number, currency: string): string {
  const major = (amountMinor / 100).toFixed(2);
  return `${major} ${currency.toUpperCase()}`;
}

function ce3QualifyingText(dispute: DisputeRecord, ce3: Ce3Result): string {
  const qualifies = ce3.eligible && ce3.matchedElements.length >= CE3_MIN_MATCHED_ELEMENTS;
  if (!qualifies) {
    return (
      "Compelling Evidence 3.0: no qualifying prior undisputed transactions were found for " +
      `this cardholder (requires >= ${CE3_MIN_MATCHED_ELEMENTS} matched elements; found ` +
      `${ce3.matchedElements.length}). Representment relies on the other evidence fields only. ` +
      "AXIS does not publish win-rate estimates."
    );
  }
  const priorLines = ce3.matchedElements
    .map(
      (el) =>
        `${el.date} — ${el.description} (txn ${el.transactionId}, ${formatAmount(el.amountMinor, dispute.currency)})`,
    )
    .join("; ");
  return (
    `Compelling Evidence 3.0: ${ce3.matchedElements.length} prior undisputed transaction(s) ` +
    "from this cardholder match the disputed transaction's merchant descriptor and usage " +
    `pattern and were never themselves disputed: ${priorLines}. ` +
    "AXIS does not publish win-rate estimates."
  );
}

/**
 * Builds the Stripe `evidence` hash for a dispute representment out of a
 * CE-3.0 packet plus any additional merchant-supplied inputs. Deterministic:
 * same `(dispute, ce3, extras)` always yields the same evidence object.
 * Never throws — a non-eligible/empty CE-3.0 packet still yields a usable
 * (if less compelling) evidence hash.
 */
export function buildStripeRepresentment(
  dispute: DisputeRecord,
  ce3: Ce3Result,
  extras: EvidenceInputs = {},
): StripeRepresentmentEvidence {
  const evidence: StripeRepresentmentEvidence = {
    uncategorized_text: ce3QualifyingText(dispute, ce3),
  };
  if (extras.customerEmail) evidence.customer_email_address = extras.customerEmail;
  if (extras.shippingAddress) evidence.shipping_address = extras.shippingAddress;
  if (extras.billingAddress) evidence.billing_address = extras.billingAddress;
  if (extras.productDescription) evidence.product_description = extras.productDescription;
  if (extras.serviceDate) evidence.service_date = extras.serviceDate;
  if (extras.deliveryTracking) evidence.shipping_tracking_number = extras.deliveryTracking;
  if (extras.threeDsAuthenticated) {
    evidence.uncategorized_text += " Current transaction was 3-D Secure authenticated.";
  }
  return evidence;
}
