import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  loadPaidConfig,
  createCheckoutSession,
  verifyPaidWebhookSignature,
  tierForPlan,
  PaidError,
} from "./paid-client.js";

// ─── loadPaidConfig ─────────────────────────────────────────────

describe("loadPaidConfig", () => {
  it("loads required fields and falls back from PAID_ACCOUNT_ID", () => {
    const cfg = loadPaidConfig({
      PAID_API_KEY: "sk_live_test",
      PAID_ACCOUNT_ID: "acct_abc",
      PAID_API_BASE_URL: "https://example.com/v1/",
      PAID_WEBHOOK_SIGNING_KEY: "whsec_x",
    } as NodeJS.ProcessEnv);
    expect(cfg.apiKey).toBe("sk_live_test");
    expect(cfg.merchantId).toBe("acct_abc");
    expect(cfg.apiBaseUrl).toBe("https://example.com/v1"); // trailing slash trimmed
    expect(cfg.webhookSigningKey).toBe("whsec_x");
  });

  it("prefers PAID_MERCHANT_ID over PAID_ACCOUNT_ID", () => {
    const cfg = loadPaidConfig({
      PAID_API_KEY: "k",
      PAID_MERCHANT_ID: "merchant",
      PAID_ACCOUNT_ID: "account",
    } as NodeJS.ProcessEnv);
    expect(cfg.merchantId).toBe("merchant");
  });

  it("throws when PAID_API_KEY missing", () => {
    expect(() => loadPaidConfig({ PAID_MERCHANT_ID: "m" } as NodeJS.ProcessEnv)).toThrow(/PAID_API_KEY/);
  });

  it("throws when merchant id missing", () => {
    expect(() => loadPaidConfig({ PAID_API_KEY: "k" } as NodeJS.ProcessEnv)).toThrow(/PAID_MERCHANT_ID/);
  });
});

// ─── tierForPlan ────────────────────────────────────────────────

describe("tierForPlan", () => {
  it("maps growth → suite, everything else → paid", () => {
    expect(tierForPlan("growth")).toBe("suite");
    expect(tierForPlan("starter")).toBe("paid");
    expect(tierForPlan("pro")).toBe("paid");
  });
});

// ─── createCheckoutSession ──────────────────────────────────────

const CONFIG = {
  apiBaseUrl: "https://paid.test/v1",
  apiKey: "sk_live_test",
  merchantId: "acct_x",
  webhookSigningKey: "whsec_x",
};

const BASE_INPUT = {
  planId: "starter" as const,
  cycle: "monthly" as const,
  amountCents: 2900,
  description: "AXIS Iliad starter (monthly)",
  customerEmail: "a@b.com",
  successUrl: "https://app.test/?paid_checkout=success",
  cancelUrl: "https://app.test/?paid_checkout=cancel",
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Network guard: every fetch must be explicitly mocked per-test via
  // mockResolvedValueOnce — any un-mocked call rejects instead of hitting
  // the real PAI'D service.
  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("unexpected network call — fetch must be mocked in tests"));
});

afterEach(() => {
  fetchSpy.mockRestore();
});

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("createCheckoutSession", () => {
  it("rejects non-positive amounts", async () => {
    await expect(createCheckoutSession({ ...BASE_INPUT, amountCents: 0 }, CONFIG)).rejects.toThrow(/positive integer/);
    await expect(createCheckoutSession({ ...BASE_INPUT, amountCents: -1 }, CONFIG)).rejects.toThrow(/positive integer/);
    await expect(createCheckoutSession({ ...BASE_INPUT, amountCents: 1.5 }, CONFIG)).rejects.toThrow(/positive integer/);
  });

  it("throws when customerEmail missing", async () => {
    await expect(createCheckoutSession({ ...BASE_INPUT, customerEmail: "" }, CONFIG)).rejects.toThrow(/customerEmail/);
  });

  it("POSTs a hosted-checkout session to /checkout/sessions with bearer + idempotency header", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ id: "cs_1", url: "https://pay.paid.test/cs_1", status: "open" }));
    const session = await createCheckoutSession({ ...BASE_INPUT, idempotencyKey: "idem-1" }, CONFIG);
    expect(session.url).toBe("https://pay.paid.test/cs_1");
    expect(session.id).toBe("cs_1");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://paid.test/v1/checkout/sessions");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer sk_live_test",
      "Idempotency-Key": "idem-1",
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.mode).toBe("payment");
    expect(body.amount_total_minor).toBe(2900);
    expect(body.payment_method_types).toEqual(["card"]);
    expect(body.line_items[0].ad_hoc).toMatchObject({ amount: 2900, currency: "USD" });
    expect(body.line_items[0].quantity).toBe(1);
    expect(body.success_url).toBe(BASE_INPUT.successUrl);
    expect(body.cancel_url).toBe(BASE_INPUT.cancelUrl);
    expect(body.customer_email).toBe("a@b.com");
    // metadata drives webhook fulfilment
    expect(body.metadata).toMatchObject({
      user_email: "a@b.com",
      plan_id: "starter",
      tier: "paid",
      cycle: "monthly",
      kind: "subscription",
    });
  });

  it("stamps metadata.tier=suite for the growth plan", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ id: "cs_2", url: "https://pay/cs_2", status: "open" }));
    await createCheckoutSession({ ...BASE_INPUT, planId: "growth", amountCents: 29900 }, CONFIG);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.metadata.tier).toBe("suite");
  });

  it("throws PaidError on non-2xx", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 402 }));
    await expect(createCheckoutSession(BASE_INPUT, CONFIG)).rejects.toBeInstanceOf(PaidError);
  });
});

// ─── verifyPaidWebhookSignature ─────────────────────────────────

function signPaid(payload: string, key: string, ts: number = Math.floor(Date.now() / 1000)): string {
  const hex = createHmac("sha256", key).update(`${ts}.${payload}`).digest("hex");
  return `t=${ts},v1=${hex}`;
}

describe("verifyPaidWebhookSignature", () => {
  const key = "whsec_test";
  const body = '{"type":"x"}';

  it("accepts a valid signature", () => {
    const sig = signPaid(body, key);
    expect(verifyPaidWebhookSignature({ rawBody: body, signatureHeader: sig, signingKey: key })).toBe(true);
  });

  it("rejects a bad hex signature", () => {
    expect(verifyPaidWebhookSignature({ rawBody: body, signatureHeader: "t=1,v1=deadbeef", signingKey: key })).toBe(false);
  });

  it("rejects a stale timestamp", () => {
    const stale = Math.floor(Date.now() / 1000) - 10_000;
    const sig = signPaid(body, key, stale);
    expect(verifyPaidWebhookSignature({ rawBody: body, signatureHeader: sig, signingKey: key })).toBe(false);
  });

  it("rejects a timestamp just past the 300s tolerance", () => {
    const past = Math.floor(Date.now() / 1000) - 301;
    const sig = signPaid(body, key, past);
    expect(verifyPaidWebhookSignature({ rawBody: body, signatureHeader: sig, signingKey: key })).toBe(false);
  });

  it("rejects a far-future timestamp", () => {
    const future = Math.floor(Date.now() / 1000) + 10_000;
    const sig = signPaid(body, key, future);
    expect(verifyPaidWebhookSignature({ rawBody: body, signatureHeader: sig, signingKey: key })).toBe(false);
  });

  it("accepts a fresh timestamp within tolerance", () => {
    const fresh = Math.floor(Date.now() / 1000) - 200;
    const sig = signPaid(body, key, fresh);
    expect(verifyPaidWebhookSignature({ rawBody: body, signatureHeader: sig, signingKey: key })).toBe(true);
  });

  it("rejects missing signature header", () => {
    expect(verifyPaidWebhookSignature({ rawBody: body, signatureHeader: undefined, signingKey: key })).toBe(false);
  });

  it("rejects header missing t or v1", () => {
    expect(verifyPaidWebhookSignature({ rawBody: body, signatureHeader: "v1=abc", signingKey: key })).toBe(false);
    expect(verifyPaidWebhookSignature({ rawBody: body, signatureHeader: "t=123", signingKey: key })).toBe(false);
  });
});
