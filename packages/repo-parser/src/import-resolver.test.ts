import { describe, it, expect } from "vitest";
import { extractImports } from "./import-resolver.js";
import type { FileEntry } from "@axis/snapshots";

function makeFiles(paths: Array<{ path: string; content?: string }>): FileEntry[] {
  return paths.map(f => ({
    path: f.path,
    content: f.content ?? "",
    size: f.content?.length ?? 0,
  }));
}

describe("extractImports", () => {
  it("resolves ES import from relative path", () => {
    const files = makeFiles([
      { path: "src/index.ts", content: 'import { db } from "./db";' },
      { path: "src/db.ts", content: "export const db = {};" },
    ]);
    const edges = extractImports(files);
    expect(edges).toEqual([{ source: "src/index.ts", target: "src/db.ts" }]);
  });

  it("resolves require() calls", () => {
    const files = makeFiles([
      { path: "src/app.js", content: 'const utils = require("./utils");' },
      { path: "src/utils.js", content: "module.exports = {};" },
    ]);
    const edges = extractImports(files);
    expect(edges).toEqual([{ source: "src/app.js", target: "src/utils.js" }]);
  });

  it("resolves dynamic import()", () => {
    const files = makeFiles([
      { path: "src/index.ts", content: 'const mod = await import("./lazy");' },
      { path: "src/lazy.ts", content: "export default 42;" },
    ]);
    const edges = extractImports(files);
    expect(edges).toEqual([{ source: "src/index.ts", target: "src/lazy.ts" }]);
  });

  it("resolves a relative import from a repo-root file (no leading dir)", () => {
    // Regression: lastIndexOf('/') === -1 for a root file → substring(0,-1)
    // dropped the last char and broke resolution.
    const files = makeFiles([
      { path: "index.ts", content: 'import { foo } from "./foo";' },
      { path: "foo.ts", content: "export const foo = 1;" },
    ]);
    const edges = extractImports(files);
    expect(edges).toEqual([{ source: "index.ts", target: "foo.ts" }]);
  });

  it("resolves imports without extension by trying .ts/.tsx/.js/.jsx", () => {
    const files = makeFiles([
      { path: "src/app.ts", content: 'import { run } from "./runner";' },
      { path: "src/runner.tsx", content: "export function run() {}" },
    ]);
    const edges = extractImports(files);
    expect(edges).toEqual([{ source: "src/app.ts", target: "src/runner.tsx" }]);
  });

  it("resolves directory imports to index.ts", () => {
    const files = makeFiles([
      { path: "src/app.ts", content: 'import { utils } from "./lib";' },
      { path: "src/lib/index.ts", content: "export const utils = {};" },
    ]);
    const edges = extractImports(files);
    expect(edges).toEqual([{ source: "src/app.ts", target: "src/lib/index.ts" }]);
  });

  it("resolves parent directory imports with ../", () => {
    const files = makeFiles([
      { path: "src/utils/helpers.ts", content: 'import { config } from "../config";' },
      { path: "src/config.ts", content: "export const config = {};" },
    ]);
    const edges = extractImports(files);
    expect(edges).toEqual([{ source: "src/utils/helpers.ts", target: "src/config.ts" }]);
  });

  it("skips non-relative (external) imports", () => {
    const files = makeFiles([
      { path: "src/index.ts", content: 'import React from "react";\nimport { db } from "./db";' },
      { path: "src/db.ts", content: "" },
    ]);
    const edges = extractImports(files);
    expect(edges).toHaveLength(1);
    expect(edges[0].target).toBe("src/db.ts");
  });

  it("skips unresolvable imports", () => {
    const files = makeFiles([
      { path: "src/index.ts", content: 'import { foo } from "./nonexistent";' },
    ]);
    const edges = extractImports(files);
    expect(edges).toHaveLength(0);
  });

  it("skips non-source files (css, json, etc.)", () => {
    const files = makeFiles([
      { path: "styles.css", content: '@import "./base.css";' },
      { path: "base.css", content: "body { margin: 0; }" },
    ]);
    const edges = extractImports(files);
    expect(edges).toHaveLength(0);
  });

  it("handles multiple imports from one file", () => {
    const files = makeFiles([
      { path: "src/index.ts", content: 'import { a } from "./a";\nimport { b } from "./b";' },
      { path: "src/a.ts", content: "" },
      { path: "src/b.ts", content: "" },
    ]);
    const edges = extractImports(files);
    expect(edges).toHaveLength(2);
    expect(edges.map(e => e.target).sort()).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("handles circular imports", () => {
    const files = makeFiles([
      { path: "src/a.ts", content: 'import { b } from "./b";' },
      { path: "src/b.ts", content: 'import { a } from "./a";' },
    ]);
    const edges = extractImports(files);
    expect(edges).toHaveLength(2);
    expect(edges).toContainEqual({ source: "src/a.ts", target: "src/b.ts" });
    expect(edges).toContainEqual({ source: "src/b.ts", target: "src/a.ts" });
  });

  it("returns empty array for no files", () => {
    expect(extractImports([])).toEqual([]);
  });

  it("handles Python files", () => {
    const files = makeFiles([
      { path: "src/main.py", content: 'import { something } from "./utils";' },
      { path: "src/utils.py", content: "" },
    ]);
    // Python uses different import syntax, but the regex only matches JS-style
    // The .py extension is in isSourceFile allowlist, but Python imports won't match
    const edges = extractImports(files);
    // Only JS-style import patterns are matched
    expect(edges).toHaveLength(0);
  });

  it("resolves Go internal imports using module path", () => {
    const files = makeFiles([
      { path: "cmd/server/main.go", content: 'package main\nimport "github.com/acme/app/internal/handler"' },
      { path: "internal/handler/user.go", content: "package handler" },
    ]);
    const edges = extractImports(files, "github.com/acme/app");
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "cmd/server/main.go",
      target: "internal/handler/user.go",
    });
  });

  it("skips Go stdlib and external imports", () => {
    const files = makeFiles([
      { path: "main.go", content: 'package main\nimport (\n\t"fmt"\n\t"net/http"\n\t"github.com/some/external"\n)' },
    ]);
    const edges = extractImports(files, "github.com/acme/app");
    expect(edges).toHaveLength(0);
  });

  it("does not resolve Go imports without module path", () => {
    const files = makeFiles([
      { path: "main.go", content: 'package main\nimport "github.com/acme/app/internal/handler"' },
      { path: "internal/handler/user.go", content: "package handler" },
    ]);
    // Without goModulePath, Go files produce no import edges
    const edges = extractImports(files);
    expect(edges).toHaveLength(0);
  });

  it("handles mixed Go and TS files", () => {
    const files = makeFiles([
      { path: "src/index.ts", content: 'import { db } from "./db";' },
      { path: "src/db.ts", content: "export const db = {};" },
      { path: "cmd/main.go", content: 'package main\nimport "github.com/acme/app/internal/svc"' },
      { path: "internal/svc/service.go", content: "package svc" },
    ]);
    const edges = extractImports(files, "github.com/acme/app");
    expect(edges).toHaveLength(2);
    const tsEdge = edges.find(e => e.source === "src/index.ts");
    expect(tsEdge).toBeTruthy();
    const goEdge = edges.find(e => e.source === "cmd/main.go");
    expect(goEdge).toBeTruthy();
  });

  // Line 52: FALSE branch — import path starts with "." but not "./" or "../"
  it("resolves dot-prefixed import that is not relative ./ or ../", () => {
    const files = makeFiles([
      { path: "src/app.ts", content: 'import { x } from ".config";' },
      { path: ".config.ts", content: "export const x = {};" },
    ]);
    const edges = extractImports(files);
    // Path starts with "." (captured by regex) but not "./" or "../"
    // → base = importPath directly; tries ".config", ".config.ts", etc.
    expect(edges).toEqual([{ source: "src/app.ts", target: ".config.ts" }]);
  });

  // Lines 116+128: Go import referencing package path with no matching .go files → null
  it("produces no edge when Go package path has no .go files", () => {
    const files = makeFiles([
      { path: "cmd/main.go", content: 'package main\nimport "github.com/acme/app/internal/empty"' },
      // internal/empty/ has no .go files — only a README
      { path: "internal/empty/README.md", content: "# placeholder" },
    ]);
    const edges = extractImports(files, "github.com/acme/app");
    // resolveGoPackage returns null → no edge pushed
    expect(edges).toHaveLength(0);
  });

  // Line 128: resolveGoPackage filters out _test.go files
  it("ignores _test.go files when resolving Go package", () => {
    const files = makeFiles([
      { path: "cmd/main.go", content: 'package main\nimport "github.com/acme/app/internal/svc"' },
      // Only _test.go file exists — should not resolve
      { path: "internal/svc/handler_test.go", content: "package svc" },
    ]);
    const edges = extractImports(files, "github.com/acme/app");
    expect(edges).toHaveLength(0);
  });

  // ─── DEVELOP (Program 1 loop): NodeNext/ESM .js-suffixed TS imports ──────
  //
  // Modern ESM TypeScript ("module": "nodenext") imports name the EMITTED file
  // (`import "./db.js"`) while the repo contains `db.ts`. Pre-fix, such repos —
  // including this monorepo itself — produced ZERO internal import edges, so
  // hotspots and every downstream risk artifact stayed permanently empty.
  describe("NodeNext/ESM .js-suffixed imports resolve to TypeScript sources", () => {
    it("resolves import './db.js' to src/db.ts", () => {
      const files = makeFiles([
        { path: "src/index.ts", content: 'import { db } from "./db.js";' },
        { path: "src/db.ts", content: "export const db = {};" },
      ]);
      expect(extractImports(files)).toEqual([{ source: "src/index.ts", target: "src/db.ts" }]);
    });

    it("resolves import './Widget.jsx' to Widget.tsx", () => {
      const files = makeFiles([
        { path: "src/App.tsx", content: 'import { Widget } from "./Widget.jsx";' },
        { path: "src/Widget.tsx", content: "export function Widget() {}" },
      ]);
      expect(extractImports(files)).toEqual([{ source: "src/App.tsx", target: "src/Widget.tsx" }]);
    });

    it("resolves import './util.mjs' to util.mts and './legacy.cjs' to legacy.cts", () => {
      const files = makeFiles([
        { path: "src/a.ts", content: 'import { u } from "./util.mjs";\nimport { l } from "./legacy.cjs";' },
        { path: "src/util.mts", content: "export const u = 1;" },
        { path: "src/legacy.cts", content: "export const l = 1;" },
      ]);
      const edges = extractImports(files);
      expect(edges.map((e) => e.target).sort()).toEqual(["src/legacy.cts", "src/util.mts"]);
    });

    it("a REAL .js file still wins over the .ts remap (literal candidate first)", () => {
      const files = makeFiles([
        { path: "src/index.ts", content: 'import { x } from "./mixed.js";' },
        { path: "src/mixed.js", content: "export const x = 1;" },
        { path: "src/mixed.ts", content: "export const x = 2;" },
      ]);
      expect(extractImports(files)).toEqual([{ source: "src/index.ts", target: "src/mixed.js" }]);
    });

    it("still skips a .js import with no matching source at all", () => {
      const files = makeFiles([
        { path: "src/index.ts", content: 'import { x } from "./ghost.js";' },
      ]);
      expect(extractImports(files)).toHaveLength(0);
    });

    it("parent-relative ESM imports resolve across directories", () => {
      const files = makeFiles([
        { path: "src/api/handler.ts", content: 'import { log } from "../logger.js";' },
        { path: "src/logger.ts", content: "export const log = () => {};" },
      ]);
      expect(extractImports(files)).toEqual([{ source: "src/api/handler.ts", target: "src/logger.ts" }]);
    });

    // HARDEN-2: tsc's NodeNext order includes .d.ts — declaration-only modules
    // are often a repo's most-imported files.
    it("resolves import './types.js' to a declaration-only types.d.ts", () => {
      const files = makeFiles([
        { path: "src/x.ts", content: 'import type { Y } from "./types.js";' },
        { path: "src/types.d.ts", content: "export interface Y {}" },
      ]);
      expect(extractImports(files)).toEqual([{ source: "src/x.ts", target: "src/types.d.ts" }]);
    });

    // HARDEN-2: a specifier that walks ABOVE the analyzed root references a file
    // outside the upload — resolving it to an in-repo file that merely shares a
    // basename fabricated a phantom edge (inflating that file's hotspot risk).
    it("produces NO edge when the specifier escapes the analyzed root", () => {
      const files = makeFiles([
        { path: "src/deep/x.ts", content: 'import y from "../../../shared.js";' },
        { path: "shared.ts", content: "export default 1;" },
      ]);
      expect(extractImports(files)).toEqual([]);
    });
  });
});
