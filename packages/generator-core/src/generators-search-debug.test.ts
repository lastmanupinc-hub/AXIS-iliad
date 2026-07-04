import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateArchitectureSummary, generateRepoRunStats, generateRepoProfileYAML } from "./generators-search.js";

// ─── DEBUG sweep (Program 1 = Search): 7 concrete bugs ──────────────────
// A deep-debug pass found repo-run-stats over-claiming fintech/agent-build
// readiness, counting tests/docs as MCP surface, substring-matching fintech
// keywords, an uncapped+duplicate model callout, a dotfile-as-extension bug,
// a stale output-dir exclusion, and a dead YAML block-scalar branch.

const f = (path: string, content = "export {};"): SourceFile => ({ path, content, size: content.length });

function mkCtx(o: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "acme", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 10, total_directories: 3, total_loc: 1000, file_tree_summary: [], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: ["vitest"], package_managers: ["pnpm"], ci_platform: "github_actions", deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [],
    routes: [],
    domain_models: [],
    sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.7 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...o,
  } as ContextMap;
}
const stats = (ctx: ContextMap, files: SourceFile[]) =>
  JSON.parse(generateRepoRunStats(ctx, {} as unknown as RepoProfile, files).content);

// ── Bug 1: fintech-MCP "ready" verdict requires fintech evidence + no gaps ──
describe("repo-run-stats readiness — no false 'ready_for_agent_build'", () => {
  it("a mature NON-fintech repo is not declared ready while next_steps list gaps", () => {
    // high generic score (routes, models, tests, CI) but no fintech signal, sql=0
    const ctx = mkCtx({
      routes: Array.from({ length: 12 }, (_, i) => ({ method: "GET", path: `/p${i}`, source_file: "apps/api/src/server.ts" })) as ContextMap["routes"],
      domain_models: [{ name: "User", kind: "interface", field_count: 3, source_file: "a.ts" }] as ContextMap["domain_models"],
    });
    const r = stats(ctx, [f("apps/api/src/server.ts")]);
    expect(r.fintech_mcp_readiness.status).not.toBe("ready_for_agent_build");
    expect(r.fintech_mcp_readiness.next_steps.length).toBeGreaterThan(0);
    expect(r.fintech_mcp_readiness.fintech_evidence).toBe(false);
  });
});

// ── Bug 2: MCP surface count excludes tests + docs ──
describe("repo-run-stats — mcp_surface_files counts real surface, not tests/docs", () => {
  it("ignores mcp-server.test.ts and mcp/ template docs, counts a real mcp-server.ts", () => {
    const r = stats(mkCtx(), [
      f("apps/api/src/mcp-server.ts"),
      f("apps/api/src/mcp-server.test.ts"),
      f("mcp/README.md", "# docs"),
      f("mcp/MEMORY.yaml", "x: 1"),
      f("mcp/project-setup.md", "# setup"),
    ]);
    expect(r.fintech_mcp_readiness.signals.mcp_surface_files).toBe(1);
  });
});

// ── Bug 3: fintech keywords match path SEGMENTS, not substrings ──
describe("repo-run-stats — fintech signal doesn't fire on substring accidents", () => {
  it("'scorecard' / 'cache' do not count as card/ach fintech signals", () => {
    const r = stats(mkCtx(), [f("docs/PRODUCT_SCORECARD.yaml", "x: 1"), f("src/cache.ts")]);
    expect(r.fintech_mcp_readiness.signals.fintech_signal_count).toBe(0);
  });
  it("a real payment-domain file DOES count", () => {
    const r = stats(mkCtx(), [f("src/payment.ts")]);
    expect(r.fintech_mcp_readiness.signals.fintech_signal_count).toBeGreaterThan(0);
  });
});

// ── Bug 4: high-complexity model callout deduped + capped ──
describe("architecture-summary — high-complexity models callout is deduped + capped", () => {
  it("lists each name once even if it appears from two source files", () => {
    const ctx = mkCtx({
      domain_models: [
        { name: "ContextMap", kind: "interface", field_count: 9, source_file: "a.ts" },
        { name: "ContextMap", kind: "interface", field_count: 9, source_file: "b.ts" },
      ] as ContextMap["domain_models"],
    });
    const out = generateArchitectureSummary(ctx).content;
    const callout = out.split("\n").find(l => l.includes("High-complexity models"))!;
    expect(callout.match(/ContextMap/g)?.length).toBe(1);
  });
});

// ── Bug 5: dotfiles have no "extension" ──
describe("repo-run-stats — getExtension treats a dotfile as [no_ext]", () => {
  it("classifies .gitignore as [no_ext], not '.gitignore'", () => {
    const r = stats(mkCtx(), [f(".gitignore", "node_modules")]);
    const exts = r.stats.top_extensions.map((e: { extension: string }) => e.extension);
    expect(exts).toContain("[no_ext]");
    expect(exts).not.toContain(".gitignore");
  });
});

// ── Bug 6: the current output dir (.ai/) is excluded from run stats ──
describe("repo-run-stats — a prior run's .ai/ output isn't counted", () => {
  it("excludes .ai/ files from source_files_analyzed", () => {
    const r = stats(mkCtx(), [f("src/real.ts"), f(".ai/debug-playbook.md", "# x"), f(".ai/repo-profile.yaml", "x: 1")]);
    expect(r.stats.source_files_analyzed).toBe(1);
  });
});

// ── Bug 7: multiline values render as block scalars ──
describe("repo-profile.yaml — multiline source_file_tree is a block scalar", () => {
  it("emits `key:` then `|` then the tree, no literal \\n escapes", () => {
    const profile = { schema_version: "1.0", project: { name: "x" }, detection: {}, structure: {}, health: {} } as unknown as RepoProfile;
    const out = generateRepoProfileYAML(profile, [f("src/index.ts"), f("src/util.ts")]).content;
    expect(out).toMatch(/source_file_tree:\n\s+\|\n/);
    const treeSection = out.slice(out.indexOf("source_file_tree:"));
    expect(treeSection).toContain("index.ts");
    expect(treeSection).not.toContain("\\n");
  });
});
