import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import { handleCreateSnapshot, handleGetSnapshot, handleGetContext, handleGetGeneratedFiles, handleGetGeneratedFile, handleSearchExport, handleHealthCheck } from "./handlers.js";
import { handleCreateAccount, handleGetAccount, handleCreateApiKey, handleListApiKeys, handleRevokeApiKey, handleGetUsage, handleUpdateTier, handleUpdatePrograms } from "./billing.js";
import { handleInviteSeat, handleListSeats, handleAcceptSeat, handleRevokeSeat, handleGetPlans } from "./funnel.js";
import { handleExportZip } from "./export.js";
import { resetRateLimits } from "./rate-limiter.js";

const TEST_PORT = 44402;
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
  router.get("/v1/health", handleHealthCheck);
  router.post("/v1/snapshots", handleCreateSnapshot);
  router.get("/v1/snapshots/:snapshot_id", handleGetSnapshot);
  router.get("/v1/projects/:project_id/context", handleGetContext);
  router.get("/v1/projects/:project_id/generated-files", handleGetGeneratedFiles);
  router.get("/v1/projects/:project_id/generated-files/:file_path*", handleGetGeneratedFile);
  router.post("/v1/search/export", handleSearchExport);
  router.get("/v1/projects/:project_id/export", handleExportZip);
  router.post("/v1/accounts", handleCreateAccount);
  router.get("/v1/account", handleGetAccount);
  router.post("/v1/account/keys", handleCreateApiKey);
  router.get("/v1/account/keys", handleListApiKeys);
  router.post("/v1/account/keys/:key_id/revoke", handleRevokeApiKey);
  router.get("/v1/account/usage", handleGetUsage);
  router.post("/v1/account/tier", handleUpdateTier);
  router.post("/v1/account/programs", handleUpdatePrograms);
  router.get("/v1/plans", handleGetPlans);
  router.post("/v1/account/seats", handleInviteSeat);
  router.get("/v1/account/seats", handleListSeats);
  router.post("/v1/account/seats/:seat_id/accept", handleAcceptSeat);
  router.post("/v1/account/seats/:seat_id/revoke", handleRevokeSeat);
  server = createApp(router, TEST_PORT);
  await new Promise<void>((r) => setTimeout(r, 100));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  closeDb();
});

beforeEach(() => {
  resetRateLimits();
});

// ─── Helpers ────────────────────────────────────────────────────

const SNAPSHOT_BODY = {
  manifest: {
    project_name: "integration-test",
    project_type: "web_application",
    frameworks: ["next"],
    goals: ["test"],
    requested_outputs: ["AGENTS.md"],
  },
  files: [
    { path: "src/index.ts", content: "export const x = 1;", size: 20 },
    { path: "package.json", content: '{"name":"test","dependencies":{"next":"14.0.0"}}', size: 50 },
  ],
};

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

// ─── 1. Account lifecycle ───────────────────────────────────────

describe("account lifecycle", () => {
  it("creates an account and returns API key", async () => {
    const r = await req("POST", "/v1/accounts", { name: "Alice", email: "alice@test.com" });
    expect(r.status).toBe(201);
    expect(r.data.account).toBeDefined();
    expect((r.data.account as Record<string, unknown>).name).toBe("Alice");
    expect(r.data.api_key).toBeDefined();
    expect((r.data.api_key as Record<string, unknown>).raw_key).toBeTruthy();
    expect(r.data.message).toContain("Save your API key");
  });

  it("retrieves account info with API key", async () => {
    const { key } = await createTestAccount("Bob", "bob@test.com");
    const r = await req("GET", "/v1/account", undefined, key);
    expect(r.status).toBe(200);
    expect((r.data.account as Record<string, unknown>).name).toBe("Bob");
    expect(r.data.entitlements).toBeDefined();
    expect(r.data.quota).toBeDefined();
  });

  it("creates additional API key", async () => {
    const { key } = await createTestAccount("Carol", "carol@test.com");
    const r = await req("POST", "/v1/account/keys", { label: "ci-key" }, key);
    expect(r.status).toBe(201);
    expect(r.data.raw_key).toBeTruthy();
    expect(r.data.label).toBe("ci-key");
  });

  it("lists API keys", async () => {
    const { key } = await createTestAccount("Dave", "dave@test.com");
    await req("POST", "/v1/account/keys", { label: "extra" }, key);
    const r = await req("GET", "/v1/account/keys", undefined, key);
    expect(r.status).toBe(200);
    expect((r.data.keys as unknown[]).length).toBeGreaterThanOrEqual(2);
  });

  it("revokes an API key and it stops working", async () => {
    const { key, account } = await createTestAccount("Eve", "eve@test.com");
    // Create a second key, then revoke it
    const k2 = await req("POST", "/v1/account/keys", { label: "revokable" }, key);
    const key2_id = k2.data.key_id as string;
    const key2_raw = k2.data.raw_key as string;

    // Key2 works
    const before = await req("GET", "/v1/account", undefined, key2_raw);
    expect(before.status).toBe(200);

    // Revoke key2
    const revokeRes = await req("POST", `/v1/account/keys/${key2_id}/revoke`, {}, key);
    expect(revokeRes.status).toBe(200);

    // Key2 no longer works
    const after = await req("GET", "/v1/account", undefined, key2_raw);
    expect(after.status).toBe(401);
  });
});

// ─── 2. Authenticated snapshot flow ────────────────────────────

describe("authenticated snapshot flow", () => {
  it("creates snapshot and retrieves it", async () => {
    const { key } = await createTestAccount("Frank", "frank@test.com");
    const snap = await req("POST", "/v1/snapshots", SNAPSHOT_BODY, key);
    expect(snap.status).toBe(201);
    const snapshotId = snap.data.snapshot_id as string;
    expect(snapshotId).toBeTruthy();

    const get = await req("GET", `/v1/snapshots/${snapshotId}`, undefined, key);
    expect(get.status).toBe(200);
    expect((get.data as Record<string, unknown>).snapshot_id).toBe(snapshotId);
  });

  it("usage is recorded after snapshot", async () => {
    const { key } = await createTestAccount("Grace", "grace@test.com");
    await req("POST", "/v1/snapshots", SNAPSHOT_BODY, key);
    await new Promise<void>((r) => setTimeout(r, 200));

    const usage = await req("GET", "/v1/account/usage", undefined, key);
    expect(usage.status).toBe(200);
  });

  it("generated files are accessible after snapshot", async () => {
    const { key } = await createTestAccount("Hank", "hank@test.com");
    const snap = await req("POST", "/v1/snapshots", SNAPSHOT_BODY, key);
    const projectId = snap.data.project_id as string;
    expect(projectId).toBeTruthy();

    const files = await req("GET", `/v1/projects/${projectId}/generated-files`, undefined, key);
    expect(files.status).toBe(200);
  });
});

// ─── 3. Tier upgrade flow ──────────────────────────────────────

describe("tier upgrade flow", () => {
  it("starts as free tier", async () => {
    const { key } = await createTestAccount("Ivan", "ivan@test.com");
    const r = await req("GET", "/v1/account", undefined, key);
    expect((r.data.account as Record<string, unknown>).tier).toBe("free");
  });

  it("upgrades tier from free to paid", async () => {
    const { key } = await createTestAccount("Judy", "judy@test.com");
    const r = await req("POST", "/v1/account/tier", { tier: "paid" }, key);
    expect(r.status).toBe(200);
    expect((r.data.account as Record<string, unknown>).tier).toBe("paid");
  });

  it("upgrades from paid to suite", async () => {
    const { key } = await createTestAccount("Karl", "karl@test.com");
    await req("POST", "/v1/account/tier", { tier: "paid" }, key);
    const r = await req("POST", "/v1/account/tier", { tier: "suite" }, key);
    expect(r.status).toBe(200);
    expect((r.data.account as Record<string, unknown>).tier).toBe("suite");
  });

  it("rejects invalid tier", async () => {
    const { key } = await createTestAccount("Lou", "lou@test.com");
    const r = await req("POST", "/v1/account/tier", { tier: "enterprise" }, key);
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });
});

// ─── 4. Program entitlements ────────────────────────────────────

describe("program entitlements", () => {
  it("free tier cannot manage programs", async () => {
    const { key } = await createTestAccount("Mike", "mike@test.com");
    const r = await req("POST", "/v1/account/programs", { enable: ["search"] }, key);
    expect(r.status).toBe(403);
    expect(r.data.error_code).toBe("TIER_REQUIRED");
  });

  it("paid tier can enable and disable programs", async () => {
    const { key } = await createTestAccount("Nina", "nina@test.com");
    await req("POST", "/v1/account/tier", { tier: "paid" }, key);

    const enable = await req("POST", "/v1/account/programs", { enable: ["search", "debug"] }, key);
    expect(enable.status).toBe(200);
    const programs = enable.data.programs as string[];
    expect(programs).toContain("search");
    expect(programs).toContain("debug");

    const disable = await req("POST", "/v1/account/programs", { disable: ["debug"] }, key);
    expect(disable.status).toBe(200);
    const afterDisable = disable.data.programs as string[];
    expect(afterDisable).toContain("search");
    expect(afterDisable).not.toContain("debug");
  });

  it("rejects invalid program names", async () => {
    const { key } = await createTestAccount("Oscar", "oscar@test.com");
    await req("POST", "/v1/account/tier", { tier: "paid" }, key);
    const r = await req("POST", "/v1/account/programs", { enable: ["nonexistent_program"] }, key);
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_PROGRAM");
  });
});

// ─── 5. Seat management ────────────────────────────────────────

describe("seat management", () => {
  it("invites a seat and lists it", async () => {
    const { key } = await createTestAccount("Pat", "pat@test.com");
    await req("POST", "/v1/account/tier", { tier: "paid" }, key);

    const invite = await req("POST", "/v1/account/seats", { email: "teammate@test.com", role: "member" }, key);
    expect(invite.status).toBe(201);
    expect(invite.data.seat).toBeDefined();

    const list = await req("GET", "/v1/account/seats", undefined, key);
    expect(list.status).toBe(200);
    const seats = list.data.seats as unknown[];
    expect(seats.length).toBeGreaterThanOrEqual(1);
  });

  it("accepts a seat invitation", async () => {
    // Owner invites a seat
    const { key: ownerKey } = await createTestAccount("Quinn", "quinn@test.com");
    await req("POST", "/v1/account/tier", { tier: "paid" }, ownerKey);
    const inviteeEmail = "accepter@test.com";
    const invite = await req("POST", "/v1/account/seats", { email: inviteeEmail, role: "member" }, ownerKey);
    const seatId = (invite.data.seat as Record<string, unknown>).seat_id as string;

    // The invitee needs their own account to accept
    const { key: inviteeKey } = await createTestAccount("Accepter", inviteeEmail);

    const accept = await req("POST", `/v1/account/seats/${seatId}/accept`, {}, inviteeKey);
    expect(accept.status).toBe(200);
    expect(accept.data.accepted).toBe(true);
  });

  it("revokes a seat", async () => {
    const { key } = await createTestAccount("Rita", "rita@test.com");
    await req("POST", "/v1/account/tier", { tier: "paid" }, key);

    const invite = await req("POST", "/v1/account/seats", { email: "revokee@test.com", role: "member" }, key);
    const seatId = (invite.data.seat as Record<string, unknown>).seat_id as string;

    const revoke = await req("POST", `/v1/account/seats/${seatId}/revoke`, {}, key);
    expect(revoke.status).toBe(200);
  });
});

// ─── 6. Invalid auth scenarios ──────────────────────────────────

describe("invalid auth scenarios", () => {
  it("rejects request with no auth header", async () => {
    const r = await req("GET", "/v1/account");
    expect(r.status).toBe(401);
    expect(r.data.error_code).toBe("AUTH_REQUIRED");
  });

  it("rejects request with invalid key format", async () => {
    const r = await req("GET", "/v1/account", undefined, "totally-not-a-valid-key");
    expect(r.status).toBe(401);
    expect(r.data.error_code).toBe("AUTH_REQUIRED");
  });

  it("rejects request with revoked key", async () => {
    const { key } = await createTestAccount("Sam", "sam@test.com");
    const k2 = await req("POST", "/v1/account/keys", { label: "temp" }, key);
    const key2_id = k2.data.key_id as string;
    const key2_raw = k2.data.raw_key as string;

    await req("POST", `/v1/account/keys/${key2_id}/revoke`, {}, key);

    const r = await req("GET", "/v1/account", undefined, key2_raw);
    expect(r.status).toBe(401);
  });

  it("duplicate email returns 409", async () => {
    const email = `dup-${Date.now()}@test.com`;
    await req("POST", "/v1/accounts", { name: "First", email });
    const r = await req("POST", "/v1/accounts", { name: "Second", email });
    expect(r.status).toBe(409);
    expect(r.data.error_code).toBe("CONFLICT");
  });
});

// ─── 7. Plans endpoint ─────────────────────────────────────────

describe("plans endpoint", () => {
  it("returns available plans", async () => {
    const r = await req("GET", "/v1/plans");
    expect(r.status).toBe(200);
    expect(r.data.plans).toBeDefined();
    const plans = r.data.plans as unknown[];
    expect(plans.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── 8. Cross-cutting: security + auth ─────────────────────────

describe("cross-cutting security", () => {
  it("security headers present on authenticated responses", async () => {
    const { key } = await createTestAccount("Tina", "tina@test.com");
    const r = await req("GET", "/v1/account", undefined, key);
    expect(r.status).toBe(200);
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-frame-options"]).toBe("DENY");
    expect(r.headers["x-request-id"]).toBeTruthy();
  });

  it("error responses include request_id for auth failures", async () => {
    const r = await req("GET", "/v1/account");
    expect(r.status).toBe(401);
    expect(r.data.request_id).toBeTruthy();
    expect(r.data.error_code).toBe("AUTH_REQUIRED");
  });
});

// ─── 8. Billing edge branches ───────────────────────────────────

describe("billing edge branches", () => {
  it("rejects enable as non-array in programs update", async () => {
    const { key } = await createTestAccount("NonArr", "nonarr@test.com");
    await req("POST", "/v1/account/tier", { tier: "paid" }, key);
    const r = await req("POST", "/v1/account/programs", { enable: "marketing" }, key);
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  it("rejects disable as non-array in programs update", async () => {
    const { key } = await createTestAccount("DisNon", "disnon@test.com");
    await req("POST", "/v1/account/tier", { tier: "paid" }, key);
    const r = await req("POST", "/v1/account/programs", { disable: 123 }, key);
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  it("returns 409 when revoking an already-revoked key", async () => {
    const { key } = await createTestAccount("DblRev", "dblrev@test.com");
    const key2 = await req("POST", "/v1/account/keys", { label: "temp" }, key);
    const key2_id = key2.data.key_id as string;
    await req("POST", `/v1/account/keys/${key2_id}/revoke`, {}, key);
    const r2 = await req("POST", `/v1/account/keys/${key2_id}/revoke`, {}, key);
    expect(r2.status).toBe(409);
    expect(r2.data.error_code).toBe("CONFLICT");
  });

  it("handles same-tier upgrade (no change)", async () => {
    const { key } = await createTestAccount("SameTier", "sametier@test.com");
    // Account starts as free, upgrade to free again
    const r = await req("POST", "/v1/account/tier", { tier: "free" }, key);
    expect(r.status).toBe(200);
  });

  // Layer 11: invalid tier value (billing.ts line 301-302)
  it("rejects invalid tier value", async () => {
    const { key } = await createTestAccount("BadTier", "badtier@test.com");
    const r = await req("POST", "/v1/account/tier", { tier: "premium" }, key);
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  // Layer 11: paid tier seat limit with upgrade hint (funnel.ts line 95 TRUE)
  it("returns upgrade hint for paid tier hitting seat limit", async () => {
    const { key } = await createTestAccount("PdSeat", "pdseat@test.com");
    // Upgrade to paid
    await req("POST", "/v1/account/tier", { tier: "paid" }, key);
    // Fill all 5 paid seats
    for (let i = 0; i < 5; i++) {
      await req("POST", "/v1/account/seats", { email: `seat${i}@pdseat.com`, role: "member" }, key);
    }
    // 6th invite should fail with seat limit + upgrade hint for paid tier
    const r = await req("POST", "/v1/account/seats", { email: "overflow@pdseat.com", role: "member" }, key);
    expect(r.status).toBe(429);
    expect(r.data.error_code).toBe("SEAT_LIMIT");
    expect(r.data.upgrade_hint).toBe("Upgrade to Enterprise Suite for unlimited seats");
  });

  // Layer 11: free tier blocked from inviting seats (funnel.ts line 49)
  it("returns 403 for free tier trying to invite seats", async () => {
    const { key } = await createTestAccount("FrSeat", "frseat@test.com");
    const r = await req("POST", "/v1/account/seats", { email: "one@frseat.com", role: "member" }, key);
    expect(r.status).toBe(403);
    expect(r.data.error_code).toBe("TIER_REQUIRED");
  });

  // Layer 11: revoke non-existent seat (funnel.ts lines 178-179)
  it("returns 404 when revoking non-existent seat", async () => {
    const { key } = await createTestAccount("RevNon", "revnon@test.com");
    const r = await req("POST", "/v1/account/seats/seat_nonexistent/revoke", {}, key);
    expect(r.status).toBe(404);
    expect(r.data.error_code).toBe("NOT_FOUND");
  });

  // Layer 11: revoke already-revoked seat (funnel.ts double-revoke)
  it("returns 404 when re-revoking a seat", async () => {
    const { key } = await createTestAccount("DblRevS", "dblrevs@test.com");
    // Upgrade to paid so we have seat capacity
    await req("POST", "/v1/account/tier", { tier: "paid" }, key);
    // Invite and get seat_id
    const inv = await req("POST", "/v1/account/seats", { email: "revokeme@dblrevs.com", role: "member" }, key);
    const seatId = (inv.data.seat as Record<string, unknown>).seat_id as string;
    // First revoke
    await req("POST", `/v1/account/seats/${seatId}/revoke`, {}, key);
    // Second revoke should fail
    const r2 = await req("POST", `/v1/account/seats/${seatId}/revoke`, {}, key);
    expect(r2.status).toBe(404);
    expect(r2.data.error_code).toBe("NOT_FOUND");
  });
});

// ─── Layer 13: billing branch coverage ──────────────────────────

describe("billing handler branch coverage", () => {
  // billing.ts line 249: revoke nonexistent key_id → 404
  it("returns 404 when revoking a nonexistent key_id", async () => {
    const { key } = await createTestAccount("RvKey", "rvkey@test.com");
    const r = await req("POST", "/v1/account/keys/key_nonexistent_9999/revoke", {}, key);
    expect(r.status).toBe(404);
    expect(r.data.error_code).toBe("NOT_FOUND");
  });

  // billing.ts line 301: invalid JSON for tier update
  it("returns 400 for invalid JSON on tier update", async () => {
    const { key } = await createTestAccount("TierJSON", "tierjson@test.com");
    // Send raw invalid JSON via low-level request
    const r = await new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
      const raw = "<<<not json>>>";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(raw)),
        "Authorization": `Bearer ${key}`,
      };
      const http = require("node:http");
      const r = http.request(
        { hostname: "127.0.0.1", port: TEST_PORT, path: "/v1/account/tier", method: "POST", headers },
        (res: import("node:http").IncomingMessage) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf-8");
            let data: unknown;
            try { data = JSON.parse(text); } catch { data = text; }
            resolve({ status: res.statusCode ?? 0, data: data as Record<string, unknown> });
          });
        },
      );
      r.on("error", reject);
      r.write(raw);
      r.end();
    });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_JSON");
  });
});
