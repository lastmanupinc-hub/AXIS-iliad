import type { ReactNode } from "react";

// ─── StatTile (WO-F4) ───────────────────────────────────────────────────────
// The centered value + muted label pattern hand-rolled across DocsPage /
// HelpPage / ExamplesPage, promoted to a component. Dataviz stat-tile
// contract: sentence-case label without a trailing colon, semibold value in
// the default proportional figures (never tabular at display size), optional
// signed delta colored by whether the direction is good, optional trend slot
// (a Sparkline).

export interface StatDelta {
  /** Preformatted signed text, e.g. "+12% vs last week". */
  text: string;
  sentiment?: "good" | "bad" | "neutral";
}

export interface StatTileProps {
  /** Sentence case, no trailing colon. */
  label: string;
  /** Preformatted value ("1.3K", "$4.2M") or a number (locale-formatted). */
  value: string | number;
  delta?: StatDelta;
  /** Trend slot — typically <Sparkline …/>. */
  trend?: ReactNode;
  /** Small muted footnote under the value. */
  hint?: string;
}

const DELTA_GLYPH: Record<NonNullable<StatDelta["sentiment"]>, string> = {
  good: "▲",
  bad: "▼",
  neutral: "—",
};

export function StatTile({ label, value, delta, trend, hint }: StatTileProps) {
  const sentiment = delta?.sentiment ?? "neutral";
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-tile-value">{typeof value === "number" ? value.toLocaleString() : value}</div>
      {delta && (
        <div className={`stat-delta stat-delta-${sentiment}`}>
          <span aria-hidden>{DELTA_GLYPH[sentiment]}</span> {delta.text}
        </div>
      )}
      {hint && <div className="text-muted text-xs">{hint}</div>}
      {trend && <div className="stat-tile-trend">{trend}</div>}
    </div>
  );
}
