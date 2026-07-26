// Affected-package detection for CI. Maps a git diff range to either "full"
// (run everything) or a specific set of workspace package directories, using
// pnpm's own dependency-graph filter (`--filter "...[ref]"` = every package
// changed since ref, PLUS every package that depends on it) rather than
// hand-rolling a graph walk.
//
// Usage: node scripts/ci-affected.mjs [<base-ref>]
//   No arg, or an all-zeros/empty ref (new-branch push, workflow_dispatch,
//   schedule): reports full=true unconditionally — there's nothing sane to
//   diff against, so narrowing would be a guess, not a fact.
//
// Prints `full=`, `pnpm_filter=`, and `packages=` lines to stdout, and
// appends the same to $GITHUB_OUTPUT when running in Actions.
//
// Fails SAFE: any internal error (bad ref, pnpm hiccup, malformed JSON)
// reports full=true rather than silently narrowing scope. Exit code is
// always 0 — this script informs the workflow, it never gates it.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { posix } from "node:path";

// Any changed file OUTSIDE apps/*|packages/* that does NOT match one of these
// "documentation only" patterns forces a full regression. Root-level config —
// pnpm-lock.yaml, tsconfig.base.json, vitest.config.ts, eslint.config.js,
// .github/workflows/*, scripts/* — can change every package's build/test/lint
// behavior in ways pnpm's package graph can't see. The default for an
// unrecognized root-level file is "unsafe to narrow", not "safe to ignore".
export const SAFE_ROOT_PATTERNS = [
  /^[^/]+\.md$/i, // any root-level *.md (docs, ledgers, runbooks)
  /^docs\//, // the docs/ directory
  /^eslint-suppressions\.json$/, // lint-only allowlist; zero runtime/test effect (lint itself always runs full regardless)
  /^\.prettierrc\.json$/, // formatting only
  /^\.gitignore$/,
  /^\.dockerignore$/,
  /^LICENSE$/,
];

export function isSafeRootFile(path) {
  return SAFE_ROOT_PATTERNS.some((re) => re.test(path));
}

/** True if any changed file lies outside apps/*|packages/* and isn't doc-only. */
export function needsFullRegression(changedFiles) {
  return changedFiles.some((f) => {
    if (f.startsWith("apps/") || f.startsWith("packages/")) return false;
    return !isSafeRootFile(f);
  });
}

/** Backslash-separated (Windows) or already-POSIX path -> forward-slash POSIX path. */
function toPosix(p) {
  return p.split("\\").join("/");
}

/**
 * Parse `pnpm --filter "...[ref]" list --depth -1 --json`'s stdout into
 * repo-relative package directories (POSIX separators), sorted, excluding
 * the workspace root pseudo-package itself (path === repoRoot).
 *
 * Normalizes to forward slashes BEFORE computing the relative path, and uses
 * posix.relative explicitly (not the platform-dependent default `relative`
 * export) — this repo's own CI runs on Linux, but this script is also run
 * directly on Windows during local development (`node scripts/ci-affected.mjs
 * <ref>`), where pnpm's JSON reports backslash paths. path.relative on
 * Windows understands backslashes; on Linux it does not, so calling it BEFORE
 * normalizing produced garbage there — this must give the identical result
 * regardless of which OS the script itself happens to run on.
 */
export function parseAffectedPackagePaths(pnpmJson, repoRoot) {
  const entries = JSON.parse(pnpmJson);
  const root = toPosix(repoRoot);
  const dirs = [];
  for (const e of entries) {
    const rel = posix.relative(root, toPosix(e.path));
    if (rel === "") continue; // workspace root — not a testable package dir
    dirs.push(rel);
  }
  return dirs.sort();
}

// CI (ubuntu-latest) resolves `pnpm`/`git` as plain executables, where the
// safer no-shell execFileSync default is fine. On Windows, pnpm is a .CMD
// shim that execFileSync cannot resolve without going through a shell — only
// needed for local dev-loop testing of this script, never in real CI.
const NEEDS_SHELL = process.platform === "win32";

export function getChangedFiles(base, cwd) {
  const out = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
    encoding: "utf8",
    cwd,
    maxBuffer: 64 * 1024 * 1024,
    shell: NEEDS_SHELL,
  });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

export function getAffectedPackagesJson(base, cwd) {
  return execFileSync("pnpm", ["--filter", `...[${base}]`, "list", "--depth", "-1", "--json"], {
    encoding: "utf8",
    cwd,
    maxBuffer: 16 * 1024 * 1024,
    shell: NEEDS_SHELL,
  });
}

/** Pure decision function: given an already-resolved base ref (or "" for "no sane diff"), compute the result. Shells out via the injected fns so this stays unit-testable without a real git/pnpm environment. */
export function resolveAffected(base, { changedFilesFn, affectedJsonFn, repoRoot }) {
  if (!base || /^0+$/.test(base)) {
    return { full: true, base: "", packages: [], reason: "no base ref (new branch, schedule, or manual full run)" };
  }

  let changedFiles;
  try {
    changedFiles = changedFilesFn(base);
  } catch (err) {
    return { full: true, base, packages: [], reason: `git diff failed: ${err.message}` };
  }

  if (changedFiles.length === 0) {
    return { full: false, base, packages: [], reason: "no changed files" };
  }

  if (needsFullRegression(changedFiles)) {
    return { full: true, base, packages: [], reason: "a root-level non-doc file changed" };
  }

  let json;
  try {
    json = affectedJsonFn(base);
  } catch (err) {
    return { full: true, base, packages: [], reason: `pnpm --filter failed: ${err.message}` };
  }

  let packages;
  try {
    packages = parseAffectedPackagePaths(json, repoRoot);
  } catch (err) {
    return { full: true, base, packages: [], reason: `could not parse pnpm output: ${err.message}` };
  }

  return { full: false, base, packages, reason: `${packages.length} package(s) changed or depend on a changed package` };
}

/**
 * Build the `pnpm_filter` output value: empty when full (bare `pnpm -r`
 * already covers everything) or when nothing changed (nothing to filter to —
 * downstream `pnpm -r` steps become a correct, cheap no-op on zero packages);
 * otherwise the EXACT SAME `...[ref]` expression already used to compute the
 * package list, reused verbatim rather than reconstructed from individual
 * paths, so build/typecheck can never see a different affected set than the
 * one vitest was given.
 */
export function buildPnpmFilter({ full, base, packages }) {
  if (full || packages.length === 0) return "";
  return `--filter "...[${base}]"`;
}

function writeOutputs(result) {
  const lines = [
    `full=${result.full}`,
    `packages=${result.packages.join(" ")}`,
    `pnpm_filter=${buildPnpmFilter(result)}`,
  ];
  for (const line of lines) console.log(line);

  const outFile = process.env.GITHUB_OUTPUT;
  if (outFile) {
    for (const line of lines) appendFileSync(outFile, line + "\n");
  }
}

function main() {
  const base = process.argv[2] ?? "";
  const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", shell: NEEDS_SHELL }).trim();

  const result = resolveAffected(base, {
    changedFilesFn: (b) => getChangedFiles(b, repoRoot),
    affectedJsonFn: (b) => getAffectedPackagesJson(b, repoRoot),
    repoRoot,
  });

  console.error(`[ci-affected] ${result.full ? "FULL" : "narrow"} — ${result.reason}`);
  writeOutputs(result);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
