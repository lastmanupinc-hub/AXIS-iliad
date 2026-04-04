import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb, createAccount, createApiKey, updateAccountTier, recordUsage, SEAT_LIMITS } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import {
  handleGetPlans,
  handleGetUpgradePrompt,
  handleDismissUpgradePrompt,
  handleGetFunnelStatus,
  handleGetFunnelMetrics,
  handleInviteSeat,
  handleListSeats,
  handleAcceptSeat,
  handleRevokeSeat,
} from "./funnel.js";
import {
  handleCreateAccount,
  handleGetAccount,
  handleCreateApiKey,
  handleUpdateTier,
} from "./billing.js";
import { resetRateLimits } from "./rate-limiter.js";

const TEST_PORT = 44413;
let server: Server;

// ─── HTTP helper ────────────────────────────────────────────────

interface Res { status: number; headers: Record<string, string>; data: Record<string, unknown> }

async function req(
  method: string,
  path: string,
  body?: unknown,
  authKey?: string,
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authKey) headers["Authorization"] = `Bearer ${authKey}`;
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: TEST_PORT, path, method, headers },
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

// ─── Server setup ───────────────────────────────────────────────

beforeAll(async () => {
  openMemoryDb();
  resetRateLimits();
  const router = new Router();

  // Billing routes (needed for account/key creation)
  router.post("/v1/accounts", handleCreateAccount);
  router.get("/v1/account", handleGetAccount);
  router.post("/v1/account/keys", handleCreateApiKey);
  router.post("/v1/account/tier", handleUpdateTier);

  // Funnel routes
  router.get("/v1/plans", handleGetPlans);
  router.post("/v1/account/seats", handleInviteSeat);
  router.get("/v1/account/seats", handleListSeats);
  router.post("/v1/account/seats/:seat_id/accept", handleAcceptSeat);
  router.post("/v1/account/seats/:seat_id/revoke", handleRevokeSeat);
  router.get("/v1/account/upgrade-prompt", handleGetUpgradePrompt);
  router.post("/v1/account/upgrade-prompt/dismiss", handleDismissUpgradePrompt);
  router.get("/v1/account/funnel", handleGetFunnelStatus);
  router.get("/v1/funnel/metrics", handleGetFunnelMetrics);

  server = createApp(router, TEST_PORT);
  await new Promise<void>((r) => setTimeout(r, 100));
});

afterAll(() => {
  server?.close();
  closeDb();
});

// Helper: create an account + key directly in DB and return the raw key
function createAuthenticatedAccount(name: string, email: string, tier?: string) {
  const acct = createAccount(name, email, (tier ?? "free") as "free" | "paid" | "suite");
  const key = createApiKey(acct.account_id, "test-key");
  return { account_id: acct.account_id, rawKey: key.rawKey };
}

// ─── Plans ──────────────────────────────────────────────────────

describe("GET /v1/plans", () => {
  it("returns plan catalog without auth", async () => {
    const res = await req("GET", "/v1/plans");
    expect(res.status).toBe(200);

    const data = res.data as Record<string, unknown>;
    const plans = data.plans as Array<Record<string, unknown>>;
    expect(plans).toHaveLength(3);
    expect(plans.map(p => p.id)).toEqual(["free", "paid", "suite"]);
  });

  it("free plan has zero price", async () => {
    const res = await req("GET", "/v1/plans");
    const plans = (res.data as Record<string, unknown>).plans as Array<Record<string, unknown>>;
    const free = plans.find(p => p.id === "free")!;
    expect(free.price_monthly_cents).toBe(0);
    expect(free.price_annual_cents).toBe(0);
  });

  it("pro plan has correct pricing", async () => {
    const res = await req("GET", "/v1/plans");
    const plans = (res.data as Record<string, unknown>).plans as Array<Record<string, unknown>>;
    const pro = plans.find(p => p.id === "paid")!;
    expect(pro.price_monthly_cents).toBe(2900);
    expect(pro.name).toBe("Pro");
  });

  it("includes feature comparison matrix", async () => {
    const res = await req("GET", "/v1/plans");
    const features = (res.data as Record<string, unknown>).features as Array<Record<string, unknown>>;
    expect(features.length).toBeGreaterThan(10);
    for (const f of features) {
      expect(f).toHaveProperty("free");
      expect(f).toHaveProperty("pro");
      expect(f).toHaveProperty("suite");
    }
  });
});

// ─── Upgrade Prompts ────────────────────────────────────────────

describe("GET /v1/account/upgrade-prompt", () => {
  it("returns 401 without auth", async () => {
    const res = await req("GET", "/v1/account/upgrade-prompt");
    expect(res.status).toBe(401);
  });

  it("returns null prompt for new free account", async () => {
    const { rawKey } = await createAuthenticatedAccount("NoPrompt", "noprompt@example.com");
    const res = await req("GET", "/v1/account/upgrade-prompt", undefined, rawKey);
    expect(res.status).toBe(200);
    expect((res.data as Record<string, unknown>).prompt).toBeNull();
    expect((res.data as Record<string, unknown>).stage).toBe("signup");
    expect((res.data as Record<string, unknown>).message).toBeDefined();
  });

  it("returns null prompt for suite user", async () => {
    const { rawKey } = await createAuthenticatedAccount("SuiteUser", "suite-prompt@example.com", "suite");
    const res = await req("GET", "/v1/account/upgrade-prompt", undefined, rawKey);
    expect(res.status).toBe(200);
    expect((res.data as Record<string, unknown>).prompt).toBeNull();
  });

  it("returns activation prompt for free user with usage", async () => {
    const { account_id, rawKey } = await createAuthenticatedAccount("Active", "active-prompt@example.com");
    recordUsage(account_id, "search", "snap-1", 1, 1, 100);

    const res = await req("GET", "/v1/account/upgrade-prompt", undefined, rawKey);
    expect(res.status).toBe(200);
    const data = res.data as Record<string, unknown>;
    const prompt = data.prompt as Record<string, unknown>;
    expect(prompt).toBeTruthy();
    expect(prompt.trigger).toBe("first_snapshot_completed");
    expect(prompt.current_tier).toBe("free");
    expect(prompt.recommended_tier).toBe("paid");
  });

  it("returns high-urgency prompt when quota exhausted", async () => {
    const { account_id, rawKey } = await createAuthenticatedAccount("Exhausted", "exhausted@example.com");
    for (let i = 0; i < 10; i++) {
      recordUsage(account_id, "search", `snap-${i}`, 1, 1, 100);
    }

    const res = await req("GET", "/v1/account/upgrade-prompt", undefined, rawKey);
    expect(res.status).toBe(200);
    const prompt = (res.data as Record<string, unknown>).prompt as Record<string, unknown>;
    expect(prompt.trigger).toBe("monthly_limit_reached");
    expect(prompt.urgency).toBe("high");
  });

  it("returns seat limit prompt for paid tier at capacity", async () => {
    const { account_id, rawKey } = await createAuthenticatedAccount("SeatFull", "seat-full@example.com", "paid");
    for (let i = 0; i < SEAT_LIMITS.paid; i++) {
      await req("POST", "/v1/account/seats", { email: `seat${i}@example.com` }, rawKey);
    }

    const res = await req("GET", "/v1/account/upgrade-prompt", undefined, rawKey);
    expect(res.status).toBe(200);
    const prompt = (res.data as Record<string, unknown>).prompt as Record<string, unknown>;
    expect(prompt.trigger).toBe("seat_limit_reached");
    expect(prompt.recommended_tier).toBe("suite");
  });
});

// ─── Dismiss Upgrade Prompt ─────────────────────────────────────

describe("POST /v1/account/upgrade-prompt/dismiss", () => {
  it("returns 401 without auth", async () => {
    const res = await req("POST", "/v1/account/upgrade-prompt/dismiss");
    expect(res.status).toBe(401);
  });

  it("dismisses and tracks the event", async () => {
    const { rawKey } = await createAuthenticatedAccount("Dismisser", "dismiss@example.com");
    const res = await req("POST", "/v1/account/upgrade-prompt/dismiss", { reason: "not_now" }, rawKey);
    expect(res.status).toBe(200);
    expect((res.data as Record<string, unknown>).dismissed).toBe(true);

    // Verify the event was tracked via funnel status
    const funnelRes = await req("GET", "/v1/account/funnel", undefined, rawKey);
    const events = ((funnelRes.data as Record<string, unknown>).recent_events as Array<Record<string, unknown>>);
    const dismissEvent = events.find(e => e.event_type === "upgrade_prompt_dismissed");
    expect(dismissEvent).toBeDefined();
  });
});

// ─── Funnel Status ──────────────────────────────────────────────

describe("GET /v1/account/funnel", () => {
  it("returns 401 without auth", async () => {
    const res = await req("GET", "/v1/account/funnel");
    expect(res.status).toBe(401);
  });

  it("returns funnel stage and events for new account", async () => {
    const { account_id, rawKey } = await createAuthenticatedAccount("FunnelNew", "funnel-new@example.com");
    const res = await req("GET", "/v1/account/funnel", undefined, rawKey);
    expect(res.status).toBe(200);

    const data = res.data as Record<string, unknown>;
    expect(data.account_id).toBe(account_id);
    expect(data.tier).toBe("free");
    expect(data.stage).toBe("signup");
    expect(data.recent_events).toBeDefined();
  });

  it("reflects stage progression with usage", async () => {
    const { account_id, rawKey } = await createAuthenticatedAccount("FunnelActive", "funnel-active@example.com");
    recordUsage(account_id, "search", "snap-1", 1, 1, 100);

    const res = await req("GET", "/v1/account/funnel", undefined, rawKey);
    expect((res.data as Record<string, unknown>).stage).toBe("activation");
  });

  it("respects ?limit= parameter", async () => {
    const { rawKey } = await createAuthenticatedAccount("FunnelLimit", "funnel-limit@example.com");

    // Dismiss a few prompts to generate events
    await req("POST", "/v1/account/upgrade-prompt/dismiss", {}, rawKey);
    await req("POST", "/v1/account/upgrade-prompt/dismiss", {}, rawKey);
    await req("POST", "/v1/account/upgrade-prompt/dismiss", {}, rawKey);

    const res = await req("GET", "/v1/account/funnel?limit=2", undefined, rawKey);
    expect(res.status).toBe(200);
    const events = (res.data as Record<string, unknown>).recent_events as unknown[];
    expect(events.length).toBeLessThanOrEqual(2);
  });

  it("paid account shows conversion stage", async () => {
    const { rawKey } = await createAuthenticatedAccount("FunnelPaid", "funnel-paid@example.com", "paid");
    const res = await req("GET", "/v1/account/funnel", undefined, rawKey);
    expect((res.data as Record<string, unknown>).tier).toBe("paid");
    expect((res.data as Record<string, unknown>).stage).toBe("conversion");
  });
});

// ─── Funnel Metrics ─────────────────────────────────────────────

describe("GET /v1/funnel/metrics", () => {
  it("returns 401 without auth", async () => {
    const res = await req("GET", "/v1/funnel/metrics");
    expect(res.status).toBe(401);
  });

  it("returns aggregate metrics", async () => {
    const { rawKey } = await createAuthenticatedAccount("MetricsUser", "metrics@example.com");
    const res = await req("GET", "/v1/funnel/metrics", undefined, rawKey);
    expect(res.status).toBe(200);

    const metrics = (res.data as Record<string, unknown>).metrics as Record<string, unknown>;
    expect(metrics.total_accounts).toBeGreaterThan(0);
    expect(metrics).toHaveProperty("conversion_rate");
    expect(metrics).toHaveProperty("activation_rate");
    expect(metrics).toHaveProperty("total_seats");
    expect(metrics).toHaveProperty("by_tier");
    expect(metrics).toHaveProperty("by_stage");
    expect(metrics).toHaveProperty("events_last_24h");
    expect(metrics).toHaveProperty("events_last_7d");
  });
});
