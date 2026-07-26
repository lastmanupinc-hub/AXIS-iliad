import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import type { ContextMap } from "@axis/context-engine";
import type { GeneratorResult, GeneratedFile } from "./types.js";
import {
  appendAutonomyLoop,
  buildBeginYaml,
  buildContinuationYaml,
  buildTicketSystemBlock,
  detectTicketUnits,
  CONTINUE_FOOTER_MARKER,
} from "./autonomy-loop.js";

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

  // SPEC-10 Fix 2: locks the exported marker to continueFooter's actual output so
  // consumers (e.g. memory-weave's footer-preservation carry-over) can't silently drift.
  it("every footered artifact's footer starts with the exported CONTINUE_FOOTER_MARKER", () => {
    const r = result();
    appendAutonomyLoop(r, ctx());
    for (const f of r.files.filter((f) => /\.md$/.test(f.path) && f.path !== "begin.yaml")) {
      expect(f.content.indexOf(CONTINUE_FOOTER_MARKER)).toBeGreaterThan(-1);
    }
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

  it("is fully idempotent — a second pass is a no-op (begin.yaml guard)", () => {
    const r = result();
    appendAutonomyLoop(r, ctx());
    const n = r.files.length;
    const agentsBefore = r.files.find((f) => f.path === "AGENTS.md")!.content;
    appendAutonomyLoop(r, ctx()); // begin.yaml already present → whole pass is a no-op
    expect(r.files.length).toBe(n); // no new files
    expect(r.files.filter((f) => f.path === "begin.yaml")).toHaveLength(1);
    expect(r.files.filter((f) => f.path === "continuation.yaml")).toHaveLength(1);
    // Footer not doubled — exactly one continuation footer remains on the markdown artifact.
    expect(r.files.find((f) => f.path === "AGENTS.md")!.content).toBe(agentsBefore);
    expect((agentsBefore.match(/Continue the loop/g) ?? []).length).toBe(1);
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

// ─── Inter-repo ticket system ───────────────────────────────────

/** A ContextMap with a real multi-unit (monorepo) topology. */
function monorepoCtx(): ContextMap {
  return ctx({
    structure: {
      top_level_layout: [
        { name: "apps", purpose: "monorepo_apps", file_count: 40 },
        { name: "packages", purpose: "monorepo_packages", file_count: 20 },
        { name: "docs", purpose: "documentation", file_count: 5 },
      ],
      file_tree_summary: [
        { path: "apps/api/src/server.ts", type: "file" },
        { path: "apps/web/src/main.tsx", type: "file" },
        { path: "packages/billing/src/index.ts", type: "file" },
        { path: "docs/readme.md", type: "file" },
        // A file sitting directly in a root is NOT a unit (needs depth >= 3).
        { path: "apps/tsconfig.json", type: "file" },
      ],
    },
  } as Partial<ContextMap>);
}

/** A ContextMap with no multi-unit topology (the common single-repo case). */
function soloCtx(): ContextMap {
  return ctx({
    structure: {
      top_level_layout: [{ name: "src", purpose: "source_code", file_count: 10 }],
      file_tree_summary: [{ path: "src/main.py", type: "file" }],
    },
  } as Partial<ContextMap>);
}

describe("detectTicketUnits", () => {
  it("derives units one level under monorepo roots, from paths the scan actually saw", () => {
    expect(detectTicketUnits(monorepoCtx())).toEqual([
      { slug: "apps_api", path: "apps/api" },
      { slug: "apps_web", path: "apps/web" },
      { slug: "packages_billing", path: "packages/billing" },
    ]);
  });

  it("ignores non-unit top-level dirs and bare files sitting in a root", () => {
    const units = detectTicketUnits(monorepoCtx()).map((u) => u.path);
    expect(units).not.toContain("docs/readme.md");
    // "apps/tsconfig.json" is depth-2 — a file, not a unit.
    expect(units).not.toContain("apps/tsconfig.json");
  });

  it("returns no units when the repo has no multi-unit topology", () => {
    expect(detectTicketUnits(soloCtx())).toEqual([]);
  });

  it("is deterministic — same input, byte-identical output", () => {
    expect(buildTicketSystemBlock(monorepoCtx())).toBe(buildTicketSystemBlock(monorepoCtx()));
  });
});

describe("buildBeginYaml — inter-repo ticket system", () => {
  it("emits valid YAML carrying the full ticket schema for a monorepo", () => {
    const doc = parseYaml(buildBeginYaml(monorepoCtx())) as Record<string, any>;
    const t = doc.project_begin.inter_repo_ticket_system;
    expect(t.topology).toBe("in_repo_units");
    expect(t.known_units).toEqual({
      apps_api: "apps/api",
      apps_web: "apps/web",
      packages_billing: "packages/billing",
    });
    // The mechanic only works if both directions exist and start empty.
    expect(t.inbox.tickets).toEqual([]);
    expect(t.outbox.tickets).toEqual([]);
    expect(Object.keys(t.ticket_schema.template)).toEqual([
      "id", "from_unit", "from_agent_session", "submitted", "status",
      "severity", "title", "request", "why", "acceptance_criteria", "pointer_back",
    ]);
  });

  it("still emits a usable protocol (valid YAML, live inbox) with no units detected", () => {
    const doc = parseYaml(buildBeginYaml(soloCtx())) as Record<string, any>;
    const t = doc.project_begin.inter_repo_ticket_system;
    expect(t.topology).toBe("single_unit");
    expect(t.inbox.tickets).toEqual([]);
    expect(t.ticket_schema.template).toBeDefined();
  });

  it("WIRES the inbox into the loop — an unread inbox makes the protocol inert", () => {
    const doc = parseYaml(buildBeginYaml(monorepoCtx())) as Record<string, any>;
    // Read on session start...
    expect(doc.project_begin.required_read_order.some((s: unknown) => String(s).includes("ticket_inbox"))).toBe(true);
    // ...and triaged after every completed candidate.
    expect(doc.project_begin.next_move_selection_algorithm.some((s: unknown) => String(s).includes("triage"))).toBe(true);
  });

  it("keeps the protocol key name stable across topologies (cross-implementation compatibility)", () => {
    // Two agents from unrelated codebases can only speak this protocol if they
    // look for the SAME key — the name must not vary with detected topology.
    for (const c of [monorepoCtx(), soloCtx()]) {
      expect(buildBeginYaml(c)).toContain("inter_repo_ticket_system:");
    }
  });
});
