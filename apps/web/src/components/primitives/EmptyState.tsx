import type { ReactNode } from "react";
import { Icon } from "../Icon.tsx";

// ─── EmptyState (WO-F4) ─────────────────────────────────────────────────────
// The `.empty-state` class existed but every page hand-rolled its own variant;
// promoted to a component: icon + title + message + optional CTA.

export interface EmptyStateProps {
  /** Icon name from components/Icon.tsx PATHS. */
  icon?: string;
  title: string;
  message?: string;
  cta?: { label: string; onClick: () => void };
  /** Extra content below the CTA (secondary links, hints). */
  children?: ReactNode;
}

export function EmptyState({ icon, title, message, cta, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon && (
        <div className="empty-state-icon" aria-hidden>
          <Icon name={icon} size={28} />
        </div>
      )}
      <div className="empty-state-title">{title}</div>
      {message && <p className="empty-state-message">{message}</p>}
      {cta && (
        <button type="button" className="btn btn-primary" onClick={cta.onClick}>
          {cta.label}
        </button>
      )}
      {children}
    </div>
  );
}
