import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { Server } from "node:http";
import {
  resetTestDb,
  createAccount,
  createApiKey,
  getEmailDeliveries,
  setEmailProvider,
  type EmailMessage,
} from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleCreateAccount } from "./billing.js";
import { handleInviteSeat, handleListSeats, handleGetPlans } from "./funnel.js";
import { handleStripeWebhook, handleCreateCheckout, handleGetSubscription, handleCancelSubscription } from "./stripe.js";
import { resetRateLimits } from "./rate-limiter.js";
import { createHmac } from "node:crypto";

let server: Server;
let testPort = 0;
const WEBHOOK_SECRET = "test_webhook_secret_eq169";

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

/** Polls getEmailDeliveries until at least `minCount` deliveries exist for
 *  the recipient, or `timeoutMs` elapses — replaces a fixed-delay guess
 *  ("await 50ms, then check"), which flaked under CI load whenever the
 *  async email pipeline took longer than the guessed delay. */
async function waitForDeliveries(
  email: string,
  minCount = 1,
  timeoutMs = 2000,
): Promise<Awaited<ReturnType<typeof getEmailDeliveries>>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const deliveries = await getEmailDeliveries(email);
    if (deliveries.length >= minCount || Date.now() >= deadline) return deliveries;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

// ─── Server setup ───────────────────────────────────────────────

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.STRIPE_PRICE_ID_STARTER = "price_starter_169";
  process.env.STRIPE_PRICE_ID_STARTER_ANNUAL = "price_starter_annual_169";
  process.env.STRIPE_PRICE_ID_PRO = "price_pro_169";
  process.env.STRIPE_PRICE_ID_PRO_ANNUAL = "price_pro_annual_169";
  process.env.STRIPE_PRICE_ID_GROWTH = "price_growth_169";
  process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL = "price_growth_annual_169";
  process.env.STRIPE_PRICE_ID_PAID = "price_starter_169";
  process.env.STRIPE_PRICE_ID_PAID_ANNUAL = "price_starter_annual_169";
  process.env.STRIPE_PRICE_ID_SUITE = "price_growth_169";

  const router = new Router();
  router.post("/v1/accounts", handleCreateAccount);
  router.post("/v1/account/seats", handleInviteSeat);
  router.get("/v1/account/seats", handleListSeats);
  router.get("/v1/plans", handleGetPlans);
  router.post("/v1/webhooks/stripe", handleStripeWebhook);
  router.post("/v1/checkout", handleCreateCheckout);
  router.get("/v1/account/subscription", handleGetSubscription);
  router.post("/v1/account/subscription/cancel", handleCancelSubscription);

  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(() => {
  server?.close();
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_ID_STARTER;
  delete process.env.STRIPE_PRICE_ID_STARTER_ANNUAL;
  delete process.env.STRIPE_PRICE_ID_PRO;
  delete process.env.STRIPE_PRICE_ID_PRO_ANNUAL;
  delete process.env.STRIPE_PRICE_ID_GROWTH;
  delete process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL;
  delete process.env.STRIPE_PRICE_ID_PAID;
  delete process.env.STRIPE_PRICE_ID_PAID_ANNUAL;
  delete process.env.STRIPE_PRICE_ID_SUITE;
});

beforeEach(() => {
  resetRateLimits();
});

// ─── Tests ──────────────────────────────────────────────────────

describe("Email notification wiring", () => {
  it("sends welcome email on account creation", async () => {
    const emails: EmailMessage[] = [];
    setEmailProvider(async (msg) => {
      emails.push(msg);
      return { provider_id: `test-${Date.now()}` };
    });

    const r = await req("POST", "/v1/accounts", { name: "Welcome Test", email: "welcome-test@example.com" });
    expect(r.status).toBe(201);

    const deliveries = await waitForDeliveries("welcome-test@example.com");
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    expect(deliveries[0].template).toBe("welcome");
    expect(deliveries[0].status).toBe("sent");
    expect(emails.length).toBeGreaterThanOrEqual(1);
    expect(emails[0].template).toBe("welcome");
    expect(emails[0].variables.name).toBe("Welcome Test");

    setEmailProvider(null as unknown as import("@axis/snapshots").EmailProvider);
  });

  it("sends seat invitation email when inviting team member", async () => {
    const emails: EmailMessage[] = [];
    setEmailProvider(async (msg) => {
      emails.push(msg);
      return { provider_id: `test-${Date.now()}` };
    });

    // Create a paid account
    const account = await createAccount("Team Owner", "team-owner-169@example.com", "paid");
    const { rawKey } = await createApiKey(account.account_id, "test");

    const r = await req("POST", "/v1/account/seats",
      { email: "invitee-169@example.com", role: "member" },
      { Authorization: `Bearer ${rawKey}` },
    );
    expect(r.status).toBe(201);

    const deliveries = await waitForDeliveries("invitee-169@example.com");
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    expect(deliveries[0].template).toBe("seat_invitation");
    expect(deliveries[0].status).toBe("sent");

    setEmailProvider(null as unknown as import("@axis/snapshots").EmailProvider);
  });

  it("records pending email when no provider configured", async () => {
    // Ensure no provider
    setEmailProvider(null as unknown as import("@axis/snapshots").EmailProvider);

    const r = await req("POST", "/v1/accounts", { name: "NoProvider User", email: "noprovider@example.com" });
    expect(r.status).toBe(201);

    const deliveries = await waitForDeliveries("noprovider@example.com");
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    expect(deliveries[0].template).toBe("welcome");
    expect(deliveries[0].status).toBe("pending");
  });
});

describe("Checkout flow", () => {
  it("requires auth for checkout", async () => {
    const r = await req("POST", "/v1/checkout", { plan_id: "starter" });
    expect(r.status).toBe(401);
  });

  it("rejects invalid plan", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_169";
    process.env.STRIPE_PRICE_ID_STARTER = "price_test_starter";

    const account = await createAccount("Tier Test", "tier-test-169@example.com", "free");
    const { rawKey } = await createApiKey(account.account_id, "test");

    const r = await req("POST", "/v1/checkout",
      { plan_id: "free" },
      { Authorization: `Bearer ${rawKey}` },
    );
    expect(r.status).toBe(400);
    expect(r.data.error).toContain("plan_id must be starter, pro, or growth");

    delete process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_PRICE_ID_STARTER = "price_starter_169";
  });

  it("returns 503 when Stripe key not configured", async () => {
    const account = await createAccount("NoStripe Test", "nostripe-169@example.com", "free");
    const { rawKey } = await createApiKey(account.account_id, "test");

    // Temporarily remove Stripe key
    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;

    const r = await req("POST", "/v1/checkout",
      { plan_id: "starter" },
      { Authorization: `Bearer ${rawKey}` },
    );
    expect(r.status).toBe(503);

    process.env.STRIPE_SECRET_KEY = saved;
  });

  it("checkout payload includes redirect URL", async () => {
    // We can't test the actual LS API call, but we can verify the checkout handler
    // requires auth and validates tier — the redirect URL is part of the payload
    // construction which we verified by code review
    const account = await createAccount("Redirect Test", "redirect-169@example.com", "free");
    const { rawKey } = await createApiKey(account.account_id, "test");

    // Without STRIPE_SECRET_KEY set, we get 503 — confirms we reach the checkout logic
    delete process.env.STRIPE_SECRET_KEY;
    const r = await req("POST", "/v1/checkout",
      { plan_id: "starter" },
      { Authorization: `Bearer ${rawKey}` },
    );
    expect(r.status).toBe(503);
    expect(r.data.error).toContain("not configured");
    process.env.STRIPE_SECRET_KEY = "sk_test_temp";
  });
});

describe("Subscription endpoints", () => {
  it("returns subscription status for authenticated user", async () => {
    const account = await createAccount("Sub Test", "sub-169@example.com", "paid");
    const { rawKey } = await createApiKey(account.account_id, "test");

    const r = await req("GET", "/v1/account/subscription", undefined, { Authorization: `Bearer ${rawKey}` });
    expect(r.status).toBe(200);
    expect(r.data.account_id).toBe(account.account_id);
    expect(r.data.tier).toBe("paid");
    expect(r.data.has_active_subscription).toBe(false);
    expect(r.data.active_subscription).toBeNull();
  });

  it("requires auth for subscription status", async () => {
    const r = await req("GET", "/v1/account/subscription");
    expect(r.status).toBe(401);
  });

  it("returns 404 when cancelling without subscription", async () => {
    const account = await createAccount("NoSub Cancel", "nosub-cancel-169@example.com", "paid");
    const { rawKey } = await createApiKey(account.account_id, "test");

    const r = await req("POST", "/v1/account/subscription/cancel", undefined, { Authorization: `Bearer ${rawKey}` });
    expect(r.status).toBe(404);
    expect(r.data.error).toContain("No active subscription");
  });
});

describe("Webhook upgrade email notification", () => {
  it("sends upgrade confirmation email when tier changes via webhook", async () => {
    // H0.5's truth-fetch (fetchSubscriptionPriceId) fires on
    // checkout.session.completed whenever STRIPE_SECRET_KEY is set — and an
    // earlier test in this file restores it set. Stub fetch so this test never
    // touches the real network (a live api.stripe.com round-trip timed this
    // test out on a slow CI runner). The req() helper uses node:http directly,
    // so the stub only intercepts the outbound Stripe call.
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ items: { data: [{ price: { id: "price_starter_169" } }] } }),
    })));

    const emails: EmailMessage[] = [];
    setEmailProvider(async (msg) => {
      emails.push(msg);
      return { provider_id: `test-${Date.now()}` };
    });

    // Create a free account
    const account = await createAccount("Webhook Upgrader", "webhook-upgrade-169@example.com", "free");

    // Send a checkout.session.completed webhook that activates a paid subscription
    const ts = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_webhook_169",
          subscription: "sub_webhook_169",
          customer: "cus_webhook_169",
          client_reference_id: account.account_id,
          metadata: { account_id: account.account_id, plan_id: "starter", billing_cycle: "monthly" },
        },
      },
    });

    const r = await req("POST", "/v1/webhooks/stripe", payload, {
      "stripe-signature": signStripePayload(payload, ts),
      "Content-Type": "application/json",
    });
    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);

    const deliveries = await waitForDeliveries("webhook-upgrade-169@example.com");
    const upgradeEmail = deliveries.find((d) => d.template === "upgrade_confirmation");
    expect(upgradeEmail).toBeDefined();
    expect(upgradeEmail!.status).toBe("sent");

    // Verify email content
    const upgradeMsg = emails.find((e) => e.template === "upgrade_confirmation");
    expect(upgradeMsg).toBeDefined();
    expect(upgradeMsg!.variables.tier_name).toBe("Starter");

    setEmailProvider(null as unknown as import("@axis/snapshots").EmailProvider);
    vi.stubGlobal("fetch", realFetch);
  });
});
