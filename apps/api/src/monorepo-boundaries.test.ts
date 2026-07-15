// H8.6 — architecture-boundary fitness tests (hand-rolled fs walk, no new
// dependency — knip/madge are a dep-gated future upgrade per the spec).
// Locks 3 rules: apps/web and apps/api never import each other's `src`;
// packages/* never import from apps/*; no cycles in the @axis/* workspace-
// dependency graph. Violations are fixed, not waived, unless explicitly
// justified inline (none are, currently).
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../..");

function walkSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

// Matches static `import ... from "SPEC"`, `export ... from "SPEC"`, and
// dynamic `import("SPEC")` — the only ways one module can pull in another.
const IMPORT_SPEC_RE = /(?:from\s+|import\()\s*["']([^"']+)["']/g;

/** Relative-import specifiers resolved to an absolute path, paired with their source file. */
function relativeImportsInto(sourceDir: string, targetDirAbs: string): Array<{ file: string; spec: string }> {
  const hits: Array<{ file: string; spec: string }> = [];
  for (const file of walkSourceFiles(sourceDir)) {
    const text = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    IMPORT_SPEC_RE.lastIndex = 0;
    while ((m = IMPORT_SPEC_RE.exec(text))) {
      const spec = m[1];
      if (!spec.startsWith(".")) continue; // package imports (@axis/*, node builtins, npm deps) are fine
      const resolved = resolve(dirname(file), spec);
      if (resolved === targetDirAbs || resolved.startsWith(targetDirAbs + "/") || resolved.startsWith(targetDirAbs + "\\")) {
        hits.push({ file: relative(ROOT, file), spec });
      }
    }
  }
  return hits;
}

describe("Monorepo architecture boundaries (H8.6)", () => {
  it("apps/web/src never imports apps/api/src", () => {
    const violations = relativeImportsInto(join(ROOT, "apps/web/src"), join(ROOT, "apps/api/src"));
    expect(violations).toEqual([]);
  });

  it("apps/api/src never imports apps/web/src", () => {
    const violations = relativeImportsInto(join(ROOT, "apps/api/src"), join(ROOT, "apps/web/src"));
    expect(violations).toEqual([]);
  });

  it("packages/*/src never imports apps/*/src", () => {
    const packagesDir = join(ROOT, "packages");
    const appsDir = join(ROOT, "apps");
    const violations: Array<{ file: string; spec: string }> = [];
    for (const pkg of readdirSync(packagesDir)) {
      const srcDir = join(packagesDir, pkg, "src");
      try {
        statSync(srcDir);
      } catch {
        continue; // package has no src/ (e.g. a config-only package)
      }
      violations.push(...relativeImportsInto(srcDir, appsDir));
    }
    expect(violations).toEqual([]);
  });

  it("the @axis/* workspace-dependency graph has no cycles", () => {
    const dirs = [
      ...readdirSync(join(ROOT, "apps")).map((d) => `apps/${d}`),
      ...readdirSync(join(ROOT, "packages")).map((d) => `packages/${d}`),
    ];

    const graph = new Map<string, string[]>(); // package name -> its @axis/* deps
    for (const dir of dirs) {
      const pkgJsonPath = join(ROOT, dir, "package.json");
      let pkg: { name?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      try {
        pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      } catch {
        continue; // e.g. apps/cli's iliad-md sibling folder if it lacks a package.json
      }
      if (!pkg.name) continue;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      graph.set(
        pkg.name,
        Object.keys(deps).filter((d) => d.startsWith("@axis/")),
      );
    }

    // Standard 3-color DFS cycle detection: WHITE (unvisited) -> GRAY (on the
    // current recursion stack) -> BLACK (fully processed). A GRAY node reached
    // again is a back-edge, i.e. a cycle.
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const cycles: string[] = [];

    function visit(node: string, path: string[]) {
      color.set(node, GRAY);
      for (const dep of graph.get(node) ?? []) {
        if (!graph.has(dep)) continue; // dep outside this workspace graph (shouldn't happen for @axis/*, but be defensive)
        const depColor = color.get(dep) ?? WHITE;
        if (depColor === GRAY) {
          cycles.push([...path, node, dep].join(" -> "));
        } else if (depColor === WHITE) {
          visit(dep, [...path, node]);
        }
      }
      color.set(node, BLACK);
    }

    for (const node of graph.keys()) {
      if ((color.get(node) ?? WHITE) === WHITE) visit(node, []);
    }

    expect(cycles).toEqual([]);
  });
});
