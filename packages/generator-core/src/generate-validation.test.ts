import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratorInput } from "./types.js";

// ─── Shared fixtures ──────────────────────────────────────────
function makeContextMap(overrides: Partial<ContextMap> = {}): ContextMap {
  return {
    snapshot_id: "snap_val",
    project_id: "proj_val",
    primary_language: "TypeScript",
    frameworks: ["vitest"],
    architecture: { style: "monorepo", patterns: [], entry_points: [], layers: [] },
    structure: { total_files: 1, total_dirs: 1, top_level: ["src/"] },
    dependencies: { direct: {}, dev: {} },
    ai_context: { summary: "test", conventions: [], key_abstractions: [], warnings: [] },
    health_indicators: { has_readme: true, has_tests: true, has_ci: true, has_lockfile: true, has_typescript: true, has_linter: false, has_formatter: false },
    ...overrides,
  };
}

function makeProfile(overrides: Partial<RepoProfile> = {}): RepoProfile {
  return {
    name: "val-test",
    primary_language: "TypeScript",
    frameworks: ["vitest"],
    build_tools: [],
    test_frameworks: ["vitest"],
    package_managers: ["pnpm"],
    ci_platforms: [],
    deployment: null,
    monorepo: false,
    total_files: 1,
    total_dirs: 1,
    languages: { TypeScript: 100 },
    dependency_count: 1,
    ...overrides,
  };
}

function makeInput(requested: string[] = []): GeneratorInput {
  return {
    context_map: makeContextMap(),
    repo_profile: makeProfile(),
    requested_outputs: requested,
  };
}

// ─── validateGeneratedFile branches (tested through generateFiles) ──
describe("generateFiles validation branches", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("skips generator that returns non-object (null)", async () => {
    // Mock a generator to return null
    vi.doMock("./generators-search.js", async (importOriginal) => {
      const orig = await importOriginal<typeof import("./generators-search.js")>();
      return { ...orig, generateContextMapJSON: () => null as any };
    });
    const { generateFiles } = await import("./generate.js");
    const result = generateFiles(makeInput([]));
    const skip = result.skipped.find(s => s.path === ".ai/context-map.json");
    expect(skip).toBeDefined();
    expect(skip!.reason).toBe("Generator returned non-object");
  });

  it("skips generator that returns empty path", async () => {
    vi.doMock("./generators-search.js", async (importOriginal) => {
      const orig = await importOriginal<typeof import("./generators-search.js")>();
      return {
        ...orig,
        generateContextMapJSON: () => ({
          path: "",
          content: "data",
          content_type: "application/json",
          program: "search",
          description: "desc",
        }),
      };
    });
    const { generateFiles } = await import("./generate.js");
    const result = generateFiles(makeInput([]));
    const skip = result.skipped.find(s => s.path === ".ai/context-map.json");
    expect(skip).toBeDefined();
    expect(skip!.reason).toBe("Missing or empty 'path'");
  });

  it("skips generator that returns empty content", async () => {
    vi.doMock("./generators-search.js", async (importOriginal) => {
      const orig = await importOriginal<typeof import("./generators-search.js")>();
      return {
        ...orig,
        generateContextMapJSON: () => ({
          path: ".ai/context-map.json",
          content: "",
          content_type: "application/json",
          program: "search",
          description: "desc",
        }),
      };
    });
    const { generateFiles } = await import("./generate.js");
    const result = generateFiles(makeInput([]));
    const skip = result.skipped.find(s => s.path === ".ai/context-map.json");
    expect(skip).toBeDefined();
    expect(skip!.reason).toBe("Empty content for .ai/context-map.json");
  });

  it("skips generator that returns missing content_type", async () => {
    vi.doMock("./generators-search.js", async (importOriginal) => {
      const orig = await importOriginal<typeof import("./generators-search.js")>();
      return {
        ...orig,
        generateContextMapJSON: () => ({
          path: ".ai/context-map.json",
          content: "data",
          content_type: "",
          program: "search",
          description: "desc",
        }),
      };
    });
    const { generateFiles } = await import("./generate.js");
    const result = generateFiles(makeInput([]));
    const skip = result.skipped.find(s => s.path === ".ai/context-map.json");
    expect(skip).toBeDefined();
    expect(skip!.reason).toBe("Missing 'content_type'");
  });

  it("skips generator that returns missing program", async () => {
    vi.doMock("./generators-search.js", async (importOriginal) => {
      const orig = await importOriginal<typeof import("./generators-search.js")>();
      return {
        ...orig,
        generateContextMapJSON: () => ({
          path: ".ai/context-map.json",
          content: "data",
          content_type: "application/json",
          program: "",
          description: "desc",
        }),
      };
    });
    const { generateFiles } = await import("./generate.js");
    const result = generateFiles(makeInput([]));
    const skip = result.skipped.find(s => s.path === ".ai/context-map.json");
    expect(skip).toBeDefined();
    expect(skip!.reason).toBe("Missing 'program'");
  });

  it("skips generator that returns missing description", async () => {
    vi.doMock("./generators-search.js", async (importOriginal) => {
      const orig = await importOriginal<typeof import("./generators-search.js")>();
      return {
        ...orig,
        generateContextMapJSON: () => ({
          path: ".ai/context-map.json",
          content: "data",
          content_type: "application/json",
          program: "search",
          description: "",
        }),
      };
    });
    const { generateFiles } = await import("./generate.js");
    const result = generateFiles(makeInput([]));
    const skip = result.skipped.find(s => s.path === ".ai/context-map.json");
    expect(skip).toBeDefined();
    expect(skip!.reason).toBe("Missing 'description'");
  });
});

// ─── generateFiles error handling branches ────────────────────
describe("generateFiles error handling", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("catches Error instance and uses err.message", async () => {
    vi.doMock("./generators-search.js", async (importOriginal) => {
      const orig = await importOriginal<typeof import("./generators-search.js")>();
      return {
        ...orig,
        generateContextMapJSON: () => { throw new Error("parse explosion"); },
      };
    });
    const { generateFiles } = await import("./generate.js");
    const result = generateFiles(makeInput([]));
    const skip = result.skipped.find(s => s.path === ".ai/context-map.json");
    expect(skip).toBeDefined();
    expect(skip!.reason).toBe("Generator error: parse explosion");
  });

  it("catches non-Error throw and uses String()", async () => {
    vi.doMock("./generators-search.js", async (importOriginal) => {
      const orig = await importOriginal<typeof import("./generators-search.js")>();
      return {
        ...orig,
        generateContextMapJSON: () => { throw "string error"; },
      };
    });
    const { generateFiles } = await import("./generate.js");
    const result = generateFiles(makeInput([]));
    const skip = result.skipped.find(s => s.path === ".ai/context-map.json");
    expect(skip).toBeDefined();
    expect(skip!.reason).toBe("Generator error: string error");
  });
});

// ─── generateFiles deduplication and alias edge cases ─────────
describe("generateFiles edge cases", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("result includes generated_at ISO timestamp", async () => {
    const { generateFiles } = await import("./generate.js");
    const result = generateFiles(makeInput([]));
    expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("result includes snapshot_id and project_id from context_map", async () => {
    const { generateFiles } = await import("./generate.js");
    const result = generateFiles(makeInput([]));
    expect(result.snapshot_id).toBe("snap_val");
    expect(result.project_id).toBe("proj_val");
  });
});

// ─── listAvailableGenerators edge cases ───────────────────────
describe("listAvailableGenerators", () => {
  it("returns program for every registered generator", async () => {
    const { listAvailableGenerators } = await import("./generate.js");
    const generators = listAvailableGenerators();
    expect(generators.length).toBeGreaterThan(70); // 80 generators registered
    for (const g of generators) {
      expect(g.path).toBeTruthy();
      expect(g.program).toBeTruthy();
      expect(g.program).not.toBe("unknown");
    }
  });

  it("all generator paths are unique", async () => {
    const { listAvailableGenerators } = await import("./generate.js");
    const generators = listAvailableGenerators();
    const paths = generators.map(g => g.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
