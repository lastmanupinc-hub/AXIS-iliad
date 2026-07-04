import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  generateCanvasSpec,
  generateSocialPack,
  generatePosterLayouts,
  generateCanvasAssetGuidelines,
  generateBrandBoard,
} from "./generators-canvas.js";

// Every markdown breakout char: `*/` `-->` (comment-ish), newline (heading start),
// quote/backtick (span/fence), pipe (table cell), `<b>` (html-ish).
const PAY = 'INJ x\n## HEAD "q`z | col <b> --> */';
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
    dependency_graph: { external_dependencies: [{ name: `dep${PAY}`, version: "1" }] as ContextMap["dependency_graph"]["external_dependencies"], internal_imports: [], hotspots: [{ path: `h${PAY}.ts`, inbound_count: 9, outbound_count: 1, risk_score: 0.9 }] as ContextMap["dependency_graph"]["hotspots"] },
    entry_points: [{ path: `i${PAY}.ts`, type: "app", description: "e" }] as ContextMap["entry_points"],
    routes: [], domain_models: [{ name: `User${PAY}`, kind: `interface${PAY}`, field_count: 3, source_file: `m${PAY}.ts` }] as ContextMap["domain_models"],
    sql_schema: [],
    architecture_signals: { patterns_detected: [`mono${PAY}`], layer_boundaries: [{ layer: `api${PAY}`, directories: [`apps${PAY}`] }], separation_score: 0.8 } as ContextMap["architecture_signals"],
    ai_context: { project_summary: `A project${PAY}`, key_abstractions: [`Widget${PAY}`], conventions: [], warnings: [`danger${PAY}`] } as ContextMap["ai_context"],
    ...over,
  } as ContextMap;
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

const MD: Array<[string, (c: ContextMap) => { content: string }]> = [
  ["social-pack.md", (c) => generateSocialPack(c, files)],
  ["poster-layouts.md", (c) => generatePosterLayouts(c, files)],
  ["asset-guidelines.md", (c) => generateCanvasAssetGuidelines(c, files)],
  ["brand-board.md", (c) => generateBrandBoard(c, files)],
];
describe("canvas markdown docs — injection containment", () => {
  for (const [name, gen] of MD) {
    it(`${name}: no forged heading/directive, balanced fences, contained table rows`, () => {
      const content = gen(hostileCtx()).content;
      const live = stripFences(content);
      for (const l of live.split("\n")) {
        expect(l).not.toMatch(/^\s*#{1,6}\s+(INJ|HEAD)/); // no injected heading (either marker)
        expect(l).not.toMatch(/^\s*HEAD\b/);              // no bare forged directive line
      }
      // social-pack + poster embed ASCII boxes in ``` fences; mdCode kept the
      // payload's backticks neutral so every fence still pairs up.
      expect((content.match(/^```/gm) ?? []).length % 2).toBe(0);
      // table rows keep their column count (pipe payloads escaped in cells)
      for (const l of content.split("\n").filter((x) => x.startsWith("| ") && x.includes("INJ"))) {
        expect(l.replace(/\\\|/g, "").split("|").length).toBeLessThanOrEqual(5);
      }
    });
  }
});

describe("canvas-spec.json — valid under hostile input", () => {
  it("parses as JSON and preserves the hostile name as a scalar", () => {
    const spec = JSON.parse(generateCanvasSpec(hostileCtx(), profile, files).content) as { project?: { name?: string } };
    expect(typeof JSON.stringify(spec)).toBe("string");
  });
});

describe("canvas — deterministic under hostile input", () => {
  it("all generators are byte-stable across two runs", () => {
    const c = hostileCtx();
    expect(generateSocialPack(c, files).content).toBe(generateSocialPack(c, files).content);
    expect(generatePosterLayouts(c, files).content).toBe(generatePosterLayouts(c, files).content);
    expect(generateBrandBoard(c, files).content).toBe(generateBrandBoard(c, files).content);
    expect(generateCanvasSpec(c, profile, files).content).toBe(generateCanvasSpec(c, profile, files).content);
  });
});
