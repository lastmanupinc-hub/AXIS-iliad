import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateScenePlan, generateRemotionScript, generateRenderConfig } from "./generators-remotion.js";

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

// ─── separation_score is a 0–1 fraction: scale it for the /100 displays ───
describe("POLISH: separation_score is scaled to a real percent at display sites", () => {
  it("scene-plan.md shows 80/100 (not 0.8/100) and '80 out of 100'", () => {
    const c = generateScenePlan(withScore(0.8), files).content;
    expect(c).toContain("**Separation Score**: 80/100");
    expect(c).toContain("scores 80 out of 100");
    expect(c).not.toContain("0.8/100");
    expect(c).not.toContain("0.8 out of 100");
  });
  it("remotion-script.ts bakes the scaled score into the video (const score = 80)", () => {
    expect(generateRemotionScript(withScore(0.8), files).content).toContain("const score = 80;");
  });
  it("render-config.json keeps the raw 0–1 metric value (not scaled)", () => {
    const cfg = JSON.parse(generateRenderConfig(withScore(0.8), profile, files).content) as { scene_data: { architecture: { separation_score: number } } };
    expect(cfg.scene_data.architecture.separation_score).toBe(0.8);
  });
});

// ─── route counts are deduped in render-config ──────────────────
describe("POLISH: render-config route counts report distinct routes", () => {
  const routes = [
    { path: "/a", method: "GET", source_file: "src/a.ts", handler: "h" },
    { path: "/a", method: "GET", source_file: "a.test.ts", handler: "h" },
    { path: "/b", method: "POST", source_file: "src/b.ts", handler: "h" },
  ] as ContextMap["routes"];
  it("total_routes + the API Surface scene label count distinct routes (2, not 3 rows)", () => {
    const cfg = JSON.parse(generateRenderConfig(ctxWith({ routes }), profile, files).content) as {
      scene_data: { api_surface: { total_routes: number } };
      scenes: Array<{ label: string }>;
    };
    expect(cfg.scene_data.api_surface.total_routes).toBe(2);
    expect(cfg.scenes.some((sc) => sc.label === "API Surface (2 routes)")).toBe(true);
  });
});
