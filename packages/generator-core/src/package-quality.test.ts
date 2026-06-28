import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { generateClaudeMD, generateAgentsMD } from "./generators-skills.js";
import {
  distinctiveFactTerms,
  scoreAssessmentValidity,
  scoreGrounding,
  scoreNeedsCoverage,
  gradePackage,
  buildNeedsRemediationArtifact,
  applyQualityGate,
  buildQualityReport,
  type QualityFile,
  type DesignVerdict,
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
    domain_models: o.domain_models ?? [
      { name: "OrderInvoice", kind: "interface", language: "TypeScript", field_count: 5, source_file: "models/order.ts" },
      { name: "PaymentRecord", kind: "interface", language: "TypeScript", field_count: 8, source_file: "models/payment.ts" },
    ],
    sql_schema: o.sql_schema ?? [],
    architecture_signals: { patterns_detected: ["monorepo"], layer_boundaries: [], separation_score: 0.7, ...(o.architecture_signals ?? {}) },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: ["No test files detected", "No CI/CD pipeline detected"], ...(o.ai_context ?? {}) },
  } as ContextMap;
}

const doc = (path: string, content: string): QualityFile => ({ path, content, content_type: "text/markdown" });
const PAD = "\n" + "Lorem ipsum prose to clear the substantive length bar. ".repeat(6);
const defaultDocs = (ctx: ContextMap) => [generateClaudeMD(ctx), generateAgentsMD(ctx)].map((g) => doc(g.path, g.content));

describe("distinctiveFactTerms", () => {
  it("keeps model/route facts; excludes frameworks, and strips the project-name leak via hotspot paths", () => {
    const t = distinctiveFactTerms(
      mkCtx({
        project_identity: { name: "acme", type: "monorepo", primary_language: "TS", description: null, repo_url: null, go_module: null },
        dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [{ path: "lib/acme.js", inbound_count: 5, outbound_count: 2, risk_score: 0.6 }] },
      }),
    );
    expect(t.has("order")).toBe(true);
    expect(t.has("checkout")).toBe(true);
    expect(t.has("react")).toBe(false); // framework, not distinctive
    expect(t.has("acme")).toBe(false); // project name leaked via lib/acme.js → stripped
  });
});

describe("scoreAssessmentValidity (FLOOR)", () => {
  it("rich passes; degenerate fails", () => {
    expect(scoreAssessmentValidity(mkCtx()).passed).toBe(true);
    expect(scoreAssessmentValidity(mkCtx({ detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null }, domain_models: [], routes: [] })).passed).toBe(false);
  });
});

describe("scoreGrounding (FLOOR — references repo facts, not a design measure)", () => {
  it("the DEFAULT generated package PASSES grounding (it genuinely references the repo's facts)", () => {
    const ctx = mkCtx();
    expect(scoreGrounding(defaultDocs(ctx), distinctiveFactTerms(ctx)).passed).toBe(true);
  });
  it("pure generic boilerplate (no repo facts) FAILS grounding", () => {
    expect(scoreGrounding([doc("CLAUDE.md", "Write good code. Be consistent. Follow best practices." + PAD)], distinctiveFactTerms(mkCtx())).passed).toBe(false);
  });
  it("excludes gate artifacts + tiny configs", () => {
    expect(scoreGrounding([doc("needs-remediation.md", "OrderInvoice PaymentRecord checkout" + PAD)], distinctiveFactTerms(mkCtx())).score).toBe(0);
    expect(scoreGrounding([doc("ci.yml", "name: CI")], distinctiveFactTerms(mkCtx())).evidence.join(" ")).toMatch(/substantive_docs=0/);
  });
});

describe("scoreNeedsCoverage (FLOOR)", () => {
  it("uncovered when ignored; covered by a real artifact; NOT self-satisfied by the gate's own append", () => {
    const ctx = mkCtx();
    expect(scoreNeedsCoverage(ctx, [doc("CLAUDE.md", "x")]).dim.passed).toBe(false);
    expect(scoreNeedsCoverage(ctx, [doc("t.md", "Add a vitest suite."), doc("ci.yml", "github actions workflow")]).dim.passed).toBe(true);
    const before = scoreNeedsCoverage(ctx, [doc("CLAUDE.md", "x" + PAD)]);
    const fix = buildNeedsRemediationArtifact(ctx, before.uncovered);
    expect(scoreNeedsCoverage(ctx, [doc("CLAUDE.md", "x" + PAD), { ...fix }]).uncovered).toEqual(before.uncovered);
  });

  it("a package that only ECHOES the assessment's warnings does NOT cover the needs (no self-satisfaction)", () => {
    const ctx = mkCtx();
    // A doc that merely restates the warnings (as context-map.json / architecture-summary.md
    // do in real output) used to vacuously satisfy the floor — verified against the real
    // generators. Restating the gap is not addressing it.
    const echo = scoreNeedsCoverage(ctx, [doc("architecture-summary.md", "Warnings:\n" + ctx.ai_context!.warnings.join("\n") + PAD)]);
    expect(echo.uncovered).toEqual(expect.arrayContaining(["testing", "ci_cd"]));
    expect(echo.dim.passed).toBe(false);
    // Genuine remedy guidance (beyond restating the gap) still covers them.
    const real = scoreNeedsCoverage(ctx, [doc("guide.md", "Add a vitest suite and a github actions workflow." + PAD)]);
    expect(real.uncovered).toEqual([]);
    expect(real.dim.passed).toBe(true);
  });
});

describe("gradePackage + applyQualityGate (floors)", () => {
  it("a grounded + needs-covered package passes the floors; deterministic", () => {
    const ctx = mkCtx();
    const files = [...defaultDocs(ctx), doc("ci.md", "Add a vitest suite + a github actions workflow." + PAD)];
    const v = gradePackage(ctx, files);
    expect(v.passed).toBe(true);
    expect(gradePackage(ctx, files)).toEqual(v);
  });
  it("appends needs-remediation guidance, never blocks, and reports grounding honestly", () => {
    const o = applyQualityGate(mkCtx(), [doc("CLAUDE.md", "Write good code." + PAD)]);
    expect(o.verdict.grounding.passed).toBe(false); // generic boilerplate is not grounded
    expect(o.repairArtifacts.map((a) => a.path)).toEqual(["needs-remediation.md"]);
    expect(applyQualityGate(mkCtx(), [doc("CLAUDE.md", "Generic." + PAD)])).toEqual(applyQualityGate(mkCtx(), [doc("CLAUDE.md", "Generic." + PAD)]));
  });
});

describe("buildQualityReport (floors + AI design verdict)", () => {
  it("includes the AI design verdict when the judge ran", () => {
    const o = applyQualityGate(mkCtx(), [doc("CLAUDE.md", "Generic." + PAD)]);
    const design: DesignVerdict = { design_score: 35, tailored: false, rationale: "mostly template-fill", top_improvement: "add repo-specific guidance" };
    const parsed = JSON.parse(buildQualityReport(o, design).content);
    expect(parsed.schema).toBe("axis-package-quality/2");
    expect(parsed.design.score).toBe(35);
    expect(parsed.design.tailored).toBe(false);
    expect(parsed.floors.grounding).toHaveProperty("passed");
  });
  it("notes design was not AI-assessed when no model ran", () => {
    const o = applyQualityGate(mkCtx(), [doc("CLAUDE.md", "Generic." + PAD)]);
    expect(JSON.parse(buildQualityReport(o, null).content).design.assessed).toBe(false);
  });
});
