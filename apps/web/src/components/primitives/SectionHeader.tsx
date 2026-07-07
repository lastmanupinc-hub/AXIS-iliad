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
}

export function SectionHeader({ title, sub, align = "start", actions }: SectionHeaderProps) {
  return (
    <div className={`section-header${align === "center" ? " section-header-center" : ""}`}>
      <div>
        <h2 className="section-header-title">{title}</h2>
        {sub && <p className="section-header-sub">{sub}</p>}
      </div>
      {align === "start" && actions && <div className="section-header-actions">{actions}</div>}
    </div>
  );
}
