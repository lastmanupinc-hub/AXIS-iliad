import { describe, it, expect } from "vitest";
import ts from "typescript";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  generateRemotionScript,
  generateScenePlan,
  generateAssetChecklist,
  generateStoryboard,
  generateRenderConfig,
} from "./generators-remotion.js";

// Payload with every breakout char: `*/` `-->` (comments), newline (// break + md
// heading), quote/backtick (string+fence), `</script>`, `<b>{e}` (JSX), unbalanced
// `({[}])` (turns an unescaped string-literal breakout into a syntax error).
const PAY = 'INJ*/x-->y\n## HEAD "q`z </script> <b>{e} ({[}])';
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
    entry_points: [{ path: `src/i${PAY}.ts`, type: `app${PAY}`, description: `e${PAY}` }] as ContextMap["entry_points"],
    routes: [], domain_models: [{ name: `User${PAY}`, kind: `interface${PAY}`, field_count: 3, source_file: `src/m${PAY}.ts` }] as ContextMap["domain_models"],
    sql_schema: [],
    architecture_signals: { patterns_detected: [`mono${PAY}`], layer_boundaries: [], separation_score: 0.8 } as ContextMap["architecture_signals"],
    ai_context: { project_summary: `A project${PAY}`, key_abstractions: [`Widget${PAY}`], conventions: [], warnings: [] } as ContextMap["ai_context"],
    ...over,
  } as ContextMap;
}

function tsxSyntaxErrors(code: string): number {
  const out = ts.transpileModule(code, { reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.Latest, isolatedModules: false } });
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

// ─── remotion-script.ts: generated TSX stays syntactically valid ───
describe("remotion-script.ts — generated code cannot be broken out of", () => {
  it("the composition parses clean under a hostile project name/description (JSX-text + comment sinks)", () => {
    expect(tsxSyntaxErrors(generateRemotionScript(hostileCtx(), files).content)).toBe(0);
  });
});

// ─── the 3 markdown docs: no heading/directive breakout, fences stay balanced ───
const MD: Array<[string, (c: ContextMap) => { content: string }]> = [
  ["scene-plan.md", (c) => generateScenePlan(c, files)],
  ["asset-checklist.md", (c) => generateAssetChecklist(c, files)],
  ["storyboard.md", (c) => generateStoryboard(c, files)],
];
describe("remotion markdown docs — injection containment", () => {
  for (const [name, gen] of MD) {
    it(`${name}: no payload begins a live heading, and code fences stay balanced`, () => {
      const content = gen(hostileCtx()).content;
      const live = stripFences(content);
      for (const l of live.split("\n")) {
        // catch a live heading forged from EITHER payload marker (`## INJ…` or
        // the post-newline `## HEAD…` — the latter caught the raw project_summary
        // push at L210 that a `${}`-only grep missed).
        expect(l).not.toMatch(/^\s*#{1,6}\s+(INJ|HEAD)/);
        expect(l).not.toMatch(/^\s*HEAD\b/);
      }
      // storyboard's ASCII boxes live inside ``` fences; mdCode neutralized the
      // payload's backticks so every fence still pairs up.
      expect((content.match(/^```/gm) ?? []).length % 2).toBe(0);
    });
  }
});

// ─── render-config.json: valid JSON ───────────────────────────
describe("render-config.json — valid under hostile input", () => {
  it("parses as JSON", () => {
    expect(() => JSON.parse(generateRenderConfig(hostileCtx(), profile, files).content)).not.toThrow();
  });
});

// ─── determinism ──────────────────────────────────────────────
describe("remotion — deterministic under hostile input", () => {
  it("all generators are byte-stable across two runs", () => {
    const c = hostileCtx();
    expect(generateRemotionScript(c, files).content).toBe(generateRemotionScript(c, files).content);
    expect(generateScenePlan(c, files).content).toBe(generateScenePlan(c, files).content);
    expect(generateStoryboard(c, files).content).toBe(generateStoryboard(c, files).content);
    expect(generateAssetChecklist(c, files).content).toBe(generateAssetChecklist(c, files).content);
  });
});
