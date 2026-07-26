import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanDirectory } from "./scanner.js";

// Real filesystem fixtures — scanDirectory takes a path, not injectable file
// data, so the breadth-vs-depth traversal behavior can only be proven against
// an actual directory tree.
const tempDirs: string[] = [];

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "axis-scanner-test-"));
  tempDirs.push(dir);
  return dir;
}

/** Create `count` small source files directly inside `dir` (creating it first). */
function makeFiles(dir: string, count: number, prefix = "f"): void {
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < count; i++) {
    writeFileSync(join(dir, `${prefix}${String(i).padStart(4, "0")}.ts`), `export const x = ${i};\n`);
  }
}

afterEach(() => {
  for (const d of tempDirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe("scanDirectory — breadth across sibling directories", () => {
  it("gives every top-level directory representation even when the first alphabetical one alone exceeds MAX_FILES (500)", () => {
    // Real disk I/O for ~666 files is legitimately slower than vitest's 5s
    // default; the fixture size itself is load-bearing (must exceed MAX_FILES
    // to distinguish this from the old algorithm), not padding to trim.
    const root = makeTempRepo();
    // "apps" sorts first and ALONE exceeds the real MAX_FILES=500 cap — this
    // is the exact shape that starved sibling directories under the old
    // depth-first-per-subtree walk (confirmed on this real repo: apps/ alone
    // consumed the entire 500-file cap before docs/, examples/, mcp/,
    // packages/, etc. were ever visited). A smaller fixture would pass under
    // BOTH the old and new algorithm and prove nothing — this one only passes
    // under breadth-first traversal.
    makeFiles(join(root, "apps", "api", "src"), 220, "api");
    makeFiles(join(root, "apps", "web", "src"), 220, "web");
    makeFiles(join(root, "apps", "cli", "src"), 220, "cli");
    makeFiles(join(root, "docs"), 3, "doc");
    makeFiles(join(root, "examples"), 3, "ex");
    makeFiles(join(root, "packages", "core", "src"), 10, "core");
    makeFiles(join(root, "packages", "utils", "src"), 10, "utils");

    const result = scanDirectory(root);
    const topLevelDirsSeen = new Set(result.files.map((f) => f.path.split("/")[0]));

    // All 4 real top-level directories must be represented — not just the
    // first alphabetical one and whatever fit before the cap.
    expect(topLevelDirsSeen).toEqual(new Set(["apps", "docs", "examples", "packages"]));
    expect(result.files.length).toBe(500);
  }, 20_000);

  it("still captures a directory's own root-level manifest files ahead of deep subdirectory content (the original files-before-dirs fix stays intact)", () => {
    const root = makeTempRepo();
    makeFiles(join(root, "apps", "api", "src"), 30);
    writeFileSync(join(root, "pnpm-lock.yaml"), "");
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n");

    const result = scanDirectory(root);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("pnpm-lock.yaml");
    expect(paths).toContain("pnpm-workspace.yaml");
  });

});

describe("scanDirectory — unchanged behavior (regression guard)", () => {
  it("skips SKIP_DIRS entries entirely", () => {
    const root = makeTempRepo();
    makeFiles(join(root, "src"), 3);
    makeFiles(join(root, "node_modules", "some-pkg"), 5);

    const result = scanDirectory(root);
    expect(result.files.some((f) => f.path.includes("node_modules"))).toBe(false);
  });

  it("skips dot-directories except the explicit allow-list", () => {
    const root = makeTempRepo();
    makeFiles(join(root, ".github", "workflows"), 2);
    makeFiles(join(root, ".secret-dir"), 2);

    const result = scanDirectory(root);
    const paths = result.files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith(".github/"))).toBe(true);
    expect(paths.some((p) => p.startsWith(".secret-dir/"))).toBe(false);
  });

  it("includes lockfiles as empty marker entries regardless of extension filtering", () => {
    const root = makeTempRepo();
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "package-lock.json"), '{"lockfileVersion": 3}');

    const result = scanDirectory(root);
    const lock = result.files.find((f) => f.path === "package-lock.json");
    expect(lock).toBeDefined();
    expect(lock!.content).toBe("");
  });

  it("throws for a nonexistent root", () => {
    expect(() => scanDirectory(join(tmpdir(), "axis-scanner-does-not-exist-" + Date.now()))).toThrow(/not found/);
  });
});
