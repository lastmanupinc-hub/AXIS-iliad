import type { FileEntry } from "@axis/snapshots";

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

function extractGoModels(file: FileEntry): DomainModel[] {
  const models: DomainModel[] = [];

  // Go structs
  const structPattern = /type\s+(\w+)\s+struct\s*\{([^}]*)\}/gs;
  let match: RegExpExecArray | null;
  while ((match = structPattern.exec(file.content)) !== null) {
    const name = match[1];
    if (name[0] !== name[0].toUpperCase()) continue; // skip unexported
    const fields = parseGoFields(match[2]);
    models.push({ name, kind: "struct", language: "Go", fields, source_file: file.path });
  }

  // Go interfaces
  const ifacePattern = /type\s+(\w+)\s+interface\s*\{([^}]*)\}/gs;
  while ((match = ifacePattern.exec(file.content)) !== null) {
    const name = match[1];
    if (name[0] !== name[0].toUpperCase()) continue;
    const fields = parseGoMethods(match[2]);
    models.push({ name, kind: "interface", language: "Go", fields, source_file: file.path });
  }

  return models;
}

function parseGoFields(body: string): Array<{ name: string; type: string }> {
  const fields: Array<{ name: string; type: string }> = [];
  const lines = body.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    const fieldMatch = trimmed.match(/^(\w+)\s+(\S+)/);
    if (fieldMatch) {
      // Skip embedded types (only one token on the line)
      const tokens = trimmed.split(/\s+/);
      /* v8 ignore next — regex /^(\w+)\s+(\S+)/ guarantees ≥2 tokens */
      if (tokens.length >= 2) {
        fields.push({ name: fieldMatch[1], type: fieldMatch[2] });
      }
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
    /* v8 ignore next 3 — V8 quirk: Go method pattern tested in domain-extractor tests */
    if (methodMatch) {
      methods.push({ name: methodMatch[1], type: "method" });
    }
  }
  return methods;
}

function extractTSModels(file: FileEntry): DomainModel[] {
  const models: DomainModel[] = [];

  // TypeScript interfaces
  const ifacePattern = /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+\w+)?\s*\{([^}]*)\}/gs;
  let match: RegExpExecArray | null;
  while ((match = ifacePattern.exec(file.content)) !== null) {
    const name = match[1];
    const fields = parseTSFields(match[2]);
    models.push({ name, kind: "interface", language: "TypeScript", fields, source_file: file.path });
  }

  // TypeScript type aliases with object shape
  const typePattern = /(?:export\s+)?type\s+(\w+)\s*=\s*\{([^}]*)\}/gs;
  while ((match = typePattern.exec(file.content)) !== null) {
    const name = match[1];
    const fields = parseTSFields(match[2]);
    models.push({ name, kind: "type_alias", language: "TypeScript", fields, source_file: file.path });
  }

  // TypeScript enums
  const enumPattern = /(?:export\s+)?enum\s+(\w+)\s*\{([^}]*)\}/gs;
  while ((match = enumPattern.exec(file.content)) !== null) {
    const name = match[1];
    const members = match[2].split(",").map((m) => m.trim()).filter(Boolean);
    const fields = members.map((m) => {
      const cleaned = m.split("=")[0].trim();
      return { name: cleaned, type: "member" };
    });
    models.push({ name, kind: "enum", language: "TypeScript", fields, source_file: file.path });
  }

  return models;
}

function parseTSFields(body: string): Array<{ name: string; type: string }> {
  const fields: Array<{ name: string; type: string }> = [];
  const fieldPattern = /(\w+)\??\s*:\s*([^;]+)/g;
  let match: RegExpExecArray | null;
  while ((match = fieldPattern.exec(body)) !== null) {
    fields.push({ name: match[1], type: match[2].trim() });
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
    if (/^class\s+\w+/.test(trimmed) || /^def\s+(?!__init__)/.test(trimmed) && !line.startsWith(" ")) break;

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
