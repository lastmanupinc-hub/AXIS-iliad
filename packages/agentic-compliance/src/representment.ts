import { CE3_MIN_PRIOR_TRANSACTIONS, type Ce3Result } from "./ce3.js";
import type { DisputeRecord } from "./types.js";

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

function ce3QualifyingText(dispute: DisputeRecord, ce3: Ce3Result): string {
  const qualifies = ce3.eligible && ce3.qualifying_priors.length >= CE3_MIN_PRIOR_TRANSACTIONS;
  if (!qualifies) {
    const why = ce3.rejection_reason ? ` (${ce3.rejection_reason})` : "";
    return (
      "Compelling Evidence 3.0: no qualifying prior undisputed transactions were found for " +
      `this cardholder${why}. Representment relies on the other evidence fields only. ` +
      "AXIS does not publish win-rate estimates."
    );
  }
  const priorLines = ce3.qualifying_priors
    .map(
      (p) =>
        `txn ${p.txn_id} (${p.age_days} days before the disputed transaction; ` +
        `matched on ${p.matched_elements.join(", ")})`,
    )
    .join("; ");
  return (
    `Compelling Evidence 3.0 (reason code ${ce3.reason_code}, dispute ${dispute.id}): ` +
    `${ce3.qualifying_priors.length} prior undisputed transaction(s) from this cardholder ` +
    "share qualified CE 3.0 data elements with the disputed transaction and were never " +
    `themselves disputed: ${priorLines}. Matched data elements across priors: ` +
    `${ce3.matched_element_union.join(", ")}. ` +
    "AXIS does not publish win-rate estimates."
  );
}

/**
 * Builds the Stripe `evidence` hash for a dispute representment out of a
 * CE-3.0 packet (from `assembleCe3`) plus any additional merchant-supplied
 * inputs. Deterministic: same `(dispute, ce3, extras)` always yields the
 * same evidence object. Never throws — a non-eligible/empty CE-3.0 packet
 * still yields a usable (if less compelling) evidence hash.
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
