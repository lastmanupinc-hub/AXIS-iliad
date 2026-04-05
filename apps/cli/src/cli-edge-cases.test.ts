import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { scanDirectory } from "./scanner.js";
import { run } from "./runner.js";
import { writeGeneratedFiles } from "./writer.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `axis-edge-${randomUUID().slice(0, 8)}`);
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

// ─── Scanner edge cases ─────────────────────────────────────────

describe("scanner edge cases", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("skips files exceeding MAX_FILE_SIZE (256 KB)", () => {
    const bigContent = "x".repeat(256 * 1024 + 1);
    writeFixture(tmp, {
      "src/small.ts": "export const x = 1;",
      "src/big.ts": bigContent,
    });

    const result = scanDirectory(tmp);
    expect(result.files.length).toBe(1);
    expect(result.files[0].path).toBe("src/small.ts");
    expect(result.skipped_count).toBe(1);
  });

  it("caps scanned files at MAX_FILES (500)", { timeout: 15000 }, () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 510; i++) {
      files[`src/f${String(i).padStart(4, "0")}.ts`] = `export const v = ${i};`;
    }
    writeFixture(tmp, files);

    const result = scanDirectory(tmp);
    expect(result.files.length).toBe(500);
  });

  it("skips dot-prefixed directories", () => {
    writeFixture(tmp, {
      "src/index.ts": "export const a = 1;",
      ".hidden/secret.ts": "export const b = 2;",
      ".config/settings.ts": "export const c = 3;",
    });

    const result = scanDirectory(tmp);
    expect(result.files.length).toBe(1);
    expect(result.files[0].path).toBe("src/index.ts");
  });

  it("includes extensionless config files", () => {
    writeFixture(tmp, {
      "Dockerfile": "FROM node:22-alpine",
      "Makefile": "build:\n\techo build",
      ".gitignore": "node_modules\ndist",
      ".eslintrc": '{ "extends": "eslint:recommended" }',
      ".prettierrc": '{ "semi": false }',
      "src/index.ts": "export const x = 1;",
    });

    const result = scanDirectory(tmp);
    const paths = result.files.map((f) => f.path).sort();
    expect(paths).toContain("Dockerfile");
    expect(paths).toContain("Makefile");
    expect(paths).toContain(".gitignore");
    expect(paths).toContain(".eslintrc");
    expect(paths).toContain(".prettierrc");
    expect(paths).toContain("src/index.ts");
    expect(result.files.length).toBe(6);
  });

  it("total_bytes matches sum of individual file sizes", () => {
    const content1 = "export const a = 1;";
    const content2 = '{ "name": "test" }';
    const content3 = "# Readme\nHello world 🌍";
    writeFixture(tmp, {
      "src/a.ts": content1,
      "package.json": content2,
      "README.md": content3,
    });

    const result = scanDirectory(tmp);
    const expectedBytes =
      Buffer.byteLength(content1, "utf-8") +
      Buffer.byteLength(content2, "utf-8") +
      Buffer.byteLength(content3, "utf-8");
    expect(result.total_bytes).toBe(expectedBytes);
  });

  it("multiple oversized files all increment skipped_count", () => {
    writeFixture(tmp, {
      "src/a.ts": "export const a = 1;",
      "src/big1.ts": "x".repeat(256 * 1024 + 100),
      "src/big2.ts": "y".repeat(256 * 1024 + 200),
      "README.md": "# Hello",
    });

    const result = scanDirectory(tmp);
    expect(result.files.length).toBe(2);
    expect(result.skipped_count).toBe(2);
  });
});

// ─── Runner edge cases ──────────────────────────────────────────

describe("runner edge cases", () => {
  it("falls back to directory name with malformed package.json", () => {
    const scan = {
      files: [
        { path: "package.json", content: "NOT VALID JSON {{{{", size: 20 },
        { path: "src/index.ts", content: "export const x = 1;", size: 20 },
      ],
      skipped_count: 0,
      total_bytes: 40,
    };

    const result = run(scan, "/tmp/fallback-project");
    expect(result.project_name).toBe("fallback-project");
    expect(result.generator_result.files.length).toBe(80);
  });

  it("falls back to directory name when package.json has no name field", () => {
    const scan = {
      files: [
        { path: "package.json", content: '{ "version": "1.0.0" }', size: 25 },
        { path: "src/index.ts", content: "export const x = 1;", size: 20 },
      ],
      skipped_count: 0,
      total_bytes: 45,
    };

    const result = run(scan, "/tmp/dir-name-fallback");
    expect(result.project_name).toBe("dir-name-fallback");
    expect(result.generator_result.files.length).toBe(80);
  });

  it("handles fullstack web project (Next.js)", () => {
    const scan = {
      files: [
        { path: "package.json", content: JSON.stringify({ name: "my-next-app", dependencies: { react: "^18", next: "^14" } }), size: 70 },
        { path: "src/app/page.tsx", content: "export default function Home() { return <h1>Home</h1>; }", size: 60 },
        { path: "next.config.js", content: "module.exports = {}", size: 25 },
      ],
      skipped_count: 0,
      total_bytes: 155,
    };

    const result = run(scan, "/tmp/my-next-app");
    expect(result.project_name).toBe("my-next-app");
    expect(result.generator_result.files.length).toBe(80);
  });

  it("handles frontend-only project (React without meta-framework)", () => {
    const scan = {
      files: [
        { path: "package.json", content: JSON.stringify({ name: "react-spa", dependencies: { react: "^18", "react-dom": "^18" }, devDependencies: { vite: "^5" } }), size: 100 },
        { path: "src/App.tsx", content: "export default function App() { return <div/>; }", size: 50 },
        { path: "src/main.tsx", content: "import React from 'react';", size: 30 },
      ],
      skipped_count: 0,
      total_bytes: 180,
    };

    const result = run(scan, "/tmp/react-spa");
    expect(result.project_name).toBe("react-spa");
    expect(result.generator_result.files.length).toBe(80);
  });

  it("handles backend API project (Express)", () => {
    const scan = {
      files: [
        { path: "package.json", content: JSON.stringify({ name: "api-server", dependencies: { express: "^4", cors: "^2" } }), size: 70 },
        { path: "src/server.ts", content: "import express from 'express';\nconst app = express();", size: 55 },
        { path: "src/routes.ts", content: "export const router = express.Router();", size: 40 },
      ],
      skipped_count: 0,
      total_bytes: 165,
    };

    const result = run(scan, "/tmp/api-server");
    expect(result.project_name).toBe("api-server");
    expect(result.generator_result.files.length).toBe(80);
  });

  it("handles backend API project (Django via requirements.txt)", () => {
    const scan = {
      files: [
        { path: "requirements.txt", content: "django==4.2\ngunicorn==21.2\npsycopg2-binary==2.9", size: 55 },
        { path: "manage.py", content: "#!/usr/bin/env python\nimport django", size: 40 },
        { path: "myapp/views.py", content: "from django.http import JsonResponse", size: 40 },
        { path: "myapp/models.py", content: "from django.db import models", size: 30 },
      ],
      skipped_count: 0,
      total_bytes: 165,
    };

    const result = run(scan, "/tmp/django-backend");
    expect(result.project_name).toBe("django-backend");
    expect(result.generator_result.files.length).toBe(80);
  });

  it("handles native app project (React Native)", () => {
    const scan = {
      files: [
        { path: "package.json", content: JSON.stringify({ name: "my-mobile-app", dependencies: { "react-native": "0.73.0", react: "^18" } }), size: 90 },
        { path: "App.tsx", content: "import { View, Text } from 'react-native';", size: 45 },
      ],
      skipped_count: 0,
      total_bytes: 135,
    };

    const result = run(scan, "/tmp/my-mobile-app");
    expect(result.project_name).toBe("my-mobile-app");
    expect(result.generator_result.files.length).toBe(80);
  });

  it("handles static site project (HTML without frameworks)", () => {
    const scan = {
      files: [
        { path: "index.html", content: "<!DOCTYPE html><html><body>Hello</body></html>", size: 50 },
        { path: "about.html", content: "<!DOCTYPE html><html><body>About</body></html>", size: 50 },
        { path: "style.css", content: "body { margin: 0; }", size: 20 },
        { path: "script.js", content: "console.log('hello');", size: 25 },
      ],
      skipped_count: 0,
      total_bytes: 145,
    };

    const result = run(scan, "/tmp/static-site");
    expect(result.project_name).toBe("static-site");
    expect(result.generator_result.files.length).toBe(80);
  });

  it("handles library project (default type, no frameworks)", () => {
    const scan = {
      files: [
        { path: "package.json", content: JSON.stringify({ name: "@scope/utils" }), size: 30 },
        { path: "src/index.ts", content: "export function add(a: number, b: number) { return a + b; }", size: 60 },
        { path: "src/format.ts", content: "export function format(s: string) { return s.trim(); }", size: 55 },
      ],
      skipped_count: 0,
      total_bytes: 145,
    };

    const result = run(scan, "/tmp/utils");
    expect(result.project_name).toBe("@scope/utils");
    expect(result.generator_result.files.length).toBe(80);
  });

  it("handles Python-only project", () => {
    const scan = {
      files: [
        { path: "main.py", content: "print('hello')", size: 15 },
        { path: "utils.py", content: "def add(a, b): return a + b", size: 30 },
        { path: "tests/test_main.py", content: "def test_main(): pass", size: 25 },
      ],
      skipped_count: 0,
      total_bytes: 70,
    };

    const result = run(scan, "/tmp/py-project");
    expect(result.project_name).toBe("py-project");
    expect(result.generator_result.files.length).toBe(80);
  });

  it("handles Go project", () => {
    const scan = {
      files: [
        { path: "main.go", content: "package main\nfunc main() {}", size: 30 },
        { path: "handler.go", content: "package main\nfunc Handler() {}", size: 35 },
      ],
      skipped_count: 0,
      total_bytes: 65,
    };

    const result = run(scan, "/tmp/go-app");
    expect(result.project_name).toBe("go-app");
    expect(result.generator_result.files.length).toBe(80);
  });

  it("handles Rust project", () => {
    const scan = {
      files: [
        { path: "src/main.rs", content: 'fn main() { println!("hello"); }', size: 35 },
        { path: "src/lib.rs", content: "pub fn add(a: i32, b: i32) -> i32 { a + b }", size: 45 },
      ],
      skipped_count: 0,
      total_bytes: 80,
    };

    const result = run(scan, "/tmp/rust-app");
    expect(result.project_name).toBe("rust-app");
    expect(result.generator_result.files.length).toBe(80);
  });

  it("detects multiple frameworks from package.json", () => {
    const scan = {
      files: [
        {
          path: "package.json",
          content: JSON.stringify({
            name: "full-stack",
            dependencies: { react: "^18", next: "^14", prisma: "^5" },
            devDependencies: { vitest: "^2", tailwindcss: "^3" },
          }),
          size: 150,
        },
        { path: "src/index.tsx", content: "export default function App() { return <div/>; }", size: 50 },
      ],
      skipped_count: 0,
      total_bytes: 200,
    };

    const result = run(scan, "/tmp/full-stack");
    expect(result.project_name).toBe("full-stack");
    expect(result.generator_result.files.length).toBe(80);
  });

  it("handles scan with zero files", () => {
    const scan = { files: [], skipped_count: 0, total_bytes: 0 };

    const result = run(scan, "/tmp/empty-project");
    expect(result.project_name).toBe("empty-project");
    expect(result.generator_result.files.length).toBe(80);
  });
});

// ─── Writer edge cases ──────────────────────────────────────────

describe("writer edge cases", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("overwrites existing files without error", () => {
    const files = [
      { path: "output.md", content: "# Version 1", content_type: "markdown", program: "test", description: "v1" },
    ];

    writeGeneratedFiles(files, tmp);
    expect(readFileSync(join(tmp, "output.md"), "utf-8")).toBe("# Version 1");

    const updated = [
      { path: "output.md", content: "# Version 2", content_type: "markdown", program: "test", description: "v2" },
    ];

    const result = writeGeneratedFiles(updated, tmp);
    expect(result.files_written).toBe(1);
    expect(readFileSync(join(tmp, "output.md"), "utf-8")).toBe("# Version 2");
  });

  it("handles unicode content correctly", () => {
    const content = "# 日本語テスト\n\n🎉 Emoji content 🚀\n中文字符 العربية";
    const files = [
      { path: "unicode.md", content, content_type: "markdown", program: "test", description: "Unicode test" },
    ];

    const result = writeGeneratedFiles(files, tmp);
    expect(result.total_bytes).toBe(Buffer.byteLength(content, "utf-8"));
    expect(readFileSync(join(tmp, "unicode.md"), "utf-8")).toBe(content);
  });

  it("handles paths with spaces in directory names", () => {
    const files = [
      { path: "my folder/sub dir/file.md", content: "# Test", content_type: "markdown", program: "test", description: "Spaces" },
    ];

    const result = writeGeneratedFiles(files, tmp);
    expect(result.files_written).toBe(1);
    expect(existsSync(join(tmp, "my folder", "sub dir", "file.md"))).toBe(true);
  });
});
