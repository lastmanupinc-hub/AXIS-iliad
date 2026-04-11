import { useState, useRef, useCallback } from "react";
import type { SearchResult, SymbolResult } from "../api.ts";
import { searchQuery, indexSnapshot, searchSymbols } from "../api.ts";

interface Props {
  snapshotId: string;
}

type SearchMode = "text" | "symbols";

const SYMBOL_TYPES = ["", "function", "class", "interface", "type", "enum", "method", "struct", "const"];

export function SearchTab({ snapshotId }: Props) {
  const [mode, setMode] = useState<SearchMode>("text");
  const [query, setQuery] = useState("");
  const [symbolType, setSymbolType] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [symbolResults, setSymbolResults] = useState<SymbolResult[]>([]);
  const [symbolCount, setSymbolCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexed, setIndexed] = useState(false);
  const [stats, setStats] = useState<{ files: number; lines: number; symbols: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleIndex = useCallback(async () => {
    setIndexing(true);
    setError(null);
    try {
      const res = await indexSnapshot(snapshotId);
      setStats({ files: res.indexed_files, lines: res.indexed_lines, symbols: res.indexed_symbols });
      setIndexed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Indexing failed");
    } finally {
      setIndexing(false);
    }
  }, [snapshotId]);

  const handleTextSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await searchQuery(snapshotId, q);
      setResults(res.results);
      if (!stats) {
        setStats({ files: res.total_indexed_files, lines: res.total_indexed_lines, symbols: 0 });
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

  const handleSymbolSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await searchSymbols(snapshotId, {
        name: query.trim() || undefined,
        type: symbolType || undefined,
        limit: 100,
      });
      setSymbolResults(res.results);
      setSymbolCount(res.symbol_count);
      if (res.symbol_count > 0) setIndexed(true);
    } catch (err) {
      if (!indexed) {
        setError("Symbol index not built yet. Click \"Index Files\" first.");
      } else {
        setError(err instanceof Error ? err.message : "Symbol search failed");
      }
    } finally {
      setLoading(false);
    }
  }, [snapshotId, query, symbolType, indexed]);

  const handleSearch = mode === "text" ? handleTextSearch : handleSymbolSearch;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const typeColors: Record<string, string> = {
    function: "#61afef",
    class: "#e5c07b",
    interface: "#56b6c2",
    type: "#c678dd",
    enum: "#e06c75",
    method: "#98c379",
    struct: "#e5c07b",
    const: "#abb2bf",
  };

  return (
    <div className="card">
      {/* Header row */}
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <div className="flex" style={{ gap: 6 }}>
          <h3 style={{ margin: 0 }}>Search Code</h3>
          <div className="flex" style={{ gap: 4, marginLeft: 8 }}>
            <button
              className={`btn${mode === "text" ? " btn-primary" : ""}`}
              style={{ padding: "3px 10px", fontSize: "0.8rem" }}
              onClick={() => { setMode("text"); setSearched(false); setError(null); }}
            >
              Text
            </button>
            <button
              className={`btn${mode === "symbols" ? " btn-primary" : ""}`}
              style={{ padding: "3px 10px", fontSize: "0.8rem" }}
              onClick={() => { setMode("symbols"); setSearched(false); setError(null); }}
            >
              Symbols
            </button>
          </div>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          {stats && (
            <span className="badge" style={{ fontSize: "0.75rem" }}>
              {stats.files} files Â· {stats.lines.toLocaleString()} lines
              {stats.symbols > 0 ? ` Â· ${stats.symbols.toLocaleString()} symbols` : ""}
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

      {/* Search input row */}
      <div className="flex" style={{ gap: 8, marginBottom: 16 }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === "text"
              ? "Search files by content (FTS5 full-text search)..."
              : "Symbol name prefix (e.g. handle, Userâ€¦)"
          }
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
        {mode === "symbols" && (
          <select
            value={symbolType}
            onChange={(e) => setSymbolType(e.target.value)}
            style={{
              padding: "8px 10px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
              fontSize: "0.875rem",
            }}
          >
            {SYMBOL_TYPES.map((t) => (
              <option key={t} value={t}>{t || "all types"}</option>
            ))}
          </select>
        )}
        <button
          className="btn btn-primary"
          style={{ padding: "8px 16px", fontSize: "0.875rem" }}
          disabled={loading || (mode === "text" && !query.trim())}
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

      {/* Text search results */}
      {mode === "text" && searched && !loading && results.length === 0 && !error && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          No results found for &ldquo;{query}&rdquo;
        </p>
      )}

      {mode === "text" && results.length > 0 && (
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

      {/* Symbol search results */}
      {mode === "symbols" && searched && !loading && symbolResults.length === 0 && !error && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          {symbolCount === 0
            ? "No symbols indexed yet. Click \"Index Files\" first."
            : `No symbols found${query ? ` matching "${query}"` : " for selected type"}.`}
        </p>
      )}

      {mode === "symbols" && symbolResults.length > 0 && (
        <div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: 8 }}>
            {symbolResults.length} symbol{symbolResults.length !== 1 ? "s" : ""}
            {symbolCount != null && symbolCount > symbolResults.length
              ? ` (of ${symbolCount.toLocaleString()} total)`
              : ""}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {symbolResults.map((s, i) => (
              <div
                key={`${s.file_path}:${s.symbol_name}:${i}`}
                style={{
                  padding: "5px 10px",
                  background: i % 2 === 0 ? "var(--bg)" : "transparent",
                  borderRadius: 4,
                  fontSize: "0.8125rem",
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "1px 6px",
                    borderRadius: 3,
                    background: typeColors[s.symbol_type] ?? "var(--border)",
                    color: "#1a1a2e",
                    fontWeight: 600,
                    minWidth: 64,
                    textAlign: "center",
                  }}
                >
                  {s.symbol_type}
                </span>
                <span style={{ color: "var(--text)", fontFamily: "monospace", fontWeight: 600 }}>
                  {s.parent ? `${s.parent}.` : ""}{s.symbol_name}
                </span>
                <span style={{ color: "var(--text-muted)", marginLeft: "auto", whiteSpace: "nowrap", fontSize: "0.75rem" }}>
                  {s.file_path}:{s.line_number}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

