import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import {
  repoFactTerms,
  scoreAssessmentValidity,
  scoreUniqueDesign,
  scoreNeedsCoverage,
  gradePackage,
  buildDetectedArchitectureArtifact,
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

describe("repoFactTerms", () => {
  it("extracts repo-specific tokens (camelCase split) and excludes generics", () => {
    const t = repoFactTerms(mkCtx());
    expect(t.has("order")).toBe(true);
    expect(t.has("invoice")).toBe(true);
    expect(t.has("react")).toBe(true);
    expect(t.has("stripe")).toBe(true);
    expect(t.has("checkout")).toBe(true);
    expect(t.has("src")).toBe(false); // generic
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
    expect(a.evidence.join(" ")).toMatch(/degenerate/);
  });
});

describe("scoreUniqueDesign", () => {
  const terms = repoFactTerms(mkCtx());
  it("scores a repo-grounded package high", () => {
    const files = [doc("CLAUDE.md", "This React + Express app exposes a checkout route. The OrderInvoice model is served via Stripe.")];
    expect(scoreUniqueDesign(files, terms).passed).toBe(true);
  });
  it("flags generic boilerplate as low + names it", () => {
    const r = scoreUniqueDesign([doc("CLAUDE.md", "Welcome to your project. Write clean code. Follow best practices and conventions.")], terms);
    expect(r.passed).toBe(false);
    expect(r.evidence.join(" ")).toMatch(/boilerplate.*CLAUDE\.md/);
  });
});

describe("scoreNeedsCoverage", () => {
  it("marks detected needs uncovered when the package ignores them", () => {
    const r = scoreNeedsCoverage(mkCtx(), [doc("CLAUDE.md", "A monorepo using React.")]);
    expect(r.detected).toEqual(expect.arrayContaining(["testing", "ci_cd"]));
    expect(r.uncovered).toEqual(expect.arrayContaining(["testing", "ci_cd"]));
    expect(r.dim.passed).toBe(false);
  });
  it("counts a need covered when an artifact addresses it", () => {
    const files = [doc("test-rules.md", "Add a vitest suite with coverage."), doc("ci.yml", "name: CI\non: push\njobs: { build: {} } # github actions workflow")];
    const r = scoreNeedsCoverage(mkCtx(), files);
    expect(r.uncovered).toEqual([]);
    expect(r.dim.passed).toBe(true);
  });
});

describe("gradePackage", () => {
  it("passes a grounded, needs-covering package and is deterministic", () => {
    const ctx = mkCtx();
    const files = [
      doc("CLAUDE.md", "React + Express monorepo. OrderInvoice model, checkout route via Stripe."),
      doc("test-generation-rules.md", "Add vitest coverage for the hotspots."),
      doc("ci.yml", "github actions workflow: build + test on push"),
    ];
    const v = gradePackage(ctx, files);
    expect(v.passed).toBe(true);
    expect(["A", "B", "C"]).toContain(v.grade);
    expect(gradePackage(ctx, files)).toEqual(v); // deterministic
  });
  it("fails a boilerplate, needs-ignoring package", () => {
    const v = gradePackage(mkCtx(), [doc("CLAUDE.md", "Write good code. Be consistent.")]);
    expect(v.passed).toBe(false);
  });
});

describe("repair augmentation lifts the weak dimensions", () => {
  it("detected-architecture artifact is grounded (raises uniqueness)", () => {
    const ctx = mkCtx();
    const art = buildDetectedArchitectureArtifact(ctx);
    const r = scoreUniqueDesign([{ ...art }], repoFactTerms(ctx));
    expect(r.passed).toBe(true);
    expect(art.content).toMatch(/OrderInvoice/);
    expect(art.content).toMatch(/checkout/);
  });
  it("needs-remediation artifact covers the uncovered needs", () => {
    const ctx = mkCtx();
    const before = scoreNeedsCoverage(ctx, [doc("CLAUDE.md", "monorepo")]);
    expect(before.uncovered.length).toBeGreaterThan(0);
    const fix = buildNeedsRemediationArtifact(ctx, before.uncovered);
    const after = scoreNeedsCoverage(ctx, [doc("CLAUDE.md", "monorepo"), { ...fix }]);
    expect(after.uncovered).toEqual([]);
  });
});

describe("applyQualityGate (repair-then-return)", () => {
  it("repairs a failing-but-repairable package up to a pass", () => {
    const ctx = mkCtx();
    const o = applyQualityGate(ctx, [doc("CLAUDE.md", "Write good code. Be consistent.")]);
    expect(o.initial.passed).toBe(false);
    expect(o.verdict.passed).toBe(true);
    expect(o.repairArtifacts.map((a) => a.path).sort()).toEqual(["detected-architecture.md", "needs-remediation.md"]);
  });

  it("cannot repair a thin/degenerate repo (assessment stays flagged) and terminates", () => {
    const thin = mkCtx({
      detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
      domain_models: [],
      routes: [],
      dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
      ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
      project_identity: { name: "", type: "", primary_language: "", description: null, repo_url: null, go_module: null },
    });
    const o = applyQualityGate(thin, [doc("CLAUDE.md", "x")]);
    expect(o.verdict.passed).toBe(false);
    expect(o.verdict.assessment_validity.passed).toBe(false);
  });

  it("is deterministic", () => {
    const ctx = mkCtx();
    const files = [doc("CLAUDE.md", "Generic.")];
    expect(applyQualityGate(ctx, files)).toEqual(applyQualityGate(ctx, files));
  });
});

describe("buildQualityReport", () => {
  it("emits a package-quality-report.json with grade, dimensions, repaired, rationale", () => {
    const o = applyQualityGate(mkCtx(), [doc("CLAUDE.md", "Write good code.")]);
    const report = buildQualityReport(o, "LLM says: well-grounded after repair.");
    expect(report.path).toBe("package-quality-report.json");
    const parsed = JSON.parse(report.content);
    expect(parsed.schema).toBe("axis-package-quality/1");
    expect(parsed.grade).toBe(o.verdict.grade);
    expect(parsed.repaired).toContain("detected-architecture.md");
    expect(parsed.dimensions.unique_design).toHaveProperty("score");
    expect(parsed.rationale).toMatch(/well-grounded/);
    expect(buildQualityReport(o, null).content).toMatch(/"rationale": null/);
  });
});
