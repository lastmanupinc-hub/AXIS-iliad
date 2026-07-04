import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateCanvasSpec, generateCanvasAssetGuidelines, generateBrandBoard, generateSocialPack } from "./generators-canvas.js";

const profile = {} as RepoProfile;
const files: SourceFile[] = [];
function ctxWith(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...over,
  } as ContextMap;
}

// ─── shared CANVAS_BRAND: the 3 artifacts agree on the palette ───
describe("DEVELOP: canvas-spec, asset-guidelines, and brand-board share one brand palette", () => {
  const ctx = ctxWith();
  const spec = JSON.parse(generateCanvasSpec(ctx, profile, files).content) as { design_system: { colors: { primary: string; secondary: string; accent: string } } };
  const guidelines = generateCanvasAssetGuidelines(ctx, files).content;
  const board = generateBrandBoard(ctx, files).content;

  it("all three render the SAME primary/secondary/accent (was: brand-board drifted to #2563EB/#7C3AED)", () => {
    const p = spec.design_system.colors.primary; // #6366f1
    const s = spec.design_system.colors.secondary; // #8b5cf6
    const a = spec.design_system.colors.accent; // #06b6d4
    // asset-guidelines table
    expect(guidelines).toContain(`| Primary | ${p} |`);
    expect(guidelines).toContain(`| Secondary | ${s} |`);
    expect(guidelines).toContain(`| Accent | ${a} |`);
    // brand-board Primary Colors table now matches the spec (was #2563EB/#7C3AED)
    expect(board).toContain(`| Brand Primary | \`${p}\``);
    expect(board).toContain(`| Brand Secondary | \`${s}\``);
    // the Brand Primary row specifically no longer carries the drifted hex
    // (note: #2563EB survives elsewhere as the distinct "Info" SEMANTIC color).
    expect(board).not.toContain("| Brand Primary | `#2563EB`");
    expect(board).not.toContain("| Brand Secondary | `#7C3AED`");
  });
});

// ─── mdBlock wiring: standalone project_summary can't begin a block ───
describe("DEVELOP: social-pack's standalone project summary uses mdBlock", () => {
  it("a summary starting with a heading marker is escaped, not rendered as a heading", () => {
    const ctx = ctxWith({ ai_context: { project_summary: "# Injected Heading via summary", key_abstractions: [], conventions: [], warnings: [] } });
    const content = generateSocialPack(ctx, files).content;
    // the summary line is present but escaped (\#), so it's not a live H1
    expect(content).toContain("\\# Injected Heading via summary");
    for (const l of content.split("\n")) expect(l).not.toMatch(/^#\s+Injected Heading/);
  });
});
