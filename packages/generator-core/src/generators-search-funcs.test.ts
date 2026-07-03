import { describe, it, expect } from "vitest";
// Test-only YAML parser for round-trip fidelity assertions (hoisted transitive
// dep of the toolchain — NOT a runtime dependency of generator-core).
import { parse as parseYAML } from "yaml";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import {
  generateDependencyHotspots,
  generateArchitectureSummary,
  generateRepoProfileYAML,
  generateRepoRunStats,
} from "./generators-search.js";

// ─── Shared fixtures ──────────────────────────────────────────

function makeContextMap(overrides: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0",
    snapshot_id: "snap_search",
    project_id: "proj_search",
    generated_at: new Date().toISOString(),
    project_identity: { name: "search-test", type: "library", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 10, total_directories: 3, total_loc: 500, file_tree_summary: [], top_level_layout: [{ name: "src", purpose: "source code", file_count: 8 }] },
    detection: { languages: { TypeScript: { files: 10, bytes: 5000, percentage: 100 } }, frameworks: [{ name: "vitest", confidence: 0.95 }], build_tools: ["tsc"], test_frameworks: ["vitest"], package_managers: ["pnpm"], ci_platform: "github-actions", deployment_target: "vercel" },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [],
    routes: [],
    domain_models: [],
    sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0 },
    ai_context: { project_summary: "test project", key_abstractions: [], conventions: [], warnings: [] },
    ...overrides,
  } as ContextMap;
}

function makeProfile(overrides: Partial<RepoProfile> = {}): RepoProfile {
  return {
    version: "1.0.0",
    snapshot_id: "snap_search",
    project_id: "proj_search",
    generated_at: new Date().toISOString(),
    project: { name: "search-test", type: "library", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    detection: { languages: { TypeScript: { files: 10, bytes: 5000, percentage: 100 } }, frameworks: [{ name: "vitest", confidence: 0.95 }], build_tools: ["tsc"], test_frameworks: ["vitest"], package_managers: ["pnpm"], ci_platform: "github-actions", deployment_target: "vercel" },
    structure_summary: { total_files: 10, total_directories: 3, total_loc: 500, top_level_dirs: [{ name: "src", purpose: "source code", file_count: 8 }] },
    health: { has_readme: true, has_tests: true, test_file_count: 5, has_ci: true, has_lockfile: true, has_typescript: true, has_linter: false, has_formatter: false, dependency_count: 3, dev_dependency_count: 2, architecture_patterns: ["layered"], separation_score: 7 },
    goals: null,
    ...overrides,
  } as RepoProfile;
}

// ─── generateDependencyHotspots ─────────────────────────────────

describe("generateDependencyHotspots", () => {
  it("handles hotspots across all risk tiers", () => {
    const ctx = makeContextMap({
      dependency_graph: {
        external_dependencies: [
          { name: "express", version: "4.18.2", type: "production" },
          { name: "typescript", version: "5.0.0", type: "development" },
          { name: "beta-lib", version: "^0.3.1", type: "production" },
        ] as never,
        internal_imports: [],
        hotspots: [
          // Engine-realistic 0–1 scores (engine.ts: min(total_connections/20, 1)).
          { path: "src/index.ts", inbound_count: 12, outbound_count: 8, risk_score: 0.95 },
          { path: "src/utils.ts", inbound_count: 6, outbound_count: 4, risk_score: 0.5 },
          { path: "src/types.ts", inbound_count: 2, outbound_count: 1, risk_score: 0.2 },
        ],
      },
    });

    const result = generateDependencyHotspots(ctx);
    expect(result.path).toBe("dependency-hotspots.md");
    expect(result.content_type).toBe("text/markdown");

    // Risk summary table
    expect(result.content).toContain("High (>70%) | 1");
    expect(result.content).toContain("Medium (40–70%) | 1");
    expect(result.content).toContain("Low (≤40%) | 1");
    expect(result.content).toContain("**Total** | **3**");

    // Hotspot files sorted by risk (descending), rendered as percentages
    expect(result.content).toContain("🔴 95%");
    expect(result.content).toContain("🟡 50%");
    expect(result.content).toContain("🟢 20%");

    // Coupling analysis (top 5)
    expect(result.content).toContain("### `src/index.ts`");
    expect(result.content).toContain("12 files depend on this");
    expect(result.content).toContain("HIGH — extract interface");

    expect(result.content).toContain("### `src/utils.ts`");
    expect(result.content).toContain("MEDIUM — monitor for growth");

    expect(result.content).toContain("### `src/types.ts`");
    expect(result.content).toContain("LOW — acceptable coupling");

    // External dependency risk
    expect(result.content).toContain("| express | 4.18.2 | Stable |");
    expect(result.content).toContain("| beta-lib | ^0.3.1 | Pre-1.0 — unstable API |");

    // Recommendations — counter-based numbering, no gaps (1..4 with all tiers present)
    expect(result.content).toContain("1. **Extract interfaces**");
    expect(result.content).toContain("2. **Introduce facade pattern**");
    expect(result.content).toContain("3. **Monitor medium-risk files**");
    expect(result.content).toContain("4. **Review circular dependencies**");
  });

  it("handles empty hotspots gracefully", () => {
    const ctx = makeContextMap({
      dependency_graph: {
        external_dependencies: [] as never,
        internal_imports: [],
        hotspots: [],
      },
    });

    const result = generateDependencyHotspots(ctx);
    expect(result.content).toContain("No hotspots detected");
    expect(result.content).toContain("No external dependencies detected.");
    expect(result.content).toContain("Review circular dependencies");
  });

  it("handles only medium-risk hotspots (no high)", () => {
    const ctx = makeContextMap({
      dependency_graph: {
        external_dependencies: [] as never,
        internal_imports: [],
        hotspots: [
          { path: "src/foo.ts", inbound_count: 3, outbound_count: 3, risk_score: 0.55 },
        ],
      },
    });

    const result = generateDependencyHotspots(ctx);
    expect(result.content).toContain("High (>70%) | 0");
    expect(result.content).toContain("Medium (40–70%) | 1");
    // Recommendations: no high-risk items, so medium starts at "1." and the
    // always-present circular-deps item follows with no numbering gap.
    expect(result.content).toContain("1. **Monitor medium-risk files**");
    expect(result.content).toContain("2. **Review circular dependencies**");
  });
});

// ─── generateArchitectureSummary — dependency hotspots section ──

describe("generateArchitectureSummary — hotspots section", () => {
  it("includes hotspot table when hotspots exist", () => {
    const ctx = makeContextMap({
      dependency_graph: {
        external_dependencies: [],
        internal_imports: [],
        hotspots: [
          { path: "src/core.ts", inbound_count: 5, outbound_count: 3, risk_score: 0.62 },
        ],
      } as ContextMap["dependency_graph"],
    });

    const result = generateArchitectureSummary(ctx);
    expect(result.content).toContain("## Dependency Hotspots");
    expect(result.content).toContain("src/core.ts");
    expect(result.content).toContain("62%"); // 0–1 risk_score * 100 → .toFixed(0)
  });
});

// ─── generateRepoProfileYAML — toYAML multiline paths ──────────

describe("generateRepoProfileYAML — toYAML edge cases", () => {
  it("handles quoted strings with special chars in profile", () => {
    const profile = makeProfile({
      goals: {
        objectives: ["Build a web app"],
        requested_outputs: ["search"],
      },
    });

    const result = generateRepoProfileYAML(profile);
    expect(result.path).toBe("repo-profile.yaml");
    expect(result.content_type).toBe("application/yaml");
    expect(result.content).toContain("Build a web app");
    expect(result.content).toContain("objectives:");
  });

  it("handles strings with colon-space (requires quoting or literal)", () => {
    const profile = makeProfile({
      goals: {
        objectives: ["key: value pair"],
        requested_outputs: ["search"],
      },
    });

    const result = generateRepoProfileYAML(profile);
    expect(result.content).toContain("key: value pair");
  });

  it("handles strings starting with hash (comment-like)", () => {
    const profile = makeProfile({
      goals: {
        objectives: ["#hashtag comment"],
        requested_outputs: ["search"],
      },
    });

    const result = generateRepoProfileYAML(profile);
    expect(result.content).toContain("#hashtag comment");
  });

  it("handles null values in profile", () => {
    const profile = makeProfile();
    // goals is already null in default
    const result = generateRepoProfileYAML(profile);
    expect(result.content).toContain("null");
  });

  it("handles boolean and numeric values", () => {
    const profile = makeProfile();
    const result = generateRepoProfileYAML(profile);
    // health has booleans
    expect(result.content).toContain("true");
    expect(result.content).toContain("false");
    // structure_summary has numbers
    expect(result.content).toContain("total_files: 10");
  });

  it("handles empty arrays and objects", () => {
    const profile = makeProfile({
      health: {
        has_readme: true, has_tests: false, test_file_count: 0, has_ci: false, has_lockfile: false,
        has_typescript: false, has_linter: false, has_formatter: false,
        dependency_count: 0, dev_dependency_count: 0,
        architecture_patterns: [],
        separation_score: 0,
      },
    });

    const result = generateRepoProfileYAML(profile);
    expect(result.content).toContain("[]");
  });

  // Layer 12: YAML array-of-objects serialization (generators-search.ts lines 173-176)
  it("serializes arrays of objects with nested keys", () => {
    const profile = makeProfile({
      detection: {
        languages: { TypeScript: { files: 10, bytes: 5000, percentage: 100 }, Python: { files: 3, bytes: 2000, percentage: 30 } },
        frameworks: [
          { name: "express", confidence: 0.9 },
          { name: "vitest", confidence: 0.8 },
        ],
        build_tools: ["tsc", "esbuild"],
        test_frameworks: ["vitest"],
        package_managers: ["pnpm"],
        ci_platform: "github-actions",
        deployment_target: "vercel",
      },
    } as unknown as Partial<RepoProfile>);
    const result = generateRepoProfileYAML(profile);
    // Array-of-objects should serialize with "- name:" YAML syntax
    expect(result.content).toContain("- name: express");
    expect(result.content).toContain("confidence:");
  });

  // Layer 12: YAML nested object recursion (generators-search.ts line 206)
  it("serializes deeply nested objects", () => {
    const profile = makeProfile({
      structure_summary: {
        total_files: 50,
        total_directories: 10,
        total_loc: 5000,
        top_level_dirs: [
          { name: "src", purpose: "source code", file_count: 30 },
          { name: "tests", purpose: "test suite", file_count: 20 },
        ],
      },
    } as Partial<RepoProfile>);
    const result = generateRepoProfileYAML(profile);
    expect(result.content).toContain("- name: src");
    expect(result.content).toContain("purpose:");
    expect(result.content).toContain("file_count: 30");
  });

  // Layer 12: YAML multiline string (generators-search.ts line 172-173)
  it("serializes strings containing newlines as block scalars", () => {
    const profile = makeProfile({
      goals: {
        objectives: ["first line\nsecond line"],
        requested_outputs: ["search"],
      },
    } as Partial<RepoProfile>);
    const result = generateRepoProfileYAML(profile);
    // Multiline strings should be present in the output
    expect(result.content).toContain("first line");
    expect(result.content).toContain("second line");
  });
});

// ─── HARDEN pass 1 (Program 1): hostile inputs, YAML fidelity, determinism ──

describe("harden: markdown injection resistance (SPEC-10 class)", () => {
  it("a newline-bearing project name cannot inject a heading into architecture-summary.md", () => {
    const ctx = makeContextMap({
      project_identity: { name: "MyApp\n\n# Injected Heading", type: "library", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    } as Partial<ContextMap>);
    const result = generateArchitectureSummary(ctx);
    const lines = result.content.split("\n");
    expect(lines[0]).toBe("# Architecture Summary: MyApp # Injected Heading");
    expect(lines.some((l) => l === "# Injected Heading")).toBe(false);
  });

  it("pipes in route fields cannot split architecture-summary.md table rows", () => {
    const ctx = makeContextMap({
      routes: [{ path: "/x|y", method: "GET", source_file: "src/evil|file.ts" }],
    } as Partial<ContextMap>);
    const result = generateArchitectureSummary(ctx);
    const row = result.content.split("\n").find((l) => l.includes("evil"))!;
    expect(row).toBeDefined();
    // \| is a literal cell character in GFM, not a delimiter — collapse before counting.
    const cellCount = row.replace(/\\\|/g, "PIPE").split("|").length - 2;
    expect(cellCount).toBe(3); // Method | Path | Source
    expect(row).toContain("\\|");
  });

  it("pipes and newlines in hotspot paths cannot break dependency-hotspots.md structure", () => {
    const ctx = makeContextMap({
      dependency_graph: {
        external_dependencies: [{ name: "evil|pkg", version: "1.0.0\n# fake", type: "production" }] as never,
        internal_imports: [],
        hotspots: [{ path: "src/a|b`.ts\nfake-line", inbound_count: 10, outbound_count: 8, risk_score: 0.9 }],
      },
    });
    const result = generateDependencyHotspots(ctx);
    const lines = result.content.split("\n");
    expect(lines.some((l) => l === "fake-line")).toBe(false);
    expect(lines.some((l) => l === "# fake")).toBe(false);
    const hotspotRow = lines.find((l) => l.includes("a\\|b"))!;
    expect(hotspotRow).toBeDefined();
    const cellCount = hotspotRow.replace(/\\\|/g, "PIPE").split("|").length - 2;
    expect(cellCount).toBe(5); // File | Risk | Inbound | Outbound | Total Connections
  });

  it("markdown-bearing warnings and conventions render as single collapsed list items", () => {
    const ctx = makeContextMap({
      ai_context: {
        project_summary: "test",
        key_abstractions: [],
        conventions: ["conv\n## Fake Section"],
        warnings: ["warn\n- fake bullet"],
      },
    } as Partial<ContextMap>);
    const result = generateArchitectureSummary(ctx);
    const lines = result.content.split("\n");
    expect(lines.some((l) => l === "## Fake Section")).toBe(false);
    expect(lines.some((l) => l === "- fake bullet")).toBe(false);
    expect(result.content).toContain("- conv ## Fake Section");
    expect(result.content).toContain("- ⚠️ warn - fake bullet");
  });
});

describe("harden: repo-profile.yaml fidelity (parse round-trip)", () => {
  it("backslash-bearing strings (Windows paths) produce VALID YAML that round-trips exactly", () => {
    const profile = makeProfile({
      goals: {
        objectives: ["C:\\Users\\x paths", "trailing backslash\\"],
        requested_outputs: ["search"],
      },
    } as Partial<RepoProfile>);
    const result = generateRepoProfileYAML(profile);
    const parsed = parseYAML(result.content) as { goals: { objectives: string[] } };
    expect(parsed.goals.objectives[0]).toBe("C:\\Users\\x paths");
    expect(parsed.goals.objectives[1]).toBe("trailing backslash\\");
  });

  it("a key-injection attempt stays a single string value after parsing", () => {
    const profile = makeProfile({
      goals: {
        objectives: ['innocent" \ninjected_key: "true'],
        requested_outputs: ["search"],
      },
    } as Partial<RepoProfile>);
    const result = generateRepoProfileYAML(profile);
    const parsed = parseYAML(result.content) as Record<string, unknown> & { goals: { objectives: string[] } };
    expect(parsed.injected_key).toBeUndefined();
    expect(parsed.goals.objectives[0]).toBe('innocent" \ninjected_key: "true');
  });

  it("the multiline source_file_tree round-trips (was malformed YAML on every run with files)", () => {
    const profile = makeProfile();
    const files = [
      { path: "src/index.ts", content: "export {};", size: 10 },
      { path: "src/util.ts", content: "export {};", size: 10 },
    ];
    const result = generateRepoProfileYAML(profile, files);
    const parsed = parseYAML(result.content) as { source_file_tree: string; source_file_count: number };
    expect(parsed.source_file_count).toBe(2);
    expect(typeof parsed.source_file_tree).toBe("string");
    expect(parsed.source_file_tree).toContain("index.ts");
    expect(parsed.source_file_tree).toContain("\n"); // genuinely multiline — escaped, not broken
  });

  it("ambiguous scalars (null/true/numeric-looking strings) stay STRINGS on round-trip", () => {
    const profile = makeProfile({
      goals: {
        objectives: ["null", "true", "1.0", "42"],
        requested_outputs: ["search"],
      },
    } as Partial<RepoProfile>);
    const result = generateRepoProfileYAML(profile);
    const parsed = parseYAML(result.content) as { goals: { objectives: unknown[] } };
    expect(parsed.goals.objectives).toEqual(["null", "true", "1.0", "42"]);
  });

  it("an empty object inside an array serializes as {} instead of crashing", () => {
    const profile = makeProfile({
      structure_summary: {
        total_files: 1,
        total_directories: 1,
        total_loc: 1,
        top_level_dirs: [{} as never],
      },
    } as Partial<RepoProfile>);
    const result = generateRepoProfileYAML(profile);
    expect(result.content).toContain("- {}");
    expect(() => parseYAML(result.content)).not.toThrow();
  });
});

describe("harden: external dependency version-risk classification", () => {
  function depsCtx(deps: Array<{ name: string; version: string }>): ContextMap {
    return makeContextMap({
      dependency_graph: {
        external_dependencies: deps.map((d) => ({ ...d, type: "production" })) as never,
        internal_imports: [],
        hotspots: [],
      },
    });
  }

  it("classifies pre-1.0 versions correctly even with multi-digit minors (the '0.21.5' bug)", () => {
    const result = generateDependencyHotspots(depsCtx([
      { name: "multi-minor", version: "0.21.5" },
      { name: "range-pre", version: ">=0.5.0" },
      { name: "caret-pre", version: "^0.3.1" },
    ]));
    const rows = result.content.split("\n").filter((l) => l.includes("Pre-1.0"));
    expect(rows).toHaveLength(3);
  });

  it("classifies stable versions correctly", () => {
    const result = generateDependencyHotspots(depsCtx([
      { name: "plain", version: "1.2.3" },
      { name: "caret", version: "^4.18.2" },
      { name: "range", version: ">=2.0.0" },
    ]));
    const table = result.content.split("## External Dependency Risk")[1];
    expect((table.match(/\| Stable \|/g) ?? []).length).toBe(3);
    expect(table).not.toContain("Pre-1.0");
  });

  it("non-numeric versions (workspace ranges) fall back to Stable without NaN leaking into output", () => {
    const result = generateDependencyHotspots(depsCtx([{ name: "ws-dep", version: "workspace:x" }]));
    expect(result.content).toContain("| Stable |");
    expect(result.content).not.toContain("NaN");
  });
});

describe("harden: determinism regression (clean inputs byte-identical)", () => {
  it("all four search artifacts are byte-identical across repeated calls", () => {
    const ctx = makeContextMap({ generated_at: "2026-01-02T03:04:05.000Z" } as Partial<ContextMap>);
    const profile = makeProfile({ generated_at: "2026-01-02T03:04:05.000Z" } as Partial<RepoProfile>);
    const files = [{ path: "src/index.ts", content: "export {};", size: 10 }];
    expect(generateArchitectureSummary(ctx, files).content).toBe(generateArchitectureSummary(ctx, files).content);
    expect(generateDependencyHotspots(ctx, files).content).toBe(generateDependencyHotspots(ctx, files).content);
    expect(generateRepoProfileYAML(profile, files).content).toBe(generateRepoProfileYAML(profile, files).content);
    expect(generateRepoRunStats(ctx, profile, files).content).toBe(generateRepoRunStats(ctx, profile, files).content);
  });
});
