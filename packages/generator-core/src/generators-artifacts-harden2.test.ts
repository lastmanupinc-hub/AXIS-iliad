import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generatePrd, generateTasksMd, generateContextMd, generateArtifactSpec } from "./generators-artifacts.js";

const profile = {} as RepoProfile;
const files: SourceFile[] = [];

function ctxWith(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 1234, total_directories: 56, total_loc: 78901, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...over,
  } as ContextMap;
}
const langCtx = (lang: string) => ctxWith({ project_identity: { name: "app", type: "app", primary_language: lang, description: null, repo_url: null, go_module: null } });

// #4 — CI honesty
describe("HARDEN-2/POLISH-2: tasks.md doesn't assert a single CI platform as fact", () => {
  it("offers a menu when no CI is detected", () => {
    const c = generateTasksMd(ctxWith(), profile, files).content;
    expect(c).toContain("GitHub Actions / GitLab CI / CircleCI");
    expect(c).not.toMatch(/every PR \(GitHub Actions\)/); // not the bare single claim
  });
});

// #5 — test command keys off the real language
describe("HARDEN-2/POLISH-2: prd.md build/test command matches the primary language", () => {
  it("Go → go test, Python → pytest, Rust → cargo test, TS → npm test", () => {
    expect(generatePrd(langCtx("Go"), profile, files).content).toContain("go test ./...");
    expect(generatePrd(langCtx("Python"), profile, files).content).toContain("pytest");
    expect(generatePrd(langCtx("Rust"), profile, files).content).toContain("cargo test");
    expect(generatePrd(langCtx("TypeScript"), profile, files).content).toContain("npm test");
    // a Python repo is NOT told to run npm test
    expect(generatePrd(langCtx("Python"), profile, files).content).not.toContain("npm test");
  });
});

// #7 — determinism: locale-pinned number formatting
describe("HARDEN-2/POLISH-2: context.md stat numbers are locale-pinned (en-US)", () => {
  it("formats counts with en-US grouping regardless of host locale", () => {
    const c = generateContextMd(ctxWith(), profile, files).content;
    expect(c).toContain("1,234"); // total_files
    expect(c).toContain("78,901"); // total_loc
  });
});

// #8 — no dangling section headings on an empty repo
describe("HARDEN-2/POLISH-2: artifact-spec.md emits no heading without a body", () => {
  it("omits ## Language Distribution and ## Architecture when both are empty", () => {
    const c = generateArtifactSpec(ctxWith(), profile, files).content;
    expect(c).not.toContain("## Language Distribution");
    expect(c).not.toContain("## Architecture");
  });
  it("still emits ## Language Distribution when languages exist", () => {
    const c = generateArtifactSpec(ctxWith({ detection: { ...ctxWith().detection, languages: [{ name: "TypeScript", file_count: 5, loc: 100, loc_percent: 90 }] as ContextMap["detection"]["languages"] } }), profile, files).content;
    expect(c).toContain("## Language Distribution");
  });
});

// #10 — method plural guard uses the same normalization as the count
describe("HARDEN-2/POLISH-2: single-method route set reads '1 method' (singular)", () => {
  it("pluralizes on the normalized method set", () => {
    const routes = [{ path: "/a", method: "GET", source_file: "src/a.ts", handler: "h" }, { path: "/b", method: "GET", source_file: "src/b.ts", handler: "h" }] as ContextMap["routes"];
    expect(generateContextMd(ctxWith({ routes }), profile, files).content).toContain("(1 method)");
  });
});
