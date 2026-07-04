import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateCloserDockerfile, generateCloserDockerCompose, generateMakefileWithShipTarget } from "./generators-closer.js";

function ctxWith(over: Partial<ContextMap["project_identity"]> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "myproj", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null, ...over },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
  } as ContextMap;
}
const profile = { project: { primary_language: "TypeScript" }, health: { separation_score: 0.5 } } as unknown as RepoProfile;
const files: SourceFile[] = [];

// #POLISH-2: no empty `source=""` LABEL when the repo has no URL; the label appears when it does.
describe("POLISH-2: Dockerfile omits the source LABEL when repo_url is absent", () => {
  it("no empty source label when repo_url is null", () => {
    const c = generateCloserDockerfile(ctxWith({ repo_url: null }), profile, files).content;
    expect(c).not.toContain('image.source=""');
    expect(c).toContain('image.title="myproj"');
  });
  it("emits the source label when repo_url is present", () => {
    const c = generateCloserDockerfile(ctxWith({ repo_url: "https://github.com/o/r" }), profile, files).content;
    expect(c).toContain('image.source="https://github.com/o/r"');
  });
});

// #POLISH-2: an empty project name must not slug to invalid `image: :latest` / `:latest`.
describe("POLISH-2: an empty project name still yields a valid image tag", () => {
  it("docker-compose image/container_name fall back to a slug, not empty", () => {
    const c = generateCloserDockerCompose(ctxWith({ name: "" }), profile, files).content;
    expect(c).not.toContain("image: :latest");
    expect(c).toContain("image: app:latest");
    expect(c).not.toMatch(/container_name:\s*$/m);
  });
  it("Makefile package/ship-summary image tag is never bare ':latest'", () => {
    const c = generateMakefileWithShipTarget(ctxWith({ name: "" }), profile, files).content;
    expect(c).not.toMatch(/\s:latest/);
    expect(c).toContain("app:latest");
  });
});
