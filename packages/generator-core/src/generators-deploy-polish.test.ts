import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  generateDeployComposeDev,
  generateDeployScriptCloudflareBash,
  generateDeployWranglerContainers,
  generateDeployDockerignore,
  generateDeployQualificationReport,
} from "./generators-deploy.js";

function ctxWith(frameworks: string[] = ["React"]): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "myapp", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
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

// ── compose is honest + the exposed debugger port actually works ──
describe("POLISH: docker-compose.dev is honest and its 9229 debugger is functional", () => {
  const c = generateDeployComposeDev(ctxWith(), profile, files).content;
  it("opens the inspector on the exposed 9229 port (was: port exposed but nothing listened)", () => {
    expect(c).toContain("--inspect=0.0.0.0:9229");
  });
  it("makes env_file optional so `docker compose up` doesn't abort on a missing .env.dev", () => {
    expect(c).toContain("required: false");
  });
  it("drops the untrue 'hot reload' claim and the image-defeating source bind-mount", () => {
    expect(c).not.toContain("hot reload");
    expect(c).not.toContain("../:/app");
  });
});

// ── `auto` picks the DETECTED target, not always Pages ──
describe("POLISH: deploy-cloudflare.sh auto resolves to the detected target", () => {
  it("a backend (node-server) auto-targets Containers, not Pages", () => {
    const c = generateDeployScriptCloudflareBash(ctxWith(["React"]), profile, files).content;
    expect(c).toMatch(/auto\|""\)\s+run_pages=0; run_containers=1/);
  });
  it("a static frontend (Vite, no server framework) auto-targets Pages", () => {
    const c = generateDeployScriptCloudflareBash(ctxWith(["Vite"]), profile, files).content;
    expect(c).toMatch(/auto\|""\)\s+run_pages=1; run_containers=0/);
  });
});

// ── wrangler paths are relative to the config's own directory ──
describe("POLISH: wrangler.containers.toml paths resolve (config lives in deploy/)", () => {
  const c = generateDeployWranglerContainers(ctxWith(), profile, files).content;
  it("main + image are relative to deploy/, not double-prefixed", () => {
    expect(c).toContain('main = "worker.ts"');
    expect(c).toContain('image = "./Dockerfile"');
    expect(c).not.toContain('deploy/worker.ts');
    expect(c).not.toContain('./deploy/Dockerfile');
  });
});

// ── the .dockerignore is emitted where Docker/BuildKit actually reads it ──
describe("POLISH: .dockerignore is emitted as deploy/Dockerfile.dockerignore (BuildKit-read)", () => {
  it("uses the Dockerfile-adjacent name so it isn't inert", () => {
    expect(generateDeployDockerignore(ctxWith(), profile, files).path).toBe("deploy/Dockerfile.dockerignore");
  });
});

// ── the report no longer over-claims ──
describe("POLISH: qualification report drops the 'without manual edits' over-claim", () => {
  it("does not promise zero manual edits while shipping REPLACE_OWNER placeholders", () => {
    const c = generateDeployQualificationReport(ctxWith(), profile, files).content;
    expect(c).not.toContain("without manual edits");
    expect(c).toContain("minimal setup");
  });
});
