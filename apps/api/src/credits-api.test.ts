import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleHealthCheck } from "./handlers.js";
import {
  handleCreateAccount,
  handleGetAccount,
  handleCreateApiKey,
  handleUpdateTier,
  handleGetCredits,
  handleAddCredits,
} from "./billing.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;

// ─── HTTP helper ────────────────────────────────────────────────

interface Res { status: number; data: Record<string, unknown> }

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
          resolve({ status: res.statusCode ?? 0, data: data as Record<string, unknown> });
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
  router.post("/v1/accounts", handleCreateAccount);
  router.get("/v1/account", handleGetAccount);
  router.post("/v1/account/keys", handleCreateApiKey);
  router.post("/v1/account/tier", handleUpdateTier);
  router.get("/v1/account/credits", handleGetCredits);
  router.post("/v1/account/credits", handleAddCredits);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await (server as unknown as { shutdown: () => Promise<void> }).shutdown();
  closeDb();
});

// ─── Helpers ────────────────────────────────────────────────────

async function createAccountAndKey(email: string) {
  const create = await req("POST", "/v1/accounts", { name: "Test User", email });
  expect(create.status).toBe(201);
  const account = create.data.account as Record<string, string>;
  const apiKeyObj = create.data.api_key as Record<string, string>;
  return { account_id: account.account_id, api_key: apiKeyObj.raw_key };
}

async function upgradeTier(api_key: string, tier: string) {
  const r = await req("POST", "/v1/account/tier", { tier }, api_key);
  expect(r.status).toBe(200);
}

// ─── Tests ──────────────────────────────────────────────────────

describe("GET /v1/account/credits", () => {
  it("returns 401 without auth", async () => {
    const r = await req("GET", "/v1/account/credits");
    expect(r.status).toBe(401);
  });

  it("free tier: returns zero balance and empty ledger", async () => {
    const { api_key } = await createAccountAndKey("credits-free@test.com");
    const r = await req("GET", "/v1/account/credits", undefined, api_key);
    expect(r.status).toBe(200);
    expect(r.data.balance).toBe(0);
    expect(r.data.tier).toBe("free");
    expect(Array.isArray(r.data.ledger)).toBe(true);
    expect((r.data.ledger as unknown[]).length).toBe(0);
    expect(r.data.credit_costs).toBeDefined();
    expect(r.data.credit_packs).toBeDefined();
  });

  it("paid tier: returns non-negative balance", async () => {
    const { api_key } = await createAccountAndKey("credits-paid@test.com");
    await upgradeTier(api_key, "paid");
    const r = await req("GET", "/v1/account/credits", undefined, api_key);
    expect(r.status).toBe(200);
    expect(r.data.tier).toBe("paid");
    expect(typeof r.data.balance).toBe("number");
  });

  it("includes credit_costs with all three operations", async () => {
    const { api_key } = await createAccountAndKey("credits-costs@test.com");
    const r = await req("GET", "/v1/account/credits", undefined, api_key);
    expect(r.status).toBe(200);
    const costs = r.data.credit_costs as Record<string, number>;
    expect(costs.save_version).toBe(2);
    expect(costs.diff_versions).toBe(1);
    expect(costs.cross_snapshot_diff).toBe(5);
  });

  it("includes credit_packs with three purchase options", async () => {
    const { api_key } = await createAccountAndKey("credits-packs@test.com");
    const r = await req("GET", "/v1/account/credits", undefined, api_key);
    expect(r.status).toBe(200);
    const packs = r.data.credit_packs as Array<Record<string, unknown>>;
    expect(packs.length).toBe(3);
    expect(packs[0].pack_id).toBe("pack_100");
    expect(packs[1].pack_id).toBe("pack_500");
    expect(packs[2].pack_id).toBe("pack_2000");
  });
});

describe("POST /v1/account/credits", () => {
  it("returns 401 without auth", async () => {
    const r = await req("POST", "/v1/account/credits", { credits: 100 });
    expect(r.status).toBe(401);
  });

  it("free tier: returns 403", async () => {
    const { api_key } = await createAccountAndKey("credits-free-post@test.com");
    const r = await req("POST", "/v1/account/credits", { credits: 100 }, api_key);
    expect(r.status).toBe(403);
    expect(String(r.data.error)).toContain("paid plan");
  });

  it("paid tier: grants credits and returns balance_after", async () => {
    const { api_key } = await createAccountAndKey("credits-grant@test.com");
    await upgradeTier(api_key, "paid");
    const r = await req("POST", "/v1/account/credits", { credits: 100, operation: "purchase" }, api_key);
    expect(r.status).toBe(200);
    expect(r.data.credits_added).toBe(100);
    expect(r.data.balance_after).toBe(100);
    expect(r.data.operation).toBe("purchase");
  });

  it("multiple grants accumulate balance", async () => {
    const { api_key } = await createAccountAndKey("credits-accumulate@test.com");
    await upgradeTier(api_key, "paid");
    await req("POST", "/v1/account/credits", { credits: 50 }, api_key);
    const r = await req("POST", "/v1/account/credits", { credits: 75 }, api_key);
    expect(r.status).toBe(200);
    expect(r.data.balance_after).toBe(125);
  });

  it("GET after POST shows updated balance in ledger", async () => {
    const { api_key } = await createAccountAndKey("credits-ledger@test.com");
    await upgradeTier(api_key, "paid");
    await req("POST", "/v1/account/credits", { credits: 200, operation: "purchase" }, api_key);
    const r = await req("GET", "/v1/account/credits", undefined, api_key);
    expect(r.status).toBe(200);
    expect(r.data.balance).toBe(200);
    const ledger = r.data.ledger as Array<Record<string, unknown>>;
    expect(ledger.length).toBe(1);
    expect(ledger[0].credits_delta).toBe(200);
    expect(ledger[0].operation).toBe("purchase");
    expect(ledger[0].balance_after).toBe(200);
  });

  it("rejects non-integer credits", async () => {
    const { api_key } = await createAccountAndKey("credits-float@test.com");
    await upgradeTier(api_key, "paid");
    const r = await req("POST", "/v1/account/credits", { credits: 10.5 }, api_key);
    expect(r.status).toBe(400);
  });

  it("rejects zero credits", async () => {
    const { api_key } = await createAccountAndKey("credits-zero@test.com");
    await upgradeTier(api_key, "paid");
    const r = await req("POST", "/v1/account/credits", { credits: 0 }, api_key);
    expect(r.status).toBe(400);
  });

  it("rejects negative credits", async () => {
    const { api_key } = await createAccountAndKey("credits-neg@test.com");
    await upgradeTier(api_key, "paid");
    const r = await req("POST", "/v1/account/credits", { credits: -50 }, api_key);
    expect(r.status).toBe(400);
  });

  it("rejects credits over 10000", async () => {
    const { api_key } = await createAccountAndKey("credits-max@test.com");
    await upgradeTier(api_key, "paid");
    const r = await req("POST", "/v1/account/credits", { credits: 10001 }, api_key);
    expect(r.status).toBe(400);
  });

  it("rejects missing credits field", async () => {
    const { api_key } = await createAccountAndKey("credits-missing@test.com");
    await upgradeTier(api_key, "paid");
    const r = await req("POST", "/v1/account/credits", { operation: "purchase" }, api_key);
    expect(r.status).toBe(400);
  });

  it("rejects invalid JSON body", async () => {
    const { api_key } = await createAccountAndKey("credits-badjson@test.com");
    await upgradeTier(api_key, "paid");
    // Send raw non-JSON
    const r = await new Promise<Res>((resolve, reject) => {
      const h: Record<string, string> = { "Content-Type": "application/json", "Authorization": `Bearer ${api_key}` };
      const rq = require("node:http").request(
        { hostname: "127.0.0.1", port: testPort, path: "/v1/account/credits", method: "POST", headers: h },
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
      rq.on("error", reject);
      rq.write("not-json");
      rq.end();
    });
    expect(r.status).toBe(400);
  });

  it("suite tier: grants credits successfully", async () => {
    const { api_key } = await createAccountAndKey("credits-suite@test.com");
    await upgradeTier(api_key, "suite");
    const r = await req("POST", "/v1/account/credits", { credits: 500, operation: "suite_monthly_grant" }, api_key);
    expect(r.status).toBe(200);
    expect(r.data.credits_added).toBe(500);
  });

  it("rejects invalid operation value", async () => {
    const { api_key } = await createAccountAndKey("credits-bad-op@test.com");
    await upgradeTier(api_key, "paid");
    const r = await req("POST", "/v1/account/credits", { credits: 100, operation: "refund" }, api_key);
    expect(r.status).toBe(400);
  });
});
