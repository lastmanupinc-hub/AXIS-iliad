import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { generateDebugPlaybook, generateTracingRules } from "./generators-debug.js";

// ─── POLISH (Program 3 = Debug): route dedup + caps kill the bloat ──
//
// Dogfooding against the Iliad repo produced an 83KB debug-playbook.md whose
// Route Map was 537 rows — 68% from .test files, with exact duplicates — and a
// 437-row model table. displayRoutes (dedup + prefer non-test) + display caps
// bring that to ~16KB of real, focused content.

function mkCtx(o: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0",
    snapshot_id: "s",
    project_id: "p",
    generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "acme", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 10, total_directories: 3, total_loc: 1000, file_tree_summary: [], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [],
    routes: o.routes ?? [],
    domain_models: o.domain_models ?? [],
    sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.7 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...o,
  } as ContextMap;
}

const routeRows = (content: string) => content.split("\n").filter((l) => /^\| (GET|POST|PUT|DELETE|PATCH) /.test(l));

describe("debug Route Map — dedup + cap", () => {
  it("drops test-only duplicates and prefers the non-test source attribution", () => {
    const ctx = mkCtx({
      routes: [
        { method: "GET", path: "/health", source_file: "src/server.test.ts" },
        { method: "GET", path: "/health", source_file: "src/server.ts" }, // real → wins
        { method: "POST", path: "/__mock", source_file: "src/x.test.ts" }, // test-only → dropped
      ],
    });
    const rows = routeRows(generateDebugPlaybook(ctx).content);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("/health");
    expect(rows[0]).toContain("src/server.ts"); // non-test attribution
    expect(rows[0]).not.toContain(".test.");
    expect(generateDebugPlaybook(ctx).content).not.toContain("/__mock");
  });

  it("caps the Route Map at 50 with an honest '… N more' note", () => {
    const routes = Array.from({ length: 66 }, (_, i) => ({ method: "GET", path: `/r${i}`, source_file: "src/app.ts" }));
    const out = generateDebugPlaybook(mkCtx({ routes })).content;
    expect(routeRows(out)).toHaveLength(50);
    expect(out).toContain("*… 16 more*"); // 66 − 50
  });

  it("tracing-rules API Routes is capped the same way", () => {
    const routes = Array.from({ length: 60 }, (_, i) => ({ method: "GET", path: `/t${i}`, source_file: "src/app.ts" }));
    const out = generateTracingRules(mkCtx({ routes })).content;
    expect(routeRows(out)).toHaveLength(50);
    expect(out).toContain("*… 10 more*");
  });
});

describe("debug Domain Model Inventory — cap", () => {
  it("caps the model table at 30 with an honest '… N more' note", () => {
    const domain_models = Array.from({ length: 42 }, (_, i) => ({
      name: `Model${i}`, kind: "interface", language: "TypeScript", field_count: 3, source_file: `m${i}.ts`,
    })) as ContextMap["domain_models"];
    const out = generateDebugPlaybook(mkCtx({ domain_models })).content;
    const modelRows = out.split("\n").filter((l) => l.startsWith("| Model") && /\| interface \|/.test(l));
    expect(modelRows).toHaveLength(30);
    expect(out).toContain("*… 12 more*"); // 42 − 30
  });
});
