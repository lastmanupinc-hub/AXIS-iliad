import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import { resetTestDb, getAccountByEmail, recordPendingPurchase, getPersistenceBalance, getAccountPaidPlanId, updateAccountPaidPlanId } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleCreateAccount } from "./billing.js";
import { handlePaidSubscribe, handlePaidConfig, handlePaidWebhook } from "./paid-handlers.js";
import { resetRateLimits } from "./rate-limiter.js";

const SIGNING_KEY = "whsec_paid_test";
let server: Server;
let testPort = 0;

interface Res { status: number; data: Record<string, unknown> }

async function req(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined;
    const hdrs: Record<string, string> = { "Content-Type": "application/json", ...headers };
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method, headers: hdrs },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          resolve({ status: res.statusCode ?? 0, data: data as Record<string, unknown> });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function signPaid(payload: string, ts: number = Math.floor(Date.now() / 1000)): string {
  const hex = createHmac("sha256", SIGNING_KEY).update(`${ts}.${payload}`).digest("hex");
  return `t=${ts},v1=${hex}`;
}

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();
  process.env.PAID_API_KEY = "sk_live_test";
  process.env.PAID_API_SECRET = "paid_secret_test_value";
  process.env.PAID_MERCHANT_ID = "acct_test";
  process.env.PAID_API_BASE_URL = "https://paid.test/v1";
  process.env.PAID_PLAN_PRO_MONTHLY = "plan_m";
  process.env.PAID_PLAN_PRO_ANNUAL = "plan_a";
  process.env.PAID_WEBHOOK_SIGNING_KEY = SIGNING_KEY;
  process.env.PAID_STRIPE_PUBLISHABLE_KEY = "pk_test_paid";

  const router = new Router();
  router.post("/v1/accounts", handleCreateAccount);
  router.post("/portal/api/subscribe", handlePaidSubscribe);
  router.get("/portal/api/paid/config", handlePaidConfig);
  router.post("/portal/api/paid/webhook", handlePaidWebhook);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  delete process.env.PAID_API_KEY;
  delete process.env.PAID_API_SECRET;
  delete process.env.PAID_MERCHANT_ID;
  delete process.env.PAID_API_BASE_URL;
  delete process.env.PAID_PLAN_PRO_MONTHLY;
  delete process.env.PAID_PLAN_PRO_ANNUAL;
  delete process.env.PAID_WEBHOOK_SIGNING_KEY;
  delete process.env.PAID_STRIPE_PUBLISHABLE_KEY;
});

beforeEach(() => {
  resetRateLimits();
  // Network guard: any fetch a test does not explicitly mock (via
  // mockResolvedValueOnce) rejects — this file must never reach the
  // real PAI'D service or api.stripe.com.
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("unexpected network call — fetch must be mocked in tests"),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function createAccount(email: string) {
  const name = email.split("@")[0];
  const r = await req("POST", "/v1/accounts", { name, email });
  return r.data.account as Record<string, unknown>;
}

// ─── POST /portal/api/subscribe ─────────────────────────────────

describe("POST /portal/api/subscribe", () => {
  it("rejects invalid plan", async () => {
    const r = await req("POST", "/portal/api/subscribe", { plan: "weekly", email: "a@b.com" });
    expect(r.status).toBe(400);
  });

  it("rejects missing email", async () => {
    const r = await req("POST", "/portal/api/subscribe", { plan: "monthly" });
    expect(r.status).toBe(400);
  });

  it("returns 404 when account does not exist", async () => {
    const r = await req("POST", "/portal/api/subscribe", { plan: "monthly", email: "missing@test.com" });
    expect(r.status).toBe(404);
  });

  it("creates a hosted checkout session on happy path", async () => {
    await createAccount("subscribe-ok@test.com");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "cs_ok", url: "https://pay.paid.test/cs_ok", status: "open" }), { status: 200 }),
    );
    const r = await req("POST", "/portal/api/subscribe", { plan: "monthly", email: "subscribe-ok@test.com" });
    expect(r.status).toBe(200);
    expect(r.data.checkout_url).toBe("https://pay.paid.test/cs_ok");
    expect(r.data.session_id).toBe("cs_ok");
    expect(fetchSpy).toHaveBeenCalledOnce();
    // hosted-checkout session, NOT the old /subscriptions call
    const [url] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/checkout/sessions");
  });

  it("ignores a spoofed Origin header when building return URLs (no open redirect)", async () => {
    vi.stubEnv("PAID_PUBLIC_APP_URL", "https://iliad.trustfabric.ai");
    await createAccount("origin-spoof@test.com");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "cs_o", url: "https://pay/cs_o", status: "open" }), { status: 200 }),
    );
    const r = await req(
      "POST",
      "/portal/api/subscribe",
      { plan: "monthly", email: "origin-spoof@test.com" },
      { Origin: "https://attacker.example" },
    );
    expect(r.status).toBe(200);
    // The return URLs must come from the validated app base URL, never the caller's Origin.
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const sent = JSON.parse(String(init.body)) as { success_url: string; cancel_url: string };
    expect(sent.success_url).toBe("https://iliad.trustfabric.ai/?paid_checkout=success");
    expect(sent.cancel_url).toBe("https://iliad.trustfabric.ai/?paid_checkout=cancel");
    expect(sent.success_url).not.toContain("attacker");
    expect(sent.cancel_url).not.toContain("attacker");
  });

  it("no longer requires a Stripe publishable key (PAI'D hosts the page)", async () => {
    await createAccount("subscribe-nopk@test.com");
    vi.stubEnv("PAID_STRIPE_PUBLISHABLE_KEY", undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "cs_nopk", url: "https://pay/cs_nopk", status: "open" }), { status: 200 }),
    );
    const r = await req("POST", "/portal/api/subscribe", { plan: "monthly", email: "subscribe-nopk@test.com" });
    expect(r.status).toBe(200);
    expect(r.data.checkout_url).toBe("https://pay/cs_nopk");
  });

  it("returns 502 when PAID rejects", async () => {
    await createAccount("subscribe-fail@test.com");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("denied", { status: 402 }));
    const r = await req("POST", "/portal/api/subscribe", { plan: "annual", email: "subscribe-fail@test.com" });
    expect(r.status).toBe(502);
  });

  it("matches the account case-insensitively and sends the stored email to PAID", async () => {
    // Account created with mixed-case input is stored lowercased
    await createAccount("Case-Sub@Test.com");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "cs_case", url: "https://pay/cs_case", status: "open" }), { status: 200 }),
    );
    const r = await req("POST", "/portal/api/subscribe", { plan: "monthly", email: "CASE-SUB@test.COM" });
    expect(r.status).toBe(200);
    expect(r.data.session_id).toBe("cs_case");
    // PAI'D must receive the canonical stored email (top-level + metadata) so
    // its webhook echo maps back onto the same account
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const sent = JSON.parse(String(init.body)) as { customer_email: string; metadata: { user_email: string } };
    expect(sent.customer_email).toBe("case-sub@test.com");
    expect(sent.metadata.user_email).toBe("case-sub@test.com");
  });

  it("routes Growth (not just Starter) through PAI'D with the right price + tier metadata", async () => {
    await createAccount("subscribe-growth@test.com");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "cs_growth", url: "https://pay/cs_growth", status: "open" }), { status: 200 }),
    );
    const r = await req("POST", "/portal/api/subscribe", { plan: "monthly", plan_id: "growth", email: "subscribe-growth@test.com" });
    expect(r.status).toBe(200);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const sent = JSON.parse(String(init.body)) as { amount_total_minor: number; metadata: { plan_id: string; tier: string } };
    expect(sent.amount_total_minor).toBe(29900); // Growth monthly $299, not Starter $29
    expect(sent.metadata.plan_id).toBe("growth");
    expect(sent.metadata.tier).toBe("suite"); // → webhook upgrades the account to suite
  });

  it("defaults to Starter when no plan_id is sent (back-compat)", async () => {
    await createAccount("subscribe-default@test.com");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "cs_def", url: "https://pay/cs_def", status: "open" }), { status: 200 }),
    );
    await req("POST", "/portal/api/subscribe", { plan: "monthly", email: "subscribe-default@test.com" });
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const sent = JSON.parse(String(init.body)) as { amount_total_minor: number; metadata: { plan_id: string } };
    expect(sent.amount_total_minor).toBe(2900); // Starter
    expect(sent.metadata.plan_id).toBe("starter");
  });

  it("never reaches the real network — fetch is mocked", async () => {
    expect(vi.isMockFunction(globalThis.fetch)).toBe(true);
  });
});

// ─── Email case normalization (account creation) ────────────────

describe("POST /v1/accounts — email case normalization", () => {
  it("rejects account creation when an email differs only by case", async () => {
    await createAccount("dupe-case@test.com");
    const r = await req("POST", "/v1/accounts", { name: "Dupe", email: "DUPE-CASE@test.com" });
    expect(r.status).toBe(409);
  });

  it("stores mixed-case signup emails lowercased", async () => {
    const account = await createAccount("Mixed-Signup@Test.COM");
    expect(account.email).toBe("mixed-signup@test.com");
    expect((await getAccountByEmail("mixed-signup@test.com"))?.account_id).toBe(account.account_id);
  });
});

// ─── GET /portal/api/paid/config ────────────────────────────────

describe("GET /portal/api/paid/config", () => {
  it("reports configured when base URL + merchant + api key are present", async () => {
    const r = await req("GET", "/portal/api/paid/config");
    expect(r.status).toBe(200);
    expect(r.data.configured).toBe(true);
  });

  it("reports not configured when the API key is missing", async () => {
    vi.stubEnv("PAID_API_KEY", undefined);
    const r = await req("GET", "/portal/api/paid/config");
    expect(r.status).toBe(200);
    expect(r.data.configured).toBe(false);
  });

  it("does NOT require a Stripe publishable key or API secret (PAI'D hosts the page, bearer auth)", async () => {
    vi.stubEnv("PAID_STRIPE_PUBLISHABLE_KEY", undefined);
    vi.stubEnv("PAID_API_SECRET", undefined);
    const r = await req("GET", "/portal/api/paid/config");
    expect(r.status).toBe(200);
    expect(r.data.configured).toBe(true);
  });

  it("reports unconfigured (only { configured: false }) when nothing is set", async () => {
    vi.stubEnv("PAID_API_BASE_URL", undefined);
    vi.stubEnv("PAID_MERCHANT_ID", undefined);
    vi.stubEnv("PAID_API_KEY", undefined);
    const r = await req("GET", "/portal/api/paid/config");
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ configured: false });
  });

  it("never leaks key material in the response body", async () => {
    const r = await req("GET", "/portal/api/paid/config");
    const serialized = JSON.stringify(r.data);
    expect(serialized).not.toContain("sk_live_test"); // PAID_API_KEY
    expect(serialized).not.toContain("paid_secret_test_value"); // PAID_API_SECRET
    expect(serialized).not.toContain(SIGNING_KEY); // PAID_WEBHOOK_SIGNING_KEY
  });
});

// ─── POST /portal/api/paid/webhook ──────────────────────────────

describe("POST /portal/api/paid/webhook", () => {
  it("rejects requests without signature", async () => {
    const body = JSON.stringify({ type: "subscription.created", data: { object: {} } });
    const r = await req("POST", "/portal/api/paid/webhook", body);
    expect(r.status).toBe(401);
  });

  it("rejects bad signature", async () => {
    const body = JSON.stringify({ type: "subscription.created", data: { object: {} } });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": "t=1,v1=badhex" });
    expect(r.status).toBe(401);
  });

  it("returns 200 + handled:false on unknown event", async () => {
    const body = JSON.stringify({ type: "something.weird", data: { object: {} } });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(false);
  });

  it("upgrades account to paid on subscription.created", async () => {
    await createAccount("upgrade@test.com");
    const body = JSON.stringify({
      type: "subscription.created",
      data: { object: { customer_email: "upgrade@test.com", id: "sub_up" } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(r.status).toBe(200);
    expect(r.data.tier_change).toBe(true);
    const acct = await getAccountByEmail("upgrade@test.com");
    expect(acct?.tier).toBe("paid");
  });

  it("downgrades account to free on subscription.canceled", async () => {
    await createAccount("downgrade@test.com");
    // First upgrade
    const upBody = JSON.stringify({
      type: "subscription.created",
      data: { object: { customer_email: "downgrade@test.com", id: "sub_dn" } },
    });
    await req("POST", "/portal/api/paid/webhook", upBody, { "paid-signature": signPaid(upBody) });
    expect((await getAccountByEmail("downgrade@test.com"))?.tier).toBe("paid");

    const cancelBody = JSON.stringify({
      type: "subscription.canceled",
      data: { object: { customer_email: "downgrade@test.com", id: "sub_dn" } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", cancelBody, { "paid-signature": signPaid(cancelBody) });
    expect(r.status).toBe(200);
    expect(r.data.tier_change).toBe(true);
    expect((await getAccountByEmail("downgrade@test.com"))?.tier).toBe("free");
  });

  it("no-op when event known but account already on target tier", async () => {
    await createAccount("noop@test.com");
    const body = JSON.stringify({
      type: "subscription.canceled",
      data: { object: { customer_email: "noop@test.com", id: "sub_noop" } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(r.status).toBe(200);
    expect(r.data.tier_change).toBe(false);
  });

  it("upgrades when the webhook echoes the email with different casing", async () => {
    await createAccount("case-echo@test.com");
    const body = JSON.stringify({
      type: "subscription.created",
      data: { object: { customer_email: "Case-Echo@Test.COM", id: "sub_case_up" } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);
    expect(r.data.tier_change).toBe(true);
    expect((await getAccountByEmail("case-echo@test.com"))?.tier).toBe("paid");
  });

  it("downgrades on subscription.canceled with a case-mismatched email", async () => {
    // Account signed up with mixed case (stored lowercase), webhook echoes upper case
    await createAccount("Case-Cancel@Test.com");
    const upBody = JSON.stringify({
      type: "subscription.created",
      data: { object: { customer_email: "case-cancel@test.com", id: "sub_case_dn" } },
    });
    await req("POST", "/portal/api/paid/webhook", upBody, { "paid-signature": signPaid(upBody) });
    expect((await getAccountByEmail("case-cancel@test.com"))?.tier).toBe("paid");

    const cancelBody = JSON.stringify({
      type: "subscription.canceled",
      data: { object: { customer_email: "CASE-CANCEL@TEST.COM", id: "sub_case_dn" } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", cancelBody, { "paid-signature": signPaid(cancelBody) });
    expect(r.status).toBe(200);
    expect(r.data.tier_change).toBe(true);
    expect((await getAccountByEmail("case-cancel@test.com"))?.tier).toBe("free");
  });

  it("asks PAI'D to retry (503) when the account doesn't exist yet", async () => {
    // A payment can arrive before/around signup. Returning 2xx would make PAI'D
    // stop retrying and strand a paid buyer on free — so we return a retryable 503.
    const body = JSON.stringify({
      type: "subscription.created",
      data: { object: { customer_email: "ghost@test.com", id: "sub_g" } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(r.status).toBe(503);
  });

  it("is idempotent — a redelivered tier webhook does not double-apply", async () => {
    await createAccount("idem-sub@test.com");
    const body = JSON.stringify({
      type: "subscription.created",
      data: { object: { customer_email: "idem-sub@test.com", id: "sub_idem" } },
    });
    const first = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(first.status).toBe(200);
    expect(first.data.tier_change).toBe(true);
    // Redelivery of the same event: the compare-and-set finds the account already
    // at the target tier and no-ops — no second tier change is applied or logged.
    const second = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(second.status).toBe(200);
    expect(second.data.tier_change).toBe(false);
  });

  it("rejects a stale signature timestamp with 401", async () => {
    const body = JSON.stringify({
      type: "subscription.created",
      data: { object: { customer_email: "stale@test.com", id: "sub_stale" } },
    });
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body, stale) });
    expect(r.status).toBe(401);
  });

  it("accepts a fresh signature timestamp within tolerance", async () => {
    const body = JSON.stringify({ type: "something.weird", data: { object: {} } });
    const fresh = Math.floor(Date.now() / 1000) - 60;
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body, fresh) });
    expect(r.status).toBe(200);
  });

  it("accepts the canonical Webhook-Signature header and fulfils checkout.session.completed", async () => {
    await createAccount("checkout-complete@test.com");
    const body = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_done",
          metadata: { user_email: "checkout-complete@test.com", plan_id: "starter", tier: "paid", kind: "subscription" },
        },
      },
    });
    // PAI'D sends the canonical `Webhook-Signature` header (not the legacy paid-signature)
    const r = await req("POST", "/portal/api/paid/webhook", body, { "Webhook-Signature": signPaid(body) });
    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);
    expect(r.data.tier_change).toBe(true);
    expect((await getAccountByEmail("checkout-complete@test.com"))?.tier).toBe("paid");
  });

  it("maps a growth checkout.session.completed to the suite tier", async () => {
    await createAccount("checkout-growth@test.com");
    const body = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_g",
          metadata: { user_email: "checkout-growth@test.com", plan_id: "growth", tier: "suite", kind: "subscription" },
        },
      },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "Webhook-Signature": signPaid(body) });
    expect(r.status).toBe(200);
    expect((await getAccountByEmail("checkout-growth@test.com"))?.tier).toBe("suite");
  });

  // ─── H-Phase-A cycle 1 — persist the specific marketed plan, not just the coarse tier ──
  it("persists paid_plan_id='pro' on a Pro checkout (Starter and Pro both map to the 'paid' tier alone)", async () => {
    const account = await createAccount("checkout-pro@test.com");
    const body = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_pro",
          metadata: { user_email: "checkout-pro@test.com", plan_id: "pro", tier: "paid", kind: "subscription" },
        },
      },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "Webhook-Signature": signPaid(body) });
    expect(r.status).toBe(200);
    expect((await getAccountByEmail("checkout-pro@test.com"))?.tier).toBe("paid");
    expect(await getAccountPaidPlanId(account.account_id as string)).toBe("pro");
  });

  it("persists paid_plan_id='starter' on a Starter checkout, distinct from a later Pro upgrade", async () => {
    const account = await createAccount("checkout-starter-then-pro@test.com");
    const starterBody = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_st",
          metadata: { user_email: "checkout-starter-then-pro@test.com", plan_id: "starter", tier: "paid", kind: "subscription" },
        },
      },
    });
    await req("POST", "/portal/api/paid/webhook", starterBody, { "Webhook-Signature": signPaid(starterBody) });
    expect(await getAccountPaidPlanId(account.account_id as string)).toBe("starter");

    // Starter -> Pro: the coarse tier stays "paid" throughout (tier_change: false
    // is expected), but paid_plan_id must still move to "pro" — this is exactly
    // the case where updateAccountTierIfCurrent's compare-and-set never fires.
    const proBody = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_st_to_pro",
          metadata: { user_email: "checkout-starter-then-pro@test.com", plan_id: "pro", tier: "paid", kind: "subscription" },
        },
      },
    });
    const r = await req("POST", "/portal/api/paid/webhook", proBody, { "Webhook-Signature": signPaid(proBody) });
    expect(r.status).toBe(200);
    expect(r.data.tier_change).toBe(false);
    expect((await getAccountByEmail("checkout-starter-then-pro@test.com"))?.tier).toBe("paid");
    expect(await getAccountPaidPlanId(account.account_id as string)).toBe("pro");
  });

  it("clears paid_plan_id when a Pro subscriber cancels back to free", async () => {
    const account = await createAccount("checkout-pro-cancel@test.com");
    const proBody = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_pro_cancel",
          metadata: { user_email: "checkout-pro-cancel@test.com", plan_id: "pro", tier: "paid", kind: "subscription" },
        },
      },
    });
    await req("POST", "/portal/api/paid/webhook", proBody, { "Webhook-Signature": signPaid(proBody) });
    expect(await getAccountPaidPlanId(account.account_id as string)).toBe("pro");

    const cancelBody = JSON.stringify({
      type: "subscription.canceled",
      data: { object: { customer_email: "checkout-pro-cancel@test.com", id: "sub_pro_cancel" } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", cancelBody, { "paid-signature": signPaid(cancelBody) });
    expect(r.status).toBe(200);
    expect((await getAccountByEmail("checkout-pro-cancel@test.com"))?.tier).toBe("free");
    expect(await getAccountPaidPlanId(account.account_id as string)).toBeNull();
  });
});

// H-Phase-A cycle 9: cycle 8 believed charge.refunded was already handled on
// "either webhook" — it only touched the DORMANT legacy stripe.ts path, never
// this LIVE one. Two tests: the best-guess named event, and a differently-
// named refund-shaped event (since PAI'D's exact refund event-type string is
// unconfirmed) to prove the case-insensitive substring catch-all works too.
describe("POST /portal/api/paid/webhook — refund observability", () => {
  it("handles the best-guess 'charge.refunded' event (not a silent no-op)", async () => {
    const body = JSON.stringify({
      type: "charge.refunded",
      data: { object: { id: "ch_paid_refund", payment_intent: "pi_paid_refund", customer_email: "refund@test.com", amount_refunded: 900, currency: "usd" } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "Webhook-Signature": signPaid(body) });
    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);
    expect(r.data.event).toBe("charge.refunded");
  });

  it("catches a differently-named refund event via the case-insensitive substring match", async () => {
    const body = JSON.stringify({
      type: "refund.created",
      data: { object: { id: "rf_paid_1", customer_email: "refund2@test.com", amount: 500, currency: "usd" } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "Webhook-Signature": signPaid(body) });
    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);
    expect(r.data.event).toBe("refund.created");
  });
});

// ─── Plan-aware tier mapping ────────────────────────────────────

describe("POST /portal/api/paid/webhook — plan-aware tier mapping", () => {
  it("maps a Pro plan id to the paid tier", async () => {
    await createAccount("pro-plan@test.com");
    const body = JSON.stringify({
      type: "subscription.created",
      data: { object: { customer_email: "pro-plan@test.com", id: "sub_pro", plan_id: "plan_m" } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(r.status).toBe(200);
    expect(r.data.tier_change).toBe(true);
    expect((await getAccountByEmail("pro-plan@test.com"))?.tier).toBe("paid");
  });

  it("maps a Growth plan id to the suite tier when env is set", async () => {
    vi.stubEnv("PAID_PLAN_GROWTH_MONTHLY", "plan_growth_m");
    await createAccount("growth-plan@test.com");
    const body = JSON.stringify({
      type: "subscription.created",
      data: { object: { customer_email: "growth-plan@test.com", id: "sub_gr", plan_id: "plan_growth_m" } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(r.status).toBe(200);
    expect(r.data.tier_change).toBe(true);
    expect((await getAccountByEmail("growth-plan@test.com"))?.tier).toBe("suite");
  });

  it("reads the plan id from price_id when plan_id is absent", async () => {
    vi.stubEnv("PAID_PLAN_GROWTH_ANNUAL", "plan_growth_a");
    await createAccount("growth-price@test.com");
    const body = JSON.stringify({
      type: "subscription.updated",
      data: { object: { customer_email: "growth-price@test.com", id: "sub_gp", price_id: "plan_growth_a" } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(r.status).toBe(200);
    expect((await getAccountByEmail("growth-price@test.com"))?.tier).toBe("suite");
  });

  it("falls back to paid with a warn log on unknown plan id", async () => {
    vi.stubEnv("AXIS_ENABLE_TEST_LOGS", "1");
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await createAccount("unknown-plan@test.com");
    const body = JSON.stringify({
      type: "subscription.created",
      data: { object: { customer_email: "unknown-plan@test.com", id: "sub_uk", plan_id: "plan_does_not_exist" } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(r.status).toBe(200);
    expect((await getAccountByEmail("unknown-plan@test.com"))?.tier).toBe("paid");
    const lines = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(lines).toContain("defaulting tier to paid");
    expect(lines).toContain("plan_does_not_exist");
  });

  // ─── H-Phase-A cycle 3: subscription.updated can now change paid_plan_id ──
  //
  // Starter and Pro both collapse into the coarse "paid" tier, so a plan
  // switch delivered via subscription.updated (not checkout.session.completed)
  // previously had NO path to update accounts.paid_plan_id at all —
  // resolvePlanForAccount would keep metering the account at whichever plan
  // it started at, indefinitely, regardless of what they actually pay for.
  it("a subscription.updated event with a recognized Starter price id sets paid_plan_id to starter", async () => {
    vi.stubEnv("PAID_PLAN_STARTER_MONTHLY", "plan_starter_m");
    const account = await createAccount("sub-updated-starter@test.com");
    await updateAccountPaidPlanId(account.account_id as string, "pro"); // simulate a prior Pro plan on record
    const body = JSON.stringify({
      type: "subscription.updated",
      data: { object: { customer_email: "sub-updated-starter@test.com", id: "sub_su1", plan_id: "plan_starter_m" } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(r.status).toBe(200);
    expect(await getAccountPaidPlanId(account.account_id as string)).toBe("starter");
  });

  it("a subscription.updated event with a recognized Pro price id sets paid_plan_id to pro (no tier change, since Starter and Pro are both 'paid')", async () => {
    vi.stubEnv("PAID_PLAN_STARTER_MONTHLY", "plan_starter_m2");
    vi.stubEnv("PAID_PLAN_PRO_MONTHLY", "plan_pro_m");
    const account = await createAccount("sub-updated-pro@test.com");
    // Get the account onto Starter first (free -> paid, a real tier change) so
    // the Pro event below is a same-tier plan switch, not the account's first
    // ever upgrade — the scenario this fix actually targets.
    const starterBody = JSON.stringify({
      type: "subscription.updated",
      data: { object: { customer_email: "sub-updated-pro@test.com", id: "sub_su2a", plan_id: "plan_starter_m2" } },
    });
    await req("POST", "/portal/api/paid/webhook", starterBody, { "paid-signature": signPaid(starterBody) });
    expect(await getAccountPaidPlanId(account.account_id as string)).toBe("starter");

    const body = JSON.stringify({
      type: "subscription.updated",
      data: { object: { customer_email: "sub-updated-pro@test.com", id: "sub_su2b", plan_id: "plan_pro_m" } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(r.status).toBe(200);
    // tier_change is false — Starter and Pro both map to "paid" — but
    // paid_plan_id must still move, which is the whole point of this fix.
    expect(r.data.tier_change).toBe(false);
    expect((await getAccountByEmail("sub-updated-pro@test.com"))?.tier).toBe("paid");
    expect(await getAccountPaidPlanId(account.account_id as string)).toBe("pro");
  });

  it("an unrecognized price id on subscription.updated leaves the previously-recorded plan_id untouched", async () => {
    const account = await createAccount("sub-updated-unknown@test.com");
    await updateAccountPaidPlanId(account.account_id as string, "pro");
    const body = JSON.stringify({
      type: "subscription.updated",
      data: { object: { customer_email: "sub-updated-unknown@test.com", id: "sub_su3", plan_id: "plan_never_configured" } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(r.status).toBe(200);
    expect(await getAccountPaidPlanId(account.account_id as string)).toBe("pro");
  });
});

describe("POST /portal/api/paid/webhook — credit-pack top-ups", () => {
  it("grants credits once on checkout.session.completed and is idempotent", async () => {
    const acct = await createAccount("topup-webhook@test.com");
    const accountId = acct.account_id as string;
    await recordPendingPurchase({
      account_id: accountId,
      pack_id: "pack_100",
      credits: 100,
      price_cents: 500,
      paid_session_id: "cs_topup_1",
    });
    expect(await getPersistenceBalance(accountId)).toBe(0);

    const body = JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { id: "cs_topup_1", payment_intent: "pi_topup_1", metadata: { type: "axis_credit_topup" } } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(r.status).toBe(200);
    expect(r.data.credit_topup).toBe(true);
    expect(r.data.credits).toBe(100);
    expect(await getPersistenceBalance(accountId)).toBe(100);

    // Webhook retry — no second grant.
    const again = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(again.status).toBe(200);
    expect(again.data.credit_topup).toBe(false);
    expect(await getPersistenceBalance(accountId)).toBe(100);
  });

  it("leaves the account tier unchanged for a topup event", async () => {
    const acct = await createAccount("topup-tier@test.com");
    await recordPendingPurchase({
      account_id: acct.account_id as string,
      pack_id: "pack_500",
      credits: 500,
      price_cents: 2000,
      paid_session_id: "cs_topup_2",
    });
    const body = JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { id: "cs_topup_2", metadata: { type: "axis_credit_topup" } } },
    });
    const r = await req("POST", "/portal/api/paid/webhook", body, { "paid-signature": signPaid(body) });
    expect(r.data.tier_change).toBeUndefined();
    expect((await getAccountByEmail("topup-tier@test.com"))?.tier).toBe("free");
  });
});
