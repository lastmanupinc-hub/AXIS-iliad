import { sql } from "./pg.js";

// ─── Search index store ─────────────────────────────────────────

export interface SearchIndexEntry {
  file_path: string;
  line_number: number;
  content: string;
}

export interface SearchResult {
  file_path: string;
  line_number: number;
  content: string;
  rank: number;
}

/** Rows are inserted in batches to keep the round-trip count bounded. */
const INSERT_CHUNK = 500;

/**
 * Index file contents for a snapshot. Splits content by lines and stores each
 * non-blank line as a searchable entry, clearing any existing index for the
 * snapshot first. The `content_tsv` tsvector column is GENERATED, so writing
 * `content` is enough — Postgres maintains the full-text index automatically.
 */
export async function indexSnapshotContent(
  snapshotId: string,
  files: Array<{ path: string; content: string }>,
): Promise<{ indexed_files: number; indexed_lines: number }> {
  // Flatten to (file_path, line_number, content), skipping blank lines.
  const rows: Array<[string, number, string]> = [];
  for (const file of files) {
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.trim().length === 0) continue; // skip empty lines
      rows.push([file.path, i + 1, line]);
    }
  }

  await sql.tx(async (client) => {
    await client.query("DELETE FROM search_index WHERE snapshot_id = $1", [snapshotId]);
    for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
      const chunk = rows.slice(start, start + INSERT_CHUNK);
      const values: string[] = [];
      const params: unknown[] = [];
      chunk.forEach(([path, lineNo, content], idx) => {
        const b = idx * 4;
        values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`);
        params.push(snapshotId, path, lineNo, content);
      });
      await client.query(
        `INSERT INTO search_index (snapshot_id, file_path, line_number, content) VALUES ${values.join(", ")}`,
        params,
      );
    }
  });

  return { indexed_files: files.length, indexed_lines: rows.length };
}

/**
 * Search indexed content for a snapshot with Postgres full-text search.
 * `websearch_to_tsquery` safely parses arbitrary user input (quotes, operators,
 * stray punctuation never throw), and `ts_rank` orders by relevance. An
 * unmatchable / empty query yields an empty tsquery → no rows.
 */
export async function searchSnapshotContent(
  snapshotId: string,
  query: string,
  opts?: { limit?: number },
): Promise<SearchResult[]> {
  const limit = opts?.limit ?? 50;
  return sql.many<SearchResult>(
    `SELECT si.file_path, si.line_number, si.content,
            CAST(ts_rank(si.content_tsv, websearch_to_tsquery('english', ?)) * 1000 AS INTEGER) AS rank
       FROM search_index si
      WHERE si.snapshot_id = ?
        AND si.content_tsv @@ websearch_to_tsquery('english', ?)
      ORDER BY rank DESC, si.file_path ASC, si.line_number ASC
      LIMIT ?`,
    [query, snapshotId, query, limit],
  );
}

/** Remove search index entries for a snapshot (tsvector drops with the row). */
export async function clearSearchIndex(snapshotId: string): Promise<void> {
  await sql.run("DELETE FROM search_index WHERE snapshot_id = ?", [snapshotId]);
}

/** Get search index stats for a snapshot. */
export async function getSearchIndexStats(
  snapshotId: string,
): Promise<{ file_count: number; line_count: number }> {
  const row = await sql.one<{ file_count: string; line_count: string }>(
    "SELECT COUNT(DISTINCT file_path) as file_count, COUNT(*) as line_count FROM search_index WHERE snapshot_id = ?",
    [snapshotId],
  );
  return { file_count: Number(row?.file_count ?? 0), line_count: Number(row?.line_count ?? 0) };
}

// ─── Symbol extraction ──────────────────────────────────────────
//
// The pure extraction logic (no DB access) lives in symbols.ts so that
// pg-free consumers can import it without evaluating the Postgres layer.
// Re-exported here so the package's public surface is unchanged.

import { extractSymbols } from "./symbols.js";
import type { CodeSymbol, SymbolType } from "./symbols.js";

export { extractSymbols };
export type { CodeSymbol, SymbolType };

export interface SymbolSearchResult {
  file_path: string;
  symbol_name: string;
  symbol_type: SymbolType;
  line_number: number;
  parent: string | null;
}

/** Index code symbols for a snapshot. Clears existing symbols first. */
export async function indexSymbols(
  snapshotId: string,
  files: Array<{ path: string; content: string }>,
): Promise<{ indexed_symbols: number }> {
  const symbols = extractSymbols(files);

  await sql.tx(async (client) => {
    await client.query("DELETE FROM code_symbols WHERE snapshot_id = $1", [snapshotId]);
    for (let start = 0; start < symbols.length; start += INSERT_CHUNK) {
      const chunk = symbols.slice(start, start + INSERT_CHUNK);
      const values: string[] = [];
      const params: unknown[] = [];
      chunk.forEach((s, idx) => {
        const b = idx * 6;
        values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`);
        params.push(snapshotId, s.file_path, s.symbol_name, s.symbol_type, s.line_number, s.parent);
      });
      await client.query(
        `INSERT INTO code_symbols (snapshot_id, file_path, symbol_name, symbol_type, line_number, parent) VALUES ${values.join(", ")}`,
        params,
      );
    }
  });

  return { indexed_symbols: symbols.length };
}

/** Search code symbols for a snapshot by name (case-insensitive prefix or exact match). */
export async function searchSymbols(
  snapshotId: string,
  opts: {
    name?: string;
    type?: string;
    limit?: number;
  },
): Promise<SymbolSearchResult[]> {
  const limit = Math.min(opts.limit ?? 50, 200);

  // `text` (not `sql`, which is the imported query helper) accumulates the query.
  let text = "SELECT file_path, symbol_name, symbol_type, line_number, parent FROM code_symbols WHERE snapshot_id = ?";
  const params: (string | number)[] = [snapshotId];

  if (opts.name) {
    // ILIKE = case-insensitive LIKE in Postgres (replaces SQLite COLLATE NOCASE);
    // backslash is the default LIKE escape, matching the original escaping.
    text += " AND symbol_name ILIKE ?";
    params.push(`${opts.name.replace(/[%_\\]/g, "\\$&")}%`);
  }
  if (opts.type) {
    text += " AND symbol_type = ?";
    params.push(opts.type);
  }
  text += " ORDER BY lower(symbol_name) ASC, file_path ASC LIMIT ?";
  params.push(limit);

  return sql.many<SymbolSearchResult>(text, params);
}

/** Remove symbol index entries for a snapshot. */
export async function clearSymbols(snapshotId: string): Promise<void> {
  await sql.run("DELETE FROM code_symbols WHERE snapshot_id = ?", [snapshotId]);
}

/** Get symbol index stats for a snapshot. */
export async function getSymbolStats(
  snapshotId: string,
): Promise<{ symbol_count: number; file_count: number }> {
  const row = await sql.one<{ symbol_count: string; file_count: string }>(
    "SELECT COUNT(*) as symbol_count, COUNT(DISTINCT file_path) as file_count FROM code_symbols WHERE snapshot_id = ?",
    [snapshotId],
  );
  return { symbol_count: Number(row?.symbol_count ?? 0), file_count: Number(row?.file_count ?? 0) };
}
