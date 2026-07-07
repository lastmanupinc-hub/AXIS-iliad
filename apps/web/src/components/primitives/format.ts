// Shared number helpers for the hand-rolled chart primitives (WO-F4).

/** Compact display figures: 1284 → "1.3K", 4200000 → "4.2M", 812 → "812". */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trimZero(n / 1_000_000)}M`;
  if (abs >= 1_000) return `${trimZero(n / 1_000)}K`;
  if (Number.isInteger(n)) return n.toLocaleString();
  return trimZero(n);
}

function trimZero(n: number): string {
  const fixed = n.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

/** Round a positive domain max up to a clean axis number (1/2/2.5/5 × 10^k). */
export function niceCeil(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const f of [1, 2, 2.5, 5]) {
    if (v <= f * mag) return f * mag;
  }
  return 10 * mag;
}
