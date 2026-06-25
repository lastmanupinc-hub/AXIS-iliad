import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import {
  repoFactTerms,
  distinctiveFactTerms,
  scoreAssessmentValidity,
  scoreUniqueDesign,
  scoreNeedsCoverage,
  gradePackage,
  buildNeedsRemediationArtifact,
  applyQualityGate,
  buildQualityReport,
  type QualityFile,
} from "./package-quality.js";

function mkCtx(o: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0",
    snapshot_id: "s",
    project_id: "p",
    generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "acme-shop", type: "monorepo", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 50, total_directories: 10, total_loc: 5000, file_tree_summary: [], top_level_layout: [], ...(o.structure ?? {}) },
    detection: { languages: ["TypeScript"], frameworks: ["React", "Express"], build_tools: ["vite"], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: "docker", ...(o.detection ?? {}) },
    dependency_graph: { external_dependencies: ["react", "express", "stripe"], internal_imports: [], hotspots: [], ...(o.dependency_graph ?? {}) },
    entry_points: o.entry_points ?? [],
    routes: o.routes ?? [{ path: "/checkout", method: "POST", source_file: "api/checkout.ts" }],
    domain_models: o.domain_models ?? [{ name: "OrderInvoice", kind: "interface", language: "TypeScript", field_count: 5, source_file: "models/order.ts" }],
    sql_schema: o.sql_schema ?? [],
    architecture_signals: { patterns_detected: ["monorepo"], layer_boundaries: [], separation_score: 0.7, ...(o.architecture_signals ?? {}) },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: ["No test files detected", "No CI/CD pipeline detected"], ...(o.ai_context ?? {}) },
  } as ContextMap;
}

const doc = (path: string, content: string): QualityFile => ({ path, content, content_type: "text/markdown" });
const PAD = "\n" + "Lorem ipsum guidance prose to clear the substantive-doc length bar. ".repeat(5);

// A genuinely repo-tailored doc: distinctive facts (OrderInvoice → order/invoice,
// checkout) referenced across MULTIPLE lines.
const tailoredDoc = (path: string) =>
  doc(
    path,
    `# ${path}\n\nThis service centers on the OrderInvoice domain model.\n` +
      `The checkout route (POST /checkout) validates the OrderInvoice first.\n` +
      `When extending OrderInvoice, keep the checkout invariants intact.` +
      PAD,
  );

describe("repoFactTerms (broad set)", () => {
  it("includes framework + model tokens; excludes generics", () => {
    const t = repoFactTerms(mkCtx());
    expect(t.has("order")).toBe(true);
    expect(t.has("react")).toBe(true);
    expect(t.has("src")).toBe(false);
  });
});

describe("distinctiveFactTerms (anti-gaming set)", () => {
  it("keeps model/route facts but EXCLUDES framework/language/project names", () => {
    const t = distinctiveFactTerms(mkCtx());
    expect(t.has("order")).toBe(true);
    expect(t.has("invoice")).toBe(true);
    expect(t.has("checkout")).toBe(true);
    expect(t.has("react")).toBe(false); // framework — any boilerplate names it
    expect(t.has("stripe")).toBe(false); // dependency
    expect(t.has("acme")).toBe(false); // project name
  });
});

describe("scoreAssessmentValidity", () => {
  it("scores a rich assessment high", () => {
    expect(scoreAssessmentValidity(mkCtx()).passed).toBe(true);
  });
  it("flags a degenerate multi-file repo with no detected facts", () => {
    const a = scoreAssessmentValidity(mkCtx({ detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null }, domain_models: [], routes: [] }));
    expect(a.passed).toBe(false);
    expect(a.score).toBeLessThanOrEqual(30);
  });
});

describe("scoreUniqueDesign (distinctive + distributed)", () => {
  const dist = distinctiveFactTerms(mkCtx());

  it("passes a package whose docs reference distinctive facts across docs + lines", () => {
    const r = scoreUniqueDesign([tailoredDoc("CLAUDE.md"), tailoredDoc("AGENTS.md"), tailoredDoc("architecture-summary.md")], dist);
    expect(r.passed).toBe(true);
  });

  it("DEFEATS a fact-stuffing banner (all distinctive facts on ONE line)", () => {
    const banner = doc("CLAUDE.md", "OrderInvoice checkout order invoice acme-shop React Express." + PAD);
    const r = scoreUniqueDesign([banner], dist);
    expect(r.passed).toBe(false); // facts concentrated on one line ≠ tailored
  });

  it("DEFEATS generic-name gaming (echoing React/project name is not distinctive)", () => {
    const generic = doc("CLAUDE.md", "# React project\nThis React acme-shop app uses React, TypeScript, React, React." + PAD);
    const r = scoreUniqueDesign([generic], dist);
    expect(r.passed).toBe(false);
  });

  it("EXCLUDES gate-injected artifacts so a repair fact-dump can't satisfy the metric", () => {
    // A fact-dump that WOULD be 'tailored' if counted, but lives at a gate path.
    const factDump = doc("detected-architecture.md", tailoredDoc("x").content);
    const r = scoreUniqueDesign([factDump], dist);
    expect(r.score).toBe(0); // excluded → no substantive docs counted
  });

  it("ignores tiny generic configs (below the substantive-doc length bar)", () => {
    const r = scoreUniqueDesign([doc("ci.yml", "name: CI")], dist);
    expect(r.evidence.join(" ")).toMatch(/substantive_docs=0/);
  });
});

describe("scoreNeedsCoverage", () => {
  it("marks detected needs uncovered when the package ignores them", () => {
    const r = scoreNeedsCoverage(mkCtx(), [doc("CLAUDE.md", "A monorepo.")]);
    expect(r.uncovered).toEqual(expect.arrayContaining(["testing", "ci_cd"]));
    expect(r.dim.passed).toBe(false);
  });
  it("counts a need covered when an artifact addresses it", () => {
    const files = [doc("t.md", "Add a vitest suite with coverage."), doc("ci.yml", "github actions workflow")];
    expect(scoreNeedsCoverage(mkCtx(), files).dim.passed).toBe(true);
  });
});

describe("gradePackage", () => {
  it("passes a tailored, needs-covering package and is deterministic", () => {
    const files = [
      tailoredDoc("CLAUDE.md"),
      tailoredDoc("AGENTS.md"),
      tailoredDoc("architecture-summary.md"),
      doc("test-and-ci.md", "Add a vitest suite + a github actions workflow." + PAD),
    ];
    const v = gradePackage(mkCtx(), files);
    expect(v.passed).toBe(true);
    expect(gradePackage(mkCtx(), files)).toEqual(v);
  });
  it("fails a boilerplate package on uniqueness", () => {
    expect(gradePackage(mkCtx(), [doc("CLAUDE.md", "Write good code. Be consistent." + PAD)]).unique_design.passed).toBe(false);
  });
});

describe("applyQualityGate (honest repair-then-return)", () => {
  it("repairs NEEDS but honestly flags uniqueness — no fake fact-dump repair", () => {
    const o = applyQualityGate(mkCtx(), [doc("CLAUDE.md", "Write good code." + PAD)]);
    expect(o.initial.passed).toBe(false);
    expect(o.verdict.needs_coverage.passed).toBe(true); // genuinely repaired
    expect(o.verdict.unique_design.passed).toBe(false); // honestly flagged, not faked
    expect(o.verdict.passed).toBe(false);
    expect(o.repairArtifacts.map((a) => a.path)).toEqual(["needs-remediation.md"]);
  });

  it("leaves a fully-tailored, needs-covered package passing with no repair", () => {
    const files = [tailoredDoc("CLAUDE.md"), tailoredDoc("AGENTS.md"), tailoredDoc("a.md"), doc("ci.md", "vitest + github actions workflow." + PAD)];
    const o = applyQualityGate(mkCtx(), files);
    expect(o.verdict.passed).toBe(true);
    expect(o.repairArtifacts).toEqual([]);
  });

  it("is deterministic", () => {
    const files = [doc("CLAUDE.md", "Generic." + PAD)];
    expect(applyQualityGate(mkCtx(), files)).toEqual(applyQualityGate(mkCtx(), files));
  });
});

describe("buildQualityReport", () => {
  it("emits package-quality-report.json with the honest verdict + rationale", () => {
    const o = applyQualityGate(mkCtx(), [doc("CLAUDE.md", "Write good code." + PAD)]);
    const report = buildQualityReport(o, "needs repaired; uniqueness low — generator output is generic.");
    const parsed = JSON.parse(report.content);
    expect(parsed.schema).toBe("axis-package-quality/1");
    expect(parsed.grade).toBe(o.verdict.grade);
    expect(parsed.dimensions.unique_design.passed).toBe(false);
    expect(parsed.rationale).toMatch(/uniqueness low/);
  });
  it("uses needs-remediation as the only injected repair artifact", () => {
    const o = applyQualityGate(mkCtx(), [doc("CLAUDE.md", "Generic." + PAD)]);
    expect(buildQualityReport(o, null).content).toMatch(/needs-remediation\.md/);
  });
});
