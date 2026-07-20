// ─── Web Research Tool — single-URL scrape via Firecrawl proxy ──
//
// First concrete instantiation of the ToolPage pattern. A click user
// types in a URL, hits "Scrape," and gets the page's main content as
// markdown they can read inline, copy, or download.
//
// Backend: POST /v1/research/scrape (Firecrawl proxy). Auth required.
// Pricing: $0.10/page standard, $0.05/page lite (iliad_web_research in
// packages/mpp/src/index.ts's PRICING_TIERS), or $0 on a 24h cache hit —
// there is no separate free-page pool for this endpoint (that only exists
// on the multi-page crawl tool, iliad_web_research_crawl, wired to a
// different backend handler). H-Phase-A cycle 15: this comment (and every
// user-facing string derived from it below) previously claimed "$0.01/page
// after 100 free pages/month" -- both numbers were wrong.

import { useState, useCallback, type FormEvent } from "react";
import { ToolPage } from "../../components/ToolPage.tsx";
import { scrapeUrl, ApiError, type ScrapeResult } from "../../api.ts";

interface Props {
  onBack?: () => void;
}

function downloadAsFile(filename: string, content: string, mimeType = "text/markdown") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function WebResearchPage({ onBack }: Props) {
  const [url, setUrl] = useState("");
  const [onlyMainContent, setOnlyMainContent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const isLoggedIn = !!localStorage.getItem("axis_api_key");

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setResult(null);

      const trimmed = url.trim();
      if (!trimmed) {
        setError("Enter a URL to scrape.");
        return;
      }
      if (!isHttpUrl(trimmed)) {
        setError("URL must start with http:// or https://");
        return;
      }
      if (!isLoggedIn) {
        setError("Sign in to scrape URLs — $0.10/page, or $0 on a 24h cache hit.");
        return;
      }

      setLoading(true);
      try {
        const res = await scrapeUrl(trimmed, { only_main_content: onlyMainContent });
        if (!res.success) {
          setError(res.error ?? "Scrape failed.");
        } else {
          setResult(res);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            setError("Your session expired — sign in again.");
          } else if (err.status === 402) {
            setError("Payment required — $0.10 per page scraped.");
          } else {
            setError(err.message);
          }
        } else {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        setLoading(false);
      }
    },
    [url, onlyMainContent, isLoggedIn],
  );

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint("Copied to clipboard.");
      setTimeout(() => setCopyHint(null), 2000);
    } catch {
      setCopyHint("Copy failed — your browser blocked clipboard access.");
      setTimeout(() => setCopyHint(null), 3000);
    }
  }, []);

  const markdown = result?.data?.markdown ?? "";
  const metadata = result?.data?.metadata ?? {};
  const title = typeof metadata.title === "string" ? metadata.title : null;
  const description = typeof metadata.description === "string" ? metadata.description : null;

  return (
    <ToolPage
      id="web-research"
      name="Web Research"
      description="Scrape a single URL and get clean markdown back. Powered by Firecrawl, cached for 24h across the network so popular URLs come back instantly at no cost."
      pricing={{
        perUnitUsd: "0.10",
        perUnitLabel: "page",
        note: "$0.05/page in lite mode. Cached pages (24h, shared network-wide) are $0.",
      }}
      mcpToolName="iliad_web_research"
      restEndpoint="POST /v1/research/scrape"
      onBack={onBack}
      loading={loading}
      error={error}
      result={
        result?.success && result.data ? (
          <div role="status" aria-live="polite">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>Result</h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {result.cache?.hit && (
                  <span className="badge" style={{ background: "var(--green, #22c55e)", color: "white", fontSize: "0.7rem" }}>
                    Cache hit · {result.cache.age_seconds != null ? `${Math.floor(result.cache.age_seconds / 60)}m old` : "fresh"}
                  </span>
                )}
                <button className="btn" onClick={() => { void handleCopy(markdown); }} style={{ padding: "4px 12px", fontSize: "0.85rem" }}>
                  Copy markdown
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    const safeName = (title ?? new URL(result.data!.url).hostname).replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "scrape";
                    downloadAsFile(`${safeName}.md`, markdown);
                  }}
                  style={{ padding: "4px 12px", fontSize: "0.85rem" }}
                >
                  Download .md
                </button>
              </div>
            </div>
            {copyHint && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: "0 0 8px 0" }}>{copyHint}</p>
            )}
            {(title || description) && (
              <div style={{ marginBottom: 12, padding: "8px 12px", background: "var(--bg-elev, rgba(0,0,0,0.03))", borderRadius: 4, fontSize: "0.85rem" }}>
                {title && <div><strong>Title:</strong> {title}</div>}
                {description && <div style={{ marginTop: 4 }}><strong>Description:</strong> {description}</div>}
              </div>
            )}
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: "0.85rem",
                lineHeight: 1.5,
                maxHeight: 600,
                overflowY: "auto",
                background: "var(--bg-elev, rgba(0,0,0,0.03))",
                padding: 12,
                borderRadius: 4,
                margin: 0,
              }}
            >
              {markdown || "(empty markdown — page may be JS-rendered or rate-limited)"}
            </pre>
          </div>
        ) : null
      }
    >
      <form onSubmit={(e) => { void handleSubmit(e); }}>
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="web-research-url">URL</label>
          <input
            id="web-research-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/page"
            autoComplete="off"
            spellCheck={false}
            required
          />
          <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 4 }}>
            Any public URL. Authenticated or paywalled pages won't work — Firecrawl scrapes only what the public web sees.
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.9rem" }}>
            <input
              type="checkbox"
              checked={onlyMainContent}
              onChange={(e) => setOnlyMainContent(e.target.checked)}
            />
            Only the main article content (skip nav, footer, sidebars)
          </label>
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading || !url.trim()}>
          {loading ? "Scraping..." : "Scrape"}
        </button>

        {!isLoggedIn && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 12 }}>
            <strong>You'll need to sign in first.</strong> $0.10/page standard, $0.05/page lite — or $0 if
            another AXIS agent scraped this exact URL in the last 24 hours.
          </p>
        )}
      </form>
    </ToolPage>
  );
}
