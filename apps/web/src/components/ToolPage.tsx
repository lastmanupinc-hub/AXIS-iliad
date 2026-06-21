// ─── ToolPage — generic click-driven console shell ──────────────
//
// Every backend MCP tool / REST endpoint that a click user should be
// able to run is implemented as a page that wraps ToolPage and supplies
// its own form + result renderer. The shell handles the consistent
// visual + behavioral framing:
//
//   - Page header (name, tagline)
//   - Pricing badge (Free | per-call price | per-page price)
//   - Audience note ("This tool can also be called via MCP / CLI" link)
//   - Loading / error banner
//   - Result panel containment
//
// The tool component owns its form state, validation, and submission;
// ToolPage just gives it a visual home and consistent edges so the
// user doesn't have to relearn a layout per tool.

import type { ReactNode } from "react";

export interface ToolPricing {
  /** "free" badge displayed prominently. Use this for free-tier or no-auth tools. */
  free?: boolean;
  /** Per-call price in dollars (string for display, e.g. "0.50"). */
  perCallUsd?: string;
  /** Per-unit price for tools that bill per page / per item (e.g. "0.01"). */
  perUnitUsd?: string;
  /** Label for the per-unit price unit, e.g. "page", "scrape", "image". */
  perUnitLabel?: string;
  /** Optional note shown beneath the badge (e.g. "first 100 pages/month free"). */
  note?: string;
}

export interface ToolPageProps {
  /** Tool identifier — used for hash routing and analytics. */
  id: string;
  /** Display name shown in the header. */
  name: string;
  /** One-line description of what the tool does. */
  description: string;
  /** Pricing info — drives the badge in the header. */
  pricing: ToolPricing;
  /** Optional MCP tool name so coders/agents can see the equivalent CLI/MCP call. */
  mcpToolName?: string;
  /** Optional REST endpoint shown in the "for coders" footnote. */
  restEndpoint?: string;
  /** Optional onBack handler. If absent, no back affordance is shown. */
  onBack?: () => void;
  /** Loading state — when true, dims inputs and shows a spinner near the run area. */
  loading?: boolean;
  /** Error message to display in a banner above the form area. */
  error?: string | null;
  /** The tool's input form. Owns its own state and submit handler. */
  children: ReactNode;
  /** Optional result panel — rendered below the form when present. */
  result?: ReactNode;
}

function PricingBadge({ pricing }: { pricing: ToolPricing }) {
  if (pricing.free) {
    return (
      <span className="badge" style={{ background: "var(--green, #22c55e)", color: "white", fontWeight: 600 }}>
        Free
      </span>
    );
  }
  if (pricing.perCallUsd) {
    return (
      <span className="badge badge-accent" style={{ fontWeight: 600 }}>
        ${pricing.perCallUsd}/run
      </span>
    );
  }
  if (pricing.perUnitUsd) {
    return (
      <span className="badge badge-accent" style={{ fontWeight: 600 }}>
        ${pricing.perUnitUsd}/{pricing.perUnitLabel ?? "unit"}
      </span>
    );
  }
  return null;
}

export function ToolPage({
  id,
  name,
  description,
  pricing,
  mcpToolName,
  restEndpoint,
  onBack,
  loading = false,
  error = null,
  children,
  result,
}: ToolPageProps) {
  return (
    <div data-tool-id={id} style={{ maxWidth: 880, margin: "0 auto" }}>
      {/* Back affordance */}
      {onBack && (
        <button
          className="btn"
          onClick={onBack}
          style={{ marginBottom: 12, padding: "4px 12px", fontSize: "0.85rem" }}
        >
          ← All tools
        </button>
      )}

      {/* Header card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: "1.6rem" }}>{name}</h2>
          <PricingBadge pricing={pricing} />
        </div>
        <p style={{ color: "var(--text-muted)", margin: "0 0 8px 0", fontSize: "0.95rem", lineHeight: 1.5 }}>
          {description}
        </p>
        {pricing.note && (
          <p style={{ color: "var(--text-muted)", margin: 0, fontSize: "0.85rem", fontStyle: "italic" }}>
            {pricing.note}
          </p>
        )}
        {(mcpToolName || restEndpoint) && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: "0.8rem" }}>
              For developers — equivalent MCP / REST call
            </summary>
            <div style={{ marginTop: 8, fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {mcpToolName && (
                <div>
                  MCP tool: <code style={{ background: "var(--bg-elev, rgba(0,0,0,0.05))", padding: "2px 6px", borderRadius: 3 }}>{mcpToolName}</code>
                </div>
              )}
              {restEndpoint && (
                <div style={{ marginTop: 4 }}>
                  REST: <code style={{ background: "var(--bg-elev, rgba(0,0,0,0.05))", padding: "2px 6px", borderRadius: 3 }}>{restEndpoint}</code>
                </div>
              )}
            </div>
          </details>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            borderColor: "var(--red, #ef4444)",
            background: "rgba(239, 68, 68, 0.08)",
          }}
          role="alert"
        >
          <p style={{ color: "var(--red, #ef4444)", margin: 0, fontSize: "0.9rem" }}>
            {error}
          </p>
        </div>
      )}

      {/* Form area — provided by the tool */}
      <div
        className="card"
        style={{
          marginBottom: result ? 16 : 0,
          opacity: loading ? 0.6 : 1,
          pointerEvents: loading ? "none" : "auto",
          transition: "opacity 150ms ease",
        }}
      >
        {children}
        {loading && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: "0.875rem" }}>
            <span className="spinner" />
            Running…
          </div>
        )}
      </div>

      {/* Result panel — only rendered when the tool has output to show */}
      {result && (
        <div className="card">
          {result}
        </div>
      )}
    </div>
  );
}
