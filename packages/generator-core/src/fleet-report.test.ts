import { describe, it, expect } from "vitest";
import { buildFleetReport, FLEET_MIN_PROJECTS, FLEET_MAX_PROJECTS, type FleetProjectInput } from "./fleet-report.js";
import type { ContextMap } from "@axis/context-engine";

function ctx(overrides: Record<string, unknown> = {}): ContextMap {
  return {
    project_identity: { name: "proj", primary_language: "TypeScript" },
    structure: { total_loc: 100 },
    detection: { frameworks: [], languages: [] },
    ai_context: { warnings: [], conventions: [] },
    ...overrides,
  } as unknown as ContextMap;
}

function project(overrides: Partial<FleetProjectInput> = {}): FleetProjectInput {
  return {
    project_name: "proj",
    ctx: ctx(),
    memory_decisions: [],
    ...overrides,
  };
}

describe("buildFleetReport", () => {
  it("returns null with fewer than FLEET_MIN_PROJECTS", () => {
    expect(buildFleetReport([])).toBeNull();
    expect(buildFleetReport([project()])).toBeNull();
    expect(FLEET_MIN_PROJECTS).toBe(2);
  });

  it("builds both files for exactly 2 projects with correct headers and per-project table rows", () => {
    const projects = [
      project({ project_name: "alpha", ctx: ctx({ project_identity: { primary_language: "TypeScript" }, structure: { total_loc: 500 } }) }),
      project({ project_name: "beta", ctx: ctx({ project_identity: { primary_language: "Python" }, structure: { total_loc: 800 } }) }),
    ];
    const files = buildFleetReport(projects)!;
    expect(files).toHaveLength(2);

    const report = files.find((f) => f.path === "fleet-report.md")!;
    const claude = files.find((f) => f.path === "fleet-CLAUDE.md")!;
    expect(report.program).toBe("fleet");
    expect(claude.program).toBe("fleet");
    expect(report.content_type).toBe("text/markdown");

    expect(report.content).toContain("# Fleet Report — 2 projects");
    expect(report.content).toContain("alpha");
    expect(report.content).toContain("TypeScript");
    expect(report.content).toContain("500");
    expect(report.content).toContain("beta");
    expect(report.content).toContain("Python");
    expect(report.content).toContain("800");

    expect(claude.content).toContain("# CLAUDE.md — 2-project fleet");
    expect(claude.content).toContain("How this organization builds");
  });

  it("shared stack lists a framework present in exactly the 2 projects that have it, never the project with a unique one", () => {
    const projects = [
      project({ project_name: "a", ctx: ctx({ detection: { frameworks: [{ name: "React" }], languages: [] } }) }),
      project({ project_name: "b", ctx: ctx({ detection: { frameworks: [{ name: "React" }], languages: [] } }) }),
      project({ project_name: "c", ctx: ctx({ detection: { frameworks: [{ name: "Vue" }], languages: [] } }) }),
    ];
    const report = buildFleetReport(projects)!.find((f) => f.path === "fleet-report.md")!;
    expect(report.content).toContain("## Shared stack");
    expect(report.content).toContain("React — 2 projects: a, b");

    const sharedSection = report.content.split("## Shared stack")[1];
    expect(sharedSection).not.toContain("Vue");
  });

  it("org-wide warnings render only on verbatim overlap across >=2 projects", () => {
    const projects = [
      project({ project_name: "a", ctx: ctx({ ai_context: { warnings: ["No CI configured"], conventions: [] } }) }),
      project({ project_name: "b", ctx: ctx({ ai_context: { warnings: ["No CI configured"], conventions: [] } }) }),
      project({ project_name: "c", ctx: ctx({ ai_context: { warnings: ["Unique to c only"], conventions: [] } }) }),
    ];
    const report = buildFleetReport(projects)!.find((f) => f.path === "fleet-report.md")!;
    expect(report.content).toContain("## Org-wide warnings");
    expect(report.content).toContain("No CI configured");
    expect(report.content).toContain("2 projects: a, b");
    const orgSection = report.content.split("## Org-wide warnings")[1];
    expect(orgSection).not.toContain("Unique to c only");
  });

  it("omits the shared-stack and org-wide-warnings sections entirely when nothing overlaps", () => {
    const projects = [
      project({ project_name: "a", ctx: ctx({ detection: { frameworks: [{ name: "React" }], languages: [] }, ai_context: { warnings: ["only a"], conventions: [] } }) }),
      project({ project_name: "b", ctx: ctx({ detection: { frameworks: [{ name: "Vue" }], languages: [] }, ai_context: { warnings: ["only b"], conventions: [] } }) }),
    ];
    const report = buildFleetReport(projects)!.find((f) => f.path === "fleet-report.md")!;
    expect(report.content).not.toContain("## Shared stack");
    expect(report.content).not.toContain("## Org-wide warnings");
  });

  it("fleet-CLAUDE.md conventions intersect on >=2 projects", () => {
    const projects = [
      project({ project_name: "a", ctx: ctx({ ai_context: { warnings: [], conventions: ["snake_case for SQL"] } }) }),
      project({ project_name: "b", ctx: ctx({ ai_context: { warnings: [], conventions: ["snake_case for SQL"] } }) }),
      project({ project_name: "c", ctx: ctx({ ai_context: { warnings: [], conventions: ["only c convention"] } }) }),
    ];
    const claude = buildFleetReport(projects)!.find((f) => f.path === "fleet-CLAUDE.md")!;
    expect(claude.content).toContain("## Conventions");
    expect(claude.content).toContain("snake_case for SQL");
    const conventionsSection = claude.content.split("## Conventions")[1];
    expect(conventionsSection.split("##")[0]).not.toContain("only c convention");
  });

  it("renders each project's memory decisions under its own subheading, omitting the section when all are empty", () => {
    const withDecisions = [
      project({ project_name: "alpha", memory_decisions: ["Use Postgres, not SQLite"] }),
      project({ project_name: "beta", memory_decisions: [] }),
    ];
    const claudeWith = buildFleetReport(withDecisions)!.find((f) => f.path === "fleet-CLAUDE.md")!;
    expect(claudeWith.content).toContain("## Decisions already made across this fleet");
    expect(claudeWith.content).toContain("### alpha");
    expect(claudeWith.content).toContain("Use Postgres, not SQLite");
    expect(claudeWith.content).not.toContain("### beta"); // beta has no decisions — omitted

    const noDecisions = [project({ project_name: "alpha" }), project({ project_name: "beta" })];
    const claudeWithout = buildFleetReport(noDecisions)!.find((f) => f.path === "fleet-CLAUDE.md")!;
    expect(claudeWithout.content).not.toContain("Decisions already made across this fleet");
  });

  it("is deterministic regardless of input order (sorted by project_name)", () => {
    const a = project({ project_name: "alpha" });
    const b = project({ project_name: "beta" });
    const c = project({ project_name: "gamma" });
    const forward = buildFleetReport([a, b, c])!;
    const shuffled = buildFleetReport([c, a, b])!;
    expect(forward.map((f) => f.content)).toEqual(shuffled.map((f) => f.content));
  });

  it("caps at FLEET_MAX_PROJECTS and notes the overflow", () => {
    expect(FLEET_MAX_PROJECTS).toBe(25);
    const projects = Array.from({ length: 26 }, (_, i) => project({ project_name: `p${String(i).padStart(2, "0")}` }));
    const report = buildFleetReport(projects)!.find((f) => f.path === "fleet-report.md")!;
    expect(report.content).toContain("# Fleet Report — 25 projects");
    expect(report.content).toContain("25 of 26"); // overflow noted
    expect(report.content).not.toContain("p25"); // the 26th (alphabetically last) is dropped
  });

  it("never renders 'undefined' or 'NaN' with minimal/empty ctx fields", () => {
    const bareCtx = {} as unknown as ContextMap;
    const projects = [
      { project_name: "bare-a", ctx: bareCtx, memory_decisions: [] },
      { project_name: "bare-b", ctx: bareCtx, memory_decisions: [] },
    ];
    const files = buildFleetReport(projects)!;
    for (const f of files) {
      expect(f.content).not.toContain("undefined");
      expect(f.content).not.toContain("NaN");
    }
  });
});
