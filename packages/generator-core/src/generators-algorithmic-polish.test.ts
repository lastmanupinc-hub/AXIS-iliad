import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateParameterPack, generateGenerativeSketch, generateCollectionMap } from "./generators-algorithmic.js";

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

// ─── separation_score is 0–1: this file treated it as 0–100 everywhere ───
describe("POLISH: separation_score (0–1) drives parameters correctly (was: dead everywhere)", () => {
  it("parameter-pack thresholds are LIVE for a high score (0.8): radial/0.5/0.1, edge_density 0.8", () => {
    const p = JSON.parse(generateParameterPack(withScore(0.8), files).content).parameters;
    expect(p.structure.edge_density).toBeCloseTo(0.8); // was Math.min(1, 0.8/100) = 0.008
    expect(p.structure.symmetry).toBe("radial");        // was always "organic" (0.8 > 70 false)
    expect(p.motion.speed).toBe(0.5);                   // was always 1.0
    expect(p.motion.turbulence).toBe(0.1);              // was always 0.3
  });
  it("parameter-pack thresholds distinguish a low score (0.3): organic/1.0/0.3", () => {
    const p = JSON.parse(generateParameterPack(withScore(0.3), files).content).parameters;
    expect(p.structure.symmetry).toBe("organic");
    expect(p.motion.speed).toBe(1.0);
  });
  it("generative-sketch complexity is the real 0–1 score, not score/100 (~0)", () => {
    expect(generateGenerativeSketch(withScore(0.8), files).content).toContain("complexity: 0.80,");
  });
  it("collection-map displays the score as a real percent", () => {
    expect(generateCollectionMap(withScore(0.8), files).content).toContain("Architecture score 80/100");
  });
});

// ─── route dedup ───
describe("POLISH: collection-map route count is deduped", () => {
  it("counts distinct routes (2), not per-mention rows (3)", () => {
    const routes = [
      { path: "/a", method: "GET", source_file: "src/a.ts", handler: "h" },
      { path: "/a", method: "GET", source_file: "a.test.ts", handler: "h" },
      { path: "/b", method: "POST", source_file: "src/b.ts", handler: "h" },
    ] as ContextMap["routes"];
    expect(generateCollectionMap(ctxWith({ routes }), files).content).toContain("| Routes | 2 |");
  });
});

// ─── fileTree misuse fix ───
describe("POLISH: the Source File Tree renders real lines, not per-character gibberish", () => {
  const withFiles: SourceFile[] = [
    { path: "src/index.ts", content: "x", size: 2048 } as SourceFile,
    { path: "src/util.ts", content: "y", size: 1024 } as SourceFile,
  ];
  it("generative-sketch emits real path lines in the // comment tree", () => {
    const c = generateGenerativeSketch(ctxWith(), withFiles).content;
    expect(c).toContain("// src/index.ts");
  });
  it("collection-map emits real path lines in the fenced tree", () => {
    const c = generateCollectionMap(ctxWith(), withFiles).content;
    expect(c).toContain("src/index.ts");
    expect(c).toContain("KB)");
  });
});
