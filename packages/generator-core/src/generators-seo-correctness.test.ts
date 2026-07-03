import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { generateSeoRules, generateRoutePriorityMap, generateSchemaRecommendations, generateMetaTagAudit } from "./generators-seo.js";
import { pathHasSegment, isNoindexRoute } from "./seo-routes.js";

function mkCtx(routes: ContextMap["routes"]): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 10, total_directories: 3, total_loc: 1000, file_tree_summary: [], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes, domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.7 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
  } as ContextMap;
}

describe("seo-routes — segment matching (not substring)", () => {
  it("matches whole path segments, never incidental substrings", () => {
    expect(pathHasSegment("/auth", ["auth"])).toBe(true);
    expect(pathHasSegment("/authors", ["auth"])).toBe(false);      // the headline bug
    expect(pathHasSegment("/author/jane", ["auth"])).toBe(false);
    expect(pathHasSegment("/accounting", ["account"])).toBe(false);
    expect(pathHasSegment("/explanation", ["plan"])).toBe(false);
    expect(pathHasSegment("/user-settings", ["settings"])).toBe(true); // hyphen split
    expect(pathHasSegment("/api/pay", ["api"])).toBe(true);
  });
  it("isNoindexRoute: non-GET and internal segments are noindex; content is not", () => {
    expect(isNoindexRoute("/login", "GET")).toBe(true);
    expect(isNoindexRoute("/api/x", "GET")).toBe(true);
    expect(isNoindexRoute("/pay", "POST")).toBe(true);
    expect(isNoindexRoute("/authors", "GET")).toBe(false); // real content
    expect(isNoindexRoute("/blog/post", "GET")).toBe(false);
  });
});

describe("SEO route classification — real content is NOT de-indexed by a substring false positive", () => {
  it("`/authors` (blog author index) is treated as indexable content across generators", () => {
    const ctx = mkCtx([{ path: "/authors", method: "GET", source_file: "app/authors.tsx" }]);
    // seo-rules: WebPage (indexable), NOT a noindex action
    expect(generateSeoRules(ctx).content).not.toMatch(/`\/authors`[^\n]*noindex/i);
    // route-priority-map: indexable Yes, not in robots Disallow
    const rp = generateRoutePriorityMap(ctx).content;
    expect(rp).toMatch(/`\/authors`[^\n]*\| Yes \|/);
    expect(rp).not.toContain("Disallow: /authors");
    // schema-recommendations: emitted (WebPage), not dropped as noindex
    expect(generateSchemaRecommendations(ctx).content).toContain("/authors");
    // meta-tag-audit: gets a per-route audit (treated as a page)
    expect(generateMetaTagAudit(ctx).content).toContain("/authors");
  });

  it("`/accounting` (marketing page) is not noindex'd", () => {
    const rp = generateRoutePriorityMap(mkCtx([{ path: "/accounting", method: "GET", source_file: "app/accounting.tsx" }])).content;
    expect(rp).toMatch(/`\/accounting`[^\n]*\| Yes \|/);
  });

  it("`/login` IS noindex across all generators (agreement, no contradiction)", () => {
    const ctx = mkCtx([{ path: "/login", method: "GET", source_file: "app/login.tsx" }]);
    const rp = generateRoutePriorityMap(ctx).content;
    expect(rp).toMatch(/`\/login`[^\n]*\| No \|/);          // route-priority: noindex
    expect(rp).toContain("Disallow: /login");
    expect(generateSchemaRecommendations(ctx).content).not.toContain('"page": "/login"'); // dropped
    expect(generateMetaTagAudit(ctx).content).not.toContain('"route": "/login"');          // excluded
  });
});
