import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { generateGraphPromptMap } from "./generators-obsidian.js";

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
type Graph = {
  truncated?: Record<string, { shown: number; total: number }>;
  nodes: Array<{ id: string; note_path: string }>;
  edges: Array<{ from: string; to: string; relationship: string }>;
};

// The graph builds two CROSS-LOOP edges — a model's `defines_model` edge points
// back at an entry-point node (a different loop), and a table's `maps_to_table`
// edge points back at a model node. When the referenced loop is truncated, the
// target node id (`ep_45`, `model_65`) is never emitted. POLISH added guards
// (`epIdx < nEntries`, `matchingModelIdx < nModels`); the POLISH test only
// saturates models with source_files that match no entry point, so it never
// exercises either guard. This pins the guards down at every cap boundary.
describe("cross-loop graph edges never dangle when the target loop is truncated (HARDEN-2)", () => {
  // 50 entry points (> 40 cap). A model sourced from entry point #45 (elided).
  // 70 models (> 60 cap). A table named after model #65 (elided).
  const entry_points = Array.from({ length: 50 }, (_, i) => ({ path: `src/e${i}.ts`, type: "app_entry", description: "x" })) as ContextMap["entry_points"];
  const domain_models = Array.from({ length: 70 }, (_, i) => ({
    name: `M${i}`, kind: "interface", field_count: 1,
    // model 0 is sourced from an ELIDED entry point (#45); model 3 from a RENDERED one (#2)
    source_file: i === 0 ? "src/e45.ts" : i === 3 ? "src/e2.ts" : `other/x${i}.ts`,
  })) as ContextMap["domain_models"];
  const sql_schema = [
    { name: "M65", columns: [] },   // matches an ELIDED model (index 65 ≥ 60)
    { name: "M4", columns: [] },    // matches a RENDERED model (index 4 < 60)
  ] as ContextMap["sql_schema"];

  const g = JSON.parse(generateGraphPromptMap(ctxWith({ entry_points, domain_models, sql_schema })).content) as Graph;
  const ids = new Set(g.nodes.map((n) => n.id));

  it("emits no edge whose endpoint was truncated away — the global invariant holds under multi-type saturation", () => {
    for (const e of g.edges) {
      expect(ids.has(e.from), `dangling from: ${e.from} (${e.relationship})`).toBe(true);
      expect(ids.has(e.to), `dangling to: ${e.to} (${e.relationship})`).toBe(true);
    }
  });

  it("drops the defines_model edge into an elided entry point but keeps the one into a rendered entry point", () => {
    const defines = g.edges.filter((e) => e.relationship === "defines_model");
    // ep #45 was elided → its edge is gone; ep #2 survives → model_3 keeps its edge
    expect(defines.some((e) => e.from === "ep_45")).toBe(false);
    expect(defines.some((e) => e.from === "ep_2" && e.to === "model_3")).toBe(true);
  });

  it("drops the maps_to_table edge from an elided model but keeps the one from a rendered model", () => {
    const maps = g.edges.filter((e) => e.relationship === "maps_to_table");
    expect(maps.some((e) => e.from === "model_65")).toBe(false); // model_65 never rendered
    expect(maps.some((e) => e.from === "model_4")).toBe(true);   // model_4 rendered, table M4 matches
  });

  it("discloses every truncated type honestly", () => {
    expect(g.truncated?.entry_points).toEqual({ shown: 40, total: 50 });
    expect(g.truncated?.domain_models).toEqual({ shown: 60, total: 70 });
  });
});
