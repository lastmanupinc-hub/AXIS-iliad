import { describe, it, expect } from "vitest";
import { parse } from "yaml";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  generateConnectorMap,
  generateServerManifest,
  generateMcpConfig,
  generateCapabilityRegistry,
  generateFintechMcpSurfacePackage,
} from "./generators-mcp.js";

const profile = {} as RepoProfile;
const files: SourceFile[] = [];

function ctxWith(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...over,
  } as ContextMap;
}

// ─── route dedup (wire displayRoutes) ───────────────────────────
describe("POLISH: routes are deduped before rendering + counting", () => {
  // The parser emits one row per file that mentions a route, so the same
  // METHOD PATH recurs. displayRoutes collapses to distinct real routes.
  const routes = [
    { path: "/a", method: "GET", source_file: "src/a.ts", handler: "h" },
    { path: "/a", method: "GET", source_file: "src/b.ts", handler: "h" }, // duplicate
    { path: "/a", method: "GET", source_file: "a.test.ts", handler: "h" }, // noise dup
    { path: "/b", method: "POST", source_file: "src/c.ts", handler: "h" },
  ] as ContextMap["routes"];

  it("connector-map.yaml renders each distinct route once (no duplicate tool rows)", () => {
    const y = parse(generateConnectorMap(ctxWith({ routes }), files).content) as { tools: Array<{ method: string; path: string }> };
    expect(y.tools).toHaveLength(2);
    const keys = y.tools.map((t) => `${t.method} ${t.path}`);
    expect(new Set(keys).size).toBe(2);
    expect(keys).toContain("GET /a");
    expect(keys).toContain("POST /b");
  });

  it("server-manifest.yaml list_routes count reports DISTINCT routes, not raw mention rows", () => {
    const content = generateServerManifest(ctxWith({ routes }), profile, files).content;
    expect(content).toContain("List all 2 detected routes"); // 2 distinct, not 4 rows
  });
});

// ─── #1 mcp-config cap unification (no dangling resource_uri) ────
describe("POLISH: mcp-config.json domain_models never reference an un-emitted resource", () => {
  it("every domain_models[].resource_uri resolves to a resource in resources[]", () => {
    const models = Array.from({ length: 20 }, (_, i) => ({ name: `Model${i}`, kind: "interface", field_count: 2, source_file: `src/m${i}.ts` })) as ContextMap["domain_models"];
    const cfg = JSON.parse(generateMcpConfig(ctxWith({ domain_models: models }), profile, files).content) as {
      resources: Array<{ uri: string }>;
      domain_models: Array<{ resource_uri: string }>;
    };
    const resourceUris = new Set(cfg.resources.filter((r) => r.uri.startsWith("model://")).map((r) => r.uri));
    expect(cfg.domain_models.length).toBeLessThanOrEqual(15);
    for (const m of cfg.domain_models) expect(resourceUris.has(m.resource_uri), `dangling: ${m.resource_uri}`).toBe(true);
  });
});

// ─── #4 server-manifest empty dependencies → [] not null ────────
describe("POLISH: server-manifest.yaml emits a valid empty list, not a childless null key", () => {
  it("dependencies is [] (an array) when the repo has no external dependencies", () => {
    const y = parse(generateServerManifest(ctxWith({ dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] } }), profile, files).content) as { server: { dependencies: unknown } };
    expect(Array.isArray(y.server.dependencies)).toBe(true);
    expect(y.server.dependencies).toHaveLength(0);
  });
});

// ─── #2 capability-registry honesty (no fabricated npm toolchain) ───
describe("POLISH: capability-registry does not assert an npm toolchain for non-JS repos", () => {
  function caps(pkgManagers: string[], buildTools: string[] = []) {
    const reg = JSON.parse(generateCapabilityRegistry(ctxWith({ detection: { languages: [], frameworks: [], build_tools: buildTools, test_frameworks: [], package_managers: pkgManagers, ci_platform: null, deployment_target: null } }), files).content) as { capabilities: Array<{ id: string; available: boolean }> };
    return Object.fromEntries(reg.capabilities.map((c) => [c.id, c.available]));
  }
  it("build/dev/install are available:false for a Python repo (pkgManagers=[pip])", () => {
    const c = caps(["pip"]);
    expect(c.build).toBe(false);
    expect(c.dev).toBe(false);
    expect(c.install).toBe(false);
  });
  it("build/dev/install stay available:true when a JS package manager is detected", () => {
    const c = caps(["pnpm"]);
    expect(c.build).toBe(true);
    expect(c.dev).toBe(true);
    expect(c.install).toBe(true);
  });
});

// ─── #3 fintech hint detection: no bare-substring false positives ───
describe("POLISH: fintech hints don't false-positive on generic dependency names", () => {
  function hints(names: string[]) {
    const deps = names.map((name) => ({ name, version: "1.0.0" })) as ContextMap["dependency_graph"]["external_dependencies"];
    return generateFintechMcpSurfacePackage(ctxWith({ dependency_graph: { external_dependencies: deps, internal_imports: [], hotspots: [] } }), profile, files).content;
  }
  it("a unit-test / cart-checkout / aws-treasury dependency is NOT flagged fintech", () => {
    expect(hints(["unit-test-runner", "checkout-cart", "aws-treasury"])).toContain("none directly detected");
  });
  it("a real payment SDK IS still flagged", () => {
    expect(hints(["stripe"])).toContain("stripe");
  });
});
