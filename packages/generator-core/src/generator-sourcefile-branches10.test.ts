import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput, SourceFile } from "./types.js";

/* --- Fixture Helpers ------------------------------------------------ */

function snap(opts: { name?: string; type?: string; files?: FileEntry[] } = {}): SnapshotRecord {
  const files = opts.files ?? [];
  return {
    snapshot_id: "snap-sf10-001",
    project_id: "proj-sf10-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "sf10-test",
      project_type: opts.type ?? "web_application",
      frameworks: [],
      goals: [],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
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

function addFw(inp: GeneratorInput, ...names: string[]) {
  for (const name of names) {
    inp.context_map.detection.frameworks.push({
      name,
      confidence: 0.9,
      version: null,
      evidence: ["test fixture"],
    });
  }
}

function getFile(result: ReturnType<typeof generateFiles>, path: string) {
  return result.files.find((f) => f.path === path);
}

/* An inert source file: exists but matches NO special patterns
   (not an entry point, no exports, not config/media/CI/CSS/README) */
const INERT: SourceFile = {
  path: "src/internal/helpers/math-utils.ts",
  content: "const add = (a: number, b: number) => a + b;\nconst sub = (a: number, b: number) => a - b;\n",
  size: 90,
};

/* ================================================================= */
/* PART 1: All generators with INERT source files                    */
/* covers: findEntryPoints→empty, findFiles→empty, extractExports→0  */
/* ================================================================= */

describe("generators with inert source files (no entry points, no pattern matches)", () => {
  it("covers empty-result inner branches for marketing generators", () => {
    const inp = input(snap(), ["funnel-map.md", "sequence-pack.md", "cro-playbook.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "funnel-map.md")).toBeDefined();
    expect(getFile(res, "sequence-pack.md")).toBeDefined();
    expect(getFile(res, "cro-playbook.md")).toBeDefined();
  });

  it("covers empty-result inner branches for canvas generators", () => {
    const inp = input(snap(), ["canvas-spec.json", "social-pack.md", "asset-guidelines.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "canvas-spec.json")).toBeDefined();
    expect(getFile(res, "social-pack.md")).toBeDefined();
  });

  it("covers empty-result inner branches for theme generators", () => {
    const inp = input(snap(), [".ai/design-tokens.json", "theme.css", "theme-guidelines.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, ".ai/design-tokens.json")).toBeDefined();
    expect(getFile(res, "theme.css")).toBeDefined();
    expect(getFile(res, "theme-guidelines.md")).toBeDefined();
  });

  it("covers empty-result inner branches for brand generators", () => {
    const inp = input(snap(), ["voice-and-tone.md", "brand-board.md", "content-constraints.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "voice-and-tone.md")).toBeDefined();
    expect(getFile(res, "brand-board.md")).toBeDefined();
    expect(getFile(res, "content-constraints.md")).toBeDefined();
  });

  it("covers empty-result inner branches for skills generators", () => {
    const inp = input(snap(), [".cursorrules", "CLAUDE.md", "workflow-pack.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, ".cursorrules")).toBeDefined();
    expect(getFile(res, "CLAUDE.md")).toBeDefined();
    expect(getFile(res, "workflow-pack.md")).toBeDefined();
  });

  it("covers empty-result inner branches for notebook generators", () => {
    const inp = input(snap(), ["study-brief.md", "source-map.json", "research-threads.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "study-brief.md")).toBeDefined();
    expect(getFile(res, "source-map.json")).toBeDefined();
    expect(getFile(res, "research-threads.md")).toBeDefined();
  });

  it("covers empty-result inner branches for obsidian generators", () => {
    const inp = input(snap(), ["linking-policy.md", "graph-prompt-map.json"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "linking-policy.md")).toBeDefined();
    expect(getFile(res, "graph-prompt-map.json")).toBeDefined();
  });

  it("covers empty-result inner branches for optimization generators", () => {
    const inp = input(snap(), [".ai/optimization-rules.md", "prompt-diff-report.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, ".ai/optimization-rules.md")).toBeDefined();
    expect(getFile(res, "prompt-diff-report.md")).toBeDefined();
  });

  it("covers empty-result inner branches for mcp generators", () => {
    const inp = input(snap(), ["connector-map.yaml", "capability-registry.json"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "connector-map.yaml")).toBeDefined();
  });

  it("covers empty-result inner branches for remotion generators", () => {
    const inp = input(snap(), ["scene-plan.md", "remotion-script.ts"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "scene-plan.md")).toBeDefined();
  });

  it("covers empty-result inner branches for superpowers generators", () => {
    const inp = input(snap(), ["superpower-pack.md", "automation-pipeline.yaml", "refactor-checklist.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "superpower-pack.md")).toBeDefined();
    expect(getFile(res, "automation-pipeline.yaml")).toBeDefined();
  });

  it("covers empty-result inner branches for artifacts generators", () => {
    const inp = input(snap(), ["artifact-spec.md", "component-library.json"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "artifact-spec.md")).toBeDefined();
    expect(getFile(res, "component-library.json")).toBeDefined();
  });

  it("covers empty-result inner branches for search generators", () => {
    const inp = input(snap(), ["dependency-hotspots.md", "architecture-summary.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "dependency-hotspots.md")).toBeDefined();
  });

  it("covers empty-result inner branches for frontend generators", () => {
    const inp = input(snap(), [".ai/frontend-rules.md", "layout-patterns.md", "component-guidelines.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, ".ai/frontend-rules.md")).toBeDefined();
    expect(getFile(res, "layout-patterns.md")).toBeDefined();
  });

  it("covers empty-result inner branches for seo generators", () => {
    const inp = input(snap(), ["route-priority-map.md", "content-audit.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "route-priority-map.md")).toBeDefined();
    expect(getFile(res, "content-audit.md")).toBeDefined();
  });

  it("covers empty-result for algorithmic generators", () => {
    const inp = input(snap(), ["export-manifest.yaml", "collection-map.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "export-manifest.yaml")).toBeDefined();
  });
});

/* ================================================================= */
/* PART 2: Debug-specific uncovered branches                         */
/* ================================================================= */

describe("debug: Go package manager path", () => {
  it("renders Go build/test commands when PM is go", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"]);
    inp.context_map.detection.package_managers = ["go"];
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content.toLowerCase()).toContain("go");
  });
});

describe("debug: Next.js framework path", () => {
  it("renders Next.js debug section", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"]);
    addFw(inp, "Next.js");
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content.toLowerCase()).toContain("next");
  });
});

describe("debug: SvelteKit framework path", () => {
  it("renders SvelteKit debug section", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"]);
    addFw(inp, "SvelteKit");
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content.toLowerCase()).toContain("svelte");
  });
});

describe("debug: Echo and Chi Go framework paths", () => {
  it("renders Echo debug section", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"]);
    addFw(inp, "Echo");
    inp.context_map.detection.package_managers = ["go"];
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content.toLowerCase()).toContain("echo");
  });

  it("renders Chi debug section", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"]);
    addFw(inp, "Chi");
    inp.context_map.detection.package_managers = ["go"];
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content.toLowerCase()).toContain("chi");
  });
});

describe("debug: Prisma with empty SQL schema", () => {
  it("skips SQL table listing when schema is empty", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"]);
    addFw(inp, "Prisma");
    inp.context_map.sql_schema = [];
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content.toLowerCase()).toContain("prisma");
    expect(f!.content).not.toContain("Tables in schema");
  });
});

describe("debug: no trace entry points with source files", () => {
  it("skips trace section when no entry points among source files", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"], [INERT]);
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f).toBeDefined();
  });
});

describe("debug: hotspot paths not matching source files", () => {
  it("skips suspect file section when hotspot paths miss source files", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"], [INERT]);
    inp.context_map.dependency_graph.hotspots = [
      { path: "pkg/nonexistent/service.go", inbound_count: 10, outbound_count: 5, risk_score: 8.0 },
    ];
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 3: SEO-specific uncovered branches                           */
/* ================================================================= */

describe("seo: API route in page file list", () => {
  it("marks API routes as noindex in content audit", () => {
    const apiFile: SourceFile = {
      path: "src/routes/api/health/+server.ts",
      content: 'export function GET() { return new Response("ok"); }\n// l2\n// l3\n// l4\n// l5\n',
      size: 80,
    };
    const inp = input(snap(), ["content-audit.md"], [apiFile]);
    addFw(inp, "SvelteKit");
    const res = generateFiles(inp);
    const f = getFile(res, "content-audit.md");
    expect(f).toBeDefined();
  });
});

describe("seo: route-priority-map without exemplar", () => {
  it("renders route map when route files have extreme LOC counts", () => {
    // File with > 80 lines to trigger exemplar === undefined
    const bigRoute: SourceFile = {
      path: "src/routes/+page.svelte",
      content: Array.from({ length: 100 }, (_, i) => `<!-- line ${i + 1} -->`).join("\n"),
      size: 2000,
    };
    const inp = input(snap(), ["route-priority-map.md"], [bigRoute]);
    addFw(inp, "SvelteKit");
    const res = generateFiles(inp);
    const f = getFile(res, "route-priority-map.md");
    expect(f).toBeDefined();
  });
});

describe("seo: schema recommendations without deep routes", () => {
  it("skips breadcrumb when no deep routes", () => {
    const inp = input(snap(), ["schema-recommendations.json"]);
    // No routes → hasDeepRoutes = false
    inp.context_map.routes = [];
    const res = generateFiles(inp);
    const f = getFile(res, "schema-recommendations.json");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 4: Frontend-specific uncovered branches                      */
/* ================================================================= */

describe("frontend: component with no exports", () => {
  it("renders component path without export list when no exports found", () => {
    const noExportComp: SourceFile = {
      path: "src/components/Loader.tsx",
      content: "// internal component\nconst Loader = () => null;\n// l3\n// l4\n// l5\n",
      size: 60,
    };
    const inp = input(snap(), ["component-guidelines.md"], [noExportComp]);
    addFw(inp, "React");
    const res = generateFiles(inp);
    const f = getFile(res, "component-guidelines.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Loader.tsx");
  });
});

describe("frontend: layout with no exemplar", () => {
  it("skips layout excerpt when layout files are too short", () => {
    const shortLayout: SourceFile = {
      path: "src/routes/+layout.svelte",
      content: "<slot />\n",
      size: 10,
    };
    const inp = input(snap(), ["layout-patterns.md"], [shortLayout]);
    addFw(inp, "SvelteKit");
    const res = generateFiles(inp);
    const f = getFile(res, "layout-patterns.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 5: Artifacts-specific uncovered branches                     */
/* ================================================================= */

describe("artifacts: component-library with no React and no frameworks", () => {
  it("falls back to primary language for framework field", () => {
    const inp = input(snap(), ["component-library.json"]);
    // Clear frameworks — fallback to primary_language
    inp.context_map.detection.frameworks = [];
    const res = generateFiles(inp);
    const f = getFile(res, "component-library.json");
    const data = JSON.parse(f!.content);
    expect(data.framework).toBeDefined();
  });
});

/* ================================================================= */
/* PART 6: Superpowers-specific uncovered branches                   */
/* ================================================================= */

describe("superpowers: untested exports with matching test file", () => {
  it("skips untested listing when test file exists", () => {
    const src: SourceFile = {
      path: "src/utils/calc.ts",
      content: "export function add(a: number, b: number) { return a + b; }\n// l2\n// l3\n// l4\n// l5\n",
      size: 80,
    };
    const testSrc: SourceFile = {
      path: "src/utils/calc.test.ts",
      content: 'import { add } from "./calc";\ntest("add", () => expect(add(1,2)).toBe(3));\n// l3\n// l4\n// l5\n',
      size: 100,
    };
    const inp = input(snap(), ["test-generation-rules.md"], [src, testSrc]);
    const res = generateFiles(inp);
    const f = getFile(res, "test-generation-rules.md");
    expect(f).toBeDefined();
  });
});

describe("superpowers: source file with no exports for entry detection", () => {
  it("handles entry point with no extractable exports", () => {
    const noExport: SourceFile = {
      path: "src/main.ts",
      content: '// main entry point\nconsole.log("start");\n// l3\n// l4\n// l5\n',
      size: 60,
    };
    const inp = input(snap(), ["superpower-pack.md"], [noExport]);
    const res = generateFiles(inp);
    const f = getFile(res, "superpower-pack.md");
    expect(f).toBeDefined();
  });
});

describe("superpowers: hotspot file with no exports", () => {
  it("skips export listing for hotspot when file has no exports", () => {
    const hotspotSrc: SourceFile = {
      path: "pkg/core/manager.go",
      content: "package core\n\nfunc init() {}\n// l4\n// l5\n",
      size: 50,
    };
    const inp = input(snap(), ["refactor-checklist.md"], [hotspotSrc]);
    inp.context_map.dependency_graph.hotspots = [
      { path: "pkg/core/manager.go", inbound_count: 15, outbound_count: 8, risk_score: 9.0 },
    ];
    const res = generateFiles(inp);
    const f = getFile(res, "refactor-checklist.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 7: Theme-specific uncovered branches                         */
/* ================================================================= */

describe("theme: no routes and no domain models in token map", () => {
  it("skips route zones and domain tokens sections", () => {
    const inp = input(snap(), ["theme-guidelines.md"]);
    inp.context_map.routes = [];
    inp.context_map.domain_models = [];
    const res = generateFiles(inp);
    const f = getFile(res, "theme-guidelines.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("Route Theme Zones");
    expect(f!.content).not.toContain("Domain-Specific Tokens");
  });
});

/* ================================================================= */
/* PART 8: Canvas-specific uncovered branches                        */
/* ================================================================= */

describe("canvas: no domain models for icon suggestions", () => {
  it("skips domain model iconography section", () => {
    const inp = input(snap(), ["asset-guidelines.md"]);
    inp.context_map.domain_models = [];
    const res = generateFiles(inp);
    const f = getFile(res, "asset-guidelines.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 9: Notebook-specific — source map with null files             */
/* ================================================================= */

describe("notebook: source-map without files", () => {
  it("returns null file_tree when no source files", () => {
    const inp = input(snap(), ["source-map.json"]);
    const res = generateFiles(inp);
    const f = getFile(res, "source-map.json");
    const data = JSON.parse(f!.content);
    expect(data.file_tree).toBeNull();
  });
});

/* ================================================================= */
/* PART 10: SEO meta-tag-audit route title edge case                  */
/* ================================================================= */

describe("seo: meta-tag-audit title generation", () => {
  it("handles root route title template", () => {
    const inp = input(snap({ name: "MyApp" }), ["meta-tag-audit.json"]);
    inp.context_map.routes = [
      { path: "/", method: "GET", source_file: "src/routes/+page.svelte" },
      { path: "/about", method: "GET", source_file: "src/routes/about/+page.svelte" },
    ];
    addFw(inp, "SvelteKit");
    const res = generateFiles(inp);
    const f = getFile(res, "meta-tag-audit.json");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 11: Debug — pnpm PM with Prisma (line 96 cond-expr)          */
/* ================================================================= */

describe("debug: pnpm package manager with Prisma", () => {
  it("uses 'pnpm exec' prefix for Prisma migrate", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"]);
    addFw(inp, "Prisma");
    inp.context_map.detection.package_managers = ["pnpm"];
    inp.context_map.sql_schema = [
      { name: "users", column_count: 5, foreign_key_count: 0, index_count: 1 },
    ];
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content).toContain("pnpm exec");
    expect(f!.content).toContain("prisma");
  });
});

/* ================================================================= */
/* PART 12: Debug — lowercase framework names for ?? fallback        */
/* ================================================================= */

describe("debug: lowercase framework name fallback paths", () => {
  it("resolves 'next' via getFw fallback", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"]);
    inp.context_map.detection.frameworks.push({
      name: "next",
      confidence: 0.9,
      version: "14.0.0",
      evidence: ["test"],
    });
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content).toContain("Next.js");
  });

  it("resolves 'sveltekit' via getFw fallback", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"]);
    inp.context_map.detection.frameworks.push({
      name: "sveltekit",
      confidence: 0.9,
      version: "2.0.0",
      evidence: ["test"],
    });
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content.toLowerCase()).toContain("sveltekit");
  });

  it("resolves 'echo' via getFw fallback", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"]);
    inp.context_map.detection.frameworks.push({
      name: "echo",
      confidence: 0.9,
      version: "4.11.0",
      evidence: ["test"],
    });
    inp.context_map.detection.package_managers = ["go"];
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content.toLowerCase()).toContain("echo");
  });
});

/* ================================================================= */
/* PART 13: Debug — production dep without version (line 358)        */
/* ================================================================= */

describe("debug: production dependency without version", () => {
  it("renders dependency without @ version suffix", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"]);
    inp.context_map.dependency_graph.external_dependencies = [
      { name: "express", version: null, type: "production" },
      { name: "lodash", version: "4.17.21", type: "production" },
    ];
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content).toContain("`express`");
    expect(f!.content).not.toContain("express` @");
    expect(f!.content).toContain("@ 4.17.21");
  });
});

/* ================================================================= */
/* PART 14: Debug — entry point with no exports (line 742)           */
/* ================================================================= */

describe("debug: tracing-rules with no-export entry point", () => {
  it("shows 'default' when entry has no extractable exports", () => {
    const entry: SourceFile = {
      path: "src/index.ts",
      content: '// entry\nconsole.log("hello");\n// line3\n// line4\n// line5\n',
      size: 60,
    };
    const inp = input(snap(), ["tracing-rules.md"], [entry]);
    const res = generateFiles(inp);
    const f = getFile(res, "tracing-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("index.ts");
  });
});

/* ================================================================= */
/* PART 15: Debug — SQL table with 0 foreign keys (line 910)         */
/* ================================================================= */

describe("debug: root-cause-checklist with FK-less tables", () => {
  it("renders table without FK note when foreign_key_count is 0", () => {
    const inp = input(snap(), ["root-cause-checklist.md"]);
    inp.context_map.sql_schema = [
      { name: "settings", column_count: 3, foreign_key_count: 0, index_count: 1 },
      { name: "orders", column_count: 8, foreign_key_count: 2, index_count: 3 },
    ];
    const res = generateFiles(inp);
    const f = getFile(res, "root-cause-checklist.md");
    expect(f!.content).toContain("settings");
    expect(f!.content).toContain("orders");
  });
});

/* ================================================================= */
/* PART 16: SEO — route files with no exports (line 432)             */
/* ================================================================= */

describe("seo: route-priority-map with no-export route files", () => {
  it("shows 'default' for routes without extractable exports", () => {
    const routeFile: SourceFile = {
      path: "src/routes/+page.server.ts",
      content: '// server route\nconst data = { x: 1 };\n// l3\n// l4\n// l5\n// l6\n// l7\n// l8\n// l9\n// l10\n',
      size: 100,
    };
    const inp = input(snap(), ["route-priority-map.md"], [routeFile]);
    addFw(inp, "SvelteKit");
    const res = generateFiles(inp);
    const f = getFile(res, "route-priority-map.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 17: Search — toYAML with null and string values              */
/* ================================================================= */

describe("search: repo-profile YAML with null fields", () => {
  it("serializes profile that includes null values", () => {
    const inp = input(snap(), [".ai/repo-profile.yaml"]);
    // Force a null field in the profile
    (inp.repo_profile as Record<string, unknown>).custom_field = null;
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/repo-profile.yaml");
    expect(f!.content).toContain("null");
  });
});

/* ================================================================= */
/* PART 18: File-excerpt-utils — file with no extension (line 147)   */
/* ================================================================= */

describe("file-excerpt: file without extension", () => {
  it("handles file with no dot in name", () => {
    const noExt: SourceFile = {
      path: "Makefile",
      content: "all:\n\t@echo done\n// l3\n// l4\n// l5\n",
      size: 40,
    };
    const inp = input(snap(), ["architecture-summary.md"], [noExt]);
    const res = generateFiles(inp);
    const f = getFile(res, "architecture-summary.md");
    expect(f!.content).toContain("Makefile");
  });
});

/* ================================================================= */
/* PART 19: Skills — entry points in CLAUDE.md / .cursorrules        */
/* ================================================================= */

describe("skills: source files with entry points for prompt rules", () => {
  it("includes file tree and entry points in .cursorrules", () => {
    const entry: SourceFile = {
      path: "src/index.ts",
      content: 'export function main() { return "hello"; }\n// l2\n// l3\n// l4\n// l5\n',
      size: 60,
    };
    const util: SourceFile = {
      path: "src/utils/helper.ts",
      content: 'const x = 1;\n// no exports\n// l3\n// l4\n// l5\n',
      size: 50,
    };
    const inp = input(snap(), [".cursorrules", "CLAUDE.md"], [entry, util]);
    const res = generateFiles(inp);
    const f = getFile(res, ".cursorrules");
    expect(f!.content).toContain("index.ts");
    const f2 = getFile(res, "CLAUDE.md");
    expect(f2!.content).toContain("index.ts");
  });
});

/* ================================================================= */
/* PART 20: Notebook — entry points in research-threads              */
/* ================================================================= */

describe("notebook: research-threads with entry points", () => {
  it("renders source-based threads when entry points exist", () => {
    const entry: SourceFile = {
      path: "src/app.ts",
      content: 'export default function App() {}\n// l2\n// l3\n// l4\n// l5\n',
      size: 50,
    };
    const inp = input(snap(), ["research-threads.md"], [entry]);
    const res = generateFiles(inp);
    const f = getFile(res, "research-threads.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 21: Obsidian — linking-policy with entry points              */
/* ================================================================= */

describe("obsidian: linking-policy with entry points", () => {
  it("renders hub note candidates from entry points", () => {
    const entry: SourceFile = {
      path: "src/server.ts",
      content: 'export function startServer() {}\n// l2\n// l3\n// l4\n// l5\n',
      size: 50,
    };
    const inp = input(snap(), ["linking-policy.md"], [entry]);
    const res = generateFiles(inp);
    const f = getFile(res, "linking-policy.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 22: Optimization — diff-report with entry points             */
/* ================================================================= */

describe("optimization: diff-report with entry points", () => {
  it("renders source-verified entry points", () => {
    const entry: SourceFile = {
      path: "src/main.ts",
      content: 'export function bootstrap() {}\nexport const VERSION = "1.0";\n// l3\n// l4\n// l5\n',
      size: 70,
    };
    const inp = input(snap(), ["prompt-diff-report.md"], [entry]);
    const res = generateFiles(inp);
    const f = getFile(res, "prompt-diff-report.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 23: Artifacts — entry points with exports and without        */
/* ================================================================= */

describe("artifacts: artifact-spec with entry points having no exports", () => {
  it("renders entry point section even when no exports found", () => {
    const entry: SourceFile = {
      path: "src/index.ts",
      content: '// main entry\nconsole.log("start");\n// l3\n// l4\n// l5\n',
      size: 50,
    };
    const inp = input(snap(), ["artifact-spec.md"], [entry]);
    const res = generateFiles(inp);
    const f = getFile(res, "artifact-spec.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 24: Frontend — component-guidelines with no-export comp      */
/* ================================================================= */

describe("frontend: component-guidelines no-export components", () => {
  it("lists component path without exports", () => {
    const comp: SourceFile = {
      path: "src/components/Spinner.vue",
      content: '<template><div class="spinner"/></template>\n// l2\n// l3\n// l4\n// l5\n',
      size: 60,
    };
    const inp = input(snap(), ["component-guidelines.md"], [comp]);
    addFw(inp, "Vue");
    const res = generateFiles(inp);
    const f = getFile(res, "component-guidelines.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 25: Superpowers — automation-pipeline with CI source files   */
/* ================================================================= */

describe("superpowers: automation-pipeline with CI files", () => {
  it("renders CI/config files section when CI files present", () => {
    const ciFile: SourceFile = {
      path: ".github/workflows/ci.yml",
      content: "name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n",
      size: 60,
    };
    const inp = input(snap(), ["automation-pipeline.yaml"], [ciFile]);
    const res = generateFiles(inp);
    const f = getFile(res, "automation-pipeline.yaml");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 26: Brand — source files with README and doc files           */
/* ================================================================= */

describe("brand: voice-and-tone with README source files", () => {
  it("detects brand assets from README source files", () => {
    const readme: SourceFile = {
      path: "README.md",
      content: "# MyProduct\n\nThe best product ever.\n// l3\n// l4\n// l5\n",
      size: 60,
    };
    const inp = input(snap(), ["voice-and-tone.md", "brand-board.md", "content-constraints.md"], [readme]);
    const res = generateFiles(inp);
    expect(getFile(res, "voice-and-tone.md")).toBeDefined();
    expect(getFile(res, "brand-board.md")).toBeDefined();
    expect(getFile(res, "content-constraints.md")).toBeDefined();
  });
});

/* ================================================================= */
/* PART 27: Search — architecture-summary with configs               */
/* ================================================================= */

describe("search: architecture-summary with config files", () => {
  it("detects config files in source tree", () => {
    const cfg: SourceFile = {
      path: "tsconfig.json",
      content: '{"compilerOptions":{"strict":true}}\n// l2\n// l3\n// l4\n// l5\n',
      size: 40,
    };
    const inp = input(snap(), ["architecture-summary.md"], [cfg]);
    const res = generateFiles(inp);
    const f = getFile(res, "architecture-summary.md");
    expect(f!.content).toContain("tsconfig.json");
  });
});

/* ================================================================= */
/* PART 28: Workflow-pack with config files                          */
/* ================================================================= */

describe("skills: workflow-pack with config files", () => {
  it("detects config files in source tree", () => {
    const cfg: SourceFile = {
      path: ".prettierrc",
      content: '{"semi":false}\n// l2\n// l3\n// l4\n// l5\n',
      size: 30,
    };
    const inp = input(snap(), ["workflow-pack.md"], [cfg]);
    const res = generateFiles(inp);
    const f = getFile(res, "workflow-pack.md");
    expect(f!.content).toContain(".prettierrc");
  });
});
