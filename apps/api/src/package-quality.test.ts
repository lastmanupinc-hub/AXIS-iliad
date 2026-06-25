import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { generateClaudeMD, generateAgentsMD } from "@axis/generator-core";
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
    detection: { languages: ["TypeScript"], frameworks: [{ name: "React", version: "19.0.0" }, { name: "Express", version: "5.0.0" }] as ContextMap["detection"]["frameworks"], build_tools: ["vite"], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: "docker", ...(o.detection ?? {}) },
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
const PAD = "\n" + "Lorem ipsum guidance prose to clear the substantive length bar. ".repeat(5);

// Genuine design guidance: distinctive facts (OrderInvoice → order/invoice, checkout)
// referenced inside PROSE sentences across multiple lines.
const tailoredDoc = (path: string) =>
  doc(
    path,
    `${path}\n\nThis service centers on the OrderInvoice domain model and its lifecycle.\n` +
      `The checkout route validates each OrderInvoice before charging the customer.\n` +
      `When you extend the OrderInvoice schema, keep the checkout invariants intact.` +
      PAD,
  );

describe("distinctiveFactTerms", () => {
  it("keeps model/route facts, excludes framework/language/project names", () => {
    const t = distinctiveFactTerms(mkCtx());
    expect(t.has("order")).toBe(true);
    expect(t.has("checkout")).toBe(true);
    expect(t.has("react")).toBe(false);
    expect(t.has("acme")).toBe(false);
  });
  it("repoFactTerms (broad) still includes frameworks", () => {
    expect(repoFactTerms(mkCtx()).has("react")).toBe(true);
  });
});

describe("scoreAssessmentValidity", () => {
  it("rich passes; degenerate fails", () => {
    expect(scoreAssessmentValidity(mkCtx()).passed).toBe(true);
    const a = scoreAssessmentValidity(mkCtx({ detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null }, domain_models: [], routes: [] }));
    expect(a.passed).toBe(false);
  });
});

describe("scoreUniqueDesign — credits PROSE design, not fact echo", () => {
  const dist = distinctiveFactTerms(mkCtx());

  it("passes docs that reference distinctive facts in prose across docs + lines", () => {
    expect(scoreUniqueDesign([tailoredDoc("CLAUDE.md"), tailoredDoc("AGENTS.md"), tailoredDoc("arch.md")], dist).passed).toBe(true);
  });

  it("DEFEATS the default machine-generated CLAUDE.md/AGENTS.md (fact tables, no prose design)", () => {
    const ctx = mkCtx({
      domain_models: [
        { name: "OrderInvoice", kind: "interface", language: "TypeScript", field_count: 5, source_file: "models/order.ts" },
        { name: "PaymentRecord", kind: "interface", language: "TypeScript", field_count: 8, source_file: "models/payment.ts" },
      ],
    });
    const real = [generateClaudeMD(ctx), generateAgentsMD(ctx)].map((g) => doc(g.path, g.content));
    const r = scoreUniqueDesign(real, distinctiveFactTerms(ctx));
    expect(r.passed).toBe(false); // a fact-table echo is NOT design tailoring
  });

  it("DEFEATS a single fact-stuffing banner line", () => {
    expect(scoreUniqueDesign([doc("CLAUDE.md", "OrderInvoice checkout order invoice acme React Express." + PAD)], dist).passed).toBe(false);
  });

  it("DEFEATS generic-name gaming (echoing React/project is not distinctive)", () => {
    expect(scoreUniqueDesign([doc("CLAUDE.md", "This React acme-shop app uses React and TypeScript and React everywhere." + PAD)], dist).passed).toBe(false);
  });

  it("EXCLUDES gate-injected artifacts (a repair fact-dump can't satisfy the metric)", () => {
    expect(scoreUniqueDesign([doc("detected-architecture.md", tailoredDoc("x").content)], dist).score).toBe(0);
  });
});

describe("scoreNeedsCoverage", () => {
  it("uncovered when ignored; covered by a real generator artifact", () => {
    expect(scoreNeedsCoverage(mkCtx(), [doc("CLAUDE.md", "A monorepo.")]).dim.passed).toBe(false);
    const ok = scoreNeedsCoverage(mkCtx(), [doc("rules.md", "Add a vitest suite with coverage."), doc("ci.yml", "github actions workflow")]);
    expect(ok.dim.passed).toBe(true);
  });

  it("does NOT self-satisfy from the gate's own needs-remediation.md", () => {
    const ctx = mkCtx();
    const base = [doc("CLAUDE.md", "A monorepo." + PAD)];
    const before = scoreNeedsCoverage(ctx, base);
    expect(before.uncovered.length).toBeGreaterThan(0);
    const fix = buildNeedsRemediationArtifact(ctx, before.uncovered);
    const after = scoreNeedsCoverage(ctx, [...base, { ...fix }]);
    expect(after.uncovered).toEqual(before.uncovered); // excluded → no fake coverage
  });
});

describe("gradePackage", () => {
  it("passes a prose-tailored, needs-covered package; deterministic", () => {
    const files = [tailoredDoc("CLAUDE.md"), tailoredDoc("AGENTS.md"), tailoredDoc("arch.md"), doc("ci.md", "Add a vitest suite + a github actions workflow." + PAD)];
    const v = gradePackage(mkCtx(), files);
    expect(v.passed).toBe(true);
    expect(gradePackage(mkCtx(), files)).toEqual(v);
  });
  it("fails a boilerplate package on uniqueness", () => {
    expect(gradePackage(mkCtx(), [doc("CLAUDE.md", "Write good code. Be consistent." + PAD)]).unique_design.passed).toBe(false);
  });
});

describe("applyQualityGate — honest grading, no fake repair", () => {
  it("appends remediation guidance but reports uniqueness AND needs honestly (neither faked)", () => {
    const o = applyQualityGate(mkCtx(), [doc("CLAUDE.md", "Write good code." + PAD)]);
    expect(o.verdict.unique_design.passed).toBe(false); // not faked by a fact-dump
    expect(o.verdict.needs_coverage.passed).toBe(false); // not self-satisfied by the append
    expect(o.verdict.passed).toBe(false);
    expect(o.repairArtifacts.map((a) => a.path)).toEqual(["needs-remediation.md"]); // useful guidance, not a score lift
  });

  it("leaves a genuinely tailored, needs-covered package passing with no repair", () => {
    const files = [tailoredDoc("CLAUDE.md"), tailoredDoc("AGENTS.md"), tailoredDoc("arch.md"), doc("ci.md", "vitest + github actions workflow." + PAD)];
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
  it("emits the honest verdict + rationale", () => {
    const o = applyQualityGate(mkCtx(), [doc("CLAUDE.md", "Write good code." + PAD)]);
    const parsed = JSON.parse(buildQualityReport(o, "uniqueness low — default generator output is fact-echo, not designed guidance.").content);
    expect(parsed.schema).toBe("axis-package-quality/1");
    expect(parsed.dimensions.unique_design.passed).toBe(false);
    expect(parsed.rationale).toMatch(/uniqueness low/);
  });
});
