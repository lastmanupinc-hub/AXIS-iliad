import { describe, it, expect } from "vitest";
import { buildX402Endpoint, buildX402EndpointTest, detectFramework } from "./commerce-integration.js";
import type { ContextMap } from "@axis/context-engine";
import type { CommerceSignals } from "@axis/generator-core";

function ctxWith(frameworks: string[]): ContextMap {
  return {
    detection: { frameworks: frameworks.map((name) => ({ name, version: null, confidence: 1, evidence: [] })) },
  } as unknown as ContextMap;
}

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
