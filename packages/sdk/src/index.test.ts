/**
 * Tests for @axis/sdk — AxisClient (eq_197)
 *
 * Mocks globalThis.fetch to validate:
 * - Correct URL construction and method usage
 * - Authorization header injection
 * - Request body serialization
 * - Response parsing and error handling
 * - Timeout configuration
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AxisClient } from "./index.js";

// ─── Mock fetch ──────────────────────────────────────────────────

function mockFetch(status: number, body: unknown, opts?: { headers?: Record<string, string> }) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Map(Object.entries(opts?.headers ?? {})),
  });
  globalThis.fetch = fn as unknown as typeof globalThis.fetch;
  return fn;
}

function mockMcpResponse(text: string, isError = false) {
  return {
    result: {
      content: [{ type: "text", text }],
      isError,
    },
  };
}

// ─── Constructor ─────────────────────────────────────────────────

describe("AxisClient constructor", () => {
  it("uses production base URL by default", () => {
    const client = new AxisClient();
    const f = mockFetch(200, { status: "ok" });
    client.health();
    expect(f).toHaveBeenCalledWith(
      expect.stringContaining("axis-api-6c7z.onrender.com"),
      expect.anything(),
    );
  });

  it("accepts custom base URL", () => {
    const client = new AxisClient({ baseUrl: "http://localhost:4000" });
    const f = mockFetch(200, { status: "ok" });
    client.health();
    expect(f).toHaveBeenCalledWith(
      expect.stringContaining("http://localhost:4000"),
      expect.anything(),
    );
  });

  it("strips trailing slash from base URL", () => {
    const client = new AxisClient({ baseUrl: "http://localhost:4000/" });
    const f = mockFetch(200, { status: "ok" });
    client.health();
    expect(f).toHaveBeenCalledWith(
      "http://localhost:4000/v1/health",
      expect.anything(),
    );
  });
});

// ─── Health endpoints ────────────────────────────────────────────

describe("health endpoints", () => {
  let client: AxisClient;

  beforeEach(() => {
    client = new AxisClient({ baseUrl: "http://test:4000", apiKey: "ax_test" });
  });

  it("health() calls GET /v1/health", async () => {
    const f = mockFetch(200, { status: "healthy", version: "0.5.1" });
    const res = await client.health();
    expect(f).toHaveBeenCalledWith("http://test:4000/v1/health", expect.objectContaining({ method: "GET" }));
    expect(res.status).toBe("healthy");
  });

  it("healthLive() calls GET /v1/health/live", async () => {
    const f = mockFetch(200, { status: "alive" });
    await client.healthLive();
    expect(f).toHaveBeenCalledWith("http://test:4000/v1/health/live", expect.objectContaining({ method: "GET" }));
  });

  it("healthReady() calls GET /v1/health/ready", async () => {
    const f = mockFetch(200, { status: "ready" });
    await client.healthReady();
    expect(f).toHaveBeenCalledWith("http://test:4000/v1/health/ready", expect.objectContaining({ method: "GET" }));
  });
});

// ─── Authorization ───────────────────────────────────────────────

describe("authorization", () => {
  it("sends Bearer token when apiKey is set", async () => {
    const client = new AxisClient({ baseUrl: "http://test:4000", apiKey: "ax_secret" });
    const f = mockFetch(200, { status: "ok" });
    await client.health();
    const callArgs = f.mock.calls[0][1] as RequestInit;
    expect((callArgs.headers as Record<string, string>)["Authorization"]).toBe("Bearer ax_secret");
  });

  it("omits Authorization header when no apiKey", async () => {
    const client = new AxisClient({ baseUrl: "http://test:4000" });
    const f = mockFetch(200, { status: "ok" });
    await client.health();
    const callArgs = f.mock.calls[0][1] as RequestInit;
    expect((callArgs.headers as Record<string, string>)["Authorization"]).toBeUndefined();
  });
});

// ─── Error handling ──────────────────────────────────────────────

describe("error handling", () => {
  let client: AxisClient;

  beforeEach(() => {
    client = new AxisClient({ baseUrl: "http://test:4000", apiKey: "ax_test" });
  });

  it("throws on non-ok HTTP response with error field", async () => {
    mockFetch(401, { error: "Invalid API key" });
    await expect(client.health()).rejects.toThrow("Invalid API key");
  });

  it("throws on non-ok HTTP response with message field", async () => {
    mockFetch(429, { message: "Rate limit exceeded" });
    await expect(client.health()).rejects.toThrow("Rate limit exceeded");
  });

  it("throws generic HTTP status on non-JSON error", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
      text: () => Promise.resolve("internal error"),
    });
    globalThis.fetch = fn as unknown as typeof globalThis.fetch;
    await expect(client.health()).rejects.toThrow("HTTP 500");
  });
});

// ─── MCP-based methods ──────────────────────────────────────────

describe("MCP-based methods", () => {
  let client: AxisClient;

  beforeEach(() => {
    client = new AxisClient({ baseUrl: "http://test:4000", apiKey: "ax_test" });
  });

  it("analyzeFiles sends MCP tools/call with analyze_files", async () => {
    const snapshot = { snapshot_id: "snap_1", project_id: "proj_1", status: "complete", artifact_count: 86, artifacts: [], programs_executed: [] };
    const f = mockFetch(200, mockMcpResponse(JSON.stringify(snapshot)));
    const res = await client.analyzeFiles({
      project_name: "test",
      project_type: "web",
      frameworks: ["react"],
      goals: [],
      files: [{ path: "index.ts", content: "export {};" }],
    });
    expect(res.snapshot_id).toBe("snap_1");
    const body = JSON.parse(f.mock.calls[0][1].body as string);
    expect(body.method).toBe("tools/call");
    expect(body.params.name).toBe("analyze_files");
  });

  it("analyzeFiles throws on MCP isError response", async () => {
    mockFetch(200, mockMcpResponse("Something went wrong", true));
    await expect(
      client.analyzeFiles({ project_name: "t", project_type: "web", frameworks: [], goals: [], files: [] }),
    ).rejects.toThrow("Something went wrong");
  });

  it("analyzeRepo sends MCP tools/call with analyze_repo", async () => {
    const snapshot = { snapshot_id: "snap_2", project_id: "proj_2", status: "complete", artifact_count: 86, artifacts: [], programs_executed: [] };
    const f = mockFetch(200, mockMcpResponse(JSON.stringify(snapshot)));
    const res = await client.analyzeRepo({ github_url: "https://github.com/owner/repo" });
    expect(res.snapshot_id).toBe("snap_2");
    const body = JSON.parse(f.mock.calls[0][1].body as string);
    expect(body.params.name).toBe("analyze_repo");
    expect(body.params.arguments.github_url).toBe("https://github.com/owner/repo");
  });

  it("getSnapshot sends MCP tools/call with get_snapshot", async () => {
    mockFetch(200, mockMcpResponse(JSON.stringify({ snapshot_id: "snap_1", files: [] })));
    const res = await client.getSnapshot("snap_1");
    expect(res.snapshot_id).toBe("snap_1");
  });

  it("getArtifact returns text content", async () => {
    mockFetch(200, mockMcpResponse("# AGENTS.md content here"));
    const text = await client.getArtifact("snap_1", "AGENTS.md");
    expect(text).toBe("# AGENTS.md content here");
  });

  it("listPrograms returns text", async () => {
    mockFetch(200, mockMcpResponse("search, debug, skills"));
    const text = await client.listPrograms();
    expect(text).toBe("search, debug, skills");
  });

  it("searchTools passes query", async () => {
    const f = mockFetch(200, mockMcpResponse("results"));
    await client.searchTools("debug");
    const body = JSON.parse(f.mock.calls[0][1].body as string);
    expect(body.params.name).toBe("search_and_discover_tools");
    expect(body.params.arguments.q).toBe("debug");
  });

  it("searchTools works without query", async () => {
    const f = mockFetch(200, mockMcpResponse("all tools"));
    await client.searchTools();
    const body = JSON.parse(f.mock.calls[0][1].body as string);
    expect(body.params.arguments).toEqual({});
  });

  it("discoverCommerceTools sends empty args", async () => {
    const f = mockFetch(200, mockMcpResponse("commerce tools"));
    await client.discoverCommerceTools();
    const body = JSON.parse(f.mock.calls[0][1].body as string);
    expect(body.params.name).toBe("discover_agentic_commerce_tools");
  });
});

// ─── REST-based methods ──────────────────────────────────────────

describe("REST-based methods", () => {
  let client: AxisClient;

  beforeEach(() => {
    client = new AxisClient({ baseUrl: "http://test:4000", apiKey: "ax_test" });
  });

  it("docs() calls GET /v1/docs and returns OpenAPI spec", async () => {
    const spec = { openapi: "3.1.0", info: { title: "AXIS", version: "0.5.1" }, paths: {} };
    const f = mockFetch(200, spec);
    const res = await client.docs();
    expect(f).toHaveBeenCalledWith("http://test:4000/v1/docs", expect.objectContaining({ method: "GET" }));
    expect(res.openapi).toBe("3.1.0");
  });

  it("probeIntent() posts to /probe-intent", async () => {
    const f = mockFetch(200, { recommendations: [] });
    await client.probeIntent("PCI-DSS checkout", ["sca"]);
    const body = JSON.parse(f.mock.calls[0][1].body as string);
    expect(body.description).toBe("PCI-DSS checkout");
    expect(body.focus_areas).toEqual(["sca"]);
  });

  it("probeIntent() works without focusAreas", async () => {
    const f = mockFetch(200, { recommendations: [] });
    await client.probeIntent("debug flaky tests");
    const body = JSON.parse(f.mock.calls[0][1].body as string);
    expect(body.description).toBe("debug flaky tests");
  });
});

// ─── MCP error edge cases ────────────────────────────────────────

describe("MCP error edge cases", () => {
  let client: AxisClient;

  beforeEach(() => {
    client = new AxisClient({ baseUrl: "http://test:4000", apiKey: "ax_test" });
  });

  it("throws on JSON-RPC error response", async () => {
    mockFetch(200, { error: { code: -32600, message: "Invalid request" } });
    await expect(client.listPrograms()).rejects.toThrow("Invalid request");
  });

  it("throws on missing result in MCP response", async () => {
    mockFetch(200, {});
    await expect(client.listPrograms()).rejects.toThrow("Unexpected MCP response");
  });
});
