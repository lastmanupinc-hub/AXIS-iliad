/**
 * Tests for the three AI-discoverability endpoints (eq_192):
 *   GET /llms.txt                        — llmstxt.org standard
 *   GET /.well-known/skills/index.json   — agentskills.io standard
 *   GET /v1/docs.md                      — Stripe-style plain-text API reference
 *
 * Also verifies that handleWellKnown now includes the llms_txt and skills fields.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router } from "./router.js";
import {
  handleLlmsTxt,
  handleSkillsIndex,
  handleDocsMd,
  handleWellKnown,
} from "./handlers.js";

// ─── HTTP helper ─────────────────────────────────────────────────

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

const TEST_PORT = 44517;
let server: Server;

beforeAll(async () => {
  openMemoryDb();
  const router = new Router();
  router.get("/llms.txt", handleLlmsTxt);
  router.get("/.well-known/skills/index.json", handleSkillsIndex);
  router.get("/v1/docs.md", handleDocsMd);
  router.get("/.well-known/axis.json", handleWellKnown);
  server = createServer((r, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    router.handle(r, res);
  });
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  closeDb();
});

// ─── GET /llms.txt ───────────────────────────────────────────────

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

  it("returns 200", () => {
    expect(status).toBe(200);
  });

  it("returns text/plain content-type", () => {
    expect(String(headers["content-type"])).toContain("text/plain");
  });

  it("contains AXIS Toolbox name", () => {
    expect(body).toContain("AXIS Toolbox");
  });

  it("contains POST /v1/analyze", () => {
    expect(body).toContain("POST /v1/analyze");
  });

  it("contains POST /mcp MCP endpoint", () => {
    expect(body).toContain("POST /mcp");
  });

  it("contains 7 MCP tools count", () => {
    expect(body).toContain("7 tools");
  });

  it("contains the 18 programs count", () => {
    expect(body).toContain("18");
  });

  it("contains free tier programs", () => {
    expect(body).toContain("search");
    expect(body).toContain("debug");
  });

  it("mentions agentic purchasing", () => {
    expect(body).toContain("prepare-for-agentic-purchasing");
  });

  it("mentions agent skills endpoint in docs section", () => {
    expect(body).toContain("/.well-known/skills/index.json");
  });

  it("mentions plain-text docs", () => {
    expect(body).toContain("/v1/docs.md");
  });

  it("contains authentication instructions", () => {
    expect(body).toContain("Authorization: Bearer");
    expect(body).toContain("POST /v1/accounts");
  });
});

// ─── GET /.well-known/skills/index.json ─────────────────────────

describe("GET /.well-known/skills/index.json", () => {
  let status: number;
  let data: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/.well-known/skills/index.json");
    status = r.status;
    data = JSON.parse(r.body) as Record<string, unknown>;
  });

  it("returns 200", () => {
    expect(status).toBe(200);
  });

  it("has version field", () => {
    expect(data.version).toBe("1.0");
  });

  it("has publisher field", () => {
    expect(typeof data.publisher).toBe("string");
    expect(String(data.publisher)).toContain("AXIS");
  });

  it("has skills array", () => {
    expect(Array.isArray(data.skills)).toBe(true);
  });

  it("has at least 4 skills", () => {
    expect((data.skills as unknown[]).length).toBeGreaterThanOrEqual(4);
  });

  it("each skill has name, description, and endpoint", () => {
    for (const skill of data.skills as Array<Record<string, unknown>>) {
      expect(typeof skill.name).toBe("string");
      expect(typeof skill.description).toBe("string");
      expect(typeof skill.endpoint).toBe("string");
    }
  });

  it("includes axis-analyze skill", () => {
    const skills = data.skills as Array<{ name: string }>;
    expect(skills.some(s => s.name === "axis-analyze")).toBe(true);
  });

  it("includes axis-prepare-for-agentic-purchasing skill", () => {
    const skills = data.skills as Array<{ name: string }>;
    expect(skills.some(s => s.name === "axis-prepare-for-agentic-purchasing")).toBe(true);
  });

  it("includes axis-search-tools skill", () => {
    const skills = data.skills as Array<{ name: string }>;
    expect(skills.some(s => s.name === "axis-search-tools")).toBe(true);
  });

  it("includes axis-mcp skill", () => {
    const skills = data.skills as Array<{ name: string }>;
    expect(skills.some(s => s.name === "axis-mcp")).toBe(true);
  });

  it("axis-mcp skill lists 7 tools", () => {
    const skills = data.skills as Array<{ name: string; tools?: string[] }>;
    const mcp = skills.find(s => s.name === "axis-mcp");
    expect(mcp?.tools).toBeDefined();
    expect(mcp!.tools!.length).toBe(7);
  });

  it("axis-analyze has tags array", () => {
    const skills = data.skills as Array<{ name: string; tags: string[] }>;
    const analyze = skills.find(s => s.name === "axis-analyze");
    expect(Array.isArray(analyze?.tags)).toBe(true);
  });
});

// ─── GET /v1/docs.md ────────────────────────────────────────────

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

  it("returns 200", () => {
    expect(status).toBe(200);
  });

  it("returns text/plain content-type", () => {
    expect(String(headers["content-type"])).toContain("text/plain");
  });

  it("contains AXIS Toolbox header", () => {
    expect(body).toContain("AXIS Toolbox");
  });

  it("contains POST /v1/analyze", () => {
    expect(body).toContain("POST /v1/analyze");
  });

  it("contains POST /v1/prepare-for-agentic-purchasing", () => {
    expect(body).toContain("POST /v1/prepare-for-agentic-purchasing");
  });

  it("contains MCP section", () => {
    expect(body).toContain("POST /mcp");
  });

  it("contains the programs table with 18 programs", () => {
    expect(body).toContain("| search |");
    expect(body).toContain("| agentic-purchasing |");
  });

  it("contains account management endpoints", () => {
    expect(body).toContain("POST /v1/accounts");
    expect(body).toContain("GET /v1/account");
  });

  it("contains discovery endpoints", () => {
    expect(body).toContain("/.well-known/axis.json");
    expect(body).toContain("/.well-known/skills/index.json");
    expect(body).toContain("/llms.txt");
  });

  it("mentions search endpoint", () => {
    expect(body).toContain("GET /v1/mcp/tools");
  });
});

// ─── GET /.well-known/axis.json — llms_txt and skills fields ────

describe("GET /.well-known/axis.json — new fields", () => {
  let data: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/.well-known/axis.json");
    data = JSON.parse(r.body) as Record<string, unknown>;
  });

  it("includes llms_txt field", () => {
    expect(typeof data.llms_txt).toBe("string");
    expect(String(data.llms_txt)).toContain("/llms.txt");
  });

  it("includes skills field", () => {
    expect(typeof data.skills).toBe("string");
    expect(String(data.skills)).toContain("/.well-known/skills/index.json");
  });
});
