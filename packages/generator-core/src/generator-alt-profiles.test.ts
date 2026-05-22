import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput } from "./types.js";

// ─── Profile helpers ────────────────────────────────────────────

function makeSnapshot(overrides: {
  files: FileEntry[];
  project_name?: string;
  project_type?: string;
  frameworks?: string[];
  packageJson?: string;
}): SnapshotRecord {
  const files = overrides.files;
  return {
    snapshot_id: "snap-alt-001",
    project_id: "proj-alt-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: overrides.project_name ?? "test-alt",
      project_type: overrides.project_type ?? "web_application",
      frameworks: overrides.frameworks ?? [],
      goals: ["Generate AI context files"],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
    account_id: null,
  };
}

function makeInput(snapshot: SnapshotRecord, requested: string[] = []): GeneratorInput {
  return {
    context_map: buildContextMap(snapshot),
    repo_profile: buildRepoProfile(snapshot),
    requested_outputs: requested,
  };
}

// ─── Profile: Vue + Sass (no Tailwind, no React) ───────────────

function vueSassFiles(): FileEntry[] {
  return [
    { path: "src/App.vue", content: '<template><div class="app"><router-view/></div></template>\n<script setup lang="ts">\nimport { ref } from "vue"\n</script>', size: 120 },
    { path: "src/main.ts", content: 'import { createApp } from "vue";\nimport App from "./App.vue";\ncreateApp(App).mount("#app");', size: 90 },
    { path: "src/components/NavBar.vue", content: '<template><nav class="nav"><slot/></nav></template>\n<style lang="scss">\n.nav { display: flex; }\n</style>', size: 100 },
    { path: "src/views/Home.vue", content: '<template><main class="home"><h1>Home</h1></main></template>', size: 60 },
    { path: "src/views/About.vue", content: '<template><main class="about"><h1>About</h1></main></template>', size: 60 },
    { path: "src/styles/global.scss", content: '$primary: #3b82f6;\nbody { font-family: sans-serif; color: $primary; }', size: 70 },
    { path: "src/styles/variables.scss", content: '$spacing-sm: 4px;\n$spacing-md: 8px;\n$spacing-lg: 16px;', size: 60 },
    { path: "package.json", content: '{"name":"vue-sass-app","dependencies":{"vue":"3.4.0","vue-router":"4.3.0"},"devDependencies":{"sass":"1.70.0","typescript":"5.0.0","vite":"5.0.0"}}', size: 160 },
    { path: "vite.config.ts", content: 'import { defineConfig } from "vite";\nimport vue from "@vitejs/plugin-vue";\nexport default defineConfig({ plugins: [vue()] });', size: 120 },
    { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true,"jsx":"preserve"}}', size: 50 },
  ];
}

// ─── Profile: Python Flask (no JS at all) ──────────────────────

function pythonFlaskFiles(): FileEntry[] {
  return [
    { path: "app.py", content: 'from flask import Flask, jsonify\napp = Flask(__name__)\n\n@app.route("/api/health")\ndef health():\n    return jsonify(status="ok")\n\nif __name__ == "__main__":\n    app.run(debug=True)', size: 160 },
    { path: "models.py", content: 'from sqlalchemy import Column, Integer, String\nfrom database import Base\n\nclass User(Base):\n    __tablename__ = "users"\n    id = Column(Integer, primary_key=True)\n    name = Column(String(100))\n    email = Column(String(200))', size: 200 },
    { path: "database.py", content: 'from sqlalchemy import create_engine\nfrom sqlalchemy.ext.declarative import declarative_base\nBase = declarative_base()\nengine = create_engine("sqlite:///app.db")', size: 150 },
    { path: "requirements.txt", content: 'flask==3.0.0\nsqlalchemy==2.0.25\npytest==8.0.0\nblack==24.1.0', size: 60 },
    { path: "tests/test_app.py", content: 'import pytest\nfrom app import app\n\ndef test_health():\n    client = app.test_client()\n    r = client.get("/api/health")\n    assert r.status_code == 200', size: 140 },
    { path: "README.md", content: '# Flask API\nA Python Flask REST API with SQLAlchemy.', size: 50 },
    { path: ".gitignore", content: '__pycache__/\n*.pyc\nvenv/\n.env', size: 30 },
    { path: "Dockerfile", content: 'FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\nCOPY . .\nCMD ["python", "app.py"]', size: 120 },
  ];
}

// ─── Profile: Styled-components (React + CSS-in-JS) ────────────

function styledComponentsFiles(): FileEntry[] {
  return [
    { path: "src/App.tsx", content: 'import styled from "styled-components";\nconst Container = styled.div`max-width: 1200px;`;\nexport default function App() { return <Container>Hello</Container> }', size: 150 },
    { path: "src/components/Button.tsx", content: 'import styled from "styled-components";\nexport const Button = styled.button`\n  background: ${p => p.theme.colors.primary};\n  border-radius: 4px;\n`;', size: 130 },
    { path: "src/theme.ts", content: 'export const theme = { colors: { primary: "#3b82f6", bg: "#fff" } };', size: 70 },
    { path: "package.json", content: '{"name":"styled-app","dependencies":{"react":"18.2.0","react-dom":"18.2.0","styled-components":"6.1.0"},"devDependencies":{"typescript":"5.0.0","vite":"5.0.0"}}', size: 170 },
    { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true,"jsx":"react-jsx"}}', size: 50 },
    { path: "src/index.tsx", content: 'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\ncreateRoot(document.getElementById("root")!).render(<App/>);', size: 140 },
  ];
}

// ─── Profile: CSS Modules (React, no Tailwind, no styled-components) ─

function cssModulesFiles(): FileEntry[] {
  return [
    { path: "src/App.tsx", content: 'import styles from "./App.module.css";\nexport default function App() { return <div className={styles.app}>Hello</div> }', size: 110 },
    { path: "src/App.module.css", content: '.app { max-width: 1200px; margin: 0 auto; }\n.title { font-size: 2rem; }', size: 70 },
    { path: "src/components/Card.tsx", content: 'import styles from "./Card.module.scss";\nexport function Card({ children }: { children: React.ReactNode }) { return <div className={styles.card}>{children}</div> }', size: 150 },
    { path: "src/components/Card.module.scss", content: '.card { background: #fff; border-radius: 8px; padding: 16px; }', size: 65 },
    { path: "package.json", content: '{"name":"css-modules-app","dependencies":{"react":"18.2.0","react-dom":"18.2.0","next":"14.0.0"},"devDependencies":{"typescript":"5.0.0"}}', size: 140 },
    { path: "next.config.mjs", content: "export default {}", size: 18 },
    { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
    { path: "app/page.tsx", content: 'import styles from "./page.module.css";\nexport default function Home() { return <div className={styles.home}>Home</div> }', size: 110 },
    { path: "app/page.module.css", content: '.home { padding: 24px; }', size: 25 },
  ];
}

// ─── Profile: Minimal project (2 files) ────────────────────────

function minimalFiles(): FileEntry[] {
  return [
    { path: "index.ts", content: 'export const hello = "world";', size: 28 },
    { path: "package.json", content: '{"name":"minimal","dependencies":{}}', size: 36 },
  ];
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe("Vue + Sass profile", () => {
  const snap = makeSnapshot({
    files: vueSassFiles(),
    project_name: "vue-sass-app",
    frameworks: ["vue"],
    project_type: "web_application",
  });

  it("theme design-tokens detect sass styling approach", () => {
    const result = generateFiles(makeInput(snap, ["design-tokens.json"]));
    const token = result.files.find(f => f.path === "design-tokens.json")!;
    const parsed = JSON.parse(token.content);
    expect(parsed.styling_approach).toBe("sass");
    expect(parsed.detected_stack.has_sass).toBe(true);
    expect(parsed.detected_stack.has_tailwind).toBe(false);
    expect(parsed.detected_stack.has_css_in_js).toBe(false);
  });

  it("theme-guidelines mention vanilla CSS or Sass (not Tailwind)", () => {
    const result = generateFiles(makeInput(snap, ["theme-guidelines.md"]));
    const file = result.files.find(f => f.path === "theme-guidelines.md")!;
    expect(file.content).not.toContain("Detected: Tailwind CSS");
    expect(file.content).not.toContain("Detected: CSS-in-JS");
  });

  it("frontend rules include Vue conventions", () => {
    const result = generateFiles(makeInput(snap, ["frontend-rules.md"]));
    const file = result.files.find(f => f.path === "frontend-rules.md")!;
    expect(file.content).toContain("<script setup>");
    expect(file.content).toContain(".vue");
    expect(file.content).not.toContain("Server Components");
  });

  it("generates valid files for all requested outputs", () => {
    const result = generateFiles(makeInput(snap, [
      "design-tokens.json", "theme.css", "theme-guidelines.md",
      "frontend-rules.md", "component-guidelines.md",
    ]));
    expect(result.files.length).toBeGreaterThanOrEqual(5);
    for (const f of result.files) {
      expect(f.content.length).toBeGreaterThan(0);
      expect(f.program).toBeTruthy();
      expect(f.content_type).toBeTruthy();
    }
  });
});

describe("Python Flask profile", () => {
  const snap = makeSnapshot({
    files: pythonFlaskFiles(),
    project_name: "flask-api",
    frameworks: ["flask"],
    project_type: "api_service",
  });

  it("theme design-tokens detect plain-css (no JS styling)", () => {
    const result = generateFiles(makeInput(snap, ["design-tokens.json"]));
    const token = result.files.find(f => f.path === "design-tokens.json")!;
    const parsed = JSON.parse(token.content);
    expect(parsed.styling_approach).toBe("plain-css");
    expect(parsed.detected_stack.has_tailwind).toBe(false);
    expect(parsed.detected_stack.has_css_in_js).toBe(false);
    expect(parsed.detected_stack.has_css_modules).toBe(false);
    expect(parsed.detected_stack.has_sass).toBe(false);
  });

  it("theme-guidelines say 'no CSS framework detected'", () => {
    const result = generateFiles(makeInput(snap, ["theme-guidelines.md"]));
    const file = result.files.find(f => f.path === "theme-guidelines.md")!;
    expect(file.content).toContain("No CSS framework detected");
  });

  it("frontend rules omit React/Vue/Next.js conventions", () => {
    const result = generateFiles(makeInput(snap, ["frontend-rules.md"]));
    const file = result.files.find(f => f.path === "frontend-rules.md")!;
    expect(file.content).not.toContain("functional components with hooks");
    expect(file.content).not.toContain("Server Components");
    expect(file.content).not.toContain("<script setup>");
  });

  it("optimization rules show small-project context window note", () => {
    const result = generateFiles(makeInput(snap, ["optimization-rules.md"]));
    const file = result.files.find(f => f.path === "optimization-rules.md")!;
    expect(file.content).toContain("comfortably fits");
    expect(file.content).not.toContain("Warning:");
    expect(file.content).toContain("flask-api");
  });

  it("core search outputs still generate for non-JS projects", () => {
    const result = generateFiles(makeInput(snap, []));
    const paths = result.files.map(f => f.path);
    expect(paths).toContain("context-map.json");
    expect(paths).toContain("repo-profile.yaml");
    expect(paths).toContain("architecture-summary.md");
  });
});

describe("styled-components profile", () => {
  const snap = makeSnapshot({
    files: styledComponentsFiles(),
    project_name: "styled-app",
    frameworks: ["react"],
    project_type: "web_application",
  });

  it("theme design-tokens detect css-in-js styling approach", () => {
    const result = generateFiles(makeInput(snap, ["design-tokens.json"]));
    const token = result.files.find(f => f.path === "design-tokens.json")!;
    const parsed = JSON.parse(token.content);
    expect(parsed.styling_approach).toBe("css-in-js");
    expect(parsed.detected_stack.has_css_in_js).toBe(true);
    expect(parsed.detected_stack.has_tailwind).toBe(false);
  });

  it("theme-guidelines mention CSS-in-JS / ThemeProvider", () => {
    const result = generateFiles(makeInput(snap, ["theme-guidelines.md"]));
    const file = result.files.find(f => f.path === "theme-guidelines.md")!;
    expect(file.content).toContain("Detected: CSS-in-JS");
    expect(file.content).toContain("ThemeProvider");
    expect(file.content).not.toContain("Detected: Tailwind CSS");
  });

  it("frontend rules include React conventions", () => {
    const result = generateFiles(makeInput(snap, ["frontend-rules.md"]));
    const file = result.files.find(f => f.path === "frontend-rules.md")!;
    expect(file.content).toContain("functional components");
  });
});

describe("CSS modules profile", () => {
  const snap = makeSnapshot({
    files: cssModulesFiles(),
    project_name: "css-modules-app",
    frameworks: ["next", "react"],
    project_type: "web_application",
  });

  it("theme design-tokens detect css-modules styling approach", () => {
    const result = generateFiles(makeInput(snap, ["design-tokens.json"]));
    const token = result.files.find(f => f.path === "design-tokens.json")!;
    const parsed = JSON.parse(token.content);
    expect(parsed.styling_approach).toBe("css-modules");
    expect(parsed.detected_stack.has_css_modules).toBe(true);
    expect(parsed.detected_stack.has_tailwind).toBe(false);
    expect(parsed.detected_stack.has_css_in_js).toBe(false);
  });

  it("theme-guidelines detect CSS Modules approach", () => {
    const result = generateFiles(makeInput(snap, ["theme-guidelines.md"]));
    const file = result.files.find(f => f.path === "theme-guidelines.md")!;
    expect(file.content).toContain("Detected: CSS Modules");
    expect(file.content).toContain("composes");
    expect(file.content).not.toContain("Detected: Tailwind CSS");
  });

  it("frontend rules include Next.js conventions", () => {
    const result = generateFiles(makeInput(snap, ["frontend-rules.md"]));
    const file = result.files.find(f => f.path === "frontend-rules.md")!;
    expect(file.content).toContain("Server Components");
  });
});

describe("minimal profile", () => {
  const snap = makeSnapshot({
    files: minimalFiles(),
    project_name: "minimal",
    frameworks: [],
    project_type: "library",
  });

  it("still generates core search outputs", () => {
    const result = generateFiles(makeInput(snap, []));
    const paths = result.files.map(f => f.path);
    expect(paths).toContain("context-map.json");
    expect(paths).toContain("repo-profile.yaml");
    expect(paths).toContain("architecture-summary.md");
  });

  it("optimization classifies as small project", () => {
    const result = generateFiles(makeInput(snap, ["optimization-rules.md"]));
    const file = result.files.find(f => f.path === "optimization-rules.md")!;
    expect(file.content).toContain("comfortably fits");
  });

  it("design-tokens default to plain-css", () => {
    const result = generateFiles(makeInput(snap, ["design-tokens.json"]));
    const token = result.files.find(f => f.path === "design-tokens.json")!;
    const parsed = JSON.parse(token.content);
    expect(parsed.styling_approach).toBe("plain-css");
  });

  it("context-map JSON is valid with minimal data", () => {
    const result = generateFiles(makeInput(snap, []));
    const file = result.files.find(f => f.path === "context-map.json")!;
    const parsed = JSON.parse(file.content);
    expect(parsed.project_identity.name).toBe("minimal");
    expect(parsed.version).toBe("1.0.0");
  });

  it("each generated file has non-empty content, program, and content_type", () => {
    const result = generateFiles(makeInput(snap, [
      "AGENTS.md", "debug-playbook.md", "seo-rules.md",
      "optimization-rules.md", "design-tokens.json",
    ]));
    for (const f of result.files) {
      expect(f.content.length, `${f.path} should have content`).toBeGreaterThan(0);
      expect(f.program, `${f.path} should have program`).toBeTruthy();
      expect(f.content_type, `${f.path} should have content_type`).toBeTruthy();
    }
  });
});
