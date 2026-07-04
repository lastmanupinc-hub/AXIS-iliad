import { describe, it, expect } from "vitest";
import { parse } from "yaml";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { capNote, capMeta } from "./cap-utils.js";
import { generateConnectorMap, generateMcpConfig } from "./generators-mcp.js";

const profile = {} as RepoProfile;
const files: SourceFile[] = [];

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
const models = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Model${i}`, kind: "interface", field_count: 2, source_file: `src/m${i}.ts` })) as ContextMap["domain_models"];

// ─── the shared helper ──────────────────────────────────────────
describe("cap-utils: capNote / capMeta", () => {
  it("capNote discloses only when the list exceeds the cap", () => {
    expect(capNote(443, 15, "domain models")).toBe("showing 15 of 443 domain models");
    expect(capNote(15, 15, "x")).toBeNull(); // exactly at cap = complete
    expect(capNote(10, 15, "x")).toBeNull();
  });
  it("capMeta returns {shown,total} only when truncated, else undefined", () => {
    expect(capMeta(443, 15)).toEqual({ shown: 15, total: 443 });
    expect(capMeta(15, 15)).toBeUndefined();
    expect(capMeta(10, 15)).toBeUndefined();
  });
});

// ─── wiring: disclosure present iff truncated, and never breaks YAML/JSON ───
describe("DEVELOP: capped MCP lists disclose truncation honestly", () => {
  it("connector-map.yaml notes the cap when models exceed it (and stays valid YAML)", () => {
    const content = generateConnectorMap(ctxWith({ domain_models: models(20) }), files).content;
    expect(content).toContain("# showing 15 of 20 domain models");
    expect(() => parse(content)).not.toThrow(); // comment doesn't corrupt the doc
    const y = parse(content) as { resources: unknown[] };
    expect(y.resources).toHaveLength(15); // note is a comment, not a list item
  });

  it("connector-map.yaml emits NO disclosure when the list fits under the cap", () => {
    const content = generateConnectorMap(ctxWith({ domain_models: models(10) }), files).content;
    expect(content).not.toContain("# showing");
  });

  it("mcp-config.json carries a structured `truncated` block iff a dimension was capped", () => {
    const big = JSON.parse(generateMcpConfig(ctxWith({ domain_models: models(20) }), profile, files).content) as { truncated?: Record<string, unknown> };
    expect(big.truncated?.domain_models).toEqual({ shown: 15, total: 20 });

    const small = JSON.parse(generateMcpConfig(ctxWith({ domain_models: models(10) }), profile, files).content) as { truncated?: unknown };
    expect(small.truncated).toBeUndefined(); // JSON.stringify omits the empty case
  });
});
