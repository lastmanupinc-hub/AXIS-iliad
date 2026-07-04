import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  generateDeployDockerfile,
  generateDeployRenderBlueprint,
  generateDeployQualificationReport,
} from "./generators-deploy.js";

function ctxWith(routes: ContextMap["routes"] = []): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [{ name: "React", version: "1", confidence: 0.9, evidence: [] }] as ContextMap["detection"]["frameworks"], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes, domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
  } as ContextMap;
}
const profile = {} as RepoProfile;
const lock = (path: string): SourceFile[] => [{ path, content: "x", size: 1 } as SourceFile];
const route = (path: string) => [{ path, method: "GET", source_file: "s.ts", handler: "h" }] as ContextMap["routes"];

// ── the Dockerfile uses the repo's real package manager (was: always `npm ci`) ──
describe("DEVELOP: Dockerfile is package-manager aware", () => {
  it("pnpm repo → corepack + pnpm install --frozen-lockfile, copies the pnpm lockfile, never `npm ci`", () => {
    const d = generateDeployDockerfile(ctxWith(), profile, lock("pnpm-lock.yaml")).content;
    expect(d).toContain("corepack enable");
    expect(d).toContain("pnpm install --frozen-lockfile");
    expect(d).toContain("pnpm-lock.yaml");
    expect(d).not.toContain("npm ci");
  });
  it("yarn repo → yarn install --frozen-lockfile", () => {
    expect(generateDeployDockerfile(ctxWith(), profile, lock("yarn.lock")).content).toContain("yarn install --frozen-lockfile");
  });
  it("bun repo → bun install --frozen-lockfile", () => {
    expect(generateDeployDockerfile(ctxWith(), profile, lock("bun.lockb")).content).toContain("bun install --frozen-lockfile");
  });
  it("npm repo (package-lock.json) → npm ci", () => {
    expect(generateDeployDockerfile(ctxWith(), profile, lock("package-lock.json")).content).toContain("npm ci");
  });
  it("packageManager field is honored when no lockfile is present", () => {
    const files = [{ path: "package.json", content: '{"packageManager":"pnpm@10.0.0"}', size: 40 } as SourceFile];
    expect(generateDeployDockerfile(ctxWith(), profile, files).content).toContain("pnpm install --frozen-lockfile");
  });
  it("no package files → defaults to npm without crashing", () => {
    expect(generateDeployDockerfile(ctxWith(), profile, []).content).toContain("npm ci");
  });
});

// ── render.yaml + the check probe the REAL health route (was: hardcoded /healthz) ──
describe("DEVELOP: healthCheckPath is derived from the repo's real health route", () => {
  it("a repo serving /v1/health gets that path in render.yaml + a PASS check", () => {
    const files: SourceFile[] = [];
    const ctx = ctxWith(route("/v1/health"));
    expect(generateDeployRenderBlueprint(ctx, profile, files).content).toContain("healthCheckPath: /v1/health");
    const report = generateDeployQualificationReport(ctx, profile, files).content;
    expect(report).toContain("Detected route /v1/health");
    expect(report).toContain("| Healthcheck route | PASS |");
  });
  it("a repo with no health route defaults to /healthz and WARNs (was: false PASS)", () => {
    const ctx = ctxWith(route("/api/users"));
    expect(generateDeployRenderBlueprint(ctx, profile, []).content).toContain("healthCheckPath: /healthz");
    expect(generateDeployQualificationReport(ctx, profile, []).content).toContain("| Healthcheck route | WARN |");
  });
});

// ── monorepo is flagged instead of silently guessing dist/index.js ──
describe("DEVELOP: a monorepo is flagged, not silently mis-targeted", () => {
  it("pnpm-workspace.yaml → a Monorepo entrypoint WARN + a Dockerfile note", () => {
    const files = lock("pnpm-workspace.yaml");
    expect(generateDeployQualificationReport(ctxWith(), profile, files).content).toContain("| Monorepo entrypoint | WARN |");
    expect(generateDeployDockerfile(ctxWith(), profile, files).content).toContain("monorepo detected");
  });
  it("a single-app repo emits no monorepo warning", () => {
    expect(generateDeployQualificationReport(ctxWith(), profile, lock("package-lock.json")).content).not.toContain("Monorepo entrypoint");
  });
});
