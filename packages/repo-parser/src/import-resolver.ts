import type { FileEntry } from "@axis/snapshots";
import type { ImportEdge } from "./types.js";

const IMPORT_PATTERNS = [
  /import\s+.*?\s+from\s+["'](\.[^"']+)["']/g,
  /import\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
  /require\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
];

export function extractImports(files: FileEntry[], goModulePath?: string): ImportEdge[] {
  const edges: ImportEdge[] = [];
  const filePaths = new Set(files.map((f) => f.path));

  for (const file of files) {
    if (!isSourceFile(file.path)) continue;

    // JS/TS import patterns
    if (!file.path.endsWith(".go")) {
      for (const pattern of IMPORT_PATTERNS) {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match: RegExpExecArray | null;
        while ((match = regex.exec(file.content)) !== null) {
          const raw = match[1];
          const resolved = resolveImportPath(file.path, raw, filePaths);
          if (resolved) {
            edges.push({ source: file.path, target: resolved });
          }
        }
      }
    }

    // Go import patterns
    if (file.path.endsWith(".go") && goModulePath) {
      const goEdges = extractGoImports(file, goModulePath, filePaths);
      edges.push(...goEdges);
    }
  }

  return edges;
}

function isSourceFile(path: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs)$/.test(path);
}

function resolveImportPath(
  fromFile: string,
  importPath: string,
  knownFiles: Set<string>,
): string | null {
  const dir = fromFile.substring(0, fromFile.lastIndexOf("/"));
  const base = importPath.startsWith("./") || importPath.startsWith("../")
    ? normalizePath(dir + "/" + importPath)
    : importPath;

  const candidates = [
    base,
    base + ".ts",
    base + ".tsx",
    base + ".js",
    base + ".jsx",
    base + "/index.ts",
    base + "/index.tsx",
    base + "/index.js",
  ];

  for (const c of candidates) {
    if (knownFiles.has(c)) return c;
  }
  return null;
}

function normalizePath(p: string): string {
  const parts = p.split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return resolved.join("/");
}

function extractGoImports(file: FileEntry, modulePath: string, knownFiles: Set<string>): ImportEdge[] {
  const edges: ImportEdge[] = [];
  const importPaths: string[] = [];

  // Single-line imports: import "path"
  const singleImport = /import\s+"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = singleImport.exec(file.content)) !== null) {
    importPaths.push(match[1]);
  }

  // Block imports: import ( "path1" \n "path2" )
  const blockImport = /import\s*\(([\s\S]*?)\)/g;
  while ((match = blockImport.exec(file.content)) !== null) {
    const block = match[1];
    const linePattern = /"([^"]+)"/g;
    let lineMatch: RegExpExecArray | null;
    while ((lineMatch = linePattern.exec(block)) !== null) {
      importPaths.push(lineMatch[1]);
    }
  }

  for (const imp of importPaths) {
    // Only internal imports (starts with module path)
    if (!imp.startsWith(modulePath + "/")) continue;

    const relPath = imp.substring(modulePath.length + 1);
    // Find first matching .go file under this package path
    const target = resolveGoPackage(relPath, knownFiles);
    if (target) {
      edges.push({ source: file.path, target });
    }
  }

  return edges;
}

function resolveGoPackage(packagePath: string, knownFiles: Set<string>): string | null {
  const candidates = Array.from(knownFiles)
    .filter((f) => f.endsWith(".go") && f.startsWith(packagePath + "/") && !f.includes("_test.go"))
    .sort();
  return candidates[0] ?? null;
}
