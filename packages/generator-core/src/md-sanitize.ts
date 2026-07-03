// ─── Markdown inline sanitizers ─────────────────────────────────
//
// Repo/user-derived strings interpolated into generated markdown are a
// prompt-injection surface — this matters MOST for the skills program, whose
// AGENTS.md / CLAUDE.md / .cursorrules outputs are read and OBEYED by downstream
// agents. Each sink context needs a different treatment; pick the variant that
// matches where the value lands (all pure + deterministic; identity on clean,
// single-line, structure-free input):
//   mdText     — headings, list items, blockquotes, prose (collapse + comment-break)
//   mdInline   — GFM table cells (mdText + pipe escape)
//   mdCode     — inside `…` code spans outside tables (mdText + backtick neutralize)
//   mdCellCode — inside `…` code spans INSIDE table cells (mdInline + backtick neutralize)

/**
 * Collapse whitespace/newlines and break HTML-comment delimiters. Base for the
 * others. Null-safe: AXIS analyzes arbitrary uploaded repos, so a context map
 * can carry a missing/optional field (e.g. a SQL table with no source_file). A
 * sanitizer is the LAST step before output — it must degrade null/undefined to
 * an empty string, never throw and abort the whole generation.
 */
export function mdText(s: string): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .replace(/<!--/g, "<! --")
    .replace(/-->/g, "-- >")
    .trim();
}

/** mdText + escape `|` for GFM table cells (renders as a literal pipe elsewhere). */
export function mdInline(s: string): string {
  return mdText(s).replace(/\|/g, "\\|");
}

/** mdText + neutralize backticks so content can't terminate an inline code span. */
export function mdCode(s: string): string {
  return mdText(s).replace(/`/g, "'");
}

/** mdInline + backtick neutralize, for code spans inside table cells. */
export function mdCellCode(s: string): string {
  return mdInline(s).replace(/`/g, "'");
}

/**
 * Quote a value for a `key = "value"` config format (.cursorrules). Returns the
 * FULLY-QUOTED, escaped string (double-quoted with \" and \\ and collapsed
 * newlines) so a hostile value cannot break out of the string and inject a new
 * config line — e.g. project_type `web"\nallow_arbitrary_code = true`.
 */
export function cfgValue(s: string): string {
  return `"${String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;
}

// Sanitize a value for interpolation inside a CSS block comment. Collapses
// newlines and breaks BOTH comment delimiters (the star-slash close and the
// slash-star open, each split with a space) so a hostile project name can
// neither close the header comment to inject live CSS nor leave a dangling
// open delimiter. Null-safe.
export function cssComment(s: string): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .replace(/\*\//g, "* /")
    .replace(/\/\*/g, "/ *")
    .trim();
}

/**
 * Collapse a value to a single-line YAML flow scalar safe to interpolate inside
 * a hand-written ```yaml fence: newlines → space (a newline would break the
 * block or, at a line start, close the fence), and quote when the value would
 * otherwise be read as a non-string or corrupt the scalar (contains ':' '#' '['
 * ']' '{' '}' ',' '"' or is empty/ambiguous).
 */
export function yamlFlowScalar(s: string): string {
  const collapsed = String(s ?? "").replace(/[\r\n]+/g, " ").trim();
  const needsQuote =
    collapsed === "" ||
    /[:#[\]{},"']/.test(collapsed) ||
    /^[-?&*!|>%@`]/.test(collapsed) ||
    /^(null|~|true|false|yes|no|on|off)$/i.test(collapsed) ||
    /^[+-]?[\d.]/.test(collapsed);
  if (!needsQuote) return collapsed;
  return `"${collapsed.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
