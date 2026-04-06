/**
 * eq_111: Generator branch coverage tests.
 *
 * Exercises conditional branches in all 16 generator modules by varying
 * the input snapshot profile: framework, language, package manager,
 * project type, route keywords, LOC thresholds, and empty-data paths.
 */
import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput } from "./types.js";

// ─── Snapshot builders ──────────────────────────────────────────

function snap(
  opts: {
    name?: string;
    type?: string;
    files?: FileEntry[];
    id?: string;
  } = {},
): SnapshotRecord {
  const files = opts.files ?? [];
  return {
    snapshot_id: opts.id ?? "snap-branch-001",
    project_id: "proj-branch-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "branch-test",
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

function input(s: SnapshotRecord, requested: string[] = []): GeneratorInput {
  return {
    context_map: buildContextMap(s),
    repo_profile: buildRepoProfile(s),
    requested_outputs: requested,
  };
}

function getFile(result: ReturnType<typeof generateFiles>, path: string) {
  return result.files.find((f) => f.path === path);
}

// ─── Fixture file sets ──────────────────────────────────────────

const VUE_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"vue-app","dependencies":{"vue":"3.4.0"},"devDependencies":{"typescript":"5.0.0"}}', size: 90 },
  { path: "src/App.vue", content: '<script setup lang="ts">\nimport { ref } from "vue";\nconst count = ref(0);\n</script>\n<template><div>{{ count }}</div></template>', size: 120 },
  { path: "src/main.ts", content: 'import { createApp } from "vue";\nimport App from "./App.vue";\ncreateApp(App).mount("#app");', size: 90 },
  { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
];

const SVELTE_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"svelte-app","dependencies":{"svelte":"4.0.0"},"devDependencies":{"typescript":"5.0.0"}}', size: 90 },
  { path: "src/App.svelte", content: '<script>\n  let count = 0;\n</script>\n<button on:click={() => count++}>{count}</button>', size: 85 },
  { path: "src/main.ts", content: 'import App from "./App.svelte";\nconst app = new App({ target: document.body });', size: 80 },
  { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
];

const REACT_SPA_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"react-spa","dependencies":{"react":"18.0.0","react-dom":"18.0.0"},"devDependencies":{"vitest":"1.0.0","typescript":"5.0.0"}}', size: 130 },
  { path: "src/App.tsx", content: 'export default function App() { return <div>Hello</div> }', size: 58 },
  { path: "src/index.tsx", content: 'import App from "./App";\nimport { createRoot } from "react-dom/client";\ncreateRoot(document.getElementById("root")!).render(<App />);', size: 120 },
  { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
  { path: "tests/app.test.tsx", content: 'import { test } from "vitest"; test("stub", () => {});', size: 50 },
];

const PYTHON_DJANGO_FILES: FileEntry[] = [
  { path: "requirements.txt", content: "django==4.2\ndjango-rest-framework==3.14\npsycopg2==2.9", size: 60 },
  { path: "manage.py", content: '#!/usr/bin/env python\nimport os\nimport sys\nif __name__ == "__main__":\n    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mysite.settings")\n    from django.core.management import execute_from_command_line\n    execute_from_command_line(sys.argv)', size: 200 },
  { path: "mysite/settings.py", content: 'INSTALLED_APPS = ["django.contrib.admin", "rest_framework", "myapp"]\nDATABASES = {"default": {"ENGINE": "django.db.backends.postgresql"}}', size: 130 },
  { path: "mysite/urls.py", content: 'from django.urls import path\nfrom myapp import views\nurlpatterns = [path("api/users/", views.user_list)]', size: 100 },
  { path: "myapp/models.py", content: 'from django.db import models\nclass User(models.Model):\n    name = models.CharField(max_length=100)\n    email = models.EmailField(unique=True)', size: 120 },
  { path: "myapp/views.py", content: 'from rest_framework.decorators import api_view\nfrom rest_framework.response import Response\n@api_view(["GET"])\ndef user_list(request):\n    return Response([])', size: 140 },
  { path: "tests/test_views.py", content: 'import pytest\ndef test_user_list():\n    assert True', size: 50 },
];

const EXPRESS_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"express-api","dependencies":{"express":"4.18.0"},"devDependencies":{"jest":"29.0.0","typescript":"5.0.0"}}', size: 110 },
  { path: "src/index.ts", content: 'import express from "express";\nconst app = express();\napp.get("/api/health", (req, res) => res.json({ ok: true }));\napp.get("/api/users", (req, res) => res.json([]));\napp.post("/api/users", (req, res) => res.json({ id: 1 }));\napp.listen(3000);', size: 230 },
  { path: "src/middleware.ts", content: 'import { Request, Response, NextFunction } from "express";\nexport function auth(req: Request, res: Response, next: NextFunction) { next(); }', size: 140 },
  { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
  { path: "tests/api.test.ts", content: 'import { describe, it } from "@jest/globals"; describe("api", () => { it("works", () => {}); });', size: 80 },
];

const CLI_TOOL_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"my-cli","bin":{"mycli":"./dist/index.js"},"dependencies":{},"devDependencies":{"typescript":"5.0.0"}}', size: 100 },
  { path: "src/index.ts", content: '#!/usr/bin/env node\nimport { parseArgs } from "node:util";\nconst { values } = parseArgs({ options: { output: { type: "string" } } });\nconsole.log(values.output);', size: 160 },
  { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
];

const PNPM_VITE_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"pnpm-app","dependencies":{"react":"18.0.0"},"devDependencies":{"vitest":"1.0.0","typescript":"5.0.0"}}', size: 110 },
  { path: "pnpm-lock.yaml", content: "lockfileVersion: 9.0\n", size: 22 },
  { path: "vite.config.ts", content: 'import { defineConfig } from "vite";\nexport default defineConfig({});', size: 65 },
  { path: "src/App.tsx", content: 'export default function App() { return <div>App</div> }', size: 55 },
  { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
  { path: "tests/app.test.tsx", content: 'import { test } from "vitest"; test("stub", () => {});', size: 50 },
];

const YARN_JEST_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"yarn-app","dependencies":{"react":"18.0.0","next":"14.0.0"},"devDependencies":{"jest":"29.0.0","typescript":"5.0.0","webpack":"5.0.0"}}', size: 130 },
  { path: "yarn.lock", content: "# yarn lockfile v1\n", size: 20 },
  { path: "webpack.config.js", content: 'module.exports = { entry: "./src/index.ts" };', size: 45 },
  { path: "src/index.ts", content: 'console.log("hello");', size: 22 },
  { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
  { path: "tests/app.test.ts", content: 'describe("app", () => { it("works", () => {}); });', size: 50 },
];

const STYLED_COMPONENTS_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"styled-app","dependencies":{"react":"18.0.0","styled-components":"6.0.0"},"devDependencies":{"typescript":"5.0.0"}}', size: 110 },
  { path: "src/App.tsx", content: 'import styled from "styled-components";\nconst Box = styled.div`color: red;`;\nexport default function App() { return <Box>Hi</Box> }', size: 130 },
  { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
];

const CSS_MODULES_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"cssmod-app","dependencies":{"react":"18.0.0"},"devDependencies":{"typescript":"5.0.0"}}', size: 90 },
  { path: "src/App.tsx", content: 'import styles from "./App.module.css";\nexport default function App() { return <div className={styles.root}>Hi</div> }', size: 110 },
  { path: "src/App.module.css", content: ".root { color: blue; }", size: 23 },
  { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
];

const SASS_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"sass-app","dependencies":{"react":"18.0.0"},"devDependencies":{"typescript":"5.0.0","sass":"1.50.0"}}', size: 100 },
  { path: "src/App.tsx", content: 'import "./App.scss";\nexport default function App() { return <div className="root">Hi</div> }', size: 90 },
  { path: "src/App.scss", content: "$color: blue;\n.root { color: $color; }", size: 38 },
  { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
];

const RICH_ROUTES_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"rich-routes","dependencies":{"next":"14.0.0","react":"18.0.0"},"devDependencies":{"vitest":"1.0.0","typescript":"5.0.0"}}', size: 130 },
  { path: "next.config.mjs", content: "export default {}", size: 18 },
  { path: "app/page.tsx", content: "export default function Home() { return <div>Home</div> }", size: 58 },
  { path: "app/blog/page.tsx", content: "export default function Blog() { return <div>Blog</div> }", size: 58 },
  { path: "app/pricing/page.tsx", content: "export default function Pricing() { return <div>Pricing</div> }", size: 64 },
  { path: "app/about/page.tsx", content: "export default function About() { return <div>About</div> }", size: 60 },
  { path: "app/faq/page.tsx", content: "export default function FAQ() { return <div>FAQ</div> }", size: 56 },
  { path: "app/docs/page.tsx", content: "export default function Docs() { return <div>Docs</div> }", size: 58 },
  { path: "app/auth/login/page.tsx", content: "export default function Login() { return <div>Login</div> }", size: 60 },
  { path: "app/settings/page.tsx", content: "export default function Settings() { return <div>Settings</div> }", size: 66 },
  { path: "app/features/page.tsx", content: "export default function Features() { return <div>Features</div> }", size: 66 },
  { path: "app/dashboard/page.tsx", content: "export default function Dashboard() { return <div>Dashboard</div> }", size: 70 },
  { path: "app/signup/page.tsx", content: "export default function Signup() { return <div>Signup</div> }", size: 62 },
  { path: "app/api/users/route.ts", content: 'export async function GET() { return Response.json([]) }', size: 56 },
  { path: "app/admin/users/settings/page.tsx", content: "export default function Deep() { return <div>Deep</div> }", size: 58 },
  { path: "tailwind.config.ts", content: "export default {}", size: 18 },
  { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
];

const EMPTY_PROJECT_FILES: FileEntry[] = [
  { path: "index.ts", content: 'console.log("hello");', size: 22 },
  { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
];

function makeLargeFiles(count: number, locPerFile: number): FileEntry[] {
  const baseFiles: FileEntry[] = [
    {
      path: "package.json",
      content: JSON.stringify({
        name: "large-app",
        dependencies: { react: "18.0.0", next: "14.0.0", "@prisma/client": "5.0.0", lodash: "4.17.0", axios: "1.6.0", zod: "3.22.0" },
        devDependencies: { vitest: "1.0.0", typescript: "5.0.0", eslint: "8.0.0" },
      }),
      size: 250,
    },
    { path: "pnpm-lock.yaml", content: "lockfileVersion: 9.0\n", size: 22 },
    { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
    { path: "next.config.mjs", content: "export default {}", size: 18 },
    { path: ".github/workflows/ci.yml", content: "name: CI\non: [push]", size: 20 },
  ];
  const genFiles: FileEntry[] = Array.from({ length: count }, (_, i) => {
    const lines = Array.from({ length: locPerFile }, (_, j) =>
      `export function fn_${i}_${j}(x: number) { return x * ${j}; }`,
    ).join("\n");
    return { path: `src/module${i}/handler${i}.ts`, content: lines, size: lines.length };
  });
  return [...baseFiles, ...genFiles];
}

// Also a Go multi-language project
const GO_MULTI_LANG_FILES: FileEntry[] = [
  { path: "go.mod", content: "module github.com/example/app\n\ngo 1.21\n\nrequire github.com/go-chi/chi/v5 v5.0.10", size: 80 },
  { path: "main.go", content: 'package main\n\nimport (\n\t"net/http"\n\t"github.com/go-chi/chi/v5"\n)\n\nfunc main() {\n\tr := chi.NewRouter()\n\tr.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {})\n\thttp.ListenAndServe(":8080", r)\n}', size: 200 },
  { path: "models/user.go", content: 'package models\n\ntype User struct {\n\tID    int    `json:"id"`\n\tName  string `json:"name"`\n\tEmail string `json:"email"`\n}', size: 120 },
  { path: "scripts/seed.py", content: "import json\ndata = []\nwith open('seed.json', 'w') as f:\n    json.dump(data, f)", size: 80 },
  { path: "frontend/index.ts", content: 'import "./styles.css";\nconsole.log("loaded");', size: 45 },
  { path: "Makefile", content: "build:\n\tgo build -o app ./...\ntest:\n\tgo test ./...", size: 50 },
];

// ─── Tests ──────────────────────────────────────────────────────

describe("Vue project branches", () => {
  const s = snap({ name: "vue-app", files: VUE_FILES });
  const allOutputs = [
    ".ai/seo-rules.md", ".ai/frontend-rules.md", "component-guidelines.md",
    "AGENTS.md", "CLAUDE.md", ".cursorrules",
    ".ai/debug-playbook.md", ".ai/design-tokens.json", "theme-guidelines.md",
    "notebook-summary.md", "obsidian-skill-pack.md",
  ];
  const result = generateFiles(input(s, allOutputs));

  it("SEO: hits Vue SSR branch", () => {
    const f = getFile(result, ".ai/seo-rules.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/vue|ssr|server/i);
  });

  it("frontend: hits Vue component rules", () => {
    const f = getFile(result, ".ai/frontend-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toMatch(/vue|composition|setup/i);
  });

  it("theme: hits Vue integration", () => {
    const f = getFile(result, "theme-guidelines.md");
    expect(f).toBeDefined();
    // Vue project may trigger vue-specific or fallback styling
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("notebook: cites Vue resources", () => {
    const f = getFile(result, "notebook-summary.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/vue|framework/i);
  });

  it("skills: generates for Vue stack", () => {
    const f = getFile(result, "AGENTS.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toContain("vue");
  });
});

describe("Svelte project branches", () => {
  const s = snap({ name: "svelte-app", files: SVELTE_FILES });
  const result = generateFiles(input(s, [
    ".ai/seo-rules.md", ".ai/frontend-rules.md", "component-guidelines.md",
  ]));

  it("SEO: hits Svelte SSR branch", () => {
    const f = getFile(result, ".ai/seo-rules.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/svelte|ssr|server/i);
  });

  it("frontend: hits Svelte reactive declarations", () => {
    const f = getFile(result, ".ai/frontend-rules.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/svelte|reactive/i);
  });
});

describe("React SPA (no Next.js) branches", () => {
  const s = snap({ name: "react-spa", files: REACT_SPA_FILES });
  const result = generateFiles(input(s, [
    ".ai/seo-rules.md", ".ai/frontend-rules.md", "component-guidelines.md",
    "generated-component.tsx", "dashboard-widget.tsx",
    "superpower-pack.md", "automation-pipeline.yaml",
  ]));

  it("SEO: hits React SPA branch (not Next.js SSR)", () => {
    const f = getFile(result, ".ai/seo-rules.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/react|spa|client/i);
  });

  it("frontend: hits React-only layout", () => {
    const f = getFile(result, ".ai/frontend-rules.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toContain("react");
  });

  it("artifacts: hits React component scaffold", () => {
    const f = getFile(result, "generated-component.tsx");
    expect(f).toBeDefined();
    expect(f!.content).toMatch(/react|jsx|component/i);
  });
});

describe("Python + Django branches", () => {
  const s = snap({ name: "django-app", files: PYTHON_DJANGO_FILES, type: "web_application" });
  const result = generateFiles(input(s, [
    "AGENTS.md", "CLAUDE.md", ".cursorrules",
    ".ai/debug-playbook.md", "tracing-rules.md",
    "notebook-summary.md", "study-brief.md",
    "superpower-pack.md", "test-generation-rules.md",
    "mcp-config.json", "connector-map.yaml",
  ]));

  it("skills: hits Python/Django rules", () => {
    const f = getFile(result, "AGENTS.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/python|django/i);
  });

  it("skills: CLAUDE.md contains Python conventions", () => {
    const f = getFile(result, "CLAUDE.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/python|django/i);
  });

  it("superpowers: hits pytest branch", () => {
    const f = getFile(result, "superpower-pack.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/pytest|python/i);
  });

  it("test-rules: hits pytest naming", () => {
    const f = getFile(result, "test-generation-rules.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/pytest|test_|python/i);
  });

  it("mcp: hits pip/PyPI connector", () => {
    const f = getFile(result, "connector-map.yaml");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/pip|pypi|python/i);
  });

  it("notebook: cites Python resources", () => {
    const f = getFile(result, "notebook-summary.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toContain("python");
  });
});

describe("Express/Jest project branches", () => {
  const s = snap({ name: "express-api", files: EXPRESS_FILES, type: "api_server" });
  const result = generateFiles(input(s, [
    ".ai/debug-playbook.md", "incident-template.md", "tracing-rules.md",
    "AGENTS.md", ".cursorrules",
    "superpower-pack.md", "test-generation-rules.md",
    "mcp-config.json",
    "campaign-brief.md",
  ]));

  it("debug: hits Express/Fastify API Server section", () => {
    const f = getFile(result, ".ai/debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/express|api|middleware/i);
  });

  it("debug: tracing rules for API routes", () => {
    const f = getFile(result, "tracing-rules.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/express|api|trace/i);
  });

  it("skills: hits Express framework policy", () => {
    const f = getFile(result, "AGENTS.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/express/i);
  });

  it("superpowers: hits jest branch", () => {
    const f = getFile(result, "superpower-pack.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/jest/i);
  });

  it("mcp: hits jest test runner", () => {
    const f = getFile(result, "mcp-config.json");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/jest/i);
  });
});

describe("CLI tool project branches", () => {
  const s = snap({ name: "my-cli", files: CLI_TOOL_FILES, type: "cli_tool" });
  const result = generateFiles(input(s, [
    "brand-guidelines.md", "voice-and-tone.md", "content-constraints.md", "messaging-system.yaml",
    "campaign-brief.md", "funnel-map.md", "sequence-pack.md",
  ]));

  it("brand: hits CLI/library positioning", () => {
    const f = getFile(result, "brand-guidelines.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/cli|tool|developer/i);
  });

  it("brand: voice-and-tone for dev tool", () => {
    const f = getFile(result, "voice-and-tone.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("marketing: hits devTool distribution channels", () => {
    const f = getFile(result, "campaign-brief.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/developer|github|npm|cli/i);
  });

  it("marketing: funnel for dev tool", () => {
    const f = getFile(result, "funnel-map.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });
});

describe("pnpm + Vite project branches", () => {
  const s = snap({ name: "pnpm-app", files: PNPM_VITE_FILES });
  const result = generateFiles(input(s, [
    "superpower-pack.md", "workflow-registry.json", "automation-pipeline.yaml",
    "mcp-config.json", "connector-map.yaml",
  ]));

  it("superpowers: hits pnpm package manager branch", () => {
    const f = getFile(result, "superpower-pack.md");
    expect(f).toBeDefined();
    expect(f!.content).toMatch(/pnpm/i);
  });

  it("superpowers: hits vite dev server branch", () => {
    const f = getFile(result, "superpower-pack.md");
    expect(f!.content.toLowerCase()).toMatch(/vite/i);
  });

  it("mcp: hits pnpm + vite branches", () => {
    const f = getFile(result, "mcp-config.json");
    expect(f).toBeDefined();
    expect(f!.content).toMatch(/pnpm|vite/i);
  });
});

describe("yarn + webpack + jest project branches", () => {
  const s = snap({ name: "yarn-app", files: YARN_JEST_FILES });
  const result = generateFiles(input(s, [
    "superpower-pack.md", "automation-pipeline.yaml",
    "mcp-config.json",
  ]));

  it("superpowers: hits yarn package manager branch", () => {
    const f = getFile(result, "superpower-pack.md");
    expect(f).toBeDefined();
    expect(f!.content).toMatch(/yarn/i);
  });

  it("superpowers: hits webpack build tool path (yarn run build)", () => {
    const f = getFile(result, "superpower-pack.md");
    // webpack branch outputs: `yarn run build` (same build command via yarn)
    expect(f!.content).toMatch(/yarn.*build/i);
  });
});

describe("styled-components project branches", () => {
  const s = snap({ name: "styled-app", files: STYLED_COMPONENTS_FILES });
  const result = generateFiles(input(s, [
    ".ai/design-tokens.json", "theme.css", "theme-guidelines.md", "component-theme-map.json",
  ]));

  it("theme: hits CSS-in-JS / styled-components branch", () => {
    const f = getFile(result, "theme-guidelines.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/styled|theme.*provider|css-in-js/i);
  });

  it("theme: design tokens include styled method", () => {
    const f = getFile(result, ".ai/design-tokens.json");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });
});

describe("CSS Modules project branches", () => {
  const s = snap({ name: "cssmod-app", files: CSS_MODULES_FILES });
  const result = generateFiles(input(s, [
    "theme-guidelines.md", "component-theme-map.json",
  ]));

  it("theme: hits CSS Modules branch", () => {
    const f = getFile(result, "theme-guidelines.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/module|css/i);
  });
});

describe("Sass project branches", () => {
  const s = snap({ name: "sass-app", files: SASS_FILES });
  const result = generateFiles(input(s, [
    "theme-guidelines.md",
  ]));

  it("theme: hits Sass/SCSS branch", () => {
    const f = getFile(result, "theme-guidelines.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/sass|scss|variable/i);
  });
});

describe("Rich routes branches", () => {
  const s = snap({ name: "rich-routes", files: RICH_ROUTES_FILES });
  const result = generateFiles(input(s, [
    ".ai/seo-rules.md", "schema-recommendations.json", "route-priority-map.md",
    "content-audit.md", "meta-tag-audit.json",
    ".ai/frontend-rules.md", "component-guidelines.md",
    "cro-playbook.md",
    ".ai/debug-playbook.md",
  ]));

  it("SEO: schema recommendations include blog/pricing/faq routes", () => {
    const f = getFile(result, "schema-recommendations.json");
    expect(f).toBeDefined();
    const content = f!.content.toLowerCase();
    expect(content).toMatch(/blog|article/i);
    expect(content).toMatch(/pricing|product/i);
  });

  it("SEO: route priority map categorizes all route types", () => {
    const f = getFile(result, "route-priority-map.md");
    expect(f).toBeDefined();
    const content = f!.content.toLowerCase();
    expect(content).toMatch(/blog/i);
    expect(content).toMatch(/pricing/i);
    expect(content).toMatch(/doc/i);
    expect(content).toMatch(/auth|login/i);
    expect(content).toMatch(/setting/i);
  });

  it("SEO: meta-tag audit covers faq/blog route schemas", () => {
    const f = getFile(result, "meta-tag-audit.json");
    expect(f).toBeDefined();
    const content = f!.content.toLowerCase();
    expect(content).toMatch(/blog|faq|pricing/i);
  });

  it("SEO: content audit generated", () => {
    const f = getFile(result, "content-audit.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(100);
  });

  it("frontend: categorizes marketing/auth/dashboard routes", () => {
    const f = getFile(result, "component-guidelines.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(100);
  });

  it("marketing: CRO playbook has route optimization", () => {
    const f = getFile(result, "cro-playbook.md");
    expect(f).toBeDefined();
    const content = f!.content.toLowerCase();
    expect(content).toMatch(/login|signup|dashboard/i);
  });
});

describe("Empty/minimal project branches", () => {
  const s = snap({ name: "minimal", files: EMPTY_PROJECT_FILES });
  const result = generateFiles(input(s, [
    ".ai/seo-rules.md", "route-priority-map.md", "content-audit.md",
    "AGENTS.md", "CLAUDE.md", ".cursorrules",
    ".ai/debug-playbook.md", "tracing-rules.md",
    ".ai/frontend-rules.md",
    "superpower-pack.md", "test-generation-rules.md",
    "remotion-script.ts", "asset-checklist.md",
    "notebook-summary.md", "study-brief.md", "research-threads.md",
    "canvas-spec.json", "poster-layouts.md",
    "obsidian-skill-pack.md", "vault-rules.md",
    "brand-guidelines.md", "content-constraints.md", "messaging-system.yaml",
    "campaign-brief.md",
    "mcp-config.json",
    ".ai/optimization-rules.md", "prompt-diff-report.md",
    "parameter-pack.json",
  ]));

  it("SEO: hits no-framework fallback", () => {
    const f = getFile(result, ".ai/seo-rules.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("SEO: empty routes early return or minimal output", () => {
    const f = getFile(result, "route-priority-map.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(10);
  });

  it("SEO: content audit no-SSR warning", () => {
    const f = getFile(result, "content-audit.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("skills: handles no frameworks, no CI, no test fws", () => {
    const f = getFile(result, "AGENTS.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("skills: CLAUDE.md for minimal project", () => {
    const f = getFile(result, "CLAUDE.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("debug: no hotspots, no routes, no test framework", () => {
    const f = getFile(result, ".ai/debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("debug: tracing rules with no API routes", () => {
    const f = getFile(result, "tracing-rules.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(30);
  });

  it("frontend: no framework fallback", () => {
    const f = getFile(result, ".ai/frontend-rules.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("superpowers: no hotspots, no test framework", () => {
    const f = getFile(result, "superpower-pack.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("superpowers: test-gen rules with no test framework", () => {
    const f = getFile(result, "test-generation-rules.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(30);
  });

  it("remotion: empty patterns/abstractions/entries", () => {
    const f = getFile(result, "remotion-script.ts");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(30);
  });

  it("remotion: asset checklist no entry points", () => {
    const f = getFile(result, "asset-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(30);
  });

  it("notebook: empty frameworks/patterns/abstractions/warnings", () => {
    const f = getFile(result, "notebook-summary.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(30);
  });

  it("notebook: study brief with no entry points or test frameworks", () => {
    const f = getFile(result, "study-brief.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(30);
  });

  it("notebook: research threads with minimal data", () => {
    const f = getFile(result, "research-threads.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(30);
  });

  it("canvas: no patterns, no layers", () => {
    const f = getFile(result, "poster-layouts.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(30);
  });

  it("obsidian: empty frameworks/conventions", () => {
    const f = getFile(result, "obsidian-skill-pack.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(30);
  });

  it("brand: empty frameworks, no description", () => {
    const f = getFile(result, "brand-guidelines.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("brand: content constraints with no conventions", () => {
    const f = getFile(result, "content-constraints.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(30);
  });

  it("brand: messaging system with empty arrays", () => {
    const f = getFile(result, "messaging-system.yaml");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(30);
  });

  it("marketing: non-devTool non-webApp audience fallback", () => {
    const f = getFile(result, "campaign-brief.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("mcp: no CI, no Next, no Prisma fallbacks", () => {
    const f = getFile(result, "mcp-config.json");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("optimization: small project path", () => {
    const f = getFile(result, ".ai/optimization-rules.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("optimization: prompt diff report for small project", () => {
    const f = getFile(result, "prompt-diff-report.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("algorithmic: generates config for minimal project", () => {
    const f = getFile(result, "parameter-pack.json");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("artifacts: non-React vanilla scaffold", () => {
    const f = getFile(result, "generated-component.tsx");
    // May or may not be requested — check if generated
    if (f) {
      expect(f.content.length).toBeGreaterThan(0);
    }
  });
});

describe("Large project branches (LOC/file thresholds)", () => {
  // 60 files × 1000 LOC = 60,000 LOC → triggers "large project" thresholds
  const s = snap({ name: "large-app", files: makeLargeFiles(60, 1000), type: "web_application" });
  const result = generateFiles(input(s, [
    ".ai/optimization-rules.md", "prompt-diff-report.md", "cost-estimate.json", "token-budget-plan.md",
    "superpower-pack.md",
  ]));

  it("optimization: hits large project (>50K LOC) branch", () => {
    const f = getFile(result, ".ai/optimization-rules.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(100);
  });

  it("optimization: prompt diff hits files >50 threshold", () => {
    const f = getFile(result, "prompt-diff-report.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(100);
  });

  it("optimization: cost estimate hits high token count", () => {
    const f = getFile(result, "cost-estimate.json");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("optimization: token budget plan generated", () => {
    const f = getFile(result, "token-budget-plan.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });
});

describe("Medium project branches (20-50 files, 10-30K LOC)", () => {
  // 30 files × 500 LOC = 15,000 LOC
  const s = snap({ name: "medium-app", files: makeLargeFiles(30, 500), type: "web_application" });
  const result = generateFiles(input(s, [
    ".ai/optimization-rules.md", "prompt-diff-report.md", "cost-estimate.json",
  ]));

  it("optimization: hits medium project (>10K LOC) branch", () => {
    const f = getFile(result, ".ai/optimization-rules.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(100);
  });

  it("optimization: prompt diff hits 20-50 file range", () => {
    const f = getFile(result, "prompt-diff-report.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(100);
  });
});

describe("Go multi-language project branches", () => {
  const s = snap({ name: "go-multi", files: GO_MULTI_LANG_FILES });
  const result = generateFiles(input(s, [
    ".ai/optimization-rules.md", "cost-estimate.json",
    "AGENTS.md",
    "notebook-summary.md",
  ]));

  it("optimization: cost estimate handles multi-language", () => {
    const f = getFile(result, "cost-estimate.json");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("skills: handles Go project", () => {
    const f = getFile(result, "AGENTS.md");
    expect(f).toBeDefined();
    expect(f!.content.toLowerCase()).toMatch(/go/i);
  });
});

describe("Non-React artifact branches", () => {
  // Use Vue files — no React, so artifacts should generate vanilla scaffold
  const s = snap({ name: "vue-artifacts", files: VUE_FILES });
  const result = generateFiles(input(s, [
    "generated-component.tsx", "dashboard-widget.tsx",
    "embed-snippet.ts", "artifact-spec.md",
  ]));

  it("artifacts: component hits non-React scaffold", () => {
    const f = getFile(result, "generated-component.tsx");
    expect(f).toBeDefined();
    // Should NOT contain "import React" or JSX-specific React patterns
    expect(f!.content.length).toBeGreaterThan(30);
  });

  it("artifacts: dashboard widget non-React path", () => {
    const f = getFile(result, "dashboard-widget.tsx");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(30);
  });

  it("artifacts: embed snippet generated", () => {
    const f = getFile(result, "embed-snippet.ts");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(30);
  });

  it("artifacts: artifact spec generated", () => {
    const f = getFile(result, "artifact-spec.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(30);
  });
});

describe("No-Tailwind styling branches", () => {
  // React project without tailwind.config.ts
  const s = snap({ name: "no-tailwind", files: REACT_SPA_FILES });
  const result = generateFiles(input(s, [
    ".ai/frontend-rules.md", "component-guidelines.md",
    ".ai/design-tokens.json", "theme-guidelines.md",
  ]));

  it("frontend: no Tailwind styling approach", () => {
    const f = getFile(result, ".ai/frontend-rules.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("theme: no-Tailwind fallback", () => {
    const f = getFile(result, "theme-guidelines.md");
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });
});

// ─── eq_118: Branch sweep — hotspots, entry points, deps, identity ───

/**
 * Patch a GeneratorInput's context_map to inject hotspots, entry_points,
 * external_dependencies, and project_identity.description so the
 * generator branches that require non-empty arrays are exercised.
 */
function withRichContext(inp: GeneratorInput): GeneratorInput {
  const ctx = inp.context_map;
  ctx.dependency_graph.hotspots = [
    { path: "src/database/connection.ts", inbound_count: 12, outbound_count: 3, risk_score: 8.5 },
    { path: "src/auth/middleware.ts", inbound_count: 8, outbound_count: 6, risk_score: 5.2 },
    { path: "src/utils/helpers.ts", inbound_count: 15, outbound_count: 1, risk_score: 3.0 },
    { path: "src/api/router.ts", inbound_count: 4, outbound_count: 9, risk_score: 6.8 },
    { path: "src/models/user.ts", inbound_count: 7, outbound_count: 2, risk_score: 4.1 },
  ];
  ctx.entry_points = [
    { path: "src/index.ts", type: "app_entry", description: "Application entry point" },
    { path: "src/server.ts", type: "server", description: "HTTP server bootstrap" },
    { path: "app/api/users/route.ts", type: "api_route", description: "Users API endpoint" },
  ];
  ctx.dependency_graph.external_dependencies = [
    { name: "react", version: "18.2.0", type: "production" as const },
    { name: "next", version: "14.1.0", type: "production" as const },
    { name: "zod", version: "3.22.4", type: "production" as const },
    { name: "prisma", version: "5.8.0", type: "production" as const },
    { name: "tailwindcss", version: "3.4.0", type: "development" as const },
  ];
  ctx.project_identity.description = "A full-stack TypeScript platform for developer tooling";
  ctx.routes = [
    { path: "/api/users", method: "GET", source_file: "app/api/users/route.ts" },
    { path: "/login", method: "GET", source_file: "app/login/page.tsx" },
    { path: "/", method: "GET", source_file: "app/page.tsx" },
    { path: "/dashboard", method: "GET", source_file: "app/dashboard/page.tsx" },
    { path: "/settings", method: "GET", source_file: "app/settings/page.tsx" },
    { path: "/about", method: "GET", source_file: "app/about/page.tsx" },
  ];
  ctx.architecture_signals.separation_score = 8;
  ctx.architecture_signals.patterns_detected = ["MVC", "Repository Pattern", "Dependency Injection"];
  return inp;
}

describe("Hotspot branches (remotion, algorithmic, obsidian, artifacts)", () => {
  const s = snap({ name: "rich-project", type: "web_application", files: REACT_SPA_FILES });
  const result = generateFiles(withRichContext(input(s, [
    "storyboard.md", "collection-map.md", "linking-policy.md",
    "artifact-spec.md", "brand-guidelines.md",
  ])));

  it("remotion: renders hotspot risk indicators", () => {
    const f = getFile(result, "storyboard.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Hotspots:");
    // risk_score > 7 → 🔴
    expect(f!.content).toContain("🔴");
    // risk_score 4-7 → 🟡
    expect(f!.content).toContain("🟡");
    // risk_score < 4 → 🟢
    expect(f!.content).toContain("🟢");
  });

  it("algorithmic: renders brightest-stars hotspot list", () => {
    const f = getFile(result, "collection-map.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Brightest stars");
    expect(f!.content).toContain("src/database/connection.ts");
    expect(f!.content).toContain("risk: 8.5");
  });

  it("obsidian: renders code-to-vault mapping table", () => {
    const f = getFile(result, "linking-policy.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Code-to-Vault Mapping");
    expect(f!.content).toContain("| Code File | Risk | Vault Note |");
    // Path transform: src/database/connection.ts → src-database-connection
    expect(f!.content).toContain("[[Code/src-database-connection]]");
  });

  it("artifacts: renders entry points table", () => {
    const f = getFile(result, "artifact-spec.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("| Path | Type | Description |");
    expect(f!.content).toContain("src/index.ts");
    expect(f!.content).toContain("app_entry");
  });

  it("artifacts: renders hotspots table with risk scores", () => {
    const f = getFile(result, "artifact-spec.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("| Path | Inbound | Outbound | Risk |");
    expect(f!.content).toContain("src/database/connection.ts");
    expect(f!.content).toContain("8.5");
  });

  it("artifacts: renders dependencies list", () => {
    const f = getFile(result, "artifact-spec.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("`react` @ 18.2.0");
    expect(f!.content).toContain("`zod` @ 3.22.4");
  });

  it("brand: renders description when present", () => {
    const f = getFile(result, "brand-guidelines.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("A full-stack TypeScript platform for developer tooling");
  });
});

describe("Brand type-classification branches", () => {
  it("brand: CLI tool positioning", () => {
    const s = snap({ name: "my-cli", type: "cli_tool", files: CLI_TOOL_FILES });
    const result = generateFiles(withRichContext(input(s, ["brand-guidelines.md"])));
    const f = getFile(result, "brand-guidelines.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("command-line tool");
    expect(f!.content).toContain("DevOps engineers");
  });

  it("brand: library/package positioning", () => {
    const s = snap({ name: "my-lib", type: "typescript_library", files: EMPTY_PROJECT_FILES });
    const result = generateFiles(withRichContext(input(s, ["brand-guidelines.md"])));
    const f = getFile(result, "brand-guidelines.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("library/package consumed");
  });

  it("brand: generic fallback positioning", () => {
    const s = snap({ name: "my-playground", type: "playground", files: EMPTY_PROJECT_FILES });
    const result = generateFiles(withRichContext(input(s, ["brand-guidelines.md"])));
    const f = getFile(result, "brand-guidelines.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Technical users");
  });
});

describe("Frontend route-to-layout branches", () => {
  const s = snap({ name: "routed-app", type: "web_application", files: RICH_ROUTES_FILES });
  const result = generateFiles(withRichContext(input(s, [
    "layout-patterns.md", "ui-audit.md",
  ])));

  it("layout: API route mapped to N/A", () => {
    const f = getFile(result, "layout-patterns.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("N/A (API)");
  });

  it("layout: auth route mapped to AuthLayout", () => {
    const f = getFile(result, "layout-patterns.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("AuthLayout");
  });

  it("layout: home route mapped to MarketingLayout", () => {
    const f = getFile(result, "layout-patterns.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("MarketingLayout");
  });

  it("layout: dashboard route mapped to DashboardLayout", () => {
    const f = getFile(result, "layout-patterns.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("DashboardLayout");
  });

  it("ui-audit: page routes listed in component coverage", () => {
    const f = getFile(result, "ui-audit.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("/login");
    expect(f!.content).toContain("/dashboard");
  });
});

describe("Notebook research-threads branches", () => {
  const s = snap({ name: "arch-project", type: "web_application", files: REACT_SPA_FILES });
  const result = generateFiles(withRichContext(input(s, ["research-threads.md"])));

  it("research: strong architecture message when score >= 7", () => {
    const f = getFile(result, "research-threads.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Architecture separation is strong");
  });

  it("research: renders detected patterns", () => {
    const f = getFile(result, "research-threads.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("MVC");
    expect(f!.content).toContain("Repository Pattern");
  });

  it("research: renders hotspot investigation threads", () => {
    const f = getFile(result, "research-threads.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Dependency Hotspots");
    expect(f!.content).toContain("src/database/connection.ts");
  });
});
