import type { CSSProperties } from "react";

// ─── Skeleton (WO-F4) ───────────────────────────────────────────────────────
// Loading placeholder on the theme.css `shimmer` keyframes (the app only had
// a spinner). Decorative — aria-hidden; the consuming region announces its
// own loading state (e.g. aria-busy / role="status" text).

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  /** Render N stacked text lines instead of one block (last line 60% wide). */
  lines?: number;
  radius?: number | string;
}

export function Skeleton({ width = "100%", height = 14, lines, radius }: SkeletonProps) {
  const style: CSSProperties = { width, height };
  if (radius !== undefined) style.borderRadius = radius;

  if (lines && lines > 1) {
    return (
      <div className="stack gap-2" aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="skeleton" style={{ ...style, width: i === lines - 1 ? "60%" : width }} />
        ))}
      </div>
    );
  }

  return <div className="skeleton" style={style} aria-hidden="true" />;
}
