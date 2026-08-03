import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateArchitectureDiagram } from "./generators-canvas.js";

const profile = {} as RepoProfile;

function ctxWith(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "widget-app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: {
      total_files: 5, total_directories: 2, total_loc: 1000,
      file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"],
      top_level_layout: [
        { name: "apps", purpose: "application_source", file_count: 10 },
        { name: "packages", purpose: "library_source", file_count: 6 },
        { name: "docs", purpose: "documentation", file_count: 2 },
      ],
    },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
    dependency_graph: {
      external_dependencies: [],
      internal_imports: [
        { source: "apps/api/src/index.ts", target: "packages/core/src/index.ts" },
        { source: "apps/api/src/index.ts", target: "packages/core/src/utils.ts" },
        { source: "apps/web/src/App.tsx", target: "packages/core/src/index.ts" },
        { source: "apps/api/src/index.ts", target: "apps/api/src/router.ts" }, // same top-level dir — must be dropped
        { source: "packages/core/src/index.ts", target: "packages/core/src/helpers.ts" }, // same dir — dropped
      ],
      hotspots: [],
    },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...over,
  } as ContextMap;
}

describe("generateArchitectureDiagram", () => {
  it("returns real D2 source with the correct path and content type", () => {
    const file = generateArchitectureDiagram(ctxWith(), profile, [] as SourceFile[]);
    expect(file.path).toBe("architecture-diagram.d2");
    expect(file.content_type).toBe("text/vnd.d2");
    expect(file.program).toBe("canvas");
  });

  it("emits a node for every top-level directory that participates in a REAL cross-directory import", () => {
    const content = generateArchitectureDiagram(ctxWith(), profile, [] as SourceFile[]).content;
    expect(content).toContain('"apps"');
    expect(content).toContain('"packages"');
    // docs has file_count but zero real edges — must NOT appear as a node.
    expect(content).not.toContain('"docs"');
  });

  it("dedupes and counts real edges between the same two directories, dropping same-directory (non-cross-module) imports", () => {
    const content = generateArchitectureDiagram(ctxWith(), profile, [] as SourceFile[]).content;
    // apps -> packages appears twice in internal_imports (index.ts->index.ts, index.ts->utils.ts)
    // plus once from App.tsx -> index.ts = 3 total, collapsed into ONE edge with count "3".
    expect(content).toContain('"apps" -> "packages": "3"');
    // Same-directory imports (apps/api -> apps/api, packages/core -> packages/core) must not appear as edges at all.
    expect(content.match(/->/g)?.length).toBe(1);
  });

  it("reports an honest empty diagram (not a fabricated one) when there are no cross-directory imports at all", () => {
    const content = generateArchitectureDiagram(
      ctxWith({ dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] } }),
      profile,
      [] as SourceFile[],
    ).content;
    expect(content).toContain("No cross-directory imports detected");
    expect(content).not.toContain("->");
  });

  it("caps at 30 edges, keeping the strongest (highest-count) real signals first", () => {
    const manyImports: Array<{ source: string; target: string }> = [];
    for (let i = 0; i < 40; i++) {
      manyImports.push({ source: `dir${i}/a.ts`, target: `other${i}/b.ts` });
    }
    const ctx = ctxWith({
      structure: {
        total_files: 5, total_directories: 2, total_loc: 1000,
        file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"],
        top_level_layout: [],
      },
      dependency_graph: { external_dependencies: [], internal_imports: manyImports, hotspots: [] },
    });
    const content = generateArchitectureDiagram(ctx, profile, [] as SourceFile[]).content;
    const edgeCount = content.split("\n").filter((l) => l.includes("->")).length;
    expect(edgeCount).toBe(30);
  });
});
