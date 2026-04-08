import { describe, it, expect } from "vitest";
import { parseRepo } from "./parser.js";
import type { FileEntry } from "@axis/snapshots";

/* ================================================================= */
/* Build tool detection via deps (without config files)              */
/* ================================================================= */

describe("parser: build tools from deps only (no config files)", () => {
  it("detects turbo from package.json dependency", () => {
    const files: FileEntry[] = [
      {
        path: "package.json",
        content: '{"devDependencies":{"turbo":"^1.10"}}',
        size: 40,
      },
    ];
    const result = parseRepo(files);
    expect(result.build_tools).toContain("turbo");
  });

  it("detects webpack from package.json dependency", () => {
    const files: FileEntry[] = [
      {
        path: "package.json",
        content: '{"devDependencies":{"webpack":"^5.0"}}',
        size: 40,
      },
    ];
    const result = parseRepo(files);
    expect(result.build_tools).toContain("webpack");
  });

  it("detects vite from package.json dependency", () => {
    const files: FileEntry[] = [
      {
        path: "package.json",
        content: '{"devDependencies":{"vite":"^5.0"}}',
        size: 40,
      },
    ];
    const result = parseRepo(files);
    expect(result.build_tools).toContain("vite");
  });
});

/* ================================================================= */
/* Test framework detection via deps (without config files)          */
/* ================================================================= */

describe("parser: test frameworks from deps only (no config files)", () => {
  it("detects vitest from dependency without vitest.config", () => {
    const files: FileEntry[] = [
      {
        path: "package.json",
        content: '{"devDependencies":{"vitest":"^1.0"}}',
        size: 40,
      },
    ];
    const result = parseRepo(files);
    expect(result.test_frameworks).toContain("vitest");
  });

  it("detects jest from dependency without jest.config", () => {
    const files: FileEntry[] = [
      {
        path: "package.json",
        content: '{"devDependencies":{"jest":"^29.0"}}',
        size: 40,
      },
    ];
    const result = parseRepo(files);
    expect(result.test_frameworks).toContain("jest");
  });
});

/* ================================================================= */
/* Pytest detection via pytest.ini                                   */
/* ================================================================= */

describe("parser: pytest detection via pytest.ini", () => {
  it("detects pytest from pytest.ini file", () => {
    const files: FileEntry[] = [
      {
        path: "pytest.ini",
        content: "[pytest]\ntestpaths = tests\n",
        size: 30,
      },
    ];
    const result = parseRepo(files);
    expect(result.test_frameworks).toContain("pytest");
  });

  it("detects pytest from pyproject.toml with tool.pytest section", () => {
    const files: FileEntry[] = [
      {
        path: "pyproject.toml",
        content: '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
        size: 50,
      },
    ];
    const result = parseRepo(files);
    expect(result.test_frameworks).toContain("pytest");
  });
});

/* ================================================================= */
/* Go module: no go.mod file present                                 */
/* ================================================================= */

describe("parser: no go.mod file", () => {
  it("returns empty go module info when no go.mod exists", () => {
    const files: FileEntry[] = [
      {
        path: "main.go",
        content: 'package main\n\nfunc main() {}\n',
        size: 30,
      },
    ];
    const result = parseRepo(files);
    // go_module should have null module_path
    expect(result.go_module.module_path).toBeNull();
  });
});

/* ================================================================= */
/* Additional test framework detection                               */
/* ================================================================= */

describe("parser: mocha and cypress from deps", () => {
  it("detects mocha framework from dependency", () => {
    const files: FileEntry[] = [
      {
        path: "package.json",
        content: '{"devDependencies":{"mocha":"^10.0"}}',
        size: 40,
      },
    ];
    const result = parseRepo(files);
    expect(result.test_frameworks).toContain("mocha");
  });

  it("detects cypress framework from dependency", () => {
    const files: FileEntry[] = [
      {
        path: "package.json",
        content: '{"devDependencies":{"cypress":"^13.0"}}',
        size: 40,
      },
    ];
    const result = parseRepo(files);
    expect(result.test_frameworks).toContain("cypress");
  });
});

/* ================================================================= */
/* Build tool: esbuild from deps                                     */
/* ================================================================= */

describe("parser: esbuild from deps", () => {
  it("detects esbuild build tool", () => {
    const files: FileEntry[] = [
      {
        path: "package.json",
        content: '{"devDependencies":{"esbuild":"^0.19"}}',
        size: 40,
      },
    ];
    const result = parseRepo(files);
    expect(result.build_tools).toContain("esbuild");
  });
});

/* ================================================================= */
/* Go module path extraction (go.mod exists)                         */
/* ================================================================= */

describe("parser: go.mod module path extraction", () => {
  it("extracts module path from go.mod", () => {
    const files: FileEntry[] = [
      {
        path: "go.mod",
        content: "module github.com/user/project\n\ngo 1.21\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.0\n)\n",
        size: 80,
      },
    ];
    const result = parseRepo(files);
    expect(result.go_module.module_path).toBe("github.com/user/project");
    expect(result.go_module.go_version).toBe("1.21");
  });
});

/* ================================================================= */
/* Build tool: mage from mage.go file                               */
/* ================================================================= */

describe("parser: mage build tool detection", () => {
  it("detects mage from mage.go file", () => {
    const files: FileEntry[] = [
      { path: "mage.go", content: "//go:build mage\npackage main\n", size: 30 },
    ];
    const result = parseRepo(files);
    expect(result.build_tools).toContain("mage");
  });

  it("detects mage from magefile.go", () => {
    const files: FileEntry[] = [
      { path: "magefile.go", content: "//go:build mage\npackage main\n", size: 30 },
    ];
    const result = parseRepo(files);
    expect(result.build_tools).toContain("mage");
  });
});

/* ================================================================= */
/* Package managers: yarn.lock and package-lock.json                 */
/* ================================================================= */

describe("parser: yarn and npm package manager detection", () => {
  it("detects yarn from yarn.lock", () => {
    const files: FileEntry[] = [
      { path: "yarn.lock", content: "# yarn lockfile v1\n", size: 20 },
      { path: "package.json", content: '{"name":"test"}', size: 15 },
    ];
    const result = parseRepo(files);
    expect(result.package_managers).toContain("yarn");
  });

  it("detects npm from package-lock.json", () => {
    const files: FileEntry[] = [
      { path: "package-lock.json", content: '{"lockfileVersion":3}', size: 25 },
      { path: "package.json", content: '{"name":"test"}', size: 15 },
    ];
    const result = parseRepo(files);
    expect(result.package_managers).toContain("npm");
  });
});

/* ================================================================= */
/* Framework detector: SvelteKit without @sveltejs/kit dep           */
/* ================================================================= */

describe("parser: SvelteKit detected without @sveltejs/kit dependency", () => {
  it("detects SvelteKit from file patterns with null version", () => {
    const files: FileEntry[] = [
      { path: "svelte.config.js", content: "export default { kit: {} };", size: 30 },
      { path: "src/routes/+page.svelte", content: "<h1>Hello</h1>", size: 15 },
      { path: "package.json", content: '{"dependencies":{"svelte":"^4.0"}}', size: 35 },
    ];
    const result = parseRepo(files);
    const sk = result.frameworks.find((f) => f.name === "SvelteKit");
    expect(sk).toBeDefined();
    expect(sk!.version).toBeNull();
  });
});
