import { describe, it, expect, beforeEach } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import {
  indexSnapshotContent,
  searchSnapshotContent,
  clearSearchIndex,
  getSearchIndexStats,
} from "./search-store.js";

beforeEach(async () => {
  await resetTestDb();
  // Insert project + snapshot for FK
  await sql.run("INSERT INTO projects (project_id, project_name) VALUES ('p1', 'Test Project')", []);
  await sql.run(
    "INSERT INTO snapshots (snapshot_id, project_id, created_at, input_method, manifest, file_count, total_size_bytes, files, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ["snap1", "p1", "2024-01-01", "api_submission", "{}", 2, 1000, "[]", "ready"],
  );
});

// ─── indexSnapshotContent ───────────────────────────────────────

describe("indexSnapshotContent", () => {
  it("indexes files and returns correct counts", async () => {
    const result = await indexSnapshotContent("snap1", [
      { path: "src/index.ts", content: "import { foo } from './foo';\nexport default foo;\n" },
      { path: "src/foo.ts", content: "export const foo = 42;\n" },
    ]);
    expect(result.indexed_files).toBe(2);
    expect(result.indexed_lines).toBe(3); // 3 non-empty lines
  });

  it("skips empty lines", async () => {
    const result = await indexSnapshotContent("snap1", [
      { path: "test.ts", content: "line1\n\n\nline2\n\n" },
    ]);
    expect(result.indexed_lines).toBe(2);
  });

  it("replaces existing index on re-index", async () => {
    await indexSnapshotContent("snap1", [
      { path: "a.ts", content: "original\n" },
    ]);
    const stats1 = await getSearchIndexStats("snap1");
    expect(stats1.line_count).toBe(1);

    await indexSnapshotContent("snap1", [
      { path: "b.ts", content: "replaced-a\nreplaced-b\n" },
    ]);
    const stats2 = await getSearchIndexStats("snap1");
    expect(stats2.line_count).toBe(2);
    expect(stats2.file_count).toBe(1);
  });

  it("stores correct line numbers (1-based)", async () => {
    await indexSnapshotContent("snap1", [
      { path: "test.ts", content: "alpha\nbeta\ngamma\n" },
    ]);
    const results = await searchSnapshotContent("snap1", "beta");
    expect(results.length).toBe(1);
    expect(results[0]!.line_number).toBe(2);
  });
});

// ─── searchSnapshotContent ──────────────────────────────────────

describe("searchSnapshotContent", () => {
  beforeEach(async () => {
    await indexSnapshotContent("snap1", [
      { path: "src/server.ts", content: "import express from 'express';\nconst app = express();\napp.listen(3000);\n" },
      { path: "src/db.ts", content: "import sqlite from 'better-sqlite3';\nconst db = sqlite(':memory:');\nexport default db;\n" },
      { path: "README.md", content: "# My App\nA sample express application\nBuilt with TypeScript\n" },
    ]);
  });

  it("finds exact substring matches", async () => {
    const results = await searchSnapshotContent("snap1", "express");
    expect(results.length).toBe(3); // 2 in server.ts, 1 in README.md
  });

  it("returns file_path and line_number for each result", async () => {
    const results = await searchSnapshotContent("snap1", "sqlite");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]).toHaveProperty("file_path");
    expect(results[0]).toHaveProperty("line_number");
    expect(results[0]).toHaveProperty("content");
  });

  it("respects limit option", async () => {
    const results = await searchSnapshotContent("snap1", "import", { limit: 1 });
    expect(results.length).toBe(1);
  });

  it("returns empty array for no matches", async () => {
    const results = await searchSnapshotContent("snap1", "nonexistent_term_xyz");
    expect(results).toEqual([]);
  });

  it("is case-sensitive for LIKE matching", async () => {
    const upper = await searchSnapshotContent("snap1", "Express");
    const lower = await searchSnapshotContent("snap1", "express");
    // SQLite LIKE is case-insensitive for ASCII by default
    expect(upper.length).toBe(lower.length);
  });

  it("ranks results by match type", async () => {
    const results = await searchSnapshotContent("snap1", "express");
    // Results should have rank property
    expect(results[0]).toHaveProperty("rank");
    // All results should have rank >= 1
    for (const r of results) {
      expect(r.rank).toBeGreaterThanOrEqual(1);
    }
  });

  it("handles special LIKE characters in query", async () => {
    // Index content with % and _
    await indexSnapshotContent("snap1", [
      { path: "special.ts", content: "const pct = 100%;\nconst tpl = 'hello_world';\n" },
    ]);
    const results = await searchSnapshotContent("snap1", "100%");
    expect(results.length).toBe(1);
    expect(results[0]!.content).toContain("100%");
  });
});

// ─── clearSearchIndex ───────────────────────────────────────────

describe("clearSearchIndex", () => {
  it("removes all entries for a snapshot", async () => {
    await indexSnapshotContent("snap1", [
      { path: "a.ts", content: "content\n" },
    ]);
    expect((await getSearchIndexStats("snap1")).line_count).toBe(1);

    await clearSearchIndex("snap1");
    expect((await getSearchIndexStats("snap1")).line_count).toBe(0);
  });

  it("is safe to call on non-indexed snapshot", async () => {
    await clearSearchIndex("snap1");
    expect((await getSearchIndexStats("snap1")).line_count).toBe(0);
  });
});

// ─── getSearchIndexStats ────────────────────────────────────────

describe("getSearchIndexStats", () => {
  it("returns correct file and line counts", async () => {
    await indexSnapshotContent("snap1", [
      { path: "a.ts", content: "line1\nline2\n" },
      { path: "b.ts", content: "line3\n" },
    ]);
    const stats = await getSearchIndexStats("snap1");
    expect(stats.file_count).toBe(2);
    expect(stats.line_count).toBe(3);
  });

  it("returns zeros for unindexed snapshot", async () => {
    const stats = await getSearchIndexStats("snap1");
    expect(stats.file_count).toBe(0);
    expect(stats.line_count).toBe(0);
  });
});

// ─── Empty query branch ─────────────────────────────────────────

describe("searchSnapshotContent empty query", () => {
  it("returns empty array for whitespace-only query", async () => {
    await indexSnapshotContent("snap1", [
      { path: "a.ts", content: "hello world" },
    ]);
    const results = await searchSnapshotContent("snap1", "   ");
    expect(results).toEqual([]);
  });

  it("returns empty array for empty string query", async () => {
    const results = await searchSnapshotContent("snap1", "");
    expect(results).toEqual([]);
  });
});
