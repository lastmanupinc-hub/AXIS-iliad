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
import { resetTestDb } from "@axis/snapshots";
import { Router } from "./router.js";
import { MCP_TOOL_COUNT } from "./counts.js";
import {
  handleLlmsTxt,
  handleSkillsIndex,
  handleDocsMd,
  handleWellKnown,
  handleForAgents,
  handleInstall,
  handleProbeIntent,
} from "./handlers.js";

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
