import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { generateCitationIndex } from "./generators-notebook.js";

function ctxWith(over: Partial<ContextMap["detection"]> & { patterns?: string[] } = {}): ContextMap {
  const { patterns, ...det } = over;
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null, ...det },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: (patterns ?? []) as ContextMap["architecture_signals"]["patterns_detected"], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
  } as ContextMap;
}
type Citation = { type: string; source: string };
const cites = (ctx: ContextMap): Citation[] => (JSON.parse(generateCitationIndex(ctx).content) as { citations: Citation[] }).citations;

describe("citation-index — every citation cites a locatable source (POLISH)", () => {
  it("pattern citations use a real URL, not a prose sentence", () => {
    const pat = cites(ctxWith({ patterns: ["Layered Architecture"] })).find((c) => c.type === "pattern");
    expect(pat).toBeDefined();
    expect(pat!.source).toMatch(/^https?:\/\//);
    expect(pat!.source).not.toContain("detected in project");
  });
  it("known languages get curated official docs (incl. special-char names like C++)", () => {
    const langs = (over: string) => cites(ctxWith({ languages: [{ name: over, file_count: 1, loc: 10, loc_percent: 100 }] as ContextMap["detection"]["languages"] })).find((c) => c.type === "reference");
    expect(langs("Go")!.source).toBe("https://go.dev/doc/");
    expect(langs("Rust")!.source).toContain("rust-lang.org");
    expect(langs("C++")!.source).toBe("https://en.cppreference.com/w/");
  });
  it("an uncurated language falls back to a URL-ENCODED search (no malformed special chars)", () => {
    const fsharp = cites(ctxWith({ languages: [{ name: "F#", file_count: 1, loc: 10, loc_percent: 100 }] as ContextMap["detection"]["languages"] })).find((c) => c.type === "reference");
    expect(fsharp!.source).toContain("google.com/search");
    expect(fsharp!.source).toContain("F%23"); // encodeURIComponent("F#") — not a raw '#'
    expect(fsharp!.source).not.toMatch(/q=F#/); // no raw '#' that would truncate the query
  });
});
