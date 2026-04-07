// Pure utility functions extracted from UploadPage for testability
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
      if (content.length > 1024 * 1024) { skipped++; continue; }
      files.push({ path, content, size: content.length });
    } catch {
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
