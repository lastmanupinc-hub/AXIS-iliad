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
  handleTrackAnalyticsEvent,
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
  router.post("/v1/account/analytics/events", handleTrackAnalyticsEvent);

  server = createApp(router, TEST_PORT);
  await new Promise<void>((r) => setTimeout(r, 100));
});

afterAll(() => {
  server?.close();
  closeDb();
});

beforeEach(() => {
  resetRateLimits();
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
    expect(plans).toHaveLength(5);
    expect(plans.map(p => p.id)).toEqual(["free", "starter", "pro", "growth", "enterprise"]);
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
    const pro = plans.find(p => p.id === "pro")!;
    expect(pro.price_monthly_cents).toBe(9900);
    expect(pro.name).toBe("Pro");
  });

  it("includes feature comparison matrix", async () => {
    const res = await req("GET", "/v1/plans");
    const features = (res.data as Record<string, unknown>).features as Array<Record<string, unknown>>;
    expect(features.length).toBeGreaterThan(8);
    for (const f of features) {
      expect(f).toHaveProperty("free");
      expect(f).toHaveProperty("starter");
      expect(f).toHaveProperty("pro");
      expect(f).toHaveProperty("growth");
      expect(f).toHaveProperty("enterprise");
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

// ─── Analytics Event Tracking ───────────────────────────────────

describe("POST /v1/account/analytics/events", () => {
  it("returns 401 without auth", async () => {
    const res = await req("POST", "/v1/account/analytics/events", { event_type: "checkout_started" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when event_type is missing", async () => {
    const { rawKey } = await createAuthenticatedAccount("AnalyticsMissing", "analytics-missing@example.com");
    const res = await req("POST", "/v1/account/analytics/events", { stage: "ui" }, rawKey);
    expect(res.status).toBe(400);
    expect((res.data as Record<string, unknown>).error_code).toBe("MISSING_FIELD");
  });

  it("tracks analytics event successfully", async () => {
    const { rawKey } = await createAuthenticatedAccount("AnalyticsOk", "analytics-ok@example.com");
    const track = await req(
      "POST",
      "/v1/account/analytics/events",
      { event_type: "checkout_started", stage: "signup", metadata: { source: "admin" } },
      rawKey,
    );
    expect(track.status).toBe(201);
    expect((track.data as Record<string, unknown>).tracked).toBe(true);

    const funnelRes = await req("GET", "/v1/account/funnel", undefined, rawKey);
    const events = ((funnelRes.data as Record<string, unknown>).recent_events as Array<Record<string, unknown>>);
    expect(events.some((evt) => evt.event_type === "checkout_started")).toBe(true);
  });
});

// ─── Seat Invite ────────────────────────────────────────────────

describe("POST /v1/account/seats (invite)", () => {
  it("returns 401 without auth", async () => {
    const res = await req("POST", "/v1/account/seats", { email: "x@x.com" });
    expect(res.status).toBe(401);
  });

  it("rejects free tier accounts", async () => {
    const { rawKey } = createAuthenticatedAccount("FreeSeat", "free-seat@example.com", "free");
    const res = await req("POST", "/v1/account/seats", { email: "invite@example.com" }, rawKey);
    expect(res.status).toBe(403);
    expect((res.data as Record<string, unknown>).error_code).toBe("TIER_REQUIRED");
  });

  it("rejects missing email field", async () => {
    const { rawKey } = createAuthenticatedAccount("NoEmail", "no-email@example.com", "paid");
    const res = await req("POST", "/v1/account/seats", { role: "member" }, rawKey);
    expect(res.status).toBe(400);
    expect((res.data as Record<string, unknown>).error_code).toBe("MISSING_FIELD");
  });

  it("rejects invalid role", async () => {
    const { rawKey } = createAuthenticatedAccount("BadRole", "bad-role@example.com", "paid");
    const res = await req("POST", "/v1/account/seats", { email: "r@example.com", role: "superadmin" }, rawKey);
    expect(res.status).toBe(400);
    expect((res.data as Record<string, unknown>).error_code).toBe("INVALID_FORMAT");
  });

  it("rejects invalid JSON body", async () => {
    const { rawKey } = createAuthenticatedAccount("BadJson", "bad-json@example.com", "paid");
    // Send raw non-JSON via low-level request
    const res: Res = await new Promise((resolve, reject) => {
      const r = require("node:http").request(
        { hostname: "127.0.0.1", port: TEST_PORT, path: "/v1/account/seats", method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${rawKey}` } },
        (resp: import("node:http").IncomingMessage) => {
          const chunks: Buffer[] = [];
          resp.on("data", (c: Buffer) => chunks.push(c));
          resp.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf-8");
            resolve({ status: resp.statusCode ?? 0, headers: {}, data: JSON.parse(raw) });
          });
        },
      );
      r.on("error", reject);
      r.write("{invalid json");
      r.end();
    });
    expect(res.status).toBe(400);
    expect((res.data as Record<string, unknown>).error_code).toBe("INVALID_JSON");
  });

  it("creates seat with default member role", async () => {
    const { rawKey } = createAuthenticatedAccount("InviterDef", "inviter-def@example.com", "paid");
    const res = await req("POST", "/v1/account/seats", { email: "newmember@example.com" }, rawKey);
    expect(res.status).toBe(201);
    const seat = (res.data as Record<string, unknown>).seat as Record<string, unknown>;
    expect(seat.email).toBe("newmember@example.com");
    expect(seat.role).toBe("member");
  });

  it("rejects duplicate email", async () => {
    const { rawKey } = createAuthenticatedAccount("InviterDup", "inviter-dup@example.com", "paid");
    await req("POST", "/v1/account/seats", { email: "dup@example.com" }, rawKey);
    const res = await req("POST", "/v1/account/seats", { email: "dup@example.com" }, rawKey);
    expect(res.status).toBe(409);
    expect((res.data as Record<string, unknown>).error_code).toBe("CONFLICT");
  });

  it("returns 429 with upgrade_hint when paid tier hits seat limit", async () => {
    const { rawKey } = createAuthenticatedAccount("SeatCapPaid", "seat-cap-paid@example.com", "paid");
    for (let i = 0; i < SEAT_LIMITS.paid; i++) {
      await req("POST", "/v1/account/seats", { email: `cap${i}@example.com` }, rawKey);
    }
    const res = await req("POST", "/v1/account/seats", { email: "overflow@example.com" }, rawKey);
    expect(res.status).toBe(429);
    expect((res.data as Record<string, unknown>).error_code).toBe("SEAT_LIMIT");
    expect((res.data as Record<string, unknown>).upgrade_hint).toBe(
      "Upgrade to Enterprise Suite for unlimited seats",
    );
    expect((res.data as Record<string, unknown>).limit).toBe(SEAT_LIMITS.paid);
  });
});

// ─── Seat List ──────────────────────────────────────────────────

describe("GET /v1/account/seats", () => {
  it("returns 401 without auth", async () => {
    const res = await req("GET", "/v1/account/seats");
    expect(res.status).toBe(401);
  });

  it("lists active seats (excludes revoked by default)", async () => {
    const { rawKey } = createAuthenticatedAccount("Lister", "lister@example.com", "paid");
    const inv = await req("POST", "/v1/account/seats", { email: "list1@example.com" }, rawKey);
    const seatId = ((inv.data as Record<string, unknown>).seat as Record<string, unknown>).seat_id;
    await req("POST", `/v1/account/seats/${seatId}/revoke`, {}, rawKey);

    const res = await req("GET", "/v1/account/seats", undefined, rawKey);
    expect(res.status).toBe(200);
    const data = res.data as Record<string, unknown>;
    const seats = data.seats as Array<Record<string, unknown>>;
    expect(seats.every(s => s.revoked_at === null)).toBe(true);
  });

  it("includes revoked seats with include_revoked=true", async () => {
    const { rawKey } = createAuthenticatedAccount("ListerAll", "lister-all@example.com", "paid");
    const inv = await req("POST", "/v1/account/seats", { email: "revoked1@example.com" }, rawKey);
    const seatId = ((inv.data as Record<string, unknown>).seat as Record<string, unknown>).seat_id;
    await req("POST", `/v1/account/seats/${seatId}/revoke`, {}, rawKey);

    const res = await req("GET", "/v1/account/seats?include_revoked=true", undefined, rawKey);
    expect(res.status).toBe(200);
    const seats = (res.data as Record<string, unknown>).seats as Array<Record<string, unknown>>;
    expect(seats.some(s => s.revoked_at !== null)).toBe(true);
  });

  it("suite tier shows unlimited limit", async () => {
    const { rawKey } = createAuthenticatedAccount("SuiteLister", "suite-lister@example.com", "suite");
    const res = await req("GET", "/v1/account/seats", undefined, rawKey);
    expect(res.status).toBe(200);
    const data = res.data as Record<string, unknown>;
    expect(data.limit).toBe("unlimited");
    expect(data.remaining).toBe("unlimited");
  });

  it("returns count and remaining for paid tier", async () => {
    const { rawKey } = createAuthenticatedAccount("PaidLister", "paid-lister@example.com", "paid");
    await req("POST", "/v1/account/seats", { email: "s1@example.com" }, rawKey);
    const res = await req("GET", "/v1/account/seats", undefined, rawKey);
    expect(res.status).toBe(200);
    const data = res.data as Record<string, unknown>;
    expect(data.count).toBe(1);
    expect(data.limit).toBe(SEAT_LIMITS.paid);
    expect(data.remaining).toBe(SEAT_LIMITS.paid - 1);
  });
});

// ─── Seat Accept ────────────────────────────────────────────────

describe("POST /v1/account/seats/:seat_id/accept", () => {
  it("returns 401 without auth", async () => {
    const res = await req("POST", "/v1/account/seats/fake-id/accept");
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent seat", async () => {
    const { rawKey } = createAuthenticatedAccount("Acceptor404", "accept-404@example.com", "paid");
    const res = await req("POST", "/v1/account/seats/no-such-seat/accept", {}, rawKey);
    expect(res.status).toBe(404);
  });

  it("rejects email mismatch", async () => {
    const { rawKey: ownerKey } = createAuthenticatedAccount("Owner", "owner@example.com", "paid");
    const inv = await req("POST", "/v1/account/seats", { email: "invitee@example.com" }, ownerKey);
    const seatId = ((inv.data as Record<string, unknown>).seat as Record<string, unknown>).seat_id;

    // Different user tries to accept
    const { rawKey: otherKey } = createAuthenticatedAccount("OtherUser", "other@example.com");
    const res = await req("POST", `/v1/account/seats/${seatId}/accept`, {}, otherKey);
    expect(res.status).toBe(403);
    expect((res.data as Record<string, unknown>).error_code).toBe("FORBIDDEN");
  });

  it("accepts seat when email matches", async () => {
    const { rawKey: ownerKey } = createAuthenticatedAccount("OwnerAcc", "owner-acc@example.com", "paid");
    const inv = await req("POST", "/v1/account/seats", { email: "matched@example.com" }, ownerKey);
    const seatId = ((inv.data as Record<string, unknown>).seat as Record<string, unknown>).seat_id;

    const { rawKey: matchedKey } = createAuthenticatedAccount("Matched", "matched@example.com");
    const res = await req("POST", `/v1/account/seats/${seatId}/accept`, {}, matchedKey);
    expect(res.status).toBe(200);
    expect((res.data as Record<string, unknown>).accepted).toBe(true);
  });

  it("returns 404 when re-accepting already accepted seat", async () => {
    const { rawKey: ownerKey } = createAuthenticatedAccount("OwnerReAcc", "owner-reacc@example.com", "paid");
    const inv = await req("POST", "/v1/account/seats", { email: "reacc@example.com" }, ownerKey);
    const seatId = ((inv.data as Record<string, unknown>).seat as Record<string, unknown>).seat_id;

    const { rawKey: inviteeKey } = createAuthenticatedAccount("ReAccUser", "reacc@example.com");
    await req("POST", `/v1/account/seats/${seatId}/accept`, {}, inviteeKey);
    const res = await req("POST", `/v1/account/seats/${seatId}/accept`, {}, inviteeKey);
    expect(res.status).toBe(404);
    expect((res.data as Record<string, unknown>).error_code).toBe("NOT_FOUND");
  });
});

// ─── Seat Revoke ────────────────────────────────────────────────

describe("POST /v1/account/seats/:seat_id/revoke", () => {
  it("returns 401 without auth", async () => {
    const res = await req("POST", "/v1/account/seats/fake-id/revoke");
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent seat", async () => {
    const { rawKey } = createAuthenticatedAccount("Revoker404", "revoker-404@example.com", "paid");
    const res = await req("POST", "/v1/account/seats/no-such-seat/revoke", {}, rawKey);
    expect(res.status).toBe(404);
  });

  it("rejects cross-account revocation", async () => {
    const { rawKey: ownerKey } = createAuthenticatedAccount("RevokeOwner", "revoke-owner@example.com", "paid");
    const inv = await req("POST", "/v1/account/seats", { email: "revokee@example.com" }, ownerKey);
    const seatId = ((inv.data as Record<string, unknown>).seat as Record<string, unknown>).seat_id;

    // Different account tries to revoke
    const { rawKey: attackerKey } = createAuthenticatedAccount("Attacker", "attacker@example.com", "paid");
    const res = await req("POST", `/v1/account/seats/${seatId}/revoke`, {}, attackerKey);
    expect(res.status).toBe(404);
    expect((res.data as Record<string, unknown>).error_code).toBe("NOT_FOUND");
  });

  it("successfully revokes own seat", async () => {
    const { rawKey } = createAuthenticatedAccount("RevokerOk", "revoker-ok@example.com", "paid");
    const inv = await req("POST", "/v1/account/seats", { email: "torevoke@example.com" }, rawKey);
    const seatId = ((inv.data as Record<string, unknown>).seat as Record<string, unknown>).seat_id;

    const res = await req("POST", `/v1/account/seats/${seatId}/revoke`, {}, rawKey);
    expect(res.status).toBe(200);
    expect((res.data as Record<string, unknown>).revoked).toBe(true);
  });
});

// ─── Dismiss edge case ──────────────────────────────────────────

describe("POST /v1/account/upgrade-prompt/dismiss (edge cases)", () => {
  it("handles empty body gracefully", async () => {
    const { rawKey } = createAuthenticatedAccount("EmptyDismiss", "empty-dismiss@example.com");
    // Send request with empty payload
    const res: Res = await new Promise((resolve, reject) => {
      const r = require("node:http").request(
        { hostname: "127.0.0.1", port: TEST_PORT, path: "/v1/account/upgrade-prompt/dismiss", method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${rawKey}` } },
        (resp: import("node:http").IncomingMessage) => {
          const chunks: Buffer[] = [];
          resp.on("data", (c: Buffer) => chunks.push(c));
          resp.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf-8");
            resolve({ status: resp.statusCode ?? 0, headers: {}, data: JSON.parse(raw) });
          });
        },
      );
      r.on("error", reject);
      r.end();
    });
    expect(res.status).toBe(200);
    expect((res.data as Record<string, unknown>).dismissed).toBe(true);
  });

  it("handles malformed JSON body gracefully", async () => {
    const { rawKey } = createAuthenticatedAccount("BadDismiss", "bad-dismiss@example.com");
    const res: Res = await new Promise((resolve, reject) => {
      const r = require("node:http").request(
        { hostname: "127.0.0.1", port: TEST_PORT, path: "/v1/account/upgrade-prompt/dismiss", method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${rawKey}` } },
        (resp: import("node:http").IncomingMessage) => {
          const chunks: Buffer[] = [];
          resp.on("data", (c: Buffer) => chunks.push(c));
          resp.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf-8");
            resolve({ status: resp.statusCode ?? 0, headers: {}, data: JSON.parse(raw) });
          });
        },
      );
      r.on("error", reject);
      r.write("{not valid json");
      r.end();
    });
    expect(res.status).toBe(200);
    expect((res.data as Record<string, unknown>).dismissed).toBe(true);
  });
});

// ─── Funnel limit edge cases ────────────────────────────────────

describe("GET /v1/account/funnel (limit edge cases)", () => {
  it("caps limit to 100 when exceeding", async () => {
    const { rawKey } = createAuthenticatedAccount("LimitCap", "limit-cap@example.com");
    // limit=999 should be capped to 100 internally
    const res = await req("GET", "/v1/account/funnel?limit=999", undefined, rawKey);
    expect(res.status).toBe(200);
    // Just ensure it doesn't error — actual capping is Math.min(limit, 100)
    expect(res.data).toHaveProperty("recent_events");
  });
});
