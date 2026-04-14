import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
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

    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;

      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        /* v8 ignore next — broken symlinks / ENOENT race, hard to simulate in tests */
        continue;
      }

      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(entry) && (!entry.startsWith(".") || ALLOW_DOT_DIRS.has(entry))) {
          walk(fullPath);
        }
        continue;
      }

      /* v8 ignore next — non-file entries (devices, pipes) hard to simulate in tests */
      if (!stat.isFile()) continue;

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
  }

  walk(root);

  return { files, skipped_count: skipped, total_bytes: totalBytes };
}
