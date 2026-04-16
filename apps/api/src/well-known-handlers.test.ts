/**
 * Tests for 8 previously-untested discovery & well-known handlers (eq_197):
 *   GET /.well-known/agent.json       — handleAgentJson
 *   GET /.well-known/security.txt     — handleSecurityTxt
 *   GET /.well-known/capabilities.json — handleCapabilities
 *   GET /robots.txt                    — handleRobotsTxt
 *   GET /sitemap.xml                   — handleSitemapXml
 *   GET /health                        — handleHealthRedirect
 *   GET /docs                          — handleDocsRedirect
 *   GET /openapi.json                  — handleOpenApiJson
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router } from "./router.js";
import {
  handleAgentJson,
  handleSecurityTxt,
  handleCapabilities,
  handleRobotsTxt,
  handleSitemapXml,
  handleHealthRedirect,
  handleDocsRedirect,
  handleOpenApiJson,
  handlePerformance,
  handlePerformanceReputation,
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

const TEST_PORT = 44519;
let server: Server;

beforeAll(async () => {
  openMemoryDb();
  const router = new Router();
  router.get("/.well-known/agent.json", handleAgentJson);
  router.get("/.well-known/security.txt", handleSecurityTxt);
  router.get("/.well-known/capabilities.json", handleCapabilities);
  router.get("/robots.txt", handleRobotsTxt);
  router.get("/sitemap.xml", handleSitemapXml);
  router.get("/health", handleHealthRedirect);
  router.get("/docs", handleDocsRedirect);
  router.get("/openapi.json", handleOpenApiJson);
  router.get("/performance", handlePerformance);
  router.get("/performance/reputation", handlePerformanceReputation);
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

// ─── GET /.well-known/agent.json ─────────────────────────────────

describe("GET /.well-known/agent.json", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let body: string;
  let json: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/.well-known/agent.json");
    status = r.status;
    headers = r.headers;
    body = r.body;
    json = JSON.parse(body);
  });

  it("returns 200", () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("contains name field", () => {
    expect(json.name).toBe("AXIS Toolbox");
  });

  it("contains version field", () => {
    expect(json.version).toBe("0.5.0");
  });

  it("contains capabilities object", () => {
    expect(json.capabilities).toBeDefined();
    expect(typeof json.capabilities).toBe("object");
  });

  it("contains mcp_endpoint", () => {
    expect(json.mcp_endpoint).toBe("/mcp");
  });

  it("contains endpoints object", () => {
    expect(json.endpoints).toBeDefined();
    expect(typeof json.endpoints).toBe("object");
  });
});

// ─── GET /.well-known/security.txt ───────────────────────────────

describe("GET /.well-known/security.txt", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let body: string;

  beforeAll(async () => {
    const r = await req("/.well-known/security.txt");
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

  it("contains Contact field", () => {
    expect(body).toContain("Contact:");
  });

  it("contains Expires field", () => {
    expect(body).toContain("Expires:");
  });

  it("contains Canonical field", () => {
    expect(body).toContain("Canonical:");
  });

  it("contains Preferred-Languages field", () => {
    expect(body).toContain("Preferred-Languages: en");
  });

  it("contains security email", () => {
    expect(body).toContain("security@jonathanarvay.com");
  });
});

// ─── GET /.well-known/capabilities.json ──────────────────────────

describe("GET /.well-known/capabilities.json", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let body: string;
  let json: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/.well-known/capabilities.json");
    status = r.status;
    headers = r.headers;
    body = r.body;
    json = JSON.parse(body);
  });

  it("returns 200", () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("contains name field", () => {
    expect(json.name).toBe("AXIS Toolbox");
  });

  it("contains capabilities object with purchasing_readiness", () => {
    const caps = json.capabilities as Record<string, unknown>;
    expect(caps).toBeDefined();
    expect(caps.purchasing_readiness).toBeDefined();
  });

  it("contains mcp section with tools array", () => {
    const mcp = json.mcp as Record<string, unknown>;
    expect(mcp).toBeDefined();
    expect(Array.isArray(mcp.tools)).toBe(true);
    expect((mcp.tools as string[]).length).toBeGreaterThan(0);
  });

  it("contains keywords array", () => {
    expect(Array.isArray(json.keywords)).toBe(true);
    expect((json.keywords as string[]).length).toBeGreaterThan(0);
  });
});

// ─── GET /robots.txt ─────────────────────────────────────────────

describe("GET /robots.txt", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let body: string;

  beforeAll(async () => {
    const r = await req("/robots.txt");
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

  it("contains User-agent directive", () => {
    expect(body).toContain("User-agent: *");
  });

  it("contains Allow directive", () => {
    expect(body).toContain("Allow: /");
  });

  it("contains Sitemap directive", () => {
    expect(body).toContain("Sitemap:");
    expect(body).toContain("sitemap.xml");
  });

  it("allows AI bot crawlers", () => {
    expect(body).toContain("GPTBot");
    expect(body).toContain("ClaudeBot");
  });
});

// ─── GET /sitemap.xml ────────────────────────────────────────────

describe("GET /sitemap.xml", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let body: string;

  beforeAll(async () => {
    const r = await req("/sitemap.xml");
    status = r.status;
    headers = r.headers;
    body = r.body;
  });

  it("returns 200", () => {
    expect(status).toBe(200);
  });

  it("returns application/xml content-type", () => {
    expect(String(headers["content-type"])).toContain("application/xml");
  });

  it("contains XML declaration", () => {
    expect(body).toContain('<?xml version="1.0"');
  });

  it("contains urlset element", () => {
    expect(body).toContain("<urlset");
    expect(body).toContain("</urlset>");
  });

  it("contains url entries with loc, lastmod, changefreq, priority", () => {
    expect(body).toContain("<url>");
    expect(body).toContain("<loc>");
    expect(body).toContain("<lastmod>");
    expect(body).toContain("<changefreq>");
    expect(body).toContain("<priority>");
  });

  it("includes the base URL", () => {
    expect(body).toContain("https://toolbox.jonathanarvay.com");
  });
});

// ─── GET /health ─────────────────────────────────────────────────

describe("GET /health", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let body: string;
  let json: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/health");
    status = r.status;
    headers = r.headers;
    body = r.body;
    json = JSON.parse(body);
  });

  it("returns 200", () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("contains status: healthy", () => {
    expect(json.status).toBe("healthy");
  });

  it("contains version field", () => {
    expect(json.version).toBe("0.5.0");
  });

  it("contains timestamp", () => {
    expect(json.timestamp).toBeDefined();
    expect(typeof json.timestamp).toBe("string");
  });

  it("contains details pointing to /v1/health", () => {
    expect(json.details).toContain("/v1/health");
  });
});

// ─── GET /docs ───────────────────────────────────────────────────

describe("GET /docs", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let body: string;
  let json: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/docs");
    status = r.status;
    headers = r.headers;
    body = r.body;
    json = JSON.parse(body);
  });

  it("returns 200", () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("contains docs URL", () => {
    expect(json.docs).toBeDefined();
  });

  it("contains openapi reference", () => {
    expect(json.openapi).toBe("/v1/docs");
  });

  it("contains markdown reference", () => {
    expect(json.markdown).toBe("/v1/docs.md");
  });
});

// ─── GET /openapi.json ──────────────────────────────────────────

describe("GET /openapi.json", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let body: string;
  let json: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/openapi.json");
    status = r.status;
    headers = r.headers;
    body = r.body;
    json = JSON.parse(body);
  });

  it("returns 200", () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("contains openapi version field", () => {
    expect(json.openapi).toBeDefined();
    expect(typeof json.openapi).toBe("string");
  });

  it("contains info object", () => {
    expect(json.info).toBeDefined();
    expect(typeof json.info).toBe("object");
  });

  it("contains paths object", () => {
    expect(json.paths).toBeDefined();
    expect(typeof json.paths).toBe("object");
    expect(Object.keys(json.paths as object).length).toBeGreaterThan(0);
  });
});

// ─── GET /performance ─────────────────────────────────────────────

describe("GET /performance", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let body: string;
  let json: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/performance");
    status = r.status;
    headers = r.headers;
    body = r.body;
    json = JSON.parse(body);
  });

  it("returns 200", () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("contains status: ok", () => {
    expect(json.status).toBe("ok");
  });

  it("contains version field", () => {
    expect(json.version).toBe("0.5.0");
  });

  it("contains timestamp", () => {
    expect(json.timestamp).toBeDefined();
    expect(typeof json.timestamp).toBe("string");
  });

  it("contains metrics object", () => {
    expect(json.metrics).toBeDefined();
    expect(typeof json.metrics).toBe("object");
  });

  it("contains endpoints object", () => {
    expect(json.endpoints).toBeDefined();
    expect(typeof json.endpoints).toBe("object");
  });
});

// ─── GET /performance/reputation ──────────────────────────────────

describe("GET /performance/reputation", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let body: string;
  let json: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/performance/reputation");
    status = r.status;
    headers = r.headers;
    body = r.body;
    json = JSON.parse(body);
  });

  it("returns 200", () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("contains status: ok", () => {
    expect(json.status).toBe("ok");
  });

  it("contains reputation_score", () => {
    expect(json.reputation_score).toBeDefined();
    expect(typeof json.reputation_score).toBe("number");
    expect(json.reputation_score).toBeGreaterThanOrEqual(0);
    expect(json.reputation_score).toBeLessThanOrEqual(100);
  });

  it("contains trust_signals object", () => {
    expect(json.trust_signals).toBeDefined();
    expect(typeof json.trust_signals).toBe("object");
  });

  it("contains chiark_compatibility", () => {
    expect(json.chiark_compatibility).toBeDefined();
  });

  it("contains last_probe timestamp", () => {
    expect(json.last_probe).toBeDefined();
    expect(typeof json.last_probe).toBe("string");
  });

  it("contains notes", () => {
    expect(json.notes).toBeDefined();
    expect(typeof json.notes).toBe("string");
  });
});
