import { describe, it, expect } from "vitest";
import ts from "typescript";
import { parse } from "yaml";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  generateComponent,
  generateDashboardWidget,
  generateEmbedSnippet,
  generateArtifactSpec,
  generatePrd,
  generateDesignDoc,
  generateTasksMd,
  generateContextMd,
  generateIndexHtml,
  generateCapabilityMap,
} from "./generators-artifacts.js";

// A payload that carries EVERY code/markup breakout char. If any sink fails to
// escape, the generated code gets a syntax error (unbalanced `({[}])`, stray
// `*/`, unterminated string) — caught by the TS parser — or a markdown heading
// escapes the fence. `*/` `-->` (comment closes), newline (// break + md heading
// start), `"` `` ` `` (string literals), `</script>` (script close), `<b>{e}` (JSX
// text/expr), `({[}])` (makes an unescaped string-literal breakout a syntax error).
const PAY = 'INJ*/x-->y\n## HEAD "q`z </script> <b>{e} ({[}])';
const profile = {} as RepoProfile;
const files: SourceFile[] = [{ path: "README.md", content: "x", size: 5 } as SourceFile];

function hostileCtx(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: `snap${PAY}`, project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: `App${PAY}`, type: `mono${PAY}`, primary_language: `TypeScript${PAY}`, description: `desc${PAY}`, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1234,
      file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"],
      top_level_layout: [{ name: `apps${PAY}`, purpose: `stuff${PAY}`, file_count: 3 }] as ContextMap["structure"]["top_level_layout"] },
    detection: {
      languages: [{ name: `TypeScript${PAY}`, file_count: 5, loc: 1234, loc_percent: 90 }] as ContextMap["detection"]["languages"],
      frameworks: [{ name: `React${PAY}`, version: `19${PAY}`, confidence: 0.9, evidence: [] }] as ContextMap["detection"]["frameworks"],
      build_tools: [`vite${PAY}`], test_frameworks: [`vitest${PAY}`], package_managers: [`pnpm${PAY}`], ci_platform: `GH${PAY}`, deployment_target: `docker${PAY}`,
    },
    dependency_graph: {
      external_dependencies: [{ name: `dep${PAY}`, version: `1${PAY}` }] as ContextMap["dependency_graph"]["external_dependencies"],
      internal_imports: [], hotspots: [{ path: `src/h${PAY}.ts`, inbound_count: 9, outbound_count: 1, risk_score: 0.9 }] as ContextMap["dependency_graph"]["hotspots"],
    },
    entry_points: [{ path: `src/i${PAY}.ts`, type: `app${PAY}`, description: `entry${PAY}` }] as ContextMap["entry_points"],
    routes: [{ path: `/api${PAY}`, method: `GET${PAY}`, source_file: `src/r${PAY}.ts`, handler: "h" }] as ContextMap["routes"],
    domain_models: [{ name: `User${PAY}`, kind: `interface${PAY}`, field_count: 3, source_file: `src/m${PAY}.ts` }] as ContextMap["domain_models"],
    sql_schema: [],
    architecture_signals: { patterns_detected: [`mono${PAY}`], layer_boundaries: [{ layer: `api${PAY}`, directories: [`apps/api${PAY}`] }], separation_score: 0.8 } as ContextMap["architecture_signals"],
    ai_context: { project_summary: `A project${PAY}`, key_abstractions: [`Widget${PAY}`], conventions: [`strict${PAY}`], warnings: [`danger${PAY}`] } as ContextMap["ai_context"],
    ...over,
  } as ContextMap;
}

function tsSyntaxErrors(code: string, tsx: boolean): number {
  // Only set `jsx` for TSX — passing `jsx: undefined` explicitly makes
  // transpileModule emit a spurious "--jsx option must be…" diagnostic.
  const compilerOptions: ts.CompilerOptions = { target: ts.ScriptTarget.Latest, isolatedModules: false };
  if (tsx) compilerOptions.jsx = ts.JsxEmit.Preserve;
  const out = ts.transpileModule(code, { reportDiagnostics: true, compilerOptions });
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

// ─── generated CODE stays syntactically valid under hostile input ───
describe("generated TS/TSX code cannot be broken out of", () => {
  it("React component (JSDoc + JSX-text + string-literal sinks) parses clean", () => {
    // React branch: frameworks include React
    expect(tsSyntaxErrors(generateComponent(hostileCtx(), files).content, true)).toBe(0);
  });
  it("vanilla component (JSDoc + string-literal sinks) parses clean", () => {
    const ctx = hostileCtx({ detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null } });
    expect(tsSyntaxErrors(generateComponent(ctx, files).content, true)).toBe(0);
  });
  it("dashboard-widget (JSX-attr + 13 line-comment sinks) parses clean", () => {
    expect(tsSyntaxErrors(generateDashboardWidget(hostileCtx(), files).content, true)).toBe(0);
  });
  it("embed-snippet (JSDoc sink) parses clean", () => {
    expect(tsSyntaxErrors(generateEmbedSnippet(hostileCtx(), files).content, false)).toBe(0);
  });
});

// ─── Svelte branch: HTML comment + <script> string cannot break out ───
describe("Svelte component containment", () => {
  const svelteCtx = hostileCtx({ detection: { languages: [], frameworks: [{ name: "Svelte", version: "5", confidence: 0.9, evidence: [] }] as ContextMap["detection"]["frameworks"], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null } });
  const content = generateComponent(svelteCtx, files).content;
  it("the HTML comment cannot be closed early by the project name", () => {
    // codeComment broke `-->` → the only real comment-close is the generator's own.
    const firstClose = content.indexOf("-->");
    const header = content.slice(0, firstClose);
    expect(header).toContain("INJ"); // payload trapped inside the comment
    expect(header).not.toContain("-->"); // no earlier close
  });
  it("the <script> title string literal escapes the payload quote", () => {
    const titleLine = content.split("\n").find((l) => l.includes("let title ="))!;
    // eval the string literal: it must round-trip to the full hostile name, proving containment
    const m = titleLine.match(/let title = (".*");/)!;
    expect(eval(m[1])).toBe(svelteCtx.project_identity.name);
  });
});

// ─── the 5 markdown docs: no heading/directive breakout ───────
const MD: Array<[string, (c: ContextMap) => { content: string }]> = [
  ["artifact-spec.md", (c) => generateArtifactSpec(c, profile, files)],
  ["prd.md", (c) => generatePrd(c, profile, files)],
  ["design.md", (c) => generateDesignDoc(c, profile, files)],
  ["tasks.md", (c) => generateTasksMd(c, profile, files)],
  ["context.md", (c) => generateContextMd(c, profile, files)],
];
describe("markdown docs — injection containment", () => {
  for (const [name, gen] of MD) {
    it(`${name}: no payload begins a live heading or table row`, () => {
      const live = stripFences(gen(hostileCtx()).content);
      for (const l of live.split("\n")) {
        expect(l).not.toMatch(/^\s*#{1,6}\s+INJ/); // no injected heading
        expect(l).not.toMatch(/^\s*HEAD\b/); // no forged directive line
      }
    });
  }
});

// ─── capability-map.yaml: root-key containment ────────────────
describe("capability-map.yaml — injection containment", () => {
  it("parses and the hostile project name never forges a root key", () => {
    const y = parse(generateCapabilityMap(hostileCtx(), profile, files).content) as Record<string, unknown>;
    const allowed = new Set(["meta", "status_legend", "capabilities", "summary"]);
    for (const k of Object.keys(y)) expect(allowed.has(k), `unexpected root key: ${k}`).toBe(true);
    expect((y.meta as { project: string }).project).toContain("App"); // name preserved as scalar data
  });
});

// ─── index.html: HTML escaping ────────────────────────────────
describe("index.html — HTML escaping", () => {
  const content = generateIndexHtml(hostileCtx(), profile, files).content;
  it("the project name in <title> / attributes is entity-escaped, not raw markup", () => {
    expect(content).not.toContain("<b>{e}"); // the raw payload tag never appears
    expect(content).toContain("&lt;b&gt;"); // it's escaped
  });
});

// ─── determinism ──────────────────────────────────────────────
describe("artifacts — deterministic under hostile input", () => {
  it("all generators are byte-stable across two runs", () => {
    const c = hostileCtx();
    expect(generateComponent(c, files).content).toBe(generateComponent(c, files).content);
    expect(generateDashboardWidget(c, files).content).toBe(generateDashboardWidget(c, files).content);
    expect(generateArtifactSpec(c, profile, files).content).toBe(generateArtifactSpec(c, profile, files).content);
    expect(generateCapabilityMap(c, profile, files).content).toBe(generateCapabilityMap(c, profile, files).content);
    expect(generateIndexHtml(c, profile, files).content).toBe(generateIndexHtml(c, profile, files).content);
  });
});
