import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateProductSchema, generateCommerceRegistry } from "./generators-agentic-purchasing.js";
import { PROGRAM_ORDER, PROGRAM_OUTPUT_COUNTS, bundleOutputs } from "./program-manifest.js";
import { TOTAL_GENERATORS, TOTAL_PROGRAMS } from "./generate.js";

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
const files: SourceFile[] = [];

// ─── program-manifest is the derived source of truth ───
describe("DEVELOP: program-manifest derives program counts from the registry", () => {
  it("PROGRAM_ORDER length equals the canonical program count", () => {
    expect(PROGRAM_ORDER.length).toBe(TOTAL_PROGRAMS);
  });
  it("per-program output counts sum to the canonical generator count", () => {
    const sum = Object.values(PROGRAM_OUTPUT_COUNTS).reduce((s, n) => s + n, 0);
    expect(sum).toBe(TOTAL_GENERATORS);
  });
  it("superpowers owns 8 outputs (incl. the 3 verify-gate files), not 5", () => {
    expect(PROGRAM_OUTPUT_COUNTS.superpowers).toBe(8);
  });
  it("bundleOutputs sums per-program counts and ignores unknown slugs", () => {
    expect(bundleOutputs(["search", "skills", "debug"])).toBe(16);
    expect(bundleOutputs(["nope"])).toBe(0);
  });
});

// ─── product-schema.programs is derived (was: superpowers=5 → Σ 137 ≠ 140) ───
describe("DEVELOP: product-schema program list is internally consistent with the registry", () => {
  const schema = JSON.parse(generateProductSchema(ctxWith(), profile, files).content);
  it("enumerates every program and its outputs sum to total_outputs", () => {
    expect(schema.programs).toHaveLength(TOTAL_PROGRAMS);
    const sum = schema.programs.reduce((s: number, p: { outputs: number }) => s + p.outputs, 0);
    expect(sum).toBe(schema.total_outputs);
    expect(sum).toBe(TOTAL_GENERATORS);
  });
  it("each program's outputs matches the registry per-program count", () => {
    for (const p of schema.programs as Array<{ slug: string; outputs: number }>) {
      expect(p.outputs, `outputs for ${p.slug}`).toBe(PROGRAM_OUTPUT_COUNTS[p.slug]);
    }
  });
});

// ─── commerce-registry catalog is derived (was: pro-all listed 18 of 20; bundle counts wrong) ───
describe("DEVELOP: commerce-registry catalog derives every output count", () => {
  const registry = JSON.parse(generateCommerceRegistry(ctxWith(), profile, files).content);
  const byId = (id: string) => registry.catalog.find((b: { id: string }) => b.id === id);

  it("every bundle's outputs equals bundleOutputs(its programs)", () => {
    for (const b of registry.catalog as Array<{ id: string; programs: string[]; outputs: number }>) {
      expect(b.outputs, `outputs for ${b.id}`).toBe(bundleOutputs(b.programs));
    }
  });
  it("pro-all enumerates all programs and totals every artifact", () => {
    const proAll = byId("pro-all");
    expect(proAll.programs).toEqual([...PROGRAM_ORDER]);
    expect(proAll.programs).toHaveLength(TOTAL_PROGRAMS);
    expect(proAll.outputs).toBe(TOTAL_GENERATORS);
  });
  it("bundle counts are the corrected values (free 16, dev 32, brand 20)", () => {
    expect(byId("free-bundle").outputs).toBe(16);
    expect(byId("dev-essentials").outputs).toBe(32);
    expect(byId("brand-marketing").outputs).toBe(20);
  });
});
