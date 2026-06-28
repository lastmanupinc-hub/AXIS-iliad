import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { GeneratorResult, GeneratedFile } from "./types.js";
import { appendAutonomyLoop, buildBeginYaml, buildContinuationYaml } from "./autonomy-loop.js";

// A minimal ContextMap carrying just the fields the begin-loop reads.
function ctx(overrides: Partial<ContextMap> = {}): ContextMap {
  return {
    generated_at: "1970-01-01T00:00:00.000Z",
    project_identity: { name: "loop-demo" },
    detection: { frameworks: [{ name: "React" }], languages: ["TypeScript"], test_frameworks: [] },
    ai_context: { warnings: ["No test files detected", "High dependency count (482)"] },
    dependency_graph: { hotspots: [{ path: "src/auth.ts" }, { path: "src/billing.ts" }] },
    ...overrides,
  } as unknown as ContextMap;
}

function file(path: string, program: string, content = "# " + path + "\nbody\n"): GeneratedFile {
  const md = /\.md$/.test(path);
  return { path, content, content_type: md ? "text/markdown" : "application/json", program, description: "x" };
}

function result(): GeneratorResult {
  return {
    snapshot_id: "s",
    project_id: "p",
    generated_at: "1970-01-01T00:00:00.000Z",
    files: [file("AGENTS.md", "skills"), file("context-map.json", "search", "{}"), file("debug-playbook.md", "debug")],
    skipped: [],
  } as unknown as GeneratorResult;
}

describe("appendAutonomyLoop", () => {
  it("adds begin.yaml + continuation.yaml tagged program 'begin'", () => {
    const r = result();
    appendAutonomyLoop(r, ctx());
    const begin = r.files.find((f) => f.path === "begin.yaml");
    const cont = r.files.find((f) => f.path === "continuation.yaml");
    expect(begin?.program).toBe("begin");
    expect(cont?.program).toBe("begin");
    expect(r.files).toHaveLength(5); // 3 originals + 2 loop files
  });

  it("footers every markdown artifact; the last one self-prompts 'begin', others point to the next", () => {
    const r = result();
    appendAutonomyLoop(r, ctx());
    const agents = r.files.find((f) => f.path === "AGENTS.md")!;
    const lastMd = r.files.find((f) => f.path === "debug-playbook.md")!;
    expect(agents.content).toContain("Continue the loop");
    expect(agents.content).toContain("Next:"); // non-terminal → points forward
    expect(agents.content).not.toContain("begin** (re-read");
    expect(lastMd.content).toContain("begin** (re-read"); // terminal → self-prompt back to begin.yaml
  });

  it("never footers non-markdown artifacts (keeps JSON/data valid)", () => {
    const r = result();
    const before = r.files.find((f) => f.path === "context-map.json")!.content;
    appendAutonomyLoop(r, ctx());
    expect(r.files.find((f) => f.path === "context-map.json")!.content).toBe(before);
  });

  it("is a no-op on an empty result (nothing to wrap)", () => {
    const r = { ...result(), files: [] } as GeneratorResult;
    appendAutonomyLoop(r, ctx());
    expect(r.files).toHaveLength(0);
  });

  it("is idempotent on the loop files (path-collision guard)", () => {
    const r = result();
    appendAutonomyLoop(r, ctx());
    const n = r.files.length;
    appendAutonomyLoop(r, ctx()); // second pass must not duplicate begin.yaml/continuation.yaml
    expect(r.files.filter((f) => f.path === "begin.yaml")).toHaveLength(1);
    expect(r.files.filter((f) => f.path === "continuation.yaml")).toHaveLength(1);
    expect(r.files.length).toBeGreaterThanOrEqual(n); // footers may re-append but loop files don't dup
  });
});

describe("buildBeginYaml", () => {
  it("carries identity, the move-selection loop, and CONVERGENT stop conditions", () => {
    const y = buildBeginYaml(ctx());
    expect(y).toContain("project_begin:");
    expect(y).toContain('name: "loop-demo"');
    expect(y).toContain("goal:");
    expect(y).toContain("next_move_selection_algorithm:");
    expect(y).toContain("continue_until_stop_condition");
    expect(y).toContain("no_open_candidates_remain"); // the loop terminates — not perpetual
    expect(y).toContain("human_in_the_loop:");
    // Hotspots become don't-touch-without-asking guardrails.
    expect(y).toContain("src/auth.ts");
  });

  it("is deterministic (same ctx → identical bytes)", () => {
    expect(buildBeginYaml(ctx())).toBe(buildBeginYaml(ctx()));
  });
});

describe("buildContinuationYaml", () => {
  const files = [file("AGENTS.md", "skills"), file("x.json", "search", "{}"), file("d.md", "debug")];

  it("seeds candidates (goal first) + an ordered step-list whose last command is 'begin'", () => {
    const y = buildContinuationYaml(ctx(), files);
    expect(y).toContain("candidates:");
    expect(y).toContain('id: "goal"');
    expect(y).toContain("steps:");
    // The final step is the self-prompt.
    const stepCmds = y.split("\n").filter((l) => l.includes("command:"));
    expect(stepCmds[stepCmds.length - 1]).toContain("begin");
  });

  it("adds a verify-harness candidate when no test framework is detected", () => {
    expect(buildContinuationYaml(ctx(), files)).toContain('id: "verify-harness"');
    const withTests = ctx({ detection: { frameworks: [], languages: ["TypeScript"], test_frameworks: ["vitest"] } } as Partial<ContextMap>);
    expect(buildContinuationYaml(withTests, files)).not.toContain('id: "verify-harness"');
  });
});
