/**
 * eq_171: Stripe handler branch coverage — targets all branches
 * in stripe.ts (handleCancelSubscription, syncTierFromStripeSubscription,
 * verifyStripeSignature edge cases). handleCreateCheckout was removed in
 * H-Phase-A cycle 11 — see the "handleCreateCheckout branches" comment
 * below for where its describe block used to live.
 * Uses vi.stubGlobal('fetch') to mock Stripe API responses.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import {
  resetTestDb,
  sql,
  createAccount,
  createApiKey,
  upsertSubscription,
  getAccount,
  getSubscription,
  setEmailProvider,
  type EmailMessage,
} from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer, waitForSpyCall } from "./test-helpers.js";
import { handleCreateAccount } from "./billing.js";
import {
  handleStripeWebhook,
  handleGetSubscription,
  handleCancelSubscription,
} from "./stripe.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;
const WEBHOOK_SECRET = "test_webhook_secret_eq171";

// ─── HTTP helper ────────────────────────────────────────────────

interface Res { status: number; headers: Record<string, string>; data: Record<string, unknown> }

async function req(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<Res> {
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
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === "string") h[k] = v;
          }
          resolve({ status: res.statusCode ?? 0, headers: h, data: data as Record<string, unknown> });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function signStripePayload(payload: string, ts: number = Math.floor(Date.now() / 1000)): string {
  const hmac = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${payload}`).digest("hex");
  return `t=${ts},v1=${hmac}`;
}

// ─── Server setup ───────────────────────────────────────────────

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.STRIPE_PRICE_ID_PAID = "price_paid_171";
  process.env.STRIPE_PRICE_ID_SUITE = "price_suite_171";
  process.env.STRIPE_SECRET_KEY = "sk_test_171";

  const router = new Router();
  router.post("/v1/accounts", handleCreateAccount);
  router.post("/v1/webhooks/stripe", handleStripeWebhook);
  router.get("/v1/account/subscription", handleGetSubscription);
  router.post("/v1/account/subscription/cancel", handleCancelSubscription);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_ID_PAID;
  delete process.env.STRIPE_PRICE_ID_SUITE;
  delete process.env.STRIPE_SECRET_KEY;
});

beforeEach(() => {
  resetRateLimits();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────

function buildCheckoutEvent(accountId: string, subscriptionId: string, tier = "paid") {
  return {
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${subscriptionId}`,
        subscription: subscriptionId,
        customer: `cus_${subscriptionId}`,
        client_reference_id: accountId,
        metadata: { account_id: accountId, tier },
      },
    },
  };
}

function buildSubscriptionEvent(
  eventType: string,
  subscriptionId: string,
  accountId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    type: eventType,
    data: {
      object: {
        id: subscriptionId,
        customer: `cus_${subscriptionId}`,
        status: "active",
        items: {
          data: [{ price: { id: "price_paid_171" } }],
        },
        current_period_start: 1735689600,
        current_period_end: 1738368000,
        cancel_at: null,
        metadata: { account_id: accountId },
        ...overrides,
      },
    },
  };
}

async function seedSubscription(accountId: string, subscriptionId: string, priceId = "price_paid_171") {
  await upsertSubscription({
    subscription_id: subscriptionId,
    customer_id: `cus_${subscriptionId}`,
    account_id: accountId,
    price_id: priceId,
    status: "active",
    current_period_start: "2025-01-01T00:00:00Z",
    current_period_end: "2025-02-01T00:00:00Z",
    card_brand: "visa",
    card_last_four: "4242",
    cancel_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

// H8.1b: fake timers freeze setTimeout, but the real DB/socket I/O that runs
// BEFORE a timed fetch call (auth, readBody, DB lookups) still needs real
// event-loop turns to complete. Poll via a REAL setImmediate (not faked —
// only setTimeout/clearTimeout are) until the fetch stub has actually been
// invoked, so its AbortController's setTimeout is guaranteed to already be
// registered before the fake clock gets advanced past it.
// Bounded by real wall-clock, not a tick count — see waitForSpyCall's comment
// in test-helpers.ts for why the tick-counting version raced under load.
async function waitForFetchCall(spy: { mock: { calls: unknown[][] } }, calls: number): Promise<void> {
  await waitForSpyCall(spy, calls, { tick: () => vi.advanceTimersByTimeAsync(0) });
}

// H-Phase-A cycle 11: the "handleCreateCheckout branches" describe block
// (all 12 tests) was removed along with handleCreateCheckout itself — see
// stripe.ts's own removal comment at the old POST /v1/checkout site.

// ─── 2. handleCancelSubscription — all branches ────────────────

describe("handleCancelSubscription branches", () => {
  it("successfully cancels subscription via Stripe API", async () => {
    const account = await createAccount("Cancel OK", "cancel-ok-171@test.com", "paid");
    const { rawKey } = await createApiKey(account.account_id, "test");

    await seedSubscription(account.account_id, "sub_cancel_ok_171");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true }));

    const r = await req("POST", "/v1/account/subscription/cancel", undefined, {
      Authorization: `Bearer ${rawKey}`,
    });

    expect(r.status).toBe(200);
    expect(r.data.subscription_id).toBe("sub_cancel_ok_171");
    expect(r.data.status).toBe("cancellation_requested");
    expect(r.data.message).toContain("end of the current billing period");

    // H0.4: the subscription-update call pins the API version too.
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Stripe-Version"]).toBe("2026-06-24.dahlia");
    // H0.6: idempotent cancel — a retried request reuses the same key.
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/\S/);
  });

  it("returns 502 when Stripe API returns non-ok for cancel", async () => {
    const account = await createAccount("Cancel Fail", "cancel-fail-171@test.com", "paid");
    const { rawKey } = await createApiKey(account.account_id, "test");

    await upsertSubscription({
      subscription_id: "sub_cancel_fail_171",
      customer_id: "cust_fail",
      account_id: account.account_id,
      price_id: "price_paid_171",
      status: "active",
      current_period_start: "2025-01-01T00:00:00Z",
      current_period_end: "2025-02-01T00:00:00Z",
      card_brand: null,
      card_last_four: null,
      cancel_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
    }));

    const r = await req("POST", "/v1/account/subscription/cancel", undefined, {
      Authorization: `Bearer ${rawKey}`,
    });

    expect(r.status).toBe(502);
    expect(r.data.error).toContain("Stripe API error");
  });

  it("returns 502 when cancel fetch throws network error", async () => {
    const account = await createAccount("Cancel Net", "cancel-net-171@test.com", "paid");
    const { rawKey } = await createApiKey(account.account_id, "test");

    await upsertSubscription({
      subscription_id: "sub_cancel_net_171",
      customer_id: "cust_net",
      account_id: account.account_id,
      price_id: "price_paid_171",
      status: "active",
      current_period_start: "2025-01-01T00:00:00Z",
      current_period_end: "2025-02-01T00:00:00Z",
      card_brand: null,
      card_last_four: null,
      cancel_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("Connection timeout")));

    const r = await req("POST", "/v1/account/subscription/cancel", undefined, {
      Authorization: `Bearer ${rawKey}`,
    });

    expect(r.status).toBe(502);
    expect(r.data.error).toContain("Failed to cancel subscription");
    expect(r.data.error).toContain("Connection timeout");
  });

  it("returns 502 when the cancel-subscription call times out (H8.1b)", async () => {
    const account = await createAccount("Cancel Timeout", "cancel-timeout-171@test.com", "paid");
    const { rawKey } = await createApiKey(account.account_id, "test");

    await upsertSubscription({
      subscription_id: "sub_cancel_timeout_171",
      customer_id: "cust_timeout",
      account_id: account.account_id,
      price_id: "price_paid_171",
      status: "active",
      current_period_start: "2025-01-01T00:00:00Z",
      current_period_end: "2025-02-01T00:00:00Z",
      card_brand: null,
      card_last_four: null,
      cancel_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Never resolves/rejects on its own — only reacts to the AbortController's
    // signal, exactly like a real stalled connection would once fetch's
    // internals observe the abort. Restored in the finally below — unlike the
    // one-time mocks elsewhere in this file, a leftover never-resolving stub
    // would hang every LATER test that doesn't stub fetch itself.
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const abortErr = new Error("This operation was aborted");
          abortErr.name = "AbortError";
          reject(abortErr);
        });
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const reqPromise = req("POST", "/v1/account/subscription/cancel", undefined, {
        Authorization: `Bearer ${rawKey}`,
      });

      // Let real I/O (auth, DB lookups) reach the fetch() call before
      // advancing the fake clock past its timeout.
      await waitForFetchCall(fetchSpy, 1);
      // Fire the 15s CANCEL_SUBSCRIPTION_TIMEOUT_MS.
      await vi.advanceTimersByTimeAsync(15_000);
      const r = await reqPromise;

      // Same externally-visible result as any other fetch rejection at this site.
      expect(r.status).toBe(502);
      expect(r.data.error).toContain("Failed to cancel subscription");
      expect(r.data.error).toContain("aborted");
    } finally {
      vi.useRealTimers();
      vi.stubGlobal("fetch", realFetch);
    }
  });

  it("returns 503 when Stripe secret key not configured for cancel", async () => {
    const account = await createAccount("Cancel No Key", "cancel-nokey-171@test.com", "paid");
    const { rawKey } = await createApiKey(account.account_id, "test");

    await upsertSubscription({
      subscription_id: "sub_cancel_nokey_171",
      customer_id: "cust_nokey",
      account_id: account.account_id,
      price_id: "price_paid_171",
      status: "active",
      current_period_start: "2025-01-01T00:00:00Z",
      current_period_end: "2025-02-01T00:00:00Z",
      card_brand: null,
      card_last_four: null,
      cancel_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const savedKey = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;

    const r = await req("POST", "/v1/account/subscription/cancel", undefined, {
      Authorization: `Bearer ${rawKey}`,
    });

    expect(r.status).toBe(503);
    expect(r.data.error).toContain("not configured");

    process.env.STRIPE_SECRET_KEY = savedKey;
  });
});

// ─── 3. syncTierFromStripeSubscription branches ─────────────────

describe("syncTierFromStripeSubscription via webhook", () => {
  it("upgrades to paid tier on checkout.session.completed", async () => {
    const account = await createAccount("Upgrade Paid", "upgrade-paid-171@test.com", "free");

    const payload = JSON.stringify(buildCheckoutEvent(account.account_id, "sub_upgrade_paid_171", "paid"));
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);

    const updated = await getAccount(account.account_id);
    expect(updated!.tier).toBe("paid");
  });

  it("upgrades to suite tier on checkout.session.completed", async () => {
    const account = await createAccount("Suite Upgrade", "suite-upgrade-171@test.com", "paid");

    const emails: EmailMessage[] = [];
    setEmailProvider(async (msg) => {
      emails.push(msg);
      return { provider_id: `test-${Date.now()}` };
    });

    const payload = JSON.stringify(buildCheckoutEvent(account.account_id, "sub_suite_upgrade_171", "suite"));
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    const updated = await getAccount(account.account_id);
    expect(updated!.tier).toBe("suite");

    await new Promise((r) => setTimeout(r, 50));
    const upgradeEmail = emails.find((e) => e.template === "upgrade_confirmation");
    expect(upgradeEmail).toBeDefined();
    expect(upgradeEmail!.variables.tier_name).toBe("Growth");

    setEmailProvider(null as unknown as import("@axis/snapshots").EmailProvider);
  });

  it("downgrades to free on customer.subscription.deleted", async () => {
    const account = await createAccount("Downgrade Delete", "downgrade-delete-171@test.com", "paid");
    await seedSubscription(account.account_id, "sub_downgrade_delete_171");

    const payload = JSON.stringify(
      buildSubscriptionEvent("customer.subscription.deleted", "sub_downgrade_delete_171", account.account_id, {
        status: "canceled",
      }),
    );
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);

    const updated = await getAccount(account.account_id);
    expect(updated!.tier).toBe("free");
  });

  it("downgrades to free on unpaid subscription", async () => {
    const account = await createAccount("Downgrade Unpaid", "downgrade-unpaid-171@test.com", "paid");
    await seedSubscription(account.account_id, "sub_downgrade_unpaid_171");

    const payload = JSON.stringify(
      buildSubscriptionEvent("customer.subscription.updated", "sub_downgrade_unpaid_171", account.account_id, {
        status: "unpaid",
      }),
    );
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    const updated = await getAccount(account.account_id);
    expect(updated!.tier).toBe("free");
  });

  it("keeps current tier on past_due status", async () => {
    const account = await createAccount("Past Due Keep", "past-due-keep-171@test.com", "paid");
    await seedSubscription(account.account_id, "sub_past_due_keep_171");

    const payload = JSON.stringify(
      buildSubscriptionEvent("customer.subscription.updated", "sub_past_due_keep_171", account.account_id, {
        status: "past_due",
      }),
    );
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    const updated = await getAccount(account.account_id);
    expect(updated!.tier).toBe("paid"); // No change for past_due
  });

  it("does not change tier when already at target", async () => {
    const account = await createAccount("Same Tier", "same-tier-171@test.com", "paid");
    await seedSubscription(account.account_id, "sub_same_tier_171");

    const payload = JSON.stringify(
      buildSubscriptionEvent("customer.subscription.updated", "sub_same_tier_171", account.account_id),
    );
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    const updated = await getAccount(account.account_id);
    expect(updated!.tier).toBe("paid"); // No change
  });

  it("ignores unknown price_id (no tier change)", async () => {
    const account = await createAccount("Unknown Price", "unknown-price-171@test.com", "free");
    await seedSubscription(account.account_id, "sub_unknown_price_171", "price_unknown");

    const payload = JSON.stringify(
      buildSubscriptionEvent("customer.subscription.updated", "sub_unknown_price_171", account.account_id, {
        items: { data: [{ price: { id: "price_does_not_exist" } }] },
      }),
    );
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    const updated = await getAccount(account.account_id);
    expect(updated!.tier).toBe("free"); // No change
  });

  it("preserves created_at on subscription update", async () => {
    const account = await createAccount("Preserve Created", "preserve-created-171@test.com", "free");
    await seedSubscription(account.account_id, "sub_preserve_171");

    const originalSub = await getSubscription("sub_preserve_171");
    const originalCreatedAt = originalSub!.created_at;

    // Small delay to ensure updated_at would differ
    await new Promise((r) => setTimeout(r, 10));

    const payload = JSON.stringify(
      buildSubscriptionEvent("customer.subscription.updated", "sub_preserve_171", account.account_id),
    );
    await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    const updated = await getSubscription("sub_preserve_171");
    expect(updated!.created_at).toBe(originalCreatedAt);
  });

  it("handles invoice.payment_failed — marks subscription past_due", async () => {
    const account = await createAccount("Invoice Fail", "invoice-fail-171@test.com", "paid");
    await seedSubscription(account.account_id, "sub_invoice_fail_171");

    const payload = JSON.stringify({
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_fail_171",
          subscription: "sub_invoice_fail_171",
          customer: `cus_sub_invoice_fail_171`,
        },
      },
    });
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);

    const updated = await getSubscription("sub_invoice_fail_171");
    expect(updated!.status).toBe("past_due");
  });

  it("handles checkout.session.completed with no subscription ID gracefully", async () => {
    const account = await createAccount("No Sub ID", "no-sub-id-171@test.com", "free");

    const payload = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_nosub",
          // subscription is missing
          customer: "cus_nosub",
          client_reference_id: account.account_id,
          metadata: { tier: "paid" },
        },
      },
    });
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);
  });
});

// ─── 4. Webhook edge cases ──────────────────────────────────────

describe("webhook edge cases", () => {
  it("returns 503 when webhook secret env not configured", async () => {
    const saved = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const r = await req("POST", "/v1/webhooks/stripe", JSON.stringify({ test: true }));
    expect(r.status).toBe(503);
    expect(r.data.error).toContain("webhook secret not configured");

    process.env.STRIPE_WEBHOOK_SECRET = saved;
  });

  it("returns 400 on invalid JSON with valid signature", async () => {
    const invalidJson = "not json {{{";
    const sig = signStripePayload(invalidJson);

    const r = await req("POST", "/v1/webhooks/stripe", invalidJson, {
      "stripe-signature": sig,
    });

    expect(r.status).toBe(400);
  });

  it("rejects signature with missing v1 field", async () => {
    const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: {} } });
    const ts = Math.floor(Date.now() / 1000);

    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": `t=${ts}`,  // missing v1=
    });

    expect(r.status).toBe(401);
  });

  it("rejects stale signature (>5 min old)", async () => {
    const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: {} } });
    const staleTs = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago
    const hmac = createHmac("sha256", WEBHOOK_SECRET).update(`${staleTs}.${payload}`).digest("hex");
    const staleSig = `t=${staleTs},v1=${hmac}`;

    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": staleSig,
    });

    expect(r.status).toBe(401);
  });

  it("accepts a signature aged EXACTLY 300s — the boundary is age > 300, not age >= 300 (H8.3 mutation-lite)", async () => {
    // Freeze only Date (not setTimeout/etc — the real HTTP roundtrip stays on real
    // timers) at an exact whole-second boundary, so `age` computes to EXACTLY 300
    // with no sub-millisecond flake. At age===300, `age > 300` is false (accept,
    // falls through to a real HMAC check that succeeds) but a reintroduced
    // `age >= 300` mutant would reject with 401 — the only point where the two
    // operators diverge.
    const fixedNowMs = Math.floor(Date.now() / 1000) * 1000;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(fixedNowMs);
    try {
      const payload = JSON.stringify({ type: "payment_intent.created", data: { object: {} } });
      const exactBoundaryTs = fixedNowMs / 1000 - 300;
      const sig = signStripePayload(payload, exactBoundaryTs);
      const r = await req("POST", "/v1/webhooks/stripe", payload, { "stripe-signature": sig });
      expect(r.status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns handled:false for customer.subscription.created with no known account", async () => {
    const payload = JSON.stringify({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_orphan_171",
          customer: "cus_orphan",
          status: "active",
          items: { data: [{ price: { id: "price_paid_171" } }] },
          current_period_start: 1735689600,
          current_period_end: 1738368000,
          cancel_at: null,
          metadata: {}, // no account_id
        },
      },
    });
    const sig = signStripePayload(payload);

    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": sig,
    });

    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(false);
  });
});

// ─── 5. Additional branch coverage ─────────────────────────────

describe("additional branch coverage", () => {
  it("returns 401 when stripe-signature header is absent (covers !sigHeader TRUE)", async () => {
    const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: {} } });
    // Deliberately omit the stripe-signature header
    const r = await req("POST", "/v1/webhooks/stripe", payload, {});
    expect(r.status).toBe(401);
  });

  it("returns 401 when v1 HMAC is wrong but has correct format (covers timingSafeEqual false path)", async () => {
    const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: {} } });
    const ts = Math.floor(Date.now() / 1000);
    // 64-char hex string (32 bytes) — correct length for SHA-256 but wrong value
    const wrongSig = `t=${ts},v1=${"0".repeat(64)}`;
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": wrongSig,
    });
    expect(r.status).toBe(401);
  });

  it("tsToISO returns null when ts === 0 (covers ts===0 branch)", async () => {
    const account = await createAccount("TS Zero", "ts-zero-branches@test.com", "free");
    await seedSubscription(account.account_id, "sub_tszero_branches");

    const payload = JSON.stringify(
      buildSubscriptionEvent("customer.subscription.updated", "sub_tszero_branches", account.account_id, {
        current_period_start: 0,
        current_period_end: 0,
        cancel_at: 0,
      }),
    );
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    const sub = await getSubscription("sub_tszero_branches");
    expect(sub!.current_period_start).toBeNull();
    expect(sub!.current_period_end).toBeNull();
    expect(sub!.cancel_at).toBeNull();
  });

  it("checkout session resolved via metadata.account_id (no client_reference_id)", async () => {
    const account = await createAccount("Meta Only", "meta-only-branches@test.com", "free");

    const payload = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_meta_only_branch",
          subscription: "sub_meta_only_branch",
          customer: "cus_meta_only_branch",
          // No client_reference_id — falls back to metadata.account_id
          metadata: { account_id: account.account_id, tier: "paid" },
        },
      },
    });
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    const updated = await getAccount(account.account_id);
    expect(updated!.tier).toBe("paid");
  });

  it("checkout session with no accountId anywhere is a no-op (covers !accountId TRUE)", async () => {
    const payload = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_no_acct_branch",
          subscription: "sub_no_acct_branch",
          customer: "cus_no_acct_branch",
          // No client_reference_id, no metadata.account_id
          metadata: {},
        },
      },
    });
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    // handled is true (event type is handled); function simply returned early
    expect(r.data.handled).toBe(true);
  });

  it("checkout suite tier with STRIPE_PRICE_ID_SUITE unset → priceId='' → no tier sync", async () => {
    const account = await createAccount("Suite No Env", "suite-noenv-branches@test.com", "free");

    const savedSuite = process.env.STRIPE_PRICE_ID_SUITE;
    delete process.env.STRIPE_PRICE_ID_SUITE;

    const payload = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_suite_noenv_branch",
          subscription: "sub_suite_noenv_branch",
          customer: "cus_suite_noenv_branch",
          client_reference_id: account.account_id,
          metadata: { account_id: account.account_id, tier: "suite" },
        },
      },
    });
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    // priceId is "" so syncTier is skipped — tier stays free
    const updated = await getAccount(account.account_id);
    expect(updated!.tier).toBe("free");

    process.env.STRIPE_PRICE_ID_SUITE = savedSuite;
  });

  it("checkout with unknown tier → priceId='' → no tier sync", async () => {
    const account = await createAccount("Unknown Tier WH", "unknown-tier-wh-branches@test.com", "free");

    const payload = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_unknown_tier_branch",
          subscription: "sub_unknown_tier_branch",
          customer: "cus_unknown_tier_branch",
          client_reference_id: account.account_id,
          metadata: { account_id: account.account_id, tier: "unknown" },
        },
      },
    });
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    const updated = await getAccount(account.account_id);
    expect(updated!.tier).toBe("free"); // No change for unknown tier
  });

  it("invoice.payment_failed with no subscription field is a no-op (covers !subscriptionId TRUE)", async () => {
    const payload = JSON.stringify({
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_no_sub_branch",
          // No subscription field
          customer: "cus_no_sub_branch",
        },
      },
    });
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    // handler returns early since subscriptionId is undefined
    expect(r.data.handled).toBe(true);
  });

  it("subscription.created with metadata account_id and no existing DB record (covers metadata fallback + new created_at)", async () => {
    const account = await createAccount("Meta Fallback New", "meta-fallback-new-branches@test.com", "free");
    // Do NOT seed a subscription — new sub, no existing DB record

    const payload = JSON.stringify({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_meta_new_branch",
          customer: "cus_meta_new_branch",
          status: "active",
          items: { data: [{ price: { id: "price_paid_171" } }] },
          current_period_start: 1735689600,
          current_period_end: 1738368000,
          cancel_at: null,
          metadata: { account_id: account.account_id }, // resolved from metadata
        },
      },
    });
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);

    const updated = await getAccount(account.account_id);
    expect(updated!.tier).toBe("paid");

    const sub = await getSubscription("sub_meta_new_branch");
    expect(sub).not.toBeNull();
    expect(sub!.account_id).toBe(account.account_id);
  });

  it("signature with a segment missing '=' covers idx>0 FALSE branch", async () => {
    const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: {} } });
    const ts = Math.floor(Date.now() / 1000);
    const hmac = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${payload}`).digest("hex");
    // Insert a key-less segment "garbage" in the middle — indexOf("=") = -1, not > 0
    const sig = `t=${ts},garbage,v1=${hmac}`;
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": sig,
    });
    // Signature is still valid (t= and v1= are correctly parsed around the garbage segment)
    expect(r.status).toBe(200);
  });

  it("rejects a v1 that only 'matches' when a missing timestamp is coerced to the literal string 'undefined' (H8.3 mutation-lite: proves !timestamp||!v1 needs OR, not AND)", async () => {
    // Omit t= entirely. If the guard were `!timestamp && !v1` instead of the real
    // `!timestamp || !v1`, a present-v1-but-missing-t request would NOT be rejected
    // early: Number(undefined) -> NaN, and `NaN > 300` is false, so the age check
    // never fires either. Execution would fall through to
    // `payload = \`${timestamp}.${rawBody}\`` with timestamp===undefined, which
    // template-literal-coerces to the literal string "undefined". Craft v1 as the
    // HMAC of exactly that string so an &&-mutant would wrongly ACCEPT this
    // signature (timingSafeEqual would see two equal buffers). The real `||` guard
    // must reject this on the missing-timestamp check alone, before any HMAC math.
    const payload = JSON.stringify({ type: "payment_intent.created", data: { object: {} } });
    const forgedV1 = createHmac("sha256", WEBHOOK_SECRET).update(`undefined.${payload}`).digest("hex");
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": `v1=${forgedV1}`, // no t= at all
    });
    expect(r.status).toBe(401);
  });

  it("checkout webhook for non-existent accountId with priceId set — hits !account return in syncTier", async () => {
    // Create account + subscription, then delete the account so syncTier finds no account
    const account = await createAccount("Ghost Acct", "ghost-acct-branches@test.com", "free");
    await seedSubscription(account.account_id, "sub_ghost_acct_branch");
    // Delete the account while its subscription still references it, so getAccount
    // returns null inside syncTierFromStripeSubscription. SET LOCAL
    // session_replication_role = replica disables FK triggers for this transaction;
    // the dedicated tx client guarantees the bypass and the DELETE share one connection.
    await sql.tx(async (c) => {
      await c.query("SET LOCAL session_replication_role = replica");
      await c.query("DELETE FROM accounts WHERE account_id = $1", [account.account_id]);
    });

    const payload = JSON.stringify(
      buildSubscriptionEvent("customer.subscription.updated", "sub_ghost_acct_branch", account.account_id),
    );
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);
    // No crash — syncTierFromStripeSubscription returned early since account was deleted
  });

  it("checkout webhook without metadata.tier → tier='' → priceId='' → no sync (covers meta?.tier ?? '' right side)", async () => {
    const account = await createAccount("No Tier Meta", "no-tier-meta-branches@test.com", "free");
    const payload = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_no_tier_meta",
          subscription: "sub_no_tier_meta",
          customer: "cus_no_tier_meta",
          client_reference_id: account.account_id,
          metadata: { account_id: account.account_id /* no tier key */ },
        },
      },
    });
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });
    expect(r.status).toBe(200);
    const updated = await getAccount(account.account_id);
    expect(updated!.tier).toBe("free"); // no priceId → tier unchanged
  });

  it("checkout webhook paid tier when STRIPE_PRICE_ID_PAID unset → priceId='' (covers env ?? '' right side)", async () => {
    const account = await createAccount("Paid No Env", "paid-noenv-branches@test.com", "free");
    const savedPaid = process.env.STRIPE_PRICE_ID_PAID;
    delete process.env.STRIPE_PRICE_ID_PAID;
    const payload = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_paid_no_env",
          subscription: "sub_paid_no_env",
          customer: "cus_paid_no_env",
          client_reference_id: account.account_id,
          metadata: { account_id: account.account_id, tier: "paid" },
        },
      },
    });
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });
    expect(r.status).toBe(200);
    const updated = await getAccount(account.account_id);
    expect(updated!.tier).toBe("free"); // priceId="" → syncTier skipped
    process.env.STRIPE_PRICE_ID_PAID = savedPaid;
  });

  it("subscription event with no items field → priceId='' (covers items?.data ?? '' right side)", async () => {
    const account = await createAccount("No Items Sub", "no-items-sub-branches@test.com", "free");
    await seedSubscription(account.account_id, "sub_no_items_branch");

    const payload = JSON.stringify({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_no_items_branch",
          customer: "cus_sub_no_items_branch",
          status: "active",
          // No items field → items?.data?.[0]?.price?.id = undefined → ""
          current_period_start: 1735689600,
          current_period_end: 1738368000,
          cancel_at: null,
          metadata: { account_id: account.account_id },
        },
      },
    });
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });
    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);
  });

  it("unauthenticated cancel subscription request → !ctx TRUE at L414", async () => {
    const r = await req("POST", "/v1/account/subscription/cancel");
    expect(r.status).toBe(401);
  });

  it("cancel subscription fetch throws non-Error object → covers String(err) branch at L461", async () => {
    const account = await createAccount("NonErr Cancel", "nonerr-cancel-branches@test.com", "paid");
    const { rawKey } = await createApiKey(account.account_id, "test");

    await upsertSubscription({
      subscription_id: "sub_nonerr_cancel_branch",
      customer_id: "cust_nonerr",
      account_id: account.account_id,
      price_id: "price_paid_171",
      status: "active",
      current_period_start: "2025-01-01T00:00:00Z",
      current_period_end: "2025-02-01T00:00:00Z",
      card_brand: null,
      card_last_four: null,
      cancel_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce("plain_string_error"));

    const r = await req("POST", "/v1/account/subscription/cancel", undefined, {
      Authorization: `Bearer ${rawKey}`,
    });

    expect(r.status).toBe(502);
    expect(r.data.error).toContain("Failed to cancel subscription");
    expect(r.data.error).toContain("plain_string_error");
  });
});
