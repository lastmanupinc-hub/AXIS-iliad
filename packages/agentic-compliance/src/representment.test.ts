import { describe, expect, it } from "vitest";
import { buildStripeRepresentment } from "./representment.js";
import type { Ce3Result } from "./ce3.js";
import type { DisputeRecord } from "./types.js";

function makeDispute(overrides: Partial<DisputeRecord> = {}): DisputeRecord {
  return {
    id: "dp_test123",
    rail: "stripe",
    chargeId: "ch_test123",
    accountId: "acct_test",
    reasonCode: "10.4",
    amountMinor: 4999,
    currency: "usd",
    state: "evidence_assembling",
    dueBy: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    representmentId: null,
    ...overrides,
  };
}

const QUALIFYING_CE3: Ce3Result = {
  eligible: true,
  matchedElements: [
    { transactionId: "txn_1", date: "2026-05-01", description: "Monthly subscription", amountMinor: 4999 },
    { transactionId: "txn_2", date: "2026-06-01", description: "Monthly subscription", amountMinor: 4999 },
  ],
  merchantDescriptor: "AXIS*IL IAD",
};

const NON_QUALIFYING_CE3: Ce3Result = {
  eligible: false,
  matchedElements: [],
};

describe("buildStripeRepresentment", () => {
  it("cites the prior undisputed transactions and merges EvidenceInputs when CE-3.0 qualifies", () => {
    const dispute = makeDispute();
    const evidence = buildStripeRepresentment(dispute, QUALIFYING_CE3, {
      customerEmail: "buyer@example.com",
      shippingAddress: "1 Main St",
      billingAddress: "1 Main St",
      productDescription: "AXIS Pro subscription",
      serviceDate: "2026-07-01",
      deliveryTracking: "1Z999AA1",
    });

    expect(evidence.customer_email_address).toBe("buyer@example.com");
    expect(evidence.shipping_address).toBe("1 Main St");
    expect(evidence.billing_address).toBe("1 Main St");
    expect(evidence.product_description).toBe("AXIS Pro subscription");
    expect(evidence.service_date).toBe("2026-07-01");
    expect(evidence.shipping_tracking_number).toBe("1Z999AA1");

    expect(evidence.uncategorized_text).toBeDefined();
    expect(evidence.uncategorized_text).toContain("txn_1");
    expect(evidence.uncategorized_text).toContain("txn_2");
    expect(evidence.uncategorized_text).toContain("2 prior undisputed transaction");
  });

  it("notes 3-D Secure authentication when supplied", () => {
    const evidence = buildStripeRepresentment(makeDispute(), QUALIFYING_CE3, {
      threeDsAuthenticated: true,
    });
    expect(evidence.uncategorized_text).toContain("3-D Secure authenticated");
  });

  it("does not crash on a non-eligible Ce3Result and records that no priors qualified", () => {
    const dispute = makeDispute();
    const evidence = buildStripeRepresentment(dispute, NON_QUALIFYING_CE3, {});
    expect(evidence.uncategorized_text).toBeDefined();
    expect(evidence.uncategorized_text).toContain("no qualifying prior undisputed transactions");
    expect(evidence.customer_email_address).toBeUndefined();
  });

  it("treats a single matched element (below the 2-element floor) as non-qualifying", () => {
    const oneMatch: Ce3Result = {
      eligible: true,
      matchedElements: [
        { transactionId: "txn_1", date: "2026-05-01", description: "One-off purchase", amountMinor: 999 },
      ],
    };
    const evidence = buildStripeRepresentment(makeDispute(), oneMatch, {});
    expect(evidence.uncategorized_text).toContain("no qualifying prior undisputed transactions");
  });

  it("is deterministic for identical inputs", () => {
    const dispute = makeDispute();
    const extras = { customerEmail: "buyer@example.com" };
    const a = buildStripeRepresentment(dispute, QUALIFYING_CE3, extras);
    const b = buildStripeRepresentment(dispute, QUALIFYING_CE3, extras);
    expect(a).toEqual(b);
  });

  it("never claims a win-rate estimate", () => {
    const evidence = buildStripeRepresentment(makeDispute(), QUALIFYING_CE3, {});
    expect(evidence.uncategorized_text).toContain("does not publish win-rate estimates");
  });
});
