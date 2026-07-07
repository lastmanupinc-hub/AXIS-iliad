import { describe, it, expect } from "vitest";
import { gradeCompliance, computeComplianceGrade } from "./generators-agentic-purchasing.js";
import type { ComplianceCheck } from "./generators-agentic-purchasing.js";
import type { SourceFile } from "./types.js";

const ALL_CHECK_NAMES = [
  "sca_readiness",
  "ap2_mandate_validity",
  "tokenization_posture",
  "ce3_readiness",
  "dispute_rail_wiring",
  "idempotency_receipt",
  "budget_negotiation",
  "refund_cancel_path",
] as const;

function sf(path: string, content: string): SourceFile {
  return { path, content, size: content.length };
}

function otherChecksFail(checks: ComplianceCheck[], except: string): void {
  for (const c of checks) {
    if (c.name === except) continue;
    expect(c.status, `expected ${c.name} to stay 'fail' (got ${c.status})`).toBe("fail");
  }
}

// A single file that satisfies the PASS rule of all 8 validators at once.
function richFixture(): SourceFile[] {
  return [
    sf(
      "src/commerce/compliance-rich.ts",
      [
        "// 3DS2 / PSD2 authentication wired with a frictionless exemption path.",
        "// mandate_id and mandate_type carry max_amount and valid_until bounds.",
        "// network_token issued via VTS keeps this repo clear of any raw PAN storage.",
        "// prior_transaction history is matched via device_fingerprint and AVS checks.",
        "// chargeback disputes are wired to a webhook rdr rail with evidence_submission.",
        "// Every charge requires an idempotency_key; a receipt is emitted on success.",
        "// Agents may send X-Agent-Budget alongside X-Agent-Mode: lite to negotiate price.",
        "// Both refund and cancel paths are implemented for every mandate.",
      ].join("\n"),
    ),
  ];
}

// One fixture per validator, each hitting exactly one of that validator's
// required co-signals (never both) and carefully worded so it does not
// incidentally trip any of the other 7 validators.
function singleSignalFixtures(): Record<string, SourceFile[]> {
  return {
    sca: [sf("src/sca.ts", "// This module implements 3DS2 authentication for the payment flow.")],
    ap2: [sf("src/mandate.ts", "// This service manages a payment mandate for the customer.")],
    tokenization: [
      sf("src/wallet.ts", "// This service stores a payment token for the vaulted customer profile."),
    ],
    ce3: [sf("src/history.ts", "// prior_transaction records are retained for four hundred days.")],
    dispute: [
      sf(
        "src/dispute.ts",
        "// chargeback detection is wired to a webhook, but evidence is not yet automated.",
      ),
    ],
    idempotency: [sf("src/checkout-receipt.ts", "// Every charge emits a receipt to the customer.")],
    budget: [
      sf("src/budget.ts", "// Agents may set the X-Agent-Budget header to request a reduced-price run."),
    ],
    refund: [sf("src/returns.ts", "// Customers can request a refund within thirty days.")],
  };
}

describe("gradeCompliance", () => {
  it("returns grade D / score 0 / all-fail for undefined files", () => {
    const result = gradeCompliance(undefined);
    expect(result.grade).toBe("D");
    expect(result.score).toBe(0);
    expect(result.checks_total).toBe(8);
    expect(result.checks_passed).toBe(0);
    expect(result.checks).toHaveLength(8);
    for (const c of result.checks) {
      expect(c.status).toBe("fail");
      expect(c.evidence).toHaveLength(0);
      expect(c.remediation.length).toBeGreaterThan(0);
    }
  });

  it("returns grade D / score 0 / all-fail for an empty file array", () => {
    const result = gradeCompliance([]);
    expect(result.grade).toBe("D");
    expect(result.score).toBe(0);
    expect(result.checks_passed).toBe(0);
    expect(result.checks).toHaveLength(8);
    for (const c of result.checks) {
      expect(c.status).toBe("fail");
      expect(c.evidence).toHaveLength(0);
      expect(c.remediation.length).toBeGreaterThan(0);
    }
  });

  it("has exactly the 8 documented check names, no duplicates, in a stable order", () => {
    const result1 = gradeCompliance(undefined);
    const result2 = gradeCompliance(undefined);
    const names1 = result1.checks.map((c) => c.name);
    const names2 = result2.checks.map((c) => c.name);
    expect(names1).toHaveLength(8);
    expect(new Set(names1).size).toBe(8);
    expect(new Set(names1)).toEqual(new Set(ALL_CHECK_NAMES));
    expect(names1).toEqual(names2);
  });

  it("check weights sum to 100, and result.score equals the sum of check scores", () => {
    const fixtures: (SourceFile[] | undefined)[] = [
      undefined,
      [],
      richFixture(),
      singleSignalFixtures().sca,
      singleSignalFixtures().dispute,
    ];
    for (const files of fixtures) {
      const result = gradeCompliance(files);
      const weightSum = result.checks.reduce((s, c) => s + c.weight, 0);
      expect(weightSum).toBe(100);
      const scoreSum = result.checks.reduce((s, c) => s + c.score, 0);
      expect(result.score).toBe(scoreSum);
    }
  });

  it("a rich fixture satisfying all 8 pass rules yields grade A, score >= 85, all checks passing", () => {
    const result = gradeCompliance(richFixture());
    expect(result.grade).toBe("A");
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.checks_passed).toBe(8);
    for (const c of result.checks) {
      expect(c.status).toBe("pass");
      expect(c.score).toBe(c.weight);
      expect(c.evidence.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("a raw-PAN storage antipattern forces tokenization_posture to fail even with a network_token keyword present", () => {
    const files = [
      sf(
        "src/legacy-vault.ts",
        'const record = { card_number: "4111111111111111", network_token: "tok_abc123" };',
      ),
    ];
    const result = gradeCompliance(files);
    const tok = result.checks.find((c) => c.name === "tokenization_posture")!;
    expect(tok.status).toBe("fail");
    expect(tok.evidence).toHaveLength(0);
    expect(tok.score).toBe(0);
  });

  describe("per-validator single-signal warn fixtures (proves warn is a real tier, not a single-keyword pass)", () => {
    const single = singleSignalFixtures();

    it("sca_readiness warns on a 3DS2 reference alone", () => {
      const result = gradeCompliance(single.sca);
      const check = result.checks.find((c) => c.name === "sca_readiness")!;
      expect(check.status).toBe("warn");
      expect(check.score).toBe(Math.round(check.weight / 2));
      expect(check.remediation.length).toBeGreaterThan(0);
      otherChecksFail(result.checks, "sca_readiness");
    });

    it("ap2_mandate_validity warns on a bare mandate keyword with no spend/time bound", () => {
      const result = gradeCompliance(single.ap2);
      const check = result.checks.find((c) => c.name === "ap2_mandate_validity")!;
      expect(check.status).toBe("warn");
      expect(check.score).toBe(Math.round(check.weight / 2));
      expect(check.remediation.length).toBeGreaterThan(0);
      otherChecksFail(result.checks, "ap2_mandate_validity");
    });

    it("tokenization_posture warns on a generic provider-vaulted token keyword", () => {
      const result = gradeCompliance(single.tokenization);
      const check = result.checks.find((c) => c.name === "tokenization_posture")!;
      expect(check.status).toBe("warn");
      expect(check.score).toBe(Math.round(check.weight / 2));
      expect(check.remediation.length).toBeGreaterThan(0);
      otherChecksFail(result.checks, "tokenization_posture");
    });

    it("ce3_readiness warns on a single evidence dimension", () => {
      const result = gradeCompliance(single.ce3);
      const check = result.checks.find((c) => c.name === "ce3_readiness")!;
      expect(check.status).toBe("warn");
      expect(check.score).toBe(Math.round(check.weight / 2));
      expect(check.remediation.length).toBeGreaterThan(0);
      otherChecksFail(result.checks, "ce3_readiness");
    });

    it("dispute_rail_wiring warns on dispute detection plus only one of {rail, evidence submission}", () => {
      const result = gradeCompliance(single.dispute);
      const check = result.checks.find((c) => c.name === "dispute_rail_wiring")!;
      expect(check.status).toBe("warn");
      expect(check.score).toBe(Math.round(check.weight / 2));
      expect(check.remediation.length).toBeGreaterThan(0);
      otherChecksFail(result.checks, "dispute_rail_wiring");
    });

    it("idempotency_receipt warns on a receipt/txn_id emission alone", () => {
      const result = gradeCompliance(single.idempotency);
      const check = result.checks.find((c) => c.name === "idempotency_receipt")!;
      expect(check.status).toBe("warn");
      expect(check.score).toBe(Math.round(check.weight / 2));
      expect(check.remediation.length).toBeGreaterThan(0);
      otherChecksFail(result.checks, "idempotency_receipt");
    });

    it("budget_negotiation warns on a budget field alone", () => {
      const result = gradeCompliance(single.budget);
      const check = result.checks.find((c) => c.name === "budget_negotiation")!;
      expect(check.status).toBe("warn");
      expect(check.score).toBe(Math.round(check.weight / 2));
      expect(check.remediation.length).toBeGreaterThan(0);
      otherChecksFail(result.checks, "budget_negotiation");
    });

    it("refund_cancel_path warns on a refund keyword alone", () => {
      const result = gradeCompliance(single.refund);
      const check = result.checks.find((c) => c.name === "refund_cancel_path")!;
      expect(check.status).toBe("warn");
      expect(check.score).toBe(Math.round(check.weight / 2));
      expect(check.remediation.length).toBeGreaterThan(0);
      otherChecksFail(result.checks, "refund_cancel_path");
    });
  });

  it("computeComplianceGrade is a back-compat alias of gradeCompliance (deep-equal across fixtures)", () => {
    const fixtures: (SourceFile[] | undefined)[] = [
      undefined,
      [],
      richFixture(),
      singleSignalFixtures().sca,
    ];
    for (const files of fixtures) {
      const a = computeComplianceGrade(files);
      const b = gradeCompliance(files);
      expect(a).toEqual(b);
      expect(a).toHaveProperty("grade");
      expect(a).toHaveProperty("checks_passed");
      expect(a.checks_total).toBe(8);
    }
  });

  it("methodology is a non-empty honesty caveat containing 'not a certification' and no over-claim words", () => {
    const result = gradeCompliance(undefined);
    expect(result.methodology.length).toBeGreaterThan(0);
    expect(result.methodology.toLowerCase()).toContain("not a certification");
    expect(result.methodology.toLowerCase()).not.toContain("certified");
    expect(result.methodology.toLowerCase()).not.toContain("audited");
  });

  it("is deterministic across repeated calls on the same fixture", () => {
    const fixtures: (SourceFile[] | undefined)[] = [
      richFixture(),
      [],
      undefined,
      singleSignalFixtures().dispute,
    ];
    for (const files of fixtures) {
      const a = gradeCompliance(files);
      const b = gradeCompliance(files);
      expect(a).toEqual(b);
    }
  });
});
