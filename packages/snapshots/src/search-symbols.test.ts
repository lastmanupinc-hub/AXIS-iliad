import { describe, it, expect, beforeEach } from "vitest";
import { resetTestDb } from "./pg-test.js";
import {
  extractSymbols,
  indexSymbols,
  searchSymbols,
  clearSymbols,
  getSymbolStats,
} from "./search-store.js";

beforeEach(async () => { await resetTestDb(); });

// ─── extractSymbols ─────────────────────────────────────────────

describe("extractSymbols", () => {
  it("extracts TypeScript function declarations", () => {
    const files = [{ path: "src/utils.ts", content: "export function handleRequest() {\n  return 1;\n}\n" }];
    const symbols = extractSymbols(files);
    expect(symbols.some((s) => s.symbol_name === "handleRequest" && s.symbol_type === "function")).toBe(true);
  });

  it("extracts async arrow function assigned to const", () => {
    const files = [{ path: "src/api.ts", content: "export const fetchData = async (url: string) => {\n  return fetch(url);\n};\n" }];
    const symbols = extractSymbols(files);
    expect(symbols.some((s) => s.symbol_name === "fetchData" && s.symbol_type === "function")).toBe(true);
  });

  it("extracts class declarations", () => {
    const files = [{ path: "src/service.ts", content: "export class UserService {\n  constructor() {}\n}\n" }];
    const symbols = extractSymbols(files);
    expect(symbols.some((s) => s.symbol_name === "UserService" && s.symbol_type === "class")).toBe(true);
  });

  it("extracts interfaces", () => {
    const files = [{ path: "src/types.ts", content: "export interface UserRecord {\n  id: string;\n  name: string;\n}\n" }];
    const symbols = extractSymbols(files);
    expect(symbols.some((s) => s.symbol_name === "UserRecord" && s.symbol_type === "interface")).toBe(true);
  });

  it("extracts type aliases", () => {
    const files = [{ path: "src/types.ts", content: "export type UserId = string;\n" }];
    const symbols = extractSymbols(files);
    expect(symbols.some((s) => s.symbol_name === "UserId" && s.symbol_type === "type")).toBe(true);
  });

  it("extracts enums", () => {
    const files = [{ path: "src/enums.ts", content: "export enum Status {\n  Active = 'active',\n  Inactive = 'inactive',\n}\n" }];
    const symbols = extractSymbols(files);
    expect(symbols.some((s) => s.symbol_name === "Status" && s.symbol_type === "enum")).toBe(true);
  });

  it("extracts Python functions", () => {
    const files = [{ path: "app/routes.py", content: "def get_user(user_id: int):\n    return User.query.get(user_id)\n" }];
    const symbols = extractSymbols(files);
    expect(symbols.some((s) => s.symbol_name === "get_user" && s.symbol_type === "function")).toBe(true);
  });

  it("extracts Python async functions", () => {
    const files = [{ path: "app/handlers.py", content: "async def handle_event(event):\n    pass\n" }];
    const symbols = extractSymbols(files);
    expect(symbols.some((s) => s.symbol_name === "handle_event" && s.symbol_type === "function")).toBe(true);
  });

  it("extracts Python classes", () => {
    const files = [{ path: "app/models.py", content: "class UserModel(Base):\n    id = Column(Integer)\n" }];
    const symbols = extractSymbols(files);
    expect(symbols.some((s) => s.symbol_name === "UserModel" && s.symbol_type === "class")).toBe(true);
  });

  it("extracts Go functions", () => {
    const files = [{ path: "handlers/user.go", content: "func GetUser(id string) *User {\n  return nil\n}\n" }];
    const symbols = extractSymbols(files);
    expect(symbols.some((s) => s.symbol_name === "GetUser" && s.symbol_type === "function")).toBe(true);
  });

  it("extracts Go structs", () => {
    const files = [{ path: "models/user.go", content: "type UserRecord struct {\n  ID string\n  Name string\n}\n" }];
    const symbols = extractSymbols(files);
    expect(symbols.some((s) => s.symbol_name === "UserRecord" && s.symbol_type === "struct")).toBe(true);
  });

  it("extracts Go methods with receiver (populates parent)", () => {
    const files = [{ path: "service.go", content: "func (u *UserService) GetAll() []User {\n  return nil\n}\n" }];
    const symbols = extractSymbols(files);
    const m = symbols.find((s) => s.symbol_name === "GetAll" && s.symbol_type === "method");
    expect(m).toBeDefined();
    expect(m?.parent).toBe("u");
  });

  it("skips non-code files", () => {
    const files = [{ path: "README.md", content: "# function buildSomething\nclass Foo {}\n" }];
    const symbols = extractSymbols(files);
    expect(symbols.length).toBe(0);
  });

  it("skips comment lines", () => {
    const files = [{ path: "src/util.ts", content: "// function skippedComment()\n// class SkippedClass\n" }];
    const symbols = extractSymbols(files);
    expect(symbols.length).toBe(0);
  });

  it("records correct line numbers", () => {
    const files = [{ path: "src/index.ts", content: "\n\nfunction myFunc() {}\n" }];
    const symbols = extractSymbols(files);
    const fn = symbols.find((s) => s.symbol_name === "myFunc");
    expect(fn?.line_number).toBe(3);
  });

  it("returns empty array for empty files list", () => {
    expect(extractSymbols([])).toEqual([]);
  });
});

// ─── indexSymbols + searchSymbols ──────────────────────────────

describe("indexSymbols / searchSymbols", () => {
  const snapshotId = "test-snap";

  const files = [
    { path: "src/handlers.ts", content: "export function handleCreate() {}\nexport function handleDelete() {}\nexport class AuthService {}\n" },
    { path: "src/types.ts", content: "export interface UserPayload { id: string; }\nexport type UserId = string;\n" },
    { path: "app/models.py", content: "class UserModel:\n    pass\n\ndef get_by_id(id: int):\n    pass\n" },
  ];

  beforeEach(async () => {
    const result = await indexSymbols(snapshotId, files);
    expect(result.indexed_symbols).toBeGreaterThan(0);
  });

  it("returns all symbols with empty query", async () => {
    const results = await searchSymbols(snapshotId, {});
    expect(results.length).toBeGreaterThan(0);
  });

  it("filters by name prefix (case-insensitive)", async () => {
    const results = await searchSymbols(snapshotId, { name: "handle" });
    expect(results.every((r) => r.symbol_name.toLowerCase().startsWith("handle"))).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("filters by type", async () => {
    const results = await searchSymbols(snapshotId, { type: "class" });
    expect(results.every((r) => r.symbol_type === "class")).toBe(true);
  });

  it("filters by both name and type", async () => {
    const results = await searchSymbols(snapshotId, { name: "User", type: "interface" });
    expect(results.every((r) => r.symbol_type === "interface")).toBe(true);
    expect(results.every((r) => r.symbol_name.toLowerCase().startsWith("user"))).toBe(true);
  });

  it("respects limit", async () => {
    const results = await searchSymbols(snapshotId, { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("returns empty array for non-matching name", async () => {
    const results = await searchSymbols(snapshotId, { name: "zzz_no_match_zzz" });
    expect(results).toEqual([]);
  });

  it("returns correct fields in each result", async () => {
    const results = await searchSymbols(snapshotId, { name: "handle" });
    for (const r of results) {
      expect(typeof r.file_path).toBe("string");
      expect(typeof r.symbol_name).toBe("string");
      expect(typeof r.symbol_type).toBe("string");
      expect(typeof r.line_number).toBe("number");
    }
  });
});

// ─── getSymbolStats ──────────────────────────────────────────────

describe("getSymbolStats", () => {
  it("returns zero counts for unindexed snapshot", async () => {
    const stats = await getSymbolStats("nonexistent");
    expect(stats.symbol_count).toBe(0);
    expect(stats.file_count).toBe(0);
  });

  it("returns accurate counts after indexing", async () => {
    const files = [
      { path: "src/a.ts", content: "function foo() {}\nfunction bar() {}\n" },
      { path: "src/b.ts", content: "class Baz {}\n" },
    ];
    await indexSymbols("stat-snap", files);
    const stats = await getSymbolStats("stat-snap");
    expect(stats.symbol_count).toBe(3);
    expect(stats.file_count).toBe(2);
  });
});

// ─── clearSymbols ──────────────────────────────────────────────

describe("clearSymbols", () => {
  it("removes all symbols for a snapshot", async () => {
    const files = [{ path: "src/a.ts", content: "function foo() {}\n" }];
    await indexSymbols("clear-snap", files);
    expect((await getSymbolStats("clear-snap")).symbol_count).toBeGreaterThan(0);
    await clearSymbols("clear-snap");
    expect((await getSymbolStats("clear-snap")).symbol_count).toBe(0);
  });

  it("does not affect other snapshots", async () => {
    const files = [{ path: "src/a.ts", content: "function foo() {}\n" }];
    await indexSymbols("snap-keep", files);
    await indexSymbols("snap-clear", files);
    await clearSymbols("snap-clear");
    expect((await getSymbolStats("snap-keep")).symbol_count).toBeGreaterThan(0);
    expect((await getSymbolStats("snap-clear")).symbol_count).toBe(0);
  });
});
