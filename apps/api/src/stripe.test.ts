import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import { resetTestDb, getSubscription } from "@axis/snapshots";
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
