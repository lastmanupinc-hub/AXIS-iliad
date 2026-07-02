import { describe, it, expect } from "vitest";
import { buildMemorySection, appendMemoryWeave, MEMORY_WEAVE_LIMIT, type WovenMemoryEntry } from "./memory-weave.js";
import { appendAutonomyLoop } from "./autonomy-loop.js";
import type { GeneratorResult, GeneratedFile } from "./types.js";
import type { ContextMap } from "@axis/context-engine";

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

// A minimal ContextMap carrying just the fields appendAutonomyLoop reads.
function loopCtx(): ContextMap {
  return {
    generated_at: "1970-01-01T00:00:00.000Z",
    project_identity: { name: "memory-weave-demo" },
    detection: { frameworks: [], languages: [], test_frameworks: [] },
    ai_context: { warnings: [] },
    dependency_graph: { hotspots: [] },
  } as unknown as ContextMap;
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
  it("injects the section into AGENTS.md and CLAUDE.md, adds project-memory.md once, leaves other files untouched", () => {
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
  });

  it("re-weaving with the SAME entries is a true no-op (byte-identical output, no duplication)", () => {
    const g = result([mdFile("AGENTS.md")]);
    appendMemoryWeave(g, [entry()]);
    const n = g.files.length;
    const agentsBefore = g.files.find((f) => f.path === "AGENTS.md")!.content;
    const memoryBefore = g.files.find((f) => f.path === "project-memory.md")!.content;

    appendMemoryWeave(g, [entry()]);

    expect(g.files.length).toBe(n);
    expect(g.files.find((f) => f.path === "AGENTS.md")!.content).toBe(agentsBefore);
    expect(g.files.find((f) => f.path === "project-memory.md")!.content).toBe(memoryBefore);
  });

  // WO-08 fix 3: the MCP path persists the woven package, so a later export must
  // REFRESH memory, not skip it — otherwise memory freezes at first-analysis state.
  it("re-weaving with NEW entries replaces stale content instead of skipping or duplicating", () => {
    const g = result([mdFile("AGENTS.md")]);
    appendMemoryWeave(g, [entry({ content: "first decision" })]);

    appendMemoryWeave(g, [entry({ content: "second decision" }), entry({ content: "first decision" })]);

    const memory = g.files.find((f) => f.path === "project-memory.md")!;
    expect(memory.content).toContain("# Project Memory — 2 entries");
    expect(memory.content).toContain("second decision");
    expect(memory.content).toContain("first decision");
    expect(g.files.filter((f) => f.path === "project-memory.md")).toHaveLength(1); // no duplicate pushed

    const agents = g.files.find((f) => f.path === "AGENTS.md")!;
    expect((agents.content.match(/second decision/g) ?? []).length).toBe(1);
    expect((agents.content.match(/first decision/g) ?? []).length).toBe(1);
    expect((agents.content.match(/Decisions already made/g) ?? []).length).toBe(1); // exactly one section, not two
    expect((agents.content.match(/<!-- axis:project-memory:start -->/g) ?? []).length).toBe(1); // exactly one delimiter pair
    expect((agents.content.match(/<!-- axis:project-memory:end -->/g) ?? []).length).toBe(1);
  });

  it("is a no-op on empty entries (does not clear an existing stale artifact)", () => {
    const g = result([mdFile("AGENTS.md")]);
    appendMemoryWeave(g, [entry()]);
    const agentsBefore = g.files.find((f) => f.path === "AGENTS.md")!.content;
    const memoryBefore = g.files.find((f) => f.path === "project-memory.md")!.content;

    appendMemoryWeave(g, []);

    expect(g.files.find((f) => f.path === "AGENTS.md")!.content).toBe(agentsBefore);
    expect(g.files.find((f) => f.path === "project-memory.md")!.content).toBe(memoryBefore);
  });

  it("is a no-op on an empty package", () => {
    const g = result([]);
    appendMemoryWeave(g, [entry()]);
    expect(g.files).toHaveLength(0);
  });
});

// ─── SPEC-10 Fix 1: legacy undelimited weave migration ───────────
describe("appendMemoryWeave — legacy undelimited weave migration (SPEC-10 Fix 1)", () => {
  it("migrates a WO-07-era undelimited section to the delimited form, replacing stale content", () => {
    const oldSection = buildMemorySection([entry({ content: "old decision" })])!;
    const legacyAgents = `# AGENTS.md\n\nSome base content.\n\n${oldSection}\n`;
    const g = result([mdFile("AGENTS.md", "skills", legacyAgents)]);

    appendMemoryWeave(g, [entry({ content: "new decision" })]);

    const agents = g.files.find((f) => f.path === "AGENTS.md")!;
    expect((agents.content.match(/Decisions already made/g) ?? []).length).toBe(1);
    expect(agents.content).not.toContain("old decision");
    expect(agents.content).toContain("new decision");
    expect(agents.content).toContain("<!-- axis:project-memory:start -->");
    expect(agents.content).toContain("<!-- axis:project-memory:end -->");
    expect(agents.content).toContain("Some base content.");
  });

  it("stops the legacy section at the next H1/H2, preserving trailing content verbatim", () => {
    const oldSection = buildMemorySection([entry({ content: "old decision" })])!;
    const legacyAgents = `# AGENTS.md\n\n${oldSection}\n\n## Later Section\n\nImportant trailing content.\n`;
    const g = result([mdFile("AGENTS.md", "skills", legacyAgents)]);

    appendMemoryWeave(g, [entry({ content: "new decision" })]);

    const agents = g.files.find((f) => f.path === "AGENTS.md")!;
    expect(agents.content).toContain("## Later Section");
    expect(agents.content).toContain("Important trailing content.");
    expect(agents.content).toContain("new decision");
    expect(agents.content).not.toContain("old decision");
    expect(agents.content.indexOf("<!-- axis:project-memory:end -->")).toBeLessThan(agents.content.indexOf("## Later Section"));
  });

  it("does not stop the legacy scan at H3 subheadings within the section", () => {
    const oldSection = buildMemorySection([
      entry({ kind: "decision", content: "old decision" }),
      entry({ kind: "convention", content: "old convention" }),
    ])!;
    expect(oldSection).toContain("### Decisions");
    expect(oldSection).toContain("### Conventions");
    const legacyAgents = `# AGENTS.md\n\n${oldSection}\n`;
    const g = result([mdFile("AGENTS.md", "skills", legacyAgents)]);

    // Use a "goal" entry for the migration so the fresh block does NOT reintroduce
    // "### Decisions"/"### Conventions" — isolating whether the OLD H3s survived.
    appendMemoryWeave(g, [entry({ kind: "goal", content: "new goal" })]);

    const agents = g.files.find((f) => f.path === "AGENTS.md")!;
    expect(agents.content).not.toContain("old decision");
    expect(agents.content).not.toContain("old convention");
    expect(agents.content).not.toContain("### Decisions");
    expect(agents.content).not.toContain("### Conventions");
    expect(agents.content).toContain("### Goals");
    expect((agents.content.match(/Decisions already made — do not re-litigate/g) ?? []).length).toBe(1);
  });

  it("migration is idempotent — a second weave with different entries goes through the marker branch", () => {
    const oldSection = buildMemorySection([entry({ content: "old decision" })])!;
    const legacyAgents = `# AGENTS.md\n\n${oldSection}\n`;
    const g = result([mdFile("AGENTS.md", "skills", legacyAgents)]);

    appendMemoryWeave(g, [entry({ content: "migrated decision" })]);
    appendMemoryWeave(g, [entry({ content: "refreshed decision" })]);

    const agents = g.files.find((f) => f.path === "AGENTS.md")!;
    expect((agents.content.match(/Decisions already made/g) ?? []).length).toBe(1);
    expect((agents.content.match(/<!-- axis:project-memory:start -->/g) ?? []).length).toBe(1);
    expect((agents.content.match(/<!-- axis:project-memory:end -->/g) ?? []).length).toBe(1);
    expect(agents.content).toContain("refreshed decision");
    expect(agents.content).not.toContain("migrated decision");
    expect(agents.content).not.toContain("old decision");
  });
});

// ─── SPEC-10 Fix 2: preserve the ⟳ Continue footer across refresh ─
describe("appendMemoryWeave — ⟳ Continue footer preservation across refresh (SPEC-10 Fix 2)", () => {
  it("preserves a previously-appended footer when project-memory.md is refreshed", () => {
    const g = result([mdFile("AGENTS.md")]);
    appendMemoryWeave(g, [entry({ content: "first decision" })]);
    appendAutonomyLoop(g, loopCtx());

    const memoryBeforeRefresh = g.files.find((f) => f.path === "project-memory.md")!;
    expect(memoryBeforeRefresh.content).toContain("⟳ Continue the loop");

    appendMemoryWeave(g, [entry({ content: "second decision" })]);

    const memory = g.files.find((f) => f.path === "project-memory.md")!;
    expect(memory.content).toContain("second decision");
    expect(memory.content).not.toContain("first decision");
    expect((memory.content.match(/⟳ Continue the loop/g) ?? []).length).toBe(1);
    const footerIdx = memory.content.indexOf("⟳ Continue the loop");
    const contentIdx = memory.content.indexOf("second decision");
    expect(contentIdx).toBeLessThan(footerIdx);
  });

  it("full MCP→export round-trip: weave, loop, re-weave, loop-noop — exactly one footer, no double-footering", () => {
    const g = result([mdFile("AGENTS.md")]);
    appendMemoryWeave(g, [entry({ content: "entry one" })]);
    appendAutonomyLoop(g, loopCtx()); // MCP-time: footers everything + begin.yaml

    appendMemoryWeave(g, [entry({ content: "entry two" })]); // export-time refresh
    appendAutonomyLoop(g, loopCtx()); // export-time: no-op, begin.yaml already present

    const memory = g.files.find((f) => f.path === "project-memory.md")!;
    expect(memory.content).toContain("entry two");
    expect(memory.content).not.toContain("entry one");
    expect((memory.content.match(/⟳ Continue the loop/g) ?? []).length).toBe(1);

    const agents = g.files.find((f) => f.path === "AGENTS.md")!;
    expect((agents.content.match(/⟳ Continue the loop/g) ?? []).length).toBe(1);
  });

  it("refresh without a prior footer is a pure wholesale replace (no footer text introduced)", () => {
    const g = result([mdFile("AGENTS.md")]);
    appendMemoryWeave(g, [entry({ content: "first decision" })]); // no appendAutonomyLoop — no footer exists

    appendMemoryWeave(g, [entry({ content: "second decision" })]);

    const memory = g.files.find((f) => f.path === "project-memory.md")!;
    expect(memory.content).toContain("second decision");
    expect(memory.content).not.toContain("⟳ Continue the loop");
  });
});

// ─── SPEC-10 Fix 3: sanitize memory content/source at render ────
describe("appendMemoryWeave — sanitizes memory content/source at render (SPEC-10 Fix 3)", () => {
  it("neutralizes memory content embedding the literal end-marker so a second weave stays correct (the 3a corruption case)", () => {
    const g = result([mdFile("AGENTS.md")]);
    appendMemoryWeave(g, [entry({ content: "before <!-- axis:project-memory:end --> after" })]);
    const afterFirst = g.files.find((f) => f.path === "AGENTS.md")!.content;
    expect((afterFirst.match(/<!-- axis:project-memory:start -->/g) ?? []).length).toBe(1);
    expect((afterFirst.match(/<!-- axis:project-memory:end -->/g) ?? []).length).toBe(1);

    appendMemoryWeave(g, [entry({ content: "second weave content" })]);
    const afterSecond = g.files.find((f) => f.path === "AGENTS.md")!.content;
    expect((afterSecond.match(/<!-- axis:project-memory:start -->/g) ?? []).length).toBe(1);
    expect((afterSecond.match(/<!-- axis:project-memory:end -->/g) ?? []).length).toBe(1);
    expect(afterSecond).toContain("second weave content");
    expect(afterSecond).not.toContain("before <!-- axis:project-memory:end --> after");
  });

  it("collapses multiline/markdown-bearing content into a single list item, injecting no new headings", () => {
    const g = result([mdFile("AGENTS.md")]);
    appendMemoryWeave(g, [entry({ content: "real content\n## Injected heading\n- fake bullet" })]);

    const agents = g.files.find((f) => f.path === "AGENTS.md")!;
    expect(agents.content).not.toContain("\n## Injected heading");
    expect(agents.content).toContain("real content ## Injected heading - fake bullet");
  });

  it("collapses a multi-line source so it can't break the list item structure", () => {
    const g = result([mdFile("AGENTS.md")]);
    appendMemoryWeave(g, [entry({ content: "clean content", source: "src\nwith\nnewlines" })]);

    const agents = g.files.find((f) => f.path === "AGENTS.md")!;
    expect(agents.content).toContain("_(src with newlines,");
  });
});
