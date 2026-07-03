import { describe, it, expect } from "vitest";
import { parse } from "yaml";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import {
  testRunCommand,
  hasTypecheck,
  generateSuperpowerPack,
  generateWorkflowRegistry,
  generateAutomationPipeline,
} from "./generators-superpowers.js";

const profile = {} as RepoProfile;
function ctxWith(over: Partial<ContextMap["detection"]> & { primary_language?: string } = {}): ContextMap {
  const { primary_language, ...det } = over;
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: primary_language ?? "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null, ...det },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.3 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
  } as ContextMap;
}

describe("testRunCommand — one source of truth", () => {
  it("returns the correct command per framework", () => {
    expect(testRunCommand(["vitest"], "pnpm")).toBe("npx vitest run");
    expect(testRunCommand(["jest"], "npm")).toBe("npx jest");
    expect(testRunCommand(["pytest"], "pip")).toBe("python -m pytest");
    expect(testRunCommand([], "pnpm")).toBe("pnpm test");
  });
});

describe("hasTypecheck", () => {
  it("true when TypeScript is primary or among the detected languages, false otherwise", () => {
    expect(hasTypecheck(ctxWith({ primary_language: "TypeScript" }))).toBe(true);
    expect(hasTypecheck(ctxWith({ primary_language: "Python", build_tools: [] }))).toBe(false);
    expect(hasTypecheck(ctxWith({ primary_language: "Go", languages: [] }))).toBe(false);
  });
});

describe("cross-file test-command agreement (the disagreement the review flagged)", () => {
  it("a pytest repo gets `python -m pytest` in all three files — never `npx pytest run` or a bare `pip test`", () => {
    const ctx = ctxWith({ test_frameworks: ["pytest"], primary_language: "Python", package_managers: ["pip"] });
    const pack = generateSuperpowerPack(ctx, []).content;
    const reg = generateWorkflowRegistry(ctx, profile, []).content;
    const pipe = generateAutomationPipeline(ctx, profile, []).content;
    for (const [name, out] of [["pack", pack], ["registry", reg], ["pipeline", pipe]] as const) {
      expect(out, name).toContain("python -m pytest");
      expect(out, name).not.toContain("npx pytest run");
    }
    expect(reg).not.toMatch(/pip test/);      // registry no longer falls back to `pip test`
    // the registry parses and its build-verify test step is python
    const parsed = JSON.parse(reg) as { workflows: Array<{ id: string; steps: string[] }> };
    const verify = parsed.workflows.find((w) => w.id === "full-build-verify");
    expect(verify?.steps).toContain("python -m pytest");
  });
  it("a jest repo's pipeline uses `npx jest`, not the broken `npx jest run`", () => {
    const pipe = generateAutomationPipeline(ctxWith({ test_frameworks: ["jest"] }), profile, []).content;
    const y = parse(pipe) as { pipeline: { stages: Array<{ name: string; commands: string[] }> } };
    const test = y.pipeline.stages.find((s) => s.name === "test");
    expect(test?.commands).toContain("npx jest");
    expect(pipe).not.toContain("npx jest run");
  });
});

describe("pipeline typecheck gate (#2 — no tsc for non-TS repos)", () => {
  it("omits `tsc --noEmit` for a Python repo", () => {
    expect(generateAutomationPipeline(ctxWith({ primary_language: "Python", build_tools: [] }), profile, []).content).not.toContain("tsc --noEmit");
  });
  it("includes `tsc --noEmit` for a TypeScript repo", () => {
    expect(generateAutomationPipeline(ctxWith({ primary_language: "TypeScript" }), profile, []).content).toContain("tsc --noEmit");
  });
});

describe("HARDEN-2 — pipeline robustness + mixed-language typecheck", () => {
  it("the lint stage is never an empty `commands:` (a Python/no-eslint repo gets a fallback)", () => {
    const pipe = generateAutomationPipeline(ctxWith({ primary_language: "Python", build_tools: [], test_frameworks: [] }), profile, []).content;
    const y = parse(pipe) as { pipeline: { stages: Array<{ name: string; commands: unknown }> } };
    const lint = y.pipeline.stages.find((s) => s.name === "lint");
    expect(Array.isArray(lint?.commands)).toBe(true);
    expect((lint?.commands as string[]).length).toBeGreaterThan(0);
  });
  it("hasTypecheck is true when TypeScript is present but not primary (mixed JS+TS repo)", () => {
    const ctx = ctxWith({ primary_language: "JavaScript", languages: [
      { name: "JavaScript", file_count: 5, loc: 500, loc_percent: 70 },
      { name: "TypeScript", file_count: 2, loc: 200, loc_percent: 30 },
    ] as ContextMap["detection"]["languages"] });
    expect(hasTypecheck(ctx)).toBe(true);
    expect(generateAutomationPipeline(ctx, profile, []).content).toContain("tsc --noEmit");
  });
});
