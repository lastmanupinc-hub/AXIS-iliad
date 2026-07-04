import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateSocialPack, generatePosterLayouts, generateCanvasSpec } from "./generators-canvas.js";

const profile = {} as RepoProfile;
const files: SourceFile[] = [];

function ctxWith(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...over,
  } as ContextMap;
}
const withScore = (n: number) => ctxWith({ architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: n } });

describe("POLISH: separation_score is scaled to a real percent at /100 display sites", () => {
  it("social-pack.md shows 80/100 (not 0.8/100)", () => {
    const c = generateSocialPack(withScore(0.8), files).content;
    expect(c).toContain("80/100");
    expect(c).not.toContain("0.8/100");
  });
  it("poster-layouts.md shows 80/100", () => {
    const c = generatePosterLayouts(withScore(0.8), files).content;
    expect(c).toContain("80/100");
    expect(c).not.toContain("0.8/100");
  });
});

describe("POLISH: canvas-spec.json route_count reports distinct routes", () => {
  it("counts distinct routes (2), not the parser's per-mention rows (3)", () => {
    const routes = [
      { path: "/a", method: "GET", source_file: "src/a.ts", handler: "h" },
      { path: "/a", method: "GET", source_file: "a.test.ts", handler: "h" },
      { path: "/b", method: "POST", source_file: "src/b.ts", handler: "h" },
    ] as ContextMap["routes"];
    const content = generateCanvasSpec(ctxWith({ routes }), profile, files).content;
    JSON.parse(content); // valid JSON
    expect(content).toContain('"route_count": 2');
  });
});
