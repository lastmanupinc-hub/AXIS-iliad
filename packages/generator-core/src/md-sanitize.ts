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

// ─── HTML + generated-code sanitizers ───────────────────────────
//
// The artifacts program is the first to emit HTML (index.html) and GENERATED
// SOURCE CODE (.tsx/.ts React/Svelte/Vue/vanilla). A repo-derived value dropped
// raw into those contexts is code injection, not just formatting corruption:
// a project name that closes a string literal, a description that opens a JSX
// expression, or a path with a newline that starts a new statement inside a
// `//` comment. Each context below needs its own escaping — an HTML escaper is
// wrong for a JS string literal and vice-versa.

/**
 * Escape a value for HTML TEXT content or a (single- or double-quoted) HTML
 * ATTRIBUTE value: the five significant characters become entities so the value
 * can neither open a tag nor close the attribute. Null-safe.
 */
export function htmlEscape(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape a value for JSX TEXT content (between tags). Beyond HTML escaping, JSX
 * also treats `{` / `}` as expression delimiters, so those are escaped too — a
 * description like `hi {process.env.SECRET}` must not become a live expression.
 */
export function jsxText(s: string): string {
  return htmlEscape(s).replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
}

/**
 * Escape a value for the INNER of a double-quoted JS/TS string literal (the
 * caller supplies the surrounding quotes: `"${jsString(x)}"`). Backslash first,
 * then the double-quote, then the line terminators that would end the literal —
 * including U+2028 / U+2029, which JS (unlike JSON) treats as line breaks.
 * Null-safe.
 */
export function jsString(s: string): string {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Sanitize a value for interpolation inside ANY generated-code comment — a `//`
 * line comment, a `/* … *\/` block/JSDoc comment, or an `<!-- … -->` HTML
 * comment. Collapses whitespace (a newline would end a `//` comment and drop
 * the rest of the value onto a live code line) and breaks every comment
 * open/close delimiter so the value can neither close its comment early nor
 * open a nested one. Null-safe.
 */
export function codeComment(s: string): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .replace(/\*\//g, "* /")
    .replace(/\/\*/g, "/ *")
    .replace(/<!--/g, "<! --")
    .replace(/-->/g, "-- >")
    .trim();
}
