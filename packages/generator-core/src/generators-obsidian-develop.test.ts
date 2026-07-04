import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { codeFileNote, generateGraphPromptMap, generateLinkingPolicy } from "./generators-obsidian.js";

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
type Graph = { nodes: Array<{ id: string; type: string; label: string; note_path: string }> };

describe("codeFileNote — one canonical note identity", () => {
  it("KEEPS the extension (flattened) so main.ts and main.tsx are distinct notes", () => {
    // (was: stripped the extension, which collapsed main.ts/main.tsx to one note — data loss)
    expect(codeFileNote("apps/api/src/server.ts")).toBe("apps-api-src-server-ts");
    expect(codeFileNote("src/index.tsx")).toBe("src-index-tsx");
    expect(codeFileNote("src/main.ts")).not.toBe(codeFileNote("src/main.tsx"));
  });
});

describe("a file's note identity is consistent across generators (review #3)", () => {
  it("the graph entry-point note and the linking-policy hotspot link agree on basename + folder", () => {
    const path = "apps/api/src/server.ts";
    const ctx = ctxWith({
      entry_points: [{ path, type: "app_entry", description: "main" }] as ContextMap["entry_points"],
      dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [{ path, inbound_count: 9, outbound_count: 1, risk_score: 0.9 }] as ContextMap["dependency_graph"]["hotspots"] },
    });
    const graph = JSON.parse(generateGraphPromptMap(ctx).content) as Graph;
    const ep = graph.nodes.find((n) => n.type === "entry_point")!;
    expect(ep.note_path).toBe(`Projects/app/Code/${codeFileNote(path)}.md`);
    // linking-policy links the same file to the same folder as the graph node
    // (Projects/<proj>/Code/…, not a vault-root Code/)
    expect(generateLinkingPolicy(ctx).content).toContain(`[[Projects/app/Code/${codeFileNote(path)}]]`);
  });
});

describe("same-named domain models get distinct note paths (review #2)", () => {
  it("two `NotConfiguredResult` models don't collide onto one note", () => {
    const models = [
      { name: "NotConfiguredResult", kind: "interface", field_count: 4, source_file: "code-sandbox.ts" },
      { name: "NotConfiguredResult", kind: "interface", field_count: 5, source_file: "document-parsing.ts" },
    ] as ContextMap["domain_models"];
    const graph = JSON.parse(generateGraphPromptMap(ctxWith({ domain_models: models })).content) as Graph;
    const modelNodes = graph.nodes.filter((n) => n.type === "domain_model");
    const paths = modelNodes.map((n) => n.note_path);
    expect(new Set(paths).size).toBe(paths.length); // all distinct
    expect(paths).toContain("Projects/app/Models/NotConfiguredResult.md");
    expect(paths).toContain("Projects/app/Models/NotConfiguredResult-2.md");
  });
});
