import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { deriveAlgoPalette, generateGenerativeSketch, generateParameterPack } from "./generators-algorithmic.js";

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
const langs = (...names: string[]) => names.map((name, i) => ({ name, file_count: 5, loc: 100, loc_percent: 90 - i * 10 })) as ContextMap["detection"]["languages"];

describe("DEVELOP: deriveAlgoPalette is the shared, always-non-empty palette", () => {
  it("returns the core {name,hue,weight} per language (up to 5)", () => {
    const p = deriveAlgoPalette(ctxWith({ detection: { ...ctxWith().detection, languages: langs("TypeScript", "Python") } }));
    expect(p).toEqual([{ name: "TypeScript", hue: 220, weight: 90 }, { name: "Python", hue: 280, weight: 80 }]);
  });
  it("falls back to a neutral non-empty palette when no languages are detected (was: [] → crash)", () => {
    const p = deriveAlgoPalette(ctxWith());
    expect(p).toHaveLength(1);
    expect(p[0].name).toBe("source");
  });
});

describe("DEVELOP: generative-sketch and parameter-pack agree on the palette (shared derivation)", () => {
  it("both emit the same core name/hue/weight for each language", () => {
    const ctx = ctxWith({ detection: { ...ctxWith().detection, languages: langs("TypeScript", "Rust") } });
    const sketchPalette = JSON.parse(generateGenerativeSketch(ctx, files).content.match(/palette: (\[.*?\]),/s)![1]) as Array<{ name: string; hue: number; weight: number }>;
    const packPalette = (JSON.parse(generateParameterPack(ctx, files).content).parameters.color.palette as Array<{ name: string; hue: number; weight: number }>).map((c) => ({ name: c.name, hue: c.hue, weight: c.weight }));
    expect(sketchPalette).toEqual(packPalette);
    expect(deriveAlgoPalette(ctx)).toEqual(sketchPalette);
  });
});

describe("DEVELOP: the generated sketch cannot crash on an empty-languages repo", () => {
  it("emits a non-empty palette so `palette[i % palette.length]` is never palette[NaN]", () => {
    const content = generateGenerativeSketch(ctxWith(), files).content;
    expect(content).not.toContain("palette: [],");
    expect(content).toContain('"name":"source"');
  });
});
