/**
 * Tests for discovery & well-known handlers (eq_197):
 *   GET /.well-known/agent.json       — handleAgentJson
 *   GET /.well-known/glama.json       — handleGlamaJson
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
import { resetTestDb } from "@axis/snapshots";
import { MCP_TOOLS } from "./mcp-tools.js";
import { METERED_MCP_TOOLS } from "./mcp-runtime.js";
import { getPricingTier } from "./mpp.js";
import { Router } from "./router.js";
import {
  handleAgentJson,
  handleGlamaJson,
  handleSecurityTxt,
  handleCapabilities,
  handleRobotsTxt,
  handleSitemapXml,
  handleHealthRedirect,
  handleDocsRedirect,
  handleOpenApiJson,
  handlePerformance,
  handlePerformanceReputation,
  handleAiPlugin,
  handleOAuthProtectedResource,
  handlePricingLanding,
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

let server: Server;
let TEST_PORT: number;

beforeAll(async () => {
  await resetTestDb();
  const router = new Router();
  router.get("/.well-known/agent.json", handleAgentJson);
  router.get("/.well-known/glama.json", handleGlamaJson);
  router.get("/.well-known/security.txt", handleSecurityTxt);
  router.get("/.well-known/capabilities.json", handleCapabilities);
  router.get("/robots.txt", handleRobotsTxt);
  router.get("/sitemap.xml", handleSitemapXml);
  router.get("/health", handleHealthRedirect);
  router.get("/docs", handleDocsRedirect);
  router.get("/openapi.json", handleOpenApiJson);
  router.get("/performance", handlePerformance);
  router.get("/performance/reputation", handlePerformanceReputation);
  router.get("/.well-known/ai-plugin.json", handleAiPlugin);
  router.get("/.well-known/oauth-protected-resource", handleOAuthProtectedResource);
  router.get("/agents.json", handleAgentJson);
  router.get("/pricing", handlePricingLanding);
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

// ─── GET /.well-known/agent.json ─────────────────────────────────

describe("GET /pricing", () => {
  it("returns 200 with pricing landing metadata for crawlers", async () => {
    const r = await req("/pricing");
    expect(r.status).toBe(200);
    const json = JSON.parse(r.body) as Record<string, unknown>;
    expect(json.title).toBe("Axis Iliad Pricing");
    expect(json.api_plans_endpoint).toBe("/v1/plans");
    expect(json.for_agents).toBe("/for-agents");
    expect(typeof json.description).toBe("string");
    expect(String(r.headers["content-type"])).toContain("application/json");
  });
});

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

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", async () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("contains name field", async () => {
    expect(json.name).toBe("Axis' Iliad");
  });

  it("contains version field", async () => {
    expect(json.version).toBe("0.5.3");
  });

  it("contains capabilities object", async () => {
    expect(json.capabilities).toBeDefined();
    expect(typeof json.capabilities).toBe("object");
  });

  it("contains mcp_endpoint", async () => {
    expect(json.mcp_endpoint).toBe("/mcp");
  });

  it("contains endpoints object", async () => {
    expect(json.endpoints).toBeDefined();
    expect(typeof json.endpoints).toBe("object");
  });

  // H-Phase-A cycle 9: this endpoint was the one surface that never got
  // cycle 5's "unlimited" -> real-credit-allowance correction, and separately
  // implied recurring billing PAI'D's checkout doesn't do.
  it("never claims 'unlimited' Pro calls, and doesn't imply recurring billing", async () => {
    const monetization = json.monetization as Record<string, unknown>;
    expect(String(monetization.pro)).not.toContain("unlimited");
    expect(String(monetization.pro)).toContain("300,000");
    expect(String(monetization.pro)).toContain("one-time");
  });

  it("H-Phase-A cycle 21: monetization.model reflects the real per-tool price range, not a stale flat $0.50", async () => {
    const monetization = json.monetization as Record<string, unknown>;
    const standardCents = METERED_MCP_TOOLS.map((t) => getPricingTier(t).standard_cents);
    const min = (Math.min(...standardCents) / 100).toFixed(2);
    const max = (Math.max(...standardCents) / 100).toFixed(2);
    expect(String(monetization.model)).toContain(`$${min}-$${max}`);
    expect(min).not.toBe(max);
  });
});

// ─── GET /.well-known/glama.json ────────────────────────────────

describe("GET /.well-known/glama.json", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let json: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/.well-known/glama.json");
    status = r.status;
    headers = r.headers;
    json = JSON.parse(r.body);
  });

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", async () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("contains mcp endpoint and description", async () => {
    expect(typeof json.mcp_endpoint).toBe("string");
    expect(String(json.mcp_endpoint)).toContain("/v1/mcp");
    expect(typeof json.description).toBe("string");
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

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns text/plain content-type", async () => {
    expect(String(headers["content-type"])).toContain("text/plain");
  });

  it("contains Contact field", async () => {
    expect(body).toContain("Contact:");
  });

  it("contains Expires field", async () => {
    expect(body).toContain("Expires:");
  });

  it("contains Canonical field", async () => {
    expect(body).toContain("Canonical:");
  });

  it("contains Preferred-Languages field", async () => {
    expect(body).toContain("Preferred-Languages: en");
  });

  it("contains security email", async () => {
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

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", async () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("contains name field", async () => {
    expect(json.name).toBe("Axis' Iliad");
  });

  it("contains capabilities object with purchasing_readiness", async () => {
    const caps = json.capabilities as Record<string, unknown>;
    expect(caps).toBeDefined();
    expect(caps.purchasing_readiness).toBeDefined();
  });

  it("contains mcp section with tools array", async () => {
    const mcp = json.mcp as Record<string, unknown>;
    expect(mcp).toBeDefined();
    expect(Array.isArray(mcp.tools)).toBe(true);
    expect((mcp.tools as string[]).length).toBeGreaterThan(0);
  });

  // H-Phase-A cycle 10: mcp.tools was a hand-typed array of 18 names,
  // covering only 18 of the real 37 MCP tools — a 4th recurrence of the
  // hand-duplicated-catalog-drift shape this endpoint's own sibling
  // (GET /for-agents) already had fixed twice (cycles 6, 8/9). Derived from
  // deriveMcpToolCatalog() now, so it can't independently drift again.
  it("H-Phase-A cycle 10: mcp.tools names every real MCP tool, not a stale hand-typed subset", async () => {
    const mcp = json.mcp as Record<string, unknown>;
    const tools = mcp.tools as string[];
    expect(tools.length).toBe(MCP_TOOLS.length);
    for (const tool of MCP_TOOLS) {
      expect(tools, `capabilities.json's mcp.tools is missing ${tool.name}`).toContain(tool.name);
    }
  });

  it("contains keywords array", async () => {
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

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns text/plain content-type", async () => {
    expect(String(headers["content-type"])).toContain("text/plain");
  });

  it("contains User-agent directive", async () => {
    expect(body).toContain("User-agent: *");
  });

  it("contains Allow directive", async () => {
    expect(body).toContain("Allow: /");
  });

  it("contains Sitemap directive", async () => {
    expect(body).toContain("Sitemap:");
    expect(body).toContain("sitemap.xml");
  });

  it("allows AI bot crawlers", async () => {
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

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns application/xml content-type", async () => {
    expect(String(headers["content-type"])).toContain("application/xml");
  });

  it("contains XML declaration", async () => {
    expect(body).toContain('<?xml version="1.0"');
  });

  it("contains urlset element", async () => {
    expect(body).toContain("<urlset");
    expect(body).toContain("</urlset>");
  });

  it("contains url entries with loc, lastmod, changefreq, priority", async () => {
    expect(body).toContain("<url>");
    expect(body).toContain("<loc>");
    expect(body).toContain("<lastmod>");
    expect(body).toContain("<changefreq>");
    expect(body).toContain("<priority>");
  });

  it("includes the base URL", async () => {
    expect(body).toContain("https://iliad.trustfabric.ai");
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

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", async () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("contains status: healthy", async () => {
    expect(json.status).toBe("healthy");
  });

  it("contains version field", async () => {
    expect(json.version).toBe("0.5.3");
  });

  it("contains timestamp", async () => {
    expect(json.timestamp).toBeDefined();
    expect(typeof json.timestamp).toBe("string");
  });

  it("contains details pointing to /v1/health", async () => {
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

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", async () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("contains docs URL", async () => {
    expect(json.docs).toBeDefined();
  });

  it("contains openapi reference", async () => {
    expect(json.openapi).toBe("/v1/docs");
  });

  it("contains markdown reference", async () => {
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

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", async () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("contains openapi version field", async () => {
    expect(json.openapi).toBeDefined();
    expect(typeof json.openapi).toBe("string");
  });

  it("contains info object", async () => {
    expect(json.info).toBeDefined();
    expect(typeof json.info).toBe("object");
  });

  it("contains paths object", async () => {
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

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", async () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("contains status: ok", async () => {
    expect(json.status).toBe("ok");
  });

  it("contains version field", async () => {
    expect(json.version).toBe("0.5.3");
  });

  it("contains timestamp", async () => {
    expect(json.timestamp).toBeDefined();
    expect(typeof json.timestamp).toBe("string");
  });

  it("contains metrics object", async () => {
    expect(json.metrics).toBeDefined();
    expect(typeof json.metrics).toBe("object");
  });

  it("contains endpoints object", async () => {
    expect(json.endpoints).toBeDefined();
    expect(typeof json.endpoints).toBe("object");
  });

  // Regression lock: this endpoint used to report a hardcoded 99.87% MCP
  // success rate, a fixed 0.13 error rate, and a "mcpCallsTotal * 3, floor
  // 1000" total_requests guess — none grounded in real data (one of them
  // discarded the real, already-computed total in favor of the fabricated
  // number). Fixed to source total_requests/error_rate from metrics.ts's
  // real recordRequest() counters, and to report null (not an invented
  // number) for the two fields nothing in this codebase actually tracks.
  it("never fabricates mcp_calls_success_rate or active_probes", async () => {
    const metrics = json.metrics as Record<string, unknown>;
    expect(metrics.mcp_calls_success_rate).toBeNull();
    expect(metrics.active_probes).toBeNull();
  });

  it("total_requests and error_rate are real counters, not the old hardcoded guesses", async () => {
    const metrics = json.metrics as Record<string, unknown>;
    expect(typeof metrics.total_requests).toBe("number");
    expect(metrics.total_requests as number).toBeGreaterThanOrEqual(0);
    // The old estimate floored at 1000 regardless of real traffic — a fresh
    // test server has made far fewer requests than that by this point.
    expect(metrics.total_requests as number).toBeLessThan(1000);
    expect(metrics.error_rate).not.toBe(0.13);
  });

  it("reports the real mcp_calls_today counter (previously computed but silently dropped)", async () => {
    const metrics = json.metrics as Record<string, unknown>;
    expect(typeof metrics.mcp_calls_today).toBe("number");
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

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", async () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("contains status: ok", async () => {
    expect(json.status).toBe("ok");
  });

  it("contains reputation_score", async () => {
    expect(json.reputation_score).toBeDefined();
    expect(typeof json.reputation_score).toBe("number");
    expect(json.reputation_score).toBeGreaterThanOrEqual(0);
    expect(json.reputation_score).toBeLessThanOrEqual(100);
  });

  it("contains trust_signals object", async () => {
    expect(json.trust_signals).toBeDefined();
    expect(typeof json.trust_signals).toBe("object");
  });

  it("contains chiark_compatibility", async () => {
    expect(json.chiark_compatibility).toBeDefined();
  });

  it("contains last_probe timestamp", async () => {
    expect(json.last_probe).toBeDefined();
    expect(typeof json.last_probe).toBe("string");
  });

  it("contains notes", async () => {
    expect(json.notes).toBeDefined();
    expect(typeof json.notes).toBe("string");
  });
});

// ─── GET /.well-known/ai-plugin.json ─────────────────────────────

describe("GET /.well-known/ai-plugin.json", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let json: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/.well-known/ai-plugin.json");
    status = r.status;
    headers = r.headers;
    json = JSON.parse(r.body);
  });

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", async () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("declares the v1 schema version", async () => {
    expect(json.schema_version).toBe("v1");
  });

  it("contains a model name and description", async () => {
    expect(json.name_for_model).toBe("axis_iliad");
    expect(typeof json.description_for_model).toBe("string");
  });

  it("points api.url at the openapi spec", async () => {
    const api = json.api as Record<string, unknown>;
    expect(api.type).toBe("openapi");
    expect(String(api.url)).toContain("openapi.json");
  });

  it("declares no-auth access", async () => {
    expect((json.auth as Record<string, unknown>).type).toBe("none");
  });
});

// ─── GET /.well-known/oauth-protected-resource ───────────────────

describe("GET /.well-known/oauth-protected-resource", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let json: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/.well-known/oauth-protected-resource");
    status = r.status;
    headers = r.headers;
    json = JSON.parse(r.body);
  });

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("returns application/json content-type", async () => {
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("identifies the MCP resource", async () => {
    expect(String(json.resource)).toContain("/mcp");
  });

  it("lists at least one authorization server", async () => {
    expect(Array.isArray(json.authorization_servers)).toBe(true);
    expect((json.authorization_servers as string[]).length).toBeGreaterThan(0);
  });

  it("advertises header bearer method", async () => {
    expect(json.bearer_methods_supported).toContain("header");
  });
});

// ─── GET /agents.json (root alias of /.well-known/agent.json) ─────

describe("GET /agents.json", () => {
  let status: number;
  let json: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/agents.json");
    status = r.status;
    json = JSON.parse(r.body);
  });

  it("returns 200", async () => {
    expect(status).toBe(200);
  });

  it("serves the same agent manifest (name + mcp_endpoint)", async () => {
    expect(json.name).toBe("Axis' Iliad");
    expect(json.mcp_endpoint).toBe("/mcp");
  });
});
