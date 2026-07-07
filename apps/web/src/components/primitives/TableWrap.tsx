import type { ReactNode } from "react";

// ─── TableWrap (WO-F4) ──────────────────────────────────────────────────────
// The `overflowX: auto` wrapper hand-rolled around 11 tables, promoted to a
// component. Focusable scroll region so keyboard users can pan wide tables
// (a scrollable region with no focusable child is otherwise keyboard-trapped).

export interface TableWrapProps {
  children: ReactNode;
  /** Accessible name for the scroll region (e.g. "Billing history"). */
  label?: string;
}

export function TableWrap({ children, label }: TableWrapProps) {
  return (
    <div className="table-wrap" role="region" aria-label={label ?? "Table"} tabIndex={0}>
      {children}
    </div>
  );
}
