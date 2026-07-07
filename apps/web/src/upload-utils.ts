// Pure utility functions extracted from AnalyzePage (formerly UploadPage) for testability
import JSZip from "jszip";

export const IGNORED_PATTERNS = [
  "node_modules/",
  ".git/",
  "dist/",
  ".next/",
  "__pycache__/",
  ".venv/",
  "target/",
  ".DS_Store",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];

// Binary extensions that should be skipped during zip extraction
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".svg", ".bmp",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".mp3", ".mp4", ".wav", ".avi", ".mov", ".mkv",
  ".pyc", ".class", ".o", ".obj", ".wasm",
]);

function isBinaryPath(path: string): boolean {
  /* v8 ignore next */
  const ext = ("." + (path.split(".").pop() ?? "")).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/** Extract files from a .zip ArrayBuffer. Skips binary files and ignored paths. */
export async function extractZip(
  data: ArrayBuffer,
): Promise<{ files: Array<{ path: string; content: string; size: number }>; skipped: number }> {
  const zip = await JSZip.loadAsync(data);
  const files: Array<{ path: string; content: string; size: number }> = [];
  let skipped = 0;

  // Find the common root prefix (many zips have a single top-level folder)
  const allPaths = Object.keys(zip.files).filter(p => !zip.files[p].dir);
  const commonPrefix = findCommonPrefix(allPaths);

  for (const [rawPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;

    // Strip common prefix so paths are relative to the project root
    const path = commonPrefix ? rawPath.slice(commonPrefix.length) : rawPath;
    /* v8 ignore next */
    if (!path) continue;

    if (shouldIgnore(path) || isBinaryPath(path)) { skipped++; continue; }

    // Skip files > 1MB
    if ((entry as JSZip.JSZipObject & { _data?: { uncompressedSize?: number } })._data?.uncompressedSize &&
        (entry as JSZip.JSZipObject & { _data?: { uncompressedSize?: number } })._data!.uncompressedSize! > 1024 * 1024) {
      skipped++;
      continue;
    }

    try {
      const content = await entry.async("string");
      /* v8 ignore next */
      if (content.length > 1024 * 1024) { skipped++; continue; }
      files.push({ path, content, size: content.length });
    } catch {
      // v8 ignore next
      skipped++; // binary or encoding issue
    }
  }

  return { files, skipped };
}

function findCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return "";
  const parts = paths[0].split("/");
  // Check if all paths share the same first directory
  if (parts.length > 1) {
    const prefix = parts[0] + "/";
    if (paths.every(p => p.startsWith(prefix))) return prefix;
  }
  return "";
}

export function shouldIgnore(path: string): boolean {
  return IGNORED_PATTERNS.some((p) => path.includes(p));
}

// ─── GitHub URL + branch composition (WO-P4) ────────────────────
// The API has no separate branch field — @axis/snapshots' parseGitHubUrl only
// ever reads a ref from a "/tree/<branch>" segment already in the URL — so
// the Analyze page's explicit Branch field folds its value into the URL
// client-side rather than sending it separately.

/**
 * Compose the URL sent to the analyze endpoints from a base repo URL and an
 * optional branch. An empty branch leaves the URL untouched (including any
 * "/tree/..." ref the user already pasted in). A non-empty branch is
 * authoritative: it replaces any existing "/tree/..." segment, so filling in
 * the field always wins over a stale or accidental ref left in the URL.
 */
export function buildGitHubUrl(rawUrl: string, branch: string): string {
  const url = rawUrl.trim().replace(/\/+$/, "");
  const trimmedBranch = branch.trim();
  if (!url || !trimmedBranch) return url;
  const withoutRef = url.replace(/\/tree\/.+$/, "");
  return `${withoutRef}/tree/${trimmedBranch}`;
}

// ─── Program label formatting (WO-P4) ────────────────────────────

/** Program names the registry spells as acronyms — everything else is
 *  plain title-case, derived (never a hand-maintained full label list, so
 *  it can't go stale the way the old 45-output picker did). */
const PROGRAM_LABEL_OVERRIDES: Record<string, string> = { seo: "SEO", mcp: "MCP" };

/** Human-readable label for a program slug from GET /v1/programs (e.g.
 *  "agentic-purchasing" → "Agentic Purchasing", "seo" → "SEO"). */
export function titleCaseProgram(name: string): string {
  const override = PROGRAM_LABEL_OVERRIDES[name];
  if (override) return override;
  return name
    .split("-")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function detectFrameworks(
  files: Array<{ path: string; content: string }>,
): string[] {
  const detected: string[] = [];
  const allContent = files.map((f) => f.content).join("\n");
  const pkgFile = files.find((f) => f.path === "package.json");
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.react) detected.push("react");
      if (deps.vue) detected.push("vue");
      if (deps.svelte) detected.push("svelte");
      if (deps.next) detected.push("next");
      if (deps.vite) detected.push("vite");
      if (deps.express) detected.push("express");
      if (deps.tailwindcss) detected.push("tailwind");
      if (deps.typescript) detected.push("typescript");
      if (deps["@angular/core"]) detected.push("angular");
    } catch {
      /* not valid JSON */
    }
  }
  if (files.some((f) => f.path.endsWith(".py"))) {
    if (allContent.includes("from flask")) detected.push("flask");
    if (allContent.includes("from django")) detected.push("django");
    if (allContent.includes("from fastapi")) detected.push("fastapi");
  }
  return detected;
}
