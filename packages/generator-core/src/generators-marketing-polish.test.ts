import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { generateCampaignBrief, generateSequencePack } from "./generators-marketing.js";

function ctxWith(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "monorepo", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.3 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...over,
  } as ContextMap;
}

describe("campaign-brief routes are deduped + honestly labeled (POLISH)", () => {
  const routes = [
    { path: "/a", method: "GET", source_file: "src/server.ts", handler: "h" },
    { path: "/a", method: "GET", source_file: "src/server.test.ts", handler: "h" }, // dupe + noise
    { path: "/b", method: "POST", source_file: "src/server.ts", handler: "h" },
  ] as ContextMap["routes"];
  const md = generateCampaignBrief(ctxWith({ routes })).content;
  it("counts the deduped route surface, labeled 'Routes' not 'API Endpoints'", () => {
    expect(md).toContain("**2 Routes**");        // /a and /b, deduped from 3 rows
    expect(md).not.toContain("API Endpoints");    // the overcount/mislabel is gone
  });
});

describe("campaign-brief architecture puffery is score-gated (POLISH)", () => {
  const patterns = ["monorepo"] as ContextMap["architecture_signals"]["patterns_detected"];
  it("does not boast 'Clean Architecture' for a low separation score", () => {
    const md = generateCampaignBrief(ctxWith({ architecture_signals: { patterns_detected: patterns, layer_boundaries: [], separation_score: 0.2 } })).content;
    expect(md).toContain("Defined Architecture");
    expect(md).not.toContain("Clean Architecture");
  });
  it("keeps 'Clean Architecture' when the score earns it", () => {
    const md = generateCampaignBrief(ctxWith({ architecture_signals: { patterns_detected: patterns, layer_boundaries: [], separation_score: 0.8 } })).content;
    expect(md).toContain("Clean Architecture");
  });
});

describe("sequence-pack drops the unranked 'core' claim (POLISH)", () => {
  it("does not call the first-emitted model/abstraction 'core' (no ranking exists)", () => {
    const ctx = ctxWith({
      domain_models: [{ name: "User", kind: "interface", field_count: 3, source_file: "m.ts" }] as ContextMap["domain_models"],
      ai_context: { project_summary: "", key_abstractions: ["Widget"], conventions: [], warnings: [] } as ContextMap["ai_context"],
    });
    const md = generateSequencePack(ctx).content;
    expect(md).not.toContain("core entities");
    expect(md).not.toContain("core feature");
  });
});
