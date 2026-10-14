// No served response may send anyone to a decommissioned backend (AXIS Launch
// taskgate T34). The API moved from Render to Fly on 2026-08-31 and every
// Render service is suspended ("Service Suspended"), yet until T34 Iliad's own
// discovery documents, MCP server info, OpenAPI spec, sign-up and snapshot
// links all named the Render host. Two guards:
//   1. every parameterless GET route on the REAL router, plus MCP initialize,
//      tools/list and the free discovery tools, is requested and its body
//      checked for any *.onrender.com address;
//   2. the shipped sources and manifests are scanned for one, so a literal in
//      a path this suite cannot reach (a paid tool's output) is caught too.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resetTestDb } from "@axis/snapshots";
import { resetRateLimits } from "./rate-limiter.js";
import { PUBLIC_API_BASE } from "./public-base.js";

const TEST_PORT = 44497;
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
/** Any Render service address: every one of them is suspended. */
const RENDER_HOST = /[a-z0-9-]+\.onrender\.com/i;

let appServer: Server & { shutdown?: (t?: number) => Promise<void> };
let getPaths: string[] = [];

beforeAll(async () => {
  process.env.PORT = String(TEST_PORT);
  await resetTestDb();
  resetRateLimits();
  const mod = await import("./server.js");
  appServer = mod.app as Server & { shutdown?: (t?: number) => Promise<void> };
  if (!appServer.listening) {
    await new Promise<void>((resolve) => appServer.once("listening", () => resolve()));
  }
  getPaths = mod.router
    .getRoutes()
    .filter((r: { method: string; path: string }) => r.method === "GET" && !r.path.includes(":") && !r.path.includes("*"))
    .map((r: { path: string }) => r.path)
    // An SSE stream never ends; it carries no discovery document either.
    .filter((p: string) => p !== "/mcp/sse");
}, 300_000);

afterAll(async () => {
  if (appServer?.shutdown) await appServer.shutdown(2000);
  else appServer?.close();
});

async function getText(path: string): Promise<{ status: number; body: string; location: string }> {
  resetRateLimits();
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
  return { status: res.status, body: await res.text(), location: res.headers.get("location") ?? "" };
}

async function rpc(method: string, params: unknown = {}): Promise<string> {
  resetRateLimits();
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  expect(res.status).toBe(200);
  return res.text();
}

describe("served responses name no Render address", () => {
  it("finds the discovery routes on the real router", () => {
    for (const p of ["/.well-known/axis.json", "/.well-known/mcp.json", "/.well-known/axis-estate.json", "/llms.txt", "/for-agents", "/openapi.json", "/v1/docs", "/v1/mcp/server.json", "/mcp"]) {
      expect(getPaths).toContain(p);
    }
  });

  it("no parameterless GET route serves a *.onrender.com address (body or redirect)", async () => {
    const offenders: string[] = [];
    for (const path of getPaths) {
      const { body, location } = await getText(path);
      if (RENDER_HOST.test(body) || RENDER_HOST.test(location)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  }, 300_000);

  it("MCP initialize, tools/list and the free discovery tools name no Render address", async () => {
    const bodies = [await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t34", version: "1" } }), await rpc("tools/list")];
    for (const name of ["get_install_manifest", "discover_estate_tools", "list_programs", "improve_my_agent_with_axis", "discover_agentic_purchasing_needs", "search_and_discover_tools"]) {
      bodies.push(await rpc("tools/call", { name, arguments: {} }));
    }
    const offenders = bodies.filter((b) => RENDER_HOST.test(b)).map((b) => b.slice(0, 80));
    expect(offenders).toEqual([]);
  }, 120_000);

  it("the OpenAPI spec's first server is the public API base", async () => {
    for (const path of ["/openapi.json", "/v1/docs"]) {
      const spec = JSON.parse((await getText(path)).body) as { servers: Array<{ url: string }> };
      expect(spec.servers[0].url).toBe(PUBLIC_API_BASE);
    }
  });

  it("MCP server info, the estate manifest and the install manifest point at the public API base", async () => {
    const server = JSON.parse((await getText("/v1/mcp/server.json")).body) as { server: { endpoint: string } };
    expect(server.server.endpoint).toBe(`${PUBLIC_API_BASE}/v1/mcp`);
    const estate = JSON.parse((await getText("/.well-known/axis-estate.json")).body) as { this_property: { api_base: string; mcp: { url: string } } };
    expect(estate.this_property.api_base).toBe(PUBLIC_API_BASE);
    expect(estate.this_property.mcp.url).toBe(`${PUBLIC_API_BASE}/mcp`);
    expect((await getText("/llms.txt")).body).toContain(`${PUBLIC_API_BASE}/mcp`);
  });
});

// ─── Shipped sources and manifests ──────────────────────────────

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else out.push(abs);
  }
}

describe("shipped sources and manifests name no Render address", () => {
  it("no non-test source under apps/ or packages/, and no manifest or post script, carries one", () => {
    const files: string[] = [];
    for (const d of ["apps/api/src", "apps/cli/src", "apps/web/src", "apps/web/public"]) walk(join(ROOT, d), files);
    for (const pkg of readdirSync(join(ROOT, "packages"))) walk(join(ROOT, "packages", pkg, "src"), files);
    walk(join(ROOT, ".github", "actions"), files);
    walk(join(ROOT, "scripts"), files);
    for (const f of ["server.json", "package.json", "generated-posts.json", ".github/app-manifest.json", "apps/web/index.html"]) files.push(join(ROOT, f));
    const offenders = files
      .filter((f) => !/\.test\.tsx?$/.test(f) && existsSync(f))
      .filter((f) => RENDER_HOST.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(ROOT.length + 1).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });
});
