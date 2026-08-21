// Vendored from the AXIS CLI (apps/cli/src/scanner.ts).
// FileEntry import rewired to the local snapshots type redeclaration.
//
// RE-VENDORED 2026-08-20 (tool_01_redundancy_sweep's vendor-sync guard found this had
// drifted): ported the source-first admission algorithm (SOURCE_EXTENSIONS/
// MANIFEST_NAMES/deferred two-pass fill/per-top-level round-robin walk) that fixed
// real evidence-quality bugs found dogfooding against a 1000+-file customer repo —
// the OLD plain depth-first walk this file used to run could fill its whole budget
// on root config/docs before source ever contributed, and go.mod was never scanned
// at all so Go wasn't even detected as a language.
//
// NOT a straight copy: the real apps/cli/src/scanner.ts DROPPED the `excludePaths`
// option entirely (no longer needed there), but packages/iliad-md/src/cli.ts still
// calls scanDirectory(root, { excludePaths: GENERATED_TARGET_PATHS }) — the standard
// "exclude this tool's own prior output from its own regeneration input" guard this
// repo's app_11/app_24/app_31 watchers all rely on. Re-added on top of the ported
// algorithm rather than silently dropped, so re-vendoring never regresses a
// capability THIS package's real caller still depends on. Exclusion happens at
// first encounter in readOwnFiles, before a file can consume any budget (immediate
// admission OR a deferred slot) — matching the original's own contract.

import { readFileSync, readdirSync, statSync, existsSync, type Stats } from "node:fs";
import { join, relative, extname } from "node:path";
import type { FileEntry } from "../snapshots/types.js";

/** Extensions worth scanning (source, config, docs) */
const INCLUDE_EXTENSIONS = new Set([
  // Source
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".scala",
  ".cs", ".fs", ".swift", ".dart", ".lua", ".php",
  ".c", ".cpp", ".h", ".hpp", ".cc",
  // Config
  ".json", ".yaml", ".yml", ".toml", ".xml", ".env",
  ".ini", ".cfg", ".conf",
  // Docs / markup
  ".md", ".mdx", ".txt", ".rst",
  // Web
  ".html", ".htm", ".css", ".scss", ".sass", ".less",
  ".svelte", ".vue", ".astro",
  // Build / CI
  ".dockerfile", ".sh", ".bash", ".zsh", ".ps1",
  // Data
  ".sql", ".graphql", ".gql", ".prisma",
]);

// ─── Source-first admission under the cap (PAI'D dogfood, 2026-08-15) ──────
//
// Running the real pitch program against a 1000+-file customer repo produced a
// deck whose "measured truth" was: primary language YAML, frameworks Svelte
// only, 0 test files — for a Go monorepo with ~914 Go test files. Honest
// labeling (floors regime) kept it from lying, but the EVIDENCE was junk: the
// 500-file budget filled with root config/docs and equal-share directory
// turns before go-backend/ contributed meaningfully, and go.mod was never
// scanned at all (".mod" is not an included extension and nothing name-carved
// it), so Go wasn't even DETECTED as a language.
//
// Fix, preserving the two prior starvation fixes (root files first; strict
// per-top-level round-robin — see the block comment at the walk below):
//   * the WALK ORDER is unchanged and stays deterministic;
//   * ADMISSION changes: source files are admitted the moment they are seen;
//     config/docs/web files are DEFERRED (path only, no content read) in
//     encounter order and only fill whatever budget remains after the walk;
//   * a small set of MANIFESTS is admitted unconditionally with content —
//     detection depends on them (go.mod carries the module path; package.json
//     carries the stack) and there are never enough of them to hurt the budget.
const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".scala",
  ".cs", ".fs", ".swift", ".dart", ".lua", ".php",
  ".c", ".cpp", ".h", ".hpp", ".cc",
  ".svelte", ".vue", ".astro",
  ".sql", ".graphql", ".gql", ".prisma",
]);

/** Detection-critical files admitted by NAME, with content, regardless of extension. */
const MANIFEST_NAMES = new Set([
  "package.json", "go.mod", "go.work", "Cargo.toml", "pyproject.toml",
  "composer.json", "Gemfile", "requirements.txt", "tsconfig.json", "pnpm-workspace.yaml",
]);

// The first source-first version deferred README with the rest of the docs —
// and on a source-rich repo the budget filled before the fill loop ever ran,
// so the SECOND PAI'D regeneration produced a truth slide reading "No numeric
// claims found in README/docs to audit" while the README plainly claims "689
// routes". One evidence hole traded for another: the claims audit's own input
// starved. README is identity + primary claims source — admitted by name, like
// a manifest. And the fill below guarantees the audit's other inputs a floor:
// DOC_RESERVE slots (matching the audit's own 12-doc ceiling) that source
// admission may not consume.
const isReadmeName = (name: string): boolean => name.toLowerCase() === "readme.md";
const DOC_RESERVE = 12;
/** Doc files the pitch claims-audit scans — mirrors generators-pitch.ts's filter. */
const AUDIT_DOC_RE = /(^|\/)readme\.md$|(^|\/)docs\/.*\.md$/i;

/** Dot-directories that should still be scanned (e.g. CI, configs) */
const ALLOW_DOT_DIRS = new Set([".github", ".circleci"]);

/** Directories to always skip */
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt",
  ".svelte-kit", ".output", "__pycache__", ".venv", "venv",
  "target", "bin", "obj", "coverage", ".turbo", ".cache",
  ".parcel-cache", ".vercel", ".netlify",
]);

/** Max file size to read (256 KB) */
const MAX_FILE_SIZE = 256 * 1024;

/** Max total files to prevent scanning massive repos */
const MAX_FILES = 500;

export interface ScanResult {
  files: FileEntry[];
  skipped_count: number;
  total_bytes: number;
}

export interface ScanOptions {
  /**
   * Root-relative paths (forward-slash form) to leave out of the scan entirely.
   * Exclusion happens BEFORE the MAX_FILES cap is applied, so excluded files
   * (e.g. this tool's own generated outputs) never displace real source files
   * from the analysis window of a large repo. NOT present in the upstream
   * apps/cli/src/scanner.ts this file is otherwise vendored from — re-added
   * here because packages/iliad-md/src/cli.ts still depends on it.
   */
  excludePaths?: ReadonlySet<string>;
}

export function scanDirectory(root: string, options?: ScanOptions): ScanResult {
  if (!existsSync(root)) {
    throw new Error(`Directory not found: ${root}`);
  }

  const excludePaths = options?.excludePaths;
  const files: FileEntry[] = [];
  let skipped = 0;
  let totalBytes = 0;
  // Non-source candidates, in deterministic encounter order. Bounded at
  // MAX_FILES because the fill below can never use more than that; paths only,
  // so a giant repo cannot balloon memory here.
  const deferred: string[] = [];

  // Read one directory's own entries: this directory's files (in scan order,
  // already cap-checked and content-loaded) plus its scannable subdirectories
  // (name only — the caller decides when to visit them).
  function readOwnFiles(dir: string): { subdirs: string[] } {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      /* v8 ignore next — permission denied / unreadable, hard to simulate in tests */
      return { subdirs: [] };
    }

    // readdirSync order is filesystem-dependent (sorted on NTFS, arbitrary on
    // ext4). Sort so the scanned file order — and the analyzed subset when the
    // MAX_FILES cap kicks in — is identical across platforms, keeping the
    // pipeline byte-deterministic for the same repo state.
    entries.sort();

    const dirEntries: string[] = [];
    const fileEntries: Array<{ name: string; stat: Stats }> = [];
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      let stat: Stats;
      try {
        stat = statSync(fullPath);
      } catch {
        /* v8 ignore next — broken symlinks / ENOENT race, hard to simulate in tests */
        continue;
      }
      if (stat.isDirectory()) {
        dirEntries.push(entry);
      } else if (stat.isFile()) {
        fileEntries.push({ name: entry, stat });
      }
      /* v8 ignore next — non-file, non-directory entries (devices, pipes) hard to simulate in tests */
    }

    for (const { name: entry, stat } of fileEntries) {
      if (files.length >= MAX_FILES) break;

      const fullPath = join(dir, entry);
      const relPath = relative(root, fullPath).replace(/\\/g, "/");

      // Excluded paths leave the scan entirely, before consuming any budget —
      // immediate admission or a deferred slot — same contract the removed
      // upstream ScanOptions documented.
      if (excludePaths?.has(relPath)) continue;

      // Include lockfiles as marker entries (empty content — parser only checks existence)
      if (entry === "package-lock.json" || entry === "pnpm-lock.yaml" || entry === "yarn.lock" ||
          entry === "Gemfile.lock" || entry === "poetry.lock" || entry === "Cargo.lock" || entry === "go.sum") {
        files.push({ path: relPath, content: "", size: 0 });
        continue;
      }

      const ext = extname(entry).toLowerCase();

      // Include extensionless config files at root
      const isRootConfig = ext === "" && (
        entry === "Dockerfile" || entry === "Makefile" ||
        entry === ".gitignore" || entry === ".eslintrc" ||
        entry === ".prettierrc"
      );
      const isManifest = MANIFEST_NAMES.has(entry) || isReadmeName(entry);

      if (!INCLUDE_EXTENSIONS.has(ext) && !isRootConfig && !isManifest) {
        skipped++;
        continue;
      }

      if (stat.size > MAX_FILE_SIZE) {
        skipped++;
        continue;
      }

      // Source and manifests admit NOW; everything else defers (path only, no
      // content read) and competes for whatever budget survives the walk.
      // Plain source may not eat into the DOC_RESERVE — past that line it
      // defers too, behind the audit docs it would otherwise starve.
      const admitNow = isManifest || isRootConfig || (SOURCE_EXTENSIONS.has(ext) && files.length < MAX_FILES - DOC_RESERVE);
      if (!admitNow) {
        if (deferred.length < MAX_FILES * 2) deferred.push(fullPath);
        else skipped++;
        continue;
      }

      try {
        const content = readFileSync(fullPath, "utf-8");
        const size = Buffer.byteLength(content, "utf-8");
        files.push({ path: relPath, content, size });
        totalBytes += size;
      } catch {
        /* v8 ignore next — read failures on valid files, hard to simulate in tests */
        skipped++;
      }
    }

    const scannable = dirEntries.filter(
      (entry) => !SKIP_DIRS.has(entry) && (!entry.startsWith(".") || ALLOW_DOT_DIRS.has(entry)),
    );
    return { subdirs: scannable };
  }

  // Root's own files first (e.g. package.json, pnpm-lock.yaml), unconditionally.
  const { subdirs: topLevelDirs } = readOwnFiles(root);

  // Round-robin ONE FIFO queue PER TOP-LEVEL DIRECTORY, not a single shared
  // queue. This is deliberately NOT plain level-by-level BFS: a shared queue
  // still lets one wide top-level directory (e.g. "apps/", expanding into
  // apps/api + apps/web + apps/cli in a single step) push all of ITS children
  // onto the queue back-to-back, consuming the whole remaining budget before a
  // sibling top-level directory's OWN, far-fewer children ever get a turn —
  // "breadth-first" in name only. Giving every top-level directory its own
  // queue and strictly alternating ONE directory's turn per queue per round
  // means no top-level directory's subtree width can crowd out another's
  // chance to contribute anything at all, however many children it happens to
  // expand into on any given round. (Confirmed both failure modes empirically
  // dogfooding this very repo, 2026-07-26: pure depth-first left only 3 of its
  // ~10 real top-level directories represented; a shared-queue breadth-first
  // still left "apps/"'s 3 children starving "packages/"'s 2 in the same
  // fixture-scale test below.)
  const queues: string[][] = topLevelDirs.map((name) => [join(root, name)]);
  let anyNonEmpty = true;
  while (files.length < MAX_FILES && anyNonEmpty) {
    anyNonEmpty = false;
    for (const queue of queues) {
      if (files.length >= MAX_FILES) break;
      const dir = queue.shift();
      if (dir === undefined) continue; // this top-level directory's subtree is exhausted; skip its turn
      anyNonEmpty = true;
      const { subdirs } = readOwnFiles(dir);
      for (const name of subdirs) queue.push(join(dir, name));
    }
  }

  // Deferred fill, two passes over the same deterministic encounter order:
  //   1. audit docs first (readme/docs *.md — the claims audit's own inputs,
  //      capped at its 12-doc ceiling), so the truth slide can never go dark
  //      on a source-saturated repo again;
  //   2. everything else — overflow source, config, remaining docs — with
  //      whatever budget is left.
  // On a source-heavy repo at the cap this is the inversion of BOTH PAI'D
  // failures: code beats YAML noise, and the README beats the code's overflow.
  const readDeferred = (fullPath: string): void => {
    try {
      const content = readFileSync(fullPath, "utf-8");
      const relPath = relative(root, fullPath).replace(/\\/g, "/");
      const size = Buffer.byteLength(content, "utf-8");
      files.push({ path: relPath, content, size });
      totalBytes += size;
    } catch {
      /* v8 ignore next — read failures on valid files, hard to simulate in tests */
      skipped++;
    }
  };
  const isAuditDoc = (p: string) => AUDIT_DOC_RE.test(relative(root, p).replace(/\\/g, "/"));
  const taken = new Set<string>();
  let auditDocsTaken = 0;
  for (const fullPath of deferred) {
    if (files.length >= MAX_FILES || auditDocsTaken >= DOC_RESERVE) break;
    if (!isAuditDoc(fullPath)) continue;
    readDeferred(fullPath);
    taken.add(fullPath);
    auditDocsTaken++;
  }
  for (const fullPath of deferred) {
    if (files.length >= MAX_FILES) break;
    if (taken.has(fullPath)) continue;
    readDeferred(fullPath);
  }

  return { files, skipped_count: skipped, total_bytes: totalBytes };
}
