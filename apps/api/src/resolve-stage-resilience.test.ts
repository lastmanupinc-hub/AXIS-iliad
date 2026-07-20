/**
 * H-Phase-A cycle 18 — `void trackEvent(acct, "snapshot_created", await
 * resolveStage(acct), {...}).catch(() => {})` does NOT protect against
 * resolveStage() rejecting: `await resolveStage(acct)` is evaluated as an
 * ARGUMENT before trackEvent is ever called, so a resolveStage throw
 * propagates before the trailing `.catch()` ever attaches. Six call sites
 * (4 REST in handlers.ts, 2 MCP in mcp-tool-impls.ts) used this idiom,
 * looking like the same "safe" analytics-only fix cycles 13-15 already
 * applied elsewhere in this file, but weren't. In REST handlers this let a
 * transient resolveStage failure fall to the outer catch, which flips an
 * already-"ready", already-charged snapshot's status back to "failed" and
 * 500s the caller. In MCP tools it aborted the handler BEFORE
 * captureMcpToolCredits ran, letting the caller keep the fully-generated
 * bundle for free.
 *
 * resolveStage is mocked to throw for one specific account only, so every
 * other account's calls (including this file's own account/key setup) are
 * unaffected.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";

let throwForAccountId: string | null = null;

vi.mock("@axis/snapshots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@axis/snapshots")>();
  return {
    ...actual,
    resolveStage: (...args: Parameters<typeof actual.resolveStage>) => {
      if (args[0] === throwForAccountId) {
        return Promise.reject(new Error("simulated transient resolveStage failure"));
      }
      return actual.resolveStage(...args);
    },
  };
});

import { resetTestDb, createAccount, createApiKey, enableProgram, getUsageCreditSummary } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleAnalyze } from "./handlers.js";
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
  router.post("/v1/analyze", handleAnalyze);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("handleAnalyze — a resolveStage failure inside the trackEvent argument list must never flip an already-'ready' snapshot back to 'failed'", () => {
  it("still returns 201 with the generated analysis instead of a false 500", async () => {
    const acct = await createAccount("ResolveStageAnalyze", "resolve-stage-analyze@test.local", "paid");
    await enableProgram(acct.account_id, "seo");
    const { rawKey } = await createApiKey(acct.account_id);
    throwForAccountId = acct.account_id;

    const before = await getUsageCreditSummary(acct.account_id, "paid");
    void before;

    const r = await req(
      "POST",
      "/v1/analyze",
      { files: [{ path: "package.json", content: '{"name":"x","dependencies":{"react":"18.0.0"}}' }] },
      rawKey,
    );

    // Before the fix, resolveStage's throw propagated past the trailing
    // `.catch()` (never attached — it was evaluated as an argument first),
    // fell to the outer catch, and flipped the already-generated snapshot's
    // status to "failed" with a 500 — even though the analysis had already
    // fully succeeded.
    expect(r.status).toBe(201);
    expect(r.data.snapshot_id).toBeDefined();
    expect(r.data.status).toBe("ready");

    throwForAccountId = null;
  });
});
