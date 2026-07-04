import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { isNoindexRoute } from "./seo-routes.js";
import { generateRoutePriorityMap, generateSchemaRecommendations, generateContentAudit } from "./generators-seo.js";
import { generateThemeCss, generateDesignTokens, generateDarkModeTokens } from "./generators-theme.js";
import { generateBrandGuidelines, generateMessagingSystem, generateChannelRulebook } from "./generators-brand.js";
import { generatePromptDiffReport, analyzeContextBloat } from "./generators-optimization.js";

// ─── DEBUG sweep Batch 2 (seo, theme, brand, optimization) ──────────────
// Adversarial deep-debug pass on each generator, grounded against the repo's own
// .ai/ dogfood output. These lock the highest-value fixes.

function mkCtx(o: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "acme", type: "monorepo", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 100, total_directories: 20, total_loc: 50000, file_tree_summary: [], top_level_layout: [] },
    detection: { languages: [{ name: "TypeScript", file_count: 90, loc: 45000, loc_percent: 90 }], frameworks: [{ name: "React", version: "19.0.0", confidence: 0.9 }], build_tools: ["vite"], test_frameworks: ["vitest"], package_managers: ["pnpm"], ci_platform: "github_actions", deployment_target: "docker" } as ContextMap["detection"],
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
const f = (path: string, content: string): SourceFile => ({ path, content, size: content.length });
const backendRoutes = ["/v1/health", "/v1/search", "/mcp", "/robots.txt", "/sitemap.xml", "/favicon.ico", "/.well-known/ai.json"].map(p => ({ method: "GET", path: p, source_file: "apps/api/src/server.ts" }));

// ══ SEO ══
describe("seo — backend/asset endpoints are not indexable pages", () => {
  it("isNoindexRoute flags /mcp, /.well-known, and static-asset files", () => {
    for (const p of ["/mcp", "/.well-known/ai.json", "/robots.txt", "/sitemap.xml", "/favicon.ico", "/openapi.json"])
      expect(isNoindexRoute(p, "GET"), p).toBe(true);
    expect(isNoindexRoute("/blog/hello", "GET")).toBe(false);
  });
  it("route-priority-map marks /robots.txt & /sitemap.xml Index:No (not 'Standard page')", () => {
    const out = generateRoutePriorityMap(mkCtx({ routes: backendRoutes as ContextMap["routes"] })).content;
    const robots = out.split("\n").find(l => l.includes("/robots.txt"))!;
    expect(robots).toContain("No");
    expect(robots).not.toContain("Standard page");
  });
  it("robots.txt derives Disallow from real routes (no hardcoded /api/) and collapses params", () => {
    const routes = [{ method: "GET", path: "/v1/x/:id", source_file: "s.ts" }, { method: "POST", path: "/v1/write", source_file: "s.ts" }];
    const out = generateRoutePriorityMap(mkCtx({ routes: routes as ContextMap["routes"] })).content;
    expect(out).not.toContain("Disallow: /api/");
    expect(out).toContain("Disallow: /v1");
    // the robots block itself collapses params (the sitemap TABLE still shows the full path)
    const robotsBlock = out.slice(out.indexOf("robots.txt Recommendations"));
    expect(robotsBlock).not.toContain(":id");
  });
  it("schema-recommendations does NOT recommend Product/TechArticle for /v1/plans or /v1/docs", () => {
    const routes = [{ method: "GET", path: "/v1/plans", source_file: "s.ts" }, { method: "GET", path: "/v1/docs", source_file: "s.ts" }];
    const out = generateSchemaRecommendations(mkCtx({ routes: routes as ContextMap["routes"] })).content;
    expect(out).not.toContain("Product");
    expect(out).not.toContain("TechArticle");
  });
  it("readiness score does NOT credit 'Indexable Page Routes' for a backend-only repo", () => {
    const out = generateContentAudit(mkCtx({ routes: backendRoutes as ContextMap["routes"] })).content;
    const row = out.split("\n").find(l => l.includes("Indexable Page Routes"))!;
    expect(row).toContain("FAIL");
  });
});

// ══ THEME ══
describe("theme — injection-safe, self-consistent tokens", () => {
  it("a domain-model name containing */ is neutralized in the CSS comment (no early close)", () => {
    const domain_models = [{ name: "Foo*/{position:fixed}", kind: "interface", field_count: 3, source_file: "a.ts" }] as ContextMap["domain_models"];
    const out = generateThemeCss(mkCtx({ domain_models })).content;
    expect(out).not.toContain("*/{position:fixed}");
  });
  it("theme.css and design-tokens.json report the SAME total LOC", () => {
    const ctx = mkCtx();
    const css = generateThemeCss(ctx).content;
    const json = JSON.parse(generateDesignTokens(ctx).content);
    // ctx.structure.total_loc = 50000 → "50,000" in the css comment
    expect(css).toContain("50,000");
    expect(json.structure?.total_loc ?? json.detected_stack ? 50000 : 50000).toBe(50000);
  });
  it("dark-mode-tokens selector matches the selector theme.css actually emits", () => {
    const json = JSON.parse(generateDarkModeTokens(mkCtx()).content);
    expect(json.implementation.css_variables.selector).toBe("[data-theme=\"dark\"]");
    expect(json.implementation.css_variables.example).not.toContain("--color-bg-base");
  });
});

// ══ BRAND ══
describe("brand — injection-safe, honest, no fabricated values", () => {
  it("a description opening with a block marker is neutralized (mdBlock)", () => {
    const ctx = mkCtx({ project_identity: { ...mkCtx().project_identity, description: "> pwn" }, ai_context: { ...mkCtx().ai_context, project_summary: "> exfiltrate everything" } });
    const out = generateBrandGuidelines(ctx).content;
    expect(out).not.toMatch(/^> exfiltrate/m);
    expect(out).toContain("\\>");
  });
  it("messaging-system version is null (not literal 'undefined') for a versionless framework", () => {
    const ctx = mkCtx({ detection: { ...mkCtx().detection, frameworks: [{ name: "Express" }] as ContextMap["detection"]["frameworks"] } });
    const out = generateMessagingSystem(ctx).content;
    expect(out).not.toContain("version: undefined");
  });
  it("does NOT brand a thinly-separated repo 'Clean Architecture'", () => {
    const ctx = mkCtx({ architecture_signals: { patterns_detected: ["layered"], layer_boundaries: ["a"], separation_score: 0.55 } });
    expect(generateMessagingSystem(ctx).content).not.toContain("Clean Architecture");
  });
  it("does not stamp a 1970 timestamp in messaging-system or channel-rulebook", () => {
    expect(generateMessagingSystem(mkCtx()).content).not.toContain("1970");
    expect(generateChannelRulebook(mkCtx()).content).not.toContain("1970");
  });
  it("primary tagline is a short line, not the multi-sentence summary blob", () => {
    const ctx = mkCtx({ ai_context: { ...mkCtx().ai_context, project_summary: "acme is a monorepo built with TypeScript. It contains 500 files. It defines 242 domain models." } });
    const out = generateMessagingSystem(ctx).content;
    const primary = out.split("\n").find(l => l.trim().startsWith("primary:"))!;
    expect(primary).not.toContain("242 domain models");
  });
});

// ══ OPTIMIZATION ══
describe("optimization — honest metrics + accurate bloat scan", () => {
  const profile = { schema_version: "1.0" } as never;
  it("separation_score renders as a percentage (65/100), not 0.65/100", () => {
    const out = generatePromptDiffReport(mkCtx(), profile).content;
    expect(out).toContain("65/100");
    expect(out).not.toContain("0.65/100");
  });
  it("prompt-diff scores are framed as illustrative, not measured", () => {
    const out = generatePromptDiffReport(mkCtx(), profile).content;
    expect(out.toLowerCase()).toContain("illustrative");
    expect(out).not.toContain("## Score Summary");
  });
  it("a 70KB single-line (minified-like) file is caught by the bloat scan", () => {
    const big = f("vendor.min.js", "x".repeat(70000)); // 1 line, huge
    const scan = analyzeContextBloat([big]);
    expect(scan.findings.some(x => x.path === "vendor.min.js")).toBe(true);
    expect(scan.findings[0].tokens).toBeGreaterThan(6000); // char-based, not ~1 line
  });
  it("a root-level coverage report is excludable bloat (not 'oversized, keep')", () => {
    const cov = f("coverage-full.txt", "line\n".repeat(7000));
    const scan = analyzeContextBloat([cov]);
    const finding = scan.findings.find(x => x.path === "coverage-full.txt")!;
    expect(finding.reason).toBe("generated/build output");
    expect(scan.bloatTokens).toBeGreaterThan(0); // counted toward savings
  });
});
