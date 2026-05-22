/**
 * generate-symbol-index.test.ts
 *
 * Tests for the symbol-index.json generator (generateSymbolIndex).
 * Covers: no files, empty files, TS symbols, Python symbols, Go symbols,
 * symbol grouping by file, parent field, and pipeline integration via generateFiles.
 */

import { describe, it, expect } from "vitest";
import { generateSymbolIndex } from "./generators-search.js";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput, SourceFile } from "./types.js";

/* ─── Helpers ──────────────────────────────────────────────────── */

function snap(files: FileEntry[] = []): SnapshotRecord {
  return {
    snapshot_id: "snap-sym-idx",
    project_id: "proj-sym-idx",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: "sym-idx-test",
      project_type: "web_application",
      frameworks: [],
      goals: [],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files: files.length > 0 ? files : [{ path: "index.ts", content: "", size: 0 }],
    status: "ready",
    account_id: null,
  };
}

function gInput(sourceFiles?: SourceFile[]): GeneratorInput {
  const s = snap(sourceFiles?.map(f => ({ path: f.path, content: f.content, size: f.content.length })));
  return {
    context_map: buildContextMap(s),
    repo_profile: buildRepoProfile(s),
    requested_outputs: ["symbol-index.json"],
    source_files: sourceFiles,
  };
}

/* ─── generateSymbolIndex — unit ───────────────────────────────── */

describe("generateSymbolIndex — no files", () => {
  it("returns valid GeneratedFile shape with no source files", () => {
    const result = generateSymbolIndex(undefined);
    expect(result.path).toBe("symbol-index.json");
    expect(result.content_type).toBe("application/json");
    expect(result.program).toBe("search");
    expect(result.description.length).toBeGreaterThan(0);
  });

  it("produces valid JSON for empty file list", () => {
    const result = generateSymbolIndex([]);
    const json = JSON.parse(result.content) as Record<string, unknown>;
    expect(json.total_symbols).toBe(0);
    expect(json.file_count).toBe(0);
    expect(json.symbols).toEqual({});
  });
});

describe("generateSymbolIndex — TypeScript symbols", () => {
  const files: SourceFile[] = [
    {
      path: "src/handlers.ts",
      content: [
        "export function handleCreate(): void {}",
        "export async function handleDelete(): Promise<void> {}",
        "export class AuthService {}",
        "export interface UserPayload { id: string; }",
        "export type UserId = string;",
        "export enum Status { Active, Inactive }",
      ].join("\n"),
      size: 150,
    },
  ];

  it("extracts functions, async functions, class, interface, type, enum", () => {
    const result = generateSymbolIndex(files);
    const json = JSON.parse(result.content) as {
      total_symbols: number;
      file_count: number;
      symbols: Record<string, Array<{ name: string; type: string; line: number }>>;
    };
    expect(json.total_symbols).toBeGreaterThanOrEqual(4);
    expect(json.file_count).toBe(1);
    const syms = json.symbols["src/handlers.ts"];
    expect(Array.isArray(syms)).toBe(true);
    const names = syms.map(s => s.name);
    expect(names).toContain("handleCreate");
    expect(names).toContain("handleDelete");
    expect(names).toContain("AuthService");
  });

  it("each symbol has name, type, line fields", () => {
    const result = generateSymbolIndex(files);
    const json = JSON.parse(result.content) as {
      symbols: Record<string, Array<{ name: string; type: string; line: number }>>;
    };
    const syms = json.symbols["src/handlers.ts"];
    for (const s of syms) {
      expect(typeof s.name).toBe("string");
      expect(typeof s.type).toBe("string");
      expect(typeof s.line).toBe("number");
      expect(s.line).toBeGreaterThan(0);
    }
  });
});

describe("generateSymbolIndex — multi-file grouping", () => {
  const files: SourceFile[] = [
    { path: "src/a.ts", content: "export function alpha() {}\n", size: 26 },
    { path: "src/b.ts", content: "export class Beta {}\n", size: 20 },
  ];

  it("groups symbols by file path", () => {
    const result = generateSymbolIndex(files);
    const json = JSON.parse(result.content) as { symbols: Record<string, unknown[]> };
    expect(json.symbols["src/a.ts"]).toBeDefined();
    expect(json.symbols["src/b.ts"]).toBeDefined();
    expect(Array.isArray(json.symbols["src/a.ts"])).toBe(true);
    expect(Array.isArray(json.symbols["src/b.ts"])).toBe(true);
  });

  it("total_symbols equals sum across files", () => {
    const result = generateSymbolIndex(files);
    const json = JSON.parse(result.content) as {
      total_symbols: number;
      symbols: Record<string, unknown[]>;
    };
    const sum = Object.values(json.symbols).reduce((acc, arr) => acc + arr.length, 0);
    expect(json.total_symbols).toBe(sum);
  });
});

describe("generateSymbolIndex — non-code files skipped", () => {
  it("ignores .md, .json, .yaml files", () => {
    const files: SourceFile[] = [
      { path: "README.md", content: "# Hello\n## Usage\n", size: 18 },
      { path: "config.json", content: '{"key":"val"}', size: 13 },
      { path: "src/util.ts", content: "export function util() {}\n", size: 25 },
    ];
    const result = generateSymbolIndex(files);
    const json = JSON.parse(result.content) as {
      symbols: Record<string, unknown[]>;
    };
    // util.ts should be present, but README.md / config.json should NOT produce false-positive entries
    // (they are either skipped or have no matching symbols)
    const tsSymbols = json.symbols["src/util.ts"];
    expect(Array.isArray(tsSymbols)).toBe(true);
    expect((tsSymbols as Array<{ name: string }>)[0]?.name).toBe("util");
  });
});

describe("generateSymbolIndex — Python symbols", () => {
  it("extracts def and class from .py files", () => {
    const files: SourceFile[] = [
      {
        path: "app/models.py",
        content: "def create_user():\n    pass\n\nclass UserModel:\n    pass\n",
        size: 50,
      },
    ];
    const result = generateSymbolIndex(files);
    const json = JSON.parse(result.content) as {
      symbols: Record<string, Array<{ name: string; type: string }>>;
    };
    const syms = json.symbols["app/models.py"];
    expect(Array.isArray(syms)).toBe(true);
    const names = syms.map(s => s.name);
    expect(names).toContain("create_user");
    expect(names).toContain("UserModel");
  });
});

describe("generateSymbolIndex — Go symbols with parent (method receiver)", () => {
  it("extracts Go method with receiver and records parent field", () => {
    const files: SourceFile[] = [
      {
        path: "service/user.go",
        content: [
          "package service",
          "",
          "func (u *UserService) GetAll() ([]*User, error) {",
          "  return nil, nil",
          "}",
          "",
          "func NewUserService() *UserService {",
          "  return &UserService{}",
          "}",
        ].join("\n"),
        size: 100,
      },
    ];
    const result = generateSymbolIndex(files);
    const json = JSON.parse(result.content) as {
      total_symbols: number;
      symbols: Record<string, Array<{ name: string; type: string; line: number; parent?: string }>>;
    };
    const syms = json.symbols["service/user.go"];
    expect(Array.isArray(syms)).toBe(true);
    const method = syms.find(s => s.name === "GetAll");
    expect(method).toBeDefined();
    expect(method!.type).toBe("method");
    expect(method!.parent).toBeDefined();
    expect(typeof method!.parent).toBe("string");
    // Regular function should have no parent
    const fn = syms.find(s => s.name === "NewUserService");
    expect(fn).toBeDefined();
    expect(fn!.parent).toBeUndefined();
  });
});

describe("generateSymbolIndex — output JSON metadata", () => {
  it("includes generated_at timestamp", () => {
    const result = generateSymbolIndex([]);
    const json = JSON.parse(result.content) as { generated_at: string };
    expect(typeof json.generated_at).toBe("string");
    expect(json.generated_at.length).toBeGreaterThan(0);
  });
});

/* ─── Pipeline integration via generateFiles ────────────────────── */

describe("generateFiles — symbol-index.json via pipeline", () => {
  it("generates symbol-index.json with no source files", () => {
    const input = gInput();
    const result = generateFiles(input);
    const file = result.files.find(f => f.path === "symbol-index.json");
    expect(file).toBeDefined();
    expect(file!.content.length).toBeGreaterThan(0);
    expect(file!.content_type).toBe("application/json");
    expect(file!.program).toBe("search");
  });

  it("generates symbol-index.json with source code files", () => {
    const files: SourceFile[] = [
      { path: "src/index.ts", content: "export function main() {}\nexport class App {}\n", size: 45 },
    ];
    const input = gInput(files);
    const result = generateFiles(input);
    const file = result.files.find(f => f.path === "symbol-index.json");
    expect(file).toBeDefined();
    const json = JSON.parse(file!.content) as { total_symbols: number };
    expect(json.total_symbols).toBeGreaterThan(0);
  });

  it("produces valid JSON content", () => {
    const input = gInput();
    const result = generateFiles(input);
    const file = result.files.find(f => f.path === "symbol-index.json");
    expect(() => JSON.parse(file!.content)).not.toThrow();
  });
});
