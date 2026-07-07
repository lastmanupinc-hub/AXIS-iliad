/**
 * WO-06 — SCA Exemption Decision Engine.
 * Unit tests for decideScaExemption / traCapEur / SCA_EXEMPTION_ORDER /
 * renderScaExemptionMatrix, all defined in generators-agentic-purchasing.ts
 * (mirrors computeComplianceGrade's placement — see that file for the engine).
 */
import { describe, it, expect } from "vitest";
import {
  decideScaExemption,
  traCapEur,
  renderScaExemptionMatrix,
  SCA_EXEMPTION_ORDER,
  type ScaExemptionName,
} from "./generators-agentic-purchasing.js";
// Re-import from the package barrel (index.ts) to prove the engine is reachable
// the same way a consumer of "@axis/generator-core" would reach it (acceptance
// criterion: `import { decideScaExemption, SCA_EXEMPTION_ORDER } from
// '@axis/generator-core'` type-checks and runs).
import { decideScaExemption as decideScaExemptionFromBarrel, SCA_EXEMPTION_ORDER as SCA_EXEMPTION_ORDER_FROM_BARREL } from "./index.js";

describe("package-root export (mirrors index.ts:65-66)", () => {
  it("decideScaExemption and SCA_EXEMPTION_ORDER are importable from the barrel and behave identically", () => {
    expect(SCA_EXEMPTION_ORDER_FROM_BARREL).toEqual(SCA_EXEMPTION_ORDER);
    expect(decideScaExemptionFromBarrel({ amount_eur: 12 })).toEqual(decideScaExemption({ amount_eur: 12 }));
  });
});

describe("traCapEur — EBA RTS Art. 15 fraud-rate bands", () => {
  it("maps fraud bps to the correct TRA cap", () => {
    expect(traCapEur(1)).toBe(500);
    expect(traCapEur(6)).toBe(250);
    expect(traCapEur(13)).toBe(100);
    expect(traCapEur(20)).toBe(0);
    expect(traCapEur(undefined)).toBe(0);
  });

  it("is a band boundary, not a linear function", () => {
    expect(traCapEur(0)).toBe(500);
    expect(traCapEur(1.5)).toBe(250);
    expect(traCapEur(6.5)).toBe(100);
    expect(traCapEur(13.5)).toBe(0);
  });
});

describe("SCA_EXEMPTION_ORDER", () => {
  it("has exactly 7 rules with priorities 1..7 ascending", () => {
    expect(SCA_EXEMPTION_ORDER.length).toBe(7);
    expect(SCA_EXEMPTION_ORDER.map(r => r.priority)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("is in the canonical WO-06 order", () => {
    const names: ScaExemptionName[] = SCA_EXEMPTION_ORDER.map(r => r.name);
    expect(names).toEqual([
      "low_value",
      "secure_corporate",
      "merchant_initiated",
      "recurring_fixed",
      "trusted_beneficiary",
      "transaction_risk_analysis",
      "one_leg_out",
    ]);
  });

  it("every rule has a non-empty label and condition", () => {
    for (const rule of SCA_EXEMPTION_ORDER) {
      expect(rule.label.length).toBeGreaterThan(0);
      expect(rule.condition.length).toBeGreaterThan(0);
    }
  });
});

describe("decideScaExemption", () => {
  it("low value auto-applies", () => {
    const decision = decideScaExemption({ amount_eur: 12 });
    expect(decision).toMatchObject({ exemption: "low_value", priority: 1, sca_required: false });
  });

  it("TRA applies within the fraud-band cap", () => {
    const decision = decideScaExemption({ amount_eur: 200, tra_acquirer_fraud_bps: 5 });
    expect(decision.exemption).toBe("transaction_risk_analysis");
    expect(decision.tra_cap_eur).toBe(250);
    expect(decision.sca_required).toBe(false);
  });

  it("falls back to a 3DS2 challenge when the amount exceeds the TRA band and nothing else applies", () => {
    const decision = decideScaExemption({ amount_eur: 400, tra_acquirer_fraud_bps: 5 });
    expect(decision.exemption).toBe("3ds2_challenge");
    expect(decision.sca_required).toBe(true);
    expect(decision.priority).toBe(8);
    expect(decision.fallback).toBe("3ds2_challenge");
  });

  it("enforces priority ordering: low_value (rank 1) beats secure_corporate (rank 2)", () => {
    const decision = decideScaExemption({ amount_eur: 12, is_secure_corporate: true });
    expect(decision.exemption).toBe("low_value");
    expect(decision.candidates).toEqual(["low_value", "secure_corporate"]);
  });

  it("recurring_fixed requires has_prior_sca", () => {
    const withoutPriorSca = decideScaExemption({ amount_eur: 100, is_recurring_fixed: true, has_prior_sca: false });
    expect(withoutPriorSca.exemption).toBe("3ds2_challenge");
    expect(withoutPriorSca.sca_required).toBe(true);

    const withPriorSca = decideScaExemption({ amount_eur: 100, is_recurring_fixed: true, has_prior_sca: true });
    expect(withPriorSca.exemption).toBe("recurring_fixed");
    expect(withPriorSca.sca_required).toBe(false);
  });

  it("trusted_beneficiary requires has_prior_sca", () => {
    const withoutPriorSca = decideScaExemption({ amount_eur: 100, is_trusted_beneficiary: true, has_prior_sca: false });
    expect(withoutPriorSca.exemption).toBe("3ds2_challenge");
    expect(withoutPriorSca.sca_required).toBe(true);

    const withPriorSca = decideScaExemption({ amount_eur: 100, is_trusted_beneficiary: true, has_prior_sca: true });
    expect(withPriorSca.exemption).toBe("trusted_beneficiary");
    expect(withPriorSca.sca_required).toBe(false);
  });

  it("one_leg_out applies with a rationale mentioning the EEA", () => {
    const decision = decideScaExemption({ amount_eur: 100, is_one_leg_out: true });
    expect(decision.exemption).toBe("one_leg_out");
    expect(decision.priority).toBe(7);
    expect(decision.sca_required).toBe(false);
    expect(decision.rationale).toContain("EEA");
  });

  it("merchant_initiated applies on its own flag", () => {
    const decision = decideScaExemption({ amount_eur: 1000, is_merchant_initiated: true });
    expect(decision.exemption).toBe("merchant_initiated");
    expect(decision.sca_required).toBe(false);
  });

  it("every decision has a non-empty rationale", () => {
    const cases: Array<Parameters<typeof decideScaExemption>[0]> = [
      { amount_eur: 12 },
      { amount_eur: 5000 },
      { amount_eur: 100, is_secure_corporate: true },
      { amount_eur: 100, is_merchant_initiated: true },
      { amount_eur: 100, is_recurring_fixed: true, has_prior_sca: true },
      { amount_eur: 100, is_trusted_beneficiary: true, has_prior_sca: true },
      { amount_eur: 200, tra_acquirer_fraud_bps: 5 },
      { amount_eur: 100, is_one_leg_out: true },
    ];
    for (const ctx of cases) {
      const decision = decideScaExemption(ctx);
      expect(decision.rationale.length).toBeGreaterThan(0);
    }
  });

  it("candidates array is sorted ascending by priority when multiple rules match", () => {
    // Corporate card + trusted beneficiary + recurring (all with prior SCA) + low value amount:
    // every non-TRA, non-one-leg-out rule can apply simultaneously.
    const decision = decideScaExemption({
      amount_eur: 10,
      is_secure_corporate: true,
      is_merchant_initiated: true,
      is_recurring_fixed: true,
      is_trusted_beneficiary: true,
      has_prior_sca: true,
    });
    expect(decision.candidates).toEqual([
      "low_value",
      "secure_corporate",
      "merchant_initiated",
      "recurring_fixed",
      "trusted_beneficiary",
    ]);
    const priorities = decision.candidates.map(
      name => SCA_EXEMPTION_ORDER.find(r => r.name === name)!.priority,
    );
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });

  it("no candidates and no TRA context yields a 3ds2_challenge with no tra_cap_eur", () => {
    const decision = decideScaExemption({ amount_eur: 5000 });
    expect(decision.exemption).toBe("3ds2_challenge");
    expect(decision.sca_required).toBe(true);
    expect(decision.candidates).toEqual([]);
    expect(decision.tra_cap_eur).toBeUndefined();
  });
});

describe("renderScaExemptionMatrix", () => {
  it("is a markdown table containing all 7 exemption names in priority order", () => {
    const table = renderScaExemptionMatrix();
    const lines = table.split("\n");
    expect(lines[0]).toContain("Priority");
    expect(lines[0]).toContain("Exemption");
    for (const rule of SCA_EXEMPTION_ORDER) {
      expect(table).toContain(rule.name);
    }
    // Order check: each name must appear strictly after the previous one.
    let lastIndex = -1;
    for (const rule of SCA_EXEMPTION_ORDER) {
      const idx = table.indexOf(rule.name);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it("is deterministic (same output on repeated calls)", () => {
    expect(renderScaExemptionMatrix()).toBe(renderScaExemptionMatrix());
  });
});
