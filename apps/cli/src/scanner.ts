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

  function walk(dir: string): void {
    /* v8 ignore next — MAX_FILES guard requires >10000 files to trigger */
    if (files.length >= MAX_FILES) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      /* v8 ignore next — permission denied / unreadable, hard to simulate in tests */
      return; // Permission denied or unreadable
    }

    // readdirSync order is filesystem-dependent (sorted on NTFS, arbitrary on
    // ext4). Sort so the scanned file order — and the analyzed subset when the
    // MAX_FILES cap kicks in — is identical across platforms, keeping the
    // pipeline byte-deterministic for the same repo state.
    entries.sort();

    // Stat once per entry, then process this directory's own FILES before
    // recursing into its SUBDIRECTORIES. A plain alphabetical walk that mixes
    // files and dirs starves root-level manifests on any repo where an
    // early-alphabetical top-level directory alone exceeds MAX_FILES — e.g.
    // a real monorepo with "apps/" (382 files) sorting before "pnpm-lock.yaml":
    // the DFS recursion into apps/ + packages/ alone blew the 500-file cap
    // before the walk ever reached pnpm-lock.yaml, pnpm-workspace.yaml or
    // render.yaml, so package-manager detection silently fell back to npm for
    // this very repo (confirmed 2026-07-25). Files-before-dirs at every level
    // guarantees a directory's own immediate manifests are captured before a
    // sibling subdirectory's depth can exhaust the cap.
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

    for (const entry of dirEntries) {
      if (files.length >= MAX_FILES) break;
      if (!SKIP_DIRS.has(entry) && (!entry.startsWith(".") || ALLOW_DOT_DIRS.has(entry))) {
        walk(join(dir, entry));
      }
    }
  }

  walk(root);

  return { files, skipped_count: skipped, total_bytes: totalBytes };
}
