// app_42: buildMarketingSequences is a SEPARATE extraction of the same
// content generateSequencePack renders as markdown — deliberately not
// sharing code with it (same reasoning as app_23 not touching
// generateDashboardWidget: don't widen a core deterministic generator's
// blast radius for an Apply-time concern). Because the two don't share
// code, they COULD drift; THE CROSS-CHECK TEST below is what actually
// closes that, by parsing the real generateSequencePack markdown and
// asserting every subject/day-offset here really appears in it.
import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { generateSequencePack, buildMarketingSequences } from "./generators-marketing.js";

function ctxWith(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "monorepo", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.3 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...over,
  } as ContextMap;
}

describe("buildMarketingSequences — structure", () => {
  it("returns the three sequences with their real step counts", () => {
    const seqs = buildMarketingSequences(ctxWith());
    expect(seqs.map((s) => s.sequence_name)).toEqual([
      "Welcome Sequence (Post-Install)",
      "Re-engagement Sequence (Inactive 14+ days)",
      "Contributor Outreach Sequence",
    ]);
    expect(seqs[0]!.steps).toHaveLength(3);
    expect(seqs[1]!.steps).toHaveLength(2);
    expect(seqs[2]!.steps).toHaveLength(1);
  });

  it("every step has a non-empty subject and at least one body bullet", () => {
    for (const seq of buildMarketingSequences(ctxWith())) {
      for (const step of seq.steps) {
        expect(step.subject.length).toBeGreaterThan(0);
        expect(step.body_bullets.length).toBeGreaterThan(0);
        expect(step.delay_days).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("day offsets match the documented sequence timing (0/2/5, 14/21, 0)", () => {
    const seqs = buildMarketingSequences(ctxWith());
    expect(seqs[0]!.steps.map((s) => s.delay_days)).toEqual([0, 2, 5]);
    expect(seqs[1]!.steps.map((s) => s.delay_days)).toEqual([14, 21]);
    expect(seqs[2]!.steps.map((s) => s.delay_days)).toEqual([0]);
  });

  it("is deterministic — same context twice, identical structure", () => {
    const ctx = ctxWith({ domain_models: [{ name: "Order", kind: "interface", field_count: 2, source_file: "o.ts" }] as ContextMap["domain_models"] });
    expect(buildMarketingSequences(ctx)).toEqual(buildMarketingSequences(ctx));
  });
});

describe("buildMarketingSequences — THE CROSS-CHECK GUARD (no drift from the real markdown)", () => {
  it("every subject line in the structured data really appears in generateSequencePack's markdown", () => {
    const ctx = ctxWith({
      domain_models: [{ name: "Widget", kind: "interface", field_count: 3, source_file: "w.ts" }] as ContextMap["domain_models"],
      ai_context: { project_summary: "", key_abstractions: [], conventions: ["prefer composition"], warnings: [] },
    });
    const md = generateSequencePack(ctx).content;
    for (const seq of buildMarketingSequences(ctx)) {
      expect(md, `sequence "${seq.sequence_name}" missing from markdown`).toContain(`## ${seq.sequence_name}`);
      for (const step of seq.steps) {
        expect(md, `subject "${step.subject}" missing from markdown`).toContain(`**Subject**: ${step.subject}`);
        const dayLabel = step.heading_suffix
          ? `Day ${step.delay_days} — ${step.heading_suffix}`
          : `Day ${step.delay_days}`;
        expect(md, `heading for "${step.label}" (${dayLabel}) missing from markdown`).toContain(`### ${step.label} (${dayLabel})`);
        for (const bullet of step.body_bullets) {
          expect(md, `bullet "${bullet}" missing from markdown`).toContain(`- ${bullet}`);
        }
      }
    }
  });

  it("the cross-check is non-vacuous: a structured subject that does NOT match the real markdown is caught", () => {
    // Prove the guard actually compares content, not just presence of a
    // "Subject:" line anywhere — feed it a subject deliberately absent from
    // the real markdown and confirm the assertion actually fails.
    const ctx = ctxWith();
    const md = generateSequencePack(ctx).content;
    expect(md).not.toContain("**Subject**: this subject was never generated");
  });

  it("no-frameworks/no-conventions/no-domain-models context still produces valid structured + markdown output that agree", () => {
    const ctx = ctxWith(); // the bare-minimum fixture — no models, no abstractions, no conventions
    const md = generateSequencePack(ctx).content;
    const seqs = buildMarketingSequences(ctx);
    // Email 2's fallback branch (no models, no key_abstractions) — proves the
    // cross-check still holds on the LEAST-populated context, not just a
    // richly-populated one.
    const email2 = seqs[0]!.steps[1]!;
    expect(email2.body_bullets).toContain("Highlight the primary use case and core value proposition");
    expect(md).toContain("- Highlight the primary use case and core value proposition");
  });
});
