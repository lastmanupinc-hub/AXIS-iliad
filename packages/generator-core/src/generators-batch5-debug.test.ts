import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateCommerceRegistry, generateProductSchema } from "./generators-agentic-purchasing.js";
import { generateExportManifest, generateCollectionMap } from "./generators-algorithmic.js";
import { generatePackagingLicense, generateCloserCiWorkflow } from "./generators-closer.js";
import { generateDeployDockerfile } from "./generators-deploy.js";

// ─── DEBUG sweep Batch 5 (algorithmic, agentic-purchasing, closer, deploy) ──
// Grounded against the repo's own .ai/ dogfood output. Locks the key fixes.

function mkCtx(o: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "1970-01-01T00:00:00.000Z",
    project_identity: { name: "acme", type: "monorepo", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 500, total_directories: 20, total_loc: 50000, file_tree_summary: [], top_level_layout: [] },
    detection: { languages: [{ name: "TypeScript", file_count: 300, loc: 45000, loc_percent: 90 }], frameworks: [{ name: "React", version: "19.0.0", confidence: 0.9 }], build_tools: ["vite"], test_frameworks: ["vitest"], package_managers: ["pnpm"], ci_platform: null, deployment_target: "docker" } as ContextMap["detection"],
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [],
    routes: [],
    domain_models: [],
    sql_schema: [],
    architecture_signals: { patterns_detected: ["layered"], layer_boundaries: [], separation_score: 0.65 },
    ai_context: { project_summary: "acme is a monorepo.", key_abstractions: [], conventions: [], warnings: [] },
    ...o,
  } as ContextMap;
}
const profile = { project: { name: "acme", type: "monorepo", primary_language: "TypeScript" } } as never;
const f = (path: string, content = ""): SourceFile => ({ path, content, size: content.length });

// ══ AGENTIC-PURCHASING ══
describe("agentic-purchasing — evidence-gated verdicts, correct CE 3.0 codes", () => {
  it("a non-payments repo is NOT declared ready_for_autonomous_purchase", () => {
    const schema = JSON.parse(generateProductSchema(mkCtx(), profile, [f("src/index.ts", "export const x = 1;")]).content);
    const flat = JSON.stringify(schema);
    expect(flat).toContain('"ready_for_autonomous_purchase":false');
    expect(flat).not.toContain('"ready_for_autonomous_purchase":true');
  });
  it("CE 3.0 target_reason_codes is 10.4 only (not 10.2/10.3 card-present)", () => {
    const flat = JSON.stringify(JSON.parse(generateCommerceRegistry(mkCtx(), profile, []).content));
    expect(flat).toContain('"target_reason_codes":["10.4"]');
    expect(flat).not.toContain('"10.2"');
  });
});

// ══ ALGORITHMIC ══
describe("algorithmic — consistent counts, complete manifest", () => {
  it("export-manifest declares all 5 artifacts incl. variation-matrix", () => {
    const out = generateExportManifest(mkCtx(), profile).content;
    expect(out).toContain("total_artifacts: 5");
    expect(out).toContain("variation-matrix.json");
  });
  it("collection-map node count is the derived formula (matches the sketch), not raw sum", () => {
    const ctx = mkCtx({ entry_points: [{ path: "a.ts", type: "app", description: "" }] as ContextMap["entry_points"], dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [{ path: "h.ts", inbound_count: 5, outbound_count: 3, risk_score: 0.9 }] } });
    const out = generateCollectionMap(ctx).content;
    // 1*3 + 1*2 = 5 (derived), NOT 1+1 = 2 (raw sum)
    expect(out).toMatch(/\*\*Nodes\*\*:\s*5\b/);
  });
});

// ══ CLOSER ══
describe("closer — no false 1970 dates, honest CI matrix", () => {
  it("LICENSE does not stamp a 1970 copyright year", () => {
    const out = generatePackagingLicense(mkCtx(), profile).content;
    expect(out).not.toContain("1970");
    expect(out).toContain("<YEAR>");
  });
  it("CI workflow uses a real Node-version matrix [20, 22]", () => {
    const out = generateCloserCiWorkflow(mkCtx()).content;
    expect(out).toContain("node: [20, 22]");
  });
});

// ══ DEPLOY ══
describe("deploy — correct package manager + install", () => {
  it("detects pnpm from pnpm-workspace.yaml even without a committed lock", () => {
    const files = [f("pnpm-workspace.yaml", "packages:\n  - apps/*"), f("apps/api/package.json", "{}")];
    const out = generateDeployDockerfile(mkCtx(), profile, files).content;
    expect(out).toContain("pnpm install --frozen-lockfile");
    expect(out).not.toContain("npm ci");
  });
  it("the npm fallback guards `npm ci` on the lockfile's presence", () => {
    // no lockfile, no pnpm signal → falls back to npm, but conditionally
    const out = generateDeployDockerfile(mkCtx({ detection: { ...mkCtx().detection, package_managers: [] } }), profile, [f("index.js", "x")]).content;
    if (out.includes("npm ci")) expect(out).toContain("if [ -f package-lock.json ]");
  });

  // ─── H0.7: the three 1261357 fixes that shipped WITHOUT their claimed locks ──

  it("reads packageManager from the ROOT package.json, not the first nested walk match", () => {
    // No lockfiles; the NESTED manifest comes FIRST in the walk order and has
    // no packageManager field; the ROOT one declares yarn. Pre-fix, .find()
    // took the nested file and the Dockerfile fell back to npm.
    const files = [
      f("apps/api/package.json", JSON.stringify({ name: "api" })),
      f("package.json", JSON.stringify({ name: "acme", packageManager: "yarn@4.1.0" })),
    ];
    const out = generateDeployDockerfile(
      mkCtx({ detection: { ...mkCtx().detection, package_managers: [] } }),
      profile,
      files,
    ).content;
    expect(out).toContain("yarn install --frozen-lockfile");
    expect(out).not.toContain("npm install");
  });

  it("Go builds the root main package (-o /out/app .), never ./... (multi-package modules)", () => {
    // `-o <file> ./...` fails with "cannot write multiple packages to
    // non-directory" on the common cmd/ + internal/ layout.
    const ctx = mkCtx({
      project_identity: { ...mkCtx().project_identity, go_module: "github.com/acme/svc" },
    });
    const out = generateDeployDockerfile(ctx, profile, [f("go.mod", "module github.com/acme/svc")]).content;
    expect(out).not.toContain("-o /out/app ./...");
    expect(out).toMatch(/-o \/out\/app \.$/m);
  });

  it("Python CMD is framework-aware: gunicorn for Flask/Django (WSGI), uvicorn for FastAPI (ASGI)", () => {
    // Flask/Django containers crashed with "uvicorn: not found" — they're WSGI
    // apps that usually don't depend on uvicorn.
    const withFw = (name: string) =>
      mkCtx({ detection: { ...mkCtx().detection, frameworks: [{ name, version: "1.0.0", confidence: 0.9 }] } });

    const flask = generateDeployDockerfile(withFw("Flask"), profile, [f("requirements.txt", "flask")]).content;
    expect(flask).toContain("gunicorn app:app");
    expect(flask).not.toContain("uvicorn app.main:app");

    const django = generateDeployDockerfile(withFw("Django"), profile, [f("requirements.txt", "django")]).content;
    expect(django).toContain("gunicorn wsgi:application");
    expect(django).not.toContain("uvicorn app.main:app");

    const fastapi = generateDeployDockerfile(withFw("FastAPI"), profile, [f("requirements.txt", "fastapi")]).content;
    expect(fastapi).toContain("uvicorn app.main:app");
    expect(fastapi).not.toContain("gunicorn");
  });
});
