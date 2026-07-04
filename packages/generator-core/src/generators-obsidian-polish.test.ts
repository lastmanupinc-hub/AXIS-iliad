import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { generateGraphPromptMap, generateVaultRules, generateLinkingPolicy } from "./generators-obsidian.js";

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
type Graph = { total_nodes: number; truncated?: { domain_models?: { shown: number; total: number } }; nodes: Array<{ id: string; note_path: string }>; edges: Array<{ from: string; to: string }> };

describe("graph-prompt-map.json is capped + honest (POLISH)", () => {
  const models = Array.from({ length: 100 }, (_, i) => ({ name: `Model${i}`, kind: "interface", field_count: 3, source_file: `src/m${i}.ts` })) as ContextMap["domain_models"];
  const g = JSON.parse(generateGraphPromptMap(ctxWith({ domain_models: models })).content) as Graph;

  it("caps domain-model nodes at 60 and discloses the truncation honestly", () => {
    const modelNodes = g.nodes.filter((n) => n.id.startsWith("model_"));
    expect(modelNodes).toHaveLength(60);
    expect(g.truncated?.domain_models).toEqual({ shown: 60, total: 100 });
  });
  it("never emits an edge to a node that was not rendered (no dangling cross-link)", () => {
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) { expect(ids.has(e.from)).toBe(true); expect(ids.has(e.to)).toBe(true); }
  });
});

describe("the mandated hub link resolves to a real note (POLISH — review #1)", () => {
  it("the project node's note basename equals id.name, matching the [[id.name]] links", () => {
    const g = JSON.parse(generateGraphPromptMap(ctxWith()).content) as Graph;
    const project = g.nodes.find((n) => n.id === "project")!;
    // basename of the note_path is `${id.name}.md`, so `[[app]]` resolves to it
    expect(project.note_path.endsWith("/app.md")).toBe(true);
    // and the docs mandate exactly that link
    expect(generateVaultRules(ctxWith()).content).toContain("[[app]]");
    expect(generateLinkingPolicy(ctxWith()).content).toContain("[[app]]");
  });
});
