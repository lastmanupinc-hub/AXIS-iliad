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

describe("scanDirectory — source-first admission under the cap (PAI'D dogfood shape)", () => {
  /** Create `count` files with the given extension inside `dir`. */
  function makeTyped(dir: string, count: number, ext: string, content = "x\n"): void {
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < count; i++) {
      writeFileSync(join(dir, `t${String(i).padStart(4, "0")}${ext}`), content);
    }
  }

  it("a Go monorepo drowning in root YAML and docs still yields a source-dominated scan", () => {
    // The real customer shape that produced a deck claiming "primary language:
    // YAML" for a Go monorepo: root config noise + a huge docs/ tree + the
    // actual backend. Total 690 > MAX_FILES=500, so admission order decides
    // what the analyzer ever sees.
    const repo = makeTempRepo();
    makeTyped(repo, 40, ".yaml");                       // root config noise (sorts before subdir walk)
    makeTyped(join(repo, "docs"), 300, ".md");          // docs tree
    makeTyped(join(repo, "go-backend"), 300, ".go", "package main\n");
    makeTyped(join(repo, "frontend"), 50, ".svelte");
    writeFileSync(join(repo, "go.mod"), "module example.com/paid\n\ngo 1.22\n");

    const result = scanDirectory(repo);
    const byExt = (e: string) => result.files.filter((f) => f.path.endsWith(e)).length;

    // Every source file made it in — source is never crowded out by docs/config.
    expect(byExt(".go")).toBe(300);
    expect(byExt(".svelte")).toBe(50);
    // Docs/config got exactly the leftover budget, not the lion's share.
    expect(byExt(".md") + byExt(".yaml")).toBeLessThanOrEqual(500 - 300 - 50);
    expect(result.files.length).toBeLessThanOrEqual(500);
  });

  it("go.mod is scanned WITH content — detection depends on the module path", () => {
    // Before this fix ".mod" was not an included extension and no name carve-out
    // existed: go.mod was silently skipped, so Go repos could fail language
    // detection entirely even when .go files were sampled.
    const repo = makeTempRepo();
    writeFileSync(join(repo, "go.mod"), "module example.com/paid\n\ngo 1.22\n");
    makeTyped(join(repo, "cmd"), 3, ".go", "package main\n");

    const result = scanDirectory(repo);
    const gomod = result.files.find((f) => f.path === "go.mod");
    expect(gomod).toBeTruthy();
    expect(gomod!.content).toContain("module example.com/paid");
  });

  it("small mixed repos are unaffected: everything under the cap is admitted, docs included", () => {
    const repo = makeTempRepo();
    makeTyped(join(repo, "src"), 5, ".ts", "export {};\n");
    makeTyped(join(repo, "docs"), 5, ".md");
    makeTyped(repo, 2, ".yaml");

    const result = scanDirectory(repo);
    expect(result.files.filter((f) => f.path.endsWith(".md")).length).toBe(5);
    expect(result.files.filter((f) => f.path.endsWith(".yaml")).length).toBe(2);
    expect(result.files.filter((f) => f.path.endsWith(".ts")).length).toBe(5);
  });
});

describe("scanDirectory — the truth slide can never go dark (README + doc reserve)", () => {
  function makeTyped2(dir: string, count: number, ext: string, content = "x\n"): void {
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < count; i++) {
      writeFileSync(join(dir, `t${String(i).padStart(4, "0")}${ext}`), content);
    }
  }

  it("a source-SATURATED repo still admits README and a floor of audit docs", () => {
    // The regression the second PAI'D regeneration exposed: source-first v1
    // filled all 500 slots with code, README deferred forever, and the deck's
    // truth slide read "No numeric claims found" while the README claimed
    // "689 routes". Source must win over noise — but never over the audit's
    // own inputs.
    const repo = makeTempRepo();
    makeTyped2(join(repo, "go-backend"), 600, ".go", "package main\n"); // saturates alone
    makeTyped2(join(repo, "docs"), 40, ".md", "# doc\n");
    writeFileSync(join(repo, "README.md"), "# paid\n\nServing 689 routes.\n");

    const result = scanDirectory(repo);
    const paths = result.files.map((f) => f.path);

    expect(paths).toContain("README.md");                                   // identity + claims source
    const auditDocs = paths.filter((p) => /^docs\/.*\.md$/.test(p)).length;
    expect(auditDocs).toBeGreaterThan(0);                                    // the reserve floor held
    expect(result.files.length).toBeLessThanOrEqual(500);                    // cap never widens
    expect(paths.filter((p) => p.endsWith(".go")).length).toBeGreaterThan(400); // source still dominates
  });
});
