import { readFileSync, readdirSync, statSync, existsSync, type Stats } from "node:fs";
import { join, relative, extname } from "node:path";
import type { FileEntry } from "@axis/snapshots";

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

export function scanDirectory(root: string): ScanResult {
  if (!existsSync(root)) {
    throw new Error(`Directory not found: ${root}`);
  }

  const files: FileEntry[] = [];
  let skipped = 0;
  let totalBytes = 0;

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

      // Include lockfiles as marker entries (empty content — parser only checks existence)
      if (entry === "package-lock.json" || entry === "pnpm-lock.yaml" || entry === "yarn.lock" ||
          entry === "Gemfile.lock" || entry === "poetry.lock" || entry === "Cargo.lock" || entry === "go.sum") {
        const relPath = relative(root, fullPath).replace(/\\/g, "/");
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

      if (!INCLUDE_EXTENSIONS.has(ext) && !isRootConfig) {
        skipped++;
        continue;
      }

      if (stat.size > MAX_FILE_SIZE) {
        skipped++;
        continue;
      }

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

  return { files, skipped_count: skipped, total_bytes: totalBytes };
}
