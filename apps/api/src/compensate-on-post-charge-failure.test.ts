/**
 * H-Phase-A cycle 21 — handleCreateSnapshot/handleGitHubAnalyze/handleAnalyze/
 * handlePreparePurchasing all charge (chargeWithDiscounts) BEFORE a real,
 * fallible persistence pipeline (createSnapshot/saveContextMap/saveRepoProfile/
 * saveGeneratorResult/updateSnapshotStatus). If any of that throws, the
 * caller was charged real money/credits for a request that produced
 * nothing, and until now nothing recorded that anywhere. This mirrors the
 * exact "settled_then_error" shape handleFirecrawlScrape/-Crawl already
 * handle via recordCompensationOwed.
 *
 * saveContextMap is mocked to throw exactly once, on demand (armed per
 * test via `armThrow`), simulating a transient persistence failure AFTER a
 * real charge has already committed. Since these tests run sequentially
 * (no `concurrent`), a simple module-level flag is safe.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";

let armThrow = false;
// Free-tier accounts in these tests need their cash-settlement charge to
// actually SUCCEED (not fall through to a real payment rail) so the handler
// reaches the post-charge persistence pipeline at all — same mock
// snapshot-double-charge.test.ts already relies on for this exact reason.
const consumeFreeCallSpy = vi.fn(async () => true);

vi.mock("@axis/snapshots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@axis/snapshots")>();
  return {
    ...actual,
    consumeFreeCall: (...args: Parameters<typeof consumeFreeCallSpy>) => consumeFreeCallSpy(...args),
    saveContextMap: (...args: Parameters<typeof actual.saveContextMap>) => {
      if (armThrow) {
        armThrow = false;
        return Promise.reject(new Error("simulated transient persistence failure"));
      }
      return actual.saveContextMap(...args);
    },
  };
});

import { resetTestDb, createAccount, createApiKey, recordUsage, TIER_LIMITS, getCompensationSummary } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleCreateSnapshot, handleAnalyze, handlePreparePurchasing, handleGitHubAnalyze } from "./handlers.js";
import { resetRateLimits } from "./rate-limiter.js";

const mockFetchGitHubRepo = vi.fn();
vi.mock("./github.js", async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return {
    ...orig,
    fetchGitHubRepo: (...args: unknown[]) => mockFetchGitHubRepo(...args),
  };
});

let server: Server;
let testPort = 0;

interface Res { status: number; data: Record<string, unknown> }

function req(path: string, body: unknown, key: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` } },
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
  router.post("/v1/snapshots", handleCreateSnapshot);
  router.post("/v1/analyze", handleAnalyze);
  router.post("/v1/prepare-for-agentic-purchasing", handlePreparePurchasing);
  router.post("/v1/github/analyze", handleGitHubAnalyze);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("POST /v1/snapshots — compensates a charge that already fired before persistence failed", () => {
  it("records a compensation entry when saveContextMap throws AFTER the quota-exceeded charge already fired", async () => {
    const acct = await createAccount("SnapCompensate", "snap-compensate@test.local", "free");
    const { rawKey } = await createApiKey(acct.account_id);
    await exhaustSnapshotQuota(acct.account_id);
    const before = await getCompensationSummary(acct.account_id);
    expect(before.owed_cents).toBe(0);

    armThrow = true;
    // "seo-rules.md" is a pro-only output — the "onlyFreePrograms" bypass
    // (which skips the charge entirely for a free-program-only request)
    // must NOT apply here, so the quota-exceeded charge actually fires.
    const r = await req(
      "/v1/snapshots",
      {
        manifest: {
          project_name: "compensate-test",
          project_type: "web_application",
          frameworks: ["react"],
          goals: ["test"],
          requested_outputs: ["seo-rules.md"],
        },
        files: [{ path: "package.json", content: '{"name":"x"}' }],
      },
      rawKey,
    );

    expect(r.status).toBe(500);
    expect(typeof r.data.compensation_entry_id).toBe("string");
    const after = await getCompensationSummary(acct.account_id);
    expect(after.owed_cents).toBeGreaterThan(0);
  }, 15000);

  it("does NOT record compensation when persistence fails but no charge ever fired (in-quota, free-only request)", async () => {
    const acct = await createAccount("SnapNoCharge", "snap-no-charge@test.local", "free");
    const { rawKey } = await createApiKey(acct.account_id);
    // Fresh account: well within quota, requesting only a free program — no
    // charge branch fires at all.

    armThrow = true;
    const r = await req(
      "/v1/snapshots",
      {
        manifest: {
          project_name: "no-charge-test",
          project_type: "web_application",
          frameworks: ["react"],
          goals: ["test"],
          requested_outputs: ["search-config.md"],
        },
        files: [{ path: "package.json", content: '{"name":"x"}' }],
      },
      rawKey,
    );

    expect(r.status).toBe(500);
    expect(r.data.compensation_entry_id).toBeUndefined();
    const after = await getCompensationSummary(acct.account_id);
    expect(after.owed_cents).toBe(0);
  }, 15000);
});

describe("POST /v1/analyze — compensates a charge that already fired before persistence failed", () => {
  it("records a compensation entry when saveContextMap throws AFTER the entitlement charge already fired", async () => {
    const acct = await createAccount("AnalyzeCompensate", "analyze-compensate@test.local", "free");
    const { rawKey } = await createApiKey(acct.account_id);
    const before = await getCompensationSummary(acct.account_id);
    expect(before.owed_cents).toBe(0);

    armThrow = true;
    // "seo" is a pro-only program for a free-tier account — trips the
    // entitlement-charge branch even well within quota.
    const r = await req(
      "/v1/analyze",
      { files: [{ path: "package.json", content: '{"name":"x"}' }], programs: ["seo"] },
      rawKey,
    );

    expect(r.status).toBe(500);
    expect(typeof r.data.compensation_entry_id).toBe("string");
    const after = await getCompensationSummary(acct.account_id);
    expect(after.owed_cents).toBeGreaterThan(0);
  }, 15000);
});

describe("POST /v1/prepare-for-agentic-purchasing — compensates a charge that already fired before persistence failed", () => {
  it("records a compensation entry when saveContextMap throws AFTER the entitlement charge already fired", async () => {
    const acct = await createAccount("PrepPurchaseCompensate", "prep-purchase-compensate@test.local", "free");
    const { rawKey } = await createApiKey(acct.account_id);
    const before = await getCompensationSummary(acct.account_id);
    expect(before.owed_cents).toBe(0);

    armThrow = true;
    // proPrograms is fixed and always non-empty, so a fresh free-tier
    // account always hits the entitlement-charge branch.
    const r = await req(
      "/v1/prepare-for-agentic-purchasing",
      {
        project_name: "compensate-test",
        project_type: "web_application",
        frameworks: ["react"],
        goals: ["test"],
        files: [{ path: "package.json", content: '{"name":"x"}' }],
      },
      rawKey,
    );

    expect(r.status).toBe(500);
    expect(typeof r.data.compensation_entry_id).toBe("string");
    const after = await getCompensationSummary(acct.account_id);
    expect(after.owed_cents).toBeGreaterThan(0);
  }, 15000);
});

describe("POST /v1/github/analyze — compensates a charge that already fired before persistence failed", () => {
  it("records a compensation entry when saveContextMap throws AFTER the quota-exceeded charge already fired", async () => {
    const acct = await createAccount("GitHubCompensate", "github-compensate@test.local", "free");
    const { rawKey } = await createApiKey(acct.account_id);
    await exhaustSnapshotQuota(acct.account_id);
    const before = await getCompensationSummary(acct.account_id);
    expect(before.owed_cents).toBe(0);

    mockFetchGitHubRepo.mockResolvedValueOnce({
      files: [{ path: "index.ts", content: "export const x = 1;", size: 20 }],
      owner: "testowner",
      repo: "testrepo",
      ref: "main",
      skipped_count: 0,
      total_bytes: 20,
    });
    armThrow = true;
    const r = await req("/v1/github/analyze", { github_url: "https://github.com/testowner/testrepo" }, rawKey);

    expect(r.status).toBe(500);
    expect(typeof r.data.compensation_entry_id).toBe("string");
    const after = await getCompensationSummary(acct.account_id);
    expect(after.owed_cents).toBeGreaterThan(0);
  }, 15000);
});
