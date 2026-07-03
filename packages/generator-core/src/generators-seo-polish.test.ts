import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { generateSeoRules, generateRoutePriorityMap, generateMetaTagAudit, generateContentAudit } from "./generators-seo.js";

function mkCtx(o: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 10, total_directories: 3, total_loc: 1000, file_tree_summary: o.structure?.file_tree_summary ?? [], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: o.routes ?? [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.7 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...o,
  } as ContextMap;
}

const routeRows = (c: string) => c.split("\n").filter((l) => l.startsWith("| `/"));

describe("SEO route tables — deduped + capped", () => {
  it("seo-rules Route SEO Audit dedups per-mention rows and drops test-only routes", () => {
    const routes = [
      { method: "GET", path: "/pricing", source_file: "app/pricing.tsx" },
      { method: "GET", path: "/pricing", source_file: "app/pricing.test.tsx" }, // dup/test
      { method: "GET", path: "/__mock", source_file: "x.test.ts" },              // test-only
    ];
    const rows = routeRows(generateSeoRules(mkCtx({ routes })).content).filter((l) => l.includes("/pricing") || l.includes("/__mock"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("/pricing");
  });

  it("seo-rules caps the Route SEO Audit at 60 with an honest '… N more' note", () => {
    const routes = Array.from({ length: 75 }, (_, i) => ({ method: "GET", path: `/p${i}`, source_file: "app/x.tsx" }));
    const out = generateSeoRules(mkCtx({ routes })).content;
    expect(routeRows(out)).toHaveLength(60);
    expect(out).toContain("*… 15 more*");
  });

  it("route-priority-map sitemap table is deduped + capped", () => {
    const routes = Array.from({ length: 70 }, (_, i) => ({ method: "GET", path: `/r${i}`, source_file: "app/x.tsx" }));
    const out = generateRoutePriorityMap(mkCtx({ routes })).content;
    expect(routeRows(out)).toHaveLength(60);
    expect(out).toContain("*… 10 more*");
  });

  it("meta-tag-audit per-route budget holds DISTINCT routes (no /health ×3)", () => {
    const routes = [
      { method: "GET", path: "/health", source_file: "app/a.ts" },
      { method: "GET", path: "/health", source_file: "app/b.ts" },
      { method: "GET", path: "/health", source_file: "app/c.ts" },
      { method: "GET", path: "/about", source_file: "app/about.tsx" },
    ];
    const audit = JSON.parse(generateMetaTagAudit(mkCtx({ routes })).content) as { per_route_audit: Array<{ route: string }> };
    const paths = audit.per_route_audit.map((r) => r.route);
    expect(new Set(paths).size).toBe(paths.length); // all distinct
    expect(paths).toContain("/health");
    expect(paths.filter((p) => p === "/health")).toHaveLength(1);
  });
});

describe("content-audit — honesty fixes", () => {
  it("has_readme matches a README anywhere in the tree, not only at root", () => {
    const ctx = mkCtx({ structure: { file_tree_summary: [{ path: "docs/README.md", type: "file", language: "Markdown", loc: 10 }] } as ContextMap["structure"] });
    const out = generateContentAudit(ctx).content;
    // README row passes
    expect(out).toMatch(/\| Has README \| PASS \|/);
  });

  it("the readiness score is honestly labelled as SEO + engineering, with a caveat", () => {
    const out = generateContentAudit(mkCtx()).content;
    expect(out).toContain("## SEO & Engineering Readiness Score");
    expect(out).toContain("engineering hygiene alone won't index a client-only SPA");
  });
});
