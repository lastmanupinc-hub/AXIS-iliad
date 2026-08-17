// app_31 — frontend components inferred from ONE source, and provably constrained by it.
//
// The tests that matter here are the WITHHOLD tests. Generating a component is
// the easy half; the product claim is that an invented colour or an inaccessible
// control cannot reach a customer's repo even if the model produces one. Each
// gate below is therefore exercised with input that SHOULD fail, so a regression
// that quietly disables a gate fails this file instead of shipping.
import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import {
  buildComponentContract,
  verifyGeneratedComponent,
  extractHexes,
  type GeneratedComponent,
} from "./frontend-components.js";

// Same shape as generators-theme-develop.test.ts's fixture — generateDesignTokens
// reads structure.file_tree_summary and dependency_graph, so a partial ctx throws
// rather than producing a contract.
type Fw = ContextMap["detection"]["frameworks"][number];

function ctxWith(frameworks: string[] = ["React"]): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-08-17T00:00:00Z",
    project_identity: { name: "probe-app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [], top_level_layout: [] },
    detection: {
      languages: [{ name: "TypeScript", file_count: 5, loc: 1000, loc_percent: 100 }] as ContextMap["detection"]["languages"],
      frameworks: frameworks.map((name) => ({ name, version: null, confidence: 0.9, evidence: [] })) as Fw[],
      build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null,
    },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.7 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
  } as ContextMap;
}

const FILES = [{ path: "src/App.tsx", content: "export const App = () => <div />;" }];

describe("buildComponentContract — the single source", () => {
  it("derives the palette from the REAL generated token artifact, not a second copy", () => {
    const c = buildComponentContract(ctxWith(), FILES);
    // Non-trivial: a broken parse would yield [] and every later assertion would
    // pass vacuously, which is exactly the failure this guards.
    expect(c.palette.length).toBeGreaterThan(10);
    expect(c.palette.every((h) => /^#[0-9a-f]{3,8}$/.test(h))).toBe(true);
    // The averionics preset's HUD cyan primary — proves we read the real tokens.
    expect(c.palette).toContain("#06b6d4");
  });

  it("is deterministic — same ctx twice yields an identical contract", () => {
    const a = buildComponentContract(ctxWith(), FILES);
    const b = buildComponentContract(ctxWith(), FILES);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("picks .tsx for a TypeScript repo and .jsx otherwise", () => {
    expect(buildComponentContract(ctxWith(), FILES).extension).toBe(".tsx");
    expect(
      buildComponentContract(ctxWith(), [{ path: "src/App.js", content: "" }]).extension,
    ).toBe(".jsx");
  });
});

describe("extractHexes", () => {
  it("finds every hex form and lowercases them", () => {
    expect(extractHexes("color:#FFF; border:#06B6D4; bg:#083344")).toEqual([
      "#06b6d4",
      "#083344",
      "#fff",
    ]);
  });

  it("returns nothing when the component uses only token variables", () => {
    expect(extractHexes("className='bg-primary-500' style={{color:'var(--color-primary-500)'}}")).toEqual([]);
  });
});

describe("verifyGeneratedComponent — the gates that make this safe", () => {
  const contract = buildComponentContract(ctxWith(), FILES);

  it("passes a component that uses only contract colours and accessible markup", () => {
    const good: GeneratedComponent = {
      component_name: "PrimaryButton",
      code: [
        "export function PrimaryButton({ label }: { label: string }) {",
        "  return <button type=\"button\" style={{ background: \"#06b6d4\" }}>{label}</button>;",
        "}",
      ].join("\n"),
    };
    const v = verifyGeneratedComponent(good, contract);
    expect(v.invented_colors).toEqual([]);
    expect(v.findings).toEqual([]);
    expect(v.ok).toBe(true);
  });

  // ── the gate the whole design exists for ──
  it("WITHHOLDS a component that invents a colour the design system never defined", () => {
    const offBrand: GeneratedComponent = {
      component_name: "OffBrand",
      code: "export const OffBrand = () => <button type=\"button\" style={{ background: \"#ff00ff\" }}>x</button>;",
    };
    const v = verifyGeneratedComponent(offBrand, contract);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("invented_colors");
    expect(v.invented_colors).toContain("#ff00ff");
  });

  it("WITHHOLDS a div-with-onClick — an interactive element that is not a real control", () => {
    const inaccessible: GeneratedComponent = {
      component_name: "FakeButton",
      code: "export const FakeButton = () => <div onClick={() => {}}>Save</div>;",
    };
    const v = verifyGeneratedComponent(inaccessible, contract);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("audit_failed");
    expect(v.findings.map((f) => f.category)).toContain("click-nonbutton");
  });

  it("WITHHOLDS an <img> with no alt text", () => {
    const noAlt: GeneratedComponent = {
      component_name: "Avatar",
      code: "export const Avatar = () => <img src=\"/a.png\" />;",
    };
    const v = verifyGeneratedComponent(noAlt, contract);
    expect(v.ok).toBe(false);
    expect(v.findings.map((f) => f.category)).toContain("missing-alt");
  });

  it("WITHHOLDS dangerouslySetInnerHTML", () => {
    const xss: GeneratedComponent = {
      component_name: "RawHtml",
      code: "export const RawHtml = ({ h }: { h: string }) => <div dangerouslySetInnerHTML={{ __html: h }} />;",
    };
    const v = verifyGeneratedComponent(xss, contract);
    expect(v.ok).toBe(false);
    expect(v.findings.map((f) => f.category)).toContain("dangerous-html");
  });

  it("reports the colour gate BEFORE the audit gate, so the actionable cause is named first", () => {
    // Both defects at once: the off-brand colour is the one a designer must fix,
    // and it is the one this program uniquely detects, so it must not be masked.
    const both: GeneratedComponent = {
      component_name: "Doubly",
      code: "export const Doubly = () => <div onClick={() => {}} style={{ background: \"#123456\" }}>x</div>;",
    };
    const v = verifyGeneratedComponent(both, contract);
    expect(v.reason).toBe("invented_colors");
  });

  it("is deterministic — verifying the same component twice gives the same verdict", () => {
    const c: GeneratedComponent = {
      component_name: "Twice",
      code: "export const Twice = () => <button type=\"button\">ok</button>;",
    };
    expect(JSON.stringify(verifyGeneratedComponent(c, contract))).toBe(
      JSON.stringify(verifyGeneratedComponent(c, contract)),
    );
  });
});
