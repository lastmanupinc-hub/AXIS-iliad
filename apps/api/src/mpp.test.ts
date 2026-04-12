/**
 * Tests for eq_192 Machine Payments Protocol (MPP) implementation:
 *   createMppPaymentUrl — generates Stripe Checkout URL for 402 responses
 *   sendPaymentRequired — sends HTTP 402 with MPP-compliant JSON body
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ServerResponse } from "node:http";
import { createMppPaymentUrl, sendPaymentRequired } from "./stripe.js";

// ─── createMppPaymentUrl ─────────────────────────────────────────

describe("createMppPaymentUrl", () => {
  const ORIG_ENV = { ...process.env };

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake_key";
    process.env.STRIPE_PRICE_ID_PAID = "price_paid_test";
    process.env.STRIPE_PRICE_ID_CREDITS = "price_credits_test";
    process.env.CORS_ORIGIN = "https://test.axistoolbox.com";
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIG_ENV)) delete process.env[key];
    }
    Object.assign(process.env, ORIG_ENV);
    vi.restoreAllMocks();
  });

  it("returns null when STRIPE_SECRET_KEY is not set", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const result = await createMppPaymentUrl("acc_1", "free");
    expect(result).toBeNull();
  });

  it("returns null when STRIPE_PRICE_ID_PAID is not set (free tier)", async () => {
    delete process.env.STRIPE_PRICE_ID_PAID;
    const result = await createMppPaymentUrl("acc_1", "free");
    expect(result).toBeNull();
  });

  it("returns null when STRIPE_PRICE_ID_CREDITS is not set (paid tier)", async () => {
    delete process.env.STRIPE_PRICE_ID_CREDITS;
    const result = await createMppPaymentUrl("acc_1", "paid");
    expect(result).toBeNull();
  });

  it("calls Stripe checkout sessions API for free tier (subscription mode)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await createMppPaymentUrl("acc_free_1", "free");

    expect(result).toBe("https://checkout.stripe.com/c/pay/cs_test_123");
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(opts.method).toBe("POST");
    const body = decodeURIComponent(opts.body as string);
    expect(body).toContain("mode=subscription");
    expect(body).toContain("price_paid_test");
    expect(body).toContain("acc_free_1");
    expect(body).toContain("metadata[tier]=paid");
  });

  it("calls Stripe checkout sessions API for paid tier (payment mode / credit top-up)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "cs_test_456", url: "https://checkout.stripe.com/c/pay/cs_test_456" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await createMppPaymentUrl("acc_paid_1", "paid");

    expect(result).toBe("https://checkout.stripe.com/c/pay/cs_test_456");
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = opts.body as string;
    expect(body).toContain("mode=payment");
    expect(body).toContain("price_credits_test");
    expect(body).toContain("acc_paid_1");
    // subscription_data should NOT appear for one-time payment
    expect(body).not.toContain("subscription_data");
  });

  it("includes mpp_402 source metadata in request", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.stripe.com/c/pay/cs_test" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await createMppPaymentUrl("acc_1", "free");

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(decodeURIComponent(opts.body as string)).toContain("metadata[source]=mpp_402");
  });

  it("uses CORS_ORIGIN for success/cancel URLs", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.stripe.com/c/pay/cs_test" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await createMppPaymentUrl("acc_1", "paid");

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = opts.body as string;
    expect(body).toContain("test.axistoolbox.com");
  });

  it("returns null when Stripe API returns non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", mockFetch);

    const result = await createMppPaymentUrl("acc_1", "free");
    expect(result).toBeNull();
  });

  it("returns null when session URL is missing from response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "cs_test_no_url" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await createMppPaymentUrl("acc_1", "paid");
    expect(result).toBeNull();
  });

  it("uses Authorization Bearer header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.stripe.com/c/pay/cs_test" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await createMppPaymentUrl("acc_1", "free");

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk_test_fake_key");
  });
});

// ─── sendPaymentRequired ─────────────────────────────────────────

describe("sendPaymentRequired", () => {
  function makeMockRes() {
    const writtenHead: { statusCode: number; headers: Record<string, string> }[] = [];
    const writtenBody: string[] = [];
    const res = {
      writeHead(code: number, headers: Record<string, string>) {
        writtenHead.push({ statusCode: code, headers });
      },
      end(body: string) {
        writtenBody.push(body);
      },
    } as unknown as ServerResponse;
    return {
      res,
      getStatus: () => writtenHead[0]?.statusCode,
      getHeaders: () => writtenHead[0]?.headers,
      getBody: () => JSON.parse(writtenBody[0] ?? "{}") as Record<string, unknown>,
    };
  }

  it("sends HTTP 402 status", () => {
    const { res, getStatus } = makeMockRes();
    sendPaymentRequired(res, "https://checkout.stripe.com/pay/x", "free");
    expect(getStatus()).toBe(402);
  });

  it("sets Content-Type application/json", () => {
    const { res, getHeaders } = makeMockRes();
    sendPaymentRequired(res, "https://checkout.stripe.com/pay/x", "free");
    expect(getHeaders()["Content-Type"]).toBe("application/json");
  });

  it("body contains payment_session_url", () => {
    const { res, getBody } = makeMockRes();
    const url = "https://checkout.stripe.com/pay/test_abc";
    sendPaymentRequired(res, url, "free");
    expect(getBody().payment_session_url).toBe(url);
  });

  it("body type is subscription_upgrade for free tier", () => {
    const { res, getBody } = makeMockRes();
    sendPaymentRequired(res, "https://checkout.stripe.com/pay/x", "free");
    const payment = getBody().payment as Record<string, string>;
    expect(payment.type).toBe("subscription_upgrade");
    expect(payment.description).toContain("$39/month");
  });

  it("body type is credit_topup for paid tier", () => {
    const { res, getBody } = makeMockRes();
    sendPaymentRequired(res, "https://checkout.stripe.com/pay/x", "paid");
    const payment = getBody().payment as Record<string, string>;
    expect(payment.type).toBe("credit_topup");
    expect(payment.description).toContain("$0.50");
  });

  it("body type is credit_topup for suite tier", () => {
    const { res, getBody } = makeMockRes();
    sendPaymentRequired(res, "https://checkout.stripe.com/pay/x", "suite");
    const payment = getBody().payment as Record<string, string>;
    expect(payment.type).toBe("credit_topup");
  });

  it("body contains error_code PAYMENT_REQUIRED", () => {
    const { res, getBody } = makeMockRes();
    sendPaymentRequired(res, "https://checkout.stripe.com/pay/x", "free");
    expect(getBody().error_code).toBe("PAYMENT_REQUIRED");
  });

  it("body contains current_tier", () => {
    const { res, getBody } = makeMockRes();
    sendPaymentRequired(res, "https://checkout.stripe.com/pay/x", "paid");
    expect(getBody().current_tier).toBe("paid");
  });

  it("uses provided reason as message", () => {
    const { res, getBody } = makeMockRes();
    sendPaymentRequired(res, "https://checkout.stripe.com/pay/x", "free", "Monthly snapshot limit reached");
    expect(getBody().message).toBe("Monthly snapshot limit reached");
  });

  it("uses default message when no reason provided", () => {
    const { res, getBody } = makeMockRes();
    sendPaymentRequired(res, "https://checkout.stripe.com/pay/x", "free");
    expect(typeof getBody().message).toBe("string");
    expect(String(getBody().message).length).toBeGreaterThan(0);
  });

  it("body contains retry_after instruction", () => {
    const { res, getBody } = makeMockRes();
    sendPaymentRequired(res, "https://checkout.stripe.com/pay/x", "paid");
    expect(typeof getBody().retry_after).toBe("string");
  });
});

// ─── ErrorCode.PAYMENT_REQUIRED ──────────────────────────────────

describe("ErrorCode.PAYMENT_REQUIRED", () => {
  it("is defined and equals PAYMENT_REQUIRED string", async () => {
    const { ErrorCode } = await import("./logger.js");
    expect(ErrorCode.PAYMENT_REQUIRED).toBe("PAYMENT_REQUIRED");
  });
});
