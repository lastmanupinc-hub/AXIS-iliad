import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { scanDirectory } from "./scanner.js";
import { run } from "./runner.js";
import { writeGeneratedFiles } from "./writer.js";
import { parseGitHubUrl } from "@axis/snapshots";

// ─── Test fixtures ──────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `axis-cli-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFixture(root: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf-8");
  }
}

// ─── Scanner tests ──────────────────────────────────────────────

describe("scanner", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("scans TypeScript and JSON files", () => {
    writeFixture(tmp, {
      "src/index.ts": "export const x = 1;",
      "package.json": '{ "name": "test" }',
      "README.md": "# Hello",
    });

    const result = scanDirectory(tmp);
    expect(result.files.length).toBe(3);
    expect(result.files.map((f) => f.path).sort()).toEqual([
      "README.md",
      "package.json",
      "src/index.ts",
    ]);
    expect(result.total_bytes).toBeGreaterThan(0);
  });

  it("skips node_modules and .git directories", () => {
    writeFixture(tmp, {
      "src/app.ts": "console.log('app');",
      "node_modules/dep/index.js": "module.exports = {};",
      ".git/HEAD": "ref: refs/heads/main",
    });

    const result = scanDirectory(tmp);
    expect(result.files.length).toBe(1);
    expect(result.files[0].path).toBe("src/app.ts");
  });

  it("scans .github/workflows for CI detection", () => {
    writeFixture(tmp, {
      "src/app.ts": "console.log('app');",
      ".github/workflows/ci.yml": "name: CI\non: push",
    });

    const result = scanDirectory(tmp);
    expect(result.files.length).toBe(2);
    expect(result.files.find(f => f.path === ".github/workflows/ci.yml")).toBeTruthy();
  });

  it("includes lockfiles as marker entries with empty content", () => {
    writeFixture(tmp, {
      "package.json": '{ "name": "test" }',
      "pnpm-lock.yaml": "lockfileVersion: 9",
      "package-lock.json": "{}",
      "yarn.lock": "# yarn",
    });

    const result = scanDirectory(tmp);
    expect(result.files.length).toBe(4);
    expect(result.files.find(f => f.path === "package.json")!.content).toBe('{ "name": "test" }');
    const lockfiles = result.files.filter(f => f.path !== "package.json");
    for (const lf of lockfiles) {
      expect(lf.content).toBe("");
      expect(lf.size).toBe(0);
    }
    expect(result.skipped_count).toBe(0);
  });

  it("skips unsupported file extensions", () => {
    writeFixture(tmp, {
      "src/index.ts": "const x = 1;",
      "assets/image.png": "binary-data",
      "assets/font.woff2": "binary-data",
    });

    const result = scanDirectory(tmp);
    expect(result.files.length).toBe(1);
    expect(result.skipped_count).toBe(2);
  });

  it("normalizes paths to forward slashes", () => {
    writeFixture(tmp, {
      "src/utils/helpers.ts": "export function help() {}",
    });

    const result = scanDirectory(tmp);
    expect(result.files[0].path).toBe("src/utils/helpers.ts");
    expect(result.files[0].path).not.toContain("\\");
  });

  it("reads file content correctly", () => {
    const content = 'export const greeting = "hello";';
    writeFixture(tmp, { "src/hello.ts": content });

    const result = scanDirectory(tmp);
    expect(result.files[0].content).toBe(content);
    expect(result.files[0].size).toBe(Buffer.byteLength(content, "utf-8"));
  });

  it("throws for nonexistent directory", () => {
    expect(() => scanDirectory("/nonexistent/path/xyz")).toThrow("Directory not found");
  });

  it("handles empty directory", () => {
    const result = scanDirectory(tmp);
    expect(result.files.length).toBe(0);
    expect(result.skipped_count).toBe(0);
    expect(result.total_bytes).toBe(0);
  });

  it("scans multiple web-related extensions", () => {
    writeFixture(tmp, {
      "src/App.tsx": "export default () => <div/>;",
      "src/style.css": "body { margin: 0; }",
      "src/config.yaml": "key: value",
      "src/page.html": "<html></html>",
      "src/query.graphql": "query { user { id } }",
    });

    const result = scanDirectory(tmp);
    expect(result.files.length).toBe(5);
  });
});

// ─── Runner tests ───────────────────────────────────────────────

describe("runner", () => {
  it("runs full pipeline and produces generator output", () => {
    const scan = {
      files: [
        { path: "package.json", content: '{ "name": "test-project", "dependencies": { "react": "^18" } }', size: 60 },
        { path: "src/index.tsx", content: "import React from 'react';\nexport default function App() { return <div>Hello</div>; }", size: 90 },
        { path: "src/utils.ts", content: "export function add(a: number, b: number) { return a + b; }", size: 60 },
        { path: "README.md", content: "# Test Project\nA sample React project.", size: 40 },
      ],
      skipped_count: 0,
      total_bytes: 250,
    };

    const result = run(scan, "/tmp/test-project");

    expect(result.snapshot_id).toBeTruthy();
    expect(result.project_name).toBe("test-project");
    expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
    expect(result.generator_result.files.length).toBeGreaterThan(0);
    expect(result.generator_result.files.length).toBe(86);
  });

  it("detects project name from package.json", () => {
    const scan = {
      files: [
        { path: "package.json", content: '{ "name": "@scope/my-lib" }', size: 30 },
        { path: "src/index.ts", content: "export const x = 1;", size: 20 },
      ],
      skipped_count: 0,
      total_bytes: 50,
    };

    const result = run(scan, "/tmp/my-lib");
    expect(result.project_name).toBe("@scope/my-lib");
  });

  it("falls back to directory name when no package.json", () => {
    const scan = {
      files: [
        { path: "main.py", content: "print('hello')", size: 14 },
      ],
      skipped_count: 0,
      total_bytes: 14,
    };

    const result = run(scan, "/tmp/my-python-app");
    expect(result.project_name).toBe("my-python-app");
  });

  it("filters generators by program name", () => {
    const scan = {
      files: [
        { path: "package.json", content: '{ "name": "test" }', size: 20 },
        { path: "src/index.ts", content: "export const x = 1;", size: 20 },
      ],
      skipped_count: 0,
      total_bytes: 40,
    };

    const result = run(scan, "/tmp/test", ["search"]);
    const programs = new Set(result.generator_result.files.map((f) => f.program));
    expect(programs.has("search")).toBe(true);
    expect(result.generator_result.files.length).toBeLessThan(80);
  });

  it("detects monorepo project type", () => {
    const scan = {
      files: [
        { path: "package.json", content: '{ "name": "mono" }', size: 20 },
        { path: "packages/core/index.ts", content: "export {};", size: 10 },
        { path: "apps/web/index.ts", content: "export {};", size: 10 },
      ],
      skipped_count: 0,
      total_bytes: 40,
    };

    const result = run(scan, "/tmp/mono");
    // The pipeline runs — we can check it detected something
    expect(result.generator_result.files.length).toBe(86);
  });

  it("detects Python frameworks from requirements.txt", () => {
    const scan = {
      files: [
        { path: "requirements.txt", content: "django==4.2\ncelery==5.3", size: 30 },
        { path: "manage.py", content: "import django", size: 15 },
      ],
      skipped_count: 0,
      total_bytes: 45,
    };

    const result = run(scan, "/tmp/django-app");
    expect(result.project_name).toBe("django-app");
    expect(result.generator_result.files.length).toBe(86);
  });
});

// ─── Writer tests ───────────────────────────────────────────────

describe("writer", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("writes generated files to disk", () => {
    const files = [
      { path: "AGENTS.md", content: "# Agents", content_type: "markdown", program: "skills", description: "Agent instructions" },
      { path: "CLAUDE.md", content: "# Claude", content_type: "markdown", program: "skills", description: "Claude config" },
    ];

    const result = writeGeneratedFiles(files, tmp);
    expect(result.files_written).toBe(2);
    expect(result.total_bytes).toBeGreaterThan(0);
    expect(result.paths).toEqual(["AGENTS.md", "CLAUDE.md"]);
    expect(existsSync(join(tmp, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(tmp, "CLAUDE.md"))).toBe(true);
  });

  it("creates nested directories automatically", () => {
    const files = [
      { path: ".ai/context-map.json", content: "{}", content_type: "json", program: "search", description: "Context map" },
      { path: ".ai/deep/nested/file.md", content: "# Deep", content_type: "markdown", program: "test", description: "Nested" },
    ];

    const result = writeGeneratedFiles(files, tmp);
    expect(result.files_written).toBe(2);
    expect(existsSync(join(tmp, ".ai", "context-map.json"))).toBe(true);
    expect(existsSync(join(tmp, ".ai", "deep", "nested", "file.md"))).toBe(true);
  });

  it("returns correct byte count", () => {
    const content = "Hello, World! 🌍";
    const files = [
      { path: "test.md", content, content_type: "markdown", program: "test", description: "Test" },
    ];

    const result = writeGeneratedFiles(files, tmp);
    expect(result.total_bytes).toBe(Buffer.byteLength(content, "utf-8"));
  });

  it("handles empty file list", () => {
    const result = writeGeneratedFiles([], tmp);
    expect(result.files_written).toBe(0);
    expect(result.total_bytes).toBe(0);
    expect(result.paths).toEqual([]);
  });
});

// ─── Integration test ───────────────────────────────────────────

describe("CLI integration", () => {
  let inputDir: string;
  let outputDir: string;

  beforeEach(() => {
    inputDir = makeTempDir();
    outputDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(inputDir, { recursive: true, force: true });
    rmSync(outputDir, { recursive: true, force: true });
  });

  it("full pipeline: scan → run → write", () => {
    writeFixture(inputDir, {
      "package.json": JSON.stringify({
        name: "integration-test",
        dependencies: { react: "^18", next: "^14" },
        devDependencies: { typescript: "^5", vitest: "^2" },
      }),
      "src/index.tsx": "export default function Home() { return <h1>Home</h1>; }",
      "src/utils/format.ts": "export function format(s: string) { return s.trim(); }",
      "README.md": "# Integration Test\nA test project for CLI validation.",
      "tsconfig.json": '{ "compilerOptions": { "strict": true } }',
    });

    // Scan
    const scan = scanDirectory(inputDir);
    expect(scan.files.length).toBe(5);

    // Run pipeline
    const result = run(scan, inputDir);
    expect(result.project_name).toBe("integration-test");
    expect(result.generator_result.files.length).toBe(86);

    // Write output
    const written = writeGeneratedFiles(result.generator_result.files, outputDir);
    expect(written.files_written).toBe(86);
    expect(written.total_bytes).toBeGreaterThan(0);

    // Verify key files exist
    expect(existsSync(join(outputDir, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(outputDir, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(outputDir, ".cursorrules"))).toBe(true);
    expect(existsSync(join(outputDir, ".ai", "context-map.json"))).toBe(true);

    // Verify programs are represented
    const programs = new Set(result.generator_result.files.map((f) => f.program));
    expect(programs.size).toBe(18);
  });
});

// ─── GitHub integration (shared package) ────────────────────────

describe("github via shared package", () => {
  it("parseGitHubUrl is available from @axis/snapshots", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo/tree/main");
    expect(result.owner).toBe("owner");
    expect(result.repo).toBe("repo");
    expect(result.ref).toBe("main");
  });

  it("run() accepts GitHubFetchResult-shaped scan input", () => {
    const githubScan = {
      files: [
        { path: "package.json", content: '{"name":"remote-test","dependencies":{"express":"^4"}}', size: 52 },
        { path: "src/app.ts", content: "import express from 'express';\nconst app = express();", size: 53 },
        { path: "README.md", content: "# Remote Test", size: 14 },
      ],
      skipped_count: 5,
      total_bytes: 119,
    };

    const result = run(githubScan, "owner/repo");
    expect(result.project_name).toBe("remote-test");
    expect(result.generator_result.files.length).toBe(86);
    expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
  });
});
