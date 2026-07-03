import { describe, it, expect } from "vitest";
import { parse } from "yaml";
import type { ContextMap } from "@axis/context-engine";
import { generateMessagingSystem, generateChannelRulebook } from "./generators-brand.js";

function ctxWith(routes: ContextMap["routes"]): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes, domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.3 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
  } as ContextMap;
}
// Same (method, path) appears once per referencing file (source + test + README).
const routes = [
  { path: "/a", method: "GET", source_file: "src/server.ts", handler: "h" },
  { path: "/a", method: "GET", source_file: "src/server.test.ts", handler: "h" }, // dupe + noise
  { path: "/b", method: "POST", source_file: "src/server.ts", handler: "h" },
  { path: "/b", method: "POST", source_file: "README.md", handler: "h" },          // dupe + noise
  { path: "/support", method: "GET", source_file: "src/server.ts", handler: "h" },
  { path: "/support", method: "GET", source_file: "src/s.test.ts", handler: "h" }, // dupe + noise
] as ContextMap["routes"];

describe("brand messaging routes are deduped (POLISH)", () => {
  const y = parse(generateMessagingSystem(ctxWith(routes)).content) as {
    value_propositions: Array<{ id: string; headline: string }>;
    feature_messages: { api_surface: { count: number; routes: string[] } };
  };
  it("api_surface count is the deduped real surface (3), not the 6 per-mention rows", () => {
    expect(y.feature_messages.api_surface.count).toBe(3);
  });
  it("the api_surface value-prop headline matches the deduped count", () => {
    const vp = y.value_propositions.find((v) => v.id === "api_surface");
    expect(vp?.headline).toBe("3 API Endpoints");
  });
  it("the routes list carries no duplicate METHOD PATH", () => {
    const list = y.feature_messages.api_surface.routes;
    expect(new Set(list).size).toBe(list.length);
    expect(list).toHaveLength(3);
  });
});

describe("brand channel support routes are deduped (POLISH)", () => {
  it("lists /support once, attributed to real source (not the test-file dupe)", () => {
    const md = generateChannelRulebook(ctxWith(routes)).content;
    const line = md.split("\n").find((l) => l.includes("Detected support routes")) ?? "";
    expect(line).toContain("/support");
    // one occurrence of the path in the cell, not two
    expect((line.match(/\/support/g) ?? []).length).toBe(1);
  });
});
