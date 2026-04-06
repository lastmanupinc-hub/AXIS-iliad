import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import {
  generateDependencyHotspots,
  generateArchitectureSummary,
  generateRepoProfileYAML,
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
          { path: "src/index.ts", inbound_count: 12, outbound_count: 8, risk_score: 9.5 },
          { path: "src/utils.ts", inbound_count: 6, outbound_count: 4, risk_score: 5.0 },
          { path: "src/types.ts", inbound_count: 2, outbound_count: 1, risk_score: 2.0 },
        ],
      },
    });

    const result = generateDependencyHotspots(ctx);
    expect(result.path).toBe("dependency-hotspots.md");
    expect(result.content_type).toBe("text/markdown");

    // Risk summary table
    expect(result.content).toContain("High (>7) | 1");
    expect(result.content).toContain("Medium (4–7) | 1");
    expect(result.content).toContain("Low (≤4) | 1");
    expect(result.content).toContain("**Total** | **3**");

    // Hotspot files sorted by risk (descending)
    expect(result.content).toContain("🔴 9.5");
    expect(result.content).toContain("🟡 5.0");
    expect(result.content).toContain("🟢 2.0");

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

    // Recommendations
    expect(result.content).toContain("Extract interfaces");
    expect(result.content).toContain("facade pattern");
    expect(result.content).toContain("Monitor medium-risk files");
    expect(result.content).toContain("Review circular dependencies");
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
          { path: "src/foo.ts", inbound_count: 3, outbound_count: 3, risk_score: 5.5 },
        ],
      },
    });

    const result = generateDependencyHotspots(ctx);
    expect(result.content).toContain("High (>7) | 0");
    expect(result.content).toContain("Medium (4–7) | 1");
    // Recommendations: no high-risk items, so medium starts at "1."
    expect(result.content).toContain("1. **Monitor medium-risk files**");
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
          { path: "src/core.ts", inbound_count: 5, outbound_count: 3, risk_score: 6.2 },
        ],
      } as ContextMap["dependency_graph"],
    });

    const result = generateArchitectureSummary(ctx);
    expect(result.content).toContain("## Dependency Hotspots");
    expect(result.content).toContain("src/core.ts");
    expect(result.content).toContain("620%"); // risk_score * 100 → .toFixed(0)
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
    expect(result.path).toBe(".ai/repo-profile.yaml");
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
    } as Partial<RepoProfile>);
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
