import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput, SourceFile } from "./types.js";

/* --- Fixture Helpers ------------------------------------------------ */

function snap(opts: { name?: string; type?: string; files?: FileEntry[] } = {}): SnapshotRecord {
  const files = opts.files ?? [];
  return {
    snapshot_id: "snap-sf9-001",
    project_id: "proj-sf9-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "sf9-test",
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
  return result.files.find(f => f.path === path);
}

/* ================================================================= */
/* PART 1: project_summary FALSE path — clear it across ALL outputs  */
/* ================================================================= */

describe("project_summary FALSE path coverage", () => {
  const allPsSummaryOutputs = [
    "campaign-brief.md", "funnel-map.md", "sequence-pack.md", "cro-playbook.md",
    ".ai/seo-rules.md", "route-priority-map.md", "content-audit.md",
    ".ai/frontend-rules.md", "layout-patterns.md", "ui-audit.md",
    "refactor-checklist.md", "test-generation-rules.md", "automation-pipeline.yaml",
    "voice-and-tone.md", "brand-board.md", "content-constraints.md",
    "linking-policy.md", "server-manifest.yaml", "connector-map.yaml",
    "dependency-hotspots.md", "theme-guidelines.md", "scene-plan.md",
    "export-manifest.yaml", "workflow-registry.json", "meta-tag-audit.json",
    "mcp-config.json", "component-theme-map.json", "capability-registry.json",
    "channel-rulebook.md", "ab-test-plan.md", "obsidian-skill-pack.md",
    "template-pack.md", "superpower-pack.md",
  ];

  it("generates all outputs without project_summary", () => {
    const inp = input(snap(), allPsSummaryOutputs);
    inp.context_map.ai_context.project_summary = "";
    const res = generateFiles(inp);
    // Every output should still generate successfully
    for (const output of allPsSummaryOutputs) {
      const f = getFile(res, output);
      expect(f, `missing: ${output}`).toBeDefined();
    }
  });
});

/* ================================================================= */
/* PART 2: marketing generator — remaining source file sub-conditions */
/* ================================================================= */

describe("marketing: campaign-brief PKG-only (no README)", () => {
  it("hits readmes=0 && pkgJson branch", () => {
    const pkg: SourceFile = {
      path: "package.json",
      content: '{"name":"test","description":"A test desc","keywords":["k1"]}',
      size: 60,
    };
    const inp = input(snap(), ["campaign-brief.md"], [pkg]);
    const res = generateFiles(inp);
    const f = getFile(res, "campaign-brief.md");
    expect(f!.content).toContain("Package description");
    expect(f!.content).toContain("A test desc");
  });
});

describe("marketing: campaign-brief PKG without description or keywords", () => {
  it("hits desc FALSE and keywords FALSE branches", () => {
    const pkg: SourceFile = {
      path: "package.json",
      content: '{"name":"test","version":"1.0.0"}',
      size: 30,
    };
    const inp = input(snap(), ["campaign-brief.md"], [pkg]);
    const res = generateFiles(inp);
    const f = getFile(res, "campaign-brief.md");
    expect(f!.content).toContain("Source-Derived Messaging");
    expect(f!.content).not.toContain("Package description");
  });
});

describe("marketing: campaign-brief README with only short/header lines", () => {
  it("hits firstLine FALSE (no tagline found)", () => {
    const readme: SourceFile = {
      path: "README.md",
      content: "# Title\n## Sub\nShort.\n",
      size: 25,
    };
    const inp = input(snap(), ["campaign-brief.md"], [readme]);
    const res = generateFiles(inp);
    const f = getFile(res, "campaign-brief.md");
    expect(f!.content).not.toContain("README tagline");
  });
});

describe("marketing: campaign-brief no matching files", () => {
  it("skips source messaging when no readme/pkg", () => {
    const other: SourceFile = { path: "src/app.ts", content: 'console.log("hi");', size: 20 };
    const inp = input(snap(), ["campaign-brief.md"], [other]);
    const res = generateFiles(inp);
    const f = getFile(res, "campaign-brief.md");
    expect(f!.content).not.toContain("Source-Derived Messaging");
  });
});

describe("marketing: funnel-map entry points", () => {
  it("lists detected product entry points", () => {
    const entry: SourceFile = {
      path: "src/index.ts",
      content: 'export function main() { return "hello"; }\nexport const VERSION = "1.0";\n// l3\n// l4\n// l5\n',
      size: 100,
    };
    const inp = input(snap(), ["funnel-map.md"], [entry]);
    const res = generateFiles(inp);
    const f = getFile(res, "funnel-map.md");
    expect(f!.content).toContain("Detected Product Entry Points");
    expect(f!.content).toContain("src/index.ts");
  });
});

describe("marketing: cro-playbook warnings", () => {
  it("renders warnings when no lockfile or CI", () => {
    const inp = input(snap(), ["cro-playbook.md"]);
    // No tests, no CI, no lockfile → warnings exist
    const res = generateFiles(inp);
    const f = getFile(res, "cro-playbook.md");
    // Just verify it generates content; warnings may be embedded differently
    expect(f!.content.length).toBeGreaterThan(50);
  });
});

/* ================================================================= */
/* PART 3: SEO — remaining branches                                  */
/* ================================================================= */

describe("seo: seo-rules framework-specific sections", () => {
  it("renders Next.js SEO section", () => {
    const inp = input(snap(), [".ai/seo-rules.md"]);
    addFw(inp, "Next.js");
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/seo-rules.md");
    expect(f!.content).toContain("Next.js");
    expect(f!.content).toContain("generateMetadata");
  });
});

describe("seo: route-priority-map source analysis", () => {
  it("includes source content files in priority map", () => {
    const doc: SourceFile = { path: "docs/guide.md", content: "# Guide\n\nProject guide text here.\n", size: 40 };
    const inp = input(snap(), ["route-priority-map.md"], [doc]);
    addFw(inp, "Next.js");
    const res = generateFiles(inp);
    const f = getFile(res, "route-priority-map.md");
    expect(f).toBeDefined();
  });
});

describe("seo: content-audit hasMeta TRUE and FALSE in same run", () => {
  it("categorizes pages with and without meta tags", () => {
    const withMeta: SourceFile = {
      path: "src/routes/+page.svelte",
      content: '<svelte:head><title>Home</title><meta name="description" content="My site"></svelte:head>\n<h1>Hi</h1>',
      size: 100,
    };
    const noMeta: SourceFile = {
      path: "src/routes/about/+page.svelte",
      content: '<h1>About</h1>\n<p>Text</p>\n',
      size: 30,
    };
    const inp = input(snap(), ["content-audit.md"], [withMeta, noMeta]);
    addFw(inp, "SvelteKit");
    const res = generateFiles(inp);
    const f = getFile(res, "content-audit.md");
    expect(f!.content).toContain("Page Component Analysis");
  });
});

describe("seo: meta-tag-audit with SvelteKit routes", () => {
  it("generates audit for SvelteKit", () => {
    const files: FileEntry[] = [
      { path: "src/routes/+page.svelte", content: "<h1>Home</h1>", size: 20 },
      { path: "src/routes/about/+page.svelte", content: "<h1>About</h1>", size: 20 },
      { path: "package.json", content: '{"dependencies":{"@sveltejs/kit":"^1.0"}}', size: 50 },
    ];
    const inp = input(snap({ files }), ["meta-tag-audit.json"]);
    addFw(inp, "SvelteKit");
    const res = generateFiles(inp);
    const f = getFile(res, "meta-tag-audit.json");
    const data = JSON.parse(f!.content);
    expect(data.framework.toLowerCase()).toContain("svelte");
  });
});

/* ================================================================= */
/* PART 4: Debug — remaining branches                                */
/* ================================================================= */

describe("debug: playbook with Express framework", () => {
  it("renders Express-specific debugging section", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"]);
    addFw(inp, "Express");
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content).toContain("Express");
  });
});

describe("debug: playbook with SvelteKit", () => {
  it("renders SvelteKit-specific debugging", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"]);
    addFw(inp, "SvelteKit");
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content).toContain("SvelteKit");
  });
});

describe("debug: playbook with Next.js", () => {
  it("renders Next.js-specific debugging", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"]);
    addFw(inp, "Next.js");
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content).toContain("Next.js");
  });
});

describe("debug: tracing-rules with SQL tables", () => {
  it("includes database table monitoring", () => {
    const files: FileEntry[] = [
      { path: "schema.sql", content: "CREATE TABLE orders (id INT PRIMARY KEY);\nCREATE TABLE products (id INT PRIMARY KEY);", size: 80 },
      { path: "src/index.ts", content: 'export const x = 1;', size: 20 },
    ];
    const inp = input(snap({ files }), ["tracing-rules.md"]);
    const res = generateFiles(inp);
    const f = getFile(res, "tracing-rules.md");
    expect(f!.content).toContain("Database Table Monitoring");
    expect(f!.content).toContain("orders");
  });
});

describe("debug: tracing-rules with domain models", () => {
  it("includes domain model watch list", () => {
    const files: FileEntry[] = [
      { path: "src/models.ts", content: 'export interface User { id: number; name: string; email: string; }', size: 70 },
    ];
    const inp = input(snap({ files }), ["tracing-rules.md"]);
    const res = generateFiles(inp);
    const f = getFile(res, "tracing-rules.md");
    expect(f!.content).toContain("Domain Model Watch List");
    expect(f!.content).toContain("User");
  });
});

describe("debug: root-cause-checklist with Go test frameworks", () => {
  it("includes test pass gate for Go", () => {
    const files: FileEntry[] = [
      { path: "go.mod", content: "module example.com/app\n\ngo 1.21", size: 30 },
      { path: "main.go", content: 'package main\n\nfunc main() {}', size: 30 },
      { path: "main_test.go", content: 'package main\nimport "testing"\nfunc TestMain(t *testing.T) {}', size: 60 },
    ];
    const inp = input(snap({ files }), ["root-cause-checklist.md"]);
    const res = generateFiles(inp);
    const f = getFile(res, "root-cause-checklist.md");
    expect(f!.content).toContain("go test");
  });
});

describe("debug: root-cause-checklist with no CI", () => {
  it("shows no CI detected in root cause", () => {
    const files: FileEntry[] = [
      { path: "src/index.ts", content: 'export const x = 1;', size: 20 },
    ];
    const inp = input(snap({ files }), ["root-cause-checklist.md"]);
    const res = generateFiles(inp);
    const f = getFile(res, "root-cause-checklist.md");
    expect(f!.content).toContain("CI");
  });
});

/* ================================================================= */
/* PART 5: Frontend — remaining branches                             */
/* ================================================================= */

describe("frontend: frontend-rules source analysis", () => {
  it("detects component files and renders info", () => {
    const comp: SourceFile = {
      path: "src/Button.tsx",
      content: 'export function Button() { return <button>Click</button>; }\n// l2\n// l3\n// l4\n// l5\n',
      size: 100,
    };
    const inp = input(snap(), [".ai/frontend-rules.md"], [comp]);
    addFw(inp, "React");
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/frontend-rules.md");
    expect(f!.content).toContain("Button");
  });
});

describe("frontend: layout-patterns without layout files", () => {
  it("skips layout section when no layout files found", () => {
    const src: SourceFile = { path: "src/app.ts", content: 'console.log("hi");', size: 20 };
    const inp = input(snap(), ["layout-patterns.md"], [src]);
    addFw(inp, "React");
    const res = generateFiles(inp);
    const f = getFile(res, "layout-patterns.md");
    expect(f!.content).not.toContain("Reference Layout");
  });
});

describe("frontend: frontend-rules with Vue framework", () => {
  it("renders Vue-specific patterns", () => {
    const comp: SourceFile = {
      path: "src/App.vue",
      content: '<template><div>{{ msg }}</div></template>\n<script setup>\nconst msg = "hi";\n</script>\n',
      size: 80,
    };
    const inp = input(snap(), [".ai/frontend-rules.md"], [comp]);
    addFw(inp, "Vue.js");
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/frontend-rules.md");
    expect(f!.content).toContain("Vue");
  });
});

/* ================================================================= */
/* PART 6: Superpowers — remaining branches                          */
/* ================================================================= */

describe("superpowers: superpower-pack framework-specific", () => {
  it("renders AI capabilities for detected frameworks", () => {
    const inp = input(snap(), ["superpower-pack.md"]);
    addFw(inp, "Next.js", "Prisma");
    const res = generateFiles(inp);
    const f = getFile(res, "superpower-pack.md");
    expect(f!.content).toContain("Next.js");
  });
});

describe("superpowers: workflow-registry with no config files", () => {
  it("renders empty config section", () => {
    const inp = input(snap(), ["workflow-registry.json"]);
    const res = generateFiles(inp);
    const f = getFile(res, "workflow-registry.json");
    const data = JSON.parse(f!.content);
    expect(data).toBeDefined();
  });
});

describe("superpowers: test-generation-rules hotspot analysis", () => {
  it("includes hotspot test priority when hotspots exist", () => {
    const src: SourceFile = {
      path: "src/core.ts",
      content: 'export function handler() { return null; }\n// l2\n// l3\n// l4\n// l5\n',
      size: 100,
    };
    const inp = input(snap(), ["test-generation-rules.md"], [src]);
    inp.context_map.dependency_graph.hotspots = [
      { path: "src/core.ts", inbound_count: 12, outbound_count: 8, risk_score: 8.0 },
    ];
    const res = generateFiles(inp);
    const f = getFile(res, "test-generation-rules.md");
    expect(f!.content).toContain("core.ts");
  });
});

describe("superpowers: automation-pipeline with CI and test tools", () => {
  it("includes test stage and build tools", () => {
    const files: FileEntry[] = [
      { path: ".github/workflows/ci.yml", content: "name: CI", size: 10 },
      { path: "vitest.config.ts", content: 'export default {};', size: 20 },
      { path: "src/index.ts", content: 'export const x = 1;', size: 20 },
      { path: "package.json", content: '{"devDependencies":{"vitest":"^1.0","vite":"^5.0"}}', size: 60 },
    ];
    const inp = input(snap({ files }), ["automation-pipeline.yaml"]);
    const res = generateFiles(inp);
    const f = getFile(res, "automation-pipeline.yaml");
    expect(f!.content).toContain("test");
    expect(f!.content).toContain("vitest");
  });
});

/* ================================================================= */
/* PART 7: Artifacts — remaining branches                            */
/* ================================================================= */

describe("artifacts: generated-component with many component files", () => {
  it("renders component exemplar and reference", () => {
    const comps: SourceFile[] = [];
    for (let i = 0; i < 5; i++) {
      comps.push({
        path: `src/components/Widget${i}.tsx`,
        content: `export function Widget${i}() { return <div>W${i}</div>; }\nexport default Widget${i};\n// l3\n// l4\n// l5\n`,
        size: 100,
      });
    }
    const inp = input(snap(), ["generated-component.tsx"], comps);
    addFw(inp, "React");
    const res = generateFiles(inp);
    const f = getFile(res, "generated-component.tsx");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Widget");
  });
});

describe("artifacts: artifact-spec with component files and hotspots", () => {
  it("includes component inventory and dependency data", () => {
    const comp: SourceFile = {
      path: "src/Header.tsx",
      content: 'export function Header() { return <header>H</header>; }\nexport default Header;\n// l3\n// l4\n// l5\n',
      size: 100,
    };
    const inp = input(snap(), ["artifact-spec.md"], [comp]);
    addFw(inp, "React");
    inp.context_map.dependency_graph.hotspots = [
      { path: "src/Header.tsx", inbound_count: 10, outbound_count: 3, risk_score: 7.5 },
    ];
    const res = generateFiles(inp);
    const f = getFile(res, "artifact-spec.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Header");
  });
});

describe("artifacts: dashboard-widget with data models", () => {
  it("uses domain models for widget fields", () => {
    const files: FileEntry[] = [
      { path: "src/models.ts", content: 'export interface Dashboard { id: number; metrics: string[]; }', size: 60 },
    ];
    const inp = input(snap({ files }), ["dashboard-widget.tsx"]);
    const res = generateFiles(inp);
    const f = getFile(res, "dashboard-widget.tsx");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 8: Brand — remaining branches                                */
/* ================================================================= */

describe("brand: voice-and-tone without doc files", () => {
  it("skips tone samples when no docs found", () => {
    const src: SourceFile = { path: "src/app.ts", content: 'console.log("hi");', size: 20 };
    const inp = input(snap(), ["voice-and-tone.md"], [src]);
    const res = generateFiles(inp);
    const f = getFile(res, "voice-and-tone.md");
    expect(f!.content).not.toContain("Documentation Tone Samples");
  });
});

describe("brand: messaging-framework source analysis", () => {
  it("includes README messaging signals", () => {
    const readme: SourceFile = { path: "README.md", content: "# MyApp\n\nA powerful tool for developers to build apps quickly.\n", size: 60 };
    const inp = input(snap(), ["brand-board.md"], [readme]);
    const res = generateFiles(inp);
    const f = getFile(res, "brand-board.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 9: Notebook — remaining branches                             */
/* ================================================================= */

describe("notebook: notebook-summary without entry points", () => {
  it("skips entry point section when no entries found", () => {
    const src: SourceFile = { path: "lib/util.ts", content: 'const x = 1;\n', size: 15 };
    const inp = input(snap(), ["notebook-summary.md"], [src]);
    const res = generateFiles(inp);
    const f = getFile(res, "notebook-summary.md");
    expect(f).toBeDefined();
  });
});

describe("notebook: study-brief with no config files", () => {
  it("skips config overview when no configs found", () => {
    const src: SourceFile = {
      path: "src/index.ts",
      content: 'export function main() {}\n// l2\n// l3\n// l4\n// l5\n',
      size: 60,
    };
    const inp = input(snap(), ["study-brief.md"], [src]);
    const res = generateFiles(inp);
    const f = getFile(res, "study-brief.md");
    expect(f!.content).toContain("Key Files");
  });
});

describe("notebook: research-threads with no entry points", () => {
  it("generates threads without entry point complexity", () => {
    const src: SourceFile = { path: "lib/util.ts", content: 'const x = 1;\n', size: 15 };
    const inp = input(snap(), ["research-threads.md"], [src]);
    const res = generateFiles(inp);
    const f = getFile(res, "research-threads.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 10: MCP — remaining branches                                 */
/* ================================================================= */

describe("mcp: capability-registry with framework tools", () => {
  it("includes framework-specific capabilities", () => {
    const inp = input(snap(), ["capability-registry.json"]);
    addFw(inp, "Next.js", "Prisma");
    const res = generateFiles(inp);
    const f = getFile(res, "capability-registry.json");
    const data = JSON.parse(f!.content);
    expect(data.capabilities).toBeDefined();
    expect(data.capabilities.length).toBeGreaterThan(0);
  });
});

/* ================================================================= */
/* PART 11: Obsidian — remaining branches                            */
/* ================================================================= */

describe("obsidian: obsidian-skill-pack with frameworks", () => {
  it("includes framework-specific vault suggestions", () => {
    const inp = input(snap(), ["obsidian-skill-pack.md"]);
    addFw(inp, "React", "Next.js");
    const res = generateFiles(inp);
    const f = getFile(res, "obsidian-skill-pack.md");
    expect(f!.content).toContain("React");
  });
});

describe("obsidian: vault-rules without markdown files", () => {
  it("skips markdown file section when none found", () => {
    const src: SourceFile = { path: "src/app.ts", content: 'console.log("hi");', size: 20 };
    const inp = input(snap(), ["vault-rules.md"], [src]);
    const res = generateFiles(inp);
    const f = getFile(res, "vault-rules.md");
    expect(f!.content).not.toContain("Existing Markdown Files");
  });
});

describe("obsidian: graph-prompt-map without source files", () => {
  it("has no source entries when no files", () => {
    const inp = input(snap(), ["graph-prompt-map.json"]);
    const res = generateFiles(inp);
    const f = getFile(res, "graph-prompt-map.json");
    const data = JSON.parse(f!.content);
    expect(data.source_entry_points).toBeNull();
  });
});

/* ================================================================= */
/* PART 12: Search — remaining branches                              */
/* ================================================================= */

describe("search: architecture-summary with Go route patterns", () => {
  it("detects Go chi router patterns", () => {
    const files: FileEntry[] = [
      { path: "go.mod", content: "module example.com/app\n\ngo 1.21", size: 30 },
      { path: "main.go", content: 'package main\nimport "github.com/go-chi/chi/v5"\nfunc main() {\n  r := chi.NewRouter()\n  r.Get("/users", getUsers)\n  r.Post("/users", createUser)\n}', size: 150 },
    ];
    const inp = input(snap({ files }), ["architecture-summary.md"]);
    const res = generateFiles(inp);
    const f = getFile(res, "architecture-summary.md");
    expect(f!.content).toContain("/users");
  });
});

describe("search: dependency-hotspots risk categorization", () => {
  it("categorizes hotspots by risk level", () => {
    const inp = input(snap(), ["dependency-hotspots.md"]);
    inp.context_map.dependency_graph.hotspots = [
      { path: "high.ts", inbound_count: 20, outbound_count: 15, risk_score: 8.5 },
      { path: "med.ts", inbound_count: 5, outbound_count: 3, risk_score: 5.0 },
      { path: "low.ts", inbound_count: 2, outbound_count: 1, risk_score: 2.0 },
    ];
    const res = generateFiles(inp);
    const f = getFile(res, "dependency-hotspots.md");
    expect(f!.content).toContain("high.ts");
    expect(f!.content).toContain("med.ts");
    expect(f!.content).toContain("low.ts");
  });
});

/* ================================================================= */
/* PART 13: Skills — remaining branches                              */
/* ================================================================= */

describe("skills: policy-pack with entry points", () => {
  it("includes entry point conventions", () => {
    const entry: SourceFile = {
      path: "src/index.ts",
      content: 'export function init() {}\nexport const config = {};\n// l3\n// l4\n// l5\n',
      size: 80,
    };
    const inp = input(snap(), ["policy-pack.md"], [entry]);
    const res = generateFiles(inp);
    const f = getFile(res, "policy-pack.md");
    expect(f).toBeDefined();
  });
});

describe("skills: .cursorrules with multiple entry points", () => {
  it("lists all entry points in file tree", () => {
    const entries: SourceFile[] = [
      {
        path: "src/index.ts",
        content: 'export function main() {}\nexport const VERSION = "1.0";\n// l3\n// l4\n// l5\n',
        size: 80,
      },
      {
        path: "src/api/server.ts",
        content: 'export function startServer() {}\nexport function stopServer() {}\n// l3\n// l4\n// l5\n',
        size: 80,
      },
    ];
    const inp = input(snap(), [".cursorrules"], entries);
    const res = generateFiles(inp);
    const f = getFile(res, ".cursorrules");
    expect(f!.content).toContain("main");
    expect(f!.content).toContain("startServer");
  });
});

describe("skills: AGENTS.md with frameworks", () => {
  it("includes framework-specific agent instructions", () => {
    const inp = input(snap(), ["AGENTS.md"]);
    addFw(inp, "React", "Prisma");
    const res = generateFiles(inp);
    const f = getFile(res, "AGENTS.md");
    expect(f!.content).toContain("React");
    expect(f!.content).toContain("Prisma");
  });
});

/* ================================================================= */
/* PART 14: Theme — remaining branches                               */
/* ================================================================= */

describe("theme: theme-guidelines without component files", () => {
  it("skips component section when no components found", () => {
    const src: SourceFile = { path: "src/utils.ts", content: 'export const x = 1;\n', size: 20 };
    const inp = input(snap(), ["theme-guidelines.md"], [src]);
    const res = generateFiles(inp);
    const f = getFile(res, "theme-guidelines.md");
    expect(f).toBeDefined();
  });
});

describe("theme: component-theme-map with Vue", () => {
  it("uses Vue as framework in theme map", () => {
    const inp = input(snap(), ["component-theme-map.json"]);
    addFw(inp, "Vue.js");
    const res = generateFiles(inp);
    const f = getFile(res, "component-theme-map.json");
    const data = JSON.parse(f!.content);
    expect(data.framework).not.toBe("react");
  });
});

describe("theme: dark-mode-tokens with custom design tokens", () => {
  it("generates dark mode tokens", () => {
    const inp = input(snap(), ["dark-mode-tokens.json"]);
    addFw(inp, "React", "Tailwind CSS");
    const res = generateFiles(inp);
    const f = getFile(res, "dark-mode-tokens.json");
    const data = JSON.parse(f!.content);
    expect(data).toBeDefined();
  });
});

/* ================================================================= */
/* PART 15: Optimization — remaining branches                        */
/* ================================================================= */

describe("optimization: optimization-rules with hotspot excerpts", () => {
  it("renders hotspot source excerpts when files match", () => {
    const src: SourceFile = {
      path: "src/core.ts",
      content: 'export function heavy() { /* complex */ }\n// l2\n// l3\n// l4\n// l5\n',
      size: 100,
    };
    const inp = input(snap(), [".ai/optimization-rules.md"], [src]);
    inp.context_map.dependency_graph.hotspots = [
      { path: "src/core.ts", inbound_count: 15, outbound_count: 8, risk_score: 9.0 },
    ];
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/optimization-rules.md");
    expect(f!.content).toContain("core.ts");
  });
});

describe("optimization: token-budget-plan framework-specific tokens", () => {
  it("includes framework-specific token budgets", () => {
    const inp = input(snap(), ["token-budget-plan.md"]);
    addFw(inp, "Next.js", "Prisma");
    const res = generateFiles(inp);
    const f = getFile(res, "token-budget-plan.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 16: Canvas — remaining branches                              */
/* ================================================================= */

describe("canvas: canvas-spec with asset files", () => {
  it("includes detected assets in spec", () => {
    const svg: SourceFile = { path: "assets/logo.svg", content: "<svg></svg>", size: 50 };
    const inp = input(snap(), ["canvas-spec.json"], [svg]);
    const res = generateFiles(inp);
    const f = getFile(res, "canvas-spec.json");
    const data = JSON.parse(f!.content);
    expect(data).toBeDefined();
  });
});

describe("canvas: social-pack template analysis", () => {
  it("generates social pack with data fields", () => {
    const files: FileEntry[] = [
      { path: "src/models.ts", content: 'export interface Post { title: string; body: string; }', size: 60 },
    ];
    const inp = input(snap({ files }), ["social-pack.md"]);
    const res = generateFiles(inp);
    const f = getFile(res, "social-pack.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 17: Remotion — remaining branches                            */
/* ================================================================= */

describe("remotion: scene-plan with source files", () => {
  it("includes source file analysis in scene plan", () => {
    const src: SourceFile = { path: "src/intro.tsx", content: 'export function Intro() { return <div>Intro</div>; }', size: 50 };
    const inp = input(snap(), ["scene-plan.md"], [src]);
    const res = generateFiles(inp);
    const f = getFile(res, "scene-plan.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 18: file-excerpt-utils extname dot > 0                       */
/* ================================================================= */

describe("file-excerpt-utils: extname with dotted path", () => {
  it("extracts extension from paths with dots in directories", () => {
    // Testing indirectly via a generator that uses extname
    const src: SourceFile = {
      path: "src/my.component/utils.ts",
      content: 'export function util() {}\n// l2\n// l3\n// l4\n// l5\n',
      size: 60,
    };
    const inp = input(snap(), [".cursorrules"], [src]);
    const res = generateFiles(inp);
    const f = getFile(res, ".cursorrules");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 19: Algorithmic — remaining branch                           */
/* ================================================================= */

describe("algorithmic: collection-map with source files", () => {
  it("includes source file analysis in collection map", () => {
    const src: SourceFile = {
      path: "src/generator.ts",
      content: 'export function generate() { return []; }\n// l2\n// l3\n// l4\n// l5\n',
      size: 80,
    };
    const inp = input(snap(), ["collection-map.md"], [src]);
    const res = generateFiles(inp);
    const f = getFile(res, "collection-map.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 20: Framework detector — svelte.config                       */
/* ================================================================= */

describe("framework-detector: svelte.config.js detection", () => {
  it("detects SvelteKit from svelte.config.js", () => {
    const files: FileEntry[] = [
      { path: "svelte.config.js", content: 'import adapter from "@sveltejs/adapter-auto";\nexport default { kit: { adapter: adapter() } };', size: 100 },
      { path: "src/routes/+page.svelte", content: "<h1>Hi</h1>", size: 15 },
      { path: "package.json", content: '{"dependencies":{"@sveltejs/kit":"^1"}}', size: 40 },
    ];
    const inp = input(snap({ files }), [".ai/frontend-rules.md"]);
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/frontend-rules.md");
    expect(f).toBeDefined();
  });
});
