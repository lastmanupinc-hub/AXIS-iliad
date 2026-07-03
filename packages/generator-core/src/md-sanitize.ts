/**
 * Collapse a user/DB-sourced string for safe interpolation into markdown
 * INLINE contexts (table cells, headings, list items). Pure + deterministic.
 *  - all whitespace runs (incl. CR/LF) → single space
 *  - `|` → `\|`               (GFM table-cell safe; renders as a literal pipe elsewhere)
 *  - `<!--` → `<! --`, `-->` → `-- >`  (breaks HTML-comment delimiters so content can
 *    never smuggle structural markers — e.g. the memory-weave delimiters — into output)
 *  - trimmed
 */
export function mdInline(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/<!--/g, "<! --")
    .replace(/-->/g, "-- >")
    .trim();
}
