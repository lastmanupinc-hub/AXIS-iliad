import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb, createAccount, createApiKey, TIER_LIMITS } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import { handleMcpPost } from "./mcp-server.js";
import { resetRateLimits } from "./rate-limiter.js";

const TEST_PORT = 44530;
let server: Server;
let apiKey = "";

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
      { hostname: "127.0.0.1", port: TEST_PORT, path, method: "POST", headers },
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
  openMemoryDb();
  resetRateLimits();
  const router = new Router();
  router.post("/mcp", handleMcpPost);
  server = createApp(router, TEST_PORT);
  await new Promise<void>((r) => setTimeout(r, 150));

  // Create a free-tier account (max_projects=1)
  const acct = createAccount("QuotaTest", "quota-test@example.com");
  const key = createApiKey(acct.account_id, "quota-key");
  apiKey = key.rawKey;
});

afterAll(() => {
  server?.close();
  closeDb();
});

// ─── Tests ──────────────────────────────────────────────────────

describe("Quota-exceeded guardrails — analyze_files", () => {
  it("first analyze_files succeeds (within quota)", async () => {
    const r = await post(
      "/mcp",
      rpcCall("analyze_files", {
        project_name: "quota-test-1",
        project_type: "library",
        frameworks: ["node"],
        goals: ["test"],
        files: [{ path: "README.md", content: "# Test" }],
      }),
      apiKey,
    );
    expect(r.status).toBe(200);
    const result = getToolResult(r.data);
    expect(result.isError).toBe(false);
  });

  it("second analyze_files with different project hits quota (free tier max_projects=1)", async () => {
    const r = await post(
      "/mcp",
      rpcCall("analyze_files", {
        project_name: "quota-test-2",
        project_type: "library",
        frameworks: ["node"],
        goals: ["test"],
        files: [{ path: "README.md", content: "# Test 2" }],
      }),
      apiKey,
    );
    expect(r.status).toBe(200);
    const result = getToolResult(r.data);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Quota exceeded");
  });
});

describe("Quota-exceeded guardrails — file limit", () => {
  it("rejects files exceeding tier max_files_per_snapshot", async () => {
    // Create a fresh account so it hasn't used its project slot
    const acct2 = createAccount("FileLimitTest", "filelimit@example.com");
    const key2 = createApiKey(acct2.account_id, "filelimit-key");

    const maxFiles = TIER_LIMITS.free.max_files_per_snapshot;
    const tooManyFiles = Array.from({ length: maxFiles + 1 }, (_, i) => ({
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
        files: tooManyFiles,
      }),
      key2.rawKey,
    );
    expect(r.status).toBe(200);
    const result = getToolResult(r.data);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("File limit");
  });
});

describe("Quota-exceeded guardrails — prepare_for_agentic_purchasing", () => {
  it("rejects free-tier account with entitlement error before quota check", async () => {
    const r = await post(
      "/mcp",
      rpcCall("prepare_for_agentic_purchasing", {
        project_name: "purchase-test",
        project_type: "web_app",
        frameworks: ["stripe"],
        goals: ["payments"],
        files: [{ path: "checkout.ts", content: "export function pay() {}" }],
      }),
      apiKey,
    );
    expect(r.status).toBe(200);
    const result = getToolResult(r.data);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Pro programs require a paid plan");
  });
});
