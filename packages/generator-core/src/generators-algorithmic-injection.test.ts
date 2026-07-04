import { describe, it, expect } from "vitest";
import ts from "typescript";
import { parse } from "yaml";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  generateGenerativeSketch,
  generateCollectionMap,
  generateExportManifest,
  generateParameterPack,
  generateVariationMatrix,
} from "./generators-algorithmic.js";

const PAY = 'INJ*/x-->y\n## HEAD "q`z </script> <b> ({[}])';
const profile = {} as RepoProfile;
const files: SourceFile[] = [{ path: "README.md", content: "x", size: 5 } as SourceFile];

function hostileCtx(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: `snap${PAY}`, project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: `App${PAY}`, type: `mono${PAY}`, primary_language: `TypeScript${PAY}`, description: `desc${PAY}`, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1234, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: {
      languages: [{ name: `TypeScript${PAY}`, file_count: 5, loc: 1234, loc_percent: 90 }] as ContextMap["detection"]["languages"],
      frameworks: [{ name: `React${PAY}`, version: `19${PAY}`, confidence: 0.9, evidence: [] }] as ContextMap["detection"]["frameworks"],
      build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null,
    },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [{ path: `src/h${PAY}.ts`, inbound_count: 9, outbound_count: 1, risk_score: 0.9 }] as ContextMap["dependency_graph"]["hotspots"] },
    entry_points: [{ path: `i${PAY}.ts`, type: "app", description: "e" }] as ContextMap["entry_points"],
    routes: [], domain_models: [{ name: `User${PAY}`, kind: `interface${PAY}`, field_count: 3, source_file: `m${PAY}.ts` }] as ContextMap["domain_models"],
    sql_schema: [],
    architecture_signals: { patterns_detected: [`mono${PAY}`], layer_boundaries: [{ layer: `api${PAY}`, directories: [`apps${PAY}`] }], separation_score: 0.8 } as ContextMap["architecture_signals"],
    ai_context: { project_summary: `A project${PAY}`, key_abstractions: [`Widget${PAY}`], conventions: [], warnings: [] } as ContextMap["ai_context"],
    ...over,
  } as ContextMap;
}
function tsSyntaxErrors(code: string): number {
  const out = ts.transpileModule(code, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.Latest, isolatedModules: false } });
  return (out.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error).length;
}
function stripFences(content: string): string {
  const out: string[] = []; let fence: string | null = null;
  for (const line of content.split("\n")) {
    const run = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (fence) { if (run && run[0] === fence[0] && run.length >= fence.length && line.trim() === run) fence = null; continue; }
    if (run) { fence = run; continue; }
    out.push(line);
  }
  return out.join("\n");
}

describe("generative-sketch.ts — generated code cannot be broken out of", () => {
  it("parses clean under a hostile project name (JSDoc sink)", () => {
    expect(tsSyntaxErrors(generateGenerativeSketch(hostileCtx(), files).content)).toBe(0);
  });
});

describe("collection-map.md — injection containment", () => {
  it("no forged heading, balanced fences", () => {
    const content = generateCollectionMap(hostileCtx(), files).content;
    for (const l of stripFences(content).split("\n")) {
      expect(l).not.toMatch(/^\s*#{1,6}\s+(INJ|HEAD)/);
      expect(l).not.toMatch(/^\s*HEAD\b/);
    }
    expect((content.match(/^```/gm) ?? []).length % 2).toBe(0);
  });
});

describe("export-manifest.yaml — injection containment", () => {
  it("parses and the hostile project name never forges a root key", () => {
    const y = parse(generateExportManifest(hostileCtx(), profile, files).content) as Record<string, unknown>;
    const allowed = new Set(["manifest"]);
    for (const k of Object.keys(y)) expect(allowed.has(k), `unexpected root key: ${k}`).toBe(true);
  });
});

describe("algorithmic JSON outputs — valid under hostile input", () => {
  it("parameter-pack.json + variation-matrix.json parse as JSON", () => {
    expect(() => JSON.parse(generateParameterPack(hostileCtx(), files).content)).not.toThrow();
    expect(() => JSON.parse(generateVariationMatrix(hostileCtx(), files).content)).not.toThrow();
  });
});

describe("algorithmic — deterministic under hostile input", () => {
  it("all generators are byte-stable across two runs", () => {
    const c = hostileCtx();
    expect(generateGenerativeSketch(c, files).content).toBe(generateGenerativeSketch(c, files).content);
    expect(generateCollectionMap(c, files).content).toBe(generateCollectionMap(c, files).content);
    expect(generateExportManifest(c, profile, files).content).toBe(generateExportManifest(c, profile, files).content);
    expect(generateParameterPack(c, files).content).toBe(generateParameterPack(c, files).content);
  });
});
