/**
 * eq_130: Layer 5 API handler branch coverage
 * Targets uncovered branches in webhooks.ts, handlers.ts, billing.ts, funnel.ts, admin.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as http from "node:http";
import type { Server } from "node:http";
import {
  openMemoryDb,
  closeDb,
  createAccount,
  createApiKey,
  createWebhook,
} from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import {
  handleCreateWebhook,
  handleListWebhooks,
  handleDeleteWebhook,
  handleToggleWebhook,
  handleWebhookDeliveries,
} from "./webhooks.js";
import {
  handleSearchQuery,
  handleHealthCheck,
} from "./handlers.js";
import {
  handleUpdatePrograms,
  handleSaveGitHubToken,
  handleCreateAccount,
} from "./billing.js";
import {
  handleInviteSeat,
} from "./funnel.js";
import {
  handleAdminStats,
  handleAdminAccounts,
  handleAdminActivity,
} from "./admin.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;

interface Res {
  status: number;
  data: Record<string, unknown>;
}

async function req(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined
      ? typeof body === "string" ? body : JSON.stringify(body)
      : undefined;
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port: testPort,
        path,
        method,
        headers: { "Content-Type": "application/json", ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: Record<string, unknown> = {};
          try { data = JSON.parse(raw); } catch { data = { raw } as Record<string, unknown>; }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

let acctPaid: { id: string; auth: Record<string, string> };
let acctFree: { id: string; auth: Record<string, string> };

beforeAll(async () => {
  openMemoryDb();
  resetRateLimits();

  const router = new Router();
  router.get("/v1/health", handleHealthCheck);
  router.post("/v1/accounts", handleCreateAccount);
  // Webhook routes
  router.post("/v1/account/webhooks", handleCreateWebhook);
  router.get("/v1/account/webhooks", handleListWebhooks);
  router.delete("/v1/account/webhooks/:webhook_id", handleDeleteWebhook);
  router.post("/v1/account/webhooks/:webhook_id/toggle", handleToggleWebhook);
  router.get("/v1/account/webhooks/:webhook_id/deliveries", handleWebhookDeliveries);
  // Search
  router.post("/v1/search/query", handleSearchQuery);
  // Billing
  router.post("/v1/account/programs", handleUpdatePrograms);
  router.post("/v1/account/github-token", handleSaveGitHubToken);
  // Funnel
  router.post("/v1/account/seats", handleInviteSeat);
  // Admin
  router.get("/v1/admin/stats", handleAdminStats);
  router.get("/v1/admin/accounts", handleAdminAccounts);
  router.get("/v1/admin/activity", handleAdminActivity);

  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;

  const paid = createAccount("Paid User", "paid@test.com", "paid");
  const pKey = createApiKey(paid.account_id, "paid-key");
  acctPaid = { id: paid.account_id, auth: { Authorization: `Bearer ${pKey.rawKey}` } };
  process.env.ADMIN_API_KEY = pKey.rawKey;

  const free = createAccount("Free User", "free@test.com");
  const fKey = createApiKey(free.account_id, "free-key");
  acctFree = { id: free.account_id, auth: { Authorization: `Bearer ${fKey.rawKey}` } };
});

afterAll(async () => {
  delete process.env.ADMIN_API_KEY;
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  closeDb();
});

beforeEach(() => { resetRateLimits(); });

// ─── webhooks.ts branches ───────────────────────────────────────

describe("webhooks.ts — uncovered branches", () => {
  // Line 107: DELETE webhook not found
  it("returns 404 when deleting non-existent webhook", async () => {
    const r = await req("DELETE", "/v1/account/webhooks/wh_nonexistent", undefined, acctPaid.auth);
    expect(r.status).toBe(404);
    expect(r.data.error).toContain("not found");
  });

  // Line 128: Toggle webhook not found
  it("returns 404 when toggling non-existent webhook", async () => {
    const r = await req("POST", "/v1/account/webhooks/wh_nonexistent/toggle", { active: true }, acctPaid.auth);
    expect(r.status).toBe(404);
    expect(r.data.error).toContain("not found");
  });

  // Line 163: Deliveries webhook not found
  it("returns 404 for deliveries of non-existent webhook", async () => {
    const r = await req("GET", "/v1/account/webhooks/wh_nonexistent/deliveries", undefined, acctPaid.auth);
    expect(r.status).toBe(404);
    expect(r.data.error).toContain("not found");
  });

  // Line 173: Deliveries limit clamping
  it("clamps deliveries limit to valid range", async () => {
    const wh = createWebhook(acctPaid.id, "http://example.com/hook", ["snapshot.created"]);
    const r = await req("GET", `/v1/account/webhooks/${wh.webhook_id}/deliveries?limit=999`, undefined, acctPaid.auth);
    expect(r.status).toBe(200);
    // limit clamped to 100
    expect(r.data.deliveries).toBeDefined();
  });

  // Toggle with invalid JSON body
  it("returns 400 for toggle with invalid JSON", async () => {
    const wh = createWebhook(acctPaid.id, "http://example.com/hook2", ["snapshot.created"]);
    const r = await req("POST", `/v1/account/webhooks/${wh.webhook_id}/toggle`, "{ bad json", acctPaid.auth);
    expect(r.status).toBe(400);
  });

  // Toggle with non-boolean active field
  it("returns 400 for toggle with non-boolean active", async () => {
    const wh = createWebhook(acctPaid.id, "http://example.com/hook3", ["snapshot.created"]);
    const r = await req("POST", `/v1/account/webhooks/${wh.webhook_id}/toggle`, { active: "yes" }, acctPaid.auth);
    expect(r.status).toBe(400);
    expect(r.data.error).toContain("boolean");
  });

  // Delete webhook owned by different account
  it("returns 404 when deleting another account's webhook", async () => {
    const wh = createWebhook(acctPaid.id, "http://example.com/hook4", ["snapshot.created"]);
    const r = await req("DELETE", `/v1/account/webhooks/${wh.webhook_id}`, undefined, acctFree.auth);
    expect(r.status).toBe(404);
  });
});

// ─── handlers.ts branches ───────────────────────────────────────

describe("handlers.ts — search query branches", () => {
  // Lines 743-744: Invalid JSON in search query
  it("returns 400 for invalid JSON in search query", async () => {
    const r = await req("POST", "/v1/search/query", "{ bad json", acctPaid.auth);
    expect(r.status).toBe(400);
  });

  // Lines 749-750: Missing snapshot_id
  it("returns 400 for search query without snapshot_id", async () => {
    const r = await req("POST", "/v1/search/query", { query: "test" }, acctPaid.auth);
    expect(r.status).toBe(400);
    expect(r.data.error).toContain("snapshot_id");
  });

  // Missing query field
  it("returns 400 for search query without query field", async () => {
    const r = await req("POST", "/v1/search/query", { snapshot_id: "snap-123" }, acctPaid.auth);
    expect(r.status).toBe(400);
    expect(r.data.error).toContain("query");
  });
});

// ─── billing.ts branches ────────────────────────────────────────

describe("billing.ts — uncovered branches", () => {
  // Lines 346-347: Invalid JSON in handleUpdatePrograms
  it("returns 400 for invalid JSON in program update", async () => {
    const r = await req("POST", "/v1/account/programs", "{ bad json", acctPaid.auth);
    expect(r.status).toBe(400);
  });

  // Lines 437-438: Invalid JSON in handleSaveGitHubToken
  it("returns 400 for invalid JSON in github token save", async () => {
    const r = await req("POST", "/v1/account/github-token", "{ bad json", acctPaid.auth);
    expect(r.status).toBe(400);
  });

  // enable field must be an array
  it("returns 400 when enable is not an array", async () => {
    const r = await req("POST", "/v1/account/programs", { enable: "some-program" }, acctPaid.auth);
    expect(r.status).toBe(400);
    expect(r.data.error).toContain("array");
  });

  // Missing token field
  it("returns 400 when token field is missing", async () => {
    const r = await req("POST", "/v1/account/github-token", {}, acctPaid.auth);
    expect(r.status).toBe(400);
    expect(r.data.error).toContain("token");
  });
});

// ─── admin.ts branches ──────────────────────────────────────────

describe("admin.ts — uncovered branches", () => {
  // Line 30: admin stats without auth
  it("returns 401 for admin stats without auth", async () => {
    const r = await req("GET", "/v1/admin/stats");
    expect(r.status).toBe(401);
  });

  // Line 46: admin accounts limit/offset parsing
  it("admin accounts with custom limit and offset", async () => {
    const r = await req("GET", "/v1/admin/accounts?limit=5&offset=0", undefined, acctPaid.auth);
    expect(r.status).toBe(200);
    expect(r.data.limit).toBe(5);
    expect(r.data.offset).toBe(0);
  });

  // Admin activity with custom limit
  it("admin activity with custom limit", async () => {
    const r = await req("GET", "/v1/admin/activity?limit=10", undefined, acctPaid.auth);
    expect(r.status).toBe(200);
    expect(r.data.events).toBeDefined();
  });
});

// ─── funnel.ts branches ─────────────────────────────────────────

describe("funnel.ts — uncovered branches", () => {
  // Line 95: invalid JSON in seat invitation
  it("returns 400 for invalid JSON in seat invite", async () => {
    const r = await req("POST", "/v1/account/seats", "{ bad json", acctPaid.auth);
    expect(r.status).toBe(400);
  });

  // Missing required fields
  it("returns 400 for seat invite missing email", async () => {
    const r = await req("POST", "/v1/account/seats", { role: "member" }, acctPaid.auth);
    expect(r.status).toBe(400);
  });
});
