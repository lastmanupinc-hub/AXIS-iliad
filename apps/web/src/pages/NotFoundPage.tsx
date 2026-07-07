import { useMemo, useState } from "react";
import { Icon } from "../components/Icon.tsx";
import type { PageId } from "../routes.tsx";

// ─── 404 (WO-F2) ────────────────────────────────────────────────────────────
// Rendered for any hash that matches no route — the app never silently falls
// back to the landing page. Reports the bad hash, offers a page search over
// the route table, and quick links to Analyze / Docs / Help.

export interface NotFoundDestination {
  page: PageId;
  label: string;
  /** Static hash for display ("" = home). */
  hash: string;
}

interface Props {
  /** The unmatched hash, without the leading "#". */
  badHash: string;
  /** Searchable destinations, derived from the route table by the caller. */
  destinations: NotFoundDestination[];
  onNavigate: (page: PageId) => void;
}

const QUICK_LINKS: { page: PageId; label: string }[] = [
  { page: "analyze", label: "Analyze" },
  { page: "docs", label: "Docs" },
  { page: "help", label: "Help" },
];

export function NotFoundPage({ badHash, destinations, onNavigate }: Props) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return destinations
      .filter((d) => d.label.toLowerCase().includes(q) || d.page.includes(q) || d.hash.includes(q))
      .slice(0, 8);
  }, [query, destinations]);

  return (
    <div style={{ maxWidth: 620, margin: "48px auto", textAlign: "center" }}>
      <div
        className="mono"
        aria-hidden
        style={{ fontSize: "4rem", fontWeight: 700, letterSpacing: "0.06em", lineHeight: 1, color: "var(--accent)" }}
      >
        404
      </div>
      <h2 style={{ margin: "16px 0 8px" }}>This page doesn&apos;t exist</h2>
      <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>
        Nothing is mounted at{" "}
        <code
          className="mono"
          style={{
            padding: "2px 6px",
            borderRadius: "var(--radius)",
            background: "var(--bg-inset)",
            border: "1px solid var(--border)",
            color: "var(--red)",
            wordBreak: "break-all",
          }}
        >
          #{badHash || "(empty)"}
        </code>
        . Check the address for typos, or find your way below.
      </p>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const first = matches[0];
          if (first) onNavigate(first.page);
        }}
        style={{ position: "relative", marginBottom: 12 }}
      >
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", display: "inline-flex" }} aria-hidden>
          <Icon name="search" />
        </span>
        <input
          type="search"
          aria-label="Search pages"
          placeholder="Search pages — try “docs”, “plans”, “tools”…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 14px 10px 36px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
            color: "var(--text)",
            font: "inherit",
            fontSize: "0.9375rem",
          }}
        />
      </form>

      {query.trim() !== "" &&
        (matches.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24, textAlign: "left" }}>
            {matches.map((m) => (
              <button
                key={m.page}
                className="btn"
                aria-label={`Go to ${m.label}`}
                onClick={() => onNavigate(m.page)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}
              >
                <span>{m.label}</span>
                <span className="mono" style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                  {m.hash ? `#${m.hash}` : "/"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: 24 }}>
            No pages match &ldquo;{query}&rdquo;.
          </p>
        ))}

      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {QUICK_LINKS.map((link, i) => (
          <button
            key={link.page}
            className={i === 0 ? "btn btn-primary" : "btn"}
            onClick={() => onNavigate(link.page)}
          >
            {link.label}
          </button>
        ))}
      </div>
    </div>
  );
}
