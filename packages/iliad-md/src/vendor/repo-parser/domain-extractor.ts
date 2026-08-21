// Vendored from @axis/repo-parser (packages/repo-parser/src/domain-extractor.ts).
// FileEntry import rewired to the local snapshots type redeclaration.
//
// RE-VENDORED 2026-08-20 (tool_01_redundancy_sweep's vendor-sync guard found this had
// drifted). Two real fixes ported, not just style: (1) balanced-brace matching —
// the old `\{([^}]*)\}` capture stopped at the FIRST "}" and silently dropped every
// field after a nested type (e.g. a struct field whose own type is itself a struct
// literal); (2) parseTSFields is now bounded per-line — the old whole-body regex
// backtracks quadratically on a missing terminator, a ReDoS a crafted .ts file in
// an analyzed repo could trigger. Both matter here specifically because this
// package's whole job is parsing arbitrary, potentially hostile repositories.

import type { FileEntry } from "../snapshots/types.js";

export interface DomainModel {
  name: string;
  kind: "struct" | "interface" | "type_alias" | "enum" | "class";
  language: string;
  fields: Array<{ name: string; type: string }>;
  source_file: string;
}

export function extractDomainModels(files: FileEntry[]): DomainModel[] {
  const models: DomainModel[] = [];

  for (const file of files) {
    if (isTestFile(file.path)) continue;

    if (file.path.endsWith(".go")) {
      models.push(...extractGoModels(file));
    } else if (file.path.endsWith(".ts") || file.path.endsWith(".tsx")) {
      models.push(...extractTSModels(file));
    } else if (file.path.endsWith(".py")) {
      models.push(...extractPyModels(file));
    }
  }

  return models.sort((a, b) =>
    a.source_file.localeCompare(b.source_file) || a.name.localeCompare(b.name),
  );
}

function isTestFile(path: string): boolean {
  return /\.(test|spec|_test)\.(ts|tsx|js|jsx|py|go|rs)$/.test(path) ||
    path.includes("_test.go") ||
    path.includes("__tests__/") ||
    path.startsWith("tests/") ||
    path.startsWith("test/");
}

/**
 * From the index of an opening "{", return the brace-balanced body (exclusive of
 * the braces) and the index just past the matching "}". null if unbalanced. This
 * replaces a `\{([^}]*)\}` capture, which stopped at the first "}" and dropped
 * every field after a nested type.
 */
function balancedBraceBody(content: string, openIndex: number): { body: string; end: number } | null {
  let depth = 0;
  for (let i = openIndex; i < content.length; i++) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}" && --depth === 0) {
      return { body: content.slice(openIndex + 1, i), end: i + 1 };
    }
  }
  return null;
}

/**
 * Run `pattern` (which must end at the opening "{") over `content`, handing the
 * captured name + the brace-balanced body to `onMatch`, then resume scanning past
 * the full (possibly nested) body so inner braces never truncate a definition.
 */
function collectBraceTypes(
  content: string,
  pattern: RegExp,
  onMatch: (name: string, body: string) => void,
): void {
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const openIndex = match.index + match[0].length - 1; // the trailing "{"
    const balanced = balancedBraceBody(content, openIndex);
    if (!balanced) continue;
    onMatch(match[1], balanced.body);
    pattern.lastIndex = balanced.end;
  }
}

function extractGoModels(file: FileEntry): DomainModel[] {
  const models: DomainModel[] = [];

  collectBraceTypes(file.content, /type\s+(\w+)\s+struct\s*\{/g, (name, body) => {
    if (name[0] !== name[0].toUpperCase()) return; // skip unexported
    models.push({ name, kind: "struct", language: "Go", fields: parseGoFields(body), source_file: file.path });
  });

  collectBraceTypes(file.content, /type\s+(\w+)\s+interface\s*\{/g, (name, body) => {
    if (name[0] !== name[0].toUpperCase()) return;
    models.push({ name, kind: "interface", language: "Go", fields: parseGoMethods(body), source_file: file.path });
  });

  return models;
}

function parseGoFields(body: string): Array<{ name: string; type: string }> {
  const fields: Array<{ name: string; type: string }> = [];
  const lines = body.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    // The regex requires "name<space>type", so single-token embedded types
    // (e.g. `io.Reader` on its own line) simply don't match — no extra guard needed.
    const fieldMatch = trimmed.match(/^(\w+)\s+(\S+)/);
    if (fieldMatch) {
      fields.push({ name: fieldMatch[1], type: fieldMatch[2] });
    }
  }
  return fields;
}

function parseGoMethods(body: string): Array<{ name: string; type: string }> {
  const methods: Array<{ name: string; type: string }> = [];
  const lines = body.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    const methodMatch = trimmed.match(/^(\w+)\s*\(/);
    if (methodMatch) {
      methods.push({ name: methodMatch[1], type: "method" });
    }
  }
  return methods;
}

function extractTSModels(file: FileEntry): DomainModel[] {
  const models: DomainModel[] = [];

  // TypeScript interfaces ([^{]* absorbs an `extends A, B<T>` clause up to the brace).
  collectBraceTypes(file.content, /(?:export\s+)?interface\s+(\w+)[^{]*\{/g, (name, body) => {
    models.push({ name, kind: "interface", language: "TypeScript", fields: parseTSFields(body), source_file: file.path });
  });

  // TypeScript type aliases with object shape
  collectBraceTypes(file.content, /(?:export\s+)?type\s+(\w+)\s*=\s*\{/g, (name, body) => {
    models.push({ name, kind: "type_alias", language: "TypeScript", fields: parseTSFields(body), source_file: file.path });
  });

  // TypeScript enums
  collectBraceTypes(file.content, /(?:export\s+)?enum\s+(\w+)\s*\{/g, (name, body) => {
    const members = body.split(",").map((m) => m.trim()).filter(Boolean);
    const fields = members.map((m) => ({ name: m.split("=")[0].trim(), type: "member" }));
    models.push({ name, kind: "enum", language: "TypeScript", fields, source_file: file.path });
  });

  return models;
}

function parseTSFields(body: string): Array<{ name: string; type: string }> {
  const fields: Array<{ name: string; type: string }> = [];
  // Match per LINE, not over the whole interface body: running the greedy pattern across a
  // large body backtracks quadratically on a missing terminator (ReDoS on attacker .ts
  // content). Per-line bounds each match to one line, like parseGoFields/parsePyFields.
  const fieldPattern = /(\w+)\??\s*:\s*([^;]+)/g;
  for (const line of body.split("\n")) {
    // Real field lines are short; a long delimiter-less run is the ReDoS trigger (the greedy
    // \w+ backtracks quadratically before failing to find ':'). Skip pathological lines.
    if (line.length > 2000) continue;
    fieldPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = fieldPattern.exec(line)) !== null) {
      fields.push({ name: match[1], type: match[2].trim() });
    }
  }
  return fields;
}

function extractPyModels(file: FileEntry): DomainModel[] {
  const models: DomainModel[] = [];
  const classPattern = /^class\s+(\w+).*?:/gm;
  let match: RegExpExecArray | null;

  while ((match = classPattern.exec(file.content)) !== null) {
    const name = match[1];
    if (name[0] !== name[0].toUpperCase()) continue;

    // Extract fields from self.x = ... or self.x: type = ... patterns
    const classStart = match.index + match[0].length;
    const rest = file.content.substring(classStart);
    const fields = parsePyFields(rest);

    models.push({ name, kind: "class", language: "Python", fields, source_file: file.path });
  }

  return models;
}

function parsePyFields(classBody: string): Array<{ name: string; type: string }> {
  const fields: Array<{ name: string; type: string }> = [];
  const seen = new Set<string>();
  const lines = classBody.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // Stop at next class or top-level definition
    if (/^class\s+\w+/.test(trimmed) || (/^def\s+(?!__init__)/.test(trimmed) && !line.startsWith(" "))) break;

    // self.name: type = value
    const typedMatch = trimmed.match(/self\.(\w+)\s*:\s*(\w+)/);
    if (typedMatch && !seen.has(typedMatch[1])) {
      seen.add(typedMatch[1]);
      fields.push({ name: typedMatch[1], type: typedMatch[2] });
      continue;
    }

    // self.name = value (no type annotation)
    const simpleMatch = trimmed.match(/self\.(\w+)\s*=/);
    if (simpleMatch && !seen.has(simpleMatch[1])) {
      seen.add(simpleMatch[1]);
      fields.push({ name: simpleMatch[1], type: "unknown" });
    }
  }

  return fields;
}
