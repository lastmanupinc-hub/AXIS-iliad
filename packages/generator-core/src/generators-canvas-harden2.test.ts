import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateSocialPack, generatePosterLayouts } from "./generators-canvas.js";

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
const withDesc = (d: string | null) => ctxWith({ project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: d, repo_url: null, go_module: null } });

// #2 — the OG box only shows an ellipsis when the description was truncated
describe("HARDEN-2/POLISH-2: OG box ellipsis is conditional on real truncation", () => {
  it("no ellipsis for an empty or short description", () => {
    // the OG box previously appended "..." unconditionally → false truncation.
    expect(generateSocialPack(withDesc(null), files).content).not.toContain("…");
    expect(generateSocialPack(withDesc("A tiny CLI tool"), files).content).not.toContain("…");
  });
  it("shows an ellipsis when the description exceeds 50 chars", () => {
    const long = generateSocialPack(withDesc("x".repeat(80)), files).content;
    expect(long).toContain("…");
  });
});

// #3 — no bold label / heading with no body under it
describe("HARDEN-2/POLISH-2: poster omits empty-state labels", () => {
  it("no **Framework Badges** / **Language Breakdown** when frameworks + languages are empty", () => {
    const c = generatePosterLayouts(ctxWith(), files).content;
    expect(c).not.toContain("**Framework Badges**");
    expect(c).not.toContain("**Language Breakdown**");
  });
  it("still emits the labels when the data exists", () => {
    const c = generatePosterLayouts(ctxWith({
      detection: { languages: [{ name: "TypeScript", file_count: 5, loc: 100, loc_percent: 90 }] as ContextMap["detection"]["languages"], frameworks: [{ name: "React", version: "19", confidence: 0.9, evidence: [] }] as ContextMap["detection"]["frameworks"], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
    }), files).content;
    expect(c).toContain("**Framework Badges**");
    expect(c).toContain("**Language Breakdown**");
  });
});
