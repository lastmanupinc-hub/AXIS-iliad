import type { SourceFile } from "./types.js";

/** Max lines to show per file excerpt. */
const EXCERPT_LINES = 40;
/** Max total characters of file excerpts in a single generator output. */
const MAX_EXCERPT_BUDGET = 12_000;

/**
 * Find source files matching any of the given path patterns (substring match, case-insensitive).
 */
export function findFiles(files: SourceFile[], patterns: string[]): SourceFile[] {
  return files.filter(f => {
    const lower = f.path.toLowerCase();
    return patterns.some(p => lower.includes(p.toLowerCase()));
  });
}

/**
 * Find a single file by exact name (basename match), or fallback to substring.
 */
export function findFile(files: SourceFile[], name: string): SourceFile | undefined {
  const lower = name.toLowerCase();
  return (
    files.find(f => basename(f.path).toLowerCase() === lower) ??
    files.find(f => f.path.toLowerCase().includes(lower))
  );
}

/**
 * Extract the first N lines of a file's content as a fenced code block.
 */
export function excerpt(file: SourceFile, maxLines = EXCERPT_LINES): string {
  const lines = file.content.split("\n");
  const shown = lines.slice(0, maxLines);
  const ext = extname(file.path);
  const lang = LANG_MAP[ext] ?? "";
  const truncated = lines.length > maxLines ? `\n... (${lines.length - maxLines} more lines)` : "";
  return `\`\`\`${lang}\n${shown.join("\n")}${truncated}\n\`\`\``;
}

/**
 * Build a compact file tree string from source files.
 */
export function fileTree(files: SourceFile[]): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const lines: string[] = [];
  for (const f of sorted) {
    const sizeKB = (f.size / 1024).toFixed(1);
    lines.push(`${f.path} (${sizeKB} KB)`);
  }
  return lines.join("\n");
}

/**
 * Find entry-point-like files (index, main, server, app, etc.).
 */
export function findEntryPoints(files: SourceFile[]): SourceFile[] {
  const ENTRY_NAMES = [
    "index.ts", "index.tsx", "index.js", "index.jsx",
    "main.ts", "main.tsx", "main.js", "main.py",
    "app.ts", "app.tsx", "app.js", "app.py",
    "server.ts", "server.js", "server.py",
    "mod.ts", "lib.rs", "main.rs", "main.go",
  ];
  return files.filter(f => {
    const name = basename(f.path).toLowerCase();
    return ENTRY_NAMES.includes(name);
  });
}

/**
 * Find config files (package.json, tsconfig, vite.config, etc.).
 */
export function findConfigs(files: SourceFile[]): SourceFile[] {
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
  filesToShow: SourceFile[],
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
