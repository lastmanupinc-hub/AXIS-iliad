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
});
