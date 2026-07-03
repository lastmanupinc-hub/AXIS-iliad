import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { generateUiAudit, generateFrontendRules, generateLayoutPatterns } from "./generators-frontend.js";

// ─── POLISH (Program 4 = Frontend): honest route counts + scoring ──
// Dogfooding showed ui-audit reporting "Total Routes: 537" — the raw per-mention
// count for a ~150-endpoint app. Route sinks now go through displayRoutes.

function mkCtx(o: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 10, total_directories: 3, total_loc: 1000, file_tree_summary: [], top_level_layout: [] },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [],
    routes: o.routes ?? [],
    domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.7 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...o,
    // merge detection AFTER the spread so a partial `o.detection` (e.g. only
    // languages) keeps the other required fields (frameworks, etc.)
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null, ...(o.detection ?? {}) },
  } as ContextMap;
}

describe("ui-audit — Total Routes is the DEDUPED count, not raw per-mention rows", () => {
  it("reports distinct routes, collapsing per-file/test duplicates", () => {
    const routes = [
      { method: "GET", path: "/a", source_file: "src/server.ts" },
      { method: "GET", path: "/a", source_file: "src/server.test.ts" }, // dup
      { method: "GET", path: "/a", source_file: "README.md" },          // dup
      { method: "POST", path: "/b", source_file: "src/server.ts" },
    ];
    const out = generateUiAudit(mkCtx({ routes })).content;
    expect(out).toContain("| Total Routes | 2 |"); // /a and /b, not 4
  });

  it("the audit-score factor table shows the +50 base so it reconciles to the headline", () => {
    const out = generateUiAudit(mkCtx()).content;
    expect(out).toContain("| Base | +50 |");
  });

  it("hasCSS recognizes SASS/LESS (not just CSS/SCSS) — no false 'Unknown' styling", () => {
    const out = generateUiAudit(mkCtx({ detection: { languages: [{ name: "SASS", file_count: 3, loc: 100, loc_percent: 100 }] } as ContextMap["detection"] })).content;
    expect(out).toContain("| Styling | CSS/SCSS |");
    expect(out).not.toContain("| Styling | Unknown |");
  });
});

describe("frontend-rules + layout-patterns — routes deduped", () => {
  const dupRoutes = [
    { method: "GET", path: "/api/x", source_file: "src/server.ts" },
    { method: "GET", path: "/api/x", source_file: "src/server.test.ts" },
    { method: "GET", path: "/dash", source_file: "src/server.ts" },
    { method: "GET", path: "/dash", source_file: "src/server.test.ts" },
  ];
  it("frontend-rules Data Fetching lists a deduped, test-noise-free api route", () => {
    const out = generateFrontendRules(mkCtx({ routes: dupRoutes })).content;
    const apiRows = out.split("\n").filter((l) => l.startsWith("- `GET /api/x`"));
    expect(apiRows).toHaveLength(1);
    expect(out).not.toContain("server.test.ts");
  });
  it("layout-patterns route→layout table is deduped", () => {
    const out = generateLayoutPatterns(mkCtx({ routes: dupRoutes })).content;
    const rows = out.split("\n").filter((l) => l.startsWith("| GET /dash "));
    expect(rows).toHaveLength(1);
  });
});
