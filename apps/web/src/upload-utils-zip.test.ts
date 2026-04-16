/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { extractZip } from "./upload-utils.ts";

/* ─── Helper: build an ArrayBuffer from a JSZip instance ──────── */

async function buildZip(add: (z: JSZip) => void): Promise<ArrayBuffer> {
  const z = new JSZip();
  add(z);
  return z.generateAsync({ type: "arraybuffer" });
}

/* ================================================================= */
/* PART 1: Basic extraction                                           */
/* ================================================================= */

describe("extractZip: basic file extraction", () => {
  it("extracts TypeScript source files", async () => {
    const buf = await buildZip(z => {
      z.file("src/index.ts", 'export default 42;\n');
      z.file("README.md", "# Hello\n");
    });
    const { files, skipped } = await extractZip(buf);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some(f => f.path.includes("index.ts"))).toBe(true);
    expect(skipped).toBe(0);
  });

  it("returns correct content and size", async () => {
    const content = "const x = 1;\n";
    const buf = await buildZip(z => { z.file("main.ts", content); });
    const { files } = await extractZip(buf);
    const f = files.find(f => f.path.includes("main.ts"));
    expect(f).toBeDefined();
    expect(f!.content).toBe(content);
    expect(f!.size).toBe(content.length);
  });
});

/* ================================================================= */
/* PART 2: Directory entries are skipped (branch 1[0])               */
/* ================================================================= */

describe("extractZip: directory entries skipped — branch 1[0]", () => {
  it("does not include directory entries in output", async () => {
    const buf = await buildZip(z => {
      z.folder("src");          // creates an explicit directory entry
      z.file("src/util.ts", "export {};\n");
      z.file("README.md", "# docs\n");
    });
    const { files } = await extractZip(buf);
    // None of the paths should end with "/"
    expect(files.every(f => !f.path.endsWith("/"))).toBe(true);
    expect(files.some(f => f.path.includes("util.ts"))).toBe(true);
  });
});

/* ================================================================= */
/* PART 3: Common prefix stripping (branches 2[0,1], 9-11)           */
/* ================================================================= */

describe("extractZip: common prefix detection — branches 2[0], findCommonPrefix", () => {
  it("strips common top-level directory prefix (branch 2[0]: commonPrefix truthy)", async () => {
    const buf = await buildZip(z => {
      // All files under "project/" → common prefix = "project/"
      z.file("project/src/index.ts", "const a = 1;\n");
      z.file("project/README.md", "# Project\n");
      z.file("project/package.json", '{"name":"p"}');
    });
    const { files } = await extractZip(buf);
    // Paths should NOT start with "project/"
    expect(files.every(f => !f.path.startsWith("project/"))).toBe(true);
    expect(files.some(f => f.path === "src/index.ts")).toBe(true);
  });

  it("keeps full paths when no common prefix (branch 2[1]: commonPrefix empty)", async () => {
    const buf = await buildZip(z => {
      // Files at different top-level directories → no common prefix
      z.file("frontend/src/app.ts", "const a = 1;\n");
      z.file("backend/src/server.ts", "const b = 2;\n");
    });
    const { files } = await extractZip(buf);
    expect(files.some(f => f.path === "frontend/src/app.ts")).toBe(true);
    expect(files.some(f => f.path === "backend/src/server.ts")).toBe(true);
  });

  it("findCommonPrefix: no paths → empty prefix (branch 9[0]: paths.length === 0)", async () => {
    // Zip with ONLY directories → allPaths (non-dir files) is empty
    const buf = await buildZip(z => {
      z.folder("emptydir");   // only a directory, no files
    });
    const { files, skipped } = await extractZip(buf);
    // No files to extract
    expect(files.length).toBe(0);
    expect(skipped).toBe(0);
  });

  it("findCommonPrefix: single-level files have no common prefix (branch 10[1])", async () => {
    // Files at root level, parts[0] = filename → parts.length === 1 → no prefix check
    const buf = await buildZip(z => {
      z.file("file1.ts", "const a = 1;\n");
      z.file("file2.ts", "const b = 2;\n");
    });
    const { files } = await extractZip(buf);
    expect(files.some(f => f.path === "file1.ts")).toBe(true);
    expect(files.some(f => f.path === "file2.ts")).toBe(true);
  });
});

/* ================================================================= */
/* PART 4: shouldIgnore and isBinaryPath filtering (branches 3-8)    */
/* ================================================================= */

describe("extractZip: ignored files skipped — branch 4[0] via shouldIgnore, 5[0]", () => {
  it("skips files in node_modules (shouldIgnore → branch 5[0]: short-circuit)", async () => {
    const buf = await buildZip(z => {
      z.file("node_modules/react/index.js", "module.exports = {};\n");
      z.file("src/app.ts", "const x = 1;\n");
    });
    const { files, skipped } = await extractZip(buf);
    expect(files.every(f => !f.path.includes("node_modules"))).toBe(true);
    expect(skipped).toBeGreaterThan(0);
    expect(files.some(f => f.path.includes("app.ts"))).toBe(true);
  });

  it("skips binary files by extension (isBinaryPath → branch 5[1]: evaluates isBinaryPath)", async () => {
    const buf = await buildZip(z => {
      // .png doesn't match shouldIgnore → evaluates isBinaryPath (branch 5[1]),
      // isBinaryPath returns true → skipped (branch 4[0])
      z.file("assets/logo.png", "\x89PNG\r\n\x1a\n");
      z.file("assets/font.woff2", "binary data here");
      z.file("src/styles.css", "body { color: red; }\n");
    });
    const { files, skipped } = await extractZip(buf);
    expect(files.every(f => !f.path.endsWith(".png") && !f.path.endsWith(".woff2"))).toBe(true);
    expect(skipped).toBeGreaterThan(0);
    expect(files.some(f => f.path.includes("styles.css"))).toBe(true);
  });

  it("includes non-ignored, non-binary files (branch 4[1]: shouldIgnore and isBinaryPath both false)", async () => {
    const buf = await buildZip(z => {
      z.file("src/utils.ts", "export function identity(x: T) { return x; }\n");
      z.file("config.json", '{"debug": false}');
    });
    const { files, skipped } = await extractZip(buf);
    expect(files.some(f => f.path.includes("utils.ts"))).toBe(true);
    expect(files.some(f => f.path.includes("config.json"))).toBe(true);
    expect(skipped).toBe(0);
  });

  it("covers isBinaryPath branch 0[0]: file with known extension (e.g. .ts → not binary)", async () => {
    // Any file with extension covers binary-expr[0] (pop() returns non-undefined string)
    const buf = await buildZip(z => {
      z.file("index.ts", "const x = 1;\n");
    });
    const { files } = await extractZip(buf);
    expect(files.some(f => f.path.includes("index.ts"))).toBe(true);
  });
});

/* ================================================================= */
/* PART 5: Large content skipped (branch 8[0]: content.length > 1MB) */
/* ================================================================= */

describe("extractZip: content > 1MB is skipped — branch 8[0]", () => {
  it("skips files whose extracted content exceeds 1MB", async () => {
    // Create a string > 1MB (1MB = 1024*1024 = 1,048,576 bytes)
    const bigContent = "a".repeat(1024 * 1024 + 1); // 1MB + 1 byte
    const buf = await buildZip(z => {
      z.file("src/large.ts", bigContent);
      z.file("src/small.ts", "const x = 1;\n");
    });
    const { files, skipped } = await extractZip(buf);
    expect(files.every(f => !f.path.includes("large.ts"))).toBe(true);
    expect(skipped).toBeGreaterThan(0);
    expect(files.some(f => f.path.includes("small.ts"))).toBe(true);
  }, 15000 /* larger timeout for zip generation */);
});

/* ================================================================= */
/* PART 6: findCommonPrefix — mixed prefixes (branch 10[1])          */
/* ================================================================= */

describe("extractZip: files with differing top-level dirs — findCommonPrefix branch 10[1]", () => {
  it("returns no prefix when some files do not share top-level dir", async () => {
    // "project/src/a.ts" starts with "project/" but "outside.ts" does not
    // So NOT all paths start with "project/" → findCommonPrefix returns ""
    const buf = await buildZip(z => {
      z.file("project/src/a.ts", "const a = 1;\n");
      z.file("project/src/b.ts", "const b = 2;\n");
      z.file("loose.ts", "const c = 3;\n");
    });
    const { files } = await extractZip(buf);
    // "loose.ts" is at root → prefix detection fails → all paths kept as-is
    expect(files.some(f => f.path === "loose.ts" || f.path.includes("loose"))).toBe(true);
  });
});
