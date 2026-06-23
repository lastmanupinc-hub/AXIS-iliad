import { describe, expect, it } from "vitest";
import { cleanPriceId } from "./stripe.js";
import { resolvePaidBaseUrl, resolvePaidWebhookSecret, isPaidConfigured } from "./paid-client.js";

describe("cleanPriceId — tolerate a pasted Stripe price label", () => {
  it("strips a trailing label", () => {
    expect(cleanPriceId("price_1TkWfbELErUdQ5HwbibF1tXB (monthly $29.00)")).toBe("price_1TkWfbELErUdQ5HwbibF1tXB");
  });
  it("trims whitespace and passes a clean id through", () => {
    expect(cleanPriceId("  price_ABC123  ")).toBe("price_ABC123");
    expect(cleanPriceId("price_xyz")).toBe("price_xyz");
  });
  it("leaves undefined/empty alone", () => {
    expect(cleanPriceId(undefined)).toBeUndefined();
    expect(cleanPriceId("")).toBe("");
  });
});

describe("PAI'D env-name tolerance (one estate, three names)", () => {
  it("resolves the base URL from any of the three names, with Iliad's name winning", () => {
    expect(resolvePaidBaseUrl({ PAID_API_URL: "a" })).toBe("a"); // PAI'D server name
    expect(resolvePaidBaseUrl({ PAID_BASE_URL: "b" })).toBe("b"); // Avatar name
    expect(resolvePaidBaseUrl({ PAID_API_BASE_URL: "c", PAID_API_URL: "a" })).toBe("c"); // precedence
    expect(resolvePaidBaseUrl({})).toBeUndefined();
  });

  it("resolves the webhook secret from either name (the silent-failure trap)", () => {
    expect(resolvePaidWebhookSecret({ PAID_WEBHOOK_SECRET: "s" })).toBe("s"); // PAI'D signs with this
    expect(resolvePaidWebhookSecret({ PAID_WEBHOOK_SIGNING_KEY: "k", PAID_WEBHOOK_SECRET: "s" })).toBe("k");
    expect(resolvePaidWebhookSecret({})).toBeUndefined();
  });

  it("isPaidConfigured is true under any base-URL name (so checkout routes to PAI'D, not the Stripe fallback)", () => {
    expect(isPaidConfigured({ PAID_BASE_URL: "x", PAID_MERCHANT_ID: "m", PAID_API_KEY: "k" })).toBe(true);
    expect(isPaidConfigured({ PAID_API_URL: "x", PAID_ACCOUNT_ID: "m", PAID_API_KEY: "k" })).toBe(true);
    expect(isPaidConfigured({ PAID_MERCHANT_ID: "m", PAID_API_KEY: "k" })).toBe(false); // no url
    expect(isPaidConfigured({ PAID_BASE_URL: "x", PAID_API_KEY: "k" })).toBe(false); // no merchant
  });
});
