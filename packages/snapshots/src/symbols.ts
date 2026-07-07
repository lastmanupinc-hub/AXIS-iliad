// ─── Pure symbol extraction (no database, no external deps) ──────
//
// Extracted from search-store.ts so that consumers that only need symbol
// extraction (the generator-core search program, the offline axis-iliad CLI
// bundle) can reach it without pulling in the Postgres data layer (pg.js).
// search-store.ts re-exports everything here, so the package's public
// surface is unchanged.

export type SymbolType = "function" | "class" | "interface" | "type" | "enum" | "method" | "struct" | "const";

export interface CodeSymbol {
  snapshot_id: string;
  file_path: string;
  symbol_name: string;
  symbol_type: SymbolType;
  line_number: number;
  parent: string | null;
}

// Ordered list of symbol extraction patterns.
// Each entry: [regex, type, groupIndex for name, optional groupIndex for parent]
const SYMBOL_PATTERNS: Array<[RegExp, SymbolType, number, number?]> = [
  // TypeScript / JavaScript
  [/^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/, "class", 1],
  [/^(?:export\s+)?interface\s+([A-Za-z_$][A-Za-z0-9_$]*)/, "interface", 1],
  [/^(?:export\s+)?(?:declare\s+)?enum\s+([A-Za-z_$][A-Za-z0-9_$]*)/, "enum", 1],
  [/^(?:export\s+)?type\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[=<]/, "type", 1],
  [/^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][A-Za-z0-9_$]*)/, "function", 1],
  [/^(?:export\s+default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][A-Za-z0-9_$]*)/, "function", 1],
  [/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(/, "function", 1],
  [/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(\)/, "function", 1],
  [/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::\s*\S+\s*)?=\s*\{/, "const", 1],
  // Python
  [/^def\s+([a-zA-Z_][a-zA-Z0-9_]*)/, "function", 1],
  [/^async\s+def\s+([a-zA-Z_][a-zA-Z0-9_]*)/, "function", 1],
  [/^class\s+([A-Za-z_][A-Za-z0-9_]*)/, "class", 1],
  // Go
  [/^func\s+\(([A-Za-z_][A-Za-z0-9_]*)\s+\*?[A-Za-z_][A-Za-z0-9_]*\)\s+([A-Za-z_][A-Za-z0-9_]*)/, "method", 2, 1],
  [/^func\s+([A-Za-z_][A-Za-z0-9_]*)/, "function", 1],
  [/^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+struct/, "struct", 1],
  [/^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+interface/, "interface", 1],
];

/** Extract code symbols (functions, classes, etc.) from a list of files. */
export function extractSymbols(files: Array<{ path: string; content: string }>): Omit<CodeSymbol, "snapshot_id">[] {
  const symbols: Omit<CodeSymbol, "snapshot_id">[] = [];

  for (const file of files) {
    // v8 ignore next
    const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
    const isCode = ["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go"].includes(ext);
    if (!isCode) continue;

    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line || line.startsWith("//") || line.startsWith("#")) continue;

      for (const [pattern, type, nameIdx, parentIdx] of SYMBOL_PATTERNS) {
        const m = pattern.exec(line);
        if (m) {
          const name = m[nameIdx];
          // v8 ignore next
          const parent = parentIdx !== undefined ? (m[parentIdx] ?? null) : null;
          // v8 ignore next
          if (name && name.length >= 2 && name.length <= 80) {
            symbols.push({
              file_path: file.path,
              symbol_name: name,
              symbol_type: type,
              line_number: i + 1,
              parent,
            });
          }
          break; // first matching pattern wins per line
        }
      }
    }
  }
  return symbols;
}
