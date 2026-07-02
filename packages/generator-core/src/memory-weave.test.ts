import { describe, it, expect } from "vitest";
import { buildMemorySection, appendMemoryWeave, MEMORY_WEAVE_LIMIT, type WovenMemoryEntry } from "./memory-weave.js";
import type { GeneratorResult, GeneratedFile } from "./types.js";

function entry(overrides: Partial<WovenMemoryEntry> = {}): WovenMemoryEntry {
  return { kind: "decision", content: "Use Postgres, not SQLite", source: "onboarding", created_at: "2026-01-01T00:00:00.000Z", ...overrides };
}

function mdFile(path: string, program = "skills", content = `# ${path}\nbody\n`): GeneratedFile {
  return { path, content, content_type: "text/markdown", program, description: "d" };
}

function jsonFile(path: string): GeneratedFile {
  return { path, content: "{}", content_type: "application/json", program: "search", description: "d" };
}

function result(files: GeneratedFile[]): GeneratorResult {
  return { snapshot_id: "s", project_id: "p", generated_at: "t", files, skipped: [] };
}

describe("buildMemorySection", () => {
  it("returns null for empty entries", () => {
    expect(buildMemorySection([])).toBeNull();
  });

  it("groups entries in fixed kind order (decision, convention, goal, evidence) with per-kind headings", () => {
    const entries = [
      entry({ kind: "evidence", content: "Tests pass at 100%" }),
      entry({ kind: "goal", content: "Ship WO-07" }),
      entry({ kind: "convention", content: "snake_case for SQL columns" }),
      entry({ kind: "decision", content: "Use Postgres" }),
    ];
    const section = buildMemorySection(entries)!;
    expect(section).toContain("## Decisions already made — do not re-litigate");
    const decisionsIdx = section.indexOf("Decisions");
    const conventionsIdx = section.indexOf("Conventions");
    const goalsIdx = section.indexOf("Goals");
    const evidenceIdx = section.indexOf("Evidence");
    expect(decisionsIdx).toBeLessThan(conventionsIdx);
    expect(conventionsIdx).toBeLessThan(goalsIdx);
    expect(goalsIdx).toBeLessThan(evidenceIdx);
    expect(section).toContain("Use Postgres");
    expect(section).toContain("snake_case for SQL columns");
    expect(section).toContain("Ship WO-07");
    expect(section).toContain("Tests pass at 100%");
  });

  it("omits the source segment when empty, shows it when present", () => {
    const withSource = buildMemorySection([entry({ content: "has a source", source: "onboarding", created_at: "2026-02-02T00:00:00.000Z" })])!;
    expect(withSource).toContain("has a source _(onboarding, 2026-02-02T00:00:00.000Z)_");

    const withoutSource = buildMemorySection([entry({ content: "no source", source: "", created_at: "2026-02-02T00:00:00.000Z" })])!;
    expect(withoutSource).toContain("no source _(2026-02-02T00:00:00.000Z)_");
    expect(withoutSource).not.toContain("no source _(, ");
  });

  it("renders only the newest 50 entries and an omitted-note when 51 are provided", () => {
    const entries = Array.from({ length: 51 }, (_, i) => entry({ content: `entry-${i}` }));
    const section = buildMemorySection(entries)!;
    expect((section.match(/entry-/g) ?? []).length).toBe(MEMORY_WEAVE_LIMIT);
    expect(section).toContain("… +1 earlier entries omitted");
    expect(section).toContain("GET /v1/projects/{project_id}/memory");
    // Newest-first, un-re-sorted: the first 50 (indices 0..49) are the ones shown.
    expect(section).toContain("entry-49");
    expect(section).not.toContain("entry-50");
  });

  it("is deterministic — same input twice produces byte-identical output", () => {
    const entries = [entry({ kind: "goal" }), entry({ kind: "decision" })];
    expect(buildMemorySection(entries)).toBe(buildMemorySection(entries));
  });
});

describe("appendMemoryWeave", () => {
  it("injects the section into AGENTS.md and CLAUDE.md, adds project-memory.md once, leaves other files untouched, and is idempotent", () => {
    const g = result([mdFile("AGENTS.md"), mdFile("CLAUDE.md"), mdFile("debug-playbook.md"), jsonFile("context-map.json")]);
    const beforeDebug = g.files.find((f) => f.path === "debug-playbook.md")!.content;
    const beforeJson = g.files.find((f) => f.path === "context-map.json")!.content;

    appendMemoryWeave(g, [entry()]);

    const agents = g.files.find((f) => f.path === "AGENTS.md")!;
    const claude = g.files.find((f) => f.path === "CLAUDE.md")!;
    expect(agents.content).toContain("Decisions already made");
    expect(claude.content).toContain("Decisions already made");
    expect(g.files.find((f) => f.path === "debug-playbook.md")!.content).toBe(beforeDebug);
    expect(g.files.find((f) => f.path === "context-map.json")!.content).toBe(beforeJson);

    const memoryFiles = g.files.filter((f) => f.path === "project-memory.md");
    expect(memoryFiles).toHaveLength(1);
    expect(memoryFiles[0].program).toBe("skills");
    expect(memoryFiles[0].content).toContain("# Project Memory — 1 entries");
    expect(memoryFiles[0].content).toContain("POST /v1/projects/{project_id}/memory");

    const n = g.files.length;
    const agentsBefore = agents.content;
    appendMemoryWeave(g, [entry()]); // project-memory.md already present → whole pass is a no-op
    expect(g.files.length).toBe(n);
    expect(g.files.find((f) => f.path === "AGENTS.md")!.content).toBe(agentsBefore);
  });

  it("is a no-op on empty entries", () => {
    const g = result([mdFile("AGENTS.md")]);
    const before = g.files[0].content;
    appendMemoryWeave(g, []);
    expect(g.files).toHaveLength(1);
    expect(g.files[0].content).toBe(before);
  });

  it("is a no-op on an empty package", () => {
    const g = result([]);
    appendMemoryWeave(g, [entry()]);
    expect(g.files).toHaveLength(0);
  });
});
