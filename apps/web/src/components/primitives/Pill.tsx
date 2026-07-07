import type { ReactNode } from "react";

// ─── Pill (WO-F4) ───────────────────────────────────────────────────────────
// Generalizes the three page-scoped clones (.upload-hero-pill,
// .program-output-pill, .program-keyword) into one primitive:
//   muted   — filled, quiet (output lists)
//   accent  — filled, accent ink (hero keywords)
//   outline — transparent with a hairline (tag clouds)

export type PillTone = "muted" | "accent" | "outline";

export interface PillProps {
  children: ReactNode;
  tone?: PillTone;
  /** Instrument-label style (monospace). */
  mono?: boolean;
}

export function Pill({ children, tone = "muted", mono = false }: PillProps) {
  const toneClass = tone === "muted" ? "" : ` pill-${tone}`;
  return <span className={`pill${toneClass}${mono ? " mono" : ""}`}>{children}</span>;
}
