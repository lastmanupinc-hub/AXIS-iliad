import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import {
  resetTestDb, createAccount, createApiKey, TIER_LIMITS,
  ALL_PROGRAMS, enableProgram, createSnapshot, recordUsage,
} from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import { handleMcpPost } from "./mcp-server.js";
import { resetRateLimits } from "./rate-limiter.js";

let serverPort = 0; // OS-assigned ephemeral port, set once the server is listening
let server: Server;
let suiteApiKey = "";  // suite tier — bypasses all gates; used for the "first call succeeds" baseline
let paidApiKey = "";   // paid tier + all programs + quota pre-exhausted; used for quota-exceeded test

// ─── HTTP helper ────────────────────────────────────────────────

interface Res { status: number; data: unknown }

async function post(path: string, body: unknown, authKey?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(payload)),
    };
    if (authKey) headers["Authorization"] = `Bearer ${authKey}`;
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: serverPort, path, method: "POST", headers },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    r.on("error", reject);
    r.write(payload);
    r.end();
  });
}

function rpcCall(toolName: string, args: Record<string, unknown>, id = 1) {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  };
}

function getToolResult(data: unknown): { isError: boolean; text: string } {
  const rpc = data as Record<string, unknown>;
  const result = rpc.result as Record<string, unknown>;
  const content = result.content as Array<{ text: string }>;
  return { isError: !!result.isError, text: content[0]?.text ?? "" };
}

// ─── Server setup ───────────────────────────────────────────────

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();
  const router = new Router();
  router.post("/mcp", handleMcpPost);
  // Ephemeral port (0) avoids cross-worker port collisions; await the actual
  // 'listening' event instead of a fixed sleep, which races under CI parallelism
  // and caused intermittent ECONNREFUSED. Reject loudly on a bind error.
  server = createApp(router, 0);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    if (server.listening) resolve();
    else server.once("listening", () => resolve());
  });
  const addr = server.address();
  serverPort = addr && typeof addr === "object" ? addr.port : 0;

  // Suite account — success baseline
  const suiteAcct = await createAccount("QuotaTest-Suite", "quota-suite@example.com", "suite");
  suiteApiKey = (await createApiKey(suiteAcct.account_id, "quota-suite-key")).rawKey;

  // Paid account — all programs enabled so payment gate passes, quota still applies
  const paidAcct = await createAccount("QuotaTest-Paid", "quota-paid@example.com", "paid");
  paidApiKey = (await createApiKey(paidAcct.account_id, "quota-paid-key")).rawKey;
  for (const p of ALL_PROGRAMS) {
    await enableProgram(paidAcct.account_id, p);
  }
  // Pre-populate to max_projects limit so the next MCP call overflows
  for (let i = 0; i < TIER_LIMITS.paid.max_projects; i++) {
    const snap = await createSnapshot(
      {
        input_method: "api_submission",
        manifest: { project_name: `prefill-${i}`, project_type: "library", frameworks: [], goals: [], requested_outputs: [] },
        files: [],
      },
      paidAcct.account_id,
    );
    await recordUsage(paidAcct.account_id, "search", snap.snapshot_id, 0, 0, 0);
  }
});

afterAll(() => {
  server?.close();
});

// ─── Tests ──────────────────────────────────────────────────────

describe("Quota-exceeded guardrails — analyze_files", () => {
  it("first analyze_files succeeds (within quota)", async () => {
    const r = await post(
      "/mcp",
      rpcCall("analyze_files", {
        project_name: "suite-quota-test-1",
        project_type: "library",
        frameworks: ["node"],
        goals: ["test"],
        files: [{ path: "README.md", content: "# Test" }],
      }),
      suiteApiKey,
    );
    expect(r.status).toBe(200);
    const result = getToolResult(r.data);
    expect(result.isError).toBe(false);
  });

  it("analyze_files fails when paid-tier project limit is exhausted", async () => {
    const r = await post(
      "/mcp",
      rpcCall("analyze_files", {
        project_name: "quota-overflow-project",
        project_type: "library",
        frameworks: ["node"],
        goals: ["test"],
        files: [{ path: "README.md", content: "# Overflow" }],
      }),
      paidApiKey,
    );
    expect(r.status).toBe(200);
    const result = getToolResult(r.data);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Quota exceeded");
  });
});

describe("H-Phase-A cycle 17 — analyze_files no longer hard-blocks a fresh paid/suite account with no program_entitlements row", () => {
  it("a fresh 'paid' account (entitlements NEVER manually enabled) can call analyze_files for the full bundle", async () => {
    const acct = await createAccount("FreshPaidAnalyze", "fresh-paid-analyze@example.com", "paid");
    const key = await createApiKey(acct.account_id, "fresh-paid-analyze-key");
    // Deliberately NOT calling enableProgram — this is the real state a PAI'D
    // webhook leaves a Starter/Pro upgrade in (see updateAccountTierIfCurrent).
    const r = await post(
      "/mcp",
      rpcCall("analyze_files", {
        project_name: "fresh-paid-full-bundle",
        project_type: "library",
        frameworks: ["node"],
        goals: ["test"],
        files: [{ path: "README.md", content: "# Fresh paid account" }],
      }),
      key.rawKey,
    );
    expect(r.status).toBe(200);
    const result = getToolResult(r.data);
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.text) as { snapshot_summary: { mode: string }; artifact_count: number };
    // Full bundle, not silently downgraded to a free-tier-only run.
    expect(parsed.snapshot_summary.mode).toBe("full-access");
    expect(parsed.artifact_count).toBeGreaterThan(20);
  });

  it("a genuinely free-tier account still gets a payment-required error for the full bundle (no free ride)", async () => {
    const acct = await createAccount("FreshFreeAnalyze", "fresh-free-analyze@example.com", "free");
    const key = await createApiKey(acct.account_id, "fresh-free-analyze-key");
    const r = await post(
      "/mcp",
      rpcCall("analyze_files", {
        project_name: "fresh-free-full-bundle",
        project_type: "library",
        frameworks: ["node"],
        goals: ["test"],
        files: [{ path: "README.md", content: "# Fresh free account" }],
      }),
      key.rawKey,
    );
    expect(r.status).toBe(200);
    const result = getToolResult(r.data);
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.text) as { error: string; _payment_required?: boolean };
    expect(parsed.error).toBe("Payment Required");
  });
});

describe("Quota-exceeded guardrails — file limit", () => {
  // Paid/suite have NO max_files_per_snapshot cap (docs/saas-strategy — the
  // tier differentiator moved to max_snapshots_per_month). This used to build
  // `TIER_LIMITS.paid.max_files_per_snapshot + 1` files to prove rejection;
  // that value is now -1, so "+1" built an EMPTY file array and the test's
  // scenario stopped being reachable. Replaced with the actual current
  // behavior: a file count that would have exceeded the OLD 2000-file paid
  // cap must still succeed, since paid no longer has one.
  it("accepts a file count well over the free tier's cap on a paid account — no cap to exceed", async () => {
    const acct2 = await createAccount("FileLimitTest", "filelimit@example.com", "paid");
    const key2 = await createApiKey(acct2.account_id, "filelimit-key");
    for (const p of ALL_PROGRAMS) {
      await enableProgram(acct2.account_id, p);
    }

    const manyFiles = Array.from({ length: TIER_LIMITS.free.max_files_per_snapshot + 500 }, (_, i) => ({
      path: `file-${i}.txt`,
      content: `content ${i}`,
    }));

    const r = await post(
      "/mcp",
      rpcCall("analyze_files", {
        project_name: "file-limit-test",
        project_type: "library",
        frameworks: ["node"],
        goals: ["test"],
        files: manyFiles,
      }),
      key2.rawKey,
    );
    expect(r.status).toBe(200);
    const result = getToolResult(r.data);
    expect(result.isError).toBe(false);
  });
});

describe("Quota-exceeded guardrails — prepare_agentic_purchasing", () => {
  it("rejects free-tier account with payment-required error", async () => {
    // Free-tier: purchasing programs not enabled → payment gate fires
    const freeAcct = await createAccount("PurchaseTest", "purchase-test@example.com", "free");
    const freeKey = await createApiKey(freeAcct.account_id, "purchase-free-key");
    const r = await post(
      "/mcp",
      rpcCall("prepare_agentic_purchasing", {
        project_name: "purchase-test",
        project_type: "web_app",
        frameworks: ["stripe"],
        goals: ["payments"],
        files: [{ path: "checkout.ts", content: "export function pay() {}" }],
      }),
      freeKey.rawKey,
    );
    expect(r.status).toBe(200);
    const result = getToolResult(r.data);
    expect(result.isError).toBe(true);
    // structured x402 payment-required JSON — assert top-level shape
    const parsed = JSON.parse(result.text);
    expect(parsed.error).toBe("Payment Required");
    expect(parsed.blocked_programs).toBeInstanceOf(Array);
    expect(parsed.price).toBe("0.50");
  });
});
