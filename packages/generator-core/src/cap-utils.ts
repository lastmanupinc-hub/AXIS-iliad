// ─── Truncation disclosure ──────────────────────────────────────
//
// Generated artifacts routinely render only the first N of a much larger set —
// a repo with 443 domain models but a manifest that lists 15, or 163 routes
// capped to 20. Without an explicit note, a downstream agent reads the artifact
// as the COMPLETE surface and plans against a false inventory. These helpers
// produce the disclosure in the two shapes our artifacts need — a one-line
// string for YAML comments / markdown, and a structured {shown,total} for JSON
// — and return "nothing" (null / undefined) when the list fit under the cap, so
// the caller drops the note entirely on the common, non-truncated path.
//
// Both are pure + deterministic (identity for a given input).

/**
 * A human-readable one-liner for a truncated list, or null when `total <=
 * limit`. Callers wrap it in their format's comment syntax, e.g.
 * `# ${capNote(models.length, 15, "domain models")}`.
 */
export function capNote(total: number, limit: number, noun: string): string | null {
  return total > limit ? `showing ${limit} of ${total} ${noun}` : null;
}

/**
 * Structured disclosure for JSON artifacts: `{ shown, total }` when the list was
 * truncated, else `undefined` (so `JSON.stringify` omits the key). `shown` is
 * the effective cap — never more than `total`.
 */
export function capMeta(total: number, limit: number): { shown: number; total: number } | undefined {
  return total > limit ? { shown: limit, total } : undefined;
}
