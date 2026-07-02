import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { GeneratorResult, GeneratedFile } from "./types.js";
import { buildDeltaReport, appendDeltaReport } from "./delta-report.js";

// A minimal ContextMap carrying just the fields the delta report reads.
function ctx(overrides: Partial<ContextMap> = {}): ContextMap {
  return {
    generated_at: "1970-01-01T00:00:00.000Z",
    project_identity: { name: "delta-demo" },
    detection: { frameworks: [] },
    routes: [],
    domain_models: [],
    dependency_graph: { hotspots: [] },
    ai_context: { warnings: [] },
    entry_points: [],
    structure: { total_loc: 0, file_tree_summary: [] },
    ...overrides,
  } as unknown as ContextMap;
}

function result(files: GeneratedFile[] = [{ path: "AGENTS.md", content: "x", content_type: "text/markdown", program: "skills", description: "d" }]): GeneratorResult {
  return { files } as GeneratorResult;
}

describe("buildDeltaReport", () => {
  it("returns null when nothing changed", () => {
    const a = ctx();
    expect(buildDeltaReport(a, ctx())).toBeNull();
  });

  it("renders added framework, removed route, and resolved warning in their sections with correct counts", () => {
    const prev = ctx({
      detection: { frameworks: [{ name: "Vue", version: "3.0.0" }] },
      routes: [{ method: "DELETE", path: "/legacy", source_file: "a.ts" }],
      ai_context: { warnings: ["No CI configuration found"] },
    } as Partial<ContextMap>);
    const curr = ctx({
      detection: { frameworks: [{ name: "Vue", version: "3.0.0" }, { name: "Next.js", version: "15.0.0" }] },
      routes: [],
      ai_context: { warnings: [] },
    } as Partial<ContextMap>);

    const report = buildDeltaReport(prev, curr)!;
    expect(report).toContain("# Delta Report — delta-demo");
    expect(report).toContain("## Stack");
    expect(report).toContain("Next.js");
    expect(report).toContain("## Routes");
    expect(report).toContain("DELETE /legacy");
    expect(report).toContain("## Warnings");
    expect(report).toContain("✓ Resolved");
    expect(report).toContain("No CI configuration found");
    expect(report).toContain("1 framework added");
    expect(report).toContain("1 route removed");
    expect(report).toContain("1 warning resolved");
  });

  it("renders a domain model field_count change as 'N → M fields'", () => {
    const prev = ctx({ domain_models: [{ name: "AuthContext", kind: "interface", language: "TypeScript", field_count: 12, source_file: "a.ts" }] } as Partial<ContextMap>);
    const curr = ctx({ domain_models: [{ name: "AuthContext", kind: "interface", language: "TypeScript", field_count: 15, source_file: "a.ts" }] } as Partial<ContextMap>);

    const report = buildDeltaReport(prev, curr)!;
    expect(report).toContain("## Domain Models");
    expect(report).toContain("AuthContext: 12 → 15 fields");
  });

  it("renders hotspots that entered/left", () => {
    const prev = ctx({ dependency_graph: { hotspots: [{ path: "src/old.ts", inbound_count: 1, outbound_count: 1, risk_score: 1 }] } } as Partial<ContextMap>);
    const curr = ctx({ dependency_graph: { hotspots: [{ path: "src/new.ts", inbound_count: 1, outbound_count: 1, risk_score: 1 }] } } as Partial<ContextMap>);

    const report = buildDeltaReport(prev, curr)!;
    expect(report).toContain("## Hotspots");
    expect(report).toContain("**Entered:**");
    expect(report).toContain("src/new.ts");
    expect(report).toContain("**Left:**");
    expect(report).toContain("src/old.ts");
  });

  it("renders entry points added/removed", () => {
    const prev = ctx({ entry_points: [{ path: "apps/legacy/main.ts", type: "cli", description: "d" }] } as Partial<ContextMap>);
    const curr = ctx({ entry_points: [{ path: "apps/cli/index.ts", type: "cli", description: "d" }] } as Partial<ContextMap>);

    const report = buildDeltaReport(prev, curr)!;
    expect(report).toContain("## Entry Points");
    expect(report).toContain("apps/cli/index.ts");
    expect(report).toContain("apps/legacy/main.ts");
  });

  it("renders size deltas (total + per-language) only when non-zero", () => {
    const prev = ctx({
      structure: {
        total_loc: 1000,
        file_tree_summary: [{ path: "a.ts", type: "file", language: "TypeScript", loc: 1000, role: "source" }],
      },
    } as Partial<ContextMap>);
    const curr = ctx({
      structure: {
        total_loc: 1300,
        file_tree_summary: [{ path: "a.ts", type: "file", language: "TypeScript", loc: 1300, role: "source" }],
      },
    } as Partial<ContextMap>);

    const report = buildDeltaReport(prev, curr)!;
    expect(report).toContain("## Size");
    expect(report).toContain("1000 → 1300 (+300)");
    expect(report).toContain("TypeScript: 1000 → 1300 (+300)");
  });

  // WO-08 fix 5: sizeSection only pushed a summary fragment for totalDelta !== 0,
  // so a language-mix-only change (same total_loc, shifted composition) rendered
  // a malformed "Since the last snapshot: ." sentence.
  it("summary sentence covers language-mix-only changes (total LOC unchanged)", () => {
    const prev = ctx({
      structure: {
        total_loc: 500,
        file_tree_summary: [{ path: "a.js", type: "file", language: "JavaScript", loc: 500, role: "source" }],
      },
    } as Partial<ContextMap>);
    const curr = ctx({
      structure: {
        total_loc: 500,
        file_tree_summary: [{ path: "a.ts", type: "file", language: "TypeScript", loc: 500, role: "source" }],
      },
    } as Partial<ContextMap>);

    const report = buildDeltaReport(prev, curr)!;
    expect(report).not.toBeNull();
    const summaryLine = report.split("\n").find((l) => l.startsWith("Since the last snapshot"))!;
    expect(summaryLine).toContain("language mix");
    expect(summaryLine.endsWith(": .")).toBe(false);
  });

  it("truncates routes beyond 15 per direction with '… +N more'", () => {
    const curr = ctx({
      routes: Array.from({ length: 18 }, (_, i) => ({ method: "GET", path: `/r${i}`, source_file: "a.ts" })),
    } as Partial<ContextMap>);

    const report = buildDeltaReport(ctx(), curr)!;
    expect(report).toContain("… +3 more");
    // Exactly 15 route lines rendered under Added.
    const added = report.split("**Added:**")[1].split("\n\n")[0];
    expect((added.match(/- GET \/r/g) ?? []).length).toBe(15);
  });

  it("is deterministic — same inputs twice produce identical output", () => {
    const prev = ctx({ detection: { frameworks: [{ name: "Vue", version: "2.0.0" }] } } as Partial<ContextMap>);
    const curr = ctx({ detection: { frameworks: [{ name: "Vue", version: "3.0.0" }] } } as Partial<ContextMap>);
    expect(buildDeltaReport(prev, curr)).toBe(buildDeltaReport(prev, curr));
  });

  // SPEC-10 Fix 4b: project_identity.name is user-suppliable (MCP project_name arg,
  // length-only validated) — a newline must not break the H1.
  it("sanitizes a newline-bearing project name in the H1 (SPEC-10 Fix 4b)", () => {
    const prev = ctx({ project_identity: { name: "line1\nline2" }, routes: [] } as Partial<ContextMap>);
    const curr = ctx({
      project_identity: { name: "line1\nline2" },
      routes: [{ method: "GET", path: "/new", source_file: "a.ts" }],
    } as Partial<ContextMap>);
    const report = buildDeltaReport(prev, curr)!;
    expect(report.split("\n")[0]).toBe("# Delta Report — line1 line2");
    expect(report.split("\n").some((l) => l.trim() === "line2")).toBe(false);
  });

  it("clean project names still render byte-identically (determinism regression for Fix 4b)", () => {
    const prev = ctx({ project_identity: { name: "clean-name" }, routes: [] } as Partial<ContextMap>);
    const curr = ctx({
      project_identity: { name: "clean-name" },
      routes: [{ method: "GET", path: "/new", source_file: "a.ts" }],
    } as Partial<ContextMap>);
    expect(buildDeltaReport(prev, curr)!.split("\n")[0]).toBe("# Delta Report — clean-name");
  });
});

describe("appendDeltaReport", () => {
  const prev = ctx({ routes: [] } as Partial<ContextMap>);
  const curr = ctx({ routes: [{ method: "GET", path: "/new", source_file: "a.ts" }] } as Partial<ContextMap>);

  it("appends exactly one delta-report.md and is idempotent", () => {
    const g = result();
    appendDeltaReport(g, prev, curr);
    const files = g.files.filter((f) => f.path === "delta-report.md");
    expect(files).toHaveLength(1);
    expect(files[0].program).toBe("skills");
    expect(files[0].content).toContain("/new");

    const n = g.files.length;
    appendDeltaReport(g, prev, curr); // already present → no-op
    expect(g.files.length).toBe(n);
  });

  it("is a no-op when buildDeltaReport returns null (nothing changed)", () => {
    const g = result();
    appendDeltaReport(g, ctx(), ctx());
    expect(g.files.some((f) => f.path === "delta-report.md")).toBe(false);
  });

  it("is a no-op on an empty package", () => {
    const g = result([]);
    appendDeltaReport(g, prev, curr);
    expect(g.files).toHaveLength(0);
  });
});
