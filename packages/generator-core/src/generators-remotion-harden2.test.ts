import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateScenePlan } from "./generators-remotion.js";

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

// #4 — scene-plan's breakdown must not contradict its own "Total Scenes: 4" or
// the 4-scene composition. Previously a conditional "### Scene 5: Domain Models"
// (0:12–0:15) appeared when models existed, contradicting both.
describe("HARDEN-2/POLISH-2: scene-plan describes exactly the 4 composition scenes", () => {
  it("has no phantom Scene 5 even when domain models exist", () => {
    const models = [{ name: "User", kind: "interface", field_count: 5, source_file: "u.ts" }] as ContextMap["domain_models"];
    const c = generateScenePlan(ctxWith({ domain_models: models }), files).content;
    expect(c).toContain("| Total Scenes | 4 |");
    expect(c).toContain("### Scene 4: Key Abstractions");
    expect(c).not.toContain("### Scene 5");
    expect(c).not.toContain("Domain Models (0:12");
  });
});
