// ─── Zero-dependency readability + HTML→markdown (WO-12) ────────
//
// Owned extractor for the sovereign web-research backend. Pure TypeScript over
// nothing but the standard library: a lenient stack-based HTML parser, a
// text-density readability heuristic, and a deterministic markdown serializer.
//
// Honest scope: this is deliberately LOWER-FIDELITY than Mozilla Readability —
// a density heuristic over static HTML, with no JavaScript execution and no
// CSS/visibility awareness. Adversarial layouts may extract imperfect regions;
// client-rendered SPA pages may extract thin/empty content. That trade buys
// zero runtime dependencies and deterministic output.

export interface ExtractedDoc {
  title: string;
  markdown: string; // main content when onlyMainContent, else whole body
  text: string; // plain text of the same region
  links: string[]; // absolute, resolved against baseUrl, deduped
  metadata: Record<string, unknown>; // { title, description?, canonical?, byline?, lang? }
}

// ─── Minimal HTML tree ───────────────────────────────────────────

interface HElement {
  type: "element";
  tag: string;
  attrs: Record<string, string>;
  children: HNode[];
}
interface HText {
  type: "text";
  text: string;
}
type HNode = HElement | HText;

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);
// Content consumed verbatim until the matching close tag.
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title", "noscript", "template"]);
// Raw-text tags whose content is still entity-decoded.
const ESCAPABLE_RAW_TEXT_TAGS = new Set(["textarea", "title"]);
// Opening one of these implicitly closes a same-kind ancestor at the top of the stack.
const IMPLIED_END: Record<string, Set<string>> = {
  li: new Set(["li"]),
  p: new Set(["p"]),
  td: new Set(["td", "th"]),
  th: new Set(["td", "th"]),
  tr: new Set(["tr", "td", "th"]),
  option: new Set(["option"]),
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  copy: "©", reg: "®", trade: "™",
  middot: "·", bull: "•", times: "×", laquo: "«", raquo: "»",
};

function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=/>"']+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (m[0] === "") {
      re.lastIndex++;
      continue;
    }
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    if (!(name in attrs)) attrs[name] = decodeEntities(value);
  }
  return attrs;
}

/** Lenient stack-based parser. Never throws; unclosed/mismatched tags degrade gracefully. */
function parseHtml(html: string): HElement {
  const root: HElement = { type: "element", tag: "#root", attrs: {}, children: [] };
  const stack: HElement[] = [root];
  const top = (): HElement => stack[stack.length - 1];
  const appendText = (text: string): void => {
    if (text) top().children.push({ type: "text", text: decodeEntities(text) });
  };
  const n = html.length;
  let i = 0;

  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      appendText(html.slice(i));
      break;
    }
    if (lt > i) appendText(html.slice(i, lt));

    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (html.startsWith("</", lt)) {
      const end = html.indexOf(">", lt);
      const name = html
        .slice(lt + 2, end === -1 ? n : end)
        .trim()
        .toLowerCase();
      for (let s = stack.length - 1; s >= 1; s--) {
        if (stack[s].tag === name) {
          stack.length = s;
          break;
        }
      }
      i = end === -1 ? n : end + 1;
      continue;
    }

    const open = /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(html.slice(lt, Math.min(n, lt + 64)));
    if (!open) {
      appendText("<");
      i = lt + 1;
      continue;
    }
    const tag = open[1].toLowerCase();
    // Find the tag end, respecting quoted attribute values.
    let j = lt + open[0].length;
    let quote: string | null = null;
    while (j < n) {
      const ch = html[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
      j++;
    }
    const rawAttrs = html.slice(lt + open[0].length, j);
    const selfClosed = /\/\s*$/.test(rawAttrs);
    const el: HElement = {
      type: "element",
      tag,
      attrs: parseAttrs(selfClosed ? rawAttrs.replace(/\/\s*$/, "") : rawAttrs),
      children: [],
    };

    const implied = IMPLIED_END[tag];
    if (implied) {
      while (stack.length > 1 && implied.has(top().tag)) stack.pop();
    }
    top().children.push(el);
    i = j >= n ? n : j + 1;

    if (VOID_TAGS.has(tag) || selfClosed) continue;
    if (RAW_TEXT_TAGS.has(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, "i").exec(html.slice(i));
      const raw = close ? html.slice(i, i + close.index) : html.slice(i);
      if (raw) {
        el.children.push({
          type: "text",
          text: ESCAPABLE_RAW_TEXT_TAGS.has(tag) ? decodeEntities(raw) : raw,
        });
      }
      i = close ? i + close.index + close[0].length : n;
      continue;
    }
    stack.push(el);
  }
  return root;
}

// ─── Tree helpers ────────────────────────────────────────────────

function isElement(node: HNode): node is HElement {
  return node.type === "element";
}

function findFirst(el: HElement, pred: (e: HElement) => boolean): HElement | null {
  for (const child of el.children) {
    if (!isElement(child)) continue;
    if (pred(child)) return child;
    const found = findFirst(child, pred);
    if (found) return found;
  }
  return null;
}

function findAll(el: HElement, pred: (e: HElement) => boolean, out: HElement[] = []): HElement[] {
  for (const child of el.children) {
    if (!isElement(child)) continue;
    if (pred(child)) out.push(child);
    findAll(child, pred, out);
  }
  return out;
}

/** Remove every element whose tag is in `tags`, at any depth. */
function stripTags(el: HElement, tags: Set<string>): void {
  el.children = el.children.filter((c) => !(isElement(c) && tags.has(c.tag)));
  for (const child of el.children) {
    if (isElement(child)) stripTags(child, tags);
  }
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Raw concatenated text (no per-node normalization; block tags contribute a space boundary). */
function textOf(node: HNode): string {
  if (node.type === "text") return node.text;
  let out = "";
  for (const child of node.children) out += textOf(child) + " ";
  return out;
}

function textLen(el: HElement): number {
  return normalizeWs(textOf(el)).length;
}

function linkTextLen(el: HElement): number {
  let total = 0;
  for (const a of findAll(el, (e) => e.tag === "a")) total += normalizeWs(textOf(a)).length;
  return total;
}

// ─── Region selection (readability heuristic) ────────────────────

const ALWAYS_STRIP = new Set([
  "script", "style", "noscript", "template", "iframe", "object", "embed", "svg", "canvas", "head",
]);
const CHROME_STRIP = new Set(["nav", "header", "footer", "aside"]);
const CANDIDATE_TAGS = new Set(["article", "main", "section", "div", "td", "body", "#root"]);
/** A semantic container must hold at least this much text (or 20% of the body) to win outright. */
const SEMANTIC_MIN_TEXT = 80;

/**
 * Pick the main-content container: prefer a substantive <article>/<main>/[role=main];
 * otherwise the candidate with the highest non-link text mass (textLen − linkTextLen),
 * refined to the smallest subtree still carrying ≥90% of the best score — so a tight
 * content container beats <body> when they carry the same article.
 */
function pickMainRegion(body: HElement): HElement {
  const bodyTextLen = textLen(body);
  const semantic = findAll(
    body,
    (e) => e.tag === "article" || e.tag === "main" || e.attrs.role === "main",
  );
  if (semantic.length > 0) {
    let best: HElement | null = null;
    let bestLen = -1;
    for (const el of semantic) {
      const len = textLen(el);
      if (len > bestLen) {
        best = el;
        bestLen = len;
      }
    }
    if (best && bestLen >= Math.min(SEMANTIC_MIN_TEXT, bodyTextLen * 0.2)) return best;
  }

  const candidates = [body, ...findAll(body, (e) => CANDIDATE_TAGS.has(e.tag))];
  let bestScore = -1;
  const scored: Array<{ el: HElement; score: number; len: number }> = [];
  for (const el of candidates) {
    const len = textLen(el);
    if (len < 25) continue;
    const score = len - linkTextLen(el); // textLen · (1 − linkDensity)
    scored.push({ el, score, len });
    if (score > bestScore) bestScore = score;
  }
  if (bestScore <= 0) return body;
  let pick: { el: HElement; score: number; len: number } | null = null;
  for (const cand of scored) {
    if (cand.score < bestScore * 0.9) continue;
    if (!pick || cand.len < pick.len) pick = cand;
  }
  return pick ? pick.el : body;
}

// ─── Markdown serializer ─────────────────────────────────────────

interface RenderCtx {
  baseUrl?: string;
  listDepth: number;
}

const BLOCK_TAGS = new Set([
  "div", "section", "article", "main", "body", "figure", "figcaption", "dl", "dt", "dd",
  "address", "details", "summary", "fieldset", "form", "center",
]);

function resolveHref(href: string, baseUrl: string | undefined): string {
  if (!baseUrl || !href) return href;
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

function collapseWs(s: string): string {
  return s.replace(/[ \t\r\n\f]+/g, " ");
}

/** Raw text of a subtree with no markdown processing (for pre/code fences). */
function rawTextOf(node: HNode): string {
  if (node.type === "text") return node.text;
  let out = "";
  for (const child of node.children) out += rawTextOf(child);
  return out;
}

function inlineOf(el: HElement, ctx: RenderCtx): string {
  return renderNodes(el.children, ctx).replace(/\n+/g, " ").replace(/[ \t]+/g, " ").trim();
}

function renderNodes(nodes: HNode[], ctx: RenderCtx): string {
  let out = "";
  for (const node of nodes) out += renderNode(node, ctx);
  return out;
}

function renderList(el: HElement, ctx: RenderCtx): string {
  const ordered = el.tag === "ol";
  const inner: RenderCtx = { ...ctx, listDepth: ctx.listDepth + 1 };
  let out = ctx.listDepth === 0 ? "\n\n" : "\n";
  let index = 0;
  for (const child of el.children) {
    if (!isElement(child) || child.tag !== "li") continue;
    index++;
    const marker = ordered ? `${index}. ` : "- ";
    // Continuation lines (including nested lists, which render at column 0)
    // are indented two spaces under their item — nesting compounds naturally.
    const content = renderNodes(child.children, inner)
      .replace(/\n{2,}/g, "\n")
      .trim()
      .split("\n")
      .map((line, li) => (li === 0 ? line : "  " + line))
      .join("\n");
    out += `${marker}${content}\n`;
  }
  return ctx.listDepth === 0 ? out + "\n" : out;
}

function renderNode(node: HNode, ctx: RenderCtx): string {
  if (node.type === "text") return collapseWs(node.text);
  const el = node;
  const heading = /^h([1-6])$/.exec(el.tag);
  if (heading) {
    const text = inlineOf(el, ctx);
    return text ? `\n\n${"#".repeat(Number(heading[1]))} ${text}\n\n` : "";
  }
  switch (el.tag) {
    case "p": {
      // Unlike headings, paragraphs preserve <br> hard breaks as newlines.
      const text = renderNodes(el.children, ctx)
        .replace(/[ \t]*\n[ \t]*/g, "\n")
        .replace(/\n{2,}/g, "\n")
        .replace(/[ \t]+/g, " ")
        .trim();
      return text ? `\n\n${text}\n\n` : "";
    }
    case "br":
      return "\n";
    case "hr":
      return "\n\n---\n\n";
    case "ul":
    case "ol":
      return renderList(el, ctx);
    case "li": // stray <li> outside a list
      return renderNodes(el.children, ctx);
    case "pre": {
      const code = rawTextOf(el).replace(/^\n+/, "").replace(/\s+$/, "");
      return `\n\n\`\`\`\n${code}\n\`\`\`\n\n`;
    }
    case "code": {
      const code = normalizeWs(rawTextOf(el));
      return code ? `\`${code}\`` : "";
    }
    case "blockquote": {
      const inner = renderNodes(el.children, ctx).replace(/\n{3,}/g, "\n\n").trim();
      if (!inner) return "";
      return "\n\n" + inner.split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n") + "\n\n";
    }
    case "a": {
      const label = inlineOf(el, ctx);
      const href = resolveHref(el.attrs.href ?? "", ctx.baseUrl);
      if (!href) return label;
      return `[${label || href}](${href})`;
    }
    case "strong":
    case "b": {
      const text = inlineOf(el, ctx);
      return text ? `**${text}**` : "";
    }
    case "em":
    case "i": {
      const text = inlineOf(el, ctx);
      return text ? `*${text}*` : "";
    }
    case "img": {
      const src = resolveHref(el.attrs.src ?? "", ctx.baseUrl);
      return src ? `![${el.attrs.alt ?? ""}](${src})` : "";
    }
    case "table":
      return "\n\n" + renderNodes(el.children, ctx).replace(/\n{2,}/g, "\n").trim() + "\n\n";
    case "thead":
    case "tbody":
    case "tfoot":
      return renderNodes(el.children, ctx);
    case "tr": {
      const cells = el.children
        .filter((c): c is HElement => isElement(c) && (c.tag === "td" || c.tag === "th"))
        .map((c) => inlineOf(c, ctx));
      return cells.length ? cells.join(" | ") + "\n" : "";
    }
    case "td":
    case "th":
      return renderNodes(el.children, ctx);
    default:
      if (BLOCK_TAGS.has(el.tag)) return "\n\n" + renderNodes(el.children, ctx) + "\n\n";
      return renderNodes(el.children, ctx); // inline-ish unknown tags: flatten
  }
}

function finishMarkdown(raw: string): string {
  // Line-wise: blank out whitespace-only lines and trim trailing spaces, but
  // PRESERVE leading indentation (nested list items depend on it).
  const lines = raw
    .split("\n")
    .map((line) => (/^[ \t]*$/.test(line) ? "" : line.replace(/[ \t]+$/, "")));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function renderMarkdown(el: HElement, baseUrl: string | undefined): string {
  return finishMarkdown(renderNodes(el.children, { baseUrl, listDepth: 0 }));
}

/** Deterministic HTML→markdown: headings, p, a, ul/ol/li, pre/code, blockquote, br (+em/strong/img/tables). */
export function htmlToMarkdown(fragmentHtml: string): string {
  const root = parseHtml(fragmentHtml);
  stripTags(root, ALWAYS_STRIP);
  return renderMarkdown(root, undefined);
}

// ─── Metadata + links ────────────────────────────────────────────

function collectMetadata(root: HElement, baseUrl: string): { title: string; metadata: Record<string, unknown> } {
  const metas = findAll(root, (e) => e.tag === "meta");
  const metaContent = (name: string): string | null => {
    for (const meta of metas) {
      const key = (meta.attrs.name ?? meta.attrs.property ?? "").toLowerCase();
      if (key === name && meta.attrs.content) return normalizeWs(meta.attrs.content);
    }
    return null;
  };

  const titleEl = findFirst(root, (e) => e.tag === "title");
  const title =
    (titleEl ? normalizeWs(textOf(titleEl)) : "") ||
    metaContent("og:title") ||
    "";

  const metadata: Record<string, unknown> = { title };
  const description = metaContent("description") ?? metaContent("og:description");
  if (description) metadata.description = description;
  const canonicalEl = findFirst(root, (e) => e.tag === "link" && (e.attrs.rel ?? "").toLowerCase() === "canonical");
  if (canonicalEl?.attrs.href) metadata.canonical = resolveHref(canonicalEl.attrs.href, baseUrl);
  const byline = metaContent("author") ?? metaContent("article:author");
  if (byline) metadata.byline = byline;
  const htmlEl = findFirst(root, (e) => e.tag === "html");
  if (htmlEl?.attrs.lang) metadata.lang = htmlEl.attrs.lang;
  return { title, metadata };
}

function collectLinks(scope: HElement, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of findAll(scope, (e) => e.tag === "a")) {
    const href = a.attrs.href;
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    url.hash = "";
    if (!seen.has(url.href)) {
      seen.add(url.href);
      out.push(url.href);
    }
  }
  return out;
}

// ─── Public entry point ──────────────────────────────────────────

/**
 * Owned readability pass: parse → strip script/style/etc → (optionally) strip
 * nav/header/footer/aside and pick the highest text-density container → render
 * markdown + plain text. `links` are collected from the WHOLE body (before the
 * main-content narrowing) so a crawler sees navigation links too.
 */
export function extractReadable(html: string, baseUrl: string, onlyMainContent: boolean): ExtractedDoc {
  const root = parseHtml(html);
  const { title, metadata } = collectMetadata(root, baseUrl); // before stripping (title/meta live in <head>)

  const body = findFirst(root, (e) => e.tag === "body") ?? root;
  stripTags(body, ALWAYS_STRIP);
  const links = collectLinks(body, baseUrl);

  let region: HElement = body;
  if (onlyMainContent) {
    stripTags(body, CHROME_STRIP);
    region = pickMainRegion(body);
  }
  const markdown = renderMarkdown(region, baseUrl);
  const text = normalizeWs(textOf(region));
  return { title, markdown, text, links, metadata };
}
