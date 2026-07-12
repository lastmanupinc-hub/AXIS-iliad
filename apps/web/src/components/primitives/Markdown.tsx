import type { ReactNode } from "react";

// ─── MarkdownLite (WO-P6) ───────────────────────────────────────────────────
// A minimal, dependency-free Markdown-ish renderer for AXIS-generated docs
// (AGENTS.md, playbooks, guidelines, ...) — built for the Artifact Explorer's
// preview pane. Not a CommonMark implementation: headings, fenced code,
// block quotes, lists, a horizontal rule, and the four common inline spans
// (bold / italic / inline code / link) cover what the generators actually
// emit (text/markdown is the single most common generated-file content type).
//
// Renders to React elements, never a raw HTML string / dangerouslySetInnerHTML
// — every plain-text run is an ordinary React text child, so React escapes it
// exactly like any other prop-driven string. That matters here specifically:
// artifact content is generator output DERIVED from a scanned repo (e.g. a
// package.json "description" can flow into a generated doc almost verbatim),
// so an adversarial repo must not be able to smuggle executable markup into
// the preview pane just by getting weird text into a source file. Link
// targets are additionally scheme-allowlisted (http/https/mailto only) so a
// crafted `[text](javascript:...)` link can never become a clickable
// `<a href>` — see Markdown tests in primitives.test.tsx for the regression
// cases (raw tags never render as elements; unsafe schemes never get an href).

export interface MarkdownLiteProps {
  text: string;
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "code"; lang: string; code: string }
  | { type: "quote"; lines: string[] }
  | { type: "hr" }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "paragraph"; text: string };

const FENCE_RE = /^```\s*(\S*)\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^([-*_])\1{2,}\s*$/;
const QUOTE_RE = /^>\s?(.*)$/;
const UL_RE = /^[-*+]\s+(.*)$/;
const OL_RE = /^\d+\.\s+(.*)$/;
// GFM pipe tables: a row line has at least one "|", and the very next line is
// a separator of only "-", ":", "|", and whitespace (the header/body divider
// — its presence, not its column alignment, is what identifies a table; this
// renderer doesn't support per-column alignment, just left-aligned cells).
const TABLE_ROW_RE = /\|/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function isSpecialLine(line: string): boolean {
  return (
    line.trim() === "" ||
    FENCE_RE.test(line) ||
    HEADING_RE.test(line) ||
    HR_RE.test(line.trim()) ||
    QUOTE_RE.test(line) ||
    UL_RE.test(line) ||
    OL_RE.test(line) ||
    TABLE_ROW_RE.test(line)
  );
}

/** Splits a pipe-table row into cells, stripping one leading/trailing "|" if
 *  present (GFM's optional outer pipes) and un-escaping "\|" within a cell. */
function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "\\" && trimmed[i + 1] === "|") { current += "|"; i++; continue; }
    if (trimmed[i] === "|") { cells.push(current.trim()); current = ""; continue; }
    current += trimmed[i];
  }
  cells.push(current.trim());
  return cells;
}

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { i++; continue; }

    const fence = line.match(FENCE_RE);
    if (fence) {
      const lang = fence[1] ?? "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) { codeLines.push(lines[i]); i++; }
      if (i < lines.length) i++; // consume the closing fence; an unterminated fence just runs to EOF
      blocks.push({ type: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }

    if (HR_RE.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    const quote = line.match(QUOTE_RE);
    if (quote) {
      const qLines = [quote[1]];
      i++;
      while (i < lines.length) {
        const m = lines[i].match(QUOTE_RE);
        if (!m) break;
        qLines.push(m[1]);
        i++;
      }
      blocks.push({ type: "quote", lines: qLines });
      continue;
    }

    const ul = line.match(UL_RE);
    if (ul) {
      const items = [ul[1]];
      i++;
      while (i < lines.length) {
        const m = lines[i].match(UL_RE);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    const ol = line.match(OL_RE);
    if (ol) {
      const items = [ol[1]];
      i++;
      while (i < lines.length) {
        const m = lines[i].match(OL_RE);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    // Table: a "|"-bearing row immediately followed by a "---"-style
    // separator row identifies a GFM pipe table (checked before the generic
    // paragraph fallback, which would otherwise swallow both lines verbatim).
    if (TABLE_ROW_RE.test(line) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2; // header + separator
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i]) && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    // Paragraph: join consecutive plain lines into one soft-wrapped block.
    const paraLines = [line];
    i++;
    while (i < lines.length && !isSpecialLine(lines[i])) { paraLines.push(lines[i]); i++; }
    blocks.push({ type: "paragraph", text: paraLines.join(" ") });
  }

  return blocks;
}

// Inline spans: `code`, **bold**/__bold__, *italic*/_italic_, [text](url).
// Bold is checked before italic below — a bold token also starts/ends with a
// single "*"/"_", so checking italic first would strip only one delimiter
// char off a bold run. The (?!\s)/(?<!\s) flanking guards stop lone, unpaired
// delimiters — e.g. a sentence with two separate glob patterns like
// "*.test.ts and *.spec.ts" — from being misread as one long emphasis run
// spanning both (CommonMark uses the same left/right-flanking idea).
// Wrapped in a capturing group: String.split() only RETAINS matched
// delimiters in its output when the separator regex has a capturing group
// around the whole thing — without it, split() silently discards every
// matched token and keeps only the plain text between them (a real bug this
// file shipped with once already — see primitives.test.tsx's MarkdownLite
// suite, which renders end-to-end and would fail immediately if this regressed).
const INLINE_RE = new RegExp(
  "(" +
  [
    "`[^`]+`",
    String.raw`\*\*(?!\s)[^*]+(?<!\s)\*\*`,
    String.raw`__(?!\s)[^_]+(?<!\s)__`,
    String.raw`\*(?!\s)[^*]+(?<!\s)\*`,
    String.raw`_(?!\s)[^_]+(?<!\s)_`,
    String.raw`\[[^\]]+\]\([^)]+\)`,
  ].join("|") +
  ")",
  "g",
);

const SAFE_LINK_SCHEME_RE = /^(https?:|mailto:)/i;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(INLINE_RE)
    .filter((part) => part !== "")
    .map((part, idx) => {
      const key = `${keyPrefix}-${idx}`;
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={key} className="md-lite-inline-code">{part.slice(1, -1)}</code>;
      }
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("__") && part.endsWith("__")) return <strong key={key}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("*") && part.endsWith("*")) return <em key={key}>{part.slice(1, -1)}</em>;
      if (part.startsWith("_") && part.endsWith("_")) return <em key={key}>{part.slice(1, -1)}</em>;
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        const [, label, url] = link;
        if (SAFE_LINK_SCHEME_RE.test(url)) {
          return <a key={key} href={url} target="_blank" rel="noopener noreferrer">{label}</a>;
        }
        return <span key={key}>{label}</span>; // unsafe/relative scheme — label only, never an href
      }
      return part;
    });
}

function headingTag(level: number): "h3" | "h4" | "h5" | "h6" {
  // Offset by 2 (md h1 -> h3) so a generated doc's own "# Title" never
  // outranks the app chrome's real h1/h2 inside the preview card.
  const n = Math.min(level + 2, 6);
  return `h${n}` as "h3" | "h4" | "h5" | "h6";
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = headingTag(block.level);
      return <Tag key={key} className="md-lite-heading">{renderInline(block.text, `h${key}`)}</Tag>;
    }
    case "code":
      return <pre key={key} className="md-lite-code"><code>{block.code}</code></pre>;
    case "quote":
      return (
        <blockquote key={key} className="md-lite-quote">
          {block.lines.map((line, i) => <p key={i}>{renderInline(line, `q${key}-${i}`)}</p>)}
        </blockquote>
      );
    case "hr":
      return <hr key={key} className="md-lite-hr" />;
    case "list": {
      const items = block.items.map((item, i) => <li key={i}>{renderInline(item, `l${key}-${i}`)}</li>);
      return block.ordered
        ? <ol key={key} className="md-lite-list">{items}</ol>
        : <ul key={key} className="md-lite-list">{items}</ul>;
    }
    case "paragraph":
      return <p key={key} className="md-lite-p">{renderInline(block.text, `p${key}`)}</p>;
    case "table":
      return (
        <div key={key} className="md-lite-table-wrap">
          <table className="md-lite-table">
            <thead>
              <tr>{block.header.map((cell, i) => <th key={i}>{renderInline(cell, `th${key}-${i}`)}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>{row.map((cell, c) => <td key={c}>{renderInline(cell, `td${key}-${r}-${c}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

/** Renders `text` as lightweight Markdown (React elements, no innerHTML). Returns null for empty input. */
export function MarkdownLite({ text }: MarkdownLiteProps) {
  const blocks = parseBlocks(text);
  if (blocks.length === 0) return null;
  return <div className="md-lite">{blocks.map((block, i) => renderBlock(block, i))}</div>;
}
