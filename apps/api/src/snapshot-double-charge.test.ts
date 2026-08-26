/**
 * H-Phase-A cycle 5 — three REST handlers could each charge a free-tier
 * account TWICE for one call: an entitlement/pro-program branch and a
 * quota-exceeded branch both charge via chargeWithDiscounts, and neither
 * branch guarded against the other also firing when BOTH conditions were
 * true for the same request. Same shape/fix as the cycle-4 Firecrawl
 * double-charge, found in 3 more handlers this cycle: handleCreateSnapshot,
 * handleAnalyze, handlePreparePurchasing.
 *
 * consumeFreeCall is mocked to always succeed so a free-tier charge resolves
 * without touching the real cash rail — each test measures HOW MANY TIMES it
 * is consulted, which is exactly once per chargeWithDiscounts invocation.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";

const consumeFreeCallSpy = vi.fn(async () => true);

vi.mock("@axis/snapshots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@axis/snapshots")>();
  return {
    ...actual,
    consumeFreeCall: (...args: Parameters<typeof consumeFreeCallSpy>) => consumeFreeCallSpy(...args),
  };
});

import { resetTestDb, createAccount, createApiKey, recordUsage, TIER_LIMITS } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleCreateSnapshot, handleAnalyze, handlePreparePurchasing } from "./handlers.js";
import { handleCreateAccount, handleCreateApiKey } from "./billing.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;

interface Res { status: number; data: Record<string, unknown> }

function req(method: string, path: string, body: unknown, key: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` } },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          let data: unknown;
          try { data = JSON.parse(Buffer.concat(chunks).toString("utf-8")); } catch { data = {}; }
          resolve({ status: res.statusCode ?? 0, data: data as Record<string, unknown> });
        });
      },
    );
    r.on("error", reject);
    r.write(payload);
    r.end();
  });
}

async function exhaustSnapshotQuota(accountId: string): Promise<void> {
  const cap = TIER_LIMITS.free.max_snapshots_per_month;
  await Promise.all(
    Array.from({ length: cap }, (_, i) => recordUsage(accountId, "debug", `quota-fill-${i}-${accountId}`, 1, 1, 100)),
  );
}

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();
  const router = new Router();
  router.post("/v1/accounts", handleCreateAccount);
  router.post("/v1/account/keys", handleCreateApiKey);
  router.post("/v1/snapshots", handleCreateSnapshot);
  router.post("/v1/analyze", handleAnalyze);
  router.post("/v1/prepare-for-agentic-purchasing", handlePreparePurchasing);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("POST /v1/snapshots — over-quota AND pro-program request charges exactly once", () => {
  it("consults the cash-settlement path exactly once, not twice, for one call", async () => {
    const acct = await createAccount("SnapDoubleCharge", "snap-double-charge@test.local", "free");
    const { rawKey } = await createApiKey(acct.account_id);
    await exhaustSnapshotQuota(acct.account_id);
    consumeFreeCallSpy.mockClear();

    // "seo" is a pro-only program (free tier only gets search/skills/debug),
    // so this request trips BOTH the quota-exceeded branch (over the free
    // 10-snapshot cap) AND the program-entitlement branch (seo isn't free-tier).
    const r = await req(
      "POST",
      "/v1/snapshots",
      {
        manifest: {
          project_name: "double-charge-test",
          project_type: "web_application",
          frameworks: ["react"],
          goals: ["test"],
          // Must be a PAID artifact. seo-rules.md became one of the free
          // artifacts every program ships, and a free-only request never
          // charges at all — which would make this double-charge guard pass
          // vacuously (0 charges) instead of proving exactly one fired.
          requested_outputs: ["schema-recommendations.json"],
        },
        files: [{ path: "package.json", content: '{"name":"x"}' }],
      },
      rawKey,
    );

    expect(r.status).toBe(201);
    // The bug: both the quota-exceeded charge AND the entitlement charge
    // would each consult consumeFreeCall once, for 2 total. Exactly 1 proves
    // only one charge was actually attempted for this one call.
    expect(consumeFreeCallSpy).toHaveBeenCalledTimes(1);
  });
});

describe("POST /v1/analyze — over-quota AND pro-program request charges exactly once", () => {
  it("consults the cash-settlement path exactly once, not twice, for one call", async () => {
    const acct = await createAccount("AnalyzeDoubleCharge", "analyze-double-charge@test.local", "free");
    const { rawKey } = await createApiKey(acct.account_id);
    await exhaustSnapshotQuota(acct.account_id);
    consumeFreeCallSpy.mockClear();

    // Requesting the "seo" program (pro-only) trips the entitlement-charge
    // branch; being over quota (exhausted above) trips the quota-charge
    // branch — both fire for the SAME call under the bug.
    const r = await req(
      "POST",
      "/v1/analyze",
      {
        files: [{ path: "package.json", content: '{"name":"x"}' }],
        programs: ["seo"],
      },
      rawKey,
    );

    expect(r.status).toBe(201);
    expect(consumeFreeCallSpy).toHaveBeenCalledTimes(1);
  });
});

describe("POST /v1/prepare-for-agentic-purchasing — over-quota charges exactly once", () => {
  it("consults the cash-settlement path exactly once, not twice, for one call", async () => {
    const acct = await createAccount("PrepPurchaseDoubleCharge", "prep-double-charge@test.local", "free");
    const { rawKey } = await createApiKey(acct.account_id);
    await exhaustSnapshotQuota(acct.account_id);
    consumeFreeCallSpy.mockClear();

    // proPrograms is a FIXED list (not user-controlled) that's always
    // non-empty, so a fresh free-tier account always hits the entitlement
    // branch here; combined with the exhausted quota above, both branches
    // fire for the SAME call under the bug.
    const r = await req(
      "POST",
      "/v1/prepare-for-agentic-purchasing",
      {
        project_name: "double-charge-test",
        project_type: "web_application",
        frameworks: ["react"],
        goals: ["test"],
        files: [{ path: "package.json", content: '{"name":"x"}' }],
      },
      rawKey,
    );

    expect(r.status).toBe(201);
    expect(consumeFreeCallSpy).toHaveBeenCalledTimes(1);
  });
});
