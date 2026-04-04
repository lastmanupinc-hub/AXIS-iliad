// Pure utility functions extracted from UploadPage for testability

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
