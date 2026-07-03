import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateThemeCss, generateThemeGuidelines, generateDesignTokens } from "./generators-theme.js";

function baseCtx(overrides: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000,
      file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: {
      languages: [{ name: "TypeScript", file_count: 5, loc: 1000, loc_percent: 100 }] as ContextMap["detection"]["languages"],
      frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null,
    },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.7 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...overrides,
  } as ContextMap;
}
const sf = (path: string, lines = 10): SourceFile => ({ path, content: Array.from({ length: lines }, (_, i) => `line ${i}`).join("\n"), size: lines * 7 } as SourceFile);

describe("theme-guidelines — Detected Style Files is stylesheets only (POLISH)", () => {
  const files: SourceFile[] = [
    sf("apps/web/src/index.css"),
    sf("tailwind.config.ts"),
    sf("packages/generator-core/src/generators-theme.ts"),      // source, has "theme" in name
    sf("packages/generator-core/src/generators-theme.test.ts"), // test, has "theme"
    sf("src/hooks/useTheme.ts"),                                 // source, has "theme"
    sf("packages/snapshots/src/github-token-store.ts"),         // source, has "token"
  ];
  const md = generateThemeGuidelines(baseCtx(), files).content;

  it("lists real stylesheets and CSS-framework configs", () => {
    expect(md).toContain("apps/web/src/index.css");
    expect(md).toContain("tailwind.config.ts");
  });
  it("does NOT list TS source or test files that merely have 'theme'/'token' in the path", () => {
    const section = md.split("## Detected Style Files")[1]?.split("## Component Style Usage")[0] ?? "";
    expect(section).not.toContain("generators-theme.ts");
    expect(section).not.toContain("generators-theme.test.ts");
    expect(section).not.toContain("useTheme.ts");
    expect(section).not.toContain("github-token-store.ts");
  });
  it("does not excerpt generator/test source code into the design doc", () => {
    // The old glob excerpted *.ts source under "Style File Contents".
    expect(md).not.toContain("export function generateThemeGuidelines");
  });
  it("design-tokens.json source_theme_files uses the same detector (no unrelated TS)", () => {
    const json = JSON.parse(generateDesignTokens(baseCtx(), files).content) as { source_theme_files?: string[] };
    const stf = json.source_theme_files ?? [];
    expect(stf).toContain("apps/web/src/index.css");
    expect(stf).toContain("tailwind.config.ts");
    expect(stf.some((p) => p.endsWith("generators-theme.ts"))).toBe(false);
    expect(stf.some((p) => p.includes("github-token-store"))).toBe(false);
  });
});

describe("theme routes are deduped for display (POLISH)", () => {
  // Same (method, path) appears once per referencing file (source + test); a
  // real repo yields per-mention rows. displayRoutes collapses them and drops
  // noise-only rows when a real source exists.
  const routes = [
    { path: "/a", method: "GET", source_file: "src/server.ts", handler: "h" },
    { path: "/a", method: "GET", source_file: "src/server.test.ts", handler: "h" }, // dupe + noise
    { path: "/b", method: "POST", source_file: "src/server.ts", handler: "h" },
    { path: "/b", method: "POST", source_file: "README.md", handler: "h" },          // dupe + noise
    { path: "/c", method: "PUT", source_file: "src/server.ts", handler: "h" },
  ] as ContextMap["routes"];

  it("theme.css route headline counts the deduped surface, and the buckets sum to it", () => {
    const css = generateThemeCss(baseCtx({ routes })).content;
    // 3 real routes: 1 GET, 1 POST, 1 other(PUT)
    expect(css).toContain("Routes:      3 (1 GET · 1 POST · 1 other)");
  });
  it("Route Theme Zones drops the test/README-sourced duplicates", () => {
    const md = generateThemeGuidelines(baseCtx({ routes })).content;
    const zone = md.split("## Route Theme Zones")[1]?.split("## Domain-Specific")[0] ?? "";
    // /a and /b appear once each, attributed to the real source, not the noise file
    expect(zone).toContain("src/server.ts");
    expect(zone).not.toContain("server.test.ts");
    expect(zone).not.toContain("README.md");
    expect((zone.match(/`\/a`/g) ?? []).length).toBe(1);
  });
});
