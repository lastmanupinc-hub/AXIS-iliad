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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resetTestDb } from "@axis/snapshots";
import { MCP_TOOLS } from "./mcp-tools.js";
import { METERED_MCP_TOOLS } from "./mcp-runtime.js";
import { getPricingTier, formatCents } from "./mpp.js";
import { Router } from "./router.js";
import {
  handleAgentJson,
  handleAgentCard,
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
  handleX402WellKnown,
  handleEstateManifest,
} from "./handlers.js";
import { ESTATE_REGISTRY } from "@axis/generator-core";

// apps/api/src -> repo root
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

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
  router.get("/.well-known/agent-card.json", handleAgentCard);
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
  router.get("/.well-known/x402", handleX402WellKnown);
  router.get("/.well-known/x402.json", handleX402WellKnown);
  router.get("/.well-known/axis-estate.json", handleEstateManifest);
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

  // Glama's directory marked this connector unhealthy because the old shape
  // (name/slug/description/mcp_endpoint) never matched their claim schema —
  // no $schema, no maintainers, so they had no way to verify ownership.
  it("matches Glama's connector-claim schema exactly ($schema + maintainers)", async () => {
    expect(json["$schema"]).toBe("https://glama.ai/mcp/schemas/connector.json");
    expect(Array.isArray(json.maintainers)).toBe(true);
    const maintainers = json.maintainers as Array<{ email?: string }>;
    expect(maintainers.length).toBeGreaterThan(0);
    expect(maintainers[0].email).toBe("support@jonathanarvay.com");
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

  it("SECURITY.md names the same contact this endpoint serves (R1.4)", () => {
    // SECURITY.md and this served endpoint drifted to two different domains
    // for weeks with nothing to catch it -- assert they can't diverge again.
    const securityMd = readFileSync(join(ROOT, "SECURITY.md"), "utf8");
    expect(securityMd).toContain("security@jonathanarvay.com");
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

// ─── GET /.well-known/x402 and /.well-known/x402.json ────────────
// Pragmatic discovery aid (not the x402 foundation's canonical mechanism —
// see handleX402WellKnown's own docblock) added because real production
// traffic checks this exact path.

describe("GET /.well-known/x402 and /.well-known/x402.json", () => {
  let jsonNoExt: Record<string, unknown>;
  let jsonWithExt: Record<string, unknown>;
  let statusNoExt: number;
  let statusWithExt: number;

  beforeAll(async () => {
    const r1 = await req("/.well-known/x402");
    const r2 = await req("/.well-known/x402.json");
    statusNoExt = r1.status;
    statusWithExt = r2.status;
    jsonNoExt = JSON.parse(r1.body);
    jsonWithExt = JSON.parse(r2.body);
  });

  it("both the extension-less and .json paths return 200 with identical bodies", () => {
    expect(statusNoExt).toBe(200);
    expect(statusWithExt).toBe(200);
    expect(jsonNoExt).toEqual(jsonWithExt);
  });

  it("is honest that this is not the x402 foundation's canonical discovery mechanism", () => {
    expect(String(jsonNoExt.note)).toContain("not the x402 foundation's canonical mechanism");
    expect(String(jsonNoExt.note)).toContain("bazaar");
  });

  it("uses the real mppx/PaymentAuth wire protocol name, never claims X-PAYMENT/PAYMENT-SIGNATURE", () => {
    const note = String(jsonNoExt.wire_protocol_note);
    expect(note).toContain("mppx/PaymentAuth");
    expect(note).toContain("NOT x402.org's");
  });

  it("lists every real metered tool across programs+utilities with its real derived price — not a hand-typed subset", () => {
    const programs = jsonNoExt.programs as { name: string; standard_price_usd: string; lite_price_usd: string }[];
    const utilities = jsonNoExt.utilities as { name: string; standard_price_usd: string; lite_price_usd: string }[];
    const combined = [...programs, ...utilities];
    expect(combined.length).toBe(METERED_MCP_TOOLS.length);
    for (const tool of METERED_MCP_TOOLS) {
      const entry = combined.find((t) => t.name === tool);
      expect(entry, `x402.json's programs/utilities is missing ${tool}`).toBeDefined();
      const tier = getPricingTier(tool);
      expect(entry!.standard_price_usd).toBe((tier.standard_cents / 100).toFixed(2));
      expect(entry!.lite_price_usd).toBe((tier.lite_cents / 100).toFixed(2));
    }
  });

  // Was "try_it_free" until 2026-07-28. ping_payment now costs half a cent, so
  // the key was renamed rather than left describing a price that no longer
  // exists — an agent reading "try_it_free" and being billed is exactly the kind
  // of drift the honesty guards in this file exist to catch.
  it("leads with the cheapest ping_payment action, not the x402-honesty disclaimer", () => {
    const keys = Object.keys(jsonNoExt);
    expect(keys[0]).toBe("cheapest_way_in");
    expect(keys.indexOf("note")).toBeGreaterThan(keys.indexOf("cheapest_way_in"));
    const entry = jsonNoExt.cheapest_way_in as Record<string, unknown>;
    expect(entry.tool).toBe("ping_payment");
    // The advertised price must be derived, not hand-typed. Was briefly priced
    // at a fractional 0.5 cents (2026-07-28) and reverted same-day: that value
    // reached Postgres columns declared INTEGER (via the funnel-event insert
    // in runPingPayment) and broke every real call in production — see
    // PRICING_TIERS.ping_payment's own comment in packages/mpp/src/index.ts,
    // and the mpp.test.ts invariant that now guards against a repeat.
    expect(entry.price_usd).toBe(formatCents(getPricingTier("ping_payment").standard_cents));
    expect(entry.price_usd).toBe("0.01");
  });

  it("never advertises ping_payment as free anywhere in the manifest", () => {
    // It is reachable without an API key, which is easy to confuse with free.
    const blob = JSON.stringify(jsonNoExt);
    expect(blob).not.toContain("try_it_free");
    expect(blob).not.toMatch(/ping_payment[^"]*\$0\.00\b/);
    expect(blob).not.toMatch(/free[^"]{0,40}ping_payment/i);
  });

  it("is honest that artifacts are bundled inside programs, not sold individually", () => {
    expect(String(jsonNoExt.artifacts_note)).toContain("not sold or refreshed individually today");
    expect(String(jsonNoExt.artifacts_note)).toContain("list_programs");
  });

  it("points at the new agent-card.json discovery surface", () => {
    expect(String(jsonNoExt.agent_card)).toContain("/.well-known/agent-card.json");
  });

  it("every program and utility entry has a non-empty summary (catches a typo'd lookup key)", () => {
    const programs = jsonNoExt.programs as Array<Record<string, unknown>>;
    const utilities = jsonNoExt.utilities as Array<Record<string, unknown>>;
    for (const entry of [...programs, ...utilities]) {
      expect(typeof entry.summary, `${entry.name} is missing a summary`).toBe("string");
      expect((entry.summary as string).length, `${entry.name}'s summary is empty`).toBeGreaterThan(0);
    }
  });

  it("never advertises the Base/CDP rail — only mppx schemes it can actually settle today", () => {
    const schemes = jsonNoExt.accepted_payment_schemes as string[];
    for (const scheme of schemes) {
      expect(scheme.startsWith("mppx/"), `scheme "${scheme}" is not an mppx/ rail this system can settle`).toBe(true);
    }
    expect(schemes.join(",")).not.toContain("x402/usdc/base");
  });

  it("points agents at the real /mcp endpoint and the retry credential convention", () => {
    const endpoint = jsonNoExt.endpoint as Record<string, unknown>;
    expect(endpoint.url).toBe("/mcp");
    expect(endpoint.method).toBe("POST");
    expect(String(jsonNoExt.how_to_pay)).toContain("Authorization: Payment");
    expect(String(jsonNoExt.how_to_pay)).toContain("X-Axis-Key");
  });

  it("does not overpromise that any metered tool call without a credential returns a real 402 (H-cycle-25 honesty fix)", () => {
    // The endpoint used to claim "call any metered tool without a payment
    // credential to receive a real 402" — false in the default/common case:
    // an anonymous caller hits a plain auth error (anon front door is OFF by
    // default), and even an authenticated caller only gets a real negotiation
    // body on overage past plan credits, on a guaranteed-billable tool, with
    // in-band settlement enabled. how_to_pay must not repeat that overclaim,
    // and must point at ping_payment as the one deterministic, unconditional demo.
    const howToPay = String(jsonNoExt.how_to_pay);
    expect(howToPay).not.toContain("Call any metered tool via tools/call without a payment credential to receive a real 402");
    expect(howToPay).toContain("ping_payment");
    expect(howToPay.toLowerCase()).toContain("overage");
  });
});

// ─── GET /.well-known/agent-card.json ────────────────────────────

describe("GET /.well-known/agent-card.json", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let json: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/.well-known/agent-card.json");
    status = r.status;
    headers = r.headers;
    json = JSON.parse(r.body);
  });

  it("returns 200 with application/json", () => {
    expect(status).toBe(200);
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("points at the real /mcp endpoint", () => {
    expect(json.url).toBe("/mcp");
  });

  it("does not claim A2A protocol conformance", () => {
    expect(String(json.protocol)).toContain("MCP");
    expect(String(json.protocol)).toContain("NOT A2A");
  });

  it("lists at least one skill with an id, description, and tags", () => {
    const skills = json.skills as Array<Record<string, unknown>>;
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBeGreaterThan(0);
    for (const skill of skills) {
      expect(typeof skill.id).toBe("string");
      expect(typeof skill.description).toBe("string");
      expect(Array.isArray(skill.tags)).toBe(true);
    }
  });

  it("cross-references the other well-known discovery surfaces", () => {
    const wellKnown = json.well_known as Record<string, string>;
    expect(wellKnown.x402).toBe("/.well-known/x402");
    expect(wellKnown.oauth_protected_resource).toBe("/.well-known/oauth-protected-resource");
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

// ─── GET /.well-known/axis-estate.json (est_01) ────────────────────

describe("GET /.well-known/axis-estate.json", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let body: string;
  let json: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("/.well-known/axis-estate.json");
    status = r.status;
    headers = r.headers;
    body = r.body;
    json = JSON.parse(r.body);
  });

  it("returns 200 as application/json", async () => {
    expect(status).toBe(200);
    expect(String(headers["content-type"])).toContain("application/json");
  });

  it("carries a public, bounded Cache-Control", async () => {
    const cc = String(headers["cache-control"]);
    expect(cc).toContain("public");
    expect(cc).toMatch(/max-age=\d+/);
  });

  it("carries a non-empty schema_version and an additive-only compatibility statement", async () => {
    expect(typeof json.schema_version).toBe("string");
    expect((json.schema_version as string).length).toBeGreaterThan(0);
    expect(String(json.compatibility)).toMatch(/additive/i);
  });

  it("this_property describes Iliad itself, not a sibling", async () => {
    const self = json.this_property as Record<string, unknown>;
    expect(self.id).toBe("iliad");
    expect(self.name).toBe("Axis' Iliad");
  });

  it("properties is exactly ESTATE_REGISTRY, serialized — one source, no second copy", async () => {
    expect(json.properties).toEqual(JSON.parse(JSON.stringify(Object.values(ESTATE_REGISTRY))));
  });

  it("no served property claims Iliad's own row (webapp_surface: agent-only would be false for Iliad)", async () => {
    const properties = json.properties as Array<Record<string, unknown>>;
    expect(properties.some((p) => p.id === "iliad")).toBe(false);
  });

  it("every served property is webapp_surface: agent-only", async () => {
    const properties = json.properties as Array<Record<string, unknown>>;
    expect(properties.length).toBeGreaterThan(0);
    for (const p of properties) expect(p.webapp_surface).toBe("agent-only");
  });

  it("is byte-identical across two independent requests — deterministic, no timestamps", async () => {
    const r2 = await req("/.well-known/axis-estate.json");
    expect(r2.body).toBe(body);
  });

  // Added after webapp_surface was independently misread twice in one afternoon
  // (a sibling's own team, and this repo's own est_01 commit message) — a
  // correctly-populated field that invites the wrong reading is still a defect
  // for a manifest whose entire audience never opens the TypeScript source.
  it("carries field_docs clarifying webapp_surface describes ILIAD's treatment, not the property's own site", async () => {
    const docs = json.field_docs as Record<string, string> | undefined;
    expect(docs?.webapp_surface).toBeDefined();
    expect(docs!.webapp_surface).toMatch(/Iliad/);
    expect(docs!.webapp_surface.toLowerCase()).not.toMatch(/\bthe property'?s own website is agent-only\b/);
  });

  it("this_property includes Iliad's own domains and api_base, not just id/name/mcp", async () => {
    const self = json.this_property as Record<string, unknown>;
    expect(Array.isArray(self.domains)).toBe(true);
    expect((self.domains as string[]).length).toBeGreaterThan(0);
    expect(typeof self.api_base).toBe("string");
  });
});
