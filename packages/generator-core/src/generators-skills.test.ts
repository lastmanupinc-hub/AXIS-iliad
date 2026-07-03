import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { generateAgentsMD, generateClaudeMD, dedupeRoutes } from "./generators-skills.js";

// Functional/quality coverage for the skills generators (POLISH, Program 2).
// Grounded in dogfooding the generators against the Iliad repo itself.

function mkCtx(o: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0",
    snapshot_id: "s",
    project_id: "p",
    generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "acme", type: "monorepo", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 50, total_directories: 10, total_loc: 5000, file_tree_summary: [], top_level_layout: [] },
    detection: { languages: ["TypeScript"], frameworks: [{ name: "React", version: "19.0.0" }] as ContextMap["detection"]["frameworks"], build_tools: ["vite"], test_frameworks: ["vitest"], package_managers: ["pnpm"], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [],
    routes: [],
    domain_models: [],
    sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...o,
  } as ContextMap;
}

describe("generateAgentsMD — route deduplication (POLISH)", () => {
  it("collapses duplicate method+path routes into a single line", () => {
    const ctx = mkCtx({
      routes: [
        { method: "POST", path: "/purchase", source_file: "apps/api/src/commerce.ts" },
        { method: "POST", path: "/purchase", source_file: "apps/api/src/commerce.ts" },
        { method: "GET", path: "/health", source_file: "apps/api/src/server.ts" },
      ] as ContextMap["routes"],
    });
    const out = generateAgentsMD(ctx).content;
    const purchaseLines = out.split("\n").filter((l) => l.includes("`POST /purchase`"));
    expect(purchaseLines.length).toBe(1);
  });

  it("prefers a non-test source file when the same route appears in both", () => {
    const ctx = mkCtx({
      routes: [
        { method: "GET", path: "/x", source_file: "apps/api/src/server.test.ts" },
        { method: "GET", path: "/x", source_file: "apps/api/src/server.ts" },
      ] as ContextMap["routes"],
    });
    const out = generateAgentsMD(ctx).content;
    const line = out.split("\n").find((l) => l.includes("`GET /x`"));
    expect(line).toContain("apps/api/src/server.ts");
    expect(line).not.toContain(".test.");
  });

  it("keeps a route that only exists in a test file (no non-test alternative)", () => {
    const ctx = mkCtx({
      routes: [{ method: "GET", path: "/only", source_file: "x.test.ts" }] as ContextMap["routes"],
    });
    const out = generateAgentsMD(ctx).content;
    expect(out).toContain("`GET /only`");
  });

  it("caps the displayed routes at 50 DISTINCT routes and notes the remainder", () => {
    const routes = Array.from({ length: 60 }, (_, i) => ({ method: "GET", path: `/r${i}`, source_file: "s.ts" }));
    const ctx = mkCtx({ routes: routes as ContextMap["routes"] });
    const out = generateAgentsMD(ctx).content;
    const shown = out.split("\n").filter((l) => /^- `GET \/r\d+`/.test(l)).length;
    expect(shown).toBe(50);
    expect(out).toMatch(/…\s*10 more/);
  });
});

describe("dedupeRoutes (shared helper, DEVELOP)", () => {
  it("collapses duplicates by method+path and preserves first-seen order", () => {
    const r = dedupeRoutes([
      { method: "GET", path: "/a", source_file: "s.ts" },
      { method: "POST", path: "/a", source_file: "s.ts" },
      { method: "GET", path: "/a", source_file: "s.ts" },
    ] as ContextMap["routes"]);
    expect(r.map((x) => `${x.method} ${x.path}`)).toEqual(["GET /a", "POST /a"]);
  });

  it("upgrades a test-file attribution to a non-test source for the same route", () => {
    const r = dedupeRoutes([
      { method: "GET", path: "/a", source_file: "a.test.ts" },
      { method: "GET", path: "/a", source_file: "a.ts" },
    ] as ContextMap["routes"]);
    expect(r).toHaveLength(1);
    expect(r[0]!.source_file).toBe("a.ts");
  });

  it("is a pure identity-preserving no-op on already-unique input", () => {
    const input = [
      { method: "GET", path: "/a", source_file: "s.ts" },
      { method: "GET", path: "/b", source_file: "s.ts" },
    ] as ContextMap["routes"];
    expect(dedupeRoutes(input)).toEqual(input);
  });
});

describe("generateClaudeMD — API Surface section (DEVELOP)", () => {
  it("emits a deduped API Surface section when routes exist", () => {
    const ctx = mkCtx({
      routes: [
        { method: "POST", path: "/purchase", source_file: "commerce.ts" },
        { method: "POST", path: "/purchase", source_file: "commerce.ts" },
        { method: "GET", path: "/health", source_file: "server.ts" },
      ] as ContextMap["routes"],
    });
    const out = generateClaudeMD(ctx).content;
    expect(out).toContain("## API Surface");
    expect(out.split("\n").filter((l) => l.includes("`POST /purchase`"))).toHaveLength(1);
    expect(out).toContain("`GET /health`");
  });

  it("omits the API Surface section entirely when there are no routes", () => {
    const out = generateClaudeMD(mkCtx({ routes: [] as ContextMap["routes"] })).content;
    expect(out).not.toContain("## API Surface");
  });

  it("caps the API Surface at 40 distinct routes and notes the remainder", () => {
    const routes = Array.from({ length: 55 }, (_, i) => ({ method: "GET", path: `/r${i}`, source_file: "s.ts" }));
    const out = generateClaudeMD(mkCtx({ routes: routes as ContextMap["routes"] })).content;
    const shown = out.split("\n").filter((l) => /^- `GET \/r\d+`/.test(l)).length;
    expect(shown).toBe(40);
    expect(out).toMatch(/…\s*15 more/);
  });
});

describe("generateClaudeMD — honest language rules (POLISH)", () => {
  it("emits the TypeScript-strict Do-NOT for a TypeScript project", () => {
    const out = generateClaudeMD(mkCtx({ project_identity: { name: "a", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null } })).content;
    expect(out).toContain("Do not bypass TypeScript strict mode");
  });

  it("does NOT emit the TypeScript-strict Do-NOT for a non-TypeScript project", () => {
    for (const lang of ["Python", "Rust", "Go", "Ruby", "JSON"]) {
      const out = generateClaudeMD(mkCtx({ project_identity: { name: "a", type: "app", primary_language: lang, description: null, repo_url: null, go_module: null } })).content;
      expect(out, `lang=${lang}`).not.toContain("Do not bypass TypeScript strict mode");
    }
  });
});
