import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { resetTestDb, createSnapshot, createAccount, createApiKey, getUsageCreditSummary, consumeUsageCredits, sql, recordCompensationOwed, getCompensationSummary, getPaymentFunnelStats, getSettledRevenue, recordPaymentFunnelEvent, ALL_PROGRAMS } from "@axis/snapshots";
import { Router, createApp, sendJSON } from "./router.js";
import { handleMcpPost, handleMcpGet, handleMcpDocs, handleMcpServerJson, getMcpServerMeta, MCP_TOOLS, MCP_PROTOCOL_VERSION, runSearchTools, getMcpCallCounters, logMcpCall } from "./mcp-server.js";
import {
  handleCreateAccount,
  handleCreateApiKey,
} from "./billing.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let TEST_PORT: number;
let apiKey = "";
let freeApiKey = "";
let snapshotId = "";

// ─── HTTP helpers ─────────────────────────────────────────────────

interface Res {
  status: number;
  headers: Record<string, string | string[]>;
  data: unknown;
}

async function post(
  path: string,
  body: unknown,
  authKey?: string,
): Promise<Res> {
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
          const h: Record<string, string | string[]> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined) h[k] = v;
          }
          resolve({ status: res.statusCode ?? 0, headers: h, data });
        });
      },
    );
    r.on("error", reject);
    r.write(payload);
    r.end();
  });
}

/** Like `post`, but lets a test set arbitrary raw headers — used by ping_payment's
 * retry test, which needs a non-"Bearer" Authorization value (the real MPP retry
 * convention) rather than the fixed `Bearer <key>` shape `post`'s authKey applies. */
async function postWithHeaders(
  path: string,
  body: unknown,
  extraHeaders: Record<string, string>,
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(payload)),
      ...extraHeaders,
    };
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: TEST_PORT, path, method: "POST", headers },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          const h: Record<string, string | string[]> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined) h[k] = v;
          }
          resolve({ status: res.statusCode ?? 0, headers: h, data });
        });
      },
    );
    r.on("error", reject);
    r.write(payload);
    r.end();
  });
}

async function get(path: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: TEST_PORT, path, method: "GET" },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          const h: Record<string, string | string[]> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined) h[k] = v;
          }
          resolve({ status: res.statusCode ?? 0, headers: h, data });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

// ─── Server setup ─────────────────────────────────────────────────

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();

  const router = new Router();
  router.post("/mcp", handleMcpPost);
  router.get("/mcp", handleMcpGet);
  router.get("/mcp/docs", handleMcpDocs);
  router.get("/v1/mcp/server.json", handleMcpServerJson);
  router.post("/v1/accounts", handleCreateAccount);
  router.post("/v1/account/keys", handleCreateApiKey);
  router.get("/v1/stats", async (_req, res) => {
    const c = getMcpCallCounters();
    const [funnel, revenue] = await Promise.all([getPaymentFunnelStats(), getSettledRevenue()]);
    sendJSON(res, 200, {
      mcp_calls_today: c.today,
      mcp_calls_total: c.total,
      protocol_calls: c.today,
      x402_challenges_issued: funnel.x402_challenges_issued,
      paid_settlements: revenue.all_time_count + funnel.probe_settlements,
      paid_settlements_cents: revenue.all_time_cents,
      top_tools: Object.entries(c.byTool).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tool, count]) => ({ tool, count })),
      process_started_at: c.startedAt,
      date: c.todayDate,
    });
  });

  // Inline echo for status checks
  router.get("/ping", async (_req, res) => sendJSON(res, 200, { ok: true }));

  server = createServer((req, res) => {
    router.handle(req, res);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  TEST_PORT = addr.port;

  const suite = await createAccount("MCP Suite", "mcp-suite@test.com", "suite");
  apiKey = (await createApiKey(suite.account_id, "suite-key")).rawKey;
  const free = await createAccount("MCP Free", "mcp-free@test.com", "free");
  freeApiKey = (await createApiKey(free.account_id, "free-key")).rawKey;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(err => (err ? reject(err) : resolve())),
  );
});

// ─── Protocol-layer tests ──────────────────────────────────────────

describe("POST /mcp — JSON-RPC parse errors", () => {
  it("returns 400 parse error on invalid JSON body", async () => {
    const r = await new Promise<Res>((resolve, reject) => {
      const payload = "not-json!!!";
      const req = require("node:http").request(
        {
          hostname: "127.0.0.1",
          port: TEST_PORT,
          path: "/mcp",
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(payload)) },
        },
        (res: import("node:http").IncomingMessage) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf-8");
            resolve({ status: res.statusCode ?? 0, headers: {}, data: JSON.parse(raw) });
          });
        },
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
    expect(r.status).toBe(400);
    const d = r.data as Record<string, unknown>;
    expect(d.jsonrpc).toBe("2.0");
    const err = d.error as Record<string, unknown>;
    expect(err.code).toBe(-32700);
  });

  it("returns 400 invalid request when jsonrpc field is missing", async () => {
    const r = await post("/mcp", { method: "ping", id: 1 });
    expect(r.status).toBe(400);
    const err = (r.data as Record<string, unknown>).error as Record<string, unknown>;
    expect(err.code).toBe(-32600);
  });

  it("returns 400 invalid request when method is not a string", async () => {
    const r = await post("/mcp", { jsonrpc: "2.0", id: 1 });
    expect(r.status).toBe(400);
    const err = (r.data as Record<string, unknown>).error as Record<string, unknown>;
    expect(err.code).toBe(-32600);
  });
});

describe("POST /mcp — initialize", () => {
  it("returns protocolVersion, capabilities, serverInfo", async () => {
    const r = await post("/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "test", version: "1.0" } } });
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect(d.jsonrpc).toBe("2.0");
    expect(d.id).toBe(1);
    const result = d.result as Record<string, unknown>;
    expect(result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    const caps = result.capabilities as Record<string, unknown>;
    expect(caps.tools).toBeDefined();
    const info = result.serverInfo as Record<string, unknown>;
    expect(info.name).toBe("axis-iliad");
    expect(result.instructions).toContain("analyze");
    // No marketing payload is injected into the serialization layer —
    // results carry only the standard JSON-RPC fields.
    expect(result.incentives).toBeUndefined();
    expect(result.monetization).toBeUndefined();
    expect(result.axis_capabilities).toBeUndefined();
  });

  it("includes Mcp-Session-Id header on initialize", async () => {
    const r = await post("/mcp", { jsonrpc: "2.0", id: 2, method: "initialize", params: {} });
    expect(r.status).toBe(200);
    expect(r.headers["mcp-session-id"]).toBeDefined();
    expect(typeof r.headers["mcp-session-id"]).toBe("string");
  });

  it("does NOT include Mcp-Session-Id header on non-initialize methods", async () => {
    const r = await post("/mcp", { jsonrpc: "2.0", id: 3, method: "ping" });
    expect(r.status).toBe(200);
    expect(r.headers["mcp-session-id"]).toBeUndefined();
  });
});

describe("POST /mcp — ping", () => {
  it("returns a plain result with no injected marketing keys", async () => {
    const r = await post("/mcp", { jsonrpc: "2.0", id: 4, method: "ping" });
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    const result = d.result as Record<string, unknown>;
    expect(result.incentives).toBeUndefined();
    expect(result.monetization).toBeUndefined();
    expect(result.axis_capabilities).toBeUndefined();
  });
});

describe("GET /v1/stats — anonymous call counters", () => {
  it("returns call stats shape", async () => {
    const r = await get("/v1/stats");
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect(typeof d.mcp_calls_today).toBe("number");
    expect(typeof d.mcp_calls_total).toBe("number");
    expect(Array.isArray(d.top_tools)).toBe(true);
    expect(typeof d.date).toBe("string");
  });

  it("logMcpCall increments counters", async () => {
    const before = getMcpCallCounters().total;
    await logMcpCall("list_programs", null, "127.0.0.1");
    expect(getMcpCallCounters().total).toBe(before + 1);
    expect(getMcpCallCounters().byTool["list_programs"]).toBeGreaterThan(0);
  });

  // x402 onboarding program, Phase 0 (visibility): the payment funnel must be
  // visible on this public, no-auth endpoint and must be restart-durable
  // (backed by real DB rows, not just the in-memory _counters).
  it("exposes protocol_calls, x402_challenges_issued, paid_settlements, paid_settlements_cents", async () => {
    const r = await get("/v1/stats");
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect(typeof d.protocol_calls).toBe("number");
    expect(typeof d.x402_challenges_issued).toBe("number");
    expect(typeof d.paid_settlements).toBe("number");
    expect(typeof d.paid_settlements_cents).toBe("number");
  });

  it("x402_challenges_issued rises after a forced challenge is recorded", async () => {
    const before = ((await get("/v1/stats")).data as Record<string, number>).x402_challenges_issued;
    await recordPaymentFunnelEvent({ account_id: null, tool: "analyze_repo", kind: "challenge" });
    const after = ((await get("/v1/stats")).data as Record<string, number>).x402_challenges_issued;
    expect(after).toBe(before + 1);
  });

  it("paid_settlements rises after a $0 probe settlement is recorded (including $0)", async () => {
    const before = ((await get("/v1/stats")).data as Record<string, number>).paid_settlements;
    await recordPaymentFunnelEvent({ account_id: null, tool: "ping_payment", kind: "settlement", amount_cents: 0 });
    const after = ((await get("/v1/stats")).data as Record<string, number>).paid_settlements;
    expect(after).toBe(before + 1);
  });
});

describe("POST /mcp — tools/list", () => {
  it("returns the full 37-tool catalog (build-not-redact catalog honesty)", async () => {
    const r = await post("/mcp", { jsonrpc: "2.0", id: 5, method: "tools/list" });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const tools = result.tools as Array<Record<string, unknown>>;
    // Catalog honesty (revised): every advertised tool is in MCP_TOOLS.
    expect(tools.length).toBe(37);
    expect(tools.length).toBe(MCP_TOOLS.length);
    // No marketing payload injected into the result
    expect(result.incentives).toBeUndefined();
    expect(result.axis_capabilities).toBeUndefined();
  });

  it("each tool has name, description, inputSchema", async () => {
    const r = await post("/mcp", { jsonrpc: "2.0", id: 6, method: "tools/list" });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const tools = result.tools as Array<Record<string, unknown>>;
    for (const tool of tools) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it("tool names match expected set", async () => {
    const r = await post("/mcp", { jsonrpc: "2.0", id: 7, method: "tools/list" });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const tools = result.tools as Array<{ name: string }>;
    const names = tools.map(t => t.name);
    expect(names).toContain("analyze_repo");
    expect(names).toContain("analyze_files");
    expect(names).toContain("list_programs");
    expect(names).toContain("get_snapshot");
    expect(names).toContain("get_artifact");
    expect(names).toContain("closer");
  });

  it("analyze_repo description discloses auth, payment, errors, and alternatives", async () => {
    const r = await post("/mcp", { jsonrpc: "2.0", id: 7, method: "tools/list" });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const tools = result.tools as Array<{ name: string; description: string }>;
    const analyzeRepo = tools.find(tool => tool.name === "analyze_repo");
    expect(analyzeRepo).toBeDefined();
    expect(analyzeRepo!.description).toContain("Authorization: Bearer <api_key>");
    expect(analyzeRepo!.description).toContain("paid path");
    expect(analyzeRepo!.description).toContain("analyze_files");
    expect(analyzeRepo!.description).toContain("list_programs");
    expect(analyzeRepo!.description).toContain("search_and_discover_tools");
    expect(analyzeRepo!.description).toContain("invalid-URL");
    expect(analyzeRepo!.description).toContain("GitHub-fetch errors");
    expect(analyzeRepo!.description).toContain("private repos require a stored GitHub token");
  });

  it("tools/list result carries no injected marketing keys", async () => {
    const r = await post("/mcp", { jsonrpc: "2.0", id: 7, method: "tools/list" });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const keys = Object.keys(result);
    expect(keys).not.toContain("incentives");
    expect(keys).not.toContain("monetization");
    expect(keys).not.toContain("axis_capabilities");
  });

  it("tools/call result carries content without injected marketing keys", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 7, method: "tools/call",
      params: { name: "list_programs", arguments: {} },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const keys = Object.keys(result);
    expect(keys).toContain("content");
    expect(keys).not.toContain("incentives");
    expect(keys).not.toContain("monetization");
    expect(keys).not.toContain("axis_capabilities");
  });

  it("every tool schema has examples array", async () => {
    for (const tool of MCP_TOOLS) {
      expect(
        (tool as Record<string, unknown>).examples,
        `${tool.name} missing examples`,
      ).toBeDefined();
      expect(
        Array.isArray((tool as Record<string, unknown>).examples),
        `${tool.name} examples is not an array`,
      ).toBe(true);
    }
  });

  // H-Phase-A cycle 7: destructiveHint was hardcoded false for EVERY tool,
  // including these two, which have genuinely irreversible delete
  // capability (iliad_object_storage's engineer-mode `delete` permanently
  // removes an R2 object; iliad_web_search's `delete_namespace` wipes an
  // entire namespace's indexed corpus in one call) — misrepresenting the
  // real risk to any client/orchestrator that uses this hint to decide
  // whether to ask for confirmation before invoking a tool.
  it("marks the 2 genuinely destructive tools destructiveHint:true, and leaves every other tool false", async () => {
    const destructiveByDesign = new Set(["iliad_object_storage", "iliad_web_search"]);
    for (const tool of MCP_TOOLS as Array<Record<string, unknown>>) {
      const annotations = tool.annotations as Record<string, unknown>;
      const expected = destructiveByDesign.has(tool.name as string);
      expect(annotations.destructiveHint, `${String(tool.name)}.destructiveHint`).toBe(expected);
    }
  });

  it("every tool outputSchema has top-level object type, except get_artifact (raw file content, not JSON)", async () => {
    for (const tool of MCP_TOOLS as Array<Record<string, unknown>>) {
      const outputSchema = tool.outputSchema as Record<string, unknown>;
      expect(outputSchema).toBeDefined();
      if (tool.name === "get_artifact") {
        // get_artifact returns the artifact's raw bytes directly as the tool result
        // text — never a JSON-encoded object (H4.1 finding: it used to advertise a
        // fake {content: string} wrapper solely to satisfy this same object-type rule).
        expect(outputSchema.type).toBe("string");
        continue;
      }
      expect(outputSchema.type, `${String(tool.name)} outputSchema.type must be object`).toBe("object");
    }
  });

  it("canonical analyze_repo metadata stays optimized for registry scoring", async () => {
    const analyzeRepo = MCP_TOOLS.find(tool => tool.name === "analyze_repo");
    expect(analyzeRepo).toBeDefined();
    expect(analyzeRepo!.description).toContain("snapshot_id plus an artifacts listing");
    expect(analyzeRepo!.description).toContain("Use this when the source of truth is a GitHub repo URL");
    expect(analyzeRepo!.description).toContain("$0.50 standard, $0.15 lite budget mode");
    expect(analyzeRepo!.description).toContain("authentication, quota, payment-required, invalid-URL, or GitHub-fetch errors");
  });
});

describe("POST /mcp — tools/call list_programs", () => {
  it("returns programs array with tier info (no auth required)", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "list_programs", arguments: {} },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(Array.isArray(parsed.programs)).toBe(true);
    expect(parsed.total_generators).toBeGreaterThan(0);
    expect(Array.isArray(parsed.free_programs)).toBe(true);
    expect(Array.isArray(parsed.pro_programs)).toBe(true);
    expect(parsed.discovery_to_paid_path.step_3).toContain("prepare_agentic_purchasing");
  });

  it("free programs include search, skills, debug", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "list_programs", arguments: {} },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.free_programs).toContain("search");
    expect(parsed.free_programs).toContain("skills");
    expect(parsed.free_programs).toContain("debug");
  });
});

describe("POST /mcp — tools/call analyze_files", () => {
  const testFiles = [
    { path: "src/index.ts", content: 'export const app = {};' },
    { path: "package.json", content: '{"name":"test-mcp","dependencies":{"react":"18.0.0"}}' },
  ];

  it("returns isError:true with auth error when no API key", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: {
        name: "analyze_files",
        arguments: {
          project_name: "test",
          project_type: "web_application",
          frameworks: [],
          goals: ["Generate context"],
          files: testFiles,
        },
      },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("Authentication required");
  });

  it("returns isError:true with auth error when invalid key provided", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: {
          name: "analyze_files",
          arguments: {
            project_name: "test",
            project_type: "web_application",
            frameworks: [],
            goals: ["ctx"],
            files: testFiles,
          },
        },
      },
      "axis_invalid_key_does_not_exist",
    );
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("Invalid or revoked API key");
  });

  it("returns structured payment-required JSON for free-tier full analysis", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 111,
        method: "tools/call",
        params: {
          name: "analyze_files",
          arguments: {
            project_name: "test",
            project_type: "web_application",
            frameworks: ["react"],
            goals: ["Generate full bundle"],
            files: testFiles,
          },
        },
      },
      freeApiKey,
    );
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.error).toBe("Payment Required");
    expect(parsed.price).toBe("0.50");
    expect(parsed.referral_token).toBeTruthy();
  });

  it("succeeds with valid API key and returns artifacts", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 12,
        method: "tools/call",
        params: {
          name: "analyze_files",
          arguments: {
            project_name: "mcp-test-project",
            project_type: "web_application",
            frameworks: ["react"],
            goals: ["Generate context for AI agents"],
            files: testFiles,
          },
        },
      },
      apiKey,
    );
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(typeof parsed.snapshot_id).toBe("string");
    expect(parsed.status).toBe("ready");
    expect(Array.isArray(parsed.artifacts)).toBe(true);
    expect(parsed.artifact_count).toBeGreaterThan(0);
    expect(parsed.snapshot_summary.pro_unlock).toContain("15 more programs");
    snapshotId = parsed.snapshot_id; // save for subsequent tests
  });

  // ─── Lite mode restriction (H-Phase-A cycle 1) ────────────────────
  //
  // lite_description promises "search/skills/debug programs only (3 of 20
  // programs)". Before this fix, requested_outputs was always every program
  // regardless of X-Agent-Mode, so a fully-entitled (suite) account paying the
  // lite price still received the full standard-mode bundle — apiKey (suite
  // tier, all 20 programs auto-enabled) is the account that can reach this
  // path at all (analyze_files 402s a free-tier account outright, tested
  // above), so it's the only way to prove lite ACTUALLY restricts output
  // rather than just being allowed to run.
  it("lite mode restricts output to the 3 free programs even for a fully-entitled account", async () => {
    const r = await postWithHeaders(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 121,
        method: "tools/call",
        params: {
          name: "analyze_files",
          arguments: {
            project_name: "lite-mode-test",
            project_type: "web_application",
            frameworks: [],
            goals: ["ctx"],
            files: testFiles,
          },
        },
      },
      { Authorization: `Bearer ${apiKey}`, "X-Agent-Mode": "lite" },
    );
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.snapshot_summary.mode).toBe("lite");
    expect(parsed.artifact_count).toBeGreaterThan(0);
    const programsExecuted = parsed.programs_executed as string[];
    expect(programsExecuted.length).toBeGreaterThan(0);
    // At least the 3 free programs must run. Cross-cutting meta-artifacts
    // ("quality", "begin", ...) that aren't part of the 20 counted generator
    // programs the lite promise scopes "3 of 20" against are allowed to
    // appear regardless of mode -- what must NEVER appear is any of the
    // OTHER 17 real, non-free generator programs (seo, optimization, theme,
    // brand, marketing, ...): that's the exact leak this fix closes.
    expect(programsExecuted).toEqual(expect.arrayContaining(["search", "skills", "debug"]));
    const nonFreeGeneratorPrograms = ALL_PROGRAMS.filter(
      (p) => !["search", "skills", "debug"].includes(p),
    );
    for (const program of programsExecuted) {
      expect(nonFreeGeneratorPrograms).not.toContain(program);
    }
  });

  it("returns isError:true when project_name is missing", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 13,
        method: "tools/call",
        params: {
          name: "analyze_files",
          arguments: { project_type: "web_application", frameworks: [], goals: [], files: testFiles },
        },
      },
      apiKey,
    );
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("project_name");
  });

  it("returns isError:true when project_type is missing", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 14,
        method: "tools/call",
        params: {
          name: "analyze_files",
          arguments: { project_name: "test", frameworks: [], goals: [], files: testFiles },
        },
      },
      apiKey,
    );
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("project_type");
  });

  it("returns isError:true when frameworks is not an array", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 15,
        method: "tools/call",
        params: {
          name: "analyze_files",
          arguments: {
            project_name: "test",
            project_type: "web_application",
            frameworks: "react",
            goals: [],
            files: testFiles,
          },
        },
      },
      apiKey,
    );
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
  });

  it("returns isError:true when files array is empty", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 16,
        method: "tools/call",
        params: {
          name: "analyze_files",
          arguments: {
            project_name: "test",
            project_type: "web_application",
            frameworks: [],
            goals: [],
            files: [],
          },
        },
      },
      apiKey,
    );
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
  });

  it("returns isError:true on path traversal in file paths", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 17,
        method: "tools/call",
        params: {
          name: "analyze_files",
          arguments: {
            project_name: "test",
            project_type: "web_application",
            frameworks: [],
            goals: [],
            files: [{ path: "../../etc/passwd", content: "bad" }],
          },
        },
      },
      apiKey,
    );
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("Invalid file path");
  });

  it("returns isError:true when file has no path", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 18,
        method: "tools/call",
        params: {
          name: "analyze_files",
          arguments: {
            project_name: "test",
            project_type: "web_application",
            frameworks: [],
            goals: [],
            files: [{ content: "no path here" }],
          },
        },
      },
      apiKey,
    );
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
  });
});

describe("POST /mcp — _error categorization", () => {
  it("returns _error.code=auth for missing API key", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 900,
      method: "tools/call",
      params: { name: "analyze_files", arguments: { project_name: "t", project_type: "web", frameworks: [], goals: [], files: [{ path: "a.ts", content: "x" }] } },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const err = result._error as Record<string, unknown>;
    expect(err.code).toBe("auth");
    expect(err.retryable).toBe(false);
  });

  it("returns _error.code=validation for missing project_name", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 901,
      method: "tools/call",
      params: { name: "analyze_files", arguments: { project_type: "web", frameworks: [], goals: [], files: [{ path: "a.ts", content: "x" }] } },
    }, apiKey);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const err = result._error as Record<string, unknown>;
    expect(err.code).toBe("validation");
    expect(err.retryable).toBe(false);
  });

  it("returns _error.code=validation for path traversal", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 902,
      method: "tools/call",
      params: { name: "analyze_files", arguments: { project_name: "t", project_type: "web", frameworks: [], goals: [], files: [{ path: "../../etc/passwd", content: "x" }] } },
    }, apiKey);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const err = result._error as Record<string, unknown>;
    expect(err.code).toBe("validation");
  });
});

describe("POST /mcp — tools/call get_snapshot", () => {
  it("returns snapshot data for a valid snapshot_id", async () => {
    expect(snapshotId).not.toBe(""); // depends on analyze_files success test
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 19,
        method: "tools/call",
        params: { name: "get_snapshot", arguments: { snapshot_id: snapshotId } },
      },
      apiKey,
    );
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.snapshot_id).toBe(snapshotId);
    expect(parsed.status).toBe("ready");
    expect(Array.isArray(parsed.artifacts)).toBe(true);
  });

  it("returns isError:true for nonexistent snapshot", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 20,
      method: "tools/call",
      params: { name: "get_snapshot", arguments: { snapshot_id: "nonexistent-id" } },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
  });

  it("returns isError:true when snapshot_id is missing", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 21,
      method: "tools/call",
      params: { name: "get_snapshot", arguments: {} },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("snapshot_id");
  });

  it("returns isError:true when accessing owned snapshot without auth", async () => {
    // snapshotId was created with apiKey and thus has account_id set
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 22,
      method: "tools/call",
      params: { name: "get_snapshot", arguments: { snapshot_id: snapshotId } },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("not found");
  });
});

describe("POST /mcp — tools/call get_artifact", () => {
  it("returns artifact content for a valid path", async () => {
    expect(snapshotId).not.toBe("");
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 23,
        method: "tools/call",
        params: { name: "get_artifact", arguments: { snapshot_id: snapshotId, path: "AGENTS.md" } },
      },
      apiKey,
    );
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text.length).toBeGreaterThan(0);
  });

  it("returns isError:true for nonexistent artifact path", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 24,
        method: "tools/call",
        params: {
          name: "get_artifact",
          arguments: { snapshot_id: snapshotId, path: "does-not-exist.xyz" },
        },
      },
      apiKey,
    );
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("not found");
    expect(content[0].text).toContain("Available:");
  });

  it("returns isError:true when snapshot_id is missing", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 25,
      method: "tools/call",
      params: { name: "get_artifact", arguments: { path: "AGENTS.md" } },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
  });

  it("returns isError:true when path is missing", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 26,
      method: "tools/call",
      params: { name: "get_artifact", arguments: { snapshot_id: snapshotId } },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("path");
  });

  it("returns isError:true when snapshot not found", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 27,
      method: "tools/call",
      params: { name: "get_artifact", arguments: { snapshot_id: "bad-id", path: "AGENTS.md" } },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
  });

  it("returns isError:true when accessing owned snapshot artifact without auth", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 28,
      method: "tools/call",
      params: { name: "get_artifact", arguments: { snapshot_id: snapshotId, path: "AGENTS.md" } },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
  });
});

// ─── Input-validation hardening tests (eq_202) ──────────────────
describe("POST /mcp — input validation hardening", () => {
  it("rejects get_artifact with path traversal", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 950,
      method: "tools/call",
      params: { name: "get_artifact", arguments: { snapshot_id: snapshotId, path: "../../etc/passwd" } },
    }, apiKey);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("Invalid artifact path");
    const err = result._error as Record<string, unknown>;
    expect(err.code).toBe("validation");
  });

  it("rejects analyze_files when project_name exceeds max length", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 951,
      method: "tools/call",
      params: { name: "analyze_files", arguments: { project_name: "x".repeat(501), project_type: "web", frameworks: [], goals: [], files: [{ path: "a.ts", content: "x" }] } },
    }, apiKey);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("exceeds max length");
    const err = result._error as Record<string, unknown>;
    expect(err.code).toBe("validation");
  });

  it("rejects analyze_files with oversized file content", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 952,
      method: "tools/call",
      params: { name: "analyze_files", arguments: { project_name: "t", project_type: "web", frameworks: [], goals: [], files: [{ path: "big.ts", content: "x".repeat(5 * 1024 * 1024 + 1) }] } },
    }, apiKey);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("exceeds max content size");
  });

  it("discover_agentic_purchasing_needs handles non-string focus_areas elements", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 953,
      method: "tools/call",
      params: { name: "discover_agentic_purchasing_needs", arguments: { task_description: "test", focus_areas: [42, null, "sca", { bad: true }] } },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    // Should succeed without crashing — non-strings are filtered out
    expect(result.isError).toBe(false);
  });
});

describe("POST /mcp — tools/call analyze_repo", () => {
  it("returns isError:true without auth", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 29,
      method: "tools/call",
      params: { name: "analyze_repo", arguments: { github_url: "https://github.com/owner/repo" } },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("Authentication required");
  });

  it("returns isError:true when github_url is missing", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 30,
        method: "tools/call",
        params: { name: "analyze_repo", arguments: {} },
      },
      apiKey,
    );
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("github_url");
  });

  it("returns isError:true for non-GitHub URL", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 31,
        method: "tools/call",
        params: { name: "analyze_repo", arguments: { github_url: "https://gitlab.com/owner/repo" } },
      },
      apiKey,
    );
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("Invalid GitHub URL");
  });

  it("returns isError:true for valid github.com URL when network unavailable", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 35,
        method: "tools/call",
        params: { name: "analyze_repo", arguments: { github_url: "https://github.com/axis-test/no-such-repo-xyz" } },
      },
      apiKey,
    );
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    // Either a quota error (account reused), a network error, or a GitHub fetch error
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text.length).toBeGreaterThan(0);
  });
});

describe("POST /mcp — unknown tool and method", () => {
  it("returns RPC error for unknown tool name", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 32,
      method: "tools/call",
      params: { name: "does_not_exist", arguments: {} },
    });
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    const err = d.error as Record<string, unknown>;
    expect(err.code).toBe(-32602);
    expect(String(err.message)).toContain("Unknown tool");
  });

  it("returns RPC error when tools/call has no name", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 33,
      method: "tools/call",
      params: { arguments: {} },
    });
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    const err = d.error as Record<string, unknown>;
    expect(err.code).toBe(-32602);
  });

  it("returns method not found for unknown method", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 34,
      method: "resources/list",
    });
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    const err = d.error as Record<string, unknown>;
    expect(err.code).toBe(-32601);
    expect(String(err.message)).toContain("Method not found");
  });
});

describe("POST /mcp — notifications", () => {
  it("returns 202 no body for notifications/initialized", async () => {
    const r = await new Promise<Res>((resolve, reject) => {
      const payload = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });
      const req = require("node:http").request(
        {
          hostname: "127.0.0.1",
          port: TEST_PORT,
          path: "/mcp",
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(payload)) },
        },
        (res: import("node:http").IncomingMessage) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            resolve({ status: res.statusCode ?? 0, headers: {}, data: Buffer.concat(chunks).toString("utf-8") });
          });
        },
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
    expect(r.status).toBe(202);
    expect(r.data).toBe(""); // no body
  });
});

describe("GET /mcp — JSON manifest", () => {
  it("returns 200 with application/json content-type", async () => {
    const r = await get("/mcp");
    expect(r.status).toBe(200);
    const ct = r.headers["content-type"] as string;
    expect(ct).toContain("application/json");
  });

  it("does not embed an incentives marketing section", async () => {
    const r = await get("/mcp");
    const data = r.data as Record<string, unknown>;
    expect(data.incentives).toBeUndefined();
    const raw = JSON.stringify(r.data);
    expect(raw).not.toContain('"incentives"');
    expect(raw).not.toContain("Share-to-Earn");
  });

  it("contains required manifest fields", async () => {
    const r = await get("/mcp");
    const data = r.data as Record<string, unknown>;
    expect(data.server).toBeDefined();
    expect(data.tools).toBeDefined();
    expect(data._meta).toBeDefined();
    const server = data.server as Record<string, unknown>;
    expect(server.name).toBe("axis-iliad");
    expect(server.endpoint).toBeDefined();
    // Pricing/auth metadata stays — facts, not growth-hack instructions.
    const meta = data._meta as Record<string, unknown>;
    expect(meta.authentication).toBeDefined();
    expect(meta.monetization).toBeDefined();
  });
});

describe("GET /mcp/docs — human-readable HTML docs", () => {
  it("returns 200 with text/html content-type", async () => {
    const r = await get("/mcp/docs");
    expect(r.status).toBe(200);
    const ct = r.headers["content-type"] as string;
    expect(ct).toContain("text/html");
  });

  it("body contains Axis' Iliad heading without referral marketing", async () => {
    const r = await get("/mcp/docs");
    const body = String(r.data);
    expect(body).toContain("Axis' Iliad");
    expect(body).toContain("Pricing");
    expect(body).not.toContain("Incentives");
    expect(body).not.toContain("referral_token");
    expect(body).not.toContain("5th paid call free");
  });
});

// ─── Branch coverage completeness tests ───────────────────────────

describe("POST /mcp — branch coverage: analyze_files goals not array", () => {
  it("returns isError:true when goals is not an array", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 36,
        method: "tools/call",
        params: {
          name: "analyze_files",
          arguments: {
            project_name: "test",
            project_type: "web_application",
            frameworks: [],
            goals: "not-an-array",
            files: [{ path: "a.ts", content: "export {}" }],
          },
        },
      },
      apiKey,
    );
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("goals");
  });
});

describe("POST /mcp — branch coverage: analyze_repo invalid key", () => {
  it("returns isError:true with invalid key error for analyze_repo", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 37,
        method: "tools/call",
        params: { name: "analyze_repo", arguments: { github_url: "https://github.com/owner/repo" } },
      },
      "axis_invalid_key_xyz",
    );
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("Invalid or revoked API key");
  });
});

describe("POST /mcp — branch coverage: tools/call empty tool name", () => {
  it("returns RPC error when tools/call name is empty string", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 38,
      method: "tools/call",
      params: { name: "", arguments: {} },
    });
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    const err = d.error as Record<string, unknown>;
    expect(err.code).toBe(-32602);
  });

  it("succeeds when tools/call omits arguments (uses empty default)", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 41,
      method: "tools/call",
      params: { name: "list_programs" }, // no arguments key
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
  });
});

describe("POST /mcp — branch coverage: request id is null/undefined", () => {
  it("returns 400 with null id when invalid request has no id field", async () => {
    const r = await post("/mcp", { method: "ping" }); // no jsonrpc, no id
    expect(r.status).toBe(400);
    const d = r.data as Record<string, unknown>;
    expect(d.id).toBeNull();
  });

  it("returns 200 with null id when valid request has no id field", async () => {
    const r = await post("/mcp", { jsonrpc: "2.0", method: "ping" }); // no id
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect(d.id).toBeNull();
    const result = d.result as Record<string, unknown>;
    expect(result).toBeDefined();
    expect(result.incentives).toBeUndefined();
  });
});

describe("POST /mcp — branch coverage: anonymous snapshots", () => {
  let anonSnapshotId = "";

  beforeAll(async () => {
    // Create a snapshot outside the MCP API path (no account_id, no generated artifacts)
    const snap = await createSnapshot(
      {
        input_method: "api_submission",
        manifest: {
          project_name: "anon-test",
          project_type: "library",
          frameworks: [],
          goals: [],
          requested_outputs: [],
        },
        files: [],
      },
      undefined,
    );
    anonSnapshotId = snap.snapshot_id;
  });

  it("get_snapshot returns data for anonymous snapshot without auth", async () => {
    expect(anonSnapshotId).not.toBe("");
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 39,
      method: "tools/call",
      params: { name: "get_snapshot", arguments: { snapshot_id: anonSnapshotId } },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.snapshot_id).toBe(anonSnapshotId);
    expect(parsed.artifact_count).toBe(0);
    expect(parsed.artifacts).toEqual([]);
  });

  it("get_artifact returns isError:true when snapshot has no generated artifacts", async () => {
    expect(anonSnapshotId).not.toBe("");
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 40,
      method: "tools/call",
      params: { name: "get_artifact", arguments: { snapshot_id: anonSnapshotId, path: "AGENTS.md" } },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    expect(content[0].text).toContain("No generated artifacts");
  });
});

// ─── runSearchTools unit tests ───────────────────────────────────

describe("runSearchTools — no query returns all programs", () => {
  it("returns all 20 programs when q is omitted", async () => {
    const parsed = JSON.parse(runSearchTools({}));
    expect(parsed.total_matches).toBe(20);
    expect(Array.isArray(parsed.results)).toBe(true);
  });

  it("query is null when no q provided", async () => {
    const parsed = JSON.parse(runSearchTools({}));
    expect(parsed.query).toBeNull();
  });

  it("program_filter is null when no program provided", async () => {
    const parsed = JSON.parse(runSearchTools({}));
    expect(parsed.program_filter).toBeNull();
  });

  it("every result has program, tier, capability_tags, all_artifacts, example_call", async () => {
    const parsed = JSON.parse(runSearchTools({}));
    for (const r of parsed.results as Array<Record<string, unknown>>) {
      expect(typeof r.program).toBe("string");
      expect(r.tier === "free" || r.tier === "pro").toBe(true);
      expect(Array.isArray(r.capability_tags)).toBe(true);
      expect(Array.isArray(r.all_artifacts)).toBe(true);
      expect(typeof r.example_call).toBe("string");
    }
  });

  it("free programs (search, skills, debug) have tier free", async () => {
    const parsed = JSON.parse(runSearchTools({}));
    const results = parsed.results as Array<{ program: string; tier: string }>;
    for (const name of ["search", "skills", "debug"]) {
      const r = results.find(p => p.program === name);
      expect(r?.tier).toBe("free");
    }
  });

  it("agentic-purchasing has pro tier", async () => {
    const parsed = JSON.parse(runSearchTools({}));
    const results = parsed.results as Array<{ program: string; tier: string }>;
    const r = results.find(p => p.program === "agentic-purchasing");
    expect(r?.tier).toBe("pro");
  });
});

describe("runSearchTools — keyword query ranking", () => {
  it("q=checkout returns agentic-purchasing as top match", async () => {
    const parsed = JSON.parse(runSearchTools({ q: "checkout" }));
    expect(parsed.total_matches).toBeGreaterThan(0);
    const top = (parsed.results as Array<{ program: string }>)[0];
    expect(top.program).toBe("agentic-purchasing");
  });

  it("q=checkout annotates matching_artifacts with checkout-flow.md", async () => {
    const parsed = JSON.parse(runSearchTools({ q: "checkout" }));
    const r = (parsed.results as Array<{ program: string; matching_artifacts: string[] }>)
      .find(p => p.program === "agentic-purchasing");
    expect(r?.matching_artifacts).toContain("checkout-flow.md");
  });

  it("q=debug returns debug program with score > 0", async () => {
    const parsed = JSON.parse(runSearchTools({ q: "debug" }));
    const r = (parsed.results as Array<{ program: string; score: number }>)
      .find(p => p.program === "debug");
    expect(r).toBeDefined();
    expect(r!.score).toBeGreaterThan(0);
  });

  it("q=mcp returns mcp program with program match score", async () => {
    const parsed = JSON.parse(runSearchTools({ q: "mcp" }));
    const r = (parsed.results as Array<{ program: string; score: number }>)
      .find(p => p.program === "mcp");
    expect(r).toBeDefined();
    expect(r!.score).toBeGreaterThanOrEqual(3);
  });

  it("results are sorted by score descending", async () => {
    const parsed = JSON.parse(runSearchTools({ q: "agents" }));
    const scores = (parsed.results as Array<{ score: number }>).map(r => r.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });

  it("q=xxxxnothing returns 0 matches", async () => {
    const parsed = JSON.parse(runSearchTools({ q: "xxxxnothing" }));
    expect(parsed.total_matches).toBe(0);
    expect(parsed.results).toEqual([]);
  });

  it("query is echoed back in response", async () => {
    const parsed = JSON.parse(runSearchTools({ q: "checkout" }));
    expect(parsed.query).toBe("checkout");
  });

  it("q is trimmed and lowercased", async () => {
    const parsed = JSON.parse(runSearchTools({ q: "  CHECKOUT  " }));
    expect(parsed.query).toBe("checkout");
    expect(parsed.total_matches).toBeGreaterThan(0);
  });
});

describe("runSearchTools — program filter", () => {
  it("program=debug returns only debug program", async () => {
    const parsed = JSON.parse(runSearchTools({ program: "debug" }));
    const programs = (parsed.results as Array<{ program: string }>).map(r => r.program);
    expect(programs.every(p => p.includes("debug"))).toBe(true);
    expect(parsed.total_matches).toBeGreaterThanOrEqual(1);
  });

  it("program=mcp with no q returns mcp program results", async () => {
    const parsed = JSON.parse(runSearchTools({ program: "mcp" }));
    const programs = (parsed.results as Array<{ program: string }>).map(r => r.program);
    expect(programs).toContain("mcp");
  });

  it("program filter is case-insensitive", async () => {
    const parsed = JSON.parse(runSearchTools({ program: "MCP" }));
    const programs = (parsed.results as Array<{ program: string }>).map(r => r.program);
    expect(programs).toContain("mcp");
  });

  it("program=nonexistent returns 0 matches", async () => {
    const parsed = JSON.parse(runSearchTools({ program: "nonexistent-program" }));
    expect(parsed.total_matches).toBe(0);
  });

  it("program_filter is echoed in response", async () => {
    const parsed = JSON.parse(runSearchTools({ program: "debug" }));
    expect(parsed.program_filter).toBe("debug");
  });
});

describe("runSearchTools — PROGRAM_ENDPOINTS coverage", () => {
  it("search program example_call uses /v1/search/index", async () => {
    const parsed = JSON.parse(runSearchTools({ program: "search" }));
    const r = (parsed.results as Array<{ program: string; example_call: string }>)
      .find(p => p.program === "search");
    expect(r?.example_call).toBe("POST /v1/search/index");
  });

  it("mcp program example_call uses /v1/mcp/provision", async () => {
    const parsed = JSON.parse(runSearchTools({ program: "mcp" }));
    const r = (parsed.results as Array<{ program: string; example_call: string }>)
      .find(p => p.program === "mcp");
    expect(r?.example_call).toBe("POST /v1/mcp/provision");
  });

  it("agentic-purchasing example_call uses /v1/agentic-purchasing/generate", async () => {
    const parsed = JSON.parse(runSearchTools({ program: "agentic-purchasing" }));
    const r = (parsed.results as Array<{ program: string; example_call: string }>)
      .find(p => p.program === "agentic-purchasing");
    expect(r?.example_call).toBe("POST /v1/agentic-purchasing/generate");
  });

  it("debug program example_call uses fallback /v1/debug/generate", async () => {
    const parsed = JSON.parse(runSearchTools({ program: "debug" }));
    const r = (parsed.results as Array<{ program: string; example_call: string }>)
      .find(p => p.program === "debug");
    expect(r?.example_call).toBe("POST /v1/debug/generate");
  });
});

describe("POST /mcp — tools/call search_and_discover_tools", () => {
  it("returns results for keyword search (no auth required)", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 50,
      method: "tools/call",
      params: { name: "search_and_discover_tools", arguments: { q: "checkout" } },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.total_matches).toBeGreaterThan(0);
  });

  it("returns all programs when no q arg provided", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 51,
      method: "tools/call",
      params: { name: "search_and_discover_tools", arguments: {} },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.total_matches).toBe(20);
  });

  it("tool name appears in MCP_TOOLS", async () => {
    const names = MCP_TOOLS.map(t => t.name);
    expect(names).toContain("search_and_discover_tools");
  });
});

// ─── getMcpServerMeta unit tests ─────────────────────────────────

describe("getMcpServerMeta — shape and content", () => {
  it("returns an object with required registry fields", async () => {
    const meta = getMcpServerMeta();
    const server = meta.server as Record<string, unknown>;
    expect(typeof server.name).toBe("string");
    expect(typeof server.version).toBe("string");
    expect(typeof server.endpoint).toBe("string");
  });

  it("server.name is the branded registry name", async () => {
    const server = getMcpServerMeta().server as Record<string, unknown>;
    expect(server.name).toBe("Axis' Iliad");
    expect(server.slug).toBe("axis-iliad");
  });

  it("server.endpoint points to production MCP HTTP endpoint", async () => {
    const server = getMcpServerMeta().server as Record<string, unknown>;
    expect(server.endpoint).toBe("https://axis-api-6c7z.onrender.com/v1/mcp");
  });

  it("_meta.protocol includes MCP_PROTOCOL_VERSION", async () => {
    const _meta = getMcpServerMeta()._meta as Record<string, unknown>;
    expect(String(_meta.protocol)).toContain(MCP_PROTOCOL_VERSION);
  });

  it("tools array exposes the full 37-tool catalog (build-not-redact)", async () => {
    const tools = getMcpServerMeta().tools as Array<{ name: string; description: string }>;
    expect(tools).toHaveLength(37);
    expect(tools).toHaveLength(MCP_TOOLS.length);
    const allNames = new Set(MCP_TOOLS.map(t => t.name));
    for (const t of tools) {
      expect(allNames.has(t.name)).toBe(true);
    }
  });

  it("each tool entry has name and description only", async () => {
    const tools = getMcpServerMeta().tools as Array<Record<string, unknown>>;
    for (const t of tools) {
      expect(typeof t.name).toBe("string");
      expect(typeof t.description).toBe("string");
      expect(Object.keys(t)).toEqual(["name", "description"]);
    }
  });

  it("_meta.categories is a non-empty array of strings", async () => {
    const _meta = getMcpServerMeta()._meta as Record<string, unknown>;
    const cats = _meta.categories as string[];
    expect(Array.isArray(cats)).toBe(true);
    expect(cats.length).toBeGreaterThan(0);
    for (const c of cats) expect(typeof c).toBe("string");
  });

  it("_meta.authentication type is bearer", async () => {
    const _meta = getMcpServerMeta()._meta as Record<string, unknown>;
    const auth = _meta.authentication as { type: string };
    expect(auth.type).toBe("bearer");
  });

  it("_meta.quickstart has step1_discover and step2_analyze keys", async () => {
    const _meta = getMcpServerMeta()._meta as Record<string, unknown>;
    const qs = _meta.quickstart as Record<string, string>;
    expect(typeof qs.step1_discover).toBe("string");
    expect(typeof qs.step2_analyze).toBe("string");
  });

  it("returns same structure on repeated calls (deterministic)", async () => {
    expect(JSON.stringify(getMcpServerMeta())).toBe(JSON.stringify(getMcpServerMeta()));
  });
});

// ─── GET /v1/mcp/server.json route tests ─────────────────────────

describe("GET /v1/mcp/server.json", () => {
  it("returns 200 with application/json content-type", async () => {
    const r = await get("/v1/mcp/server.json");
    expect(r.status).toBe(200);
    const ct = r.headers["content-type"] as string;
    expect(ct).toContain("application/json");
  });

  it("body contains branded server name and slug", async () => {
    const r = await get("/v1/mcp/server.json");
    const data = r.data as Record<string, unknown>;
    const server = data.server as Record<string, unknown>;
    expect(server.name).toBe("Axis' Iliad");
    expect(server.slug).toBe("axis-iliad");
  });

  it("body contains registry version 0.5.0", async () => {
    const r = await get("/v1/mcp/server.json");
    const data = r.data as Record<string, unknown>;
    const server = data.server as Record<string, unknown>;
    expect(server.version).toBe("0.5.0");
  });

  it("body contains server.endpoint", async () => {
    const r = await get("/v1/mcp/server.json");
    const data = r.data as Record<string, unknown>;
    const server = data.server as Record<string, unknown>;
    expect(server.endpoint).toBe("https://axis-api-6c7z.onrender.com/v1/mcp");
  });

  it("body contains 37 tools (full catalog, build-not-redact; image_generation delegated to AXIS Foundry sibling)", async () => {
    const r = await get("/v1/mcp/server.json");
    const data = r.data as Record<string, unknown>;
    const tools = data.tools as unknown[];
    expect(tools).toHaveLength(37);
  });

  it("body contains _meta.categories array", async () => {
    const r = await get("/v1/mcp/server.json");
    const data = r.data as Record<string, unknown>;
    const _meta = data._meta as Record<string, unknown>;
    expect(Array.isArray(_meta.categories)).toBe(true);
  });

  it("body matches getMcpServerMeta output", async () => {
    const r = await get("/v1/mcp/server.json");
    const data = r.data as Record<string, unknown>;
    expect(JSON.stringify(data)).toBe(JSON.stringify(getMcpServerMeta()));
  });
});

// ─── POST /mcp — tools/call discover_commerce_tools ─────────────

describe("POST /mcp — tools/call discover_commerce_tools", () => {
  it("returns tool overview with install configs (no auth required)", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 60,
      method: "tools/call",
      params: { name: "discover_commerce_tools", arguments: {} },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.axis_iliad).toBeDefined();
    expect(parsed.tools).toBeDefined();
    expect(Array.isArray(parsed.tools)).toBe(true);
    // discover_commerce_tools mirrors the full advertised catalog (build-not-redact).
    expect(parsed.tools.length).toBe(37);
  });

  it("includes free_tools array", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 61,
      method: "tools/call",
      params: { name: "discover_commerce_tools", arguments: {} },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(Array.isArray(parsed.free_tools)).toBe(true);
    expect(parsed.free_tools).toContain("discover_commerce_tools");
  });

  it("includes install section with platform configs", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 62,
      method: "tools/call",
      params: { name: "discover_commerce_tools", arguments: {} },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.install).toBeDefined();
    expect(parsed.install.platforms["claude-desktop"]).toBeDefined();
    expect(parsed.install.platforms.cursor).toBeDefined();
    expect(parsed.install.platforms.vscode).toBeDefined();
  });

  it("includes shareable_manifest and system_prompt_snippet", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 63,
      method: "tools/call",
      params: { name: "discover_commerce_tools", arguments: {} },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.shareable_manifest).toBeDefined();
    expect(typeof parsed.system_prompt_snippet).toBe("string");
    expect(parsed.shareable_manifest.tools).toBe(37);
    expect(parsed.shareable_manifest.name).toBe("Axis' Iliad");
    expect(parsed.shareable_manifest.version).toBe("0.5.0");
  });

  it("shareable_manifest.free_tools never drifts from the top-level free_tools list", async () => {
    // Regression: shareable_manifest.free_tools was a hand-typed literal that fell out of
    // sync with the derived top-level free_tools (missing prepare_agentic_purchasing_preview).
    // Both now compute from the same array — this pins that invariant going forward.
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 64,
      method: "tools/call",
      params: { name: "discover_commerce_tools", arguments: {} },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.shareable_manifest.free_tools).toEqual(parsed.free_tools);
    expect(parsed.shareable_manifest.free_tools).toContain("prepare_agentic_purchasing_preview");
  });

  it("H4.1: every genuinely per-call-metered tool's description states its price", async () => {
    // Uses discover_commerce_tools's own (now-accurate) per-tool pricing as the oracle for
    // "is this tool metered" — pricing !== "free" and !== "included in plan" (the honest
    // label for tools that never charge, like get_snapshot/get_artifact/
    // improve_my_agent_with_axis; closer/deploy used to fall in this bucket too before
    // H-Phase-A cycle 3 found they were entitlement-gated but never actually charged).
    // Any tool that IS metered must state a $ price in its catalog description, or an
    // agent reading mcp-tools.ts alone (without calling discover_commerce_tools first)
    // has no way to know it costs money before calling it.
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 65,
      method: "tools/call",
      params: { name: "discover_commerce_tools", arguments: {} },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    const meteredNames = (parsed.tools as Array<{ name: string; pricing: string }>)
      .filter(t => t.pricing !== "free" && t.pricing !== "included in plan")
      .map(t => t.name);
    expect(meteredNames.length).toBeGreaterThan(10);
    for (const name of meteredNames) {
      const tool = MCP_TOOLS.find(t => t.name === name);
      expect(tool, `metered tool "${name}" not found in MCP_TOOLS`).toBeDefined();
      expect(tool!.description, `metered tool "${name}"'s description should state a $ price`).toMatch(/\$\d/);
    }
  });

  it("tool name appears in MCP_TOOLS", async () => {
    const names = MCP_TOOLS.map(t => t.name);
    expect(names).toContain("discover_commerce_tools");
  });
});

// ─── POST /mcp — tools/call improve_my_agent_with_axis ──────────

describe("POST /mcp — tools/call improve_my_agent_with_axis", () => {
  it("requires authentication", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 70,
      method: "tools/call",
      params: {
        name: "improve_my_agent_with_axis",
        arguments: {
          project_name: "test-agent",
          files: [{ path: "index.ts", content: "export const x = 1;" }],
        },
      },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Authentication required");
  });

  it("tool name appears in MCP_TOOLS", async () => {
    const names = MCP_TOOLS.map(t => t.name);
    expect(names).toContain("improve_my_agent_with_axis");
  });
});

// ─── POST /mcp — tools/call discover_agentic_purchasing_needs ────

describe("POST /mcp — tools/call discover_agentic_purchasing_needs", () => {
  it("returns matched capabilities for purchasing intent (no auth required)", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 80,
      method: "tools/call",
      params: {
        name: "discover_agentic_purchasing_needs",
        arguments: {
          task_description: "I need to harden my checkout flow for autonomous purchasing agents with Visa compliance",
        },
      },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.matched_capabilities).toBeDefined();
    expect(Array.isArray(parsed.matched_capabilities)).toBe(true);
    expect(parsed.matched_capabilities.length).toBeGreaterThan(0);
    expect(parsed.recommended_next_step).toBeDefined();
  });

  it("returns results with focus_areas filtering", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 81,
      method: "tools/call",
      params: {
        name: "discover_agentic_purchasing_needs",
        arguments: {
          task_description: "compliance audit for payment processing",
          focus_areas: ["compliance", "checkout"],
        },
      },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.scoring_methodology).toBeDefined();
  });

  it("returns fewer capabilities for unrelated task", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 82,
      method: "tools/call",
      params: {
        name: "discover_agentic_purchasing_needs",
        arguments: {
          task_description: "xyz zzz qqq zxcvb",
        },
      },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    // Unrelated text should match fewer capabilities than a targeted query
    expect(parsed.matched_capabilities.length).toBeLessThanOrEqual(2);
  });

  it("tool name appears in MCP_TOOLS", async () => {
    const names = MCP_TOOLS.map(t => t.name);
    expect(names).toContain("discover_agentic_purchasing_needs");
  });
});

// ─── POST /mcp — tools/call get_referral_code ───────────────────

describe("POST /mcp — tools/call get_referral_code", () => {
  it("requires authentication", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 90,
      method: "tools/call",
      params: { name: "get_referral_code", arguments: {} },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Authentication required");
    const err = result._error as Record<string, unknown>;
    expect(err.code).toBe("auth");
  });

  it("returns referral_token and earnings when authenticated", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 91,
      method: "tools/call",
      params: { name: "get_referral_code", arguments: {} },
    }, apiKey);
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(typeof parsed.referral_token).toBe("string");
    expect(parsed.referral_token.length).toBeGreaterThan(0);
    expect(parsed.share_instruction).toContain("referral_token");
    expect(parsed.current_earnings).toBeDefined();
    expect(typeof parsed.current_earnings.earned_credits_millicents).toBe("number");
    expect(typeof parsed.current_earnings.lifetime_referrals).toBe("number");
    expect(typeof parsed.current_earnings.free_calls_remaining).toBe("number");
    expect(typeof parsed.current_earnings.paid_call_count).toBe("number");
    expect(parsed.cost).toContain("free");
  });

  it("returns stable referral_token across calls", async () => {
    const r1 = await post("/mcp", {
      jsonrpc: "2.0", id: 92, method: "tools/call",
      params: { name: "get_referral_code", arguments: {} },
    }, apiKey);
    const r2 = await post("/mcp", {
      jsonrpc: "2.0", id: 93, method: "tools/call",
      params: { name: "get_referral_code", arguments: {} },
    }, apiKey);
    const c1 = ((r1.data as Record<string, unknown>).result as Record<string, unknown>).content as Array<{ text: string }>;
    const c2 = ((r2.data as Record<string, unknown>).result as Record<string, unknown>).content as Array<{ text: string }>;
    const p1 = JSON.parse(c1[0].text);
    const p2 = JSON.parse(c2[0].text);
    expect(p1.referral_token).toBe(p2.referral_token);
  });

  it("tool name appears in MCP_TOOLS", async () => {
    const names = MCP_TOOLS.map(t => t.name);
    expect(names).toContain("get_referral_code");
  });
});

// ─── POST /mcp — tools/call ping_payment (x402 onboarding program, Phase 1) ──

describe("POST /mcp — tools/call ping_payment", () => {
  it("anonymous, no payment credential — receives a payment_required challenge, not an auth error", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 200,
      method: "tools/call",
      params: { name: "ping_payment", arguments: {} },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    // Not an isError tool result — the challenge is a normal (non-error) payload,
    // same as every other real x402 negotiation body on this server.
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed._payment_required).toBe(true);
    expect(parsed.tool).toBe("ping_payment");
    expect(parsed.amount_cents).toBe(0);
    expect(parsed.retry.method).toBe("tools/call");
    expect(parsed.retry.name).toBe("ping_payment");
    expect(Array.isArray(parsed.retry.headers_hint)).toBe(true);
    // Reuses the real x402 negotiation body — same fields every paid tool's 402 carries.
    expect(parsed.accepted_payment_schemes).toBeDefined();
    expect(parsed.x402).toBeDefined();
  });

  it("authenticated, no payment credential — still challenges (auth alone is not a payment credential)", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 201,
      method: "tools/call",
      params: { name: "ping_payment", arguments: {} },
    }, freeApiKey);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed._payment_required).toBe(true);
  });

  it("challenge response never varies by X-Axis-Key validity (H-Phase-A cycle 1: closes a key-existence oracle)", async () => {
    // ping_payment is the one tool a fully anonymous caller can reach with zero auth.
    // If its 402 challenge varied (e.g. via a referral_token field) based on whether an
    // attempted X-Axis-Key happened to resolve, that would let anyone probe a guessed
    // or suspected-leaked key's validity with no auth-failure signal and no distinct
    // error shape. The challenge body must be identical for no-key, invalid-key, and
    // valid-key requests — only the /mcp/tools/call retry path (which requires the real
    // payment credential) is allowed to differ, and only on a genuine settlement.
    const noKey = await post("/mcp", {
      jsonrpc: "2.0", id: 210, method: "tools/call",
      params: { name: "ping_payment", arguments: {} },
    });
    const invalidKey = await post("/mcp", {
      jsonrpc: "2.0", id: 211, method: "tools/call",
      params: { name: "ping_payment", arguments: {} },
    }, "axis_definitely-not-a-real-key-0000000000");
    const validKey = await post("/mcp", {
      jsonrpc: "2.0", id: 212, method: "tools/call",
      params: { name: "ping_payment", arguments: {} },
    }, freeApiKey);

    const bodyOf = (r: Res) => {
      const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
      const content = result.content as Array<{ type: string; text: string }>;
      return JSON.parse(content[0].text) as Record<string, unknown>;
    };
    const noKeyBody = bodyOf(noKey);
    const invalidKeyBody = bodyOf(invalidKey);
    const validKeyBody = bodyOf(validKey);

    expect(noKeyBody.referral_token).toBeNull();
    expect(invalidKeyBody.referral_token).toBeNull();
    expect(validKeyBody.referral_token).toBeNull();
    // Full-body equality (net of nothing — no per-request field should differ at all).
    expect(invalidKeyBody).toEqual(noKeyBody);
    expect(validKeyBody).toEqual(noKeyBody);
  });

  it("retry with a payment credential in Authorization (API key moved to X-Axis-Key) — succeeds at $0", async () => {
    const r = await postWithHeaders(
      "/mcp",
      { jsonrpc: "2.0", id: 202, method: "tools/call", params: { name: "ping_payment", arguments: {} } },
      { Authorization: "Payment fake-mpp-credential-for-the-probe", "X-Axis-Key": freeApiKey },
    );
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.tool).toBe("ping_payment");
    expect(parsed.settled_cents).toBe(0);
    expect(typeof parsed.next).toBe("string");
  });

  it("retry with a payment credential succeeds even fully anonymous (no X-Axis-Key at all)", async () => {
    const r = await postWithHeaders(
      "/mcp",
      { jsonrpc: "2.0", id: 203, method: "tools/call", params: { name: "ping_payment", arguments: {} } },
      { Authorization: "Payment fake-mpp-credential-for-the-probe" },
    );
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.ok).toBe(true);
  });

  it("never charges real money and never records a payment_receipts row", async () => {
    const before = await getSettledRevenue();
    await postWithHeaders(
      "/mcp",
      { jsonrpc: "2.0", id: 204, method: "tools/call", params: { name: "ping_payment", arguments: {} } },
      { Authorization: "Payment fake-mpp-credential-for-the-probe", "X-Axis-Key": freeApiKey },
    );
    const after = await getSettledRevenue();
    expect(after.all_time_count).toBe(before.all_time_count);
    expect(after.all_time_cents).toBe(before.all_time_cents);
  });

  it("tool name appears in MCP_TOOLS and is marked free/no-auth", async () => {
    const names = MCP_TOOLS.map(t => t.name);
    expect(names).toContain("ping_payment");
  });

  it("AXIS_PAYMENT_PROBE_ENABLED=false disables dispatch without hiding the catalog entry (x402 onboarding Phase 3)", async () => {
    process.env.AXIS_PAYMENT_PROBE_ENABLED = "false";
    try {
      const r = await post("/mcp", {
        jsonrpc: "2.0",
        id: 205,
        method: "tools/call",
        params: { name: "ping_payment", arguments: {} },
      });
      const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
      expect(result.isError).toBe(false);
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.ok).toBe(false);
      expect(parsed._disabled).toBe(true);
      expect(parsed.message).toContain("AXIS_PAYMENT_PROBE_ENABLED");
    } finally {
      delete process.env.AXIS_PAYMENT_PROBE_ENABLED;
    }
    // Catalog listing is unaffected by the flag.
    const names = MCP_TOOLS.map(t => t.name);
    expect(names).toContain("ping_payment");
  });
});

// ─── POST /mcp — tools/call get_referral_credits ────────────────

describe("POST /mcp — tools/call get_referral_credits", () => {
  it("requires authentication", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 100,
      method: "tools/call",
      params: { name: "get_referral_credits", arguments: {} },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Authentication required");
    const err = result._error as Record<string, unknown>;
    expect(err.code).toBe("auth");
  });

  it("returns full credit breakdown when authenticated", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 101,
      method: "tools/call",
      params: { name: "get_referral_credits", arguments: {} },
    }, apiKey);
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(typeof parsed.referral_token).toBe("string");
    expect(typeof parsed.earned_credits_millicents).toBe("number");
    expect(typeof parsed.earned_discount).toBe("string");
    expect(typeof parsed.lifetime_referrals).toBe("number");
    expect(typeof parsed.free_calls_remaining).toBe("number");
    expect(typeof parsed.paid_call_count).toBe("number");
    expect(typeof parsed.persistence_credits_remaining).toBe("number");
    expect(typeof parsed.tier).toBe("string");
    expect(typeof parsed.discount_active).toBe("boolean");
    expect(parsed.cost).toContain("free");
  });

  it("returns fifth_call_free milestone info", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 102,
      method: "tools/call",
      params: { name: "get_referral_credits", arguments: {} },
    }, apiKey);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.fifth_call_free).toBeDefined();
    expect(parsed.next_milestone).toBeDefined();
  });

  it("tool name appears in MCP_TOOLS", async () => {
    const names = MCP_TOOLS.map(t => t.name);
    expect(names).toContain("get_referral_credits");
  });
});

// ─── POST /mcp — tools/call improve_my_agent_with_axis success ──

describe("POST /mcp — tools/call improve_my_agent_with_axis (success path)", () => {
  let improveKey = "";

  it("setup — create fresh account for quota", async () => {
    const create = await post("/v1/accounts", { name: "Improve Test", email: `improve-${Date.now()}@test.com` });
    const key = (create.data as Record<string, unknown>).api_key as Record<string, string>;
    improveKey = key.raw_key;
    expect(improveKey).toBeTruthy();
  });

  it("returns improvement plan with analysis and recommendations", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 110,
      method: "tools/call",
      params: {
        name: "improve_my_agent_with_axis",
        arguments: {
          project_name: "test-agent-improvement",
          files: [
            { path: "src/index.ts", content: "import express from 'express';\nconst app = express();\napp.get('/', (req, res) => res.json({ ok: true }));\napp.listen(3000);" },
            { path: "package.json", content: JSON.stringify({ name: "test", dependencies: { express: "^4.0.0" } }) },
          ],
        },
      },
    }, improveKey);
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const content = result.content as Array<{ type: string; text: string }>;
    // improve_my_agent runs free-tier programs only — if entitlement/quota blocks, diagnose
    if (result.isError) {
      throw new Error(`improve_my_agent returned error: ${content[0].text}`);
    }
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(content[0].text);
    // Analysis section
    expect(parsed.analysis).toBeDefined();
    expect(parsed.analysis.files_analyzed).toBe(2);
    expect(Array.isArray(parsed.analysis.languages)).toBe(true);
    expect(parsed.analysis.free_artifacts_generated).toBeGreaterThan(0);
    expect(Array.isArray(parsed.analysis.artifacts)).toBe(true);
    // Improvement plan
    expect(parsed.improvement_plan).toBeDefined();
    expect(Array.isArray(parsed.improvement_plan.missing_context_files)).toBe(true);
    expect(parsed.improvement_plan.missing_context_files).toContain("AGENTS.md");
    expect(Array.isArray(parsed.improvement_plan.recommended_pro_programs)).toBe(true);
    expect(parsed.improvement_plan.recommended_pro_programs.length).toBeGreaterThan(0);
    // Call again section
    expect(parsed.call_again).toBeDefined();
    expect(parsed.call_again.full_analysis.tool).toBe("analyze_files");
    expect(parsed.call_again.purchasing.tool).toBe("prepare_agentic_purchasing");
  });

  // H-Phase-A cycle 7: maybeAppendLivingArchitecture/maybeRunQualityGate's
  // paid engineer-mode enrichment (real LLM inference: Living Architecture +
  // the AI Design Judge verdict) used to be gated on resolveAgentMode(req)
  // alone with no entitlement check inside either helper — this tool never
  // charges anything, so a brand-new free account sending
  // X-Agent-Mode: engineer got the paid engineer tier's premium verdict for
  // $0. Even with no local LLM configured in this test environment,
  // maybeAppendLivingArchitecture still always appends a labeled
  // living-architecture.md placeholder in real engineer mode ("degrades to
  // a labeled doc when no model is configured") — so its mere PRESENCE in
  // the response is the observable signal this test pins against.
  it("stays free-tier-only even when the caller sends X-Agent-Mode: engineer", async () => {
    // A fresh account — free tier allows only 1 project, and improveKey's
    // account already used its one project in the success-path test above.
    const create = await post("/v1/accounts", { name: "Engineer Bypass Test", email: `improve-eng-${Date.now()}@test.com` });
    const key = (create.data as Record<string, unknown>).api_key as Record<string, string>;
    const engineerBypassKey = key.raw_key;

    const r = await postWithHeaders(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 113,
        method: "tools/call",
        params: {
          name: "improve_my_agent_with_axis",
          arguments: {
            project_name: "engineer-mode-bypass-test",
            files: [
              { path: "src/index.ts", content: "console.log('hi');" },
              { path: "package.json", content: JSON.stringify({ name: "test" }) },
            ],
          },
        },
      },
      { Authorization: `Bearer ${engineerBypassKey}`, "X-Agent-Mode": "engineer" },
    );
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    const artifactPrograms = (parsed.analysis.artifacts as Array<{ program: string }>).map((a) => a.program);
    expect(artifactPrograms).not.toContain("living-architecture");
  });

  it("validates project_name is required", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 111,
      method: "tools/call",
      params: {
        name: "improve_my_agent_with_axis",
        arguments: { files: [{ path: "x.ts", content: "x" }] },
      },
    }, apiKey);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("project_name");
  });

  it("validates files is required", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 112,
      method: "tools/call",
      params: {
        name: "improve_my_agent_with_axis",
        arguments: { project_name: "test" },
      },
    }, apiKey);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("files");
  });
});

// ─── POST /mcp — tools/call prepare_agentic_purchasing (MCP) ─────

describe("POST /mcp — tools/call prepare_agentic_purchasing (MCP transport)", () => {
  it("returns isError=true without auth", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 120,
      method: "tools/call",
      params: {
        name: "prepare_agentic_purchasing",
        arguments: {
          project_name: "test-purchasing",
          project_type: "web_application",
          frameworks: ["express"],
          goals: ["secure checkout"],
          files: [{ path: "index.ts", content: "export const x = 1;" }],
        },
      },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Authentication required");
  });

  it("accepts the legacy purchasing alias", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 1201,
      method: "tools/call",
      params: {
        name: "prepare_for_agentic_purchasing",
        arguments: {
          project_name: "test-purchasing",
          project_type: "web_application",
          frameworks: ["express"],
          goals: ["secure checkout"],
          files: [{ path: "index.ts", content: "export const x = 1;" }],
        },
      },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Authentication required");
  });

  it("validates required fields through MCP transport", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 121,
      method: "tools/call",
      params: {
        name: "prepare_agentic_purchasing",
        arguments: {
          project_name: "",
          project_type: "web_application",
          frameworks: [],
          goals: [],
          files: [{ path: "i.ts", content: "x" }],
        },
      },
    }, apiKey);
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("project_name");
  });

  it("validates frameworks must be an array", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 122,
      method: "tools/call",
      params: {
        name: "prepare_agentic_purchasing",
        arguments: {
          project_name: "test",
          project_type: "web",
          frameworks: "not-array",
          goals: [],
          files: [{ path: "i.ts", content: "x" }],
        },
      },
    }, apiKey);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("frameworks");
  });

  // ─── Lite mode withholds the artifact bundle (H-Phase-A cycle 1) ──
  //
  // lite_description promises "purchasing readiness score + top 3 gaps only
  // (no full artifact bundle)". Before this fix, artifacts/purchasing_artifacts/
  // all_artifact_paths were returned unfiltered in every mode -- a fully-
  // entitled account paying the $0.25 lite price still got the full $0.50
  // deliverable. apiKey is suite tier (all 20 programs enabled), so it's the
  // only account shape that reaches generation at all (an under-entitled
  // account 402s before this point, in every mode).
  const purchasingFiles = [
    { path: "index.ts", content: "export const app = { checkout: () => {} };" },
    { path: "package.json", content: '{"name":"lite-test","dependencies":{"stripe":"^14.0.0"}}' },
  ];

  it("lite mode withholds the full artifact bundle, keeping only score + top-3 gaps", async () => {
    const r = await postWithHeaders(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 123,
        method: "tools/call",
        params: {
          name: "prepare_agentic_purchasing",
          arguments: {
            project_name: "lite-purchasing-test",
            project_type: "web_application",
            frameworks: ["express"],
            goals: ["secure checkout"],
            files: purchasingFiles,
          },
        },
      },
      { Authorization: `Bearer ${apiKey}`, "X-Agent-Mode": "lite" },
    );
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.summary.compliance_depth).toBe("summary");
    expect(typeof parsed.summary.purchasing_readiness_score).toBe("number");
    expect(Array.isArray(parsed.summary.gaps)).toBe(true);
    expect(parsed.summary.gaps.length).toBeLessThanOrEqual(3);
    // The bundle itself must be gone, not just documented as truncated.
    expect(parsed.artifacts).toBeUndefined();
    expect(parsed.purchasing_artifacts).toBeUndefined();
    expect(parsed.all_artifact_paths).toBeUndefined();
    expect(typeof parsed.artifacts_note).toBe("string");
    // artifact_count (a bare number, not content) is legitimate lite metadata.
    expect(typeof parsed.artifact_count).toBe("number");
    expect(parsed.artifact_count).toBeGreaterThan(0);
  });

  it("standard mode still returns the full artifact bundle (no regression)", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 124,
        method: "tools/call",
        params: {
          name: "prepare_agentic_purchasing",
          arguments: {
            project_name: "standard-purchasing-test",
            project_type: "web_application",
            frameworks: ["express"],
            goals: ["secure checkout"],
            files: purchasingFiles,
          },
        },
      },
      apiKey,
    );
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.summary.compliance_depth).toBe("full");
    expect(parsed.artifacts).toBeDefined();
    expect(Array.isArray(parsed.purchasing_artifacts)).toBe(true);
    expect(Array.isArray(parsed.all_artifact_paths)).toBe(true);
    expect(parsed.artifacts_note).toBeUndefined();
  });
});

// ─── _usage field in tools/call responses ────────────────────────

describe("tools/call responses include _usage field", () => {
  it("anonymous call includes _usage with tier=anonymous", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 130,
      method: "tools/call",
      params: { name: "list_programs", arguments: {} },
    });
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result._usage).toBeDefined();
    const usage = result._usage as Record<string, unknown>;
    expect(usage.tier).toBe("anonymous");
    expect(usage.credits_remaining).toBeNull();
    expect(usage.tool).toBe("list_programs");
  });

  it("authenticated call includes _usage with tier and credits", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 131,
      method: "tools/call",
      params: { name: "list_programs", arguments: {} },
    }, apiKey);
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result._usage).toBeDefined();
    const usage = result._usage as Record<string, unknown>;
    expect(typeof usage.tier).toBe("string");
    expect(usage.tier).not.toBe("anonymous");
    expect(typeof usage.credits_remaining).toBe("number");
    expect(usage.tool).toBe("list_programs");
  });

  it("_usage.tool matches the invoked tool name", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 132,
      method: "tools/call",
      params: { name: "search_and_discover_tools", arguments: { q: "mcp" } },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const usage = result._usage as Record<string, unknown>;
    expect(usage.tool).toBe("search_and_discover_tools");
  });
});

// ─── H2.4: the compensator runs lazily on every _usage build ─────

describe("_usage.compensation — the lazy compensator (H2.4)", () => {
  it("an owed compensation entry is claimed and credited on the account's very next call, and reported", async () => {
    const acct = await createAccount("Comp E2E", "comp-e2e@test.com", "free");
    const rawKey = (await createApiKey(acct.account_id, "comp-e2e-key")).rawKey;
    await recordCompensationOwed({
      account_id: acct.account_id,
      tool: "analyze_repo",
      amount_cents: 120,
      reason: "settled_then_error",
    });
    expect((await getCompensationSummary(acct.account_id)).owed_cents).toBe(120);

    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 133,
      method: "tools/call",
      params: { name: "list_programs", arguments: {} },
    }, rawKey);

    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const usage = result._usage as Record<string, unknown>;
    expect(usage.compensation).toEqual({ owed_cents: 0, credited_cents: 120 });

    // The ledger itself agrees — this call's lazy sweep is what claimed it.
    expect(await getCompensationSummary(acct.account_id)).toEqual({ owed_cents: 0, credited_cents: 120 });
  });

  it("an account with nothing owed reports a zeroed compensation block", async () => {
    const acct = await createAccount("Comp Quiet", "comp-quiet@test.com", "free");
    const rawKey = (await createApiKey(acct.account_id, "comp-quiet-key")).rawKey;

    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 134,
      method: "tools/call",
      params: { name: "list_programs", arguments: {} },
    }, rawKey);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const usage = result._usage as Record<string, unknown>;
    expect(usage.compensation).toEqual({ owed_cents: 0, credited_cents: 0 });
  });

  it("an anonymous call has no account to compensate — compensation is null, same as the other per-account fields", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 135,
      method: "tools/call",
      params: { name: "list_programs", arguments: {} },
    });
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const usage = result._usage as Record<string, unknown>;
    expect(usage.compensation).toBeNull();
  });
});

// ─── Batch JSON-RPC ──────────────────────────────────────────────

describe("POST /mcp — batch JSON-RPC (array of requests)", () => {
  it("rejects batch requests with parse error", async () => {
    const r = await post("/mcp", [
      { jsonrpc: "2.0", id: 140, method: "ping" },
      { jsonrpc: "2.0", id: 141, method: "tools/list" },
    ]);
    // Batch is not supported — should return error (invalid request or parse error)
    expect(r.status).toBe(400);
  });
});

// ─── Plan-credit metering on owned iliad_* tools ─────────────────
//
// Session 119 wired meterMcpToolCredits into every owned iliad_*
// tool so MCP calls deduct plan credits and throw a payment_required
// envelope when the monthly allowance is exhausted. These tests
// verify:
//   1. Successful tool calls increment the account's
//      included_credits_used counter (proves the meter ran).
//   2. iliad_web_search bills only `search`, not `index`.
//   3. _not_configured envelopes do NOT consume credits.
//   4. Suite tier passes through (allowance covers the call).
//   5. Once monthly allowance is artificially exhausted, the next
//      call returns the payment_required envelope.

describe("POST /mcp — owned-tool metering", () => {
  // Use a fresh isolated account per metering test so the credit
  // counters don't accumulate cross-test noise.
  async function newFreeAccount(seed: string): Promise<{ accountId: string; rawKey: string }> {
    const acc = await createAccount(`Metering-${seed}`, `metering-${seed}@test.com`, "free");
    const key = (await createApiKey(acc.account_id, `metering-${seed}-key`)).rawKey;
    return { accountId: acc.account_id, rawKey: key };
  }

  it("free-tier iliad_vector_database upsert increments included_credits_used", async () => {
    const { accountId, rawKey } = await newFreeAccount("vec-upsert");
    const before = (await getUsageCreditSummary(accountId, "free")).included_credits_used;
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 200,
      method: "tools/call",
      params: {
        name: "iliad_vector_database",
        arguments: {
          operation: "upsert",
          namespace: "metering-test",
          vectors: [{ id: "v1", vector: [0.1, 0.2, 0.3] }],
        },
      },
    }, rawKey);
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const after = (await getUsageCreditSummary(accountId, "free")).included_credits_used;
    // 1¢ tier → at least 1 credit consumed.
    expect(after).toBeGreaterThan(before);
  });

  it("suite-tier iliad_vector_database upsert passes through and reports tier=suite", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 201,
      method: "tools/call",
      params: {
        name: "iliad_vector_database",
        arguments: {
          operation: "upsert",
          namespace: "metering-suite",
          vectors: [{ id: "v1", vector: [0.1, 0.2, 0.3] }],
        },
      },
    }, apiKey);
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const usage = result._usage as Record<string, unknown>;
    expect(usage.tier).toBe("suite");
    expect(usage.tool).toBe("iliad_vector_database");
  });

  it("iliad_web_search operation=index is FREE (no credit decrement)", async () => {
    const { accountId, rawKey } = await newFreeAccount("ws-index");
    const before = (await getUsageCreditSummary(accountId, "free")).included_credits_used;
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 202,
      method: "tools/call",
      params: {
        name: "iliad_web_search",
        arguments: {
          operation: "index",
          namespace: "metering-test",
          document: { doc_id: "d1", content: "axis iliad metering test" },
        },
      },
    }, rawKey);
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const after = (await getUsageCreditSummary(accountId, "free")).included_credits_used;
    expect(after).toBe(before);
  });

  it("iliad_web_search operation=search IS metered (credit decrement)", async () => {
    const { accountId, rawKey } = await newFreeAccount("ws-search");
    // Index a doc first (free), then search (metered).
    await post("/mcp", {
      jsonrpc: "2.0",
      id: 203,
      method: "tools/call",
      params: {
        name: "iliad_web_search",
        arguments: {
          operation: "index",
          namespace: "metering-test",
          document: { doc_id: "d1", content: "axis iliad metering test" },
        },
      },
    }, rawKey);
    const before = (await getUsageCreditSummary(accountId, "free")).included_credits_used;
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 204,
      method: "tools/call",
      params: {
        name: "iliad_web_search",
        arguments: {
          operation: "search",
          namespace: "metering-test",
          query: "axis",
        },
      },
    }, rawKey);
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const after = (await getUsageCreditSummary(accountId, "free")).included_credits_used;
    expect(after).toBeGreaterThan(before);
  });

  it("iliad_hygiene mode=scan is FREE (no credit decrement) and returns a grade", async () => {
    const { accountId, rawKey } = await newFreeAccount("hyg-scan");
    const before = (await getUsageCreditSummary(accountId, "free")).included_credits_used;
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 220,
      method: "tools/call",
      params: {
        name: "iliad_hygiene",
        arguments: {
          files: [
            { path: "src/app.ts", content: "export const x = 1;\n" },
            { path: ".gitignore", content: "node_modules/\n" },
          ],
        },
      },
    }, rawKey);
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text) as Record<string, unknown>;
    expect(parsed.mode).toBe("scan");
    expect(["A", "B", "C", "D", "F"]).toContain(parsed.grade);
    expect(parsed.remediation_plan).toBeUndefined();
    const after = (await getUsageCreditSummary(accountId, "free")).included_credits_used;
    expect(after).toBe(before);
  });

  it("iliad_hygiene flags a committed secret (grade F) and mode=fix IS metered + returns a plan", async () => {
    const { accountId, rawKey } = await newFreeAccount("hyg-fix");
    const before = (await getUsageCreditSummary(accountId, "free")).included_credits_used;
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 221,
      method: "tools/call",
      params: {
        name: "iliad_hygiene",
        arguments: {
          mode: "fix",
          files: [{ path: ".env", content: "STRIPE_SECRET=sk_live_0123456789abcdefghij\n" }],
        },
      },
    }, rawKey);
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text) as Record<string, unknown>;
    expect(parsed.mode).toBe("fix");
    expect(parsed.grade).toBe("F"); // committed secret caps at F
    const plan = parsed.remediation_plan as Record<string, unknown>;
    expect(Array.isArray(plan.ordered_steps)).toBe(true);
    expect((plan.ordered_steps as unknown[]).length).toBeGreaterThan(0);
    const after = (await getUsageCreditSummary(accountId, "free")).included_credits_used;
    expect(after).toBeGreaterThan(before);
  });

  it("iliad_hygiene dispatches correctly (usage.tool === iliad_hygiene)", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 222,
      method: "tools/call",
      params: { name: "iliad_hygiene", arguments: { files: [{ path: "a.ts", content: "export const a = 1;" }] } },
    }, apiKey);
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const usage = result._usage as Record<string, unknown>;
    expect(usage.tool).toBe("iliad_hygiene");
  });

  it("iliad_speech_to_text returns _not_configured envelope WITHOUT charging", async () => {
    const { accountId, rawKey } = await newFreeAccount("stt-not-cfg");
    const before = (await getUsageCreditSummary(accountId, "free")).included_credits_used;
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 205,
      method: "tools/call",
      params: {
        name: "iliad_speech_to_text",
        arguments: { audio_url: "https://example.com/clip.mp3" },
      },
    }, rawKey);
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(false);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text) as Record<string, unknown>;
    expect(parsed._not_configured).toBe(true);
    const after = (await getUsageCreditSummary(accountId, "free")).included_credits_used;
    expect(after).toBe(before);
  });

  it("free-tier returns payment_required envelope after monthly allowance is exhausted", async () => {
    const { accountId, rawKey } = await newFreeAccount("vec-exhaust");
    // Exhaust the free monthly allowance in one direct write — 1600+ sequential
    // consumeUsageCredits round-trips would blow the test timeout on networked
    // Postgres. One real call first establishes the monthly row + plan/allowance.
    await consumeUsageCredits(accountId, "free", "iliad_vector_database", 1);
    await sql.run(
      "UPDATE usage_credit_monthly SET included_credits_used = monthly_allowance WHERE account_id = ?",
      [accountId],
    );
    const summary = await getUsageCreditSummary(accountId, "free");
    expect(summary.included_credits_remaining).toBeLessThan(6);

    // Next MCP call should now overage and return the payment_required envelope.
    const r = await post("/mcp", {
      jsonrpc: "2.0",
      id: 206,
      method: "tools/call",
      params: {
        name: "iliad_vector_database",
        arguments: {
          operation: "upsert",
          namespace: "metering-exhaust",
          vectors: [{ id: "v1", vector: [0.1, 0.2, 0.3] }],
        },
      },
    }, rawKey);
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text) as Record<string, unknown>;
    // buildMcpPaymentRequiredError shape: build402NegotiationBody + extras.
    expect(parsed.error).toBe("Payment Required");
    expect(parsed.message).toContain("exceeded included monthly credits");
    expect(parsed.price).toBe("0.01");
    expect(parsed.price_per_call).toBe("$0.01");
    expect(typeof parsed.referral_token).toBe("string");
    // usage_credits block is attached via the `extra` arg from meterMcpToolCredits.
    const usage = parsed.usage_credits as Record<string, unknown>;
    expect(typeof usage.plan_id).toBe("string");
    expect(typeof usage.monthly_allowance).toBe("number");
  });
});

// ─── Owned-tool dispatcher coverage ──────────────────────────────
//
// One test per owned iliad_* tool exercising the MCP dispatch path
// with a minimal valid argument shape. This catches dispatcher
// routing regressions (a missing case, wrong handler, swapped
// names) and verifies the _usage block carries the right tool name
// back for every owned tool.
//
// In the CI environment most operator-dependent prerequisites
// (Docker, GGUF model, whisper.cpp, Piper voices) are absent, so
// these calls return _not_configured envelopes. That's the right
// shape to assert against — we're testing the dispatcher, not the
// underlying runtime.

describe("POST /mcp — owned-tool dispatcher coverage", () => {
  function parseToolResult(r: Res): { isError: boolean; parsed: Record<string, unknown>; usage: Record<string, unknown> } {
    expect(r.status).toBe(200);
    const result = (r.data as Record<string, unknown>).result as Record<string, unknown>;
    const content = result.content as Array<{ type: string; text: string }>;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content[0].text) as Record<string, unknown>;
    } catch {
      // Some error texts are plain strings ("Error: ..."); coerce so tests can still assert shape.
      parsed = { _raw: content[0].text };
    }
    return {
      isError: result.isError === true,
      parsed,
      usage: (result._usage as Record<string, unknown>) ?? {},
    };
  }

  it("iliad_object_storage dispatches correctly (returns _not_configured in CI)", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 300, method: "tools/call",
      params: { name: "iliad_object_storage", arguments: { key: "test/k", operation: "put" } },
    }, apiKey);
    const { isError, parsed, usage } = parseToolResult(r);
    expect(isError).toBe(false);
    expect(parsed._not_configured).toBe(true);
    expect(usage.tool).toBe("iliad_object_storage");
  });

  it("iliad_vector_database dispatches correctly (suite tier passes through)", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 301, method: "tools/call",
      params: {
        name: "iliad_vector_database",
        arguments: { operation: "upsert", namespace: "dispatcher-cov", vectors: [{ id: "x", vector: [0.1] }] },
      },
    }, apiKey);
    const { isError, parsed, usage } = parseToolResult(r);
    expect(isError).toBe(false);
    expect(parsed.operation).toBe("upsert");
    expect(usage.tool).toBe("iliad_vector_database");
  });

  it("iliad_embeddings dispatches correctly (returns backend-aware _not_configured in CI)", async () => {
    // WO-11: pin the sovereign default backend at a definitely-absent GGUF so
    // the assertion can't pass/fail for the wrong reason on a dev machine.
    const origBackend = process.env.AXIS_EMBEDDING_BACKEND;
    const origModelPath = process.env.AXIS_EMBEDDING_MODEL_PATH;
    delete process.env.AXIS_EMBEDDING_BACKEND;
    process.env.AXIS_EMBEDDING_MODEL_PATH = "/definitely/not/a-real-embedding-model.gguf";
    try {
      const r = await post("/mcp", {
        jsonrpc: "2.0", id: 302, method: "tools/call",
        params: { name: "iliad_embeddings", arguments: { input: "axis test" } },
      }, apiKey);
      const { isError, parsed, usage } = parseToolResult(r);
      expect(isError).toBe(false);
      expect(parsed._not_configured).toBe(true);
      // Backend-aware envelope: the DEFAULT backend is the sovereign local one.
      expect(parsed.backend).toBe("local");
      expect(parsed.model_path).toBe("/definitely/not/a-real-embedding-model.gguf");
      // Remediation must NOT present OPENAI_API_KEY as the only option — the
      // primary path is provisioning the local GGUF.
      expect(String(parsed.remediation)).toMatch(/AXIS_EMBEDDING_MODEL_PATH/);
      expect(String(parsed.remediation)).toMatch(/GGUF/i);
      expect(usage.tool).toBe("iliad_embeddings");
    } finally {
      if (origBackend === undefined) delete process.env.AXIS_EMBEDDING_BACKEND;
      else process.env.AXIS_EMBEDDING_BACKEND = origBackend;
      if (origModelPath === undefined) delete process.env.AXIS_EMBEDDING_MODEL_PATH;
      else process.env.AXIS_EMBEDDING_MODEL_PATH = origModelPath;
    }
  });

  it("iliad_transactional_email dispatches correctly (returns _not_configured in CI)", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 303, method: "tools/call",
      params: {
        name: "iliad_transactional_email",
        arguments: { to: "test@example.com", subject: "test", body_text: "body" },
      },
    }, apiKey);
    const { isError, parsed, usage } = parseToolResult(r);
    expect(isError).toBe(false);
    expect(parsed._not_configured).toBe(true);
    expect(usage.tool).toBe("iliad_transactional_email");
  });

  it("iliad_analytics dispatches correctly (suite tier passes through)", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 304, method: "tools/call",
      params: {
        name: "iliad_analytics",
        arguments: { operation: "capture", namespace: "dispatcher-cov", event: { event: "test" } },
      },
    }, apiKey);
    const { isError, parsed, usage } = parseToolResult(r);
    expect(isError).toBe(false);
    expect(parsed.operation).toBe("capture");
    expect(usage.tool).toBe("iliad_analytics");
  });

  it("iliad_llm_inference dispatches correctly (returns _not_configured in CI)", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 305, method: "tools/call",
      params: { name: "iliad_llm_inference", arguments: { prompt: "hi" } },
    }, apiKey);
    const { isError, parsed, usage } = parseToolResult(r);
    expect(isError).toBe(false);
    expect(parsed._not_configured).toBe(true);
    expect(usage.tool).toBe("iliad_llm_inference");
  });

  it("iliad_code_sandbox dispatches correctly (returns the _not_configured envelope)", async () => {
    // Force the unconfigured path so this is deterministic + fast regardless of whether the
    // host has Docker. The old test ran the sandbox for real when Docker was present (image
    // pull + container start), which intermittently exceeded 60s and red-flagged CI.
    process.env.AXIS_CODE_SANDBOX_DISABLED = "1";
    try {
      const r = await post("/mcp", {
        jsonrpc: "2.0", id: 306, method: "tools/call",
        params: { name: "iliad_code_sandbox", arguments: { language: "python", code: "print(1)" } },
      }, apiKey);
      const { isError, parsed, usage } = parseToolResult(r);
      expect(isError).toBe(false);
      expect(usage.tool).toBe("iliad_code_sandbox");
      expect(parsed._not_configured).toBe(true);
    } finally {
      delete process.env.AXIS_CODE_SANDBOX_DISABLED;
    }
  });

  it("iliad_speech_to_text dispatches correctly (returns _not_configured in CI)", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 307, method: "tools/call",
      params: { name: "iliad_speech_to_text", arguments: { audio_url: "https://x.com/a.mp3" } },
    }, apiKey);
    const { isError, parsed, usage } = parseToolResult(r);
    expect(isError).toBe(false);
    expect(parsed._not_configured).toBe(true);
    expect(usage.tool).toBe("iliad_speech_to_text");
  });

  it("iliad_text_to_speech dispatches correctly (returns _not_configured in CI)", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 308, method: "tools/call",
      params: { name: "iliad_text_to_speech", arguments: { text: "hello" } },
    }, apiKey);
    const { isError, parsed, usage } = parseToolResult(r);
    expect(isError).toBe(false);
    expect(parsed._not_configured).toBe(true);
    expect(usage.tool).toBe("iliad_text_to_speech");
  });

  it("iliad_web_search dispatches correctly (suite tier passes through)", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 309, method: "tools/call",
      params: {
        name: "iliad_web_search",
        arguments: { operation: "count", namespace: "dispatcher-cov" },
      },
    }, apiKey);
    const { isError, parsed, usage } = parseToolResult(r);
    expect(isError).toBe(false);
    expect(parsed.operation).toBe("count");
    expect(typeof parsed.total).toBe("number");
    expect(usage.tool).toBe("iliad_web_search");
  });

  it("iliad_document_parsing dispatches correctly (plain text passthrough)", async () => {
    const r = await post("/mcp", {
      jsonrpc: "2.0", id: 310, method: "tools/call",
      params: {
        name: "iliad_document_parsing",
        arguments: { document_base64: Buffer.from("hello world", "utf8").toString("base64") },
      },
    }, apiKey);
    const { isError, parsed, usage } = parseToolResult(r);
    expect(isError).toBe(false);
    expect(parsed.format_detected).toBe("text");
    expect(parsed.markdown).toBe("hello world");
    expect(usage.tool).toBe("iliad_document_parsing");
  });
});

// ─── Agent-loop composition test ─────────────────────────────────
//
// End-to-end agent flow exercising the owned-tier as a composable
// unit: capture an event, look up its count, index a doc, search
// for it, store the search hit as a vector. Validates that
// account-scoped state is consistent across tools (each call
// scopes via the same account_id) and that the agent can chain
// owned tools without leaving AXIS.

describe("POST /mcp — owned-tier agent loop composition", () => {
  function callTool(tool: string, args: Record<string, unknown>, id: number, key: string): Promise<Res> {
    return post("/mcp", {
      jsonrpc: "2.0", id, method: "tools/call",
      params: { name: tool, arguments: args },
    }, key);
  }

  it("agent runs analytics + web_search + vector_database end-to-end against its own corpus", async () => {
    // Use the suite-tier key so credits are never the bottleneck.
    const ns = "agent-loop-" + Date.now();

    // 1. Capture an event.
    const captureR = await callTool("iliad_analytics", {
      operation: "capture",
      namespace: ns,
      event: { event: "page_view", user_id: "u_test", properties: { url: "https://docs/intro" } },
    }, 400, apiKey);
    expect(captureR.status).toBe(200);
    const captureResult = (captureR.data as Record<string, unknown>).result as Record<string, unknown>;
    expect(captureResult.isError).toBe(false);

    // 2. Query the event count back. Should be at least 1.
    const queryR = await callTool("iliad_analytics", {
      operation: "query",
      namespace: ns,
      query: { kind: "count" },
    }, 401, apiKey);
    expect(queryR.status).toBe(200);
    const queryParsed = JSON.parse(
      ((queryR.data as Record<string, unknown>).result as { content: Array<{ text: string }> }).content[0].text,
    ) as Record<string, unknown>;
    const queryInner = queryParsed.result as { total?: number };
    expect(queryInner.total).toBeGreaterThanOrEqual(1);

    // 3. Index a document.
    const indexR = await callTool("iliad_web_search", {
      operation: "index",
      namespace: ns,
      document: { doc_id: "d1", url: "https://docs/intro", content: "AXIS Iliad is a deterministic codebase analyzer." },
    }, 402, apiKey);
    expect(indexR.status).toBe(200);
    expect((indexR.data as Record<string, unknown>).result).toMatchObject({ isError: false });

    // 4. Search for it (BM25 should match).
    const searchR = await callTool("iliad_web_search", {
      operation: "search",
      namespace: ns,
      query: "deterministic codebase",
    }, 403, apiKey);
    const searchParsed = JSON.parse(
      ((searchR.data as Record<string, unknown>).result as { content: Array<{ text: string }> }).content[0].text,
    ) as Record<string, unknown>;
    const hits = searchParsed.hits as Array<{ doc_id: string; score: number }>;
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].doc_id).toBe("d1");
    expect(hits[0].score).toBeGreaterThan(0);

    // 5. Store an embedding-shaped vector keyed off the search hit.
    const upsertR = await callTool("iliad_vector_database", {
      operation: "upsert",
      namespace: ns,
      vectors: [{ id: hits[0].doc_id, vector: [0.5, 0.5, 0.5], metadata: { source: hits[0].doc_id } }],
    }, 404, apiKey);
    expect(upsertR.status).toBe(200);
    expect((upsertR.data as Record<string, unknown>).result).toMatchObject({ isError: false });

    // 6. Query the vector store with the same vector — should match itself.
    const vqueryR = await callTool("iliad_vector_database", {
      operation: "query",
      namespace: ns,
      query: { vector: [0.5, 0.5, 0.5], top_k: 3 },
    }, 405, apiKey);
    const vqueryParsed = JSON.parse(
      ((vqueryR.data as Record<string, unknown>).result as { content: Array<{ text: string }> }).content[0].text,
    ) as Record<string, unknown>;
    const matches = vqueryParsed.matches as Array<{ id: string; score: number }>;
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].id).toBe("d1");
    // Cosine self-similarity ≈ 1.
    expect(matches[0].score).toBeGreaterThan(0.99);
  });
});
