import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateArtifactSpec, generateDesignDoc, generatePrd, generateTasksMd, generateContextMd } from "./generators-artifacts.js";

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
const withScore = (score: number) => ctxWith({ architecture_signals: { patterns_detected: ["layered"], layer_boundaries: [{ layer: "api", directories: ["apps/api"] }], separation_score: score } as ContextMap["architecture_signals"] });

// ─── separation_score is a 0–1 fraction: display as a real percent, thresholds on the 0–1 axis ───
describe("POLISH: separation_score is scaled + thresholded correctly (0–1 engine value)", () => {
  it("design.md scales the score to a percent and labels a HIGH score well-separated (was dead: 0.8 read 'low')", () => {
    const c = generateDesignDoc(withScore(0.8), profile, files).content;
    expect(c).toContain("**Separation score**: 80/100");
    expect(c).toContain("well-separated");
    expect(c).not.toContain("0.8/100");
    expect(c).not.toContain("low separation");
  });
  it("design.md labels a mid score moderate and a low score low", () => {
    expect(generateDesignDoc(withScore(0.5), profile, files).content).toContain("50/100 — moderate separation");
    expect(generateDesignDoc(withScore(0.3), profile, files).content).toContain("30/100 — low separation");
  });
  it("artifact-spec.md shows the architecture score as a real percent, not the bare fraction", () => {
    const c = generateArtifactSpec(withScore(0.8), profile, files).content;
    expect(c).toContain("**Architecture score**: 80/100");
    expect(c).not.toContain("0.8/100");
  });
});

// ─── routes are deduped: distinct count, not the parser's per-mention rows ───
describe("POLISH: route counts report distinct routes, not inflated per-mention rows", () => {
  // 3 rows collapse to 2 distinct (GET /a ×2 incl. a test mention, POST /b).
  const routes = [
    { path: "/a", method: "GET", source_file: "src/a.ts", handler: "h" },
    { path: "/a", method: "GET", source_file: "a.test.ts", handler: "h" },
    { path: "/b", method: "POST", source_file: "src/b.ts", handler: "h" },
  ] as ContextMap["routes"];

  it("prd.md counts distinct endpoints", () => {
    expect(generatePrd(ctxWith({ routes }), profile, files).content).toContain("Deliver 2 HTTP endpoints");
  });
  it("design.md counts distinct routes", () => {
    expect(generateDesignDoc(ctxWith({ routes }), profile, files).content).toContain("2 HTTP routes and fan out");
  });
  it("tasks.md + context.md count distinct routes", () => {
    expect(generateTasksMd(ctxWith({ routes }), profile, files).content).toContain("2 HTTP routes registered");
    expect(generateContextMd(ctxWith({ routes }), profile, files).content).toContain("2 HTTP routes registered");
  });
});
