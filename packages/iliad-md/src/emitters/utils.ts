// Adapted from @axis/generator-core (packages/generator-core/src/file-excerpt-utils.ts
// and fw-helpers.ts). Pure helpers for excerpting source files in emitter output.

import type { FileEntry } from "../vendor/snapshots/types.js";
import type { ContextMap } from "../vendor/context-engine/types.js";

/** Max lines to show per file excerpt. */
const EXCERPT_LINES = 40;
/** Max total characters of file excerpts in a single emitter output. */
const MAX_EXCERPT_BUDGET = 12_000;

/** Case-insensitive check: does the project use any of the named frameworks? */
export function hasFw(ctx: ContextMap, ...names: string[]): boolean {
  return ctx.detection.frameworks.some(f => names.some(n => f.name.toLowerCase() === n.toLowerCase()));
}

/**
 * Extract the first N lines of a file's content as a fenced code block.
 */
export function excerpt(file: FileEntry, maxLines = EXCERPT_LINES): string {
  const lines = file.content.split("\n");
  const shown = lines.slice(0, maxLines);
  const ext = extname(file.path);
  const lang = LANG_MAP[ext] ?? "";
  const truncated = lines.length > maxLines ? `\n... (${lines.length - maxLines} more lines)` : "";
  return `\`\`\`${lang}\n${shown.join("\n")}${truncated}\n\`\`\``;
}

/**
 * Find entry-point-like files (index, main, server, app, etc.).
 */
export function findEntryPoints(files: FileEntry[]): FileEntry[] {
  const ENTRY_NAMES = [
    "index.ts", "index.tsx", "index.js", "index.jsx",
    "main.ts", "main.tsx", "main.js", "main.py",
    "app.ts", "app.tsx", "app.js", "app.py",
    "server.ts", "server.js", "server.py",
    "mod.ts", "lib.rs", "main.rs", "main.go",
  ];
  return files.filter(f => {
    const name = basename(f.path).toLowerCase();
    if (ENTRY_NAMES.includes(name)) return true;
    // SvelteKit root layout/page
    if (name === "+layout.svelte" || name === "+page.svelte") return true;
    return false;
  });
}

/**
 * Find config files (package.json, tsconfig, vite.config, etc.).
 */
export function findConfigs(files: FileEntry[]): FileEntry[] {
  const CONFIG_PATTERNS = [
    "package.json", "tsconfig", "vite.config", "webpack.config",
    "next.config", "tailwind.config", "postcss.config",
    "pyproject.toml", "setup.py", "cargo.toml", "go.mod",
    ".eslintrc", "prettier", "jest.config", "vitest.config",
  ];
  return files.filter(f => {
    const lower = f.path.toLowerCase();
    const name = basename(lower);
    return CONFIG_PATTERNS.some(p => name.includes(p));
  });
}

/**
 * Render a section with file excerpts, respecting the character budget.
 * Returns lines to push into the output.
 */
export function renderExcerpts(
  heading: string,
  filesToShow: FileEntry[],
  maxLines = EXCERPT_LINES,
  budget = MAX_EXCERPT_BUDGET,
): string[] {
  if (filesToShow.length === 0) return [];
  const lines: string[] = [];
  lines.push(`## ${heading}`);
  lines.push("");
  let used = 0;
  for (const f of filesToShow) {
    const block = excerpt(f, maxLines);
    if (used + block.length > budget) {
      lines.push(`*... ${filesToShow.length - filesToShow.indexOf(f)} more files omitted for brevity*`);
      break;
    }
    lines.push(`### \`${f.path}\``);
    lines.push("");
    lines.push(block);
    lines.push("");
    used += block.length;
  }
  return lines;
}

/**
 * Extract exported symbols (functions, classes, types, interfaces) from TypeScript/JavaScript content.
 */
export function extractExports(content: string): string[] {
  const exports: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("export ")) {
      // Capture the signature up to the opening brace or semicolon
      const sig = trimmed
        .replace(/\{[\s\S]*$/, "{ ... }")
        .replace(/=[\s\S]*$/, "= ...")
        .slice(0, 120);
      exports.push(sig);
    }
  }
  return exports.slice(0, 30); // cap at 30 exports
}

// ─── internal helpers ────────────────────────────────────────

function basename(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? p;
}

function extname(p: string): string {
  const name = basename(p);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

const LANG_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".rb": "ruby",
  ".java": "java",
  ".css": "css",
  ".scss": "scss",
  ".html": "html",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".md": "markdown",
  ".sql": "sql",
  ".sh": "bash",
};
