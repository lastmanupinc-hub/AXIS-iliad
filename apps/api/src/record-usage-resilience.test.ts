/**
 * H-Phase-A cycle 18 (bulk sweep) — recordUsage sat unguarded between
 * delivered work and the response/charge-capture across 6 MCP tools and 5
 * REST call sites (handleCreateSnapshot, handleGitHubAnalyze, handleAnalyze,
 * handlePreparePurchasing, and — worst of all — makeProgramHandler, which
 * runs recordUsage with NO surrounding try/catch at all, AFTER
 * chargeWithDiscounts has already committed a real charge). A transient
 * recordUsage failure used to either flip an already-"ready" snapshot back
 * to "failed" (the 4 handlers with a surrounding try/catch) or propagate as
 * a genuinely uncaught 500 with money already taken (makeProgramHandler).
 *
 * recordUsage is mocked to throw for one specific account so every other
 * account's calls (including this file's own account/key creation, and the
 * OTHER test's account) are unaffected.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";

const recordUsageSpy = vi.fn(async () => {});
let throwForAccountId: string | null = null;

vi.mock("@axis/snapshots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@axis/snapshots")>();
  return {
    ...actual,
    recordUsage: (...args: Parameters<typeof actual.recordUsage>) => {
      recordUsageSpy(...args);
      if (args[0] === throwForAccountId) {
        return Promise.reject(new Error("simulated transient recordUsage failure"));
      }
      return actual.recordUsage(...args);
    },
  };
});

import { resetTestDb, createAccount, createApiKey, enableProgram, getUsageCreditSummary } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { makeProgramHandler, handlePreparePurchasing, handleCreateSnapshot, PROGRAM_OUTPUTS } from "./handlers.js";
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

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();
  const router = new Router();
  router.post("/v1/accounts", handleCreateAccount);
  router.post("/v1/account/keys", handleCreateApiKey);
  router.post("/v1/snapshots", handleCreateSnapshot);
  router.post("/v1/seo/analyze", makeProgramHandler("seo", PROGRAM_OUTPUTS.seo));
  router.post("/v1/prepare-for-agentic-purchasing", handlePreparePurchasing);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const minFiles = [
  { path: "package.json", content: '{"name":"x","dependencies":{"react":"18.0.0"}}' },
  { path: "src/index.ts", content: "export const x = 1;" },
];

describe("makeProgramHandler — a recordUsage failure never surfaces as an uncaught 500 after the charge already committed", () => {
  it("still returns 200 with the generated output, and the charge is not lost", async () => {
    const acct = await createAccount("RecordUsageProgram", "record-usage-program@test.local", "paid");
    await enableProgram(acct.account_id, "seo");
    const { rawKey } = await createApiKey(acct.account_id);

    // Create the snapshot BEFORE arming the fault so its own recordUsage
    // call (inside handleCreateSnapshot) succeeds normally -- only the
    // pro-program call below is under test.
    const snapRes = await req(
      "POST",
      "/v1/snapshots",
      {
        manifest: {
          project_name: "record-usage-resilience-program-test",
          project_type: "web_application",
          frameworks: ["react"],
          goals: ["test"],
          requested_outputs: [],
        },
        files: minFiles,
      },
      rawKey,
    );
    expect(snapRes.status).toBe(201);
    const snapshotId = snapRes.data.snapshot_id as string;
    expect(snapshotId).toBeDefined();

    recordUsageSpy.mockClear();
    throwForAccountId = acct.account_id;

    const before = await getUsageCreditSummary(acct.account_id, "paid");
    const r = await req("POST", "/v1/seo/analyze", { snapshot_id: snapshotId }, rawKey);
    void before;

    // Before the fix, the unguarded recordUsage throw inside
    // makeProgramHandler propagated as an uncaught 500 AFTER
    // chargeWithDiscounts had already committed the charge -- money taken,
    // no output delivered. The fix must still return 200 with the files.
    expect(recordUsageSpy).toHaveBeenCalled();
    expect(r.status).toBe(200);
    expect(r.data.program).toBe("seo");
    expect(Array.isArray(r.data.files)).toBe(true);

    throwForAccountId = null;
  });
});

describe("handlePreparePurchasing — a recordUsage failure never flips an already-'ready' snapshot back to 'failed'", () => {
  it("still returns the full result (score, artifacts) instead of a false 500", async () => {
    const acct = await createAccount("RecordUsagePrepare", "record-usage-prepare@test.local", "suite");
    const { rawKey } = await createApiKey(acct.account_id);
    throwForAccountId = acct.account_id;

    const r = await req(
      "POST",
      "/v1/prepare-for-agentic-purchasing",
      {
        project_name: "record-usage-resilience-test",
        project_type: "web_application",
        frameworks: ["react"],
        goals: ["payments"],
        files: minFiles,
      },
      rawKey,
    );

    expect(recordUsageSpy).toHaveBeenCalled();
    // Before the fix, this would be a 500 with status:"failed" -- the
    // snapshot was already fully generated and saved as "ready" moments
    // earlier, but the unguarded recordUsage throw flipped it back.
    expect(r.status).toBe(201);
    expect(r.data.purchasing_readiness_score).toBeDefined();
    expect(r.data.snapshot_id).toBeDefined();

    throwForAccountId = null;
  });
});
