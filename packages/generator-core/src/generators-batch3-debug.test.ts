import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateNotebookSummary, generateStudyBrief, generateCitationIndex, generateSourceMap } from "./generators-notebook.js";
import { generateSuperpowerPack, generateTestGenerationRules, generateAutomationPipeline } from "./generators-superpowers.js";
import { generateSequencePack, generateAbTestPlan, generateCroPlaybook } from "./generators-marketing.js";

// ─── DEBUG sweep Batch 3 (notebook, superpowers, marketing) ─────────────
// Grounded against the repo's own .ai/ dogfood output. Locks the key fixes.

function mkCtx(o: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "acme", type: "monorepo", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 100, total_directories: 20, total_loc: 50000, file_tree_summary: [], top_level_layout: [] },
    detection: { languages: [{ name: "TypeScript", file_count: 90, loc: 45000, loc_percent: 90 }, { name: "YAML", file_count: 5, loc: 500, loc_percent: 5 }], frameworks: [{ name: "React", version: "19.0.0", confidence: 0.9 }], build_tools: ["vite"], test_frameworks: ["vitest"], package_managers: ["npm"], ci_platform: "github_actions", deployment_target: null } as ContextMap["detection"],
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [],
    routes: [],
    domain_models: [],
    sql_schema: [],
    architecture_signals: { patterns_detected: ["layered"], layer_boundaries: [], separation_score: 0.65 },
    ai_context: { project_summary: "acme is a monorepo.", key_abstractions: [], conventions: [], warnings: [] },
    ...o,
  } as ContextMap;
}
const f = (path: string, content = "export const x = 1;"): SourceFile => ({ path, content, size: content.length });
const dupRoutes = Array.from({ length: 5 }, () => ({ method: "GET", path: "/v1/health", source_file: "apps/api/src/server.test.ts" }));

// ══ NOTEBOOK ══
describe("notebook — honest, deduped, deterministic", () => {
  it("source-map uses deduped routes (not the raw per-mention list)", () => {
    const map = JSON.parse(generateSourceMap(mkCtx({ routes: dupRoutes as ContextMap["routes"] })).content);
    expect(map.routes.length).toBe(1);
  });
  it("project_summary opening with a block marker is neutralized (mdBlock)", () => {
    const out = generateNotebookSummary(mkCtx({ ai_context: { ...mkCtx().ai_context, project_summary: "# PWNED" } })).content;
    expect(out).not.toMatch(/^# PWNED/m);
  });
  it("LOC is grouped without ICU (deterministic)", () => {
    expect(generateNotebookSummary(mkCtx()).content).toContain("50,000");
  });
  it("citation-index does NOT cite YAML/Markdown as a Language Reference", () => {
    const cites = JSON.parse(generateCitationIndex(mkCtx()).content);
    const langCites = (cites.citations ?? []).filter((c: { title?: string }) => /Language Reference/.test(c.title ?? ""));
    expect(langCites.some((c: { title: string }) => /YAML|Markdown/i.test(c.title))).toBe(false);
  });
  it("study-brief Phase 2 lists real entry points via fallback (no 'check package.json' when files have them)", () => {
    const files = [f("apps/api/src/server.ts"), f("apps/web/src/main.tsx")];
    const out = generateStudyBrief(mkCtx(), files).content;
    const phase2 = out.slice(out.indexOf("Phase 2"), out.indexOf("Phase 3"));
    expect(phase2).toContain("server.ts");
    expect(phase2).not.toContain("checking package.json");
  });
});

// ══ SUPERPOWERS ══
describe("superpowers — valid commands, honest counts", () => {
  it("automation-pipeline emits `npm run build`, not the invalid `npm build`", () => {
    const out = generateAutomationPipeline(mkCtx(), {} as never).content;
    expect(out).toContain("npm run build");
    expect(out).not.toMatch(/- npm build\b/);
  });
  it("project_summary opening with a block marker is neutralized (mdBlock)", () => {
    const out = generateSuperpowerPack(mkCtx({ ai_context: { ...mkCtx().ai_context, project_summary: "> pwn" } })).content;
    expect(out).not.toMatch(/^> pwn/m);
  });
  it("high-complexity model list is deduped by name (no duplicate 'top 5' slots)", () => {
    const domain_models = [
      { name: "ContextMap", kind: "interface", field_count: 69, source_file: "a.ts" },
      { name: "ContextMap", kind: "interface", field_count: 61, source_file: "b.ts" },
      { name: "RepoProfile", kind: "interface", field_count: 26, source_file: "c.ts" },
    ] as ContextMap["domain_models"];
    const out = generateTestGenerationRules(mkCtx({ domain_models })).content;
    const section = out.slice(out.indexOf("High-Complexity Models"));
    expect((section.match(/`ContextMap`/g) ?? []).length).toBe(1);
  });
});

// ══ MARKETING ══
describe("marketing — no fabrication, page routes only", () => {
  it("does not stamp a 1970 timestamp in the A/B test plan", () => {
    expect(generateAbTestPlan(mkCtx()).content).not.toContain("1970");
  });
  it("project_summary opening with a block marker is neutralized (mdBlock)", () => {
    const out = generateSequencePack(mkCtx({ ai_context: { ...mkCtx().ai_context, project_summary: "| pwn |" } })).content;
    expect(out).not.toMatch(/^\| pwn \|/m);
  });
  it("CRO table excludes backend/asset endpoints", () => {
    const routes = [{ method: "GET", path: "/robots.txt", source_file: "s.ts" }, { method: "GET", path: "/dashboard", source_file: "s.ts" }];
    const out = generateCroPlaybook(mkCtx({ routes: routes as ContextMap["routes"] })).content;
    const cro = out.slice(out.indexOf("Route Optimization Opportunities"));
    expect(cro).not.toContain("/robots.txt");
  });
  it("sequence-pack does not claim domain entities are 'the feature everyone uses first'", () => {
    const domain_models = [{ name: "DebounceState", kind: "interface", field_count: 3, source_file: "a.ts" }] as ContextMap["domain_models"];
    const out = generateSequencePack(mkCtx({ domain_models })).content;
    expect(out).not.toContain("everyone uses first");
  });
});
