import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput, SourceFile } from "./types.js";

/* ─── Fixture Helpers ──────────────────────────────────────────── */

function snap(opts: { name?: string; type?: string; files?: FileEntry[] } = {}): SnapshotRecord {
  const files = opts.files ?? [];
  return {
    snapshot_id: "snap-sf2-001",
    project_id: "proj-sf2-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "sf2-test",
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

const MEDIA_FILES: SourceFile[] = [
  { path: "assets/intro.mp4", content: "MP4_DATA", size: 500000 },
  { path: "assets/clip.webm", content: "WEBM_DATA", size: 200000 },
  { path: "assets/logo.png", content: "PNG_DATA", size: 15000 },
  { path: "assets/hero.jpg", content: "JPG_DATA", size: 85000 },
  { path: "assets/icon.svg", content: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>', size: 65 },
  { path: "assets/anim.gif", content: "GIF_DATA", size: 50000 },
  { path: "assets/bg.webp", content: "WEBP_DATA", size: 120000 },
  { path: "assets/tune.mp3", content: "MP3_DATA", size: 300000 },
  { path: "assets/click.wav", content: "WAV_DATA", size: 450000 },
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

const LAYOUT_FILES: SourceFile[] = [
  {
    path: "app/layout.tsx",
    content: 'export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html><body>{children}</body></html>;\n}\n',
    size: 125,
  },
  {
    path: "src/layouts/DashboardLayout.tsx",
    content: 'export function DashboardLayout({ children }: { children: React.ReactNode }) {\n  return <div className="dashboard">{children}</div>;\n}\nexport default DashboardLayout;\n',
    size: 160,
  },
];

const DOC_FILES: SourceFile[] = [
  { path: "README.md", content: "# MyApp\n\nA blazing fast web framework for building modern apps.\n", size: 62 },
  { path: "CONTRIBUTING.md", content: "# Contributing\n\nFork the repo and submit a PR.\n", size: 45 },
  { path: "docs/guide.md", content: "# Guide\n\nGetting started.\n", size: 25 },
  { path: "CHANGELOG.md", content: "# Changelog\n\n## 1.0.0\n- Initial release\n", size: 42 },
];

const CONFIG_FILES: SourceFile[] = [
  { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
  { path: ".eslintrc.json", content: '{"extends":["next/core-web-vitals"]}', size: 36 },
  { path: "vitest.config.ts", content: 'import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { globals: true } });\n', size: 100 },
];

const PKG_JSON: SourceFile = {
  path: "package.json",
  content: '{"name":"myapp","version":"1.0.0","description":"A blazing fast framework","keywords":["web","framework","fast"],"main":"dist/index.js"}',
  size: 140,
};

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

const HOTSPOT_FILES: SourceFile[] = [
  {
    path: "src/db/connection.ts",
    content: 'import { Pool } from "pg";\nexport const pool = new Pool();\nexport function query(sql: string) {\n  return pool.query(sql);\n}\nexport function disconnect() {\n  return pool.end();\n}\n',
    size: 170,
  },
  {
    path: "src/auth/middleware.ts",
    content: 'export function authMiddleware(req: any, res: any, next: any) {\n  const token = req.headers.authorization;\n  if (!token) return res.status(401).json({ error: "Unauthorized" });\n  next();\n}\n',
    size: 180,
  },
];

const TEST_FILES: SourceFile[] = [
  { path: "src/utils.test.ts", content: 'import { describe, it, expect } from "vitest";\ndescribe("utils", () => {\n  it("works", () => { expect(1).toBe(1); });\n});\n', size: 100 },
  { path: "src/api.spec.ts", content: 'import { describe, it } from "vitest";\ndescribe("api", () => {\n  it("runs", () => {});\n});\n', size: 75 },
];

const CI_FILES: SourceFile[] = [
  { path: ".github/workflows/ci.yml", content: 'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n', size: 60 },
  { path: "Dockerfile", content: 'FROM node:20\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD ["node", "dist/index.js"]\n', size: 90 },
  { path: "docker-compose.yml", content: 'version: "3"\nservices:\n  app:\n    build: .\n    ports:\n      - "3000:3000"\n', size: 70 },
  { path: "Makefile", content: 'build:\n\tnpm run build\ntest:\n\tnpm test\n', size: 35 },
];

const LANDING_FILES: SourceFile[] = [
  { path: "pages/index.html", content: '<html><body><h1>Welcome</h1></body></html>\n', size: 45 },
  { path: "src/pages/landing.tsx", content: 'export default function LandingPage() { return <div>Land</div> }\n', size: 65 },
  { path: "src/pages/home.tsx", content: 'export default function HomePage() { return <div>Home</div> }\n', size: 60 },
];

const CODE_OF_CONDUCT: SourceFile = {
  path: "CODE_OF_CONDUCT.md",
  content: "# Code of Conduct\n\nBe respectful.\n",
  size: 35,
};

/* ═══════════════════════════════════════════════════════════════
   generators-remotion.ts — source file branches
   ═══════════════════════════════════════════════════════════════ */

describe("generators-remotion.ts — source file branches", () => {
  const s = snap({ name: "remotion-sf-app", files: SNAPSHOT_FILES });

  describe("generateRemotionScript with source files", () => {
    const result = generateFiles(input(s, ["remotion-script.ts"], MEDIA_FILES));
    const f = getFile(result, "remotion-script.ts");

    it("produces remotion script", () => {
      expect(f).toBeDefined();
    });

    it("includes detected media assets", () => {
      expect(f!.content).toContain("Detected Media Assets");
      expect(f!.content).toContain("assets/intro.mp4");
    });

    it("includes asset sizes", () => {
      expect(f!.content).toMatch(/\d+ bytes/);
    });
  });

  describe("generateScenePlan with source files", () => {
    const result = generateFiles(input(s, ["scene-plan.md"], MEDIA_FILES));
    const f = getFile(result, "scene-plan.md");

    it("produces scene plan", () => {
      expect(f).toBeDefined();
    });

    it("includes available media assets", () => {
      expect(f!.content).toContain("Available Media Assets");
      expect(f!.content).toContain("assets/intro.mp4");
    });
  });

  describe("generateRenderConfig with source files", () => {
    const result = generateFiles(input(s, ["render-config.json"], MEDIA_FILES));
    const f = getFile(result, "render-config.json");

    it("produces render config", () => {
      expect(f).toBeDefined();
    });

    it("includes source_media_files in JSON", () => {
      const parsed = JSON.parse(f!.content);
      expect(parsed.source_media_files).toBeDefined();
      expect(parsed.source_media_files.length).toBeGreaterThan(0);
      expect(parsed.source_media_files).toContain("assets/intro.mp4");
    });
  });

  describe("generateAssetChecklist with source files", () => {
    const result = generateFiles(input(s, ["asset-checklist.md"], MEDIA_FILES));
    const f = getFile(result, "asset-checklist.md");

    it("produces asset checklist", () => {
      expect(f).toBeDefined();
    });

    it("includes detected assets table", () => {
      expect(f!.content).toContain("Detected Assets in Repository");
      expect(f!.content).toContain("| File | Size |");
      expect(f!.content).toContain("assets/intro.mp4");
    });
  });

  describe("generateStoryboard with source files", () => {
    const result = generateFiles(input(s, ["storyboard.md"], MEDIA_FILES));
    const f = getFile(result, "storyboard.md");

    it("produces storyboard", () => {
      expect(f).toBeDefined();
    });

    it("includes available visual assets", () => {
      expect(f!.content).toContain("Available Visual Assets");
      expect(f!.content).toContain("assets/logo.png");
    });
  });
});

/* ═══════════════════════════════════════════════════════════════
   generators-frontend.ts — source file branches
   ═══════════════════════════════════════════════════════════════ */

describe("generators-frontend.ts — source file branches", () => {
  const s = snap({ name: "frontend-sf-app", files: SNAPSHOT_FILES });
  const allFrontend: SourceFile[] = [...COMPONENT_FILES, ...STYLE_FILES, ...LAYOUT_FILES, ...ENTRY_POINTS];

  describe("generateFrontendRules with source files", () => {
    const result = generateFiles(input(s, ["frontend-rules.md"], allFrontend));
    const f = getFile(result, "frontend-rules.md");

    it("produces frontend rules", () => {
      expect(f).toBeDefined();
    });

    it("includes project components section", () => {
      expect(f!.content).toContain("Project Components");
      expect(f!.content).toMatch(/Header|Footer/);
    });
  });

  describe("generateComponentGuidelines with source files", () => {
    const result = generateFiles(input(s, ["component-guidelines.md"], allFrontend));
    const f = getFile(result, "component-guidelines.md");

    it("produces component guidelines", () => {
      expect(f).toBeDefined();
    });

    it("includes detected components section", () => {
      expect(f!.content).toContain("Detected Components");
      expect(f!.content).toMatch(/Header|Footer/);
    });
  });

  describe("generateLayoutPatterns with source files", () => {
    const result = generateFiles(input(s, ["layout-patterns.md"], allFrontend));
    const f = getFile(result, "layout-patterns.md");

    it("produces layout patterns", () => {
      expect(f).toBeDefined();
    });

    it("includes detected layout files table", () => {
      expect(f!.content).toContain("Detected Layout Files");
      expect(f!.content).toContain("| File | Exports |");
      expect(f!.content).toMatch(/layout/i);
    });
  });

  describe("generateUiAudit with source files", () => {
    const result = generateFiles(input(s, ["ui-audit.md"], allFrontend));
    const f = getFile(result, "ui-audit.md");

    it("produces ui audit", () => {
      expect(f).toBeDefined();
    });

    it("includes detected UI components table", () => {
      expect(f!.content).toContain("Detected UI Components");
      expect(f!.content).toContain("| Component | Exports | Lines |");
    });

    it("includes detected style files", () => {
      expect(f!.content).toContain("Detected Style Files");
      expect(f!.content).toMatch(/\.css|\.scss/);
    });
  });
});

/* ═══════════════════════════════════════════════════════════════
   generators-brand.ts — source file branches
   ═══════════════════════════════════════════════════════════════ */

describe("generators-brand.ts — source file branches", () => {
  const s = snap({ name: "brand-sf-app", files: SNAPSHOT_FILES });
  const allBrand: SourceFile[] = [...DOC_FILES, ...CONFIG_FILES, PKG_JSON];

  describe("generateBrandGuidelines with source files", () => {
    const result = generateFiles(input(s, ["brand-guidelines.md"], allBrand));
    const f = getFile(result, "brand-guidelines.md");

    it("produces brand guidelines", () => {
      expect(f).toBeDefined();
    });

    it("includes existing brand assets section", () => {
      expect(f!.content).toContain("Existing Brand Assets");
      expect(f!.content).toContain("README.md");
    });
  });

  describe("generateVoiceAndTone with source files", () => {
    const result = generateFiles(input(s, ["voice-and-tone.md"], allBrand));
    const f = getFile(result, "voice-and-tone.md");

    it("produces voice and tone", () => {
      expect(f).toBeDefined();
    });

    it("includes documentation tone samples", () => {
      expect(f!.content).toContain("Documentation Tone Samples");
      expect(f!.content).toMatch(/\d+ documentation files/);
    });
  });

  describe("generateContentConstraints with source files", () => {
    const result = generateFiles(input(s, ["content-constraints.md"], allBrand));
    const f = getFile(result, "content-constraints.md");

    it("produces content constraints", () => {
      expect(f).toBeDefined();
    });

    it("includes detected formatting configs", () => {
      expect(f!.content).toContain("Detected Formatting Configs");
      expect(f!.content).toMatch(/tsconfig|eslint|vitest/i);
    });
  });

  describe("generateMessagingSystem with source files", () => {
    const result = generateFiles(input(s, ["messaging-system.yaml"], allBrand));
    const f = getFile(result, "messaging-system.yaml");

    it("produces messaging system", () => {
      expect(f).toBeDefined();
    });

    it("includes source-derived messaging from package.json", () => {
      expect(f!.content).toContain("Source-derived messaging");
      expect(f!.content).toContain("package_description");
      expect(f!.content).toContain("blazing fast framework");
    });
  });

  describe("generateChannelRulebook with source files", () => {
    const result = generateFiles(input(s, ["channel-rulebook.md"], allBrand));
    const f = getFile(result, "channel-rulebook.md");

    it("produces channel rulebook", () => {
      expect(f).toBeDefined();
    });

    it("includes detected public-facing files", () => {
      expect(f!.content).toContain("Detected Public-Facing Files");
      expect(f!.content).toContain("README.md");
    });
  });
});

/* ═══════════════════════════════════════════════════════════════
   generators-superpowers.ts — source file branches
   ═══════════════════════════════════════════════════════════════ */

describe("generators-superpowers.ts — source file branches", () => {
  const s = snap({ name: "superpowers-sf-app", files: SNAPSHOT_FILES });
  const allSuperpowers: SourceFile[] = [...ENTRY_POINTS, ...HOTSPOT_FILES, ...TEST_FILES, ...CI_FILES, ...CONFIG_FILES, PKG_JSON];

  describe("generateSuperpowerPack with source files + hotspots", () => {
    const inp = withHotspots(input(s, ["superpower-pack.md"], allSuperpowers));
    const result = generateFiles(inp);
    const f = getFile(result, "superpower-pack.md");

    it("produces superpower pack", () => {
      expect(f).toBeDefined();
    });

    it("includes hotspot file excerpts", () => {
      expect(f!.content).toContain("Key Hotspot Files");
      expect(f!.content).toContain("src/db/connection.ts");
    });
  });

  describe("generateWorkflowRegistry with source files", () => {
    const result = generateFiles(input(s, ["workflow-registry.json"], allSuperpowers));
    const f = getFile(result, "workflow-registry.json");

    it("produces workflow registry", () => {
      expect(f).toBeDefined();
    });

    it("includes source_config_files in JSON", () => {
      const parsed = JSON.parse(f!.content);
      expect(parsed.source_config_files).toBeDefined();
      expect(parsed.source_config_files.length).toBeGreaterThan(0);
    });
  });

  describe("generateTestGenerationRules with source files", () => {
    const result = generateFiles(input(s, ["test-generation-rules.md"], allSuperpowers));
    const f = getFile(result, "test-generation-rules.md");

    it("produces test generation rules", () => {
      expect(f).toBeDefined();
    });

    it("includes detected test files table", () => {
      expect(f!.content).toContain("Detected Test Files");
      expect(f!.content).toContain("src/utils.test.ts");
    });
  });

  describe("generateRefactorChecklist with source files + hotspots", () => {
    const inp = withHotspots(input(s, ["refactor-checklist.md"], allSuperpowers));
    const result = generateFiles(inp);
    const f = getFile(result, "refactor-checklist.md");

    it("produces refactor checklist", () => {
      expect(f).toBeDefined();
    });

    it("includes high-risk file export surface", () => {
      expect(f!.content).toContain("High-Risk File Export Surface");
      expect(f!.content).toMatch(/pool|query|disconnect|authMiddleware/);
    });
  });

  describe("generateAutomationPipeline with source files", () => {
    const result = generateFiles(input(s, ["automation-pipeline.yaml"], allSuperpowers));
    const f = getFile(result, "automation-pipeline.yaml");

    it("produces automation pipeline", () => {
      expect(f).toBeDefined();
    });

    it("includes detected CI/config files", () => {
      expect(f!.content).toContain("Detected CI / Config Files");
      expect(f!.content).toMatch(/ci\.yml|Dockerfile|docker-compose/);
    });
  });
});

/* ═══════════════════════════════════════════════════════════════
   generators-marketing.ts — source file branches
   ═══════════════════════════════════════════════════════════════ */

describe("generators-marketing.ts — source file branches", () => {
  const s = snap({ name: "marketing-sf-app", files: SNAPSHOT_FILES });

  describe("generateCampaignBrief with source files", () => {
    const allMarketing: SourceFile[] = [...DOC_FILES, PKG_JSON, ...ENTRY_POINTS];
    const result = generateFiles(input(s, ["campaign-brief.md"], allMarketing));
    const f = getFile(result, "campaign-brief.md");

    it("produces campaign brief", () => {
      expect(f).toBeDefined();
    });

    it("includes source-derived messaging", () => {
      expect(f!.content).toContain("Source-Derived Messaging");
    });

    it("includes package description", () => {
      expect(f!.content).toContain("blazing fast framework");
    });

    it("includes keywords", () => {
      expect(f!.content).toContain("Keywords");
    });

    it("includes README tagline", () => {
      expect(f!.content).toContain("README tagline");
    });
  });

  describe("generateFunnelMap with source files", () => {
    const result = generateFiles(input(s, ["funnel-map.md"], ENTRY_POINTS));
    const f = getFile(result, "funnel-map.md");

    it("produces funnel map", () => {
      expect(f).toBeDefined();
    });

    it("includes detected product entry points", () => {
      expect(f!.content).toContain("Detected Product Entry Points");
      expect(f!.content).toContain("src/index.ts");
    });
  });

  describe("generateSequencePack with source files", () => {
    const allMarketing: SourceFile[] = [...DOC_FILES, CODE_OF_CONDUCT];
    const result = generateFiles(input(s, ["sequence-pack.md"], allMarketing));
    const f = getFile(result, "sequence-pack.md");

    it("produces sequence pack", () => {
      expect(f).toBeDefined();
    });

    it("includes detected contributor assets", () => {
      expect(f!.content).toContain("Detected Contributor Assets");
      expect(f!.content).toMatch(/CONTRIBUTING|CODE_OF_CONDUCT/);
    });
  });

  describe("generateCroPlaybook with source files", () => {
    const result = generateFiles(input(s, ["cro-playbook.md"], LANDING_FILES));
    const f = getFile(result, "cro-playbook.md");

    it("produces CRO playbook", () => {
      expect(f).toBeDefined();
    });

    it("includes detected landing/conversion pages", () => {
      expect(f!.content).toContain("Detected Landing/Conversion Pages");
      expect(f!.content).toMatch(/landing|home|index\.html/);
    });
  });

  describe("generateAbTestPlan with source files", () => {
    const result = generateFiles(input(s, ["ab-test-plan.md"], TEST_FILES));
    const f = getFile(result, "ab-test-plan.md");

    it("produces A/B test plan", () => {
      expect(f).toBeDefined();
    });

    it("includes existing test infrastructure", () => {
      expect(f!.content).toContain("Existing Test Infrastructure");
      expect(f!.content).toMatch(/\d+ test files/);
    });
  });
});
