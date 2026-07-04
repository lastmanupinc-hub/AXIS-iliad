import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { PROGRAM_ORDER } from "./program-manifest.js";
import { generateConnectorMap, generateServerManifest, generateCapabilityRegistry } from "./generators-mcp.js";
import { generateComponentLibrary } from "./generators-artifacts.js";
import { generateRemotionScript, generateStoryboard } from "./generators-remotion.js";
import { generateCanvasSpec, generateBrandBoard } from "./generators-canvas.js";

// ─── DEBUG sweep Batch 4 (mcp, artifacts, remotion, canvas) ─────────────
// Grounded against the repo's own .ai/ dogfood output. Locks the key fixes.

function mkCtx(o: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "acme", type: "monorepo", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 100, total_directories: 20, total_loc: 50000, file_tree_summary: [], top_level_layout: [] },
    detection: { languages: [{ name: "TypeScript", file_count: 90, loc: 45000, loc_percent: 90 }], frameworks: [{ name: "React", version: "19.0.0", confidence: 0.9 }], build_tools: ["vite"], test_frameworks: ["vitest"], package_managers: ["pnpm"], ci_platform: null, deployment_target: null } as ContextMap["detection"],
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
const profile = {} as never;

// ══ MCP ══
describe("mcp — unique tool ids, canonical enum, asset filtering", () => {
  it("tool ids include the METHOD, so GET /x and DELETE /x don't collide", () => {
    const routes = [
      { method: "GET", path: "/v1/snapshots/:id", source_file: "s.ts" },
      { method: "DELETE", path: "/v1/snapshots/:id", source_file: "s.ts" },
    ] as ContextMap["routes"];
    const out = generateConnectorMap(mkCtx({ routes })).content;
    const ids = out.split("\n").filter(l => l.trim().startsWith("- id:")).map(l => l.trim());
    expect(new Set(ids).size).toBe(ids.length); // all distinct
  });
  it("does NOT emit static/doc GET routes (/.well-known, /llms.txt) as tools", () => {
    const routes = [
      { method: "GET", path: "/.well-known/ai.json", source_file: "s.ts" },
      { method: "GET", path: "/llms.txt", source_file: "s.ts" },
      { method: "GET", path: "/v1/users", source_file: "s.ts" },
    ] as ContextMap["routes"];
    const out = generateConnectorMap(mkCtx({ routes })).content;
    const toolsSection = out.slice(out.indexOf("tools:"));
    expect(toolsSection).not.toContain("/llms.txt");
    expect(toolsSection).toContain("/v1/users"); // real endpoint kept
  });
  it("server-manifest program enum is the canonical PROGRAM_ORDER (all 20, no drift)", () => {
    const out = generateServerManifest(mkCtx(), profile).content;
    expect(out).toContain(`enum: [${PROGRAM_ORDER.join(", ")}]`);
    for (const p of ["agentic-purchasing", "closer", "deploy"]) expect(out).toContain(p);
  });
  it("source_scripts survives a } inside a script value (JSON.parse, not brace regex)", () => {
    const pkg: SourceFile = { path: "package.json", content: '{"name":"x","scripts":{"build":"foo ${X}bar","test":"vitest"}}', size: 40 };
    const out = generateCapabilityRegistry(mkCtx(), [pkg]).content;
    const reg = JSON.parse(out);
    expect(reg.source_scripts).toContain("test: vitest"); // not truncated at the first }
  });
});

// ══ ARTIFACTS ══
describe("artifacts — real routes/styling, valid identifiers", () => {
  it("backend /v1 routes are NOT turned into page components", () => {
    const routes = [{ method: "GET", path: "/v1/health", source_file: "s.ts" }] as ContextMap["routes"];
    const lib = JSON.parse(generateComponentLibrary(mkCtx({ routes })).content);
    const pageNames = lib.components.filter((c: { category: string }) => c.category === "pages").map((c: { name: string }) => c.name);
    expect(pageNames).not.toContain("V1HealthPage");
  });
  it("styling is the detected approach, not a hardcoded css-modules", () => {
    const lib = JSON.parse(generateComponentLibrary(mkCtx()).content);
    expect(lib.styling).not.toBe("css-modules"); // detectStyling → plain-css for this ctx
  });
});

// ══ REMOTION ══
describe("remotion — compilable component name, derived health score", () => {
  it("a project name starting with a digit yields a valid function identifier", () => {
    const out = generateRemotionScript(mkCtx({ project_identity: { ...mkCtx().project_identity, name: "3d-viewer" } })).content;
    expect(out).not.toMatch(/export function 3/); // no leading-digit identifier
    expect(out).toContain("V3dviewerVideo");
  });
  it("storyboard code-health score is derived (65/100), not a hardcoded 85", () => {
    const out = generateStoryboard(mkCtx()).content;
    expect(out).toContain("65/100");
    expect(out).not.toContain("85/100");
  });
});

// ══ CANVAS ══
describe("canvas — percentage score, sanitized asset paths", () => {
  it("canvas-spec architecture_score is a 0–100 integer, not a 0–1 fraction", () => {
    const spec = JSON.parse(generateCanvasSpec(mkCtx(), profile).content);
    // find the score wherever it lives in the spec
    const flat = JSON.stringify(spec);
    expect(flat).toContain("\"architecture_score\":65");
    expect(flat).not.toContain("\"architecture_score\":0.65");
  });
  it("brand-board lists only real image assets, not source/test files", () => {
    const files: SourceFile[] = [
      { path: "generators-brand.ts", content: "x", size: 1 },
      { path: "src/logo.svg", content: "<svg/>", size: 6 },
    ];
    const out = generateBrandBoard(mkCtx(), files).content;
    const assetsSection = out.slice(out.indexOf("Detected Brand Assets"));
    expect(assetsSection).toContain("src/logo.svg");
    expect(assetsSection).not.toContain("generators-brand.ts");
  });
});
