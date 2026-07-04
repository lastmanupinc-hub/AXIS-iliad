import { describe, it, expect } from "vitest";
import ts from "typescript";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  generateDeployScriptPwsh,
  generateDeployVSCodeLaunchTemplate,
  generateDeployContainersWorker,
} from "./generators-deploy.js";

function ctxWith(frameworks: string[] = ["React"]): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: frameworks.map(name => ({ name, version: "1", confidence: 0.9, evidence: [] })) as ContextMap["detection"]["frameworks"], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
  } as ContextMap;
}
const profile = {} as RepoProfile;
const files: SourceFile[] = [];

// #POLISH-2: the PowerShell error message shows `$env:` literally, not `\$env:`.
describe("POLISH-2: deploy.ps1 renders $env: without a stray backslash", () => {
  it("uses a single-quoted throw so $env: is literal", () => {
    const c = generateDeployScriptPwsh(ctxWith(), profile, files).content;
    expect(c).toContain("$env:GHCR_OWNER");
    expect(c).not.toContain("\\$env:GHCR_OWNER");
  });
});

// #POLISH-2: a static frontend gets a browser debug config, not a dead node:9229 attach
// (the static image is nginx and the compose exposes no 9229 for it).
describe("POLISH-2: node-static gets a working (browser) debug config", () => {
  it("static stack → an msedge browser launch, not a node inspector attach", () => {
    const payload = JSON.parse(
      generateDeployVSCodeLaunchTemplate(ctxWith(["Vite"]), profile, files).content
        .split("\n").filter(l => !l.trim().startsWith("//")).join("\n"),
    );
    const cfg = payload.configurations[0];
    expect(cfg.type).toBe("msedge");
    expect(cfg.url).toContain("localhost:8080");
    expect(payload.configurations.some((c: { port?: number }) => c.port === 9229)).toBe(false);
  });
  it("node-server still gets the node:9229 attach", () => {
    const payload = JSON.parse(
      generateDeployVSCodeLaunchTemplate(ctxWith(["React"]), profile, files).content
        .split("\n").filter(l => !l.trim().startsWith("//")).join("\n"),
    );
    expect(payload.configurations.some((c: { port?: number }) => c.port === 9229)).toBe(true);
  });
});

// #POLISH-2: the worker documents its single-instance routing (vs max_instances=5)
// and stays valid TypeScript.
describe("POLISH-2: worker.ts is honest about single-instance routing", () => {
  it("carries the scale-out guidance and parses as TS", () => {
    const c = generateDeployContainersWorker(ctxWith(), profile, files).content;
    expect(c).toContain("max_instances");
    const errs = ts.transpileModule(c, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.Latest, isolatedModules: false } }).diagnostics ?? [];
    expect(errs.filter(d => d.category === ts.DiagnosticCategory.Error)).toHaveLength(0);
  });
});
