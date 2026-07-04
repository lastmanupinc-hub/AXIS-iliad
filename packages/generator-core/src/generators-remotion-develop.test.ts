import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { deriveScenePlan, generateRenderConfig, generateRemotionScript } from "./generators-remotion.js";

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
// a data-rich ctx that, under the OLD dynamic logic, produced 7 scenes / 630 frames
const rich = ctxWith({
  routes: [{ path: "/a", method: "GET", source_file: "a.ts", handler: "h" }] as ContextMap["routes"],
  domain_models: [{ name: "M", kind: "interface", field_count: 1, source_file: "m.ts" }] as ContextMap["domain_models"],
  dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [{ path: "h.ts", inbound_count: 9, outbound_count: 1, risk_score: 0.9 }] as ContextMap["dependency_graph"]["hotspots"] },
  ai_context: { project_summary: "", key_abstractions: ["Widget"], conventions: [], warnings: [] },
});

describe("DEVELOP: deriveScenePlan is the canonical 4-scene layout", () => {
  it("always yields exactly the 4 composition scenes, 360 frames, 30fps — regardless of ctx richness", () => {
    for (const ctx of [ctxWith(), rich]) {
      const plan = deriveScenePlan(ctx);
      expect(plan.scenes.map((s) => s.id)).toEqual(["intro", "tech-stack", "architecture", "abstractions"]);
      expect(plan.totalFrames).toBe(360);
      expect(plan.fps).toBe(30);
      // contiguous offsets, no gaps/overlaps
      plan.scenes.forEach((s, i) => { expect(s.from).toBe(i * 90); expect(s.durationInFrames).toBe(90); });
    }
  });
});

describe("DEVELOP: render-config.json and the composition agree on the scene layout", () => {
  it("render-config declares exactly the scenes the video renders (was: 7 phantom scenes / 630 frames)", () => {
    const cfg = JSON.parse(generateRenderConfig(rich, profile, files).content) as {
      composition: { durationInFrames: number; fps: number };
      scenes: Array<{ id: string; from: number; duration: number }>;
    };
    expect(cfg.scenes.map((s) => s.id)).toEqual(["intro", "tech-stack", "architecture", "abstractions"]);
    expect(cfg.composition.durationInFrames).toBe(360);
    expect(cfg.composition.fps).toBe(30);
  });

  it("every render-config scene offset+duration matches a <Sequence> the script emits", () => {
    const script = generateRemotionScript(rich, files).content;
    const seqs = [...script.matchAll(/<Sequence from=\{(\d+)\} durationInFrames=\{(\d+)\}>/g)].map((m) => ({ from: Number(m[1]), duration: Number(m[2]) }));
    const cfg = JSON.parse(generateRenderConfig(rich, profile, files).content) as { scenes: Array<{ from: number; duration: number }> };
    expect(seqs).toHaveLength(4);
    expect(seqs).toEqual(cfg.scenes.map((s) => ({ from: s.from, duration: s.duration })));
  });
});
