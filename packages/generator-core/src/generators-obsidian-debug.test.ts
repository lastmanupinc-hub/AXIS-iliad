import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { wikiLink } from "./md-sanitize.js";
import { codeFileNote, generateObsidianSkillPack, generateGraphPromptMap, generateLinkingPolicy, generateTemplatePack } from "./generators-obsidian.js";

// ─── DEBUG sweep (Program: obsidian): 8 concrete bugs ───────────────────
// Wikilink integrity, note_path separators, cross-artifact link resolution,
// extension collisions, truncation, mdBlock, valid tags/frontmatter, case dedup.

function mkCtx(o: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "acme", type: "monorepo", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 100, total_directories: 20, total_loc: 50000, file_tree_summary: [], top_level_layout: [] },
    detection: { languages: [], frameworks: [{ name: "React" }], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null } as ContextMap["detection"],
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [{ path: "apps/api/src/router.ts", inbound_count: 5, outbound_count: 3, risk_score: 0.9 }] },
    entry_points: [],
    routes: [],
    domain_models: [],
    sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.65 },
    ai_context: { project_summary: "acme is a monorepo.", key_abstractions: ["apps/ (monorepo_apps)"], conventions: [], warnings: [] },
    ...o,
  } as ContextMap;
}

describe("wikiLink — safe inside [[…]]", () => {
  it("collapses ] [ | # ^ ( ) / and whitespace to dashes", () => {
    expect(wikiLink("app/(marketing)/[slug]/page")).toBe("app-marketing-slug-page");
    expect(wikiLink("my]app")).toBe("my-app");
    expect(wikiLink("Foo|Bar#baz^1")).toBe("Foo-Bar-baz-1");
  });
});

describe("codeFileNote — keeps the extension (no collision)", () => {
  it("main.ts and main.tsx map to DISTINCT notes", () => {
    expect(codeFileNote("src/main.ts")).not.toBe(codeFileNote("src/main.tsx"));
    expect(codeFileNote("src/main.ts")).toBe("src-main-ts");
  });
});

describe("obsidian — injection-safe links + valid paths", () => {
  it("a project name with a ] does not break the [[project]] link", () => {
    const out = generateObsidianSkillPack(mkCtx({ project_identity: { ...mkCtx().project_identity, name: "ac]me" } })).content;
    expect(out).not.toContain("[[ac]me]]");   // the raw ] would close the link early
    expect(out).toContain("[[ac-me]]");
  });
  it("concept note_path for a `dir/ (purpose)` abstraction has no bogus subfolder", () => {
    const graph = JSON.parse(generateGraphPromptMap(mkCtx()).content);
    const concept = graph.nodes.find((n: { type: string }) => n.type === "concept" && n.note_path?.includes("Concepts/"));
    expect(concept.note_path).not.toContain("Concepts/apps/");   // slash flattened, no subfolder
    expect(concept.note_path).toMatch(/Concepts\/apps-monorepo.apps\.md$/);
  });
  it("linking-policy code links resolve to a declared graph node (same folder + set)", () => {
    const ctx = mkCtx();
    const graph = JSON.parse(generateGraphPromptMap(ctx).content);
    const policy = generateLinkingPolicy(ctx).content;
    // codeFileNote keeps the extension → apps-api-src-router-ts
    expect(policy).toContain("[[Projects/acme/Code/apps-api-src-router-ts]]");
    const codeNodePaths = graph.nodes.filter((n: { type: string }) => n.type === "code").map((n: { note_path: string }) => n.note_path);
    expect(codeNodePaths).toContain("Projects/acme/Code/apps-api-src-router-ts.md");
  });
  it("case-only duplicate model names get disambiguated", () => {
    const domain_models = [
      { name: "Foo", kind: "interface", field_count: 2, source_file: "a.ts" },
      { name: "foo", kind: "type_alias", field_count: 2, source_file: "b.ts" },
    ] as ContextMap["domain_models"];
    const graph = JSON.parse(generateGraphPromptMap(mkCtx({ domain_models })).content);
    const modelPaths = graph.nodes.filter((n: { type: string }) => n.type === "domain_model").map((n: { note_path: string }) => n.note_path.toLowerCase());
    expect(new Set(modelPaths).size).toBe(modelPaths.length); // no two collapse to one path
  });
  it("a project_summary opening with a block marker is neutralized (mdBlock)", () => {
    const out = generateObsidianSkillPack(mkCtx({ ai_context: { ...mkCtx().ai_context, project_summary: "> pwn the vault" } })).content;
    expect(out).not.toMatch(/^> pwn the vault/m);
  });
  it("template-pack tags are valid Obsidian tags (no spaces/parens/slashes)", () => {
    const out = generateTemplatePack(mkCtx()).content;
    const tagLine = out.split("\n").find(l => l.startsWith("tags: ["));
    if (tagLine) {
      const inside = tagLine.slice(tagLine.indexOf("[") + 1, tagLine.lastIndexOf("]"));
      expect(inside).not.toMatch(/[ ()/]/);        // tag VALUES have no invalid chars
    }
  });
  it("template-pack project frontmatter is YAML-quoted", () => {
    const out = generateTemplatePack(mkCtx({ project_identity: { ...mkCtx().project_identity, name: "acme: the sequel" } })).content;
    expect(out).not.toContain("project: acme: the sequel"); // unquoted → invalid YAML
  });
});
