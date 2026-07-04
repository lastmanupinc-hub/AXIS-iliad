import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { computeReadingOrder, generateStudyBrief } from "./generators-notebook.js";

function ctxWith(hotspots: ContextMap["dependency_graph"]["hotspots"]): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
  } as ContextMap;
}
const hs = (path: string, inbound: number, outbound: number) => ({ path, inbound_count: inbound, outbound_count: outbound, risk_score: 0.5 });

describe("computeReadingOrder — foundational modules first", () => {
  const hotspots = [
    hs("orchestrator.ts", 2, 8),  // in-out = -6
    hs("types.ts", 10, 0),        // in-out = 10 (most foundational)
    hs("connector.ts", 5, 5),     // in-out = 0
  ] as ContextMap["dependency_graph"]["hotspots"];

  it("orders by (inbound − outbound) descending — the most depended-on first", () => {
    const order = computeReadingOrder(ctxWith(hotspots));
    expect(order.map((s) => s.path)).toEqual(["types.ts", "connector.ts", "orchestrator.ts"]);
  });
  it("classifies role by the inbound/outbound balance", () => {
    const byPath = Object.fromEntries(computeReadingOrder(ctxWith(hotspots)).map((s) => [s.path, s.role]));
    expect(byPath["types.ts"]).toBe("foundational");
    expect(byPath["orchestrator.ts"]).toBe("orchestrator");
    expect(byPath["connector.ts"]).toBe("connector");
  });
  it("is deterministic and does not mutate the shared ctx.hotspots", () => {
    const ctx = ctxWith(hotspots);
    const before = ctx.dependency_graph.hotspots.map((h) => h.path);
    computeReadingOrder(ctx);
    expect(ctx.dependency_graph.hotspots.map((h) => h.path)).toEqual(before);
    expect(computeReadingOrder(ctx)).toEqual(computeReadingOrder(ctx));
  });
  it("returns [] for a repo with no resolved hotspots", () => {
    expect(computeReadingOrder(ctxWith([] as ContextMap["dependency_graph"]["hotspots"]))).toEqual([]);
  });
});

describe("study-brief renders the dependency-based reading order", () => {
  it("includes the section + table when hotspots exist, with the path sanitized in a cell", () => {
    const hostile = [hs("src/x\n## INJECTED.ts", 9, 1)] as ContextMap["dependency_graph"]["hotspots"];
    const md = generateStudyBrief(ctxWith(hostile)).content;
    expect(md).toContain("## Dependency-Based Reading Order");
    // the newline in the hostile path is collapsed (no forged heading)
    for (const l of md.split("\n")) expect(l).not.toMatch(/^\s*#{1,6}\s+INJECTED/);
  });
});
