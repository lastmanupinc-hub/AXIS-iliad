import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateTestGenerationRules, generateRefactorChecklist } from "./generators-superpowers.js";

function baseCtx(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: ["vitest"], package_managers: ["pnpm"], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.3 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...over,
  } as ContextMap;
}
const sf = (path: string, content: string): SourceFile => ({ path, content, size: content.length } as SourceFile);

describe("Untested Exports — boundary-aware test matching (POLISH)", () => {
  const files: SourceFile[] = [
    sf("src/api.ts", "export function a() {}"),
    sf("src/api-client.test.ts", "test('x', () => {})"), // an UNRELATED test — must NOT count as api.ts's test
    sf("src/user.ts", "export function u() {}"),
    sf("src/user.test.ts", "test('u', () => {})"),        // the real test for user.ts
  ];
  const md = generateTestGenerationRules(baseCtx(), files).content;
  const section = md.split("## Untested Exports")[1] ?? "";

  it("flags api.ts as untested — an unrelated api-client.test.ts must not count (substring false match)", () => {
    expect(md).toContain("## Untested Exports");
    expect(section).toContain("src/api.ts");
  });
  it("does NOT flag user.ts — user.test.ts is its real test", () => {
    expect(section).not.toContain("src/user.ts");
  });
  it("HARDEN-2: same-basename files in different dirs don't share one test", () => {
    // packages/a and packages/b both have index.ts; only a/ has a test.
    // b/index.ts must still be flagged untested (directory affinity).
    const twoPkgs: SourceFile[] = [
      sf("packages/a/src/index.ts", "export function a() {}"),
      sf("packages/a/src/index.test.ts", "test('a', () => {})"),
      sf("packages/b/src/index.ts", "export function b() {}"),
    ];
    const out = generateTestGenerationRules(baseCtx(), twoPkgs).content;
    const sec = out.split("## Untested Exports")[1] ?? "";
    expect(sec).toContain("packages/b/src/index.ts"); // b has no test of its own
    expect(sec).not.toContain("packages/a/src/index.ts"); // a is tested
  });
});

describe("refactor-checklist — honest empty hotspot state (POLISH)", () => {
  it("does not claim 'even dependency distribution' from zero hotspots", () => {
    const md = generateRefactorChecklist(baseCtx()).content;
    expect(md).not.toContain("even dependency distribution.");
    expect(md).toContain("well-decoupled or was not fully resolved");
  });
});
