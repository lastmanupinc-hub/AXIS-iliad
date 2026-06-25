import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ContextMap } from "@axis/context-engine";

// Mock the in-process LLM so the judge is testable with no model / no GGUF.
vi.mock("./llm-inference.js", () => ({
  isLlmConfigured: vi.fn(),
  runCompletion: vi.fn(),
}));

import { llmDesignVerdict, DESIGN_JUDGE_SCHEMA } from "./design-judge.js";
import { isLlmConfigured, runCompletion } from "./llm-inference.js";

const mockConfigured = vi.mocked(isLlmConfigured);
const mockRun = vi.mocked(runCompletion);

function mkCtx(o: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0",
    snapshot_id: "s",
    project_id: "p",
    generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "acme-shop", type: "monorepo", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 50, total_directories: 10, total_loc: 5000, file_tree_summary: [], top_level_layout: [] },
    detection: { languages: ["TypeScript"], frameworks: [{ name: "React", version: "19.0.0" }], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: "docker" },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [],
    routes: [{ path: "/checkout", method: "POST", source_file: "api/checkout.ts" }],
    domain_models: [{ name: "OrderInvoice", kind: "interface", language: "TypeScript", field_count: 5, source_file: "models/order.ts" }],
    sql_schema: [],
    architecture_signals: { patterns_detected: ["monorepo"], layer_boundaries: [], separation_score: 0.7 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...o,
  } as ContextMap;
}
const files = [{ path: "CLAUDE.md", content: "x".repeat(300) }];
// runCompletion returns one of two envelope shapes; cast keeps the tests focused.
const reply = (o: unknown) => o as Awaited<ReturnType<typeof runCompletion>>;

describe("llmDesignVerdict — AI design judge (A3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null without a configured model and never calls the LLM", async () => {
    mockConfigured.mockResolvedValue(false);
    expect(await llmDesignVerdict(mkCtx(), files)).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("returns null when inference reports _not_configured", async () => {
    mockConfigured.mockResolvedValue(true);
    mockRun.mockResolvedValue(reply({ _not_configured: true }));
    expect(await llmDesignVerdict(mkCtx(), files)).toBeNull();
  });

  it("parses a valid in-range verdict and rounds design_score", async () => {
    mockConfigured.mockResolvedValue(true);
    mockRun.mockResolvedValue(
      reply({ text: JSON.stringify({ design_score: 70.6, tailored: true, rationale: "repo-specific insight", top_improvement: "tighten X" }) }),
    );
    expect(await llmDesignVerdict(mkCtx(), files)).toEqual({
      design_score: 71,
      tailored: true,
      rationale: "repo-specific insight",
      top_improvement: "tighten X",
    });
  });

  it("rejects an out-of-range design_score via the constrained schema (returns null, not a clamp)", async () => {
    mockConfigured.mockResolvedValue(true);
    mockRun.mockResolvedValue(reply({ text: JSON.stringify({ design_score: 150, tailored: true, rationale: "r" }) }));
    expect(await llmDesignVerdict(mkCtx(), files)).toBeNull();
  });

  it("returns null (no fabrication) on unparseable or schema-invalid model output", async () => {
    mockConfigured.mockResolvedValue(true);
    mockRun.mockResolvedValue(reply({ text: "not json at all" }));
    expect(await llmDesignVerdict(mkCtx(), files)).toBeNull();

    // Missing required tailored/rationale → schema-invalid → null.
    mockRun.mockResolvedValue(reply({ text: JSON.stringify({ design_score: 50 }) }));
    expect(await llmDesignVerdict(mkCtx(), files)).toBeNull();
  });

  it("grounds the prompt in the repo's real facts and uses constrained, reproducible decoding", async () => {
    mockConfigured.mockResolvedValue(true);
    mockRun.mockResolvedValue(reply({ text: JSON.stringify({ design_score: 70, tailored: true, rationale: "r" }) }));
    await llmDesignVerdict(mkCtx(), files);

    const arg = mockRun.mock.calls[0]?.[0];
    expect(arg?.prompt).toContain("OrderInvoice"); // domain model
    expect(arg?.prompt).toContain("POST /checkout"); // route
    expect(arg?.prompt).toContain("React"); // framework
    expect(arg?.json_schema).toBe(DESIGN_JUDGE_SCHEMA); // grammar-constrained to the verdict shape
    expect(arg?.temperature).toBe(0); // deterministic
  });

  it("omits top_improvement when the model gives none, and preserves tailored=false", async () => {
    mockConfigured.mockResolvedValue(true);
    mockRun.mockResolvedValue(reply({ text: JSON.stringify({ design_score: 40, tailored: false, rationale: "mechanically template-filled" }) }));
    const v = await llmDesignVerdict(mkCtx(), files);
    expect(v?.tailored).toBe(false);
    expect(v?.top_improvement).toBeUndefined();
  });
});
