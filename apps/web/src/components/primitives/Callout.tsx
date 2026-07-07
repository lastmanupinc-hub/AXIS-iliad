import type { ReactNode } from "react";

// ─── Callout (WO-F4) ────────────────────────────────────────────────────────
// Tinted, bordered note box (the ad-hoc "note card" pattern, promoted). The
// `details` prop is the standard home for raw/technical error text: the
// headline stays human copy and the server's response hides behind a
// collapsed disclosure (pairs with api.ts's apiErrorDetails — raw bodies
// never headline, per the WO-F4 error-handling hardening).

export type CalloutTone = "info" | "success" | "warning" | "danger";

export interface CalloutProps {
  tone?: CalloutTone;
  title?: string;
  children?: ReactNode;
  /** Raw/technical detail (server body, stack) behind a collapsed disclosure. */
  details?: string | null;
  detailsLabel?: string;
}

export function Callout({ tone = "info", title, children, details, detailsLabel = "Technical details" }: CalloutProps) {
  return (
    <div className={`callout callout-${tone}`} role={tone === "danger" ? "alert" : undefined}>
      {title && <div className="callout-title">{title}</div>}
      {children !== undefined && <div className="callout-body">{children}</div>}
      {details && (
        <details className="callout-details">
          <summary>{detailsLabel}</summary>
          <pre>{details}</pre>
        </details>
      )}
    </div>
  );
}
