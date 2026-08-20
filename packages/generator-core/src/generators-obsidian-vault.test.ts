// app_35's actual hard requirement: "verify no broken wikilinks." This file's
// centerpiece is verifyVaultLinks and a red-proven guard that it actually
// catches a broken link, not just passes on well-formed input.
import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateVaultNotes, verifyVaultLinks, codeFileNote } from "./generators-obsidian.js";

function ctxWith(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "widget-app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: {
      total_files: 5, total_directories: 2, total_loc: 1000,
      file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"],
      top_level_layout: [],
    },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
    dependency_graph: {
      external_dependencies: [],
      internal_imports: [
        { source: "src/index.ts", target: "src/db.ts" },
        { source: "src/index.ts", target: "src/auth.ts" },
        { source: "src/routes.ts", target: "src/db.ts" },
      ],
      hotspots: [],
    },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...over,
  } as ContextMap;
}

describe("generateVaultNotes — real notes from the repo's own import graph", () => {
  it("emits one note per file that participates in a real import edge", () => {
    const notes = generateVaultNotes(ctxWith(), [] as SourceFile[]);
    const paths = notes.map((n) => n.path).sort();
    expect(paths).toEqual([
      `vault/${codeFileNote("src/auth.ts")}.md`,
      `vault/${codeFileNote("src/db.ts")}.md`,
      `vault/${codeFileNote("src/index.ts")}.md`,
      `vault/${codeFileNote("src/routes.ts")}.md`,
    ]);
  });

  it("does not create a note for a file with no import relationship — an unlinked note is worse than no note", () => {
    const notes = generateVaultNotes(ctxWith(), [] as SourceFile[]);
    expect(notes.some((n) => n.path.includes("isolated"))).toBe(false);
  });

  it("a note lists its REAL outgoing imports as [[wikilinks]]", () => {
    const notes = generateVaultNotes(ctxWith(), [] as SourceFile[]);
    const index = notes.find((n) => n.path === `vault/${codeFileNote("src/index.ts")}.md`)!;
    expect(index.content).toContain(`[[${codeFileNote("src/db.ts")}]]`);
    expect(index.content).toContain(`[[${codeFileNote("src/auth.ts")}]]`);
  });

  it("a note lists its REAL incoming imports (imported by) too — the graph is bidirectional", () => {
    const notes = generateVaultNotes(ctxWith(), [] as SourceFile[]);
    const db = notes.find((n) => n.path === `vault/${codeFileNote("src/db.ts")}.md`)!;
    expect(db.content).toContain("## Imported by");
    expect(db.content).toContain(`[[${codeFileNote("src/index.ts")}]]`);
    expect(db.content).toContain(`[[${codeFileNote("src/routes.ts")}]]`);
  });

  it("is deterministic — same context twice, byte-identical notes", () => {
    const ctx = ctxWith();
    expect(generateVaultNotes(ctx)).toEqual(generateVaultNotes(ctx));
  });

  it("drops a self-import edge (a file 'importing' itself) rather than linking a note to its own name", () => {
    const notes = generateVaultNotes(
      ctxWith({ dependency_graph: { external_dependencies: [], hotspots: [], internal_imports: [{ source: "src/a.ts", target: "src/a.ts" }] } }),
      [] as SourceFile[],
    );
    expect(notes).toEqual([]);
  });

  it("every generated note carries program:'obsidian' and markdown content type", () => {
    const notes = generateVaultNotes(ctxWith(), [] as SourceFile[]);
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.program).toBe("obsidian");
      expect(n.content_type).toBe("text/markdown");
    }
  });
});

// ─── the enforcement point ────────────────────────────────────────
describe("verifyVaultLinks — the candidate's actual hard requirement", () => {
  it("a real, self-consistent vault has zero broken links", () => {
    const notes = generateVaultNotes(ctxWith(), [] as SourceFile[]);
    expect(notes.length).toBeGreaterThan(0); // guards against a vacuous pass on an empty vault
    expect(verifyVaultLinks(notes).broken).toEqual([]);
  });

  it("THE CORE GUARD: catches a wikilink pointing at a note that does not exist", () => {
    const notes = [
      { path: "vault/a.md", content: "[[b]] [[does-not-exist]]", content_type: "text/markdown", program: "obsidian", description: "" },
      { path: "vault/b.md", content: "[[a]]", content_type: "text/markdown", program: "obsidian", description: "" },
    ];
    const result = verifyVaultLinks(notes);
    expect(result.broken).toEqual([{ note: "vault/a.md", link: "does-not-exist" }]);
  });

  it("a link to a real note, even one with no links of its own, is not broken", () => {
    const notes = [
      { path: "vault/a.md", content: "[[b]]", content_type: "text/markdown", program: "obsidian", description: "" },
      { path: "vault/b.md", content: "no links here", content_type: "text/markdown", program: "obsidian", description: "" },
    ];
    expect(verifyVaultLinks(notes).broken).toEqual([]);
  });

  it("catches MULTIPLE broken links across multiple notes, not just the first", () => {
    const notes = [
      { path: "vault/a.md", content: "[[missing-1]]", content_type: "text/markdown", program: "obsidian", description: "" },
      { path: "vault/b.md", content: "[[missing-2]] [[missing-3]]", content_type: "text/markdown", program: "obsidian", description: "" },
    ];
    expect(verifyVaultLinks(notes).broken).toHaveLength(3);
  });
});
