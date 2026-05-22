import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput, SourceFile } from "./types.js";
import { findFile, excerpt, findEntryPoints, renderExcerpts } from "./file-excerpt-utils.js";

/* ─── Fixture Helpers ──────────────────────────────────────────── */

function snap(opts: { name?: string; type?: string; files?: FileEntry[] } = {}): SnapshotRecord {
  const files = opts.files ?? [];
  return {
    snapshot_id: "snap-sf4-001",
    project_id: "proj-sf4-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "sf4-test",
      project_type: opts.type ?? "web_application",
      frameworks: ["next"],
      goals: [],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
    account_id: null,
  };
}

/** Minimal snapshot — no frameworks, no detection data. */
function snapMinimal(): SnapshotRecord {
  return {
    snapshot_id: "snap-min-001",
    project_id: "proj-min-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: "minimal-app",
      project_type: "web_application",
      frameworks: [],
      goals: [],
      requested_outputs: [],
    },
    file_count: 1,
    total_size_bytes: 20,
    files: [{ path: "index.ts", content: 'console.log("hello");', size: 20 }],
    status: "ready",
    account_id: null,
  };
}

function input(s: SnapshotRecord, requested: string[], sourceFiles?: SourceFile[]): GeneratorInput {
  return {
    context_map: buildContextMap(s),
    repo_profile: buildRepoProfile(s),
    requested_outputs: requested,
    source_files: sourceFiles,
  };
}

function getFile(result: ReturnType<typeof generateFiles>, path: string) {
  return result.files.find(f => f.path === path);
}

/* ─── Source File Fixtures ─────────────────────────────────────── */

const SNAPSHOT_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"test","dependencies":{"next":"14.0.0"}}', size: 50 },
  { path: "src/index.ts", content: 'export function main() {}', size: 25 },
];

const CONFIG_FILES: SourceFile[] = [
  { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
  { path: ".eslintrc.json", content: '{"extends":["next/core-web-vitals"]}', size: 36 },
  { path: "vitest.config.ts", content: 'import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { globals: true } });\n', size: 100 },
];

const ENTRY_POINTS: SourceFile[] = [
  {
    path: "src/index.ts",
    content: 'import { startServer } from "./server";\nexport function main() {\n  return startServer(3000);\n}\nexport const VERSION = "1.0.0";\n',
    size: 110,
  },
  {
    path: "src/server.ts",
    content: 'import express from "express";\nexport function startServer(port: number) {\n  const app = express();\n  return app.listen(port);\n}\n',
    size: 120,
  },
];

/* ─── FILE-EXCERPT-UTILS BRANCHES ──────────────────────────────── */

describe("file-excerpt-utils — uncovered branches", () => {
  // findFile: fallback to substring match (line ~28)
  it("findFile falls back to substring match when basename does not match", () => {
    const files: SourceFile[] = [
      { path: "src/configs/database.config.ts", content: "export default {}", size: 20 },
      { path: "src/utils/helpers.ts", content: "export function help() {}", size: 25 },
    ];
    // "database.config.ts" doesn't exist as basename but substring includes it
    const result = findFile(files, "database");
    expect(result).toBeDefined();
    expect(result!.path).toBe("src/configs/database.config.ts");
  });

  // excerpt: short file with no truncation (line ~38 ternary false branch)
  it("excerpt does not add truncation message for short files", () => {
    const shortFile: SourceFile = { path: "README.md", content: "# Hello\n\nWorld\n", size: 15 };
    const result = excerpt(shortFile, 10);
    expect(result).not.toContain("more lines");
    expect(result).toContain("# Hello");
  });

  // findEntryPoints: SvelteKit root files (line ~72)
  it("findEntryPoints includes SvelteKit root layout and page files", () => {
    const files: SourceFile[] = [
      { path: "src/routes/+layout.svelte", content: "<slot />", size: 8 },
      { path: "src/routes/+page.svelte", content: "<h1>Home</h1>", size: 13 },
      { path: "src/lib/utils.ts", content: "export function x() {}", size: 22 },
    ];
    const entries = findEntryPoints(files);
    expect(entries.length).toBe(2);
    const paths = entries.map(e => e.path);
    expect(paths).toContain("src/routes/+layout.svelte");
    expect(paths).toContain("src/routes/+page.svelte");
  });

  // renderExcerpts: budget overflow (line ~112-113)
  it("renderExcerpts stops and shows truncation when budget is exceeded", () => {
    const files: SourceFile[] = [];
    for (let i = 0; i < 20; i++) {
      files.push({
        path: `src/file${i}.ts`,
        content: "x".repeat(500) + "\n".repeat(50),
        size: 550,
      });
    }
    // Very small budget to force truncation after 1-2 files
    const result = renderExcerpts("Test Heading", files, 10, 200);
    const text = result.join("\n");
    expect(text).toContain("Test Heading");
    expect(text).toContain("more files omitted");
  });
});

/* ─── DEBUG — MINIMAL CONTEXT (false branches) ─────────────────── */

describe("debug generator — minimal context false branches", () => {
  // No description, no go_module, no languages, no frameworks, no key_abstractions, no hotspots, no domain_models
  it("debug-playbook skips optional sections when context is empty", () => {
    const s = snapMinimal();
    const inp = input(s, ["debug-playbook.md"]);
    // Ensure empty detection
    inp.context_map.detection.frameworks = [];
    inp.context_map.detection.languages = [];
    inp.context_map.detection.test_frameworks = [];
    inp.context_map.ai_context.key_abstractions = [];
    inp.context_map.dependency_graph.hotspots = [];
    inp.context_map.domain_models = [];
    const result = generateFiles(inp);
    const f = getFile(result, "debug-playbook.md");
    expect(f).toBeDefined();
    // Should NOT contain sections that require data
    expect(f!.content).not.toContain("## Language Distribution");
    expect(f!.content).not.toContain("## Detected Stack (with evidence)");
    expect(f!.content).not.toContain("## Project Structure");
    expect(f!.content).not.toContain("High-Risk Files");
    expect(f!.content).not.toContain("Domain Model Inventory");
    // Should still contain basic structure
    expect(f!.content).toContain("Debug Playbook");
    expect(f!.content).toContain("Triage Steps");
  });

  // Go project path (go_module set, no Node.js frameworks)
  it("debug-playbook uses go build/test commands when go_module is set", () => {
    const s = snapMinimal();
    const inp = input(s, ["debug-playbook.md"]);
    inp.context_map.project_identity.go_module = "github.com/org/service";
    inp.context_map.project_identity.primary_language = "Go";
    inp.context_map.detection.frameworks = [];
    const result = generateFiles(inp);
    const f = getFile(result, "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("go build ./...");
    expect(f!.content).toContain("go test ./...");
    expect(f!.content).toContain("Go Module");
  });

  // Go stdlib HTTP (go_module + no Go frameworks)
  it("debug-playbook includes Go stdlib HTTP section for Go without frameworks", () => {
    const s = snapMinimal();
    const inp = input(s, ["debug-playbook.md"]);
    inp.context_map.project_identity.go_module = "github.com/org/api";
    inp.context_map.project_identity.primary_language = "Go";
    inp.context_map.detection.frameworks = [];
    const result = generateFiles(inp);
    const f = getFile(result, "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Go stdlib HTTP");
    expect(f!.content).toContain("Handler panics");
  });

  // root-cause-checklist with go_module but no test frameworks (go test path)
  it("root-cause-checklist: go_module verification uses go test when no test frameworks", () => {
    const s = snapMinimal();
    const inp = input(s, ["root-cause-checklist.md"]);
    inp.context_map.project_identity.go_module = "github.com/org/svc";
    inp.context_map.detection.test_frameworks = [];
    const result = generateFiles(inp);
    const f = getFile(result, "root-cause-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("go test ./...");
  });

  // root-cause-checklist with no hotspots (empty hotspot table skip)
  it("root-cause-checklist shows no-hotspot message when hotspots empty", () => {
    const s = snapMinimal();
    const inp = input(s, ["root-cause-checklist.md"]);
    inp.context_map.dependency_graph.hotspots = [];
    const result = generateFiles(inp);
    const f = getFile(result, "root-cause-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("No high-coupling files detected");
  });

  // incident-template with no CI and no deployment (no extra rows)
  it("incident-template omits CI and deployment rows when not set", () => {
    const s = snapMinimal();
    const inp = input(s, ["incident-template.md"]);
    inp.context_map.detection.ci_platform = undefined as any;
    inp.context_map.detection.deployment_target = undefined as any;
    const result = generateFiles(inp);
    const f = getFile(result, "incident-template.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("| CI |");
    expect(f!.content).not.toContain("| Deployment |");
  });
});

/* ─── OPTIMIZATION — UNCOVERED BRANCHES ────────────────────────── */

describe("optimization generator — uncovered branches", () => {
  // optimization-rules: large project warning (>50000 LOC)
  it("optimization-rules shows large project warning for >50000 LOC", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["optimization-rules.md"]);
    inp.context_map.structure.total_loc = 75000;
    inp.context_map.structure.total_files = 500;
    const result = generateFiles(inp);
    const f = getFile(result, "optimization-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("exceeds most context windows");
  });

  // optimization-rules: medium project note (10000-50000 LOC)
  it("optimization-rules shows medium project note for 10000-50000 LOC", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["optimization-rules.md"]);
    inp.context_map.structure.total_loc = 25000;
    inp.context_map.structure.total_files = 200;
    const result = generateFiles(inp);
    const f = getFile(result, "optimization-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("fits in large context windows");
  });

  // optimization-rules: small project (< 10000 LOC)
  it("optimization-rules shows small project note for <10000 LOC", () => {
    const s = snapMinimal();
    const inp = input(s, ["optimization-rules.md"]);
    inp.context_map.structure.total_loc = 500;
    inp.context_map.structure.total_files = 10;
    const result = generateFiles(inp);
    const f = getFile(result, "optimization-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("comfortably fits in modern context windows");
  });

  // optimization-rules: no hotspots, no entry points, no conventions, no patterns, no warnings
  it("optimization-rules skips empty sections", () => {
    const s = snapMinimal();
    const inp = input(s, ["optimization-rules.md"]);
    inp.context_map.dependency_graph.hotspots = [];
    inp.context_map.entry_points = [];
    inp.context_map.ai_context.conventions = [];
    inp.context_map.architecture_signals.patterns_detected = [];
    inp.context_map.ai_context.warnings = [];
    const result = generateFiles(inp);
    const f = getFile(result, "optimization-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("### Dependency Hotspots");
    expect(f!.content).not.toContain("### Entry Points");
  });

  // optimization-rules: source file analysis with configs + hotspot files
  it("optimization-rules includes source file analysis with configs", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["optimization-rules.md"], [...CONFIG_FILES, ...ENTRY_POINTS]);
    inp.context_map.dependency_graph.hotspots = [
      { path: "src/index.ts", inbound_count: 10, outbound_count: 3, risk_score: 8.5 },
    ];
    const result = generateFiles(inp);
    const f = getFile(result, "optimization-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Configuration Files");
    expect(f!.content).toContain("File Tree");
    expect(f!.content).toContain("Hotspot File Excerpts");
  });

  // prompt-diff-report: source file analysis
  it("prompt-diff-report includes source file excerpts when files present", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["prompt-diff-report.md"], ENTRY_POINTS);
    const result = generateFiles(inp);
    const f = getFile(result, "prompt-diff-report.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("src/index.ts");
  });

  // cost-estimate: source file count/lines
  it("cost-estimate includes source_file_count and source_total_lines", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["cost-estimate.json"], ENTRY_POINTS);
    const result = generateFiles(inp);
    const f = getFile(result, "cost-estimate.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_file_count).toBe(2);
    expect(parsed.source_total_lines).toBeGreaterThan(0);
  });

  // token-budget-plan: source file analysis
  it("token-budget-plan includes source-verified token estimate", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["token-budget-plan.md"], ENTRY_POINTS);
    const result = generateFiles(inp);
    const f = getFile(result, "token-budget-plan.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Source-Verified Token Estimate");
    expect(f!.content).toContain("Source files scanned: 2");
  });
});

/* ─── SKILLS — UNCOVERED BRANCHES ──────────────────────────────── */

describe("skills generator — uncovered branches", () => {
  // AGENTS.md with minimal context (no description, no frameworks, no patterns, no conventions, no abstractions, no routes, non-TS/JS, no test_frameworks, no package_managers, no warnings, no layer_boundaries)
  it("AGENTS.md skips optional sections when context is empty", () => {
    const s = snapMinimal();
    const inp = input(s, ["AGENTS.md"]);
    inp.context_map.project_identity.primary_language = "Rust";
    inp.context_map.detection.frameworks = [];
    inp.context_map.architecture_signals.patterns_detected = [];
    inp.context_map.ai_context.conventions = [];
    inp.context_map.ai_context.key_abstractions = [];
    inp.context_map.ai_context.warnings = [];
    inp.context_map.routes = [];
    inp.context_map.detection.test_frameworks = [];
    inp.context_map.detection.package_managers = [];
    inp.context_map.architecture_signals.layer_boundaries = [];
    const result = generateFiles(inp);
    const f = getFile(result, "AGENTS.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("### Stack");
    expect(f!.content).not.toContain("### Architecture");
    expect(f!.content).not.toContain("### Conventions");
    expect(f!.content).not.toContain("### Key Directories");
    expect(f!.content).not.toContain("### Routes");
    expect(f!.content).not.toContain("## Known Issues");
    expect(f!.content).not.toContain("## Architecture Boundaries");
  });

  // AGENTS.md: Python project (line ~89)
  it("AGENTS.md includes Python-specific rules for Python projects", () => {
    const s = snapMinimal();
    const inp = input(s, ["AGENTS.md"]);
    inp.context_map.project_identity.primary_language = "Python";
    inp.context_map.detection.frameworks = [];
    const result = generateFiles(inp);
    const f = getFile(result, "AGENTS.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Python");
  });

  // AGENTS.md: source file entry points with exports
  it("AGENTS.md includes key entry points from source files", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["AGENTS.md"], ENTRY_POINTS);
    const result = generateFiles(inp);
    const f = getFile(result, "AGENTS.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Key Entry Points");
    expect(f!.content).toContain("src/index.ts");
  });

  // AGENTS.md: entry point with no exports (else branch line ~142)
  it("AGENTS.md shows entry point path only when no exports found", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const noExportFiles: SourceFile[] = [
      { path: "src/index.ts", content: "/* empty entry */\nconsole.log('hello');\n", size: 30 },
    ];
    const inp = input(s, ["AGENTS.md"], noExportFiles);
    const result = generateFiles(inp);
    const f = getFile(result, "AGENTS.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("src/index.ts");
  });

  // CLAUDE.md with minimal context
  it("CLAUDE.md skips optional sections when context is empty", () => {
    const s = snapMinimal();
    const inp = input(s, ["CLAUDE.md"]);
    inp.context_map.detection.frameworks = [];
    inp.context_map.architecture_signals.patterns_detected = [];
    inp.context_map.ai_context.conventions = [];
    inp.context_map.ai_context.key_abstractions = [];
    inp.context_map.ai_context.warnings = [];
    inp.context_map.routes = [];
    inp.context_map.detection.test_frameworks = [];
    inp.context_map.detection.package_managers = [];
    const result = generateFiles(inp);
    const f = getFile(result, "CLAUDE.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("minimal-app");
  });

  // .cursorrules with minimal context
  it(".cursorrules skips optional sections when context is empty", () => {
    const s = snapMinimal();
    const inp = input(s, [".cursorrules"]);
    inp.context_map.detection.frameworks = [];
    inp.context_map.architecture_signals.patterns_detected = [];
    inp.context_map.ai_context.conventions = [];
    inp.context_map.ai_context.key_abstractions = [];
    inp.context_map.ai_context.warnings = [];
    inp.context_map.routes = [];
    inp.context_map.detection.test_frameworks = [];
    inp.context_map.detection.build_tools = [];
    const result = generateFiles(inp);
    const f = getFile(result, ".cursorrules");
    expect(f).toBeDefined();
    expect(f!.content).toContain("minimal-app");
  });

  // workflow-pack: source file analysis (configs + entry points)
  it("workflow-pack includes detected config files and entry points", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["workflow-pack.md"], [...CONFIG_FILES, ...ENTRY_POINTS]);
    const result = generateFiles(inp);
    const f = getFile(result, "workflow-pack.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Detected Config Files");
    expect(f!.content).toContain("tsconfig.json");
    expect(f!.content).toContain("Entry Points");
  });

  // workflow-pack: no CI platform (skip CI steps)
  it("workflow-pack skips CI steps when no ci_platform", () => {
    const s = snapMinimal();
    const inp = input(s, ["workflow-pack.md"]);
    inp.context_map.detection.ci_platform = undefined as any;
    const result = generateFiles(inp);
    const f = getFile(result, "workflow-pack.md");
    expect(f).toBeDefined();
    // Should not include CI-specific workflow steps
    expect(f!.content).toContain("workflow");
  });

  // policy-pack: source file analysis (configs)
  it("policy-pack includes detected project configs from source files", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["policy-pack.md"], CONFIG_FILES);
    const result = generateFiles(inp);
    const f = getFile(result, "policy-pack.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Detected Project Configs");
    expect(f!.content).toContain("tsconfig.json");
  });

  // policy-pack: minimal context (no conventions, no warnings, no patterns)
  it("policy-pack skips optional sections when context is empty", () => {
    const s = snapMinimal();
    const inp = input(s, ["policy-pack.md"]);
    inp.context_map.ai_context.conventions = [];
    inp.context_map.ai_context.warnings = [];
    inp.context_map.architecture_signals.patterns_detected = [];
    inp.context_map.detection.test_frameworks = [];
    const result = generateFiles(inp);
    const f = getFile(result, "policy-pack.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("minimal-app");
  });
});

/* ─── OBSIDIAN — UNCOVERED BRANCHES ────────────────────────────── */

describe("obsidian generator — uncovered branches", () => {
  // obsidian-skill-pack: no project summary, no frameworks, no conventions
  it("obsidian-skill-pack skips optional sections when context is empty", () => {
    const s = snapMinimal();
    const inp = input(s, ["obsidian-skill-pack.md"]);
    inp.context_map.ai_context.project_summary = "";
    inp.context_map.detection.frameworks = [];
    inp.context_map.ai_context.conventions = [];
    const result = generateFiles(inp);
    const f = getFile(result, "obsidian-skill-pack.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("## Project Overview");
  });

  // vault-rules: no project summary, no frameworks
  it("vault-rules skips optional sections when context is empty", () => {
    const s = snapMinimal();
    const inp = input(s, ["vault-rules.md"]);
    inp.context_map.ai_context.project_summary = "";
    inp.context_map.detection.frameworks = [];
    const result = generateFiles(inp);
    const f = getFile(result, "vault-rules.md");
    expect(f).toBeDefined();
    // Should not have framework stack table
    expect(f!.content).toContain("minimal-app");
  });

  // vault-rules: source file analysis with markdown files
  it("vault-rules includes markdown documentation when md files present", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const mdFiles: SourceFile[] = [
      { path: "README.md", content: "# My App\n\nGreat project.\n", size: 25 },
      { path: "docs/guide.md", content: "# Guide\n\nGetting started.\n", size: 20 },
    ];
    const inp = input(s, ["vault-rules.md"], mdFiles);
    const result = generateFiles(inp);
    const f = getFile(result, "vault-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Existing Markdown Files");
  });

  // template-pack: source file summary with configs (line ~703-710)
  it("template-pack includes source file summary with config files", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["template-pack.md"], [...CONFIG_FILES, ...ENTRY_POINTS]);
    const result = generateFiles(inp);
    const f = getFile(result, "template-pack.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Source File Summary");
    expect(f!.content).toContain("Config files:");
  });

  // template-pack: source files but no config files (nested false branch)
  it("template-pack includes source file summary without config line when no configs", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const nonConfigFiles: SourceFile[] = [
      { path: "src/app.ts", content: "console.log('run');", size: 20 },
    ];
    const inp = input(s, ["template-pack.md"], nonConfigFiles);
    const result = generateFiles(inp);
    const f = getFile(result, "template-pack.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Source File Summary");
    expect(f!.content).not.toContain("Config files:");
  });
});
