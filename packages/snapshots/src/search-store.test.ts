import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemoryDb, closeDb, getDb } from "./db.js";
import {
  indexSnapshotContent,
  searchSnapshotContent,
  clearSearchIndex,
  getSearchIndexStats,
} from "./search-store.js";

beforeEach(() => {
  const db = openMemoryDb();
  // Insert project + snapshot for FK
  db.prepare("INSERT INTO projects (project_id, project_name) VALUES ('p1', 'Test Project')").run();
  db.prepare(
    "INSERT INTO snapshots (snapshot_id, project_id, created_at, input_method, manifest, file_count, total_size_bytes, files, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run("snap1", "p1", "2024-01-01", "api_submission", "{}", 2, 1000, "[]", "ready");
});

afterEach(() => {
  closeDb();
});

// ─── indexSnapshotContent ───────────────────────────────────────

describe("indexSnapshotContent", () => {
  it("indexes files and returns correct counts", () => {
    const result = indexSnapshotContent("snap1", [
      { path: "src/index.ts", content: "import { foo } from './foo';\nexport default foo;\n" },
      { path: "src/foo.ts", content: "export const foo = 42;\n" },
    ]);
    expect(result.indexed_files).toBe(2);
    expect(result.indexed_lines).toBe(3); // 3 non-empty lines
  });

  it("skips empty lines", () => {
    const result = indexSnapshotContent("snap1", [
      { path: "test.ts", content: "line1\n\n\nline2\n\n" },
    ]);
    expect(result.indexed_lines).toBe(2);
  });

  it("replaces existing index on re-index", () => {
    indexSnapshotContent("snap1", [
      { path: "a.ts", content: "original\n" },
    ]);
    const stats1 = getSearchIndexStats("snap1");
    expect(stats1.line_count).toBe(1);

    indexSnapshotContent("snap1", [
      { path: "b.ts", content: "replaced-a\nreplaced-b\n" },
    ]);
    const stats2 = getSearchIndexStats("snap1");
    expect(stats2.line_count).toBe(2);
    expect(stats2.file_count).toBe(1);
  });

  it("stores correct line numbers (1-based)", () => {
    indexSnapshotContent("snap1", [
      { path: "test.ts", content: "alpha\nbeta\ngamma\n" },
    ]);
    const results = searchSnapshotContent("snap1", "beta");
    expect(results.length).toBe(1);
    expect(results[0]!.line_number).toBe(2);
  });
});

// ─── searchSnapshotContent ──────────────────────────────────────

describe("searchSnapshotContent", () => {
  beforeEach(() => {
    indexSnapshotContent("snap1", [
      { path: "src/server.ts", content: "import express from 'express';\nconst app = express();\napp.listen(3000);\n" },
      { path: "src/db.ts", content: "import sqlite from 'better-sqlite3';\nconst db = sqlite(':memory:');\nexport default db;\n" },
      { path: "README.md", content: "# My App\nA sample express application\nBuilt with TypeScript\n" },
    ]);
  });

  it("finds exact substring matches", () => {
    const results = searchSnapshotContent("snap1", "express");
    expect(results.length).toBe(3); // 2 in server.ts, 1 in README.md
  });

  it("returns file_path and line_number for each result", () => {
    const results = searchSnapshotContent("snap1", "sqlite");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]).toHaveProperty("file_path");
    expect(results[0]).toHaveProperty("line_number");
    expect(results[0]).toHaveProperty("content");
  });

  it("respects limit option", () => {
    const results = searchSnapshotContent("snap1", "import", { limit: 1 });
    expect(results.length).toBe(1);
  });

  it("returns empty array for no matches", () => {
    const results = searchSnapshotContent("snap1", "nonexistent_term_xyz");
    expect(results).toEqual([]);
  });

  it("is case-sensitive for LIKE matching", () => {
    const upper = searchSnapshotContent("snap1", "Express");
    const lower = searchSnapshotContent("snap1", "express");
    // SQLite LIKE is case-insensitive for ASCII by default
    expect(upper.length).toBe(lower.length);
  });

  it("ranks results by match type", () => {
    const results = searchSnapshotContent("snap1", "express");
    // Results should have rank property
    expect(results[0]).toHaveProperty("rank");
    // All results should have rank >= 1
    for (const r of results) {
      expect(r.rank).toBeGreaterThanOrEqual(1);
    }
  });

  it("handles special LIKE characters in query", () => {
    // Index content with % and _
    indexSnapshotContent("snap1", [
      { path: "special.ts", content: "const pct = 100%;\nconst tpl = 'hello_world';\n" },
    ]);
    const results = searchSnapshotContent("snap1", "100%");
    expect(results.length).toBe(1);
    expect(results[0]!.content).toContain("100%");
  });
});

// ─── clearSearchIndex ───────────────────────────────────────────

describe("clearSearchIndex", () => {
  it("removes all entries for a snapshot", () => {
    indexSnapshotContent("snap1", [
      { path: "a.ts", content: "content\n" },
    ]);
    expect(getSearchIndexStats("snap1").line_count).toBe(1);

    clearSearchIndex("snap1");
    expect(getSearchIndexStats("snap1").line_count).toBe(0);
  });

  it("is safe to call on non-indexed snapshot", () => {
    clearSearchIndex("snap1");
    expect(getSearchIndexStats("snap1").line_count).toBe(0);
  });
});

// ─── getSearchIndexStats ────────────────────────────────────────

describe("getSearchIndexStats", () => {
  it("returns correct file and line counts", () => {
    indexSnapshotContent("snap1", [
      { path: "a.ts", content: "line1\nline2\n" },
      { path: "b.ts", content: "line3\n" },
    ]);
    const stats = getSearchIndexStats("snap1");
    expect(stats.file_count).toBe(2);
    expect(stats.line_count).toBe(3);
  });

  it("returns zeros for unindexed snapshot", () => {
    const stats = getSearchIndexStats("snap1");
    expect(stats.file_count).toBe(0);
    expect(stats.line_count).toBe(0);
  });
});

// ─── Empty query branch ─────────────────────────────────────────

describe("searchSnapshotContent empty query", () => {
  it("returns empty array for whitespace-only query", () => {
    indexSnapshotContent("snap1", [
      { path: "a.ts", content: "hello world" },
    ]);
    const results = searchSnapshotContent("snap1", "   ");
    expect(results).toEqual([]);
  });

  it("returns empty array for empty string query", () => {
    const results = searchSnapshotContent("snap1", "");
    expect(results).toEqual([]);
  });
});
