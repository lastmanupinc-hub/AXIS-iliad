import { describe, it, expect } from "vitest";
import ts from "typescript";
import type { ContextMap } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateGenerativeSketch, generateVariationMatrix } from "./generators-algorithmic.js";

const files: SourceFile[] = [];
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

// The generated sketch for an empty-languages repo must be valid TS that also
// can't NaN-deref at runtime — its baked palette is non-empty (deriveAlgoPalette
// fallback), so createNodes' `palette[i % palette.length]` is always in range.
describe("HARDEN-2: generated sketch is safe for a zero-languages repo", () => {
  it("parses as valid TS and bakes a non-empty palette", () => {
    const content = generateGenerativeSketch(ctxWith(), files).content;
    const errs = ts.transpileModule(content, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.Latest, isolatedModules: false } }).diagnostics ?? [];
    expect(errs.filter((d) => d.category === ts.DiagnosticCategory.Error)).toHaveLength(0);
    const palette = JSON.parse(content.match(/palette: (\[.*?\]),/s)![1]) as unknown[];
    expect(palette.length).toBeGreaterThan(0); // never palette[i % 0]
  });
});

// #POLISH-2: an empty project name must not collapse the "deterministic seeds"
// to all-identical (seedBase was 0 → every seed = 42).
describe("HARDEN-2/POLISH-2: variation seeds don't degenerate on an empty project name", () => {
  it("empty id.name still yields varied seeds via the fallback label", () => {
    const ctx = ctxWith({ project_identity: { name: "", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null } });
    const content = generateVariationMatrix(ctx, files).content;
    JSON.parse(content); // valid JSON
    const seeds = [...content.matchAll(/"seed":\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(seeds.length).toBeGreaterThan(1);
    expect(new Set(seeds).size).toBeGreaterThan(1); // not the degenerate all-42 case
  });
});
