import type { ReactNode } from "react";

// ─── SectionHeader (WO-F4) ──────────────────────────────────────────────────
// The "h2 + muted sub" opener repeated at the top of nearly every page,
// promoted to a component. `align="center"` covers the marketing/hero
// variant; `actions` docks buttons at the end of the row (start-aligned only).

export interface SectionHeaderProps {
  title: ReactNode;
  sub?: ReactNode;
  align?: "start" | "center";
  /** Right-docked controls (buttons, filters). Ignored for align="center". */
  actions?: ReactNode;
  /** H5.1b(e): most callers are a page's own genuine <h1> (the page's only
   *  top-level heading); some are a secondary in-page section and must stay
   *  <h2>. Defaults to "h2" so every pre-existing call site is unchanged
   *  unless a caller explicitly opts in. */
  level?: "h1" | "h2";
}

export function SectionHeader({ title, sub, align = "start", actions, level = "h2" }: SectionHeaderProps) {
  const Heading = level;
  return (
    <div className={`section-header${align === "center" ? " section-header-center" : ""}`}>
      <div>
        {/* The global h1/h2 element rule (index.css) differs in size/weight —
            pin both explicitly so promoting level="h1" changes the a11y tree
            only, never the page's existing visual appearance. */}
        <Heading className="section-header-title" style={{ fontSize: "1.25rem", fontWeight: 600 }}>{title}</Heading>
        {sub && <p className="section-header-sub">{sub}</p>}
      </div>
      {align === "start" && actions && <div className="section-header-actions">{actions}</div>}
    </div>
  );
}
