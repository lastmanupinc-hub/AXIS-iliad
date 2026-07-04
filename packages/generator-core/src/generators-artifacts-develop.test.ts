import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateDesignDoc, generateIndexHtml } from "./generators-artifacts.js";

const profile = {} as RepoProfile;
const files: SourceFile[] = [];

function ctxWith(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [{ name: "React", version: "19", confidence: 0.9, evidence: [] }] as ContextMap["detection"]["frameworks"], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...over,
  } as ContextMap;
}
const fw = (...names: string[]) => names.map((name) => ({ name, version: "1", confidence: 0.9, evidence: [] })) as ContextMap["detection"]["frameworks"];

// ─── #6 fix: the styling bullet used a shared detectStyling (was a dead branch) ───
describe("DEVELOP: design.md styling detection is live, via the shared detectStyling helper", () => {
  it("detects Tailwind by its real detector name (was dead: `.find([\"Tailwind\"])` never matched \"Tailwind CSS\")", () => {
    const ctx = ctxWith({ detection: { ...ctxWith().detection, frameworks: fw("React", "Tailwind CSS") } });
    expect(generateDesignDoc(ctx, profile, files).content).toContain("**Styling**: Tailwind CSS as the single styling layer");
  });
  it("detects css-in-js from a styled-components dependency", () => {
    const ctx = ctxWith({ dependency_graph: { external_dependencies: [{ name: "styled-components", version: "6" }] as ContextMap["dependency_graph"]["external_dependencies"], internal_imports: [], hotspots: [] } });
    expect(generateDesignDoc(ctx, profile, files).content).toContain("**Styling**: CSS-in-JS as the single styling layer");
  });
  it("emits NO styling bullet when no styling approach is detected (plain-css)", () => {
    expect(generateDesignDoc(ctxWith(), profile, files).content).not.toContain("**Styling**:");
  });
});

// ─── capNote reuse: the Top-Level Layout table discloses truncation ───
describe("DEVELOP: design.md Top-Level Layout discloses truncation (shared capNote)", () => {
  const layout = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `dir${i}`, purpose: "p", file_count: 2 })) as ContextMap["structure"]["top_level_layout"];
  it("notes 'showing 12 of N' when the layout exceeds the cap", () => {
    const ctx = ctxWith({ structure: { ...ctxWith().structure, top_level_layout: layout(15) } });
    expect(generateDesignDoc(ctx, profile, files).content).toContain("showing 12 of 15 top-level entries");
  });
  it("adds no note when the layout fits under the cap", () => {
    const ctx = ctxWith({ structure: { ...ctxWith().structure, top_level_layout: layout(5) } });
    expect(generateDesignDoc(ctx, profile, files).content).not.toContain("top-level entries");
  });
});

// ─── escape() consolidation: index.html still fully HTML-escapes ───
describe("DEVELOP: index.html uses the shared htmlEscape (local escape() removed)", () => {
  it("entity-escapes a hostile project name in the title and meta tags", () => {
    const ctx = ctxWith({ project_identity: { name: '"><script>alert(1)</script>', type: "app", primary_language: "TS", description: null, repo_url: null, go_module: null } });
    const html = generateIndexHtml(ctx, profile, files).content;
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;");
  });
});
