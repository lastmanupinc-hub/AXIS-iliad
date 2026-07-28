// H8.5 — every route actually registered on the live Router in server.ts must
// appear in the OpenAPI spec (openapi.ts), and vice versa. Ground truth is the
// REAL Router instance (Router.getRoutes(), added for this test), not a regex
// scrape of server.ts's source text — a regex would silently miss routes
// registered any other way in the future; the live router can't drift from
// what actually serves traffic.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { resetTestDb } from "@axis/snapshots";
import { resetRateLimits } from "./rate-limiter.js";
import { buildOpenApiSpec } from "./openapi.js";

const TEST_PORT = 44491;
let appServer: Server & { shutdown?: (t?: number) => Promise<void> };
let routerRoutes: Array<{ method: string; path: string }>;

beforeAll(async () => {
  process.env.PORT = String(TEST_PORT);
  await resetTestDb();
  resetRateLimits();

  const mod = await import("./server.js");
  appServer = mod.app as Server & { shutdown?: (t?: number) => Promise<void> };
  routerRoutes = mod.router.getRoutes();
  await new Promise<void>((r) => setTimeout(r, 200));
}, 300_000);

afterAll(async () => {
  if (appServer?.shutdown) await appServer.shutdown(2000);
  else appServer?.close();
});

// Router path params use `:name` / `:name*` (wildcard); OpenAPI uses `{name}`.
function normalizePath(p: string): string {
  return p.replace(/:(\w+)\*/g, "{$1}").replace(/:(\w+)/g, "{$1}");
}

function key(method: string, path: string): string {
  return `${method} ${path}`;
}

/**
 * Non-REST or pure-alias router registrations intentionally excluded from the
 * OpenAPI spec. Every entry must be justified — this is a waiver list per
 * H8.5's acceptance bar ("any drift found is fixed, not waived"), not a
 * dumping ground. All 12 real gaps found by this unit were fixed in
 * openapi.ts instead of waived; only genuinely non-REST/alias surfaces
 * (matching the spec's own named example, `/mcp` JSON-RPC) are listed here.
 */
const WAIVED_ROUTER_ONLY = new Set<string>([
  // Trailing-slash / version-prefix aliases of the documented GET+POST /mcp
  // JSON-RPC endpoint — same transport, same handler, not a distinct resource.
  key("GET", "/mcp/"),
  key("GET", "/v1/mcp"),
  key("GET", "/v1/mcp/"),
  key("POST", "/mcp/"),
  key("POST", "/v1/mcp"),
  key("POST", "/v1/mcp/"),
  // SSE transport variant of the MCP JSON-RPC endpoint — not a REST resource.
  key("GET", "/mcp/sse"),
  key("POST", "/mcp/sse"),
  // Legacy double-prefix compat alias for MCP JSON-RPC clients that mis-route.
  key("GET", "/mcp/mcp/*"),
  key("POST", "/mcp/mcp/*"),
  key("DELETE", "/mcp/mcp/*"),
  // MCP-prefixed duplicates of the already-documented /.well-known/*.json files —
  // kept for real production traffic (logs showed real 404s on exactly these
  // paths) even though this exact prefix form isn't the RFC 8414/9728 spec form.
  key("GET", "/mcp/.well-known/mcp.json"),
  key("GET", "/mcp/.well-known/mcp"),
  key("GET", "/mcp/.well-known/agent.json"),
  key("GET", "/mcp/.well-known/oauth-authorization-server"),
  key("GET", "/mcp/.well-known/oauth-protected-resource"),
  // The ACTUAL RFC 8414 §3 / RFC 9728 §3.1 path-insertion form (cycle 28 fix):
  // well-known suffix immediately after the host, resource's own path appended
  // after the suffix. Same handlers as the site-root registration above.
  key("GET", "/.well-known/oauth-authorization-server/mcp"),
  key("GET", "/.well-known/oauth-protected-resource/mcp"),
  // Static asset, not a JSON API resource.
  key("GET", "/favicon.ico"),
  // Trailing-slash aliases of the documented /v1/accounts and /accounts.
  key("GET", "/v1/accounts/"),
  key("GET", "/accounts/"),
  // Alternate spellings of the already-documented agent card, MCP server card
  // and llms.txt, added from Render logs (2026-07-28) where one crawler took
  // seven 404s walking discovery paths. Waived rather than documented for the
  // same reason as the /mcp/.well-known/* block above: publishing every
  // misspelling a crawler might try would imply they are distinct resources and
  // invite clients to depend on a spelling we only tolerate. The canonical
  // paths — /.well-known/agent.json, /.well-known/mcp.json, /llms.txt — stay
  // the documented ones.
  key("GET", "/.well-known/agents.json"),
  key("GET", "/.well-known/agent-directory.json"),
  key("GET", "/agent-directory.json"),
  key("GET", "/mcp.json"),
  key("GET", "/.well-known/mcp"),
  key("GET", "/.well-known/mcp/server-card.json"),
  key("GET", "/agents.txt"),
]);

describe("OpenAPI ↔ router bijection (H8.5)", () => {
  it("every non-waived router route has a matching OpenAPI path + method", () => {
    const spec = buildOpenApiSpec();
    const missing: string[] = [];

    for (const r of routerRoutes) {
      const k = key(r.method, normalizePath(r.path));
      if (WAIVED_ROUTER_ONLY.has(k)) continue;

      const pathEntry = (spec.paths as Record<string, Record<string, unknown> | undefined>)[normalizePath(r.path)];
      if (!pathEntry) {
        missing.push(`${k} — path missing from openapi.ts entirely`);
        continue;
      }
      const methodKey = r.method.toLowerCase();
      if (!(methodKey in pathEntry)) {
        missing.push(`${k} — path exists in openapi.ts but not the "${methodKey}" method`);
      }
    }

    expect(missing).toEqual([]);
  });

  it("every OpenAPI path + method corresponds to a real, registered router route", () => {
    const spec = buildOpenApiSpec();
    const routerKeys = new Set(routerRoutes.map((r) => key(r.method, normalizePath(r.path))));
    const stale: string[] = [];

    for (const [path, methods] of Object.entries(spec.paths as Record<string, Record<string, unknown>>)) {
      for (const method of Object.keys(methods)) {
        const k = key(method.toUpperCase(), path);
        if (!routerKeys.has(k)) stale.push(`${k} — documented in openapi.ts but no router registration serves it`);
      }
    }

    expect(stale).toEqual([]);
  });

  it("the waiver list contains no stale entries (every waived route is still actually registered)", () => {
    const routerKeys = new Set(routerRoutes.map((r) => key(r.method, normalizePath(r.path))));
    const stale = [...WAIVED_ROUTER_ONLY].filter((k) => !routerKeys.has(k));
    expect(stale).toEqual([]);
  });
});
