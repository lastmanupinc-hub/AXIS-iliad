import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput, SourceFile } from "./types.js";

/* ─── Fixture Helpers ──────────────────────────────────────────── */

function snap(opts: { name?: string; type?: string; files?: FileEntry[] } = {}): SnapshotRecord {
  const files = opts.files ?? [];
  return {
    snapshot_id: "snap-sf5-001",
    project_id: "proj-sf5-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "sf5-test",
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
function snapMinimal(name = "minimal-app"): SnapshotRecord {
  return {
    snapshot_id: "snap-min5-001",
    project_id: "proj-min5-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: name,
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

/* ─── Shared Fixtures ──────────────────────────────────────────── */

const BASIC_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"test","dependencies":{"next":"14.0.0"}}', size: 50 },
  { path: "src/index.ts", content: 'export function main() { return "hello"; }', size: 40 },
];

const ENTRY_POINTS: SourceFile[] = [
  {
    path: "src/index.ts",
    content: 'import { startServer } from "./server";\nexport function main() {\n  return startServer(3000);\n}\nexport const VERSION = "1.0.0";\n',
    size: 110,
  },
];

const CONFIG_FILES: SourceFile[] = [
  { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
];

/* ─── DEBUG — domain_models TRUE branch ────────────────────────── */

describe("debug generator — domain models and remaining branches", () => {
  it("debug-playbook includes domain model inventory when models exist", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["debug-playbook.md"]);
    inp.context_map.domain_models = [
      { name: "User", kind: "interface", language: "TypeScript", field_count: 5, source_file: "src/models/user.ts" },
      { name: "Order", kind: "class", language: "TypeScript", field_count: 8, source_file: "src/models/order.ts" },
    ];
    const result = generateFiles(inp);
    const f = getFile(result, "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Domain Model Inventory");
    expect(f!.content).toContain("User");
    expect(f!.content).toContain("Order");
  });
});

/* ─── CANVAS — uncovered branches ──────────────────────────────── */

describe("canvas generator — uncovered branches", () => {
  // brand-board: domain_models TRUE path (line ~604)
  it("brand-board includes domain models when present", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["brand-board.md"]);
    inp.context_map.domain_models = [
      { name: "Product", kind: "interface", language: "TypeScript", field_count: 6, source_file: "src/product.ts" },
    ];
    const result = generateFiles(inp);
    const f = getFile(result, "brand-board.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Domain Models");
    expect(f!.content).toContain("Product");
  });

  // poster-layouts: domain_models TRUE path (line ~307)
  it("poster-layouts includes domain models when present", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["poster-layouts.md"]);
    inp.context_map.domain_models = [
      { name: "Invoice", kind: "class", language: "TypeScript", field_count: 4, source_file: "src/invoice.ts" },
    ];
    const result = generateFiles(inp);
    const f = getFile(result, "poster-layouts.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Domain Model");
    expect(f!.content).toContain("Invoice");
  });

  // brand-board: warnings TRUE path
  it("brand-board includes brand warnings when present", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["brand-board.md"]);
    inp.context_map.ai_context.warnings = ["Logo resolution too low for print"];
    const result = generateFiles(inp);
    const f = getFile(result, "brand-board.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Brand Warnings");
    expect(f!.content).toContain("Logo resolution too low");
  });

  // brand-board: source file brand assets
  it("brand-board includes detected brand assets from source files", () => {
    const s = snap({ files: BASIC_FILES });
    const brandFiles: SourceFile[] = [
      { path: "assets/logo.svg", content: "<svg></svg>", size: 15 },
      { path: "assets/brand-icon.png", content: "PNG_DATA", size: 5000 },
    ];
    const inp = input(s, ["brand-board.md"], brandFiles);
    const result = generateFiles(inp);
    const f = getFile(result, "brand-board.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Detected Brand Assets");
    expect(f!.content).toContain("logo.svg");
  });
});

/* ─── ARTIFACTS — uncovered branches ───────────────────────────── */

describe("artifacts generator — uncovered branches", () => {
  // component-library: source_components when files present with components
  it("component-library includes source components from tsx/jsx files", () => {
    const s = snap({ files: BASIC_FILES });
    const compFiles: SourceFile[] = [
      { path: "src/Button.tsx", content: 'export function Button() { return <button>Click</button>; }', size: 60 },
      { path: "src/Card.tsx", content: 'export function Card({ children }: any) { return <div>{children}</div>; }', size: 70 },
    ];
    const inp = input(s, ["component-library.json"], compFiles);
    const result = generateFiles(inp);
    const f = getFile(result, "component-library.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_components).toBeDefined();
    expect(parsed.source_components.length).toBe(2);
    expect(parsed.source_components[0].path).toBe("src/Button.tsx");
  });

  // component-library: no source files → null
  it("component-library returns null source_components when no files", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["component-library.json"]);
    const result = generateFiles(inp);
    const f = getFile(result, "component-library.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_components).toBeNull();
  });
});

/* ─── MARKETING — uncovered branches ───────────────────────────── */

describe("marketing generator — uncovered branches", () => {
  // ab-test-plan: source file test infrastructure
  it("ab-test-plan includes existing test infrastructure from source files", () => {
    const s = snap({ files: BASIC_FILES });
    const testFiles: SourceFile[] = [
      { path: "src/__tests__/app.test.ts", content: 'import { test } from "vitest"; test("works", () => {});', size: 55 },
      { path: "src/utils.spec.ts", content: 'describe("utils", () => { it("runs", () => {}); });', size: 50 },
    ];
    const inp = input(s, ["ab-test-plan.md"], testFiles);
    const result = generateFiles(inp);
    const f = getFile(result, "ab-test-plan.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Existing Test Infrastructure");
    expect(f!.content).toContain("2 test files");
  });

  // ab-test-plan: no source files → skip test infrastructure
  it("ab-test-plan skips test infrastructure when no test files in source", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["ab-test-plan.md"], ENTRY_POINTS);
    const result = generateFiles(inp);
    const f = getFile(result, "ab-test-plan.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("Existing Test Infrastructure");
  });
});

/* ─── NOTEBOOK — uncovered branches ────────────────────────────── */

describe("notebook generator — uncovered branches", () => {
  // study-brief: source files with no entry points (entries.length === 0)
  it("study-brief skips key files section when no entry points found", () => {
    const s = snap({ files: BASIC_FILES });
    const noEntryFiles: SourceFile[] = [
      { path: "lib/helper.ts", content: "const x = 1;\n", size: 14 },
    ];
    const inp = input(s, ["study-brief.md"], noEntryFiles);
    const result = generateFiles(inp);
    const f = getFile(result, "study-brief.md");
    expect(f).toBeDefined();
    // Should have source file analysis but no entry point table since helper has no exports
    expect(f!.content).not.toContain("Key Files to Read");
  });

  // research-threads: source files with entry points
  it("research-threads includes source-based threads from entry points", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["research-threads.md"], ENTRY_POINTS);
    const result = generateFiles(inp);
    const f = getFile(result, "research-threads.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Source-Based Threads");
    expect(f!.content).toContain("Entry Point Complexity");
  });

  // research-threads: source files with no entry points
  it("research-threads skips key files when no entry points in source", () => {
    const s = snap({ files: BASIC_FILES });
    const noEntryFiles: SourceFile[] = [
      { path: "config.yaml", content: "key: value\n", size: 12 },
    ];
    const inp = input(s, ["research-threads.md"], noEntryFiles);
    const result = generateFiles(inp);
    const f = getFile(result, "research-threads.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("Entry Point Source");
  });
});

/* ─── SEARCH — uncovered branches ──────────────────────────────── */

describe("search generator — uncovered branches", () => {
  // dependency-hotspots: source file hotspot export surface
  it("dependency-hotspots includes hotspot export surface from source files", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["dependency-hotspots.md"], ENTRY_POINTS);
    inp.context_map.dependency_graph.hotspots = [
      { path: "src/index.ts", inbound_count: 12, outbound_count: 5, risk_score: 8.0 },
    ];
    const result = generateFiles(inp);
    const f = getFile(result, "dependency-hotspots.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Hotspot Export Surface");
    expect(f!.content).toContain("src/index.ts");
  });

  // dependency-hotspots: source files but hotspot paths don't match source files
  it("dependency-hotspots skips export surface when hotspot files not in source", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["dependency-hotspots.md"], ENTRY_POINTS);
    inp.context_map.dependency_graph.hotspots = [
      { path: "lib/unrelated.ts", inbound_count: 10, outbound_count: 3, risk_score: 7.0 },
    ];
    const result = generateFiles(inp);
    const f = getFile(result, "dependency-hotspots.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("Hotspot Export Surface");
  });
});

/* ─── FRONTEND — uncovered branches ────────────────────────────── */

describe("frontend generator — uncovered branches", () => {
  // layout-patterns: source files with layout components
  it("layout-patterns includes layout file table from source files", () => {
    const s = snap({ files: BASIC_FILES });
    const layoutFiles: SourceFile[] = [
      {
        path: "src/layouts/MainLayout.tsx",
        content: 'export function MainLayout({ children }: any) {\n  return (\n    <div className="layout">\n      <header>Nav</header>\n      <main>{children}</main>\n    </div>\n  );\n}\n',
        size: 150,
      },
    ];
    const inp = input(s, ["layout-patterns.md"], layoutFiles);
    const result = generateFiles(inp);
    const f = getFile(result, "layout-patterns.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("MainLayout.tsx");
  });

  // ui-audit: source files with component files
  it("ui-audit includes detected UI components from source files", () => {
    const s = snap({ files: BASIC_FILES });
    const compFiles: SourceFile[] = [
      { path: "src/Button.tsx", content: 'export function Button() { return <button>Click</button>; }', size: 60 },
      { path: "src/styles/main.css", content: ".btn { color: red; }\n.card { padding: 8px; }\n", size: 44 },
    ];
    const inp = input(s, ["ui-audit.md"], compFiles);
    const result = generateFiles(inp);
    const f = getFile(result, "ui-audit.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Detected UI Components");
    expect(f!.content).toContain("Button.tsx");
    expect(f!.content).toContain("Detected Style Files");
    expect(f!.content).toContain("main.css");
  });

  // ui-audit: no source files → skip component/style sections
  it("ui-audit skips component section when no source files", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["ui-audit.md"]);
    const result = generateFiles(inp);
    const f = getFile(result, "ui-audit.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("Detected UI Components");
    expect(f!.content).not.toContain("Detected Style Files");
  });
});

/* ─── SUPERPOWERS — uncovered branches ─────────────────────────── */

describe("superpowers generator — uncovered branches", () => {
  // test-generation-rules: test files with exemplar (line ~509)
  it("test-generation-rules includes reference test when exemplar found", () => {
    const s = snap({ files: BASIC_FILES });
    // Exemplar needs 10-100 lines — create 30-line content
    const lines: string[] = ['import { describe, it, expect } from "vitest";', ""];
    for (let i = 0; i < 28; i++) {
      lines.push(`it("case ${i}", () => { expect(${i}).toBe(${i}); });`);
    }
    const testContent = lines.join("\n");
    const files: SourceFile[] = [
      {
        path: "src/utils.test.ts",
        content: testContent,
        size: testContent.length,
      },
    ];
    const inp = input(s, ["test-generation-rules.md"], files);
    const result = generateFiles(inp);
    const f = getFile(result, "test-generation-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Reference Test");
  });

  // test-generation-rules: test files but none match exemplar criteria
  it("test-generation-rules skips reference test when no exemplar match", () => {
    const s = snap({ files: BASIC_FILES });
    const files: SourceFile[] = [
      { path: "src/tiny.test.ts", content: "test('x', () => {});\n", size: 25 }, // too short (< 10 lines)
    ];
    const inp = input(s, ["test-generation-rules.md"], files);
    const result = generateFiles(inp);
    const f = getFile(result, "test-generation-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("Reference Test");
  });
});

/* ─── SKILLS — remaining uncovered branches ────────────────────── */

describe("skills generator — remaining uncovered branches", () => {
  // .cursorrules: source file tree + entry points (lines 353-368)
  it(".cursorrules includes project file tree and entry points from source", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, [".cursorrules"], [...CONFIG_FILES, ...ENTRY_POINTS]);
    const result = generateFiles(inp);
    const f = getFile(result, ".cursorrules");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Project File Tree");
    expect(f!.content).toContain("Key Entry Points");
    expect(f!.content).toContain("src/index.ts");
  });

  // CLAUDE.md: source file context with entries + configs
  it("CLAUDE.md includes key source files and configuration excerpts", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["CLAUDE.md"], [...CONFIG_FILES, ...ENTRY_POINTS]);
    const result = generateFiles(inp);
    const f = getFile(result, "CLAUDE.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Key Source Files");
  });
});

/* ─── ALGORITHMIC — uncovered branches ─────────────────────────── */

describe("algorithmic generator — uncovered branches", () => {
  // export-manifest: source files with image assets
  it("export-manifest includes source assets when image files present", () => {
    const s = snap({ files: BASIC_FILES });
    const imgFiles: SourceFile[] = [
      { path: "assets/texture.png", content: "PNG_BINARY", size: 10000 },
      { path: "assets/pattern.svg", content: "<svg></svg>", size: 200 },
    ];
    const inp = input(s, ["export-manifest.yaml"], imgFiles);
    const result = generateFiles(inp);
    const f = getFile(result, "export-manifest.yaml");
    expect(f).toBeDefined();
    expect(f!.content).toContain("source_assets:");
    expect(f!.content).toContain("texture.png");
  });

  // export-manifest: source files but no image files
  it("export-manifest skips source assets when no image files", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["export-manifest.yaml"], ENTRY_POINTS);
    const result = generateFiles(inp);
    const f = getFile(result, "export-manifest.yaml");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("source_assets:");
  });

  // variation-matrix: source_file_count when files present
  it("variation-matrix includes source_file_count when files present", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["variation-matrix.json"], ENTRY_POINTS);
    const result = generateFiles(inp);
    const f = getFile(result, "variation-matrix.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_file_count).toBe(1);
  });

  // variation-matrix: no source files → null
  it("variation-matrix returns null source_file_count when no files", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["variation-matrix.json"]);
    const result = generateFiles(inp);
    const f = getFile(result, "variation-matrix.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_file_count).toBeNull();
  });
});

/* ─── SEO — uncovered branches ─────────────────────────────────── */

describe("seo generator — uncovered branches", () => {
  // content-audit: no SSR framework (hasSSR = false)
  it("content-audit shows critical SSR warning when no SSR framework", () => {
    const s = snapMinimal();
    const inp = input(s, ["content-audit.md"]);
    inp.context_map.detection.frameworks = [];
    const result = generateFiles(inp);
    const f = getFile(result, "content-audit.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("CRITICAL");
    expect(f!.content).toContain("No SSR framework detected");
  });

  // content-audit: no conventions (line ~670)
  it("content-audit shows conventions info when conventions empty", () => {
    const s = snapMinimal();
    const inp = input(s, ["content-audit.md"]);
    inp.context_map.ai_context.conventions = [];
    const result = generateFiles(inp);
    const f = getFile(result, "content-audit.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("No project conventions detected");
  });

  // content-audit: page files but no SSR → warning (line ~650)
  it("content-audit warns about page components without SSR", () => {
    const s = snapMinimal("seo-csr-app");
    const inp = input(s, ["content-audit.md"]);
    inp.context_map.detection.frameworks = [];
    // Add page files to file_tree_summary
    inp.context_map.structure.file_tree_summary = [
      { path: "src/pages/home.tsx", type: "file" as const, language: "TypeScript", loc: 50 },
      { path: "src/pages/about.tsx", type: "file" as const, language: "TypeScript", loc: 30 },
    ];
    const result = generateFiles(inp);
    const f = getFile(result, "content-audit.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("page components found but no SSR");
  });

  // content-audit: source files with page components (page component analysis)
  it("content-audit includes page component analysis from source files", () => {
    const s = snap({ files: BASIC_FILES });
    const pageFiles: SourceFile[] = [
      { path: "app/page.tsx", content: 'import { Metadata } from "next";\nexport const metadata: Metadata = { title: "Home" };\nexport default function Home() { return <h1>Home</h1>; }', size: 120 },
      { path: "app/about/page.tsx", content: 'export default function About() { return <h1>About</h1>; }', size: 60 },
    ];
    const inp = input(s, ["content-audit.md"], pageFiles);
    const result = generateFiles(inp);
    const f = getFile(result, "content-audit.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Page Component Analysis");
    expect(f!.content).toContain("app/page.tsx");
  });
});

/* ─── THEME — uncovered branches ───────────────────────────────── */

describe("theme generator — uncovered branches", () => {
  // design-tokens: no source files → null (line ~131 FALSE)
  it("design-tokens returns null source_theme_files when no files", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["design-tokens.json"]);
    const result = generateFiles(inp);
    const f = getFile(result, "design-tokens.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_theme_files).toBeNull();
  });

  // design-tokens: source files with theme files (TRUE branch)
  it("design-tokens includes source_theme_files when theme files present", () => {
    const s = snap({ files: BASIC_FILES });
    const themeFiles: SourceFile[] = [
      { path: "src/theme.css", content: ":root { --primary: blue; }\n", size: 30 },
      { path: "tailwind.config.js", content: "module.exports = { content: [] };\n", size: 35 },
    ];
    const inp = input(s, ["design-tokens.json"], themeFiles);
    const result = generateFiles(inp);
    const f = getFile(result, "design-tokens.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_theme_files).toBeDefined();
    expect(parsed.source_theme_files.length).toBe(2);
  });

  // theme-guidelines: no component files (line ~743)
  it("theme-guidelines skips component style usage when no component files", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["theme-guidelines.md"], CONFIG_FILES);
    const result = generateFiles(inp);
    const f = getFile(result, "theme-guidelines.md");
    expect(f).toBeDefined();
    // With only config files (no tsx/vue/svelte), component style section should be absent
    expect(f!.content).not.toContain("Component Style Usage");
  });

  // component-theme-map: no component source files (line ~851)
  it("component-theme-map returns null source_component_files when no tsx/vue files", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["component-theme-map.json"], CONFIG_FILES);
    const result = generateFiles(inp);
    const f = getFile(result, "component-theme-map.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_component_files).toBeNull();
  });

  // dark-mode-tokens: no dark/theme files in source (line ~965)
  it("dark-mode-tokens skips source theme files when none match", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["dark-mode-tokens.json"], ENTRY_POINTS);
    const result = generateFiles(inp);
    const f = getFile(result, "dark-mode-tokens.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    // source_dark_files should be null when no dark/theme files
    expect(parsed.source_dark_files === null || parsed.source_dark_files === undefined).toBe(true);
  });
});

/* ─── OBSIDIAN — uncovered branches ────────────────────────────── */

describe("obsidian generator — remaining uncovered branches", () => {
  // graph-prompt-map: minimal context (no frameworks, no abstractions, no entry points)
  it("graph-prompt-map has minimal nodes when context is empty", () => {
    const s = snapMinimal();
    const inp = input(s, ["graph-prompt-map.json"]);
    inp.context_map.detection.frameworks = [];
    inp.context_map.ai_context.key_abstractions = [];
    inp.context_map.entry_points = [];
    const result = generateFiles(inp);
    const f = getFile(result, "graph-prompt-map.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    // Should have project + architecture + 3 prompt nodes = 5 (no fw/abs/ep nodes)
    expect(parsed.total_nodes).toBe(5);
    expect(parsed.source_entry_points).toBeNull();
  });

  // graph-prompt-map: with source files including entry points
  it("graph-prompt-map includes source entry points when files present", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["graph-prompt-map.json"], ENTRY_POINTS);
    const result = generateFiles(inp);
    const f = getFile(result, "graph-prompt-map.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_entry_points).toBeDefined();
    expect(parsed.source_entry_points.length).toBeGreaterThan(0);
  });

  // linking-policy: no hotspots → hotspot table rows skipped (line ~508)
  it("linking-policy has code-to-vault section but no hotspot table when empty", () => {
    const s = snapMinimal();
    const inp = input(s, ["linking-policy.md"]);
    inp.context_map.dependency_graph.hotspots = [];
    const result = generateFiles(inp);
    const f = getFile(result, "linking-policy.md");
    expect(f).toBeDefined();
    // Section header always appears but the hotspot risk table is absent
    expect(f!.content).toContain("Code-to-Vault Mapping");
    expect(f!.content).not.toContain("| Code File | Risk");
  });

  // linking-policy: source files with entry points (TRUE branch)
  it("linking-policy includes source entry points as hub note candidates", () => {
    const s = snap({ files: BASIC_FILES });
    const inp = input(s, ["linking-policy.md"], ENTRY_POINTS);
    const result = generateFiles(inp);
    const f = getFile(result, "linking-policy.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Source Entry Points as Hub Note Candidates");
    expect(f!.content).toContain("src/index.ts");
  });

  // linking-policy: source files with no entry points (entries.length === 0)
  it("linking-policy skips hub note section when no entry points in source", () => {
    const s = snap({ files: BASIC_FILES });
    const noEntryFiles: SourceFile[] = [
      { path: "data/config.yaml", content: "key: value\n", size: 12 },
    ];
    const inp = input(s, ["linking-policy.md"], noEntryFiles);
    const result = generateFiles(inp);
    const f = getFile(result, "linking-policy.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("Hub Note Candidates");
  });
});
