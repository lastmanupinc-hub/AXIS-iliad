import { describe, it, expect } from "vitest";
import { assembleCe3, type Txn, type DisputeCtx } from "./ce3.js";
import { CE3_CONSTANTS } from "./ce3-constants.js";

const DISPUTE_DATE = "2026-06-01T00:00:00.000Z";

function disputedTxn(overrides: Partial<Txn> = {}): Txn {
  return {
    id: "txn_disputed",
    amount_minor: 5000,
    currency: "usd",
    created_at: DISPUTE_DATE,
    disputed: true,
    device_id: "dev_abc",
    ip_address: "1.2.3.4",
    email: "buyer@example.com",
    shipping_address: "1 Main St",
    login_id: "user_1",
    ...overrides,
  };
}

/** A prior transaction `daysBefore` the disputed transaction's created_at. */
function priorTxn(id: string, daysBefore: number, overrides: Partial<Txn> = {}): Txn {
  const createdAt = new Date(Date.parse(DISPUTE_DATE) - daysBefore * 24 * 60 * 60 * 1000).toISOString();
  return {
    id,
    amount_minor: 2500,
    currency: "usd",
    created_at: createdAt,
    disputed: false,
    device_id: "dev_abc",
    ip_address: "1.2.3.4",
    ...overrides,
  };
}

function ctx(reason_code = "10.4"): DisputeCtx {
  return { txn: disputedTxn(), reason_code, disputed_at: "2026-06-05T00:00:00.000Z" };
}

describe("assembleCe3", () => {
  it("is eligible with >=2 qualifying priors (>=2 shared elements, 120-365d window, undisputed) and returns exactly those priors", () => {
    const history: Txn[] = [
      priorTxn("txn_p1", 150, { device_id: "dev_abc", ip_address: "1.2.3.4" }), // 2 matches
      priorTxn("txn_p2", 200, { device_id: "dev_abc", ip_address: "1.2.3.4", email: "buyer@example.com" }), // 3 matches
      // a third, non-matching prior in-window should NOT appear (only 1 shared element)
      priorTxn("txn_p3", 180, { device_id: "dev_other", ip_address: "9.9.9.9", email: "buyer@example.com" }),
    ];

    const result = assembleCe3(ctx(), history);

    expect(result.eligible).toBe(true);
    expect(result.rejection_reason).toBeUndefined();
    expect(result.reason_code).toBe("10.4");
    expect(result.qualifying_priors).toHaveLength(2);
    // most-matching first
    expect(result.qualifying_priors[0]!.txn_id).toBe("txn_p2");
    expect(result.qualifying_priors[0]!.matched_elements).toEqual(["device_id", "ip_address", "email"]);
    expect(result.qualifying_priors[1]!.txn_id).toBe("txn_p1");
    expect(result.qualifying_priors[1]!.matched_elements).toEqual(["device_id", "ip_address"]);
    expect(result.matched_element_union).toEqual(["device_id", "ip_address", "email"]);
    expect(result.caveat).toBe("assembly only; not a submission to VROL/Verifi");
    expect(result.evidence_packet).toBeDefined();
    const packet = result.evidence_packet.compelling_evidence_3 as Record<string, unknown>;
    expect(packet.reason_code).toBe("10.4");
    expect(Array.isArray(packet.prior_undisputed_transactions)).toBe(true);
    expect((packet.prior_undisputed_transactions as unknown[]).length).toBe(2);
  });

  it("returns ALL qualifying priors when more than 2 qualify (top-2+, not capped at 2)", () => {
    const history: Txn[] = [
      priorTxn("txn_p1", 150, { device_id: "dev_abc", ip_address: "1.2.3.4" }),
      priorTxn("txn_p2", 200, { device_id: "dev_abc", ip_address: "1.2.3.4" }),
      priorTxn("txn_p3", 250, { device_id: "dev_abc", ip_address: "1.2.3.4" }),
    ];

    const result = assembleCe3(ctx(), history);

    expect(result.eligible).toBe(true);
    expect(result.qualifying_priors).toHaveLength(3);
  });

  it("rejects with a specific reason when only 1 prior qualifies", () => {
    const history: Txn[] = [priorTxn("txn_p1", 150, { device_id: "dev_abc", ip_address: "1.2.3.4" })];

    const result = assembleCe3(ctx(), history);

    expect(result.eligible).toBe(false);
    expect(result.qualifying_priors).toEqual([]);
    expect(result.matched_element_union).toEqual([]);
    expect(result.rejection_reason).toContain("only 1 qualifying prior transaction found");
    expect(result.rejection_reason).toContain("need >= 2");
  });

  it("rejects when priors are too recent (<120 days)", () => {
    const history: Txn[] = [
      priorTxn("txn_p1", 30, { device_id: "dev_abc", ip_address: "1.2.3.4" }),
      priorTxn("txn_p2", 60, { device_id: "dev_abc", ip_address: "1.2.3.4" }),
    ];

    const result = assembleCe3(ctx(), history);

    expect(result.eligible).toBe(false);
    expect(result.rejection_reason).toContain("only 0 qualifying prior transactions found");
  });

  it("rejects when priors are too old (>365 days)", () => {
    const history: Txn[] = [
      priorTxn("txn_p1", 400, { device_id: "dev_abc", ip_address: "1.2.3.4" }),
      priorTxn("txn_p2", 500, { device_id: "dev_abc", ip_address: "1.2.3.4" }),
    ];

    const result = assembleCe3(ctx(), history);

    expect(result.eligible).toBe(false);
    expect(result.rejection_reason).toContain("only 0 qualifying prior transactions found");
  });

  it("rejects when priors share fewer than 2 qualified elements", () => {
    const history: Txn[] = [
      priorTxn("txn_p1", 150, { device_id: "dev_abc", ip_address: "9.9.9.9" }), // 1 match only
      priorTxn("txn_p2", 200, { device_id: "dev_other", ip_address: "9.9.9.9" }), // 0 matches
    ];

    const result = assembleCe3(ctx(), history);

    expect(result.eligible).toBe(false);
    expect(result.rejection_reason).toContain("only 0 qualifying prior transactions found");
  });

  it("excludes disputed prior transactions even if they otherwise qualify", () => {
    const history: Txn[] = [
      priorTxn("txn_p1", 150, { device_id: "dev_abc", ip_address: "1.2.3.4", disputed: true }),
      priorTxn("txn_p2", 200, { device_id: "dev_abc", ip_address: "1.2.3.4" }),
    ];

    const result = assembleCe3(ctx(), history);

    expect(result.eligible).toBe(false);
    expect(result.qualifying_priors.every((p) => p.txn_id !== "txn_p1")).toBe(true);
  });

  it("never matches the disputed transaction against itself even if present in history", () => {
    const history: Txn[] = [
      disputedTxn(), // same id as dispute.txn — must be excluded from priors
      priorTxn("txn_p1", 150, { device_id: "dev_abc", ip_address: "1.2.3.4" }),
      priorTxn("txn_p2", 200, { device_id: "dev_abc", ip_address: "1.2.3.4" }),
    ];

    const result = assembleCe3(ctx(), history);

    expect(result.eligible).toBe(true);
    expect(result.qualifying_priors.every((p) => p.txn_id !== "txn_disputed")).toBe(true);
  });

  it("rejects non-10.4 reason codes with the exact required rejection message, no false-positive", () => {
    const history: Txn[] = [
      priorTxn("txn_p1", 150, { device_id: "dev_abc", ip_address: "1.2.3.4" }),
      priorTxn("txn_p2", 200, { device_id: "dev_abc", ip_address: "1.2.3.4" }),
    ];

    for (const reasonCode of ["10.2", "10.3", "13.1", "4837"]) {
      const result = assembleCe3(ctx(reasonCode), history);
      expect(result.eligible).toBe(false);
      expect(result.rejection_reason).toBe("CE3.0 applies to 10.4 only");
      expect(result.qualifying_priors).toEqual([]);
    }
  });

  it("is deterministic: same inputs produce a byte-identical Ce3Result", () => {
    const history: Txn[] = [
      priorTxn("txn_c", 150, { device_id: "dev_abc", ip_address: "1.2.3.4" }),
      priorTxn("txn_a", 150, { device_id: "dev_abc", ip_address: "1.2.3.4" }),
      priorTxn("txn_b", 200, { device_id: "dev_abc", ip_address: "1.2.3.4", email: "buyer@example.com" }),
    ];

    const r1 = assembleCe3(ctx(), history);
    const r2 = assembleCe3(ctx(), [...history]); // fresh array, same contents, same order
    const r3 = assembleCe3(ctx(), [...history].reverse()); // different input order

    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r3));
    // tie-break on txn_id for the two equal-match priors (txn_a vs txn_c)
    expect(r1.qualifying_priors.map((p) => p.txn_id)).toEqual(["txn_b", "txn_a", "txn_c"]);
  });

  it("drift guard: the constants re-exported from this package match the values previously hardcoded in generators-agentic-purchasing.ts", () => {
    // These literals mirror what was hardcoded at generateProductSchema:756-770,
    // 990-1005 and generateCommerceRegistry:1234,1481-1489 before this WO. The
    // generator now imports CE3_CONSTANTS from @axis/agentic-compliance instead
    // of re-declaring them, so this is the single place either value can drift
    // from the other.
    expect(CE3_CONSTANTS).toEqual({
      min_prior_transactions: 2,
      min_prior_transaction_age_days: 120,
      lookback_days: 365,
      min_matching_data_elements: 2,
      qualified_data_elements: ["device_id", "ip_address", "email", "shipping_address", "login_id"],
      target_reason_codes: ["10.4"],
    });
  });
});
