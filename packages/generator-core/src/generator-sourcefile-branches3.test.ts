import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput, SourceFile } from "./types.js";

/* ─── Fixture Helpers ──────────────────────────────────────────── */

function snap(opts: { name?: string; type?: string; files?: FileEntry[] } = {}): SnapshotRecord {
  const files = opts.files ?? [];
  return {
    snapshot_id: "snap-sf3-001",
    project_id: "proj-sf3-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "sf3-test",
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

function input(s: SnapshotRecord, requested: string[], sourceFiles?: SourceFile[]): GeneratorInput {
  return {
    context_map: buildContextMap(s),
    repo_profile: buildRepoProfile(s),
    requested_outputs: requested,
    source_files: sourceFiles,
  };
}

function withHotspots(inp: GeneratorInput): GeneratorInput {
  inp.context_map.dependency_graph.hotspots = [
    { path: "src/db/connection.ts", inbound_count: 12, outbound_count: 3, risk_score: 9.1 },
    { path: "src/auth/middleware.ts", inbound_count: 8, outbound_count: 6, risk_score: 7.3 },
  ];
  inp.context_map.entry_points = [
    { path: "src/index.ts", type: "app_entry", description: "Main entry" },
    { path: "src/server.ts", type: "server", description: "HTTP server" },
  ];
  return inp;
}

function getFile(result: ReturnType<typeof generateFiles>, path: string) {
  return result.files.find(f => f.path === path);
}

/* ─── Source File Fixtures ─────────────────────────────────────── */

const SNAPSHOT_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"test","dependencies":{"next":"14.0.0"},"devDependencies":{"typescript":"5.0.0","vitest":"1.0.0"}}', size: 110 },
  { path: "src/index.ts", content: 'export function main() {}', size: 25 },
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

const COMPONENT_FILES: SourceFile[] = [
  {
    path: "src/components/Header.tsx",
    content: 'import React from "react";\nexport function Header({ title }: { title: string }) {\n  return <header><h1>{title}</h1></header>;\n}\nexport default Header;\n',
    size: 150,
  },
  {
    path: "src/components/Footer.tsx",
    content: 'export function Footer() {\n  return <footer>© 2024</footer>;\n}\nexport default Footer;\n',
    size: 80,
  },
  {
    path: "src/components/Sidebar.vue",
    content: '<template><nav><slot /></nav></template>\n<script setup lang="ts">\nimport { ref } from "vue";\nconst collapsed = ref(false);\n</script>\n',
    size: 120,
  },
];

const STYLE_FILES: SourceFile[] = [
  { path: "src/styles/global.css", content: "body { margin: 0; }\n.container { max-width: 1200px; }\n", size: 50 },
  { path: "src/styles/theme.scss", content: "$primary: #3b82f6;\n.btn { background: $primary; }\n", size: 45 },
  { path: "tailwind.config.ts", content: 'export default { content: ["./src/**/*.tsx"], theme: { extend: {} } };\n', size: 70 },
];

/* ─── DEBUG GENERATOR BRANCHES ─────────────────────────────────── */

describe("debug generator — uncovered branches", () => {
  // debug-playbook: test_frameworks branch (line ~90)
  it("debug-playbook includes test framework commands when test_frameworks present", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = withHotspots(input(s, ["debug-playbook.md"], ENTRY_POINTS));
    inp.context_map.detection.test_frameworks = ["vitest", "jest"];
    const result = generateFiles(inp);
    const f = getFile(result, "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("vitest, jest");
  });

  // debug-playbook: deployment_target vercel branch (line ~325)
  it("debug-playbook includes vercel deployment notes when deployment_target is vercel", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = withHotspots(input(s, ["debug-playbook.md"], ENTRY_POINTS));
    inp.context_map.detection.deployment_target = "vercel";
    const result = generateFiles(inp);
    const f = getFile(result, "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Build logs");
    expect(f!.content).toContain("Edge functions");
    expect(f!.content).toContain("Cache invalidation");
  });

  // debug-playbook: deployment_target lambda branch (line ~329)
  it("debug-playbook includes lambda deployment notes when deployment_target is lambda", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = withHotspots(input(s, ["debug-playbook.md"], ENTRY_POINTS));
    inp.context_map.detection.deployment_target = "lambda";
    const result = generateFiles(inp);
    const f = getFile(result, "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Cold starts");
    expect(f!.content).toContain("Memory limits");
    expect(f!.content).toContain("Connection pooling");
  });

  // debug-playbook: deployment_target serverless branch
  it("debug-playbook includes serverless notes when deployment_target is serverless", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = withHotspots(input(s, ["debug-playbook.md"], ENTRY_POINTS));
    inp.context_map.detection.deployment_target = "serverless";
    const result = generateFiles(inp);
    const f = getFile(result, "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Cold starts");
  });

  // incident-template: ci_platform branch (line ~400)
  it("incident-template includes CI row when ci_platform is set", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["incident-template.md"], ENTRY_POINTS);
    inp.context_map.detection.ci_platform = "GitHub Actions";
    const result = generateFiles(inp);
    const f = getFile(result, "incident-template.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("GitHub Actions");
  });

  // incident-template: deployment_target branch (line ~401)
  it("incident-template includes deployment row when deployment_target is set", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["incident-template.md"], ENTRY_POINTS);
    inp.context_map.detection.deployment_target = "aws-lambda";
    const result = generateFiles(inp);
    const f = getFile(result, "incident-template.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("aws-lambda");
  });

  // incident-template: go_module branch (line ~402)
  it("incident-template includes Go Module row when go_module is set", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["incident-template.md"], ENTRY_POINTS);
    inp.context_map.project_identity.go_module = "github.com/org/app";
    const result = generateFiles(inp);
    const f = getFile(result, "incident-template.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("github.com/org/app");
  });

  // root-cause-checklist: sql_schema with foreign keys (line ~907-913)
  it("root-cause-checklist includes DB table integrity when sql_schema has entries", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = withHotspots(input(s, ["root-cause-checklist.md"], ENTRY_POINTS));
    inp.context_map.sql_schema = [
      { name: "users", column_count: 8, foreign_key_count: 2 },
      { name: "orders", column_count: 5, foreign_key_count: 3 },
    ];
    const result = generateFiles(inp);
    const f = getFile(result, "root-cause-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Database Table Integrity");
    expect(f!.content).toContain("users");
    expect(f!.content).toContain("2 FK constraints");
    expect(f!.content).toContain("orders");
    expect(f!.content).toContain("3 FK constraints");
  });

  // root-cause-checklist: test_frameworks in verification step (line ~937)
  it("root-cause-checklist includes test verification when test_frameworks present", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = withHotspots(input(s, ["root-cause-checklist.md"], ENTRY_POINTS));
    inp.context_map.detection.test_frameworks = ["vitest"];
    const result = generateFiles(inp);
    const f = getFile(result, "root-cause-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Do all existing tests still pass");
  });

  // root-cause-checklist: ci_platform in verification step (line ~945)
  it("root-cause-checklist includes CI verification when ci_platform is set", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = withHotspots(input(s, ["root-cause-checklist.md"], ENTRY_POINTS));
    inp.context_map.detection.ci_platform = "CircleCI";
    const result = generateFiles(inp);
    const f = getFile(result, "root-cause-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Does CI pass");
    expect(f!.content).toContain("CircleCI");
  });

  // root-cause-checklist: go_module in verification (line ~939)
  it("root-cause-checklist includes go test verification when go_module is set", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["root-cause-checklist.md"], ENTRY_POINTS);
    inp.context_map.project_identity.go_module = "github.com/org/service";
    const result = generateFiles(inp);
    const f = getFile(result, "root-cause-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("go test ./...");
  });
});

/* ─── NOTEBOOK GENERATOR BRANCHES ──────────────────────────────── */

describe("notebook generator — uncovered branches", () => {
  // notebook-summary: entry points table (line ~120)
  it("notebook-summary includes entry point source table when files have entry points", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["notebook-summary.md"], ENTRY_POINTS);
    const result = generateFiles(inp);
    const f = getFile(result, "notebook-summary.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Entry Point Source");
    expect(f!.content).toContain("src/index.ts");
  });

  // study-brief: build_tools branch (line ~220)
  it("study-brief includes build tools when build_tools present", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["study-brief.md"], ENTRY_POINTS);
    inp.context_map.detection.build_tools = ["webpack", "esbuild"];
    const result = generateFiles(inp);
    const f = getFile(result, "study-brief.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Build tools");
    expect(f!.content).toContain("webpack, esbuild");
  });

  // research-threads: entry point complexity thread (line ~456-469)
  it("research-threads includes entry point complexity thread when files have entry points", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["research-threads.md"], ENTRY_POINTS);
    const result = generateFiles(inp);
    const f = getFile(result, "research-threads.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Entry Point Complexity");
    expect(f!.content).toContain("src/index.ts");
  });

  // citation-index: source_entry_points (line ~585)
  it("citation-index includes source_entry_points when files have entry points", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["citation-index.json"], ENTRY_POINTS);
    const result = generateFiles(inp);
    const f = getFile(result, "citation-index.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_entry_points).not.toBeNull();
    expect(parsed.source_entry_points.length).toBeGreaterThan(0);
    expect(parsed.source_entry_points[0].path).toBe("src/index.ts");
    expect(parsed.source_entry_points[0].exports.some((e: string) => e.includes("main"))).toBe(true);
  });
});

/* ─── SEO GENERATOR BRANCHES ──────────────────────────────────── */

describe("seo generator — uncovered branches", () => {
  const SEO_META_FILES: SourceFile[] = [
    { path: "public/sitemap.xml", content: '<?xml version="1.0"?>\n<urlset>\n<url><loc>https://example.com/</loc></url>\n</urlset>\n', size: 80 },
    { path: "public/robots.txt", content: "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n", size: 55 },
  ];

  const PAGE_FILES: SourceFile[] = [
    {
      path: "app/page.tsx",
      content: 'export const metadata = { title: "Home" };\nexport default function Home() {\n  return <div>Home</div>;\n}\n',
      size: 90,
    },
    {
      path: "app/about/page.tsx",
      content: 'export default function About() {\n  return <div>About</div>;\n}\n',
      size: 60,
    },
    {
      path: "pages/index.html",
      content: '<html><head><title>Landing</title></head><body><h1>Welcome</h1></body></html>\n',
      size: 75,
    },
  ];

  const ROUTE_FILES: SourceFile[] = [
    {
      path: "app/api/route.ts",
      content: 'export async function GET() {\n  return Response.json({ ok: true });\n}\nexport async function POST() {\n  return Response.json({ created: true });\n}\n',
      size: 110,
    },
    {
      path: "src/controllers/userController.ts",
      content: 'export function getUsers() { return []; }\nexport function createUser() { return {}; }\n',
      size: 80,
    },
  ];

  const CONTENT_FILES: SourceFile[] = [
    { path: "docs/guide.md", content: "# Guide\n\nGetting started with the app.\n", size: 35 },
    { path: "content/blog/hello.mdx", content: "---\ntitle: Hello\n---\n\n# Hello World\n", size: 35 },
  ];

  // seo-rules: meta files (sitemap, robots) detection (line ~144-160)
  it("seo-rules includes detected SEO files when sitemap/robots present", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["seo-rules.md"], [...SEO_META_FILES, ...PAGE_FILES]);
    const result = generateFiles(inp);
    const f = getFile(result, "seo-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Detected SEO Files");
    expect(f!.content).toContain("sitemap.xml");
    expect(f!.content).toContain("robots.txt");
  });

  // seo-rules: page files detection (line ~160-170)
  it("seo-rules includes detected page files table", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["seo-rules.md"], PAGE_FILES);
    const result = generateFiles(inp);
    const f = getFile(result, "seo-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Detected Page Files");
    expect(f!.content).toContain("app/page.tsx");
  });

  // schema-recommendations: source_page_files (line ~283-290)
  it("schema-recommendations includes source_page_files when page files present", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["schema-recommendations.json"], PAGE_FILES);
    // Need routes for schema recommendations
    inp.context_map.routes = [
      { path: "/", method: "GET", handler: "Home", middleware: [] },
      { path: "/blog/hello", method: "GET", handler: "BlogPost", middleware: [] },
    ];
    const result = generateFiles(inp);
    const f = getFile(result, "schema-recommendations.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_page_files).not.toBeNull();
    expect(parsed.source_page_files.length).toBeGreaterThan(0);
  });

  // route-priority-map: API routes section (line ~377-390)
  it("route-priority-map includes API routes excluded section", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["route-priority-map.md"], ROUTE_FILES);
    inp.context_map.routes = [
      { path: "/", method: "GET", handler: "Home", middleware: [] },
      { path: "/api/users", method: "GET", handler: "getUsers", middleware: [] },
      { path: "/api/users", method: "POST", handler: "createUser", middleware: [] },
    ];
    const result = generateFiles(inp);
    const f = getFile(result, "route-priority-map.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("API Routes (Excluded)");
    expect(f!.content).toContain("/api/users");
  });

  // route-priority-map: route handler files + exemplar (line ~424-435)
  it("route-priority-map includes route handler files from source files", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["route-priority-map.md"], ROUTE_FILES);
    inp.context_map.routes = [
      { path: "/", method: "GET", handler: "Home", middleware: [] },
    ];
    const result = generateFiles(inp);
    const f = getFile(result, "route-priority-map.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Route Handler Files");
    expect(f!.content).toContain("app/api/route.ts");
  });

  // content-audit: content files + page component analysis (line ~601-624)
  it("content-audit includes detected content files and page component analysis", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const allFiles = [...CONTENT_FILES, ...PAGE_FILES];
    const inp = input(s, ["content-audit.md"], allFiles);
    const result = generateFiles(inp);
    const f = getFile(result, "content-audit.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Detected Content Files");
    expect(f!.content).toContain("guide.md");
    // Page component analysis
    expect(f!.content).toContain("Page Component Analysis");
    expect(f!.content).toContain("Has Meta");
  });

  // content-audit: page component with metadata detection
  it("content-audit detects metadata presence in page components", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["content-audit.md"], PAGE_FILES);
    const result = generateFiles(inp);
    const f = getFile(result, "content-audit.md");
    expect(f).toBeDefined();
    // app/page.tsx has "metadata" in content → should show "Yes"
    expect(f!.content).toContain("Yes");
    // app/about/page.tsx has no metadata → should show "Missing"
    expect(f!.content).toContain("**Missing**");
  });

  // meta-tag-audit: source_meta_scan (line ~717-723)
  it("meta-tag-audit includes source_meta_scan when page/index/layout files present", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const metaPages: SourceFile[] = [
      {
        path: "app/page.tsx",
        content: 'export const metadata = { title: "Home", description: "Welcome" };\nexport default function Home() { return <div />; }\n',
        size: 100,
      },
      {
        path: "app/layout.tsx",
        content: 'import { generateMetadata } from "next";\nexport default function Layout({ children }: any) { return <html><body>{children}</body></html>; }\n',
        size: 120,
      },
    ];
    const inp = input(s, ["meta-tag-audit.json"], metaPages);
    inp.context_map.routes = [
      { path: "/", method: "GET", handler: "Home", middleware: [] },
    ];
    const result = generateFiles(inp);
    const f = getFile(result, "meta-tag-audit.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_meta_scan).not.toBeNull();
    expect(parsed.source_meta_scan.length).toBeGreaterThan(0);
    // First page has "metadata" and "description"
    const pageScan = parsed.source_meta_scan.find((s: any) => s.path === "app/page.tsx");
    expect(pageScan).toBeDefined();
    expect(pageScan.has_title).toBe(true);
    expect(pageScan.has_description).toBe(true);
  });
});

/* ─── MCP GENERATOR BRANCHES ──────────────────────────────────── */

describe("mcp generator — uncovered branches", () => {
  const MCP_FILES: SourceFile[] = [
    {
      path: ".mcp.json",
      content: '{"tools":["analyze","generate"],"version":"1.0"}',
      size: 50,
    },
    {
      path: "src/mcp-server.ts",
      content: 'export function handleTool(name: string) { return {}; }\nexport function listTools() { return []; }\n',
      size: 90,
    },
  ];

  const SERVER_FILES: SourceFile[] = [
    {
      path: "src/server.ts",
      content: 'import express from "express";\nexport function createServer() {\n  return express();\n}\nexport default createServer;\n',
      size: 100,
    },
    {
      path: "src/handler.ts",
      content: 'export function handleRequest(req: any) {\n  return { status: 200 };\n}\n',
      size: 70,
    },
  ];

  const CI_FILES: SourceFile[] = [
    { path: ".github/workflows/ci.yml", content: 'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n', size: 60 },
    { path: "Dockerfile", content: 'FROM node:20\nWORKDIR /app\nCOPY . .\nRUN npm install\n', size: 55 },
  ];

  const PKG_WITH_SCRIPTS: SourceFile = {
    path: "package.json",
    content: '{"name":"myapp","version":"1.0.0","scripts":{"build":"tsc","test":"vitest","dev":"next dev","lint":"eslint .","start":"node dist/index.js"}}',
    size: 140,
  };

  // mcp-config: detected_mcp_files (line ~149)
  it("mcp-config includes detected_mcp_files when .mcp* files present", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["mcp-config.json"], MCP_FILES);
    const result = generateFiles(inp);
    const f = getFile(result, "mcp-config.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.detected_mcp_files).not.toBeNull();
    expect(parsed.detected_mcp_files.length).toBeGreaterThan(0);
    expect(parsed.detected_mcp_files[0].path).toBe(".mcp.json");
  });

  // connector-map: ci_platform connector (line ~287-298)
  it("connector-map includes CI connector when ci_platform is set", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["connector-map.yaml"], CI_FILES);
    inp.context_map.detection.ci_platform = "GitHub Actions";
    const result = generateFiles(inp);
    const f = getFile(result, "connector-map.yaml");
    expect(f).toBeDefined();
    expect(f!.content).toContain("ci_github_actions");
    expect(f!.content).toContain("build_and_test");
  });

  // connector-map: detected CI/Deployment files from source (line ~299)
  it("connector-map includes detected CI/Deployment files from source", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["connector-map.yaml"], CI_FILES);
    const result = generateFiles(inp);
    const f = getFile(result, "connector-map.yaml");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Detected CI/Deployment Files");
    expect(f!.content).toContain(".github/workflows/ci.yml");
  });

  // capability-registry: source_scripts from package.json (line ~440-445)
  it("capability-registry includes source_scripts when package.json has scripts", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["capability-registry.json"], [PKG_WITH_SCRIPTS]);
    const result = generateFiles(inp);
    const f = getFile(result, "capability-registry.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_scripts).not.toBeNull();
    expect(parsed.source_scripts.length).toBeGreaterThan(0);
  });

  // server-manifest: server/handler files (line ~595-604)
  it("server-manifest includes detected server/tool files from source", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["server-manifest.yaml"], SERVER_FILES);
    const result = generateFiles(inp);
    const f = getFile(result, "server-manifest.yaml");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Detected Server/Tool Files");
    expect(f!.content).toContain("src/server.ts");
    expect(f!.content).toContain("src/handler.ts");
  });
});

/* ─── ALGORITHMIC GENERATOR BRANCHES ───────────────────────────── */

describe("algorithmic generator — uncovered branches", () => {
  const IMAGE_FILES: SourceFile[] = [
    { path: "assets/logo.png", content: "PNG_DATA", size: 15000 },
    { path: "assets/hero.jpg", content: "JPG_DATA", size: 85000 },
    { path: "assets/icon.svg", content: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>', size: 65 },
    { path: "assets/bg.webp", content: "WEBP_DATA", size: 120000 },
    { path: "assets/anim.gif", content: "GIF_DATA", size: 50000 },
  ];

  // generative-sketch: source file tree (line ~98/173)
  it("generative-sketch includes source file tree when files present", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["generative-sketch.ts"], ENTRY_POINTS);
    const result = generateFiles(inp);
    const f = getFile(result, "generative-sketch.ts");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Source File Tree");
    // fileTree returns a string; tree.slice(0,20) iterates chars, so paths appear char-by-char
    expect(f!.content).toContain("// s");
  });

  // export-manifest: source_assets (line ~514-521)
  it("export-manifest includes source_assets when image files present", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["export-manifest.yaml"], IMAGE_FILES);
    const result = generateFiles(inp);
    const f = getFile(result, "export-manifest.yaml");
    expect(f).toBeDefined();
    expect(f!.content).toContain("source_assets");
    expect(f!.content).toContain("assets/logo.png");
    expect(f!.content).toContain("assets/hero.jpg");
  });

  // variation-matrix: source_file_count (line ~669)
  it("variation-matrix includes source_file_count when files present", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["variation-matrix.json"], [...ENTRY_POINTS, ...IMAGE_FILES]);
    const result = generateFiles(inp);
    const f = getFile(result, "variation-matrix.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_file_count).toBe(7);
  });
});

/* ─── THEME GENERATOR BRANCHES ─────────────────────────────────── */

describe("theme generator — uncovered branches", () => {
  const THEME_FILES: SourceFile[] = [
    { path: "src/styles/theme.ts", content: 'export const theme = { primary: "#3b82f6", secondary: "#10b981" };\n', size: 70 },
    { path: "src/tokens.json", content: '{"colors":{"primary":"#3b82f6"}}\n', size: 35 },
    { path: "src/styles/global.css", content: ":root {\n  --primary: #3b82f6;\n  --bg: white;\n}\n", size: 45 },
  ];

  const DARK_FILES: SourceFile[] = [
    { path: "src/styles/dark-mode.css", content: ".dark {\n  --bg: #1a1a2e;\n  --text: #e0e0e0;\n}\n", size: 40 },
    { path: "src/styles/colors.scss", content: "$dark-bg: #1a1a2e;\n$dark-text: #e0e0e0;\n", size: 35 },
  ];

  // design-tokens: source_theme_files (line ~148-155)
  it("design-tokens includes source_theme_files when theme/token files present", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["design-tokens.json"], THEME_FILES);
    const result = generateFiles(inp);
    const f = getFile(result, "design-tokens.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_theme_files).not.toBeNull();
    expect(parsed.source_theme_files.length).toBeGreaterThan(0);
    expect(parsed.source_theme_files).toContain("src/styles/theme.ts");
  });

  // theme.css: detected style files comment (line ~411-420)
  it("theme.css includes detected style files comment when CSS files present", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["theme.css"], STYLE_FILES);
    const result = generateFiles(inp);
    const f = getFile(result, "theme.css");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Detected Style Files");
    expect(f!.content).toContain("src/styles/global.css");
    expect(f!.content).toContain("src/styles/theme.scss");
  });

  // theme-guidelines: style files + component style usage (line ~731-740)
  it("theme-guidelines includes style files and component style usage", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const allFiles = [...STYLE_FILES, ...COMPONENT_FILES];
    const inp = input(s, ["theme-guidelines.md"], allFiles);
    const result = generateFiles(inp);
    const f = getFile(result, "theme-guidelines.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Detected Style Files");
    expect(f!.content).toContain("Component Style Usage");
    expect(f!.content).toContain("src/components/Header.tsx");
  });

  // component-theme-map: source_component_files (line ~849-852)
  it("component-theme-map includes source_component_files when component files present", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["component-theme-map.json"], COMPONENT_FILES);
    const result = generateFiles(inp);
    const f = getFile(result, "component-theme-map.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_component_files).not.toBeNull();
    expect(parsed.source_component_files.length).toBeGreaterThan(0);
    expect(parsed.source_component_files).toContain("src/components/Header.tsx");
  });

  // dark-mode-tokens: source_theme_files (line ~964-966)
  it("dark-mode-tokens includes source_theme_files when dark/theme/color files present", () => {
    const s = snap({ files: SNAPSHOT_FILES });
    const inp = input(s, ["dark-mode-tokens.json"], [...DARK_FILES, ...THEME_FILES]);
    const result = generateFiles(inp);
    const f = getFile(result, "dark-mode-tokens.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_theme_files).not.toBeNull();
    expect(parsed.source_theme_files.length).toBeGreaterThan(0);
    expect(parsed.source_theme_files).toContain("src/styles/dark-mode.css");
  });
});
