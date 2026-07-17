import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import { resetTestDb, getSubscription, getAccount, getAccountPaidPlanId } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleCreateAccount } from "./billing.js";
import { handleStripeWebhook, handleGetSubscription } from "./stripe.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;
const WEBHOOK_SECRET = "test_webhook_secret_123";

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
  process.env.STRIPE_PRICE_ID_PAID = "price_paid_123";
  process.env.STRIPE_PRICE_ID_SUITE = "price_suite_456";

  const router = new Router();
  router.post("/v1/accounts", handleCreateAccount);
  router.post("/v1/webhooks/stripe", handleStripeWebhook);
  router.get("/v1/account/subscription", handleGetSubscription);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_ID_PAID;
  delete process.env.STRIPE_PRICE_ID_SUITE;
});

beforeEach(() => {
  resetRateLimits();
});

// ─── Helpers ────────────────────────────────────────────────────

async function createTestAccount(name?: string, email?: string) {
  const n = name ?? `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const e = email ?? `${n}@test.com`;
  const r = await req("POST", "/v1/accounts", { name: n, email: e });
  return {
    account: r.data.account as Record<string, unknown>,
    rawKey: r.data.api_key as Record<string, unknown>,
    key: (r.data.api_key as Record<string, unknown>).raw_key as string,
  };
}

function buildCheckoutSessionPayload(accountId: string, subscriptionId: string, tier = "paid") {
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

function buildSubscriptionPayload(
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
          data: [{ price: { id: "price_paid_123" } }],
        },
        current_period_start: 1735689600, // 2025-01-01
        current_period_end: 1738368000,   // 2025-02-01
        cancel_at: null,
        metadata: { account_id: accountId },
        ...overrides,
      },
    },
  };
}

// H8.1b: fake timers freeze setTimeout, but the real DB/socket I/O that runs
// BEFORE a timed fetch call (auth, readBody, existing-subscription lookups)
// still needs real event-loop turns to complete. Poll via a REAL setImmediate
// (not faked — only setTimeout/clearTimeout are) until the fetch stub has
// actually been invoked, so its AbortController's setTimeout is guaranteed to
// already be registered before the fake clock gets advanced past it.
async function waitForFetchCall(spy: { mock: { calls: unknown[][] } }, calls: number, maxTicks = 500): Promise<void> {
  for (let i = 0; i < maxTicks && spy.mock.calls.length < calls; i++) {
    // Flush any already-due fake timer (e.g. a library's internal
    // setTimeout(fn, 0)) without moving the clock past it, THEN yield to the
    // real event loop so pending real I/O (DB/socket) can also progress.
    await vi.advanceTimersByTimeAsync(0);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

// ─── Webhook tests ──────────────────────────────────────────────

describe("Stripe webhook", () => {
  it("rejects requests without signature", async () => {
    const payload = JSON.stringify(buildCheckoutSessionPayload("acct_test", "sub_001"));
    const r = await req("POST", "/v1/webhooks/stripe", payload);
    expect(r.status).toBe(401);
  });

  it("rejects requests with invalid signature", async () => {
    const payload = JSON.stringify(buildCheckoutSessionPayload("acct_test", "sub_002"));
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": "t=1234,v1=badhex",
    });
    expect(r.status).toBe(401);
  });

  it("accepts valid checkout.session.completed and creates subscription", async () => {
    const { account } = await createTestAccount("webhook-test", "webhook@test.com");
    const accountId = account.account_id as string;
    const payload = JSON.stringify(buildCheckoutSessionPayload(accountId, "sub_checkout_123", "paid"));
    const sig = signStripePayload(payload);

    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": sig,
    });

    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);
    expect(r.data.event).toBe("checkout.session.completed");
    expect(r.data.subscription_id).toBe("sub_checkout_123");
  });

  it("acknowledges unhandled events with 200", async () => {
    const payload = JSON.stringify({ type: "payment_intent.created", data: { object: {} } });
    const sig = signStripePayload(payload);

    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": sig,
    });

    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(false);
  });

  it("handles customer.subscription.updated for existing subscription", async () => {
    const { account } = await createTestAccount("sub-update", "sub-update@test.com");
    const accountId = account.account_id as string;

    // First create via checkout
    const checkoutPayload = JSON.stringify(buildCheckoutSessionPayload(accountId, "sub_update_123"));
    await req("POST", "/v1/webhooks/stripe", checkoutPayload, {
      "stripe-signature": signStripePayload(checkoutPayload),
    });

    // Now send subscription updated event
    const updatePayload = JSON.stringify(
      buildSubscriptionPayload("customer.subscription.updated", "sub_update_123", accountId),
    );
    const r = await req("POST", "/v1/webhooks/stripe", updatePayload, {
      "stripe-signature": signStripePayload(updatePayload),
    });

    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);
    expect(r.data.event).toBe("customer.subscription.updated");
  });

  // ─── H-Phase-A cycle 2: this legacy Stripe-direct sync path never wrote ──
  // paid_plan_id, reintroducing cycle 1's Pro-metered-as-Starter bug for any
  // account tier-synced through it. Starter/Pro both map to tier==="paid",
  // so priceToPlanId (which already distinguishes them) must be persisted
  // alongside updateAccountTier, same as the PAI'D checkout webhook.
  it("persists paid_plan_id='pro' when a subscription syncs via a Pro-priced item (H-Phase-A cycle 2)", async () => {
    process.env.STRIPE_PRICE_ID_PRO = "price_pro_direct_999";
    try {
      const { account } = await createTestAccount("stripe-pro", "stripe-pro@test.com");
      const accountId = account.account_id as string;

      const payload = JSON.stringify(
        buildSubscriptionPayload("customer.subscription.updated", "sub_pro_direct", accountId, {
          items: { data: [{ price: { id: "price_pro_direct_999" } }] },
        }),
      );
      const r = await req("POST", "/v1/webhooks/stripe", payload, {
        "stripe-signature": signStripePayload(payload),
      });

      expect(r.status).toBe(200);
      expect((await getAccount(accountId))?.tier).toBe("paid");
      expect(await getAccountPaidPlanId(accountId)).toBe("pro");
    } finally {
      delete process.env.STRIPE_PRICE_ID_PRO;
    }
  });

  // ─── H-Phase-A cycle 3: a same-tier Starter <-> Pro switch used to hit the ──
  // early `newTier === previousTier` return before EVER reaching
  // updateAccountPaidPlanId — Starter and Pro both map to tier==="paid", so
  // switching between them never tripped the tier-change branch that carried
  // the paid_plan_id write. resolvePlanForAccount would then keep metering
  // the account at whichever plan it started on, indefinitely.
  it("updates paid_plan_id on a same-tier Starter -> Pro switch (no tier change)", async () => {
    process.env.STRIPE_PRICE_ID_STARTER = "price_starter_switch_999";
    process.env.STRIPE_PRICE_ID_PRO = "price_pro_switch_999";
    try {
      const { account } = await createTestAccount("stripe-switch", "stripe-switch@test.com");
      const accountId = account.account_id as string;

      const starterPayload = JSON.stringify(
        buildSubscriptionPayload("customer.subscription.updated", "sub_switch", accountId, {
          items: { data: [{ price: { id: "price_starter_switch_999" } }] },
        }),
      );
      await req("POST", "/v1/webhooks/stripe", starterPayload, { "stripe-signature": signStripePayload(starterPayload) });
      expect((await getAccount(accountId))?.tier).toBe("paid");
      expect(await getAccountPaidPlanId(accountId)).toBe("starter");

      const proPayload = JSON.stringify(
        buildSubscriptionPayload("customer.subscription.updated", "sub_switch", accountId, {
          items: { data: [{ price: { id: "price_pro_switch_999" } }] },
        }),
      );
      const r = await req("POST", "/v1/webhooks/stripe", proPayload, { "stripe-signature": signStripePayload(proPayload) });

      expect(r.status).toBe(200);
      // Tier itself never moves — both prices map to "paid" — but the plan
      // id must still flip from starter to pro.
      expect((await getAccount(accountId))?.tier).toBe("paid");
      expect(await getAccountPaidPlanId(accountId)).toBe("pro");
    } finally {
      delete process.env.STRIPE_PRICE_ID_STARTER;
      delete process.env.STRIPE_PRICE_ID_PRO;
    }
  });

  it("clears paid_plan_id when a subscription syncs to free (canceled)", async () => {
    process.env.STRIPE_PRICE_ID_PRO = "price_pro_cancel_999";
    try {
      const { account } = await createTestAccount("stripe-pro-cancel", "stripe-pro-cancel@test.com");
      const accountId = account.account_id as string;

      const upPayload = JSON.stringify(
        buildSubscriptionPayload("customer.subscription.updated", "sub_pro_cancel", accountId, {
          items: { data: [{ price: { id: "price_pro_cancel_999" } }] },
        }),
      );
      await req("POST", "/v1/webhooks/stripe", upPayload, { "stripe-signature": signStripePayload(upPayload) });
      expect(await getAccountPaidPlanId(accountId)).toBe("pro");

      const cancelPayload = JSON.stringify(
        buildSubscriptionPayload("customer.subscription.deleted", "sub_pro_cancel", accountId, {
          items: { data: [{ price: { id: "price_pro_cancel_999" } }] },
          status: "canceled",
        }),
      );
      const r = await req("POST", "/v1/webhooks/stripe", cancelPayload, { "stripe-signature": signStripePayload(cancelPayload) });

      expect(r.status).toBe(200);
      expect((await getAccount(accountId))?.tier).toBe("free");
      expect(await getAccountPaidPlanId(accountId)).toBeNull();
    } finally {
      delete process.env.STRIPE_PRICE_ID_PRO;
    }
  });

  it("stores the price the customer ACTUALLY bought when env prices rotated between checkout and webhook (H0.5)", async () => {
    const { account } = await createTestAccount("rotate", "rotate@test.com");
    const accountId = account.account_id as string;

    // The customer checked out on price_original_2900. By webhook time the
    // operator rotated the env: the plan now maps to price_paid_123 (the test
    // env's current STRIPE_PRICE_ID_PAID). The truth lives on the Stripe
    // subscription itself — the handler must fetch and store THAT price, and
    // still upgrade the tier via the plan-intent fallback (the original price
    // is no longer in the env map, so priceToTier can't map it).
    process.env.STRIPE_SECRET_KEY = "sk_test_h05";
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ items: { data: [{ price: { id: "price_original_2900" } }] } }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const payload = JSON.stringify(buildCheckoutSessionPayload(accountId, "sub_rotated_1", "paid"));
      const r = await req("POST", "/v1/webhooks/stripe", payload, {
        "stripe-signature": signStripePayload(payload),
      });
      expect(r.status).toBe(200);

      // The subscription record carries the TRUE price, not today's env mapping.
      const stored = await getSubscription("sub_rotated_1");
      expect(stored?.price_id).toBe("price_original_2900");

      // The paying customer is still upgraded (plan-intent fallback for tier).
      const acct = await getAccount(accountId);
      expect(acct?.tier).toBe("paid");

      // The truth-fetch hit the subscription with the pinned API version.
      const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.stripe.com/v1/subscriptions/sub_rotated_1");
      expect((init.headers as Record<string, string>)["Stripe-Version"]).toBe("2026-06-24.dahlia");
    } finally {
      vi.stubGlobal("fetch", realFetch);
      delete process.env.STRIPE_SECRET_KEY;
    }
  });

  // ─── H2.6 (red-team fix, WAVE-0 finding #6): the truth-fetch failure path ──
  // itself used to silently reintroduce H0.5's exact bug — a single failed
  // attempt fell straight back to env, so a price rotation coinciding with
  // any hiccup at that exact fetch mis-recorded what the customer bought.

  it("recovers from a transient truth-fetch failure via retry — does NOT fall back to env after just one failed attempt", async () => {
    const { account } = await createTestAccount("retry-ok", "retry-ok@test.com");
    const accountId = account.account_id as string;
    process.env.STRIPE_SECRET_KEY = "sk_test_retry";
    const realFetch = globalThis.fetch;
    let calls = 0;
    const fetchSpy = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("ECONNRESET (transient)");
      return { ok: true, json: async () => ({ items: { data: [{ price: { id: "price_true_after_retry" } }] } }) };
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const payload = JSON.stringify(buildCheckoutSessionPayload(accountId, "sub_retry_ok", "paid"));
      const r = await req("POST", "/v1/webhooks/stripe", payload, { "stripe-signature": signStripePayload(payload) });
      expect(r.status).toBe(200);

      const stored = await getSubscription("sub_retry_ok");
      expect(stored?.price_id).toBe("price_true_after_retry"); // NOT price_paid_123 (env) — the retry recovered the truth
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.stubGlobal("fetch", realFetch);
      delete process.env.STRIPE_SECRET_KEY;
    }
  });

  it("keeps a PREVIOUSLY-CONFIRMED price over env when every retry fails on a later event for the same subscription", async () => {
    const { account } = await createTestAccount("keep-confirmed", "keep-confirmed@test.com");
    const accountId = account.account_id as string;
    process.env.STRIPE_SECRET_KEY = "sk_test_keep";
    const realFetch = globalThis.fetch;
    try {
      // First event: the truth-fetch succeeds and CONFIRMS the real price.
      vi.stubGlobal("fetch", vi.fn(async () => ({
        ok: true,
        json: async () => ({ items: { data: [{ price: { id: "price_confirmed_999" } }] } }),
      })));
      const firstPayload = JSON.stringify(buildCheckoutSessionPayload(accountId, "sub_keep_confirmed", "paid"));
      await req("POST", "/v1/webhooks/stripe", firstPayload, { "stripe-signature": signStripePayload(firstPayload) });
      expect((await getSubscription("sub_keep_confirmed"))?.price_id).toBe("price_confirmed_999");

      // Env rotates AND the truth-fetch now fails on every attempt (a hiccup
      // at the worst possible moment). The old bug: this silently overwrote
      // the confirmed price with the (now-rotated, wrong) env guess.
      process.env.STRIPE_PRICE_ID_PAID = "price_rotated_after_confirm";
      vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
      const secondPayload = JSON.stringify(buildCheckoutSessionPayload(accountId, "sub_keep_confirmed", "paid"));
      const r = await req("POST", "/v1/webhooks/stripe", secondPayload, { "stripe-signature": signStripePayload(secondPayload) });
      expect(r.status).toBe(200);

      const stored = await getSubscription("sub_keep_confirmed");
      expect(stored?.price_id).toBe("price_confirmed_999"); // unchanged — never trusted the rotated env guess
    } finally {
      vi.stubGlobal("fetch", realFetch);
      delete process.env.STRIPE_SECRET_KEY;
      process.env.STRIPE_PRICE_ID_PAID = "price_paid_123";
    }
  });

  it("falls back to env ONLY when there is no prior confirmed price at all (first-ever event, every retry fails) — logged as unconfirmed, not silent", async () => {
    const { account } = await createTestAccount("no-history", "no-history@test.com");
    const accountId = account.account_id as string;
    process.env.STRIPE_SECRET_KEY = "sk_test_nohistory";
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    try {
      const payload = JSON.stringify(buildCheckoutSessionPayload(accountId, "sub_no_history", "paid"));
      const r = await req("POST", "/v1/webhooks/stripe", payload, { "stripe-signature": signStripePayload(payload) });
      expect(r.status).toBe(200);

      const stored = await getSubscription("sub_no_history");
      expect(stored?.price_id).toBe("price_paid_123"); // env is the only available signal — unchanged pre-fix behavior for THIS case
    } finally {
      vi.stubGlobal("fetch", realFetch);
      delete process.env.STRIPE_SECRET_KEY;
    }
  });

  // ─── H8.1b: client-side per-attempt timeout inside the retry loop ─────────
  // A stalled Stripe response (never resolves, never rejects on its own) must
  // not hang this call forever — each attempt now carries its own
  // SUBSCRIPTION_FETCH_TIMEOUT_MS AbortController. A timeout is just another
  // way an attempt can fail, and the existing catch-and-continue in the retry
  // loop already handles it — this asserts recovery behaves IDENTICALLY to
  // the rejected-fetch retry test above.

  it("treats a per-attempt timeout exactly like a rejected fetch — retries and recovers the true price on the next attempt (H8.1b)", async () => {
    const { account } = await createTestAccount("retry-timeout", "retry-timeout@test.com");
    const accountId = account.account_id as string;
    process.env.STRIPE_SECRET_KEY = "sk_test_retry_timeout";
    const realFetch = globalThis.fetch;
    let calls = 0;
    const fetchSpy = vi.fn((_url: string, init?: RequestInit) => {
      calls++;
      if (calls === 1) {
        // Never resolves/rejects on its own — only reacts to the per-attempt
        // AbortController's signal, exactly like a real stalled connection
        // would once fetch's internals observe the abort.
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const abortErr = new Error("This operation was aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
          });
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ items: { data: [{ price: { id: "price_true_after_timeout" } }] } }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const payload = JSON.stringify(buildCheckoutSessionPayload(accountId, "sub_retry_timeout", "paid"));
      const reqPromise = req("POST", "/v1/webhooks/stripe", payload, { "stripe-signature": signStripePayload(payload) });

      // Let real I/O (auth, readBody, DB lookups) reach attempt 1's fetch()
      // call before advancing the fake clock past its timeout.
      await waitForFetchCall(fetchSpy, 1);
      // Fire attempt 1's 10s per-attempt timeout (SUBSCRIPTION_FETCH_TIMEOUT_MS).
      await vi.advanceTimersByTimeAsync(10_000);
      // Let the retry loop's post-attempt-1 backoff (250ms * 1) elapse too.
      await vi.advanceTimersByTimeAsync(250);

      const r = await reqPromise;
      expect(r.status).toBe(200);

      // Same recovery behavior as the rejected-fetch retry test: the SECOND
      // attempt's true price is stored, not the env fallback.
      const stored = await getSubscription("sub_retry_timeout");
      expect(stored?.price_id).toBe("price_true_after_timeout");
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      vi.stubGlobal("fetch", realFetch);
      delete process.env.STRIPE_SECRET_KEY;
    }
  });

  // ─── Malformed-2xx coverage (H8.1 audit): the transport-error paths above
  // (throw, non-ok status) already retry-and-recover or retry-and-fall-back.
  // This covers the remaining unhappy-path dimension: a response that
  // resolves 200 OK but whose body doesn't have the expected `items` shape
  // (valid JSON, wrong shape — not a parse failure).

  it("falls back like a failed fetch — but in a SINGLE attempt — when the truth-fetch resolves 200 OK with a malformed body (no items)", async () => {
    const { account } = await createTestAccount("malformed-ok", "malformed-ok@test.com");
    const accountId = account.account_id as string;
    process.env.STRIPE_SECRET_KEY = "sk_test_malformed";
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({}), // 200 OK, valid JSON, but no `items` at all
    }));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const payload = JSON.stringify(buildCheckoutSessionPayload(accountId, "sub_malformed_ok", "paid"));
      const r = await req("POST", "/v1/webhooks/stripe", payload, { "stripe-signature": signStripePayload(payload) });
      expect(r.status).toBe(200);

      // sub.items?.data?.[0]?.price?.id ?? null → null. handleCheckoutCompleted
      // then falls back exactly like a total truth-fetch failure would (no
      // prior confirmed price for this new subscription → env is the only
      // available signal).
      const stored = await getSubscription("sub_malformed_ok");
      expect(stored?.price_id).toBe("price_paid_123");

      // Unlike a thrown/network error (which retries up to `attempts` times),
      // `if (response.ok)` returns unconditionally on the first pass — a
      // malformed-but-2xx response is NEVER retried, even though it is just
      // as "wrong" as a transient network blip would have been.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.stubGlobal("fetch", realFetch);
      delete process.env.STRIPE_SECRET_KEY;
    }
  });

  // ─── H2.6 (red-team fix, WAVE-0 finding #7): webhook event-ordering ───────
  // Stripe does not guarantee webhook delivery order. A stale event (e.g. an
  // old cancellation, redelivered late) must not overwrite state a NEWER
  // event already applied (e.g. a reactivation).

  function subscriptionEventPayload(eventType: string, subscriptionId: string, accountId: string, created: number, overrides: Record<string, unknown> = {}) {
    return {
      type: eventType,
      created,
      data: {
        object: {
          id: subscriptionId,
          customer: `cus_${subscriptionId}`,
          status: "active",
          items: { data: [{ price: { id: "price_paid_123" } }] },
          current_period_start: 1735689600,
          current_period_end: 1738368000,
          cancel_at: null,
          metadata: { account_id: accountId },
          ...overrides,
        },
      },
    };
  }

  it("a stale customer.subscription.deleted (older event) does NOT downgrade a subscription a NEWER update already reactivated", async () => {
    const { account } = await createTestAccount("stale-delete", "stale-delete@test.com");
    const accountId = account.account_id as string;
    const subId = "sub_stale_order";
    const baseTime = Math.floor(Date.now() / 1000);

    // Establish the subscription (event created at baseTime).
    const createPayload = JSON.stringify(subscriptionEventPayload("customer.subscription.created", subId, accountId, baseTime));
    await req("POST", "/v1/webhooks/stripe", createPayload, { "stripe-signature": signStripePayload(createPayload) });

    // A NEWER reactivation event (baseTime + 100) arrives and is applied normally.
    const reactivatePayload = JSON.stringify(subscriptionEventPayload("customer.subscription.updated", subId, accountId, baseTime + 100, { status: "active" }));
    await req("POST", "/v1/webhooks/stripe", reactivatePayload, { "stripe-signature": signStripePayload(reactivatePayload) });
    expect((await getSubscription(subId))?.status).toBe("active");

    // A STALE deletion (baseTime + 50 — OLDER than the reactivation at +100,
    // but arriving LAST over the wire) must be ignored, not applied.
    const staleDeletePayload = JSON.stringify(subscriptionEventPayload("customer.subscription.deleted", subId, accountId, baseTime + 50));
    const r = await req("POST", "/v1/webhooks/stripe", staleDeletePayload, { "stripe-signature": signStripePayload(staleDeletePayload) });
    expect(r.status).toBe(200); // still acknowledged — Stripe must not retry it forever

    const stored = await getSubscription(subId);
    expect(stored?.status).toBe("active"); // NOT "canceled" — the stale event never applied
    const acct = await getAccount(accountId);
    expect(acct?.tier).not.toBe("free"); // the paying customer was never downgraded
  });

  it("a genuinely NEWER event still applies normally (the guard only rejects the past, not everything)", async () => {
    const { account } = await createTestAccount("newer-ok", "newer-ok@test.com");
    const accountId = account.account_id as string;
    const subId = "sub_newer_ok";
    const baseTime = Math.floor(Date.now() / 1000);

    const createPayload = JSON.stringify(subscriptionEventPayload("customer.subscription.created", subId, accountId, baseTime));
    await req("POST", "/v1/webhooks/stripe", createPayload, { "stripe-signature": signStripePayload(createPayload) });

    const deletePayload = JSON.stringify(subscriptionEventPayload("customer.subscription.deleted", subId, accountId, baseTime + 100));
    await req("POST", "/v1/webhooks/stripe", deletePayload, { "stripe-signature": signStripePayload(deletePayload) });

    expect((await getSubscription(subId))?.status).toBe("canceled");
  });

  it("an EXACT replay (same eventCreated, not older) of an already-applied event is also a no-op — the guard is <=, not < (H8.3 mutation-lite)", async () => {
    const { account } = await createTestAccount("exact-replay", "exact-replay@test.com");
    const accountId = account.account_id as string;
    const subId = "sub_exact_replay";
    const baseTime = Math.floor(Date.now() / 1000);

    const firstPayload = JSON.stringify(subscriptionEventPayload("customer.subscription.updated", subId, accountId, baseTime));
    await req("POST", "/v1/webhooks/stripe", firstPayload, { "stripe-signature": signStripePayload(firstPayload) });
    const firstUpdatedAt = (await getSubscription(subId))?.updated_at;
    expect(firstUpdatedAt).toBeTruthy();

    // Short delay so an incorrect re-application would produce a measurably LATER updated_at.
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Redeliver the EXACT SAME event (identical eventCreated) — e.g. Stripe redelivering
    // after a slow-but-successful ack, or a duplicate webhook delivery.
    const replayPayload = JSON.stringify(subscriptionEventPayload("customer.subscription.updated", subId, accountId, baseTime));
    const r = await req("POST", "/v1/webhooks/stripe", replayPayload, { "stripe-signature": signStripePayload(replayPayload) });
    expect(r.status).toBe(200); // still acknowledged — Stripe must not retry it forever

    const secondUpdatedAt = (await getSubscription(subId))?.updated_at;
    // If the guard were `<` instead of `<=`, an exact-timestamp replay would NOT be
    // caught as stale (eventCreated < existing.last_event_created_at is false when the
    // two are EQUAL) and would incorrectly re-apply, bumping updated_at to a new "now".
    expect(secondUpdatedAt).toBe(firstUpdatedAt);
  });

  // ─── H0.4: Basil+ (2025-03-31 onward) payload shapes ──────────────────────
  // Stripe relocated two fields this handler reads: subscription period bounds
  // moved from the subscription's top level onto its ITEMS, and an invoice's
  // subscription reference moved under parent.subscription_details. Webhook
  // payload shape follows the ENDPOINT's configured API version (dashboard-
  // controlled), so the handlers must dual-read: new shape first, legacy
  // fallback — these fixtures carry ONLY the new shape.

  it("reads item-level current_period_* from a Basil/dahlia-shaped subscription event (H0.4)", async () => {
    const { account } = await createTestAccount("dahlia-sub", "dahlia-sub@test.com");
    const accountId = account.account_id as string;
    const checkoutPayload = JSON.stringify(buildCheckoutSessionPayload(accountId, "sub_dahlia_1"));
    await req("POST", "/v1/webhooks/stripe", checkoutPayload, {
      "stripe-signature": signStripePayload(checkoutPayload),
    });

    const payload = JSON.stringify({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_dahlia_1",
          customer: "cus_sub_dahlia_1",
          status: "active",
          // dahlia: period bounds live on the item; NOTHING at the top level.
          items: {
            data: [{
              price: { id: "price_paid_123" },
              current_period_start: 1735689600, // 2025-01-01
              current_period_end: 1738368000,   // 2025-02-01
            }],
          },
          cancel_at: null,
          metadata: { account_id: accountId },
        },
      },
    });
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);
    const stored = await getSubscription("sub_dahlia_1");
    expect(stored?.current_period_start).toBe("2025-01-01T00:00:00.000Z");
    expect(stored?.current_period_end).toBe("2025-02-01T00:00:00.000Z");
  });

  it("resolves the subscription from a Basil/dahlia-shaped invoice.payment_failed via parent.subscription_details (H0.4)", async () => {
    const { account } = await createTestAccount("dahlia-inv", "dahlia-inv@test.com");
    const accountId = account.account_id as string;
    const checkoutPayload = JSON.stringify(buildCheckoutSessionPayload(accountId, "sub_dahlia_2"));
    await req("POST", "/v1/webhooks/stripe", checkoutPayload, {
      "stripe-signature": signStripePayload(checkoutPayload),
    });

    const payload = JSON.stringify({
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_dahlia_2",
          // dahlia: no top-level `subscription` — the reference lives here:
          parent: { type: "subscription_details", subscription_details: { subscription: "sub_dahlia_2" } },
        },
      },
    });
    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload),
    });

    expect(r.status).toBe(200);
    const stored = await getSubscription("sub_dahlia_2");
    expect(stored?.status).toBe("past_due");
  });

  it("returns handled:false for subscription event with no account in DB or metadata", async () => {
    const payload = JSON.stringify({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_unknown",
          customer: "cus_unknown",
          status: "active",
          items: { data: [{ price: { id: "price_paid_123" } }] },
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

// ─── Subscription status endpoint ───────────────────────────────

describe("GET /v1/account/subscription", () => {
  it("requires authentication", async () => {
    const r = await req("GET", "/v1/account/subscription");
    expect(r.status).toBe(401);
  });

  it("returns subscription info after webhook creates one", async () => {
    const { account, key } = await createTestAccount("sub-status-test", "substatus@test.com");
    const accountId = account.account_id as string;

    // Fire webhook to create subscription
    const payload = JSON.stringify(buildCheckoutSessionPayload(accountId, "sub_status_123", "paid"));
    const sig = signStripePayload(payload);
    await req("POST", "/v1/webhooks/stripe", payload, { "stripe-signature": sig });

    // Check subscription status
    const r = await req("GET", "/v1/account/subscription", undefined, {
      "Authorization": `Bearer ${key}`,
    });

    expect(r.status).toBe(200);
    expect(r.data.has_active_subscription).toBe(true);
    expect((r.data.active_subscription as Record<string, unknown>).subscription_id).toBe("sub_status_123");
  });

  it("returns null active_subscription when none exists", async () => {
    const { key } = await createTestAccount("no-sub-test", "nosub@test.com");

    const r = await req("GET", "/v1/account/subscription", undefined, {
      "Authorization": `Bearer ${key}`,
    });

    expect(r.status).toBe(200);
    expect(r.data.has_active_subscription).toBe(false);
    expect(r.data.active_subscription).toBeNull();
  });
});
