import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput, SourceFile } from "./types.js";

/* ─── Fixture Helpers ──────────────────────────────────────────── */

function snap(opts: { name?: string; type?: string; files?: FileEntry[] } = {}): SnapshotRecord {
  const files = opts.files ?? [];
  return {
    snapshot_id: "snap-sf-001",
    project_id: "proj-sf-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "sf-test",
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
    { path: "src/utils/logger.ts", inbound_count: 5, outbound_count: 2, risk_score: 4.0 },
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

const ENTRY_POINT_FILES: SourceFile[] = [
  {
    path: "src/index.ts",
    content: 'import { startServer } from "./server";\nexport function main() {\n  return startServer(3000);\n}\nexport const VERSION = "1.0.0";\n',
    size: 110,
  },
  {
    path: "src/server.ts",
    content: 'import express from "express";\nexport function startServer(port: number) {\n  const app = express();\n  app.get("/health", (_, res) => res.json({ ok: true }));\n  return app.listen(port);\n}\nexport default startServer;\n',
    size: 200,
  },
  {
    path: "src/app.ts",
    content: 'export function bootstrap() {\n  console.log("bootstrap");\n}\n',
    size: 60,
  },
];

const HOTSPOT_FILES: SourceFile[] = [
  {
    path: "src/db/connection.ts",
    content: 'import { Pool } from "pg";\nexport const pool = new Pool();\nexport function query(sql: string) {\n  return pool.query(sql);\n}\nexport function disconnect() {\n  return pool.end();\n}\n',
    size: 170,
  },
  {
    path: "src/auth/middleware.ts",
    content: 'export function authMiddleware(req: any, res: any, next: any) {\n  const token = req.headers.authorization;\n  if (!token) return res.status(401).json({ error: "Unauthorized" });\n  next();\n}\nexport function requireRole(role: string) {\n  return (req: any, res: any, next: any) => next();\n}\n',
    size: 250,
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

const CONFIG_FILES: SourceFile[] = [
  { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true,"target":"es2022"}}', size: 52 },
  { path: ".eslintrc.json", content: '{"extends":["next/core-web-vitals"]}', size: 36 },
  { path: "vitest.config.ts", content: 'import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { globals: true } });\n', size: 100 },
];

const MARKDOWN_FILES: SourceFile[] = [
  { path: "README.md", content: "# Project\n\nA sample project.\n", size: 30 },
  { path: "docs/guide.md", content: "# Guide\n\nGetting started.\n", size: 25 },
  { path: "docs/api.md", content: "# API\n\nEndpoint reference.\n", size: 22 },
];

const IMAGE_FILES: SourceFile[] = [
  { path: "public/logo.png", content: "PNG_BINARY_DATA", size: 15000 },
  { path: "public/hero.jpg", content: "JPG_BINARY_DATA", size: 85000 },
  { path: "assets/icon.svg", content: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>', size: 65 },
  { path: "public/favicon.ico", content: "ICO_DATA", size: 4096 },
  { path: "assets/banner.webp", content: "WEBP_DATA", size: 120000 },
  { path: "docs/screenshot.gif", content: "GIF_DATA", size: 50000 },
];

const BRAND_ASSET_FILES: SourceFile[] = [
  { path: "assets/logo-dark.svg", content: '<svg><rect fill="#000"/></svg>', size: 40 },
  { path: "assets/brand-kit.png", content: "PNG_DATA", size: 20000 },
  { path: "public/icon-256.png", content: "PNG_DATA", size: 8000 },
];

const ALL_DEBUG_FILES: SourceFile[] = [...ENTRY_POINT_FILES, ...HOTSPOT_FILES, ...CONFIG_FILES];
const ALL_ARTIFACT_FILES: SourceFile[] = [...ENTRY_POINT_FILES, ...COMPONENT_FILES, ...CONFIG_FILES];
const ALL_OBSIDIAN_FILES: SourceFile[] = [...ENTRY_POINT_FILES, ...CONFIG_FILES, ...MARKDOWN_FILES];
const ALL_CANVAS_FILES: SourceFile[] = [...IMAGE_FILES, ...BRAND_ASSET_FILES, ...ENTRY_POINT_FILES];

const SNAPSHOT_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"test","dependencies":{"next":"14.0.0"},"devDependencies":{"typescript":"5.0.0","vitest":"1.0.0"}}', size: 110 },
  { path: "src/index.ts", content: 'export function main() {}', size: 25 },
];

/* ═══════════════════════════════════════════════════════════════
   generators-debug.ts — source file branches
   ═══════════════════════════════════════════════════════════════ */

describe("generators-debug.ts — source file branches", () => {
  const s = snap({ name: "debug-sf-app", files: SNAPSHOT_FILES });

  describe("generateDebugPlaybook with source files", () => {
    const inp = withHotspots(input(s, ["debug-playbook.md"], ALL_DEBUG_FILES));
    const result = generateFiles(inp);
    const f = getFile(result, "debug-playbook.md");

    it("produces a debug playbook", () => {
      expect(f).toBeDefined();
    });

    it("includes entry point source excerpts", () => {
      expect(f!.content).toContain("Entry Point Source (for tracing)");
      expect(f!.content).toContain("src/index.ts");
    });
  });

  describe("generateIncidentTemplate with source files", () => {
    const inp = withHotspots(input(s, ["incident-template.md"], ALL_DEBUG_FILES));
    const result = generateFiles(inp);
    const f = getFile(result, "incident-template.md");

    it("produces an incident template", () => {
      expect(f).toBeDefined();
    });

    it("includes suspect file excerpts from hotspots", () => {
      expect(f!.content).toContain("Suspect File Excerpts");
      expect(f!.content).toContain("src/db/connection.ts");
    });

    it("includes entry point excerpts", () => {
      expect(f!.content).toContain("Entry Point Excerpts");
      expect(f!.content).toContain("src/index.ts");
    });
  });

  describe("generateTracingRules with source files", () => {
    const inp = withHotspots(input(s, ["tracing-rules.md"], ALL_DEBUG_FILES));
    const result = generateFiles(inp);
    const f = getFile(result, "tracing-rules.md");

    it("produces tracing rules", () => {
      expect(f).toBeDefined();
    });

    it("includes trace-ready entry points table", () => {
      expect(f!.content).toContain("Trace-Ready Entry Points");
      expect(f!.content).toContain("| Entry Point | Exports |");
      expect(f!.content).toContain("src/index.ts");
    });

    it("includes entry point exports in table", () => {
      expect(f!.content).toMatch(/main|VERSION|startServer/);
    });

    it("includes entry point source excerpts", () => {
      expect(f!.content).toContain("Entry Point Source");
    });

    it("includes hotspot files to instrument", () => {
      expect(f!.content).toContain("Hotspot Files to Instrument");
      expect(f!.content).toContain("src/db/connection.ts");
    });
  });

  describe("generateRootCauseChecklist with source files", () => {
    const inp = withHotspots(input(s, ["root-cause-checklist.md"], ALL_DEBUG_FILES));
    const result = generateFiles(inp);
    const f = getFile(result, "root-cause-checklist.md");

    it("produces a root cause checklist", () => {
      expect(f).toBeDefined();
    });

    it("includes entry point source for isolation", () => {
      expect(f!.content).toContain("Entry Point Source (for Step 2 Isolation)");
    });

    it("includes suspect file excerpts for step 5", () => {
      expect(f!.content).toContain("Suspect File Excerpts (for Step 5)");
    });

    it("includes suspect file exports", () => {
      expect(f!.content).toContain("exports");
      expect(f!.content).toMatch(/pool|query|disconnect|authMiddleware|requireRole/);
    });

    it("includes suspect file source excerpts", () => {
      expect(f!.content).toContain("Suspect File Source");
    });
  });

  describe("debug generators without source files produce no source sections", () => {
    const inp = withHotspots(input(s, ["debug-playbook.md", "tracing-rules.md"], undefined));
    const result = generateFiles(inp);

    it("debug playbook has no entry point source section", () => {
      const f = getFile(result, "debug-playbook.md");
      expect(f).toBeDefined();
      expect(f!.content).not.toContain("Entry Point Source (for tracing)");
    });

    it("tracing rules has no trace-ready entry points", () => {
      const f = getFile(result, "tracing-rules.md");
      expect(f).toBeDefined();
      expect(f!.content).not.toContain("Trace-Ready Entry Points");
    });
  });
});

/* ═══════════════════════════════════════════════════════════════
   generators-artifacts.ts — source file branches
   ═══════════════════════════════════════════════════════════════ */

describe("generators-artifacts.ts — source file branches", () => {
  const s = snap({ name: "artifact-sf-app", files: SNAPSHOT_FILES });

  describe("generateComponent with source files", () => {
    const result = generateFiles(input(s, ["generated-component.tsx"], ALL_ARTIFACT_FILES));
    const f = getFile(result, "generated-component.tsx");

    it("produces a generated component", () => {
      expect(f).toBeDefined();
    });

    it("includes reference to existing components", () => {
      expect(f!.content).toContain("Reference: existing components found in project");
    });

    it("lists component exports", () => {
      expect(f!.content).toMatch(/Header|Footer/);
    });
  });

  describe("generateDashboardWidget with source files", () => {
    const result = generateFiles(input(s, ["dashboard-widget.tsx"], ALL_ARTIFACT_FILES));
    const f = getFile(result, "dashboard-widget.tsx");

    it("produces a dashboard widget", () => {
      expect(f).toBeDefined();
    });

    it("includes source file metrics comment", () => {
      expect(f!.content).toContain("Source file metrics");
      expect(f!.content).toContain("Total source files scanned:");
    });

    it("lists config files found", () => {
      expect(f!.content).toContain("Config files:");
      expect(f!.content).toMatch(/tsconfig\.json|\.eslintrc|vitest\.config/);
    });
  });

  describe("generateEmbedSnippet with source files", () => {
    const result = generateFiles(input(s, ["embed-snippet.ts"], ALL_ARTIFACT_FILES));
    const f = getFile(result, "embed-snippet.ts");

    it("produces an embed snippet", () => {
      expect(f).toBeDefined();
    });

    it("includes ENTRY_POINTS const array", () => {
      expect(f!.content).toContain("export const ENTRY_POINTS = [");
    });

    it("includes entry point paths in array", () => {
      expect(f!.content).toContain("src/index.ts");
    });

    it("includes exports for entry points", () => {
      expect(f!.content).toContain("exports");
    });
  });

  describe("generateArtifactSpec with source files", () => {
    const result = generateFiles(input(s, ["artifact-spec.md"], ALL_ARTIFACT_FILES));
    const f = getFile(result, "artifact-spec.md");

    it("produces an artifact spec", () => {
      expect(f).toBeDefined();
    });

    it("includes source entry points table", () => {
      expect(f!.content).toContain("Source Entry Points");
      expect(f!.content).toContain("| File | Exports |");
    });

    it("includes component signatures section", () => {
      expect(f!.content).toContain("Component Signatures");
      expect(f!.content).toMatch(/Header|Footer/);
    });
  });
});

/* ═══════════════════════════════════════════════════════════════
   generators-obsidian.ts — source file branches
   ═══════════════════════════════════════════════════════════════ */

describe("generators-obsidian.ts — source file branches", () => {
  const s = snap({ name: "obsidian-sf-app", files: SNAPSHOT_FILES });

  describe("generateObsidianSkillPack with source files", () => {
    const result = generateFiles(input(s, ["obsidian-skill-pack.md"], ALL_OBSIDIAN_FILES));
    const f = getFile(result, "obsidian-skill-pack.md");

    it("produces a skill pack", () => {
      expect(f).toBeDefined();
    });

    it("includes detected config files section", () => {
      expect(f!.content).toContain("Detected Config Files for Vault Import");
      expect(f!.content).toMatch(/tsconfig\.json|\.eslintrc|vitest\.config/);
    });
  });

  describe("generateVaultRules with source files", () => {
    const result = generateFiles(input(s, ["vault-rules.md"], ALL_OBSIDIAN_FILES));
    const f = getFile(result, "vault-rules.md");

    it("produces vault rules", () => {
      expect(f).toBeDefined();
    });

    it("includes existing markdown files section", () => {
      expect(f!.content).toContain("Existing Markdown Files");
      expect(f!.content).toMatch(/\d+ markdown files/);
    });
  });

  describe("generateGraphPromptMap with source files", () => {
    const result = generateFiles(input(s, ["graph-prompt-map.json"], ALL_OBSIDIAN_FILES));
    const f = getFile(result, "graph-prompt-map.json");

    it("produces a graph prompt map", () => {
      expect(f).toBeDefined();
    });

    it("includes source file count in JSON", () => {
      const parsed = JSON.parse(f!.content);
      expect(parsed.source_file_count).toBe(ALL_OBSIDIAN_FILES.length);
    });

    it("includes source entry points in JSON", () => {
      const parsed = JSON.parse(f!.content);
      expect(parsed.source_entry_points).toBeDefined();
      expect(parsed.source_entry_points.length).toBeGreaterThan(0);
      expect(parsed.source_entry_points[0].path).toContain("src/index.ts");
    });
  });

  describe("generateLinkingPolicy with source files", () => {
    const result = generateFiles(input(s, ["linking-policy.md"], ALL_OBSIDIAN_FILES));
    const f = getFile(result, "linking-policy.md");

    it("produces a linking policy", () => {
      expect(f).toBeDefined();
    });

    it("includes source entry points as hub note candidates", () => {
      expect(f!.content).toContain("Source Entry Points as Hub Note Candidates");
      expect(f!.content).toContain("src/index.ts");
      expect(f!.content).toMatch(/exports:/);
    });
  });
});

/* ═══════════════════════════════════════════════════════════════
   generators-canvas.ts — source file branches
   ═══════════════════════════════════════════════════════════════ */

describe("generators-canvas.ts — source file branches", () => {
  const s = snap({ name: "canvas-sf-app", files: SNAPSHOT_FILES });

  describe("generateCanvasSpec with source files", () => {
    const result = generateFiles(input(s, ["canvas-spec.json"], ALL_CANVAS_FILES));
    const f = getFile(result, "canvas-spec.json");

    it("produces a canvas spec", () => {
      expect(f).toBeDefined();
    });

    it("includes source asset files in JSON", () => {
      const parsed = JSON.parse(f!.content);
      expect(parsed.source_asset_files).toBeDefined();
      expect(parsed.source_asset_files.length).toBeGreaterThan(0);
      expect(parsed.source_asset_files).toContain("public/logo.png");
    });
  });

  describe("generateSocialPack with source files", () => {
    const result = generateFiles(input(s, ["social-pack.md"], ALL_CANVAS_FILES));
    const f = getFile(result, "social-pack.md");

    it("produces a social pack", () => {
      expect(f).toBeDefined();
    });

    it("includes available brand assets section", () => {
      expect(f!.content).toContain("Available Brand Assets");
      expect(f!.content).toContain("public/logo.png");
      expect(f!.content).toContain("public/hero.jpg");
    });
  });

  describe("generatePosterLayouts with source files", () => {
    const result = generateFiles(input(s, ["poster-layouts.md"], ALL_CANVAS_FILES));
    const f = getFile(result, "poster-layouts.md");

    it("produces poster layouts", () => {
      expect(f).toBeDefined();
    });

    it("includes detected image assets", () => {
      expect(f!.content).toContain("Detected Image Assets");
      expect(f!.content).toContain("public/logo.png");
    });

    it("includes file sizes", () => {
      expect(f!.content).toMatch(/\d+ bytes/);
    });
  });

  describe("generateCanvasAssetGuidelines with source files", () => {
    const result = generateFiles(input(s, ["asset-guidelines.md"], ALL_CANVAS_FILES));
    const f = getFile(result, "asset-guidelines.md");

    it("produces asset guidelines", () => {
      expect(f).toBeDefined();
    });

    it("includes detected assets table", () => {
      expect(f!.content).toContain("Detected Assets in Repo");
      expect(f!.content).toContain("| File | Size |");
    });

    it("includes asset paths and sizes in table", () => {
      expect(f!.content).toContain("public/logo.png");
      expect(f!.content).toMatch(/\d+ bytes/);
    });
  });

  describe("generateBrandBoard with source files", () => {
    const result = generateFiles(input(s, ["brand-board.md"], ALL_CANVAS_FILES));
    const f = getFile(result, "brand-board.md");

    it("produces a brand board", () => {
      expect(f).toBeDefined();
    });

    it("includes detected brand assets section", () => {
      expect(f!.content).toContain("Detected Brand Assets");
    });

    it("lists brand-related files", () => {
      expect(f!.content).toMatch(/logo|brand|icon/i);
    });
  });

  describe("canvas generators without source files produce no asset sections", () => {
    const result = generateFiles(input(s, ["social-pack.md", "poster-layouts.md"], undefined));

    it("social pack has no brand assets section", () => {
      const f = getFile(result, "social-pack.md");
      expect(f).toBeDefined();
      expect(f!.content).not.toContain("Available Brand Assets");
    });

    it("poster layouts has no detected image assets", () => {
      const f = getFile(result, "poster-layouts.md");
      expect(f).toBeDefined();
      expect(f!.content).not.toContain("Detected Image Assets");
    });
  });
});
