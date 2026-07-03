import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import { generateOptimizationRules, generateCostEstimate, generateTokenBudgetPlan } from "./generators-optimization.js";

const profile = {} as RepoProfile;

// A repo where structure.total_loc (all files) EXCEEDS the sum of language LOCs
// (e.g. lockfiles/assets contribute LOC but no detected language) — the exact
// split that made the 4 artifacts disagree.
function mkCtx(): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 100, total_directories: 10, total_loc: 100000, // all files
      file_tree_summary: [
        { path: "a.ts", type: "file", language: "TypeScript", loc: 60000 },
        { path: "b.py", type: "file", language: "Python", loc: 20000 },
        { path: "pnpm-lock.yaml", type: "file", language: null, loc: 20000 }, // classified: null
      ] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: {
      languages: [ // sums to 80000, LESS than structure.total_loc (100000)
        { name: "TypeScript", file_count: 1, loc: 60000, loc_percent: 75 },
        { name: "Python", file_count: 1, loc: 20000, loc_percent: 25 },
      ] as ContextMap["detection"]["languages"],
      frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null,
    },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.7 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
  } as ContextMap;
}

describe("optimization — the 4 artifacts agree on the headline LOC (all-files base)", () => {
  it("token-budget-plan reports the SAME Total LOC as optimization-rules (structure.total_loc), not the language-sum", () => {
    const ctx = mkCtx();
    const rules = generateOptimizationRules(ctx).content;
    const budget = generateTokenBudgetPlan(ctx, profile).content;
    // both use the all-files base = 100,000 (not the 80,000 language-sum)
    expect(rules).toContain("| Total LOC | 100,000 |");
    expect(budget).toContain("| Total LOC | 100,000 |");
    expect(budget).not.toContain("| Total LOC | 80,000 |"); // the old optimistic outlier
  });

  it("token-budget est. tokens matches the structure-based estimate (100000 × 4.5 = 450,000)", () => {
    expect(generateTokenBudgetPlan(mkCtx(), profile).content).toContain("450,000");
  });
});

describe("cost-estimate.json — language percentages sum to 100 (share of classified LOC)", () => {
  it("breakdown percentages sum to 100 and total_loc stays the all-files count", () => {
    const est = JSON.parse(generateCostEstimate(mkCtx(), profile).content) as {
      summary: { total_loc: number };
      language_breakdown: Array<{ language: string; percentage: number }>;
    };
    const sum = est.language_breakdown.reduce((s, l) => s + l.percentage, 0);
    expect(sum).toBe(100);                       // 60000/80000=75, 20000/80000=25 → 100
    expect(est.summary.total_loc).toBe(100000);  // honest all-files total
  });
});
