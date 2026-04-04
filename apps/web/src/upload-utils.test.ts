import { describe, it, expect } from "vitest";
import { shouldIgnore, detectFrameworks, IGNORED_PATTERNS } from "./upload-utils.ts";

// ─── shouldIgnore ───────────────────────────────────────────────

describe("shouldIgnore", () => {
  it("ignores node_modules paths", () => {
    expect(shouldIgnore("node_modules/react/index.js")).toBe(true);
    expect(shouldIgnore("src/node_modules/foo.ts")).toBe(true);
  });

  it("ignores .git paths", () => {
    expect(shouldIgnore(".git/HEAD")).toBe(true);
    expect(shouldIgnore(".git/config")).toBe(true);
  });

  it("ignores dist and build outputs", () => {
    expect(shouldIgnore("dist/bundle.js")).toBe(true);
    expect(shouldIgnore(".next/server/app.js")).toBe(true);
  });

  it("ignores Python cache and venv", () => {
    expect(shouldIgnore("__pycache__/module.pyc")).toBe(true);
    expect(shouldIgnore(".venv/lib/python3.11/site.py")).toBe(true);
  });

  it("ignores lockfiles", () => {
    expect(shouldIgnore("package-lock.json")).toBe(true);
    expect(shouldIgnore("pnpm-lock.yaml")).toBe(true);
    expect(shouldIgnore("yarn.lock")).toBe(true);
  });

  it("ignores .DS_Store", () => {
    expect(shouldIgnore(".DS_Store")).toBe(true);
    expect(shouldIgnore("src/.DS_Store")).toBe(true);
  });

  it("ignores target/ (Rust/Java build)", () => {
    expect(shouldIgnore("target/debug/binary")).toBe(true);
  });

  it("allows normal source files", () => {
    expect(shouldIgnore("src/index.ts")).toBe(false);
    expect(shouldIgnore("README.md")).toBe(false);
    expect(shouldIgnore("package.json")).toBe(false);
    expect(shouldIgnore("lib/utils.py")).toBe(false);
  });

  it("allows paths with similar but non-matching names", () => {
    expect(shouldIgnore("src/git-utils.ts")).toBe(false);
    expect(shouldIgnore("src/dist-config.ts")).toBe(false);
  });

  it("IGNORED_PATTERNS has expected count", () => {
    expect(IGNORED_PATTERNS.length).toBeGreaterThanOrEqual(11);
  });
});

// ─── detectFrameworks ───────────────────────────────────────────

describe("detectFrameworks", () => {
  it("detects React from package.json", () => {
    const files = [
      { path: "package.json", content: JSON.stringify({ dependencies: { react: "^19.0.0" } }) },
    ];
    expect(detectFrameworks(files)).toContain("react");
  });

  it("detects multiple JS frameworks", () => {
    const files = [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: { react: "^19", next: "^14", express: "^4" },
          devDependencies: { typescript: "^5", vite: "^6", tailwindcss: "^4" },
        }),
      },
    ];
    const result = detectFrameworks(files);
    expect(result).toContain("react");
    expect(result).toContain("next");
    expect(result).toContain("express");
    expect(result).toContain("typescript");
    expect(result).toContain("vite");
    expect(result).toContain("tailwind");
  });

  it("detects Vue", () => {
    const files = [
      { path: "package.json", content: JSON.stringify({ dependencies: { vue: "^3.4" } }) },
    ];
    expect(detectFrameworks(files)).toContain("vue");
  });

  it("detects Svelte", () => {
    const files = [
      { path: "package.json", content: JSON.stringify({ dependencies: { svelte: "^4" } }) },
    ];
    expect(detectFrameworks(files)).toContain("svelte");
  });

  it("detects Angular", () => {
    const files = [
      { path: "package.json", content: JSON.stringify({ dependencies: { "@angular/core": "^17" } }) },
    ];
    expect(detectFrameworks(files)).toContain("angular");
  });

  it("detects Flask from Python imports", () => {
    const files = [
      { path: "app.py", content: "from flask import Flask\napp = Flask(__name__)" },
    ];
    expect(detectFrameworks(files)).toContain("flask");
  });

  it("detects Django from Python imports", () => {
    const files = [
      { path: "manage.py", content: "from django.core.management import execute_from_command_line" },
    ];
    expect(detectFrameworks(files)).toContain("django");
  });

  it("detects FastAPI from Python imports", () => {
    const files = [
      { path: "main.py", content: "from fastapi import FastAPI\napp = FastAPI()" },
    ];
    expect(detectFrameworks(files)).toContain("fastapi");
  });

  it("detects multiple Python frameworks", () => {
    const files = [
      { path: "app.py", content: "from flask import Flask" },
      { path: "api.py", content: "from fastapi import FastAPI" },
    ];
    const result = detectFrameworks(files);
    expect(result).toContain("flask");
    expect(result).toContain("fastapi");
  });

  it("returns empty for no frameworks", () => {
    const files = [{ path: "main.c", content: "#include <stdio.h>" }];
    expect(detectFrameworks(files)).toEqual([]);
  });

  it("returns empty for empty files array", () => {
    expect(detectFrameworks([])).toEqual([]);
  });

  it("handles invalid package.json gracefully", () => {
    const files = [{ path: "package.json", content: "not json{{{" }];
    expect(detectFrameworks(files)).toEqual([]);
  });

  it("handles package.json without dependencies", () => {
    const files = [{ path: "package.json", content: JSON.stringify({ name: "my-pkg" }) }];
    expect(detectFrameworks(files)).toEqual([]);
  });

  it("does not detect Python frameworks without .py files", () => {
    const files = [
      { path: "readme.md", content: "from flask import Flask" },
    ];
    expect(detectFrameworks(files)).not.toContain("flask");
  });
});
