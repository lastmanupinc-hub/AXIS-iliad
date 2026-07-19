import { useState, type FormEvent } from "react";
import { probeIntent, ApiError, type ProbeIntentResponse } from "../api.ts";
import { Callout, EmptyState } from "./primitives/index.ts";

// ─── ProbeIntentDemo ─────────────────────────────────────────────────────
// Extracted from McpPage.tsx (WO-P8) so WO-P15's Playground can reuse it
// verbatim instead of a second copy. POST /probe-intent is public, no auth,
// and triggers no repo analysis (pure keyword routing over the submitted
// text) — it carries none of the anonymous-cost-gate concerns that guard
// /v1/analyze.

export function ProbeIntentDemo() {
  const [intent, setIntent] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProbeIntentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = intent.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await probeIntent(trimmed));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the intent probe");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card mb-4">
      <h3 className="mb-2">Describe your need</h3>
      <p className="text-muted text-sm mb-3">
        Public, no signup — <code className="mono">POST /probe-intent</code> routes free text to the right tool.
      </p>
      <form onSubmit={(e) => { void handleSubmit(e); }}>
        <label htmlFor="probe-intent-input">What are you trying to do?</label>
        <textarea
          id="probe-intent-input"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder='e.g. "I need to prep my checkout flow for Visa compliance"'
          rows={3}
          maxLength={500}
          style={{ width: "100%" }}
        />
        <button type="submit" className="btn btn-primary mt-2" disabled={loading || !intent.trim()}>
          {loading ? "Routing…" : "Get a recommendation"}
        </button>
      </form>
      {error && <Callout tone="danger">{error}</Callout>}
      {result && (
        result.recommendations.length === 0 ? (
          <EmptyState
            title="No specific match"
            message="Try search_and_discover_tools for a broader look at what's available."
          />
        ) : (
          <div className="stack mt-3">
            {result.recommendations.map((r) => (
              <div
                key={r.tool}
                style={{
                  border: r.tool === result.call_next ? "1px solid var(--accent)" : "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "10px 12px",
                }}
              >
                <div className="flex-between mb-1" style={{ flexWrap: "wrap", gap: 6 }}>
                  <span className="mono" style={{ fontWeight: 600 }}>{r.tool}</span>
                  <div className="flex gap-2">
                    <span className={`badge ${r.auth ? "badge-accent" : "badge-green"}`}>{r.auth ? "Requires API key" : "No auth"}</span>
                    {r.tool === result.call_next && <span className="badge badge-accent">Recommended</span>}
                  </div>
                </div>
                <p className="text-muted text-sm" style={{ margin: 0 }}>{r.reason}</p>
                <p className="text-muted text-xs mt-1" style={{ margin: "4px 0 0" }}>{r.pricing}</p>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
