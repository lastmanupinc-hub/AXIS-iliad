import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { resetTestDb, recordMcpUsage, updateAccountPaidPlanId } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleCreateAccount } from "./billing.js";
import { handleAdminStats, handleAdminAccounts, handleAdminActivity, handleAdminMcpUsage, handleAdminRevenue, handleListEntitlements, handleAdminGrantEntitlement } from "./admin.js";
import { handleCreateSnapshot, handleHealthCheck } from "./handlers.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;

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
      { hostname: "127.0.0.1", port: testPort, path, method, headers },
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

let apiKey: string;
let nonAdminKey: string;
let nonAdminAccountId: string;

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();
  const router = new Router();
  router.get("/v1/health", handleHealthCheck);
  router.post("/v1/accounts", handleCreateAccount);
  router.post("/v1/snapshots", handleCreateSnapshot);
  router.get("/v1/admin/stats", handleAdminStats);
  router.get("/v1/admin/accounts", handleAdminAccounts);
  router.get("/v1/admin/activity", handleAdminActivity);
  router.get("/v1/admin/mcp-usage", handleAdminMcpUsage);
  router.get("/v1/admin/revenue", handleAdminRevenue);
  router.get("/v1/account/entitlements", handleListEntitlements);
  router.post("/v1/admin/entitlements/grant", handleAdminGrantEntitlement);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;

  // Create an admin account
  const acct = await req("POST", "/v1/accounts", { name: "Admin Tester", email: "admin@test.com" });
  apiKey = (acct.data as any).api_key.raw_key;
  process.env.ADMIN_API_KEY = apiKey;

  // Create a non-admin account
  const acct2 = await req("POST", "/v1/accounts", { name: "Regular User", email: "regular@test.com" });
  nonAdminKey = (acct2.data as any).api_key.raw_key;
  nonAdminAccountId = (acct2.data as any).account.account_id;
});

afterAll(async () => {
  delete process.env.ADMIN_API_KEY;
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

beforeEach(() => {
  resetRateLimits();
});

describe("GET /v1/admin/stats", () => {
  it("requires authentication", async () => {
    const r = await req("GET", "/v1/admin/stats");
    expect(r.status).toBe(401);
  });

  it("returns system-wide stats", async () => {
    const r = await req("GET", "/v1/admin/stats", undefined, apiKey);
    expect(r.status).toBe(200);
    expect(r.data.total_accounts).toBeGreaterThanOrEqual(1);
    expect(r.data.accounts_by_tier).toBeDefined();
    const byTier = r.data.accounts_by_tier as Record<string, number>;
    expect(byTier.free).toBeGreaterThanOrEqual(1);
    expect(typeof r.data.total_snapshots).toBe("number");
    expect(typeof r.data.total_projects).toBe("number");
    expect(typeof r.data.total_api_keys).toBe("number");
    expect(typeof r.data.active_api_keys).toBe("number");
  });
});

describe("GET /v1/admin/accounts", () => {
  it("requires authentication", async () => {
    const r = await req("GET", "/v1/admin/accounts");
    expect(r.status).toBe(401);
  });

  it("returns paginated account list", async () => {
    const r = await req("GET", "/v1/admin/accounts", undefined, apiKey);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data.accounts)).toBe(true);
    expect(r.data.total).toBeGreaterThanOrEqual(2);
    expect(r.data.limit).toBe(50);
    expect(r.data.offset).toBe(0);
    const accounts = r.data.accounts as Array<Record<string, unknown>>;
    expect(accounts[0].account_id).toBeDefined();
    const adminAccount = accounts.find((a) => a.email === "admin@test.com");
    expect(adminAccount).toBeDefined();
    expect(adminAccount!.name).toBe("Admin Tester");
    expect(adminAccount!.tier).toBe("free");
  });

  // H-Phase-A cycle 2: Starter/Pro both show as tier==="paid" in this list —
  // paid_plan_id disambiguates them for support/ops, a real (if low-severity)
  // visibility gap the admin account list had no way to close before this.
  it("surfaces paid_plan_id so a Pro account is distinguishable from a Starter one", async () => {
    const created = await req("POST", "/v1/accounts", { name: "Pro Admin View", email: "pro-admin-view@test.com" });
    const accountId = (created.data.account as Record<string, unknown>).account_id as string;
    await updateAccountPaidPlanId(accountId, "pro");

    const r = await req("GET", "/v1/admin/accounts?limit=200", undefined, apiKey);
    expect(r.status).toBe(200);
    const accounts = r.data.accounts as Array<Record<string, unknown>>;
    const proAccount = accounts.find((a) => a.account_id === accountId);
    expect(proAccount).toBeDefined();
    expect(proAccount!.paid_plan_id).toBe("pro");
  });

  it("respects limit and offset params", async () => {
    // Create a second account
    await req("POST", "/v1/accounts", { name: "Second User", email: "second@test.com" });

    const r1 = await req("GET", "/v1/admin/accounts?limit=1&offset=0", undefined, apiKey);
    expect(r1.status).toBe(200);
    expect((r1.data.accounts as unknown[]).length).toBe(1);
    expect(r1.data.limit).toBe(1);

    const r2 = await req("GET", "/v1/admin/accounts?limit=1&offset=1", undefined, apiKey);
    expect(r2.status).toBe(200);
    expect((r2.data.accounts as unknown[]).length).toBe(1);
    expect(r2.data.offset).toBe(1);
  });
});

describe("GET /v1/admin/activity", () => {
  it("requires authentication", async () => {
    const r = await req("GET", "/v1/admin/activity");
    expect(r.status).toBe(401);
  });

  it("returns recent activity events", async () => {
    const r = await req("GET", "/v1/admin/activity", undefined, apiKey);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data.events)).toBe(true);
    expect(typeof r.data.count).toBe("number");
    // Should have at least the account_created events from setup
    const events = r.data.events as Array<Record<string, unknown>>;
    if (events.length > 0) {
      expect(events[0].event_id).toBeDefined();
      expect(events[0].account_id).toBeDefined();
      expect(events[0].event_type).toBeDefined();
      expect(events[0].created_at).toBeDefined();
    }
  });

  it("respects limit param", async () => {
    const r = await req("GET", "/v1/admin/activity?limit=1", undefined, apiKey);
    expect(r.status).toBe(200);
    expect((r.data.events as unknown[]).length).toBeLessThanOrEqual(1);
  });
});

describe("GET /v1/admin/revenue", () => {
  it("rejects unauthenticated requests", async () => {
    const r = await req("GET", "/v1/admin/revenue");
    expect(r.status).toBe(401);
  });

  it("rejects a non-admin key", async () => {
    const r = await req("GET", "/v1/admin/revenue", undefined, nonAdminKey);
    expect(r.status).toBe(403);
  });

  it("returns the growth + revenue readout for an admin", async () => {
    const r = await req("GET", "/v1/admin/revenue", undefined, apiKey);
    expect(r.status).toBe(200);
    const d = r.data as any;
    expect(d.accounts.total).toBeGreaterThanOrEqual(2); // admin + regular from setup
    expect(d.revenue.mrr_basis_cents).toEqual({ starter: 2900, pro: 9900, suite: 29900 });
    expect(typeof d.revenue.estimated_mrr_cents).toBe("number");
    expect(typeof d.revenue.metered_overage_cents_this_month).toBe("number");
    expect(typeof d.funnel.conversion_rate).toBe("number");
    expect(typeof d.mcp_engagement.total_calls).toBe("number");
  });
});

describe("GET /v1/admin/mcp-usage", () => {
  it("requires authentication", async () => {
    const r = await req("GET", "/v1/admin/mcp-usage");
    expect(r.status).toBe(401);
  });

  it("returns 403 for a non-admin key", async () => {
    const r = await req("GET", "/v1/admin/mcp-usage", undefined, nonAdminKey);
    expect(r.status).toBe(403);
  });

  it("returns persistent MCP usage analytics for the admin key", async () => {
    await recordMcpUsage({ account_id: "acc_x", tool: "analyze_repo", source: "claude", probe_class: "dev-tool" });
    await recordMcpUsage({ account_id: null, tool: "list_programs", source: "smithery", probe_class: "registry-crawler" });

    const r = await req("GET", "/v1/admin/mcp-usage", undefined, apiKey);
    expect(r.status).toBe(200);

    const windows = r.data.windows as Record<string, number>;
    expect(windows.total).toBeGreaterThanOrEqual(2);
    expect(typeof windows.last_24h).toBe("number");
    expect(typeof windows.last_7d).toBe("number");
    expect(typeof windows.last_30d).toBe("number");

    const summary = r.data.summary as Record<string, unknown>;
    expect(summary.window_days).toBe(30);
    expect((summary.by_source as Record<string, number>)["claude"]).toBeGreaterThanOrEqual(1);
    expect(summary.anonymous_calls).toBeGreaterThanOrEqual(1);
    expect((summary.by_tool as Record<string, number>)["analyze_repo"]).toBeGreaterThanOrEqual(1);

    expect(r.data.new_vs_returning).toBeDefined();
    expect(typeof (r.data.new_vs_returning as Record<string, number>).new_accounts).toBe("number");
  });

  it("honors a custom window_days param (clamped)", async () => {
    const r = await req("GET", "/v1/admin/mcp-usage?window_days=7", undefined, apiKey);
    expect(r.status).toBe(200);
    expect((r.data.summary as Record<string, unknown>).window_days).toBe(7);

    const clamped = await req("GET", "/v1/admin/mcp-usage?window_days=9999", undefined, apiKey);
    expect((clamped.data.summary as Record<string, unknown>).window_days).toBe(365);
  });
});

// ─── Auth failure branches ──────────────────────────────────────

describe("Admin auth failure branches", () => {
  it("stats returns 401 without auth", async () => {
    const r = await req("GET", "/v1/admin/stats");
    expect(r.status).toBe(401);
  });

  it("accounts returns 401 without auth", async () => {
    const r = await req("GET", "/v1/admin/accounts");
    expect(r.status).toBe(401);
  });

  it("activity returns 401 without auth", async () => {
    const r = await req("GET", "/v1/admin/activity");
    expect(r.status).toBe(401);
  });

  it("stats returns 403 for non-admin key", async () => {
    const r = await req("GET", "/v1/admin/stats", undefined, nonAdminKey);
    expect(r.status).toBe(403);
    expect(r.data.error).toContain("Admin");
  });

  it("accounts returns 403 for non-admin key", async () => {
    const r = await req("GET", "/v1/admin/accounts", undefined, nonAdminKey);
    expect(r.status).toBe(403);
  });

  it("activity returns 403 for non-admin key", async () => {
    const r = await req("GET", "/v1/admin/activity", undefined, nonAdminKey);
    expect(r.status).toBe(403);
  });

  it("returns 403 when ADMIN_API_KEY is not configured", async () => {
    const saved = process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_API_KEY;
    const r = await req("GET", "/v1/admin/stats", undefined, apiKey);
    expect(r.status).toBe(403);
    expect(r.data.error).toContain("not configured");
    process.env.ADMIN_API_KEY = saved;
  });
});

// ─── Boundary clamping branches ─────────────────────────────────

describe("admin param clamping", () => {
  it("accounts defaults limit=0 to 50 (falsy fallback)", async () => {
    const r = await req("GET", "/v1/admin/accounts?limit=0", undefined, apiKey);
    expect(r.status).toBe(200);
    expect(r.data.limit).toBe(50);
  });

  it("accounts clamps limit=-10 to 1", async () => {
    const r = await req("GET", "/v1/admin/accounts?limit=-10", undefined, apiKey);
    expect(r.status).toBe(200);
    expect(r.data.limit).toBe(1);
  });

  it("accounts clamps limit=999 to 200 (Math.min branch)", async () => {
    const r = await req("GET", "/v1/admin/accounts?limit=999", undefined, apiKey);
    expect(r.status).toBe(200);
    expect(r.data.limit).toBe(200);
  });

  it("accounts clamps negative offset to 0", async () => {
    const r = await req("GET", "/v1/admin/accounts?offset=-5", undefined, apiKey);
    expect(r.status).toBe(200);
    expect(r.data.offset).toBe(0);
  });

  it("activity clamps limit=0 to 1", async () => {
    const r = await req("GET", "/v1/admin/activity?limit=0", undefined, apiKey);
    expect(r.status).toBe(200);
    // Activity was fetched successfully
  });

  // Layer 12: NaN fallback branches (admin.ts lines 30, 46)
  it("accounts uses default limit when param is NaN", async () => {
    const r = await req("GET", "/v1/admin/accounts?limit=abc", undefined, apiKey);
    expect(r.status).toBe(200);
    expect(r.data.limit).toBe(50); // || 50 fallback
  });

  it("accounts uses default offset when param is NaN", async () => {
    const r = await req("GET", "/v1/admin/accounts?offset=abc", undefined, apiKey);
    expect(r.status).toBe(200);
    expect(r.data.offset).toBe(0); // || 0 fallback
  });

  it("activity uses default limit when param is NaN", async () => {
    const r = await req("GET", "/v1/admin/activity?limit=abc", undefined, apiKey);
    expect(r.status).toBe(200);
    // NaN || 50 → clamp → valid limit
  });
});

// Hub-and-spoke product entitlements (docs/saas-strategy/CONSOLIDATION.md).
// A deliberately NEW, additive-only surface — neither handler touches
// accounts.tier or any of the 43 existing tier-gated call sites, so these
// tests never assert anything about an account's tier or program access.
describe("GET /v1/account/entitlements", () => {
  it("requires authentication", async () => {
    const r = await req("GET", "/v1/account/entitlements");
    expect(r.status).toBe(401);
  });

  it("is empty for an account with no grants", async () => {
    const r = await req("GET", "/v1/account/entitlements", undefined, nonAdminKey);
    expect(r.status).toBe(200);
    expect(r.data.entitlements).toEqual([]);
  });

  it("reflects a grant made via the admin endpoint, with a resolved product name", async () => {
    const grant = await req(
      "POST",
      "/v1/admin/entitlements/grant",
      { account_id: nonAdminAccountId, product_id: "socket" },
      apiKey,
    );
    expect(grant.status).toBe(200);

    const r = await req("GET", "/v1/account/entitlements", undefined, nonAdminKey);
    expect(r.status).toBe(200);
    const entitlements = r.data.entitlements as Array<Record<string, unknown>>;
    expect(entitlements.length).toBe(1);
    expect(entitlements[0].product_id).toBe("socket");
    expect(entitlements[0].product_name).toBe("Socket");
    expect(entitlements[0].source).toBe("manual");
  });
});

describe("POST /v1/admin/entitlements/grant", () => {
  it("requires authentication", async () => {
    const r = await req("POST", "/v1/admin/entitlements/grant", { account_id: "x", product_id: "socket" });
    expect(r.status).toBe(401);
  });

  it("rejects a non-admin caller with 403", async () => {
    const r = await req(
      "POST",
      "/v1/admin/entitlements/grant",
      { account_id: nonAdminAccountId, product_id: "socket" },
      nonAdminKey,
    );
    expect(r.status).toBe(403);
  });

  it("rejects a missing account_id", async () => {
    const r = await req("POST", "/v1/admin/entitlements/grant", { product_id: "socket" }, apiKey);
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("MISSING_FIELD");
  });

  it("rejects a product_id that isn't in PRODUCT_REGISTRY", async () => {
    const r = await req(
      "POST",
      "/v1/admin/entitlements/grant",
      { account_id: nonAdminAccountId, product_id: "not-a-real-product" },
      apiKey,
    );
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  it("is idempotent — granting the same product twice returns 200 both times, no duplicate", async () => {
    const first = await req(
      "POST",
      "/v1/admin/entitlements/grant",
      { account_id: nonAdminAccountId, product_id: "runway" },
      apiKey,
    );
    const second = await req(
      "POST",
      "/v1/admin/entitlements/grant",
      { account_id: nonAdminAccountId, product_id: "runway" },
      apiKey,
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const listed = await req("GET", "/v1/account/entitlements", undefined, nonAdminKey);
    const runwayGrants = (listed.data.entitlements as Array<Record<string, unknown>>).filter(
      (e) => e.product_id === "runway",
    );
    expect(runwayGrants.length).toBe(1);
  });
});
