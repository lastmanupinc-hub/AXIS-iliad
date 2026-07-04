import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  generateAgentPurchasingPlaybook,
  generateCommerceRegistry,
} from "./generators-agentic-purchasing.js";

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
const profile = { health: { separation_score: 0.5 } } as RepoProfile;

// ─── providerList reports PER-PROVIDER file counts, not the global total ───
describe("POLISH: playbook provider list uses per-provider counts (was: global total for every provider)", () => {
  const files: SourceFile[] = [
    { path: "a.ts", content: "stripe checkout", size: 20 } as SourceFile,
    { path: "b.ts", content: "stripe payment", size: 20 } as SourceFile,
    { path: "c.ts", content: "stripe refund", size: 20 } as SourceFile,
    { path: "d.ts", content: "paypal cart", size: 20 } as SourceFile,
  ];
  // stripe → 3 files, paypal → 1 file, global total_payment_files → 4.
  it("shows stripe in 3 files and paypal in 1 file, not the global 4 for both", () => {
    const c = generateAgentPurchasingPlaybook(ctxWith(), profile, files).content;
    expect(c).toContain("**stripe** detected in 3 files");
    expect(c).toContain("**paypal** detected in 1 file"); // singular, and per-provider
    expect(c).not.toContain("**stripe** detected in 4 files"); // the old global-total bug
    expect(c).not.toContain("**paypal** detected in 4 file"); // never the global total
  });
});

// ─── readiness interpretation is honest signal-coverage language ───
describe("POLISH: commerce-registry interpretation is signal-coverage, not a 'production-ready' claim", () => {
  const fullSignals: SourceFile[] = [
    { path: "pay.ts", content: "stripe checkout subscription mandate-id 3ds sca dispute chargeback webhook network-token dpan tap-protocol", size: 130 } as SourceFile,
  ];
  it("a keyword-complete repo reads 'strong-signal-coverage', never 'production-ready'", () => {
    const c = generateCommerceRegistry(ctxWith(), profile, fullSignals).content;
    expect(c).toContain('"interpretation": "strong-signal-coverage"');
    expect(c).not.toContain("production-ready");
  });
  it("a repo with no payment signals reads 'minimal-signal-coverage'", () => {
    const c = generateCommerceRegistry(ctxWith(), profile, []).content;
    expect(c).toContain('"interpretation": "minimal-signal-coverage"');
  });
});
