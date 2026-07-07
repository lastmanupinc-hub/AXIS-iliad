import { describe, it, expect } from "vitest";
import { buildX402Endpoint, buildX402EndpointTest, detectFramework, buildCe3Evidence, buildDisputeReadiness, buildCommerceIntegrationBundle, emitStripeNetworkTokenAdapter } from "./commerce-integration.js";
import type { ContextMap } from "@axis/context-engine";
import type { CommerceSignals } from "@axis/generator-core";

function ctxWith(frameworks: string[]): ContextMap {
  return {
    project_identity: { name: "demo", type: "app", primary_language: "typescript", description: null, repo_url: null, go_module: null },
    detection: { frameworks: frameworks.map((name) => ({ name, version: null, confidence: 1, evidence: [] })) },
  } as unknown as ContextMap;
}

const richSignals: CommerceSignals = {
  detected_providers: ["stripe"], has_checkout: true, has_recurring: true, has_sca: true,
  has_dispute_handling: true, has_webhooks: true, has_tap_protocol: true,
  has_network_tokenization: true, has_mandate_management: true, total_payment_files: 9,
};
const poorSignals: CommerceSignals = {
  detected_providers: [], has_checkout: false, has_recurring: false, has_sca: false,
  has_dispute_handling: false, has_webhooks: false, has_tap_protocol: false,
  has_network_tokenization: false, has_mandate_management: false, total_payment_files: 0,
};

const signals: CommerceSignals = {
  detected_providers: ["stripe"],
  has_checkout: true,
  has_recurring: false,
  has_sca: true,
  has_dispute_handling: false,
  has_webhooks: true,
  has_tap_protocol: false,
  has_network_tokenization: false,
  has_mandate_management: false,
  total_payment_files: 3,
};

describe("detectFramework", () => {
  it("picks hono / express / node from detected frameworks", () => {
    expect(detectFramework(ctxWith(["Hono"]))).toBe("hono");
    expect(detectFramework(ctxWith(["Express"]))).toBe("express");
    expect(detectFramework(ctxWith(["Next.js"]))).toBe("express");
    expect(detectFramework(ctxWith(["mystery-fw"]))).toBe("node");
  });
});

describe("buildX402Endpoint", () => {
  it("emits the 402 challenge, AP2 mandate verify, and PAI'D settlement", () => {
    const code = buildX402Endpoint(ctxWith(["Express"]), signals, 250);
    expect(code).toContain("export function createX402Challenge()");
    expect(code).toContain("export function verifyAp2Mandate(");
    expect(code).toContain("timingSafeEqual"); // mandate verification is timing-safe
    expect(code).toContain("export async function settleViaPaid(");
    expect(code).toContain("api.paid.ai"); // settles via the merchant's PAI'D account
    expect(code).toContain("process.env.PAID_API_KEY"); // env by NAME, not value
    expect(code).toContain("export async function handlePurchase(");
    expect(code).toContain("export const PRICE_CENTS = 250;");
  });

  it("emits the binding for the detected framework", () => {
    expect(buildX402Endpoint(ctxWith(["Hono"]), signals, 250)).toContain('import type { Context } from "hono"');
    expect(buildX402Endpoint(ctxWith(["Express"]), signals, 250)).toContain('import type { Request, Response } from "express"');
    expect(buildX402Endpoint(ctxWith([]), signals, 250)).toContain("node:http");
  });

  it("never embeds a secret value, and clamps the price to a positive integer", () => {
    const code = buildX402Endpoint(ctxWith([]), signals, 0.4);
    expect(code).toContain("PRICE_CENTS = 1"); // 0.4 clamped to 1
    expect(code).not.toMatch(/PAID_API_KEY\s*=\s*["'][^"']/); // never an assigned value
  });

  it("is deterministic", () => {
    expect(buildX402Endpoint(ctxWith(["Express"]), signals, 250)).toBe(buildX402Endpoint(ctxWith(["Express"]), signals, 250));
  });
});

describe("buildX402EndpointTest", () => {
  it("emits a runnable vitest spec referencing the endpoint's exports", () => {
    const t = buildX402EndpointTest();
    expect(t).toContain('from "vitest"');
    expect(t).toContain('from "./x402-paid-endpoint"');
    expect(t).toContain("handlePurchase");
    expect(t).toContain("signMandate"); // exercises the valid-mandate path
    expect(t).toContain("rejects a tampered mandate");
    expect(t).toBe(buildX402EndpointTest()); // deterministic
  });
});

describe("buildCe3Evidence", () => {
  it("emits a schema-valid CE 3.0 document (>=2 prior txns, >=2 matched elements, v3.0)", () => {
    const { json, schema } = buildCe3Evidence(signals, "demo");
    const ev = JSON.parse(json);
    const sc = JSON.parse(schema);
    expect(ev.compelling_evidence_version).toBe("3.0");
    expect(ev.target_dispute_codes).toEqual(["10.2", "10.3", "10.4"]);
    expect(ev.prior_undisputed_transactions.length).toBeGreaterThanOrEqual(2);
    expect(ev.matched_elements.length).toBeGreaterThanOrEqual(2);
    // the generated document satisfies the schema's key cardinality constraints
    expect(ev.prior_undisputed_transactions.length).toBeGreaterThanOrEqual(sc.properties.prior_undisputed_transactions.minItems);
    expect(sc.$defs.txn.required).toContain("payment_credential_id");
  });
  it("is deterministic", () => {
    expect(buildCe3Evidence(signals, "demo").json).toBe(buildCe3Evidence(signals, "demo").json);
  });
});

describe("buildDisputeReadiness", () => {
  it("scores higher with more evidence signals (monotonic) and is honest about what it measures", () => {
    const rich = buildDisputeReadiness(richSignals, "demo");
    const poor = buildDisputeReadiness(poorSignals, "demo");
    expect(rich.score).toBeGreaterThan(poor.score);
    expect(poor.score).toBe(0); // nothing detectable
    expect(rich.score).toBeLessThan(100); // device fingerprint is never auto-present
    expect(["A", "B", "C", "D"]).toContain(rich.grade);
    expect(rich.md).toContain("NOT dispute-win odds");
    expect(rich.md).toContain("no");
    expect(poor.gaps.length).toBeGreaterThan(0);
  });
  it("always surfaces device fingerprint as a gap (not detectable from code)", () => {
    expect(buildDisputeReadiness(richSignals, "demo").gaps.some((d) => d.key === "device_fingerprint")).toBe(true);
  });
  it("is deterministic", () => {
    expect(buildDisputeReadiness(signals, "demo").md).toBe(buildDisputeReadiness(signals, "demo").md);
  });
});

// ─── WO-14: Stripe network-token adapter (E9 deployable artifact) ───

describe("emitStripeNetworkTokenAdapter", () => {
  it("returns a .ts adapter that reads card.network_token when a stripe signal is present", () => {
    const artifact = emitStripeNetworkTokenAdapter(ctxWith(["Express"]), signals);
    expect(artifact).not.toBeNull();
    expect(artifact!.path.endsWith(".ts")).toBe(true);
    expect(artifact!.content).toContain("card.network_token");
    expect(artifact!.content).toContain("readStripeNetworkToken");
    // Wired to the CUSTOMER's own account — env by NAME, never a value.
    expect(artifact!.content).toContain("process.env.STRIPE_SECRET_KEY");
    expect(artifact!.content).not.toMatch(/STRIPE_SECRET_KEY\s*=\s*["'][^"']/);
  });

  it("bakes the honest mapping in: co-badging networks metadata is NOT a tokenization signal", () => {
    const artifact = emitStripeNetworkTokenAdapter(ctxWith(["Express"]), signals)!;
    expect(artifact.content).toContain("network_token?.used === true");
    expect(artifact.content).toContain("co-badging");
  });

  it("returns null when no stripe signal is present", () => {
    expect(emitStripeNetworkTokenAdapter(ctxWith(["Express"]), poorSignals)).toBeNull();
    expect(
      emitStripeNetworkTokenAdapter(ctxWith(["Express"]), { ...signals, detected_providers: ["paypal"] }),
    ).toBeNull();
  });

  it("is deterministic", () => {
    expect(emitStripeNetworkTokenAdapter(ctxWith(["Express"]), signals)).toEqual(
      emitStripeNetworkTokenAdapter(ctxWith(["Express"]), signals),
    );
  });
});

describe("buildCommerceIntegrationBundle", () => {
  it("assembles the 5 core engineer artifacts + the Stripe network-token adapter (stripe signal present)", () => {
    const bundle = buildCommerceIntegrationBundle(ctxWith(["Express"]), signals, 100);
    expect(bundle.map((a) => a.path).sort()).toEqual([
      "ce3-evidence.json",
      "ce3-evidence.schema.json",
      "dispute-readiness.md",
      "stripe-network-token-adapter.ts",
      "x402-endpoint.test.ts",
      "x402-paid-endpoint.ts",
    ]);
    expect(bundle.every((a) => a.content.length > 0)).toBe(true);
  });
  it("omits the network-token adapter when no stripe signal is present (5 core artifacts)", () => {
    const bundle = buildCommerceIntegrationBundle(ctxWith(["Express"]), poorSignals, 100);
    expect(bundle.map((a) => a.path)).not.toContain("stripe-network-token-adapter.ts");
    expect(bundle).toHaveLength(5);
  });
  it("is deterministic", () => {
    expect(buildCommerceIntegrationBundle(ctxWith(["Express"]), signals, 100)).toEqual(
      buildCommerceIntegrationBundle(ctxWith(["Express"]), signals, 100),
    );
  });
});
