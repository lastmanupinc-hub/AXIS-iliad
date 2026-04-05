import { getDb } from "./db.js";

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

/**
 * Index file contents for a snapshot. Splits content by lines and stores each
 * line as a searchable entry. Clears any existing index for the snapshot first.
 * Populates both the search_index table and the search_fts FTS5 index.
 */
export function indexSnapshotContent(
  snapshotId: string,
  files: Array<{ path: string; content: string }>,
): { indexed_files: number; indexed_lines: number } {
  const db = getDb();
  let totalLines = 0;

  const deleteExistingFts = db.prepare(
    "DELETE FROM search_fts WHERE rowid IN (SELECT id FROM search_index WHERE snapshot_id = ?)",
  );
  const deleteExisting = db.prepare("DELETE FROM search_index WHERE snapshot_id = ?");
  const insertLine = db.prepare(
    "INSERT INTO search_index (snapshot_id, file_path, line_number, content) VALUES (?, ?, ?, ?)",
  );
  const insertFts = db.prepare(
    "INSERT INTO search_fts (rowid, content) VALUES (?, ?)",
  );

  const tx = db.transaction(() => {
    deleteExistingFts.run(snapshotId);
    deleteExisting.run(snapshotId);
    for (const file of files) {
      const lines = file.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.trim().length === 0) continue; // skip empty lines
        const info = insertLine.run(snapshotId, file.path, i + 1, line);
        insertFts.run(info.lastInsertRowid, line);
        totalLines++;
      }
    }
  });
  tx();

  return { indexed_files: files.length, indexed_lines: totalLines };
}

/**
 * Search indexed content for a snapshot using FTS5 full-text search.
 * Returns matching lines ranked by BM25 relevance.
 * Falls back to LIKE matching if the query contains only FTS5 special characters.
 */
export function searchSnapshotContent(
  snapshotId: string,
  query: string,
  opts?: { limit?: number },
): SearchResult[] {
  const db = getDb();
  const limit = opts?.limit ?? 50;

  // Build FTS5 query: wrap each token in double-quotes to treat as literal
  // This handles special characters safely (%, _, etc.)
  const ftsQuery = query
    .replace(/"/g, '""')  // escape double quotes
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => `"${tok}"`)
    .join(" ");

  if (!ftsQuery) return [];

  const results = db
    .prepare(
      `SELECT si.file_path, si.line_number, si.content,
              CAST(-bm25(search_fts) * 1000 AS INTEGER) as rank
       FROM search_fts
       JOIN search_index si ON si.id = search_fts.rowid
       WHERE search_fts MATCH ?
         AND si.snapshot_id = ?
       ORDER BY rank DESC, si.file_path ASC, si.line_number ASC
       LIMIT ?`,
    )
    .all(ftsQuery, snapshotId, limit) as SearchResult[];

  return results;
}

/** Remove search index entries for a snapshot. */
export function clearSearchIndex(snapshotId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM search_fts WHERE rowid IN (SELECT id FROM search_index WHERE snapshot_id = ?)").run(snapshotId);
  db.prepare("DELETE FROM search_index WHERE snapshot_id = ?").run(snapshotId);
}

/** Get search index stats for a snapshot. */
export function getSearchIndexStats(snapshotId: string): { file_count: number; line_count: number } {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT COUNT(DISTINCT file_path) as file_count, COUNT(*) as line_count FROM search_index WHERE snapshot_id = ?",
    )
    .get(snapshotId) as { file_count: number; line_count: number };
  return row;
}
