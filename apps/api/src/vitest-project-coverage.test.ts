// ─── The gap this closes (infra_01_test_suite_cost, lever 3) ───────────────
//
// vitest.config.ts splits test discovery into three projects — "db"
// (serialized, shares the one test Postgres database), "integration"
// (serialized, real Docker/git/npm child processes too heavy to share the
// machine with concurrent workers), and "pure" (real cross-file parallelism)
// — via explicit allowlists on all three rather than a broad glob-with-
// exclude. That choice trades a staleness risk (a new test file forgotten by
// every list) for a much safer failure mode than the alternative: a broad
// "everything not explicitly special-cased, is pure" glob would default a
// brand-new DB-touching or resource-heavy file straight into the parallel
// project, where it can silently corrupt state or spuriously time out (the
// exact flakiness this split exists to remove) — intermittent and hard to
// trace back to its cause. An explicit allowlist instead defaults a
// forgotten file into NONE of the three projects: a wrong total test count,
// and this guard failing by name.
//
// Two independent checks, both real, neither assumed:
//  1. COMPLETENESS — every *.test.ts(x) file under packages/*/src or
//     apps/*/src is claimed by exactly one of the three projects' include
//     lists (and not excluded from the one that claims it). Re-derives the
//     ground truth by walking the filesystem directly, the same technique
//     count-surface-coverage.test.ts already uses for the analogous problem
//     one directory over.
//  2. CLASSIFICATION — no file that would run under the "pure" project
//     actually calls resetTestDb() in its own source (grepped from real file
//     content — the same signal that was used BY HAND to build the
//     allowlists in vitest.config.ts, now re-checked by a test instead of
//     trusted to stay accurate forever).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import {
  DB_PROJECT_INCLUDE,
  INTEGRATION_PROJECT_INCLUDE,
  PURE_PROJECT_INCLUDE,
  PURE_PROJECT_EXCLUDE,
} from "../../../vitest.config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function walkTestFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // e.g. a package with no src/ yet
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
    const abs = join(dir, entry);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkTestFiles(abs, out);
    else if (/\.test\.tsx?$/.test(entry)) out.push(abs);
  }
  return out;
}

/**
 * Interprets ONLY the pattern shapes vitest.config.ts actually writes — an
 * exact relative path, or "<dir>/**\/*.<maybe-a-tag>.test.<ext>" meaning "any
 * (optionally tagged, e.g. .integration) test file under <dir>". Throws on
 * anything else so a future pattern shape added to vitest.config.ts fails
 * loudly here instead of silently matching nothing.
 */
function matchesPattern(relPath: string, pattern: string): boolean {
  if (!pattern.includes("*")) return relPath === pattern;
  const dirMatch = pattern.match(/^(.+)\/\*\*\/\*((?:\.[a-z]+)?)\.test\.(ts|tsx|\{ts,tsx\})$/);
  if (!dirMatch) throw new Error(`vitest-project-coverage.test.ts doesn't recognize this glob shape: ${pattern}`);
  const [, dir, tag, extPart] = dirMatch;
  const exts = extPart === "{ts,tsx}" ? [".ts", ".tsx"] : [`.${extPart}`];
  return relPath.startsWith(`${dir}/`) && exts.some((e) => relPath.endsWith(`${tag}.test${e}`));
}

function inDbProject(relPath: string): boolean {
  return DB_PROJECT_INCLUDE.some((p) => matchesPattern(relPath, p));
}

function inIntegrationProject(relPath: string): boolean {
  return INTEGRATION_PROJECT_INCLUDE.some((p) => matchesPattern(relPath, p));
}

function inPureProject(relPath: string): boolean {
  return (
    PURE_PROJECT_INCLUDE.some((p) => matchesPattern(relPath, p)) &&
    !PURE_PROJECT_EXCLUDE.some((p) => matchesPattern(relPath, p))
  );
}

/** All *.test.ts(x) files vitest.config.ts's ORIGINAL single glob used to discover. */
function allTestFiles(): string[] {
  const roots: string[] = [];
  for (const base of ["packages", "apps"]) {
    for (const name of readdirSync(join(ROOT, base))) {
      const src = join(ROOT, base, name, "src");
      try {
        if (statSync(src).isDirectory()) roots.push(src);
      } catch {
        /* no src/ dir — nothing to walk */
      }
    }
  }
  return roots.flatMap((r) => walkTestFiles(r)).map((abs) => relative(ROOT, abs).replace(/\\/g, "/"));
}

describe("vitest project split — every test file is claimed exactly once, correctly", () => {
  it("every *.test.ts(x) file is covered by exactly one of the db/integration/pure projects", () => {
    const files = allTestFiles();
    expect(files.length, "walked zero test files — the walker itself is broken, not the split").toBeGreaterThan(100);

    const uncovered: string[] = [];
    const doubleCovered: string[] = [];
    for (const f of files) {
      const memberships = [inDbProject(f), inIntegrationProject(f), inPureProject(f)];
      const count = memberships.filter(Boolean).length;
      if (count === 0) uncovered.push(f);
      if (count > 1) doubleCovered.push(f);
    }

    expect(
      uncovered,
      "These test files are claimed by NONE of the three vitest projects in vitest.config.ts, so they " +
        "never run in `vitest run` (only an explicit path would find them). Add each to DB_PROJECT_INCLUDE " +
        "(if it calls resetTestDb()), INTEGRATION_PROJECT_INCLUDE (if it spawns real Docker/git/npm child " +
        "processes), or PURE_PROJECT_INCLUDE (otherwise).",
    ).toEqual([]);
    expect(
      doubleCovered,
      "These test files are claimed by MORE THAN ONE vitest project, so they run more than once per invocation.",
    ).toEqual([]);
  });

  it("no file in the pure project actually touches the shared test database", () => {
    const violations: string[] = [];
    for (const f of allTestFiles()) {
      if (!inPureProject(f)) continue;
      const content = readFileSync(join(ROOT, f), "utf8");
      // The real signal, not a heuristic: every DB-backed test in this repo
      // resets state via this one function (verified during lever 3's own
      // classification pass — no file was found using the Postgres pool any
      // other way). A generic "db.query(" style grep would false-positive on
      // several generator-core fixtures that embed that TEXT as fake source
      // content fed to the analyzer under test, not a real database call.
      if (/\bresetTestDb\s*\(/.test(content)) violations.push(f);
    }
    expect(
      violations,
      "These files are in the PARALLEL 'pure' project but call resetTestDb() — they touch the shared " +
        "test database and can race/corrupt other tests' state. Move each to DB_PROJECT_INCLUDE in " +
        "vitest.config.ts.",
    ).toEqual([]);
  });

  it("no file OUTSIDE the db project's explicit include calls resetTestDb()", () => {
    // The mirror image of the check above, covering files that are neither
    // project's problem yet (caught by the completeness test) as well as
    // ones that ARE in the pure or integration project (caught above, or
    // simply not DB-related by design) — a single pass that would catch a
    // new DB-touching file anywhere it landed by mistake.
    const violations: string[] = [];
    for (const f of allTestFiles()) {
      if (inDbProject(f)) continue;
      const content = readFileSync(join(ROOT, f), "utf8");
      if (/\bresetTestDb\s*\(/.test(content)) violations.push(f);
    }
    expect(
      violations,
      "These files call resetTestDb() but are not in DB_PROJECT_INCLUDE — add each so they stay " +
        "serialized against the shared test database.",
    ).toEqual([]);
  });
});
