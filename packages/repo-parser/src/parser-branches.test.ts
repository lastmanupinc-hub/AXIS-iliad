import { describe, it, expect } from "vitest";
import { parseRepo } from "./parser.js";
import type { FileEntry } from "@axis/snapshots";

function makeFiles(entries: Array<{ path: string; content?: string }>): FileEntry[] {
  return entries.map((f) => ({
    path: f.path,
    content: f.content ?? "",
    size: f.content?.length ?? 0,
  }));
}

// ─── detectDeployment ───────────────────────────────────────────

describe("detectDeployment", () => {
  it("detects vercel from vercel.json", () => {
    const r = parseRepo(makeFiles([{ path: "vercel.json", content: "{}" }]));
    expect(r.deployment_target).toBe("vercel");
  });

  it("detects vercel from dependency", () => {
    const r = parseRepo(makeFiles([
      { path: "package.json", content: '{"dependencies":{"vercel":"1.0"}}' },
    ]));
    expect(r.deployment_target).toBe("vercel");
  });

  it("detects netlify from netlify.toml", () => {
    const r = parseRepo(makeFiles([{ path: "netlify.toml", content: "[build]" }]));
    expect(r.deployment_target).toBe("netlify");
  });

  it("detects docker from Dockerfile", () => {
    const r = parseRepo(makeFiles([{ path: "Dockerfile", content: "FROM node:20" }]));
    expect(r.deployment_target).toBe("docker");
  });

  it("detects fly.io from fly.toml", () => {
    const r = parseRepo(makeFiles([{ path: "fly.toml", content: "[env]" }]));
    expect(r.deployment_target).toBe("fly.io");
  });

  it("detects render from render.yaml", () => {
    const r = parseRepo(makeFiles([{ path: "render.yaml", content: "services:" }]));
    expect(r.deployment_target).toBe("render");
  });

  it("detects serverless from serverless.yml", () => {
    const r = parseRepo(makeFiles([{ path: "serverless.yml", content: "service: test" }]));
    expect(r.deployment_target).toBe("serverless");
  });

  it("returns null when no deployment detected", () => {
    const r = parseRepo(makeFiles([{ path: "src/app.ts", content: "const x = 1;" }]));
    expect(r.deployment_target).toBeNull();
  });
});

// ─── detectBuildTools ───────────────────────────────────────────

describe("detectBuildTools", () => {
  it("detects turbo from turbo.json", () => {
    const r = parseRepo(makeFiles([{ path: "turbo.json", content: "{}" }]));
    expect(r.build_tools).toContain("turbo");
  });

  it("detects webpack from config file", () => {
    const r = parseRepo(makeFiles([{ path: "webpack.config.js", content: "module.exports = {}" }]));
    expect(r.build_tools).toContain("webpack");
  });

  it("detects vite from vite.config", () => {
    const r = parseRepo(makeFiles([{ path: "vite.config.ts", content: "export default {}" }]));
    expect(r.build_tools).toContain("vite");
  });

  it("detects esbuild from dependency", () => {
    const r = parseRepo(makeFiles([
      { path: "package.json", content: '{"dependencies":{"esbuild":"0.20.0"}}' },
    ]));
    expect(r.build_tools).toContain("esbuild");
  });

  it("detects rollup from config file", () => {
    const r = parseRepo(makeFiles([{ path: "rollup.config.js", content: "export default {}" }]));
    expect(r.build_tools).toContain("rollup");
  });

  it("detects tsup from dependency", () => {
    const r = parseRepo(makeFiles([
      { path: "package.json", content: '{"dependencies":{"tsup":"8.0.0"}}' },
    ]));
    expect(r.build_tools).toContain("tsup");
  });

  it("detects make from Makefile", () => {
    const r = parseRepo(makeFiles([{ path: "Makefile", content: "build:\n\techo hi" }]));
    expect(r.build_tools).toContain("make");
  });
});

// ─── detectCI ───────────────────────────────────────────────────

describe("detectCI", () => {
  it("detects gitlab CI", () => {
    const r = parseRepo(makeFiles([{ path: ".gitlab-ci.yml", content: "stages:" }]));
    expect(r.ci_platform).toBe("gitlab_ci");
  });

  it("detects CircleCI", () => {
    const r = parseRepo(makeFiles([{ path: ".circleci/config.yml", content: "version: 2.1" }]));
    expect(r.ci_platform).toBe("circleci");
  });

  it("detects Jenkins", () => {
    const r = parseRepo(makeFiles([{ path: "Jenkinsfile", content: "pipeline {}" }]));
    expect(r.ci_platform).toBe("jenkins");
  });

  it("returns null when no CI detected", () => {
    const r = parseRepo(makeFiles([{ path: "src/app.ts", content: "" }]));
    expect(r.ci_platform).toBeNull();
  });
});

// ─── classifyRole (via file_annotations) ────────────────────────

describe("classifyRole", () => {
  it("classifies .spec.ts as test", () => {
    const r = parseRepo(makeFiles([{ path: "src/utils.spec.ts", content: "" }]));
    expect(r.file_annotations[0].role).toBe("test");
  });

  it("classifies __tests__ directory files as test", () => {
    const r = parseRepo(makeFiles([{ path: "__tests__/app.ts", content: "" }]));
    expect(r.file_annotations[0].role).toBe("test");
  });

  it("classifies tests/ directory files as test", () => {
    const r = parseRepo(makeFiles([{ path: "tests/unit.py", content: "" }]));
    expect(r.file_annotations[0].role).toBe("test");
  });

  it("classifies tsconfig.json as config", () => {
    const r = parseRepo(makeFiles([{ path: "tsconfig.json", content: "{}" }]));
    expect(r.file_annotations[0].role).toBe("config");
  });

  it("classifies dotfiles as config", () => {
    const r = parseRepo(makeFiles([{ path: ".gitignore", content: "node_modules" }]));
    expect(r.file_annotations[0].role).toBe("config");
  });

  it("classifies markdown as documentation", () => {
    const r = parseRepo(makeFiles([{ path: "CONTRIBUTING.md", content: "# Contributing" }]));
    expect(r.file_annotations[0].role).toBe("documentation");
  });

  it("classifies docs/ directory as documentation", () => {
    const r = parseRepo(makeFiles([{ path: "docs/guide.md", content: "# Guide" }]));
    expect(r.file_annotations[0].role).toBe("documentation");
  });

  it("classifies Dockerfile as build", () => {
    const r = parseRepo(makeFiles([{ path: "Dockerfile", content: "FROM node" }]));
    expect(r.file_annotations[0].role).toBe("build");
  });

  it("classifies GitHub workflow as config (dotfile takes precedence)", () => {
    const r = parseRepo(makeFiles([{ path: ".github/workflows/ci.yml", content: "" }]));
    expect(r.file_annotations[0].role).toBe("config");
  });

  it("classifies .png as asset", () => {
    const r = parseRepo(makeFiles([{ path: "logo.png", content: "" }]));
    expect(r.file_annotations[0].role).toBe("asset");
  });

  it("classifies dist/ output as generated", () => {
    const r = parseRepo(makeFiles([{ path: "dist/bundle.js", content: "" }]));
    expect(r.file_annotations[0].role).toBe("generated");
  });

  it("classifies .ts files as source", () => {
    const r = parseRepo(makeFiles([{ path: "src/utils.ts", content: "export {}" }]));
    expect(r.file_annotations[0].role).toBe("source");
  });

  it("classifies unknown extensions as unknown", () => {
    const r = parseRepo(makeFiles([{ path: "data.csv", content: "a,b,c" }]));
    expect(r.file_annotations[0].role).toBe("unknown");
  });
});

// ─── detectPackageManagers ──────────────────────────────────────

describe("detectPackageManagers", () => {
  it("detects bundler from Gemfile", () => {
    const r = parseRepo(makeFiles([{ path: "Gemfile", content: 'source "https://rubygems.org"' }]));
    expect(r.package_managers).toContain("bundler");
  });

  it("detects cargo from Cargo.toml", () => {
    const r = parseRepo(makeFiles([{ path: "Cargo.toml", content: "[package]" }]));
    expect(r.package_managers).toContain("cargo");
  });

  it("detects go modules from go.mod", () => {
    const r = parseRepo(makeFiles([{ path: "go.mod", content: "module foo" }]));
    expect(r.package_managers).toContain("go modules");
  });

  it("detects pip from requirements.txt", () => {
    const r = parseRepo(makeFiles([{ path: "requirements.txt", content: "flask==2.0" }]));
    expect(r.package_managers).toContain("pip");
  });
});

// ─── extractDependencies edge cases ─────────────────────────────

describe("extractDependencies", () => {
  it("handles invalid JSON gracefully", () => {
    const r = parseRepo(makeFiles([{ path: "package.json", content: "not json{{{" }]));
    expect(r.dependencies).toEqual([]);
  });

  it("extracts peer dependencies", () => {
    const r = parseRepo(makeFiles([
      { path: "package.json", content: '{"peerDependencies":{"react":"^18.0.0"}}' },
    ]));
    const peer = r.dependencies.find((d) => d.name === "react");
    expect(peer).toBeDefined();
    expect(peer!.type).toBe("peer");
  });

  it("returns empty when no package.json", () => {
    const r = parseRepo(makeFiles([{ path: "src/main.go", content: "package main" }]));
    expect(r.dependencies).toEqual([]);
  });
});

// ─── guessDirPurpose ────────────────────────────────────────────

describe("guessDirPurpose", () => {
  it("maps known directories to correct purposes", () => {
    const r = parseRepo(makeFiles([
      { path: "components/Button.tsx", content: "" },
      { path: "prisma/schema.prisma", content: "" },
      { path: "hooks/useAuth.ts", content: "" },
      { path: "middleware/logger.ts", content: "" },
    ]));
    const names = r.top_level_dirs.map((d) => d.name);
    const purposes = Object.fromEntries(r.top_level_dirs.map((d) => [d.name, d.purpose]));
    expect(names).toContain("components");
    expect(purposes.components).toBe("ui_components");
    expect(purposes.prisma).toBe("database_schema");
    expect(purposes.hooks).toBe("react_hooks");
    expect(purposes.middleware).toBe("middleware");
  });

  it("returns project_directory for unknown dirs", () => {
    const r = parseRepo(makeFiles([{ path: "mydir/file.ts", content: "" }]));
    const dir = r.top_level_dirs.find((d) => d.name === "mydir");
    expect(dir?.purpose).toBe("project_directory");
  });
});

// ─── health indicators ──────────────────────────────────────────

describe("health indicators", () => {
  it("detects formatter from .prettierrc", () => {
    const r = parseRepo(makeFiles([{ path: ".prettierrc", content: "{}" }]));
    expect(r.health.has_formatter).toBe(true);
  });

  it("detects formatter from .editorconfig", () => {
    const r = parseRepo(makeFiles([{ path: ".editorconfig", content: "" }]));
    expect(r.health.has_formatter).toBe(true);
  });

  it("detects linter from pylintrc", () => {
    const r = parseRepo(makeFiles([{ path: ".pylintrc", content: "" }]));
    expect(r.health.has_linter).toBe(true);
  });

  it("detects linter from ruff.toml", () => {
    const r = parseRepo(makeFiles([{ path: "ruff.toml", content: "" }]));
    expect(r.health.has_linter).toBe(true);
  });
});

// ─── detectLanguages — zero LOC edge case (Layer 10) ─────────────

describe("detectLanguages — totalLoc === 0", () => {
  it("returns loc_percent 0 when all files have zero LOC", () => {
    // Files that ARE recognized as source (.ts) but have empty content → 0 lines
    const r = parseRepo(makeFiles([
      { path: "src/a.ts", content: "" },
      { path: "src/b.ts", content: "" },
    ]));
    // loc_percent = totalLoc > 0 ? ... : 0 → takes FALSE branch
    for (const lang of r.languages) {
      expect(lang.loc_percent).toBe(0);
    }
  });
});

// ─── SQL extraction — UNIQUE and CHECK constraint skip (Layer 10) ───

describe("sql-extractor constraint branches", () => {
  it("skips UNIQUE constraint lines in SQL", () => {
    const r = parseRepo(makeFiles([
      { path: "schema.sql", content: `CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL,
        UNIQUE (email)
      );` },
    ]));
    expect(r.sql_schema).toHaveLength(1);
    expect(r.sql_schema[0].columns).toHaveLength(2);
  });

  it("skips CHECK constraint lines in SQL", () => {
    const r = parseRepo(makeFiles([
      { path: "schema.sql", content: `CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        price REAL NOT NULL,
        CHECK (price > 0)
      );` },
    ]));
    expect(r.sql_schema).toHaveLength(1);
    expect(r.sql_schema[0].columns).toHaveLength(2);
  });

  it("skips CONSTRAINT named constraint lines in SQL", () => {
    const r = parseRepo(makeFiles([
      { path: "schema.sql", content: `CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        amount REAL,
        CONSTRAINT chk_amount CHECK (amount >= 0)
      );` },
    ]));
    expect(r.sql_schema).toHaveLength(1);
    expect(r.sql_schema[0].columns).toHaveLength(2);
  });
});
