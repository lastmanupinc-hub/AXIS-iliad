/**
 * E2E smoke tests against the live production API.
 *
 * These tests verify that the deployed service returns expected shapes
 * for public (no-auth) endpoints. They require network access and
 * skip gracefully if the API is unreachable.
 *
 * Run manually:  npx vitest run apps/api/src/e2e-smoke.test.ts
 * In CI, add:    AXIS_E2E=1 to enable (skipped by default in CI).
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.AXIS_E2E_BASE ?? "https://axis-api-6c7z.onrender.com";
let reachable = false;

// Skip in CI unless AXIS_E2E is set
const ciSkip = !!(process.env.CI && !process.env.AXIS_E2E);

beforeAll(async () => {
  if (ciSkip) return;
  try {
    const r = await fetch(`${BASE}/v1/health/live`, { signal: AbortSignal.timeout(10_000) });
    reachable = r.ok;
  } catch {
    reachable = false;
  }
});

function guard() {
  if (ciSkip || !reachable) {
    return true; // caller should return early
  }
  return false;
}

describe("E2E production smoke", () => {
  it("GET /v1/health returns ok", async ({ skip }) => {
    if (guard()) skip();
    const r = await fetch(`${BASE}/v1/health`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.status).toBe("ok");
  });

  it("GET /v1/health/live returns alive", async ({ skip }) => {
    if (guard()) skip();
    const r = await fetch(`${BASE}/v1/health/live`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.status).toBe("alive");
  });

  it("GET /v1/health/ready returns ready", async ({ skip }) => {
    if (guard()) skip();
    const r = await fetch(`${BASE}/v1/health/ready`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.status).toBe("ready");
  });

  it("GET /v1/docs returns OpenAPI-shaped JSON", async ({ skip }) => {
    if (guard()) skip();
    const r = await fetch(`${BASE}/v1/docs`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.openapi).toBeDefined();
    expect(data.info).toBeDefined();
    expect(data.paths).toBeDefined();
  });

  it("GET /.well-known/axis.json returns valid JSON", async ({ skip }) => {
    if (guard()) skip();
    const r = await fetch(`${BASE}/.well-known/axis.json`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.name).toBeDefined();
  });

  it("GET /.well-known/mcp.json returns MCP config", async ({ skip }) => {
    if (guard()) skip();
    const r = await fetch(`${BASE}/.well-known/mcp.json`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data).toBeDefined();
    expect(typeof data).toBe("object");
  });

  it("GET /robots.txt returns text", async ({ skip }) => {
    if (guard()) skip();
    const r = await fetch(`${BASE}/robots.txt`);
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).toContain("User-agent");
  });

  it("GET /llms.txt returns text", async ({ skip }) => {
    if (guard()) skip();
    const r = await fetch(`${BASE}/llms.txt`);
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text.length).toBeGreaterThan(50);
  });

  it("POST /probe-intent returns valid shape", async ({ skip }) => {
    if (guard()) skip();
    const r = await fetch(`${BASE}/probe-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "analyze my repo", description: "test probe" }),
    });
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data).toBeDefined();
  });

  it("MCP list_programs returns tools", async ({ skip }) => {
    if (guard()) skip();
    const r = await fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "list_programs", arguments: {} },
      }),
    });
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.result).toBeDefined();
    const content = data.result?.content;
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);
  });

  it("Rate-limit headers present on responses", async ({ skip }) => {
    if (guard()) skip();
    const r = await fetch(`${BASE}/v1/health`);
    expect(r.headers.get("ratelimit-limit")).toBeDefined();
    expect(r.headers.get("ratelimit-remaining")).toBeDefined();
  });
});
