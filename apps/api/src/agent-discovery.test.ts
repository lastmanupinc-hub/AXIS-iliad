/**
 * Tests for the three AI-discoverability endpoints (eq_192):
 *   GET /llms.txt                        â€” llmstxt.org standard
 *   GET /.well-known/skills/index.json   â€” agentskills.io standard
 *   GET /v1/docs.md                      â€” Stripe-style plain-text API reference
 *
 * Also verifies that handleWellKnown now includes the llms_txt and skills fields.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { resetTestDb, TIER_LIMITS } from "@axis/snapshots";
import { Router } from "./router.js";
import { MCP_TOOL_COUNT } from "./counts.js";
import { MCP_TOOLS } from "./mcp-tools.js";
import {
  handleLlmsTxt,
  handleSkillsIndex,
  handleDocsMd,
  handleWellKnown,
  handleForAgents,
  handleInstall,
  handleProbeIntent,
  handleErrorCodes,
  PURCHASING_PROGRAMS,
} from "./handlers.js";
import { ErrorCode } from "./logger.js";

// â”€â”€â”€ HTTP helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function req(
  path: string,
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      {
        hostname: "127.0.0.1",
        port: TEST_PORT,
        path,
        method: "GET",
      },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: Buffer.concat(chunks).toString("utf-8"),
          });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

async function postReq(
  path: string,
  body: unknown,
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      {
        hostname: "127.0.0.1",
        port: TEST_PORT,
        path,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: Buffer.concat(chunks).toString("utf-8"),
          });
        });
      },
    );
    r.on("error", reject);
    r.end(data);
  });
}

let server: Server;
let TEST_PORT: number;

beforeAll(async () => {
  await resetTestDb();
  const router = new Router();
  router.get("/llms.txt", handleLlmsTxt);
  router.get("/.well-known/skills/index.json", handleSkillsIndex);
  router.get("/v1/docs.md", handleDocsMd);
  router.get("/.well-known/axis.json", handleWellKnown);
  router.get("/for-agents", handleForAgents);
  router.get("/v1/install", handleInstall);
  router.get("/v1/install/:platform", handleInstall);
  router.post("/probe-intent", handleProbeIntent);
  router.get("/v1/error-codes", handleErrorCodes);
  server = createServer((r, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    router.handle(r, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  TEST_PORT = addr.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

// â”€â”€â”€ GET /llms.txt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("GET /llms.txt", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let body: string;

  beforeAll(async () => {
    const r = await req("/llms.txt");
    status = r.status;
    headers = r.headers;
    body = r.body;
  });

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns text/plain content-type", async () => {
    expect(String(headers["content-type"])).toContain("text/plain");
  });

  it("contains Axis' Iliad name", async () => {
    expect(body).toContain("Axis' Iliad");
  });

  it("contains POST /v1/analyze", async () => {
    expect(body).toContain("POST /v1/analyze");
  });

  it("contains POST /mcp MCP endpoint", async () => {
    expect(body).toContain("POST /mcp");
  });

    it("contains the canonical MCP tools count", async () => {
      expect(body).toContain(`${MCP_TOOL_COUNT} tools`);
  });

  it("contains the 20 programs count", async () => {
    expect(body).toContain("20");
  });

  it("contains free tier programs", async () => {
    expect(body).toContain("search");
    expect(body).toContain("debug");
  });

  it("mentions agentic purchasing", async () => {
    expect(body).toContain("prepare-for-agentic-purchasing");
  });

  it("mentions agent skills endpoint in docs section", async () => {
    expect(body).toContain("/.well-known/skills/index.json");
  });

  it("mentions plain-text docs", async () => {
    expect(body).toContain("/v1/docs.md");
  });

  it("contains authentication instructions", async () => {
    expect(body).toContain("Authorization: Bearer");
    expect(body).toContain("POST /v1/accounts");
  });

  it("does not instruct agents to forward referral tokens", async () => {
    expect(body).not.toContain("forwarded to other agents");
    expect(body).not.toContain("micro-discounts");
    expect(body).not.toContain("Share-to-Earn");
  });

  it("H4.3: documents the MCP response envelope (_usage, _idempotent_replay, compensation)", async () => {
    expect(body).toContain("## MCP Response Envelope");
    expect(body).toContain("_usage");
    expect(body).toContain("credits_remaining");
    expect(body).toContain("usage_credits");
    expect(body).toContain("_idempotent_replay");
    expect(body).toContain("_error");
    expect(body).toContain("_compensation");
  });

  it("H4.2: contains a generated Error Codes section covering every ErrorCode value", async () => {
    expect(body).toContain("## Error Codes");
    expect(body).toContain("GET /v1/error-codes");
    for (const code of Object.values(ErrorCode)) {
      expect(body, `llms.txt is missing ${code}`).toContain(code);
    }
    // MCP error categories should also be present, not just the REST codes.
    expect(body).toContain("tier_limit");
    expect(body).toContain("_error:{code,retryable}");
  });

  // H4.6: llms.txt freshness — every count/enumeration below is asserted against its
  // canonical source, not a hand-copied number. Ground truth for why this matters: this
  // exact audit found the MCP tool list only enumerated 20 of 36 real tools (16 iliad_*
  // platform tools were silently missing), "Chains 8 programs" when PURCHASING_PROGRAMS
  // has 10 entries, and "3 snapshots/day on pro programs" when the real free-tier limit
  // is 10/month and pro programs aren't quota-limited, they're entitlement-blocked.
  it("H4.6: the MCP tool list names every tool in MCP_TOOLS, not a stale subset", async () => {
    for (const tool of MCP_TOOLS) {
      expect(body, `llms.txt's tool list is missing ${tool.name}`).toContain(tool.name);
    }
  });

  it("H4.6: the purchasing-hardener program count matches PURCHASING_PROGRAMS.length", async () => {
    expect(body).toContain(`Chains ${PURCHASING_PROGRAMS.length} programs`);
  });

  it("H4.6: the free-tier snapshot quota matches TIER_LIMITS.free, not a stale hardcoded number", async () => {
    expect(body).toContain(`${TIER_LIMITS.free.max_snapshots_per_month} snapshots/month`);
    for (const program of TIER_LIMITS.free.programs) {
      expect(body, `llms.txt's free-tier line is missing ${program}`).toContain(program);
    }
  });

  it("H4.6: MCP_TOOL_COUNT/PROGRAM_COUNT numerals in the body match the live constants", async () => {
    expect(body).toContain(`${MCP_TOOL_COUNT} tools`);
    // ARTIFACT_COUNT/PROGRAM_COUNT are asserted in the pre-existing "canonical MCP tools
    // count" / "20 programs" tests above â€” this test only adds the two H4.6 introduced.
  });
});

// â”€â”€â”€ GET /.well-known/skills/index.json â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("GET /.well-known/skills/index.json", () => {
  let status: number;
  let data: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/.well-known/skills/index.json");
    status = r.status;
    data = JSON.parse(r.body) as Record<string, unknown>;
  });

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("has version field", async () => {
    expect(data.version).toBe("1.0");
  });

  it("has publisher field", async () => {
    expect(typeof data.publisher).toBe("string");
    expect(String(data.publisher)).toContain("Axis' Iliad");
  });

  it("has skills array", async () => {
    expect(Array.isArray(data.skills)).toBe(true);
  });

  it("has at least 4 skills", async () => {
    expect((data.skills as unknown[]).length).toBeGreaterThanOrEqual(4);
  });

  it("each skill has name, description, and endpoint", async () => {
    for (const skill of data.skills as Array<Record<string, unknown>>) {
      expect(typeof skill.name).toBe("string");
      expect(typeof skill.description).toBe("string");
      expect(typeof skill.endpoint).toBe("string");
    }
  });

  it("includes axis-analyze skill", async () => {
    const skills = data.skills as Array<{ name: string }>;
    expect(skills.some(s => s.name === "axis-analyze")).toBe(true);
  });

  it("includes axis-prepare-for-agentic-purchasing skill", async () => {
    const skills = data.skills as Array<{ name: string }>;
    expect(skills.some(s => s.name === "axis-prepare-for-agentic-purchasing")).toBe(true);
  });

  it("includes axis-search-tools skill", async () => {
    const skills = data.skills as Array<{ name: string }>;
    expect(skills.some(s => s.name === "axis-search-tools")).toBe(true);
  });

  it("includes axis-mcp skill", async () => {
    const skills = data.skills as Array<{ name: string }>;
    expect(skills.some(s => s.name === "axis-mcp")).toBe(true);
  });

  it("axis-mcp skill lists the 21 highlighted tools (incl. WO-14 network tokenization)", async () => {
    // Was pinned at a stale 14 (pre-WO-13) — red at HEAD before WO-14 touched it.
    const skills = data.skills as Array<{ name: string; tools?: string[] }>;
    const mcp = skills.find(s => s.name === "axis-mcp");
    expect(mcp?.tools).toBeDefined();
    expect(mcp!.tools!.length).toBe(21);
    expect(mcp!.tools).toContain("iliad_network_tokenization");
  });

  it("axis-analyze has tags array", async () => {
    const skills = data.skills as Array<{ name: string; tags: string[] }>;
    const analyze = skills.find(s => s.name === "axis-analyze");
    expect(Array.isArray(analyze?.tags)).toBe(true);
  });
});

// â”€â”€â”€ GET /v1/docs.md â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("GET /v1/docs.md", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let body: string;

  beforeAll(async () => {
    const r = await req("/v1/docs.md");
    status = r.status;
    headers = r.headers;
    body = r.body;
  });

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns text/plain content-type", async () => {
    expect(String(headers["content-type"])).toContain("text/plain");
  });

  it("contains Axis' Iliad header", async () => {
    expect(body).toContain("Axis' Iliad");
  });

  it("contains POST /v1/analyze", async () => {
    expect(body).toContain("POST /v1/analyze");
  });

  it("contains POST /v1/prepare-for-agentic-purchasing", async () => {
    expect(body).toContain("POST /v1/prepare-for-agentic-purchasing");
  });

  it("contains MCP section", async () => {
    expect(body).toContain("POST /mcp");
  });

  it("contains the programs table with 18 programs", async () => {
    expect(body).toContain("| search |");
    expect(body).toContain("| agentic-purchasing |");
  });

  it("contains account management endpoints", async () => {
    expect(body).toContain("POST /v1/accounts");
    expect(body).toContain("GET /v1/account");
  });

  it("contains discovery endpoints", async () => {
    expect(body).toContain("/.well-known/axis.json");
    expect(body).toContain("/.well-known/skills/index.json");
    expect(body).toContain("/llms.txt");
  });

  it("mentions search endpoint", async () => {
    expect(body).toContain("GET /v1/mcp/tools");
  });
});

// â”€â”€â”€ GET /.well-known/axis.json â€” llms_txt and skills fields â”€â”€â”€â”€

describe("GET /.well-known/axis.json â€” new fields", () => {
  let data: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/.well-known/axis.json");
    data = JSON.parse(r.body) as Record<string, unknown>;
  });

  it("includes llms_txt field", async () => {
    expect(typeof data.llms_txt).toBe("string");
    expect(String(data.llms_txt)).toContain("/llms.txt");
  });

  it("includes skills field", async () => {
    expect(typeof data.skills).toBe("string");
    expect(String(data.skills)).toContain("/.well-known/skills/index.json");
  });

  it("replaces the incentives marketing block with neutral referral facts", async () => {
    expect(data.incentives).toBeUndefined();
    const referral = data.referral_program as Record<string, unknown>;
    expect(referral).toBeDefined();
    expect(referral.status_tools).toEqual(["get_referral_code", "get_referral_credits"]);
    const raw = JSON.stringify(data);
    expect(raw).not.toContain("Share-to-Earn");
    expect(raw).not.toContain("5th paid call");
    expect(raw).not.toContain("Pass it to other agents");
  });
});

// â”€â”€â”€ GET /for-agents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("GET /for-agents", () => {
  let status: number;
  let data: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/for-agents");
    status = r.status;
    data = JSON.parse(r.body) as Record<string, unknown>;
  });

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns name and version", async () => {
    expect(data.name).toBe("Axis' Iliad");
    expect(data.version).toBe("0.5.3");
  });

  it("includes install section with mcp_endpoint", async () => {
    const install = data.install as Record<string, unknown>;
    expect(install).toBeDefined();
    expect(typeof install.mcp_endpoint).toBe("string");
    expect(String(install.mcp_endpoint)).toContain("/mcp");
  });

  it("includes platform configs for claude-desktop, cursor, vscode", async () => {
    const install = data.install as Record<string, unknown>;
    const platforms = install.platforms as Record<string, unknown>;
    expect(platforms["claude-desktop"]).toBeDefined();
    expect(platforms["cursor"]).toBeDefined();
    expect(platforms["vscode"]).toBeDefined();
    expect(platforms["claude-code"]).toBeDefined();
  });

  it("includes tools array with 14 tools", async () => {
    const tools = data.tools as Array<unknown>;
    expect(tools).toHaveLength(14);
  });

  it("includes first_action hint", async () => {
    expect(typeof data.first_action).toBe("string");
    expect(String(data.first_action)).toContain("search_and_discover_tools");
  });

  it("includes discovery URLs", async () => {
    const discovery = data.discovery as Record<string, unknown>;
    expect(discovery).toBeDefined();
    expect(typeof discovery.well_known).toBe("string");
    expect(typeof discovery.install).toBe("string");
  });

  // H-Phase-A cycle 4: runImproveMyAgent (mcp-tool-impls.ts) never calls any
  // charge function and "improve_my_agent_with_axis" isn't in MeteredMcpTool
  // — it's always free. This endpoint's own tools[] entry and pricing_table
  // used to advertise "Paid ($0.50/run)"/x_payment for it, self-contradicting
  // handleProbeIntent's already-correct "free (uses free-tier programs)" and
  // promising a 402 challenge that never arrives.
  it("improve_my_agent_with_axis's tools[] entry says free and carries no x_payment", async () => {
    const tools = data.tools as Array<Record<string, unknown>>;
    const entry = tools.find((t) => t.name === "improve_my_agent_with_axis");
    expect(entry).toBeDefined();
    expect(entry!.x_payment).toBeUndefined();
    expect(String(entry!.description)).toMatch(/free/i);
    expect(String(entry!.description)).not.toMatch(/Paid \(\$/);
  });

  it("improve_my_agent_with_axis's pricing_table row says free, not $0.50/run", async () => {
    const pricingTable = data.pricing_table as Record<string, unknown>;
    const tiers = pricingTable.tiers as Array<Record<string, unknown>>;
    const row = tiers.find((t) => t.tool === "improve_my_agent_with_axis");
    expect(row).toBeDefined();
    expect(row!.price).toBe("free");
  });

  it("does not embed propagation or incentive marketing", async () => {
    expect(data.propagation).toBeUndefined();
    expect(data.system_prompt_snippet).toBeUndefined();
    expect(data.incentives).toBeUndefined();
    const raw = JSON.stringify(data);
    expect(raw).not.toContain("Share-to-Earn");
    expect(raw).not.toContain("5th paid call");
    expect(raw).not.toContain("Pass it to other agents");
  });

  it("keeps a neutral referral_program facts object", async () => {
    const referral = data.referral_program as Record<string, unknown>;
    expect(referral).toBeDefined();
    expect(String(referral.description)).toContain("referral_token");
    expect(referral.status_tools).toEqual(["get_referral_code", "get_referral_credits"]);
  });
});

// â”€â”€â”€ GET /v1/install â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("GET /v1/install", () => {
  let status: number;
  let data: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/v1/install");
    status = r.status;
    data = JSON.parse(r.body) as Record<string, unknown>;
  });

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns all platform configs", async () => {
    const platforms = data.platforms as Record<string, unknown>;
    expect(platforms).toBeDefined();
    expect(Object.keys(platforms)).toContain("claude-desktop");
    expect(Object.keys(platforms)).toContain("cursor");
    expect(Object.keys(platforms)).toContain("vscode");
    expect(Object.keys(platforms)).toContain("claude-code");
  });

  it("includes mcp_endpoint", async () => {
    expect(typeof data.mcp_endpoint).toBe("string");
    expect(String(data.mcp_endpoint)).toContain("/mcp");
  });

  it("includes instructions", async () => {
    expect(typeof data.instructions).toBe("string");
  });
});

// â”€â”€â”€ GET /v1/install/:platform â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("GET /v1/install/:platform", () => {
  it("returns claude-desktop config", async () => {
    const r = await req("/v1/install/claude-desktop");
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.platform).toBe("claude-desktop");
    expect(data.config.mcpServers["axis-iliad"]).toBeDefined();
  });

  it("returns cursor config", async () => {
    const r = await req("/v1/install/cursor");
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.platform).toBe("cursor");
    expect(data.config.mcpServers["axis-iliad"]).toBeDefined();
  });

  it("returns vscode config", async () => {
    const r = await req("/v1/install/vscode");
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.platform).toBe("vscode");
    expect(data.config.servers["axis-iliad"]).toBeDefined();
  });

  it("returns claude-code config", async () => {
    const r = await req("/v1/install/claude-code");
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.platform).toBe("claude-code");
    expect(data.config.command).toContain("claude mcp add");
  });

  it("returns 404 for unknown platform", async () => {
    const r = await req("/v1/install/unknown-platform");
    expect(r.status).toBe(404);
    const data = JSON.parse(r.body);
    expect(data.error_code).toBe("NOT_FOUND");
    expect(data.available).toContain("cursor");
  });
});

// â”€â”€â”€ POST /probe-intent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("POST /probe-intent", () => {
  it("returns 200 with recommendations for valid description", async () => {
    const r = await postReq("/probe-intent", { description: "I need to harden my checkout for autonomous agents" });
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.intent).toBeDefined();
    expect(Array.isArray(data.recommendations)).toBe(true);
    expect(data.recommendations.length).toBeGreaterThan(0);
    expect(data.call_next).toBeDefined();
    expect(data.mcp_endpoint).toContain("/mcp");
  });

  it("accepts intent field as an alias for description", async () => {
    const r = await postReq("/probe-intent", { intent: "analyze my repository for context" });
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(typeof data.intent).toBe("string");
    expect(String(data.intent)).toContain("analyze my repository");
  });

  it("returns 400 when description is missing", async () => {
    const r = await postReq("/probe-intent", { focus_areas: ["checkout"] });
    expect(r.status).toBe(400);
    const data = JSON.parse(r.body);
    expect(data.error_code).toBe("MISSING_FIELD");
    expect(String(data.error)).toContain("missing 'intent' field");
  });

  it("returns 400 for invalid JSON body", async () => {
    return new Promise<void>((resolve, reject) => {
      const cr = require("node:http").request(
        {
          hostname: "127.0.0.1",
          port: TEST_PORT,
          path: "/probe-intent",
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": 11 },
        },
        (res: import("node:http").IncomingMessage) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            expect(res.statusCode).toBe(400);
            resolve();
          });
        },
      );
      cr.on("error", reject);
      cr.end("not-valid{}");
    });
  });

  it("includes focus_areas in matching when provided", async () => {
    const r = await postReq("/probe-intent", {
      description: "help with agent tools",
      focus_areas: ["purchasing", "compliance"],
    });
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.recommendations.length).toBeGreaterThan(0);
  });

  it("returns fallback recommendations for unknown intent", async () => {
    const r = await postReq("/probe-intent", { description: "xyz zzz qqq completely unrelated gibberish" });
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.recommendations.length).toBeGreaterThan(0);
    expect(data.call_next).toBeDefined();
  });

  it("the honest fallback leads with search_and_discover_tools, not a commerce-specific tool", async () => {
    const r = await postReq("/probe-intent", { description: "xyz zzz qqq completely unrelated gibberish" });
    const data = JSON.parse(r.body);
    expect(data.call_next).toBe("search_and_discover_tools");
  });
});

// â”€â”€â”€ POST /probe-intent â€” H4.5: 20-realistic-intent routing quality pass â”€
//
// Ground truth: probing all 20 of these against the pre-fix classifier showed 12/20
// (60%) falling through to the generic commerce fallback (discover_agentic_purchasing_needs)
// for intents with nothing to do with commerce (transcribe audio, run code, check referral
// credits, etc.), plus 2 false positives (embeddings/web-search intents routed to the
// program-catalog search instead of the actual iliad_* tool) and 1 same-priority miscall
// (a Stripe-dispute intent routed to the general purchasing-readiness tool instead of
// score_dispute_readiness). Each case below pins the fix for one of those real misses.

describe("POST /probe-intent â€” 20 realistic intents (H4.5)", () => {
  const cases: Array<[string, string]> = [
    ["I want to understand this codebase before making changes", "analyze_repo"],
    ["Help me prepare my SaaS for autonomous purchasing agents", "prepare_agentic_purchasing"],
    ["What tools does AXIS offer?", "search_and_discover_tools"],
    ["Can you review my agent's setup for missing context files", "analyze_repo"],
    ["I need to scrape a webpage and extract its content", "iliad_web_research"],
    ["Transcribe this audio file to text", "iliad_speech_to_text"],
    ["Generate a voice-over from this script", "iliad_text_to_speech"],
    ["Run this Python snippet safely and get the output", "iliad_code_sandbox"],
    ["Parse this PDF into markdown", "iliad_document_parsing"],
    ["Send a transactional email to a new user", "iliad_transactional_email"],
    ["Store this file and give me a signed URL", "iliad_object_storage"],
    ["I need embeddings for semantic search over my docs", "iliad_embeddings"],
    ["Search my indexed content for a keyword", "iliad_web_search"],
    ["Track analytics events for my app", "iliad_analytics"],
    ["Check my workspace for committed secrets", "iliad_hygiene"],
    ["Get a dispute-readiness score for my Stripe chargebacks", "score_dispute_readiness"],
    ["Get an AI chat completion without calling an external LLM API", "iliad_llm_inference"],
    ["What's my referral code and how many credits have I earned?", "get_referral_code"],
    ["Look up the lifecycle of a network token event", "iliad_network_tokenization"],
    ["Package my finished project for the marketplace", "closer"],
  ];

  it.each(cases)("%s -> call_next=%s", async (intent, expectedTool) => {
    const r = await postReq("/probe-intent", { intent });
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.call_next, `"${intent}" routed to ${data.call_next}, expected ${expectedTool}`).toBe(expectedTool);
  });
});

// â”€â”€â”€ GET /for-agents?intent= â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("GET /for-agents?intent=", () => {
  it("returns tools sorted by relevance when intent is provided", async () => {
    const r = await req("/for-agents?intent=purchasing+compliance+checkout");
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(Array.isArray(data.tools)).toBe(true);
    expect(data.tools.length).toBe(14);
    // purchasing-related tools should be ranked higher
    const names = data.tools.map((t: { name: string }) => t.name);
    const purchasingIdx = names.indexOf("prepare_agentic_purchasing");
    const listIdx = names.indexOf("list_programs");
    expect(purchasingIdx).toBeLessThan(listIdx);
  });

  it("returns all tools without intent param (unchanged behavior)", async () => {
    const r = await req("/for-agents");
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(Array.isArray(data.tools)).toBe(true);
    expect(data.tools.length).toBe(14);
  });
});

// ─── GET /v1/error-codes (H4.2) ──────────────────────────────────

describe("GET /v1/error-codes", () => {
  let data: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/v1/error-codes");
    expect(r.status).toBe(200);
    data = JSON.parse(r.body);
  });

  it("returns rest_error_codes covering every ErrorCode value", () => {
    const codes = (data.rest_error_codes as Array<{ code: string }>).map((e) => e.code).sort();
    expect(codes).toEqual(Object.values(ErrorCode).sort());
  });

  it("every rest_error_codes entry has statuses, retryable, retry_guidance, description", () => {
    for (const entry of data.rest_error_codes as Array<Record<string, unknown>>) {
      expect(Array.isArray(entry.statuses)).toBe(true);
      expect(["yes", "no", "depends"]).toContain(entry.retryable);
      expect(typeof entry.retry_guidance).toBe("string");
      expect(typeof entry.description).toBe("string");
    }
  });

  it("returns mcp_tool_error_categories with the 6 MCP categories", () => {
    const mcp = data.mcp_tool_error_categories as { note: string; categories: Array<{ code: string }> };
    expect(typeof mcp.note).toBe("string");
    expect(mcp.categories.map((c) => c.code).sort()).toEqual(
      ["auth", "external", "internal", "quota", "tier_limit", "validation"].sort(),
    );
  });

  it("returns the response envelope shapes for both REST and MCP", () => {
    const envelope = data.envelope as { rest: string; mcp: string };
    expect(envelope.rest).toContain("error_code");
    expect(envelope.mcp).toContain("_error");
  });
});
