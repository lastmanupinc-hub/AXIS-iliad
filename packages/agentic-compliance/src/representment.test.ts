import { describe, expect, it } from "vitest";
import { buildStripeRepresentment } from "./representment.js";
import { assembleCe3, type Ce3Result, type DisputeCtx, type Txn } from "./ce3.js";
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

// CE-3.0 fixtures are produced by the REAL assembler (assembleCe3), not by
// hand-built literals — so this suite also pins the representment builder to
// the actual Ce3Result shape the rest of the package emits.

const DISPUTED_TXN: Txn = {
  id: "txn_disputed",
  amount_minor: 4999,
  currency: "usd",
  created_at: "2026-07-01T00:00:00.000Z",
  disputed: true,
  email: "buyer@example.com",
  shipping_address: "1 Main St",
  ip_address: "203.0.113.5",
};

const DISPUTE_CTX: DisputeCtx = {
  txn: DISPUTED_TXN,
  reason_code: "10.4",
  disputed_at: "2026-07-05T00:00:00.000Z",
};

/** Two undisputed priors in the 120–365 day window, sharing >=2 qualified elements each. */
const QUALIFYING_HISTORY: Txn[] = [
  {
    id: "txn_1",
    amount_minor: 4999,
    currency: "usd",
    created_at: "2026-01-02T00:00:00.000Z", // 180 days prior
    disputed: false,
    email: "buyer@example.com",
    shipping_address: "1 Main St",
  },
  {
    id: "txn_2",
    amount_minor: 4999,
    currency: "usd",
    created_at: "2025-12-01T00:00:00.000Z", // 212 days prior
    disputed: false,
    email: "buyer@example.com",
    shipping_address: "1 Main St",
    ip_address: "203.0.113.5",
  },
];

const QUALIFYING_CE3: Ce3Result = assembleCe3(DISPUTE_CTX, QUALIFYING_HISTORY);
const NON_QUALIFYING_CE3: Ce3Result = assembleCe3(DISPUTE_CTX, []);

describe("buildStripeRepresentment", () => {
  it("fixture sanity: assembleCe3 produced one eligible and one ineligible packet", () => {
    expect(QUALIFYING_CE3.eligible).toBe(true);
    expect(QUALIFYING_CE3.qualifying_priors.length).toBe(2);
    expect(NON_QUALIFYING_CE3.eligible).toBe(false);
  });

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
    expect(evidence.uncategorized_text).toContain("email");
    expect(evidence.uncategorized_text).toContain("shipping_address");
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

  it("treats a single qualifying prior (below the 2-prior CE-3.0 floor) as non-qualifying", () => {
    const onePrior = assembleCe3(DISPUTE_CTX, [QUALIFYING_HISTORY[0]!]);
    expect(onePrior.eligible).toBe(false);
    const evidence = buildStripeRepresentment(makeDispute(), onePrior, {});
    expect(evidence.uncategorized_text).toContain("no qualifying prior undisputed transactions");
    expect(evidence.uncategorized_text).toContain("only 1 qualifying prior transaction");
  });

  it("is deterministic for identical inputs", () => {
    const dispute = makeDispute();
    const extras = { customerEmail: "buyer@example.com" };
    const a = buildStripeRepresentment(dispute, QUALIFYING_CE3, extras);
    const b = buildStripeRepresentment(dispute, QUALIFYING_CE3, extras);
    expect(a).toEqual(b);
  });

  it("never claims a win-rate estimate", () => {
    for (const ce3 of [QUALIFYING_CE3, NON_QUALIFYING_CE3]) {
      const evidence = buildStripeRepresentment(makeDispute(), ce3, {});
      expect(evidence.uncategorized_text).toContain("does not publish win-rate estimates");
    }
  });
});
