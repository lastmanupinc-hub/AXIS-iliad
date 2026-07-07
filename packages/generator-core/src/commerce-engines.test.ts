import { describe, it, expect } from "vitest";
import { proofDigest } from "./commerce-engines.js";
import {
  generateCommerceRegistry,
  computeComplianceGrade,
  gradeCompliance,
  decideScaExemption,
  detectCommerceSignals,
} from "./generators-agentic-purchasing.js";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";

// ─── Fixtures ──────────────────────────────────────────────────────

const ctx = {
  project_identity: { name: "proof-repo", type: "api_service", primary_language: "typescript" },
  detection: { frameworks: [] },
  generated_at: "2026-07-07T00:00:00.000Z",
} as unknown as ContextMap;

const profile = {} as RepoProfile;

const PAYMENT_FILES: SourceFile[] = [
  {
    path: "src/checkout.ts",
    content: [
      "import stripe from 'stripe';",
      "// 3ds2 exemption flow with frictionless fallback and TRA",
      "const mandate_id = 'm1'; const max_amount = 5000; const expires = '2027-01-01';",
      "// network_token via VTS; dispute webhook wired to RDR with submit_evidence path",
      "const idempotency_key = 'k'; const receipt = true;",
      "// X-Agent-Budget honored; X-Agent-Mode: lite supported",
      "function refund() {} function cancelOrder() {}",
      "checkout(); recurring_billing(); chargeback(); psd2();",
    ].join("\n"),
  },
];

// ─── proofDigest ───────────────────────────────────────────────────

describe("proofDigest", () => {
  it("returns sha256 over canonical JSON with the over[] labels echoed", () => {
    const p = proofDigest(["a", "b"], { x: 1, y: [2, 3] });
    expect(p.algo).toBe("sha256");
    expect(p.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(p.over).toEqual(["a", "b"]);
  });

  it("is key-order independent (canonical): {a,b} === {b,a}", () => {
    const p1 = proofDigest(["payload"], { a: 1, b: { c: 2, d: 3 } });
    const p2 = proofDigest(["payload"], { b: { d: 3, c: 2 }, a: 1 });
    expect(p1.digest).toBe(p2.digest);
  });

  it("is deterministic across calls and sensitive to payload changes", () => {
    const payload = { grade: "A", checks: [1, 2, 3] };
    expect(proofDigest(["x"], payload).digest).toBe(proofDigest(["x"], payload).digest);
    expect(proofDigest(["x"], payload).digest).not.toBe(proofDigest(["x"], { ...payload, grade: "B" }).digest);
  });
});

// ─── Registry wired to the engines (WO-13) ─────────────────────────

describe("generateCommerceRegistry verified_decisions (engine-derived + proof)", () => {
  it("embeds verified_decisions whose compliance grade comes from the same engine as computeComplianceGrade", () => {
    const file = generateCommerceRegistry(ctx, profile, PAYMENT_FILES);
    const parsed = JSON.parse(file.content);
    expect(parsed.verified_decisions).toBeDefined();
    expect(parsed.verified_decisions.proof.algo).toBe("sha256");
    expect(parsed.verified_decisions.compliance.grade).toBe(computeComplianceGrade(PAYMENT_FILES).grade);
    expect(parsed.verified_decisions.compliance.checks_passed).toBe(gradeCompliance(PAYMENT_FILES).checks_passed);
    expect(parsed.verified_decisions.compliance.checks_total).toBe(8);
  });

  it("sca_samples come from decideScaExemption (low_value / TRA / 3ds2_challenge)", () => {
    const file = generateCommerceRegistry(ctx, profile, PAYMENT_FILES);
    const parsed = JSON.parse(file.content);
    const samples = parsed.verified_decisions.sca_samples;
    expect(samples).toHaveLength(3);
    expect(samples[0].decision.exemption).toBe("low_value");
    expect(samples[0].decision).toEqual(JSON.parse(JSON.stringify(decideScaExemption({ amount_eur: 20 }))));
    expect(samples[1].decision.exemption).toBe("transaction_risk_analysis");
    expect(samples[2].decision.exemption).toBe("3ds2_challenge");
    expect(samples[2].decision.sca_required).toBe(true);
  });

  it("DETERMINISM: identical inputs produce a byte-identical proof digest", () => {
    const a = JSON.parse(generateCommerceRegistry(ctx, profile, PAYMENT_FILES).content);
    const b = JSON.parse(generateCommerceRegistry(ctx, profile, PAYMENT_FILES).content);
    expect(a.verified_decisions.proof.digest).toBe(b.verified_decisions.proof.digest);
    expect(a.verified_decisions.sca_matrix_digest.digest).toBe(b.verified_decisions.sca_matrix_digest.digest);
  });

  it("proof digest matches an independent recomputation over the same payload", () => {
    const parsed = JSON.parse(generateCommerceRegistry(ctx, profile, PAYMENT_FILES).content);
    const signals = detectCommerceSignals(PAYMENT_FILES);
    const compliance = gradeCompliance(PAYMENT_FILES);
    const scaSamples = [
      { input: { amount_eur: 20 }, decision: decideScaExemption({ amount_eur: 20 }) },
      { input: { amount_eur: 400, tra_acquirer_fraud_bps: 1 }, decision: decideScaExemption({ amount_eur: 400, tra_acquirer_fraud_bps: 1 }) },
      { input: { amount_eur: 1000 }, decision: decideScaExemption({ amount_eur: 1000 }) },
    ];
    const recomputed = proofDigest(
      ["repo_commerce_signals", "compliance_grade", "sca_samples"],
      { signals, compliance, sca_samples: scaSamples },
    );
    expect(parsed.verified_decisions.proof.digest).toBe(recomputed.digest);
  });

  it("keeps the pre-existing inline verification_proof intact (back-compat)", () => {
    const parsed = JSON.parse(generateCommerceRegistry(ctx, profile, PAYMENT_FILES).content);
    expect(parsed.ap2_compliance_assessment.verification_proof.checks_total).toBe(8);
  });
});
