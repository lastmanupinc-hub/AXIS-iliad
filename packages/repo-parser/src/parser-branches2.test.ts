import { describe, it, expect } from "vitest";
import { parseRepo } from "./parser.js";
import type { FileEntry } from "@axis/snapshots";

/* ─── peerDependencies extraction ──────────────────────────────── */

describe("parser: peerDependencies extraction", () => {
  it("extracts peer dependencies from package.json", () => {
    const files: FileEntry[] = [
      {
        path: "package.json",
        content: JSON.stringify({
          name: "test-lib",
          dependencies: { react: "^18.0" },
          peerDependencies: { "react-dom": "^18.0", typescript: "^5.0" },
        }),
        size: 200,
      },
      { path: "src/index.ts", content: 'export const x = 1;', size: 20 },
    ];
    const result = parseRepo(files);
    const peerDeps = result.dependencies.filter(d => d.type === "peer");
    expect(peerDeps.length).toBe(2);
    expect(peerDeps.find(d => d.name === "react-dom")).toBeDefined();
    expect(peerDeps.find(d => d.name === "typescript")).toBeDefined();
  });
});

/* ─── Go module edge cases ──────────────────────────────────────── */

describe("parser: Go module dependency parsing", () => {
  it("parses single-line require with indirect comment", () => {
    const files: FileEntry[] = [
      {
        path: "go.mod",
        content: [
          "module example.com/myapp",
          "",
          "go 1.21",
          "",
          "require golang.org/x/sync v0.3.0",
          "require golang.org/x/text v0.11.0 // indirect",
        ].join("\n"),
        size: 150,
      },
      { path: "main.go", content: 'package main\n\nfunc main() {}', size: 30 },
    ];
    const result = parseRepo(files);
    const directDep = result.dependencies.find(d => d.name === "golang.org/x/sync");
    expect(directDep).toBeDefined();
    expect(directDep!.type).toBe("production");

    const indirectDep = result.dependencies.find(d => d.name === "golang.org/x/text");
    expect(indirectDep).toBeDefined();
    expect(indirectDep!.type).toBe("optional");
  });

  it("parses block require with mixed direct/indirect", () => {
    const files: FileEntry[] = [
      {
        path: "go.mod",
        content: [
          "module example.com/myapp",
          "",
          "go 1.21",
          "",
          "require (",
          "\tgithub.com/gin-gonic/gin v1.9.0",
          "\tgithub.com/stretchr/testify v1.8.0 // indirect",
          "\tgithub.com/go-sql-driver/mysql v1.7.1",
          ")",
        ].join("\n"),
        size: 200,
      },
      { path: "main.go", content: 'package main\n\nfunc main() {}', size: 30 },
    ];
    const result = parseRepo(files);
    const gin = result.dependencies.find(d => d.name === "github.com/gin-gonic/gin");
    expect(gin).toBeDefined();
    expect(gin!.type).toBe("production");

    const testify = result.dependencies.find(d => d.name === "github.com/stretchr/testify");
    expect(testify).toBeDefined();
    expect(testify!.type).toBe("optional");

    const mysql = result.dependencies.find(d => d.name === "github.com/go-sql-driver/mysql");
    expect(mysql).toBeDefined();
    expect(mysql!.type).toBe("production");
  });
});

/* ─── has_ci FALSE path ─────────────────────────────────────────── */

describe("parser: health checks", () => {
  it("has_ci is false when no CI files present", () => {
    const files: FileEntry[] = [
      { path: "src/index.ts", content: 'export const x = 1;', size: 20 },
      { path: "package.json", content: '{"name": "test"}', size: 20 },
    ];
    const result = parseRepo(files);
    expect(result.health.has_ci).toBe(false);
  });

  it("has_ci is true with GitHub workflows", () => {
    const files: FileEntry[] = [
      { path: ".github/workflows/ci.yml", content: "name: CI", size: 10 },
      { path: "src/index.ts", content: 'export const x = 1;', size: 20 },
    ];
    const result = parseRepo(files);
    expect(result.health.has_ci).toBe(true);
  });

  it("has_ci is true with GitLab CI", () => {
    const files: FileEntry[] = [
      { path: ".gitlab-ci.yml", content: "stages: [build]", size: 20 },
      { path: "src/index.ts", content: 'export const x = 1;', size: 20 },
    ];
    const result = parseRepo(files);
    expect(result.health.has_ci).toBe(true);
  });

  it("has_ci is true with CircleCI", () => {
    const files: FileEntry[] = [
      { path: ".circleci/config.yml", content: "version: 2.1", size: 15 },
      { path: "src/index.ts", content: 'export const x = 1;', size: 20 },
    ];
    const result = parseRepo(files);
    expect(result.health.has_ci).toBe(true);
  });
});

/* ─── Go framework detection: test_frameworks ────────────────────── */

describe("parser: Go test framework detection", () => {
  it("detects go_test framework from _test.go files", () => {
    const files: FileEntry[] = [
      { path: "go.mod", content: "module example.com/app\n\ngo 1.21", size: 30 },
      { path: "main.go", content: 'package main\n\nfunc main() {}', size: 30 },
      { path: "main_test.go", content: 'package main\n\nfunc TestMain(t *testing.T) {}', size: 50 },
    ];
    const result = parseRepo(files);
    expect(result.test_frameworks).toContain("go_test");
  });
});

/* ─── Package manager detection ──────────────────────────────────── */

describe("parser: package manager detection", () => {
  it("detects go modules as package manager", () => {
    const files: FileEntry[] = [
      { path: "go.mod", content: "module example.com/app\n\ngo 1.21", size: 30 },
      { path: "main.go", content: 'package main\n\nfunc main() {}', size: 30 },
    ];
    const result = parseRepo(files);
    expect(result.package_managers).toContain("go modules");
  });
});
