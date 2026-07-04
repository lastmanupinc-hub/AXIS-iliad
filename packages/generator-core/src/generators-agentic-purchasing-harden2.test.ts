import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateAgentPurchasingPlaybook, generateCommerceRegistry } from "./generators-agentic-purchasing.js";

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

// #POLISH-2: liability risk cannot be verdicted by a keyword scan, and "more
// payment keywords → lower risk" is an unfounded inference. The field must emit
// an action, not a fabricated low/moderate/high grade — identical regardless of
// how many signals were found.
describe("POLISH-2: liability_risk.risk_level is an action, not a keyword-derived verdict", () => {
  const full: SourceFile[] = [{ path: "pay.ts", content: "stripe checkout subscription mandate-id 3ds sca dispute webhook network-token dpan tap-protocol", size: 120 } as SourceFile];
  it("never emits a low/moderate/high verdict", () => {
    const c = generateCommerceRegistry(ctxWith(), profile, full).content;
    const reg = JSON.parse(c);
    expect(reg.liability_risk.risk_level).toBe("assess-with-acquirer");
    expect(["low", "moderate", "high"]).not.toContain(reg.liability_risk.risk_level);
  });
  it("is identical for a keyword-complete repo and a bare repo (not signal-derived)", () => {
    const hi = JSON.parse(generateCommerceRegistry(ctxWith(), profile, full).content).liability_risk.risk_level;
    const lo = JSON.parse(generateCommerceRegistry(ctxWith(), profile, []).content).liability_risk.risk_level;
    expect(hi).toBe(lo);
  });
});

// #POLISH-2: the AP2 table's tokenization cell must not print a file count —
// ev.files counts provider-matching files, not tokenization matches, so a count
// there overstates the tokenization footprint.
describe("POLISH-2: AP2 tokenization cell reports detection without a misleading file count", () => {
  const files: SourceFile[] = [
    { path: "a.ts", content: "stripe network-token dpan", size: 30 } as SourceFile,
    { path: "b.ts", content: "stripe payment", size: 20 } as SourceFile,
    { path: "c.ts", content: "stripe refund", size: 20 } as SourceFile,
  ];
  it("never renders 'detected in repo (N files)' in any cell", () => {
    const c = generateAgentPurchasingPlaybook(ctxWith(), profile, files).content;
    expect(c).toContain("detected in repo"); // tokenization still reported
    expect(c).not.toMatch(/detected in repo \(\d+ file/); // but without the provider-file count
  });
});
