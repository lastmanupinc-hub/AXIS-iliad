import { useState, useRef, useCallback } from "react";
import type { SearchResult } from "../api.ts";
import { searchQuery, indexSnapshot } from "../api.ts";

interface Props {
  snapshotId: string;
}

export function SearchTab({ snapshotId }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexed, setIndexed] = useState(false);
  const [stats, setStats] = useState<{ files: number; lines: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleIndex = useCallback(async () => {
    setIndexing(true);
    setError(null);
    try {
      const res = await indexSnapshot(snapshotId);
      setStats({ files: res.indexed_files, lines: res.indexed_lines });
      setIndexed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Indexing failed");
    } finally {
      setIndexing(false);
    }
  }, [snapshotId]);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await searchQuery(snapshotId, q);
      setResults(res.results);
      if (!stats) {
        setStats({ files: res.total_indexed_files, lines: res.total_indexed_lines });
      }
      if (res.total_indexed_files > 0) setIndexed(true);
    } catch (err) {
      if (!indexed) {
        setError("Search index not built yet. Click \"Index Files\" first.");
      } else {
        setError(err instanceof Error ? err.message : "Search failed");
      }
    } finally {
      setLoading(false);
    }
  }, [snapshotId, query, indexed, stats]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="card">
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Search Code</h3>
        <div className="flex" style={{ gap: 8 }}>
          {stats && (
            <span className="badge" style={{ fontSize: "0.75rem" }}>
              {stats.files} files · {stats.lines.toLocaleString()} lines indexed
            </span>
          )}
          <button
            className="btn"
            style={{ fontSize: "0.8125rem", padding: "4px 12px" }}
            disabled={indexing}
            onClick={handleIndex}
          >
            {indexing ? <><span className="spinner" /> Indexing...</> : indexed ? "Re-index" : "Index Files"}
          </button>
        </div>
      </div>

      <div className="flex" style={{ gap: 8, marginBottom: 16 }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search files by content (uses FTS5 full-text search)..."
          style={{
            flex: 1,
            padding: "8px 12px",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text)",
            fontSize: "0.875rem",
          }}
        />
        <button
          className="btn btn-primary"
          style={{ padding: "8px 16px", fontSize: "0.875rem" }}
          disabled={loading || !query.trim()}
          onClick={handleSearch}
        >
          {loading ? <><span className="spinner" /> Searching...</> : "Search"}
        </button>
      </div>

      {error && (
        <div style={{ color: "var(--red)", marginBottom: 12, fontSize: "0.875rem" }}>
          {error}
        </div>
      )}

      {searched && !loading && results.length === 0 && !error && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          No results found for &ldquo;{query}&rdquo;
        </p>
      )}

      {results.length > 0 && (
        <div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: 8 }}>
            {results.length} result{results.length !== 1 ? "s" : ""}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {results.map((r, i) => (
              <div
                key={`${r.file_path}:${r.line_number}:${i}`}
                style={{
                  padding: "6px 10px",
                  background: i % 2 === 0 ? "var(--bg)" : "transparent",
                  borderRadius: 4,
                  fontSize: "0.8125rem",
                  fontFamily: "monospace",
                  display: "flex",
                  gap: 12,
                  alignItems: "baseline",
                }}
              >
                <span style={{ color: "var(--accent)", whiteSpace: "nowrap", minWidth: 200 }}>
                  {r.file_path}
                </span>
                <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap", minWidth: 40, textAlign: "right" }}>
                  :{r.line_number}
                </span>
                <span style={{ color: "var(--text)", whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.content}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
