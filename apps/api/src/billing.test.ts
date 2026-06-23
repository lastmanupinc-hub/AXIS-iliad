/**
 * Revenue-bypass gating for self-serve entitlements:
 *  - POST /v1/accounts creation at paid/suite tier is deny-by-default (402 → checkout)
 *  - POST /v1/account/tier upgrades to paid/suite are deny-by-default (402 → checkout)
 *  - POST /v1/account/credits minting is deny-by-default (402 → checkout)
 *  - Allowed for: admin (ADMIN_API_KEY), AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS=true,
 *    or (flag unset) test mode — which keeps the rest of the suite green.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import type { Server } from "node:http";
import { resetTestDb } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import {
  handleCreateAccount,
  handleGetAccount,
  handleUpdateTier,
  handleAddCredits,
  handleGetCredits,
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
  await resetTestDb();
  resetRateLimits();
  const router = new Router();
  router.post("/v1/accounts", handleCreateAccount);
  router.get("/v1/account", handleGetAccount);
  router.post("/v1/account/tier", handleUpdateTier);
  router.post("/v1/account/credits", handleAddCredits);
  router.get("/v1/account/credits", handleGetCredits);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

beforeEach(() => {
  resetRateLimits();
  delete process.env.ADMIN_API_KEY;
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.ADMIN_API_KEY;
});

// ─── Helpers ────────────────────────────────────────────────────

let acctCounter = 0;
async function createTestAccount(tier?: string) {
  acctCounter += 1;
  const n = `gate-user-${acctCounter}-${Math.random().toString(36).slice(2, 8)}`;
  const body: Record<string, unknown> = { name: n, email: `${n}@test.com` };
  if (tier) body.tier = tier;
  const r = await req("POST", "/v1/accounts", body);
  expect(r.status).toBe(201);
  return {
    account: r.data.account as Record<string, unknown>,
    key: (r.data.api_key as Record<string, unknown>).raw_key as string,
  };
}

// ─── Account-creation tier gating ───────────────────────────────

describe("POST /v1/accounts — deny-by-default paid-tier creation", () => {
  function freshIdentity() {
    acctCounter += 1;
    const n = `create-gate-${acctCounter}-${Math.random().toString(36).slice(2, 8)}`;
    return { name: n, email: `${n}@test.com` };
  }

  it("denies unauthenticated creation at suite tier with 402 pointing at checkout", async () => {
    vi.stubEnv("AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS", "false");

    const { name, email } = freshIdentity();
    const r = await req("POST", "/v1/accounts", { name, email, tier: "suite" });
    expect(r.status).toBe(402);
    expect(r.data.error_code).toBe("PAYMENT_REQUIRED");
    expect(r.data.checkout_endpoint).toBe("POST /v1/checkout");
    expect(String(r.data.plans_url)).toContain("plans");
    expect(r.data.requested_tier).toBe("suite");

    // The account must not exist — re-creating at free tier succeeds (no 409).
    const retry = await req("POST", "/v1/accounts", { name, email, tier: "free" });
    expect(retry.status).toBe(201);
    expect((retry.data.account as Record<string, unknown>).tier).toBe("free");
  });

  it("denies unauthenticated creation at paid tier (including aliases)", async () => {
    vi.stubEnv("AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS", "false");

    for (const tier of ["paid", "pro", "growth"]) {
      const { name, email } = freshIdentity();
      const r = await req("POST", "/v1/accounts", { name, email, tier });
      expect(r.status, `tier=${tier}`).toBe(402);
      expect(r.data.error_code).toBe("PAYMENT_REQUIRED");
    }
  });

  it("allows free-tier creation even when self-serve is disabled", async () => {
    vi.stubEnv("AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS", "false");

    const { name, email } = freshIdentity();
    const r = await req("POST", "/v1/accounts", { name, email });
    expect(r.status).toBe(201);
    expect((r.data.account as Record<string, unknown>).tier).toBe("free");
  });

  it("allows paid-tier creation when the caller presents the ADMIN_API_KEY", async () => {
    vi.stubEnv("AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS", "false");
    process.env.ADMIN_API_KEY = "admin-create-gate-key";

    const { name, email } = freshIdentity();
    const r = await req("POST", "/v1/accounts", { name, email, tier: "suite" }, "admin-create-gate-key");
    expect(r.status).toBe(201);
    expect((r.data.account as Record<string, unknown>).tier).toBe("suite");
  });

  it("allows paid-tier creation when AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS=true", async () => {
    vi.stubEnv("AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS", "true");

    const { name, email } = freshIdentity();
    const r = await req("POST", "/v1/accounts", { name, email, tier: "paid" });
    expect(r.status).toBe(201);
    expect((r.data.account as Record<string, unknown>).tier).toBe("paid");
  });

  it("defaults to allowed under the test environment when the flag is unset", async () => {
    const { name, email } = freshIdentity();
    const r = await req("POST", "/v1/accounts", { name, email, tier: "suite" });
    expect(r.status).toBe(201);
    expect((r.data.account as Record<string, unknown>).tier).toBe("suite");
  });
});

// ─── Tier upgrade gating ────────────────────────────────────────

describe("POST /v1/account/tier — deny-by-default upgrades", () => {
  it("denies self-serve upgrade to paid with 402 pointing at checkout", async () => {
    const { key } = await createTestAccount();
    vi.stubEnv("AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS", "false");

    const r = await req("POST", "/v1/account/tier", { tier: "paid" }, key);
    expect(r.status).toBe(402);
    expect(r.data.error_code).toBe("PAYMENT_REQUIRED");
    expect(r.data.checkout_endpoint).toBe("POST /v1/checkout");
    expect(String(r.data.plans_url)).toContain("plans");
    expect(r.data.current_tier).toBe("free");
    expect(r.data.requested_tier).toBe("paid");

    // Tier must be unchanged
    const acct = await req("GET", "/v1/account", undefined, key);
    expect((acct.data.account as Record<string, unknown>).tier).toBe("free");
  });

  it("denies self-serve upgrade from paid to suite", async () => {
    const { key } = await createTestAccount("paid");
    vi.stubEnv("AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS", "false");

    const r = await req("POST", "/v1/account/tier", { tier: "suite" }, key);
    expect(r.status).toBe(402);
    expect(r.data.error_code).toBe("PAYMENT_REQUIRED");
    expect(r.data.requested_tier).toBe("suite");
  });

  it("allows downgrade to free even when self-serve is disabled", async () => {
    const { key } = await createTestAccount("paid");
    vi.stubEnv("AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS", "false");

    const r = await req("POST", "/v1/account/tier", { tier: "free" }, key);
    expect(r.status).toBe(200);
    expect((r.data.account as Record<string, unknown>).tier).toBe("free");
  });

  it("allows downgrade from suite to paid even when self-serve is disabled", async () => {
    const { key } = await createTestAccount("suite");
    vi.stubEnv("AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS", "false");

    const r = await req("POST", "/v1/account/tier", { tier: "paid" }, key);
    expect(r.status).toBe(200);
    expect((r.data.account as Record<string, unknown>).tier).toBe("paid");
  });

  it("allows upgrade when the caller presents the ADMIN_API_KEY", async () => {
    const { key } = await createTestAccount();
    vi.stubEnv("AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS", "false");
    process.env.ADMIN_API_KEY = key;

    const r = await req("POST", "/v1/account/tier", { tier: "paid" }, key);
    expect(r.status).toBe(200);
    expect((r.data.account as Record<string, unknown>).tier).toBe("paid");
  });

  it("allows upgrade when AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS=true", async () => {
    const { key } = await createTestAccount();
    vi.stubEnv("AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS", "true");

    const r = await req("POST", "/v1/account/tier", { tier: "suite" }, key);
    expect(r.status).toBe(200);
    expect((r.data.account as Record<string, unknown>).tier).toBe("suite");
  });

  it("defaults to allowed under the test environment when the flag is unset", async () => {
    const { key } = await createTestAccount();
    const r = await req("POST", "/v1/account/tier", { tier: "paid" }, key);
    expect(r.status).toBe(200);
    expect((r.data.account as Record<string, unknown>).tier).toBe("paid");
  });
});

// ─── Credit-minting gating ──────────────────────────────────────

describe("POST /v1/account/credits — deny-by-default minting", () => {
  it("denies self-serve credit purchase with 402 pointing at checkout", async () => {
    const { key } = await createTestAccount("paid");
    vi.stubEnv("AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS", "false");

    const r = await req("POST", "/v1/account/credits", { credits: 100, operation: "purchase" }, key);
    expect(r.status).toBe(402);
    expect(r.data.error_code).toBe("PAYMENT_REQUIRED");
    expect(r.data.checkout_endpoint).toBe("POST /v1/checkout");
    expect(String(r.data.plans_url)).toContain("plans");

    // Balance must be unchanged
    const credits = await req("GET", "/v1/account/credits", undefined, key);
    expect(credits.data.balance).toBe(0);
  });

  it("still validates input before/independently of the payment gate", async () => {
    const { key } = await createTestAccount("paid");
    vi.stubEnv("AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS", "false");

    const r = await req("POST", "/v1/account/credits", { credits: -5, operation: "purchase" }, key);
    expect(r.status).toBe(400);
  });

  it("allows credit grant when the caller presents the ADMIN_API_KEY", async () => {
    const { key } = await createTestAccount("paid");
    vi.stubEnv("AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS", "false");
    process.env.ADMIN_API_KEY = key;

    const r = await req("POST", "/v1/account/credits", { credits: 100, operation: "purchase" }, key);
    expect(r.status).toBe(200);
    expect(r.data.credits_added).toBe(100);
  });

  it("allows credit purchase when AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS=true", async () => {
    const { key } = await createTestAccount("paid");
    vi.stubEnv("AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS", "true");

    const r = await req("POST", "/v1/account/credits", { credits: 250, operation: "purchase" }, key);
    expect(r.status).toBe(200);
    expect(r.data.balance_after).toBe(250);
  });

  it("defaults to allowed under the test environment when the flag is unset", async () => {
    const { key } = await createTestAccount("paid");
    const r = await req("POST", "/v1/account/credits", { credits: 50 }, key);
    expect(r.status).toBe(200);
    expect(r.data.credits_added).toBe(50);
  });
});
