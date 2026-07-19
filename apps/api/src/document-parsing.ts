// ─── iliad_document_parsing — AXIS-owned doc → Markdown ─────────
//
// Owned implementation built on pdfjs-dist (PDF) + mammoth (DOCX) +
// pure JS (HTML / Markdown / plain text). No third-party API, no
// per-page fee. All parsing happens in-process.
//
// Format dispatch:
//   - PDF (magic %PDF-)                  → pdfjs-dist text extraction
//   - DOCX (ZIP w/ word/document.xml)    → mammoth → markdown
//   - HTML (<!DOCTYPE html / <html>)     → tag-strip + entity decode
//   - Markdown / plain text              → passthrough
//   - Anything else                      → _not_configured: unsupported_format
//
// Both heavy deps (pdfjs-dist, mammoth) are loaded via dynamic
// import so the API process boot stays fast and tests don't pay
// the load cost unless they actually parse something.

import fs from "node:fs/promises";
import { safeFetch } from "./url-guard.js";

export interface ParseOptions {
  /** Public URL the API can fetch (https, max 50 MiB). One of document_url XOR document_base64. */
  document_url?: string;
  /** Inline base64-encoded document bytes (max 50 MiB decoded). One of document_url XOR document_base64. */
  document_base64?: string;
  /** Optional MIME type hint (e.g. "application/pdf"). When omitted we sniff from magic bytes + url extension. */
  mime_type?: string;
  /**
   * Internal (handler-supplied, NOT caller-facing) input-size override in bytes.
   * May only TIGHTEN the standard 50 MiB cap — larger/invalid values fall back
   * to it. Used by lite mode (5 MiB).
   */
  max_doc_bytes?: number;
  /**
   * Internal (handler-supplied, NOT caller-facing) markdown output cap override
   * in chars. May only TIGHTEN the standard 1 MiB cap — larger/invalid values
   * fall back to it. Used by lite mode (256 KiB).
   */
  max_markdown_chars?: number;
}

export type DetectedFormat = "pdf" | "docx" | "html" | "markdown" | "text" | "unknown";

export interface ParseResult {
  markdown: string;
  format_detected: DetectedFormat;
  byte_size: number;
  page_count: number | null;
  table_count: number;
  truncated: boolean;
}

export interface NotConfiguredResult {
  _not_configured: true;
  reason:
    | "document_download_failed"
    | "document_decode_failed"
    | "unsupported_format"
    | "parse_failed"
    | "pdf_runtime_missing"
    | "docx_runtime_missing";
  /**
   * Distinguishes an operator-configuration gap ("the PDF/DOCX runtime isn't available
   * here") from a problem with the caller's own document_url/document_base64 ("this
   * document/URL didn't work"), so a caller can tell whether retrying with different input
   * could help (H-Phase-A cycle 16 — does not change billing: every `_not_configured`
   * envelope skips capture regardless of category).
   */
  category: "not_configured" | "bad_input";
  detail: string;
  remediation: string;
  format_detected?: DetectedFormat;
}

const MAX_DOC_BYTES = 52_428_800; // 50 MiB
const MAX_DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_MARKDOWN_CHARS = 1_048_576; // 1 MiB output cap with truncation marker

/**
 * Resolve a per-call cap override against the standard ceiling. Overrides may
 * only TIGHTEN the cap (a mode can never buy past the standard limit here);
 * non-finite / non-positive / larger values fall back to the standard.
 */
function effectiveCap(override: number | undefined, standard: number): number {
  if (typeof override !== "number" || !Number.isFinite(override) || override <= 0) return standard;
  return Math.min(Math.floor(override), standard);
}
const MAX_PDF_PAGES = 500; // page-bomb guard — cap pages extracted from one PDF
const PARSE_TIME_BUDGET_MS = 20_000; // wall-clock budget for PDF page extraction
const DOCX_PARSE_TIMEOUT_MS = 20_000; // mammoth runs uninterrupted; bound the wait

/**
 * Reject with `label` if `p` doesn't settle within `ms`. The underlying work is
 * not cancelled (no worker thread), so this bounds the response time, not the CPU
 * spent — a decompression bomb still burns cycles in the background until it ends.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      const t = setTimeout(() => reject(new Error(label)), ms);
      t.unref();
    }),
  ]);
}

// ─── Validation ─────────────────────────────────────────────────

export function validateParseOptions(opts: ParseOptions): void {
  if (!opts || typeof opts !== "object") {
    throw new Error("runDocumentParsing: options object required");
  }
  const hasUrl = typeof opts.document_url === "string" && opts.document_url.length > 0;
  const hasB64 = typeof opts.document_base64 === "string" && opts.document_base64.length > 0;
  if (hasUrl === hasB64) {
    throw new Error("runDocumentParsing: provide exactly one of document_url or document_base64");
  }
  if (hasUrl) {
    if (!opts.document_url!.startsWith("https://") && !opts.document_url!.startsWith("http://")) {
      throw new Error("runDocumentParsing: document_url must be an http(s) URL");
    }
  }
  if (opts.mime_type !== undefined) {
    if (typeof opts.mime_type !== "string" || opts.mime_type.length === 0) {
      throw new Error("runDocumentParsing: mime_type must be a non-empty string when provided");
    }
    if (opts.mime_type.length > 200) {
      throw new Error("runDocumentParsing: mime_type looks too long");
    }
  }
}

// ─── Acquisition ────────────────────────────────────────────────

async function downloadDocument(url: string, maxDocBytes: number): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAX_DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await safeFetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const lenHeader = res.headers.get("content-length");
    if (lenHeader) {
      const declared = Number(lenHeader);
      if (Number.isFinite(declared) && declared > maxDocBytes) {
        throw new Error(`Content-Length ${declared} exceeds ${maxDocBytes} bytes`);
      }
    }
    const arrBuf = await res.arrayBuffer();
    if (arrBuf.byteLength > maxDocBytes) {
      throw new Error(`Downloaded ${arrBuf.byteLength} bytes exceeds ${maxDocBytes}`);
    }
    return Buffer.from(arrBuf);
  } finally {
    clearTimeout(timer);
  }
}

function decodeBase64Document(b64: string, maxDocBytes: number): Buffer {
  const buf = Buffer.from(b64, "base64");
  if (buf.byteLength === 0) throw new Error("decoded document is empty");
  if (buf.byteLength > maxDocBytes) {
    throw new Error(`decoded document ${buf.byteLength} bytes exceeds ${maxDocBytes}`);
  }
  return buf;
}

// ─── Format detection ───────────────────────────────────────────
//
// Order of precedence:
//   1. Caller-supplied mime_type (most authoritative)
//   2. Magic-byte sniff (works for binary formats — PDF, DOCX)
//   3. Content shape (HTML doctype / leading <html>)
//   4. URL path extension hint (lowest-confidence)
//   5. Fall back to "text"

function sniffMimeFromBytes(buf: Buffer): DetectedFormat | null {
  if (buf.byteLength >= 5 && buf.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (buf.byteLength >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    // ZIP archive. We treat any ZIP as DOCX candidate — full validation
    // happens inside mammoth which will reject non-DOCX zips with a
    // clear error we surface back to the caller.
    return "docx";
  }
  // Quick HTML detection — strict prefix match only so we don't accidentally
  // classify plain markdown that contains an HTML snippet as HTML.
  const head = buf.subarray(0, Math.min(buf.byteLength, 256)).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return "html";
  return null;
}

function mimeFromHint(mime: string): DetectedFormat | null {
  const m = mime.toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.includes("openxmlformats-officedocument.wordprocessingml") || m.includes("docx")) return "docx";
  if (m.includes("html")) return "html";
  if (m.includes("markdown")) return "markdown";
  if (m.startsWith("text/")) return "text";
  return null;
}

function mimeFromUrlExt(url: string | undefined): DetectedFormat | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const ext = u.pathname.toLowerCase().split(".").pop() ?? "";
    if (ext === "pdf") return "pdf";
    if (ext === "docx") return "docx";
    if (ext === "html" || ext === "htm") return "html";
    if (ext === "md" || ext === "markdown") return "markdown";
    if (ext === "txt") return "text";
  } catch {}
  return null;
}

function detectFormat(buf: Buffer, opts: ParseOptions): DetectedFormat {
  if (opts.mime_type) {
    const fromHint = mimeFromHint(opts.mime_type);
    if (fromHint) return fromHint;
  }
  const fromBytes = sniffMimeFromBytes(buf);
  if (fromBytes) return fromBytes;
  const fromUrl = mimeFromUrlExt(opts.document_url);
  if (fromUrl) return fromUrl;
  // Heuristic last resort: if the buffer looks like printable text, call it
  // text. (Markdown is just text from our perspective — we pass it through
  // unchanged either way.)
  const sample = buf.subarray(0, Math.min(buf.byteLength, 1024));
  let printable = 0;
  for (const b of sample) {
    if (b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e)) printable++;
  }
  if (sample.byteLength > 0 && printable / sample.byteLength > 0.85) return "text";
  return "unknown";
}

// ─── PDF parsing ────────────────────────────────────────────────

interface PdfExtractResult {
  markdown: string;
  page_count: number;
}

async function parsePdf(buf: Buffer): Promise<PdfExtractResult> {
  // pdfjs-dist v4 is ESM-only and assumes a browser-style worker by
  // default. On the server we either point GlobalWorkerOptions at a
  // worker module or use the bundled "fake" worker via the legacy
  // build. The legacy build ships a single bundle that works in Node
  // without any worker plumbing.
  let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch (err) {
    throw new Error(`pdf_runtime_missing: ${err instanceof Error ? err.message : String(err)}`);
  }
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  const pages: string[] = [];
  // Page-bomb / slow-PDF guard: cap both the page count AND the wall-clock spent.
  // The loop awaits between pages, so both bounds are actually enforceable here.
  const maxPages = Math.min(doc.numPages, MAX_PDF_PAGES);
  const start = Date.now();
  let stoppedAt = 0;
  try {
    for (let p = 1; p <= maxPages; p++) {
      if (Date.now() - start > PARSE_TIME_BUDGET_MS) {
        stoppedAt = p - 1;
        break;
      }
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items as Array<{ str?: string }>;
      const pageText = items.map((i) => i.str ?? "").join(" ").replace(/\s+/g, " ").trim();
      pages.push(`--- page ${p} ---\n\n${pageText}`);
    }
  } finally {
    await doc.destroy();
  }
  if (stoppedAt > 0) {
    pages.push(`--- parsing stopped after ${stoppedAt} pages (time budget exceeded; document has ${doc.numPages}) ---`);
  } else if (doc.numPages > MAX_PDF_PAGES) {
    pages.push(`--- truncated: extracted first ${MAX_PDF_PAGES} of ${doc.numPages} pages ---`);
  }
  return {
    markdown: pages.join("\n\n").trim(),
    page_count: doc.numPages,
  };
}

// ─── DOCX parsing ───────────────────────────────────────────────

interface DocxExtractResult {
  markdown: string;
  table_count: number;
}

async function parseDocx(buf: Buffer): Promise<DocxExtractResult> {
  // mammoth ships a CommonJS main with type defs that work under
  // esModuleInterop. Dynamic import returns either the namespace or
  // a {default} wrapper depending on Node's CJS-interop pass.
  let mammothMod: { convertToMarkdown?: (input: { buffer: Buffer }) => Promise<{ value: string; messages: unknown[] }> };
  try {
    const mod = (await import("mammoth")) as unknown as Record<string, unknown> & {
      default?: Record<string, unknown>;
    };
    const candidate = (mod.convertToMarkdown ? mod : mod.default) as typeof mammothMod | undefined;
    if (!candidate || typeof candidate.convertToMarkdown !== "function") {
      throw new Error("mammoth.convertToMarkdown not found in module exports");
    }
    mammothMod = candidate;
  } catch (err) {
    throw new Error(`docx_runtime_missing: ${err instanceof Error ? err.message : String(err)}`);
  }
  const result = await withTimeout(
    mammothMod.convertToMarkdown!({ buffer: buf }),
    DOCX_PARSE_TIMEOUT_MS,
    "docx_parse_timeout",
  );
  // Count rendered tables by occurrence of a markdown table-header rule
  // ("| --- |" pattern). Cheap heuristic but matches mammoth's actual
  // output shape.
  const tableMatches = result.value.match(/^\s*\|[\s\-:|]+\|\s*$/gm);
  return {
    markdown: result.value,
    table_count: tableMatches ? tableMatches.length : 0,
  };
}

// ─── HTML → markdown-ish text ───────────────────────────────────
//
// Pragmatic, NOT a heavy converter. Callers wanting fancy HTML→MD
// should bring their own (turndown). This:
//   - drops <script> and <style> bodies
//   - collapses paragraphs/divs/headings into newline breaks
//   - keeps headings as `#` lines
//   - decodes a small entity set
//   - strips remaining tags
//   - collapses runs of blank lines

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&apos;/g, "'");
}

function parseHtml(text: string): { markdown: string } {
  let out = text;
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, inner: string) => {
    const hashes = "#".repeat(Number(level));
    return `\n\n${hashes} ${inner.replace(/<[^>]+>/g, "").trim()}\n\n`;
  });
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<\/(p|div|li|tr)>/gi, "\n");
  out = out.replace(/<li[^>]*>/gi, "- ");
  out = out.replace(/<[^>]+>/g, "");
  out = decodeEntities(out);
  out = out.replace(/\r/g, "");
  out = out.replace(/[ \t]+\n/g, "\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  return { markdown: out.trim() };
}

// ─── Public entrypoint ──────────────────────────────────────────

function capMarkdown(md: string, maxMarkdownChars: number): { md: string; truncated: boolean } {
  if (md.length <= maxMarkdownChars) return { md, truncated: false };
  return {
    md: md.slice(0, maxMarkdownChars) + `\n\n[...truncated at ${maxMarkdownChars} chars...]`,
    truncated: true,
  };
}

export async function runDocumentParsing(
  opts: ParseOptions,
): Promise<ParseResult | NotConfiguredResult> {
  validateParseOptions(opts);
  // Per-call cap overrides (lite mode). Defaults are the standard ceilings, so
  // callers that don't pass overrides get byte-identical behavior.
  const maxDocBytes = effectiveCap(opts.max_doc_bytes, MAX_DOC_BYTES);
  const maxMarkdownChars = effectiveCap(opts.max_markdown_chars, MAX_MARKDOWN_CHARS);

  let buf: Buffer;
  if (opts.document_url) {
    try {
      buf = await downloadDocument(opts.document_url, maxDocBytes);
    } catch (err) {
      return {
        _not_configured: true,
        reason: "document_download_failed",
        category: "bad_input",
        detail: err instanceof Error ? err.message : String(err),
        remediation:
          `document_url must return a 200 response with document bytes under ${maxDocBytes / 1_048_576} MiB within 60 seconds.`,
      };
    }
  } else {
    try {
      buf = decodeBase64Document(opts.document_base64!, maxDocBytes);
    } catch (err) {
      return {
        _not_configured: true,
        reason: "document_decode_failed",
        category: "bad_input",
        detail: err instanceof Error ? err.message : String(err),
        remediation: `document_base64 must be a valid base64-encoded payload under ${maxDocBytes / 1_048_576} MiB decoded.`,
      };
    }
  }

  const format = detectFormat(buf, opts);
  if (format === "unknown") {
    return {
      _not_configured: true,
      reason: "unsupported_format",
      category: "bad_input",
      detail: "Document is not recognized as PDF, DOCX, HTML, Markdown, or plain text",
      remediation:
        "Pass `mime_type` explicitly (e.g. 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/html') or provide a URL with a recognized file extension.",
      format_detected: format,
    };
  }

  try {
    if (format === "pdf") {
      const r = await parsePdf(buf);
      const { md, truncated } = capMarkdown(r.markdown, maxMarkdownChars);
      return {
        markdown: md,
        format_detected: "pdf",
        byte_size: buf.byteLength,
        page_count: r.page_count,
        table_count: 0,
        truncated,
      };
    }
    if (format === "docx") {
      const r = await parseDocx(buf);
      const { md, truncated } = capMarkdown(r.markdown, maxMarkdownChars);
      return {
        markdown: md,
        format_detected: "docx",
        byte_size: buf.byteLength,
        page_count: null,
        table_count: r.table_count,
        truncated,
      };
    }
    if (format === "html") {
      const r = parseHtml(buf.toString("utf8"));
      const { md, truncated } = capMarkdown(r.markdown, maxMarkdownChars);
      return {
        markdown: md,
        format_detected: "html",
        byte_size: buf.byteLength,
        page_count: null,
        table_count: 0,
        truncated,
      };
    }
    // markdown + text — passthrough
    const { md, truncated } = capMarkdown(buf.toString("utf8"), maxMarkdownChars);
    return {
      markdown: md,
      format_detected: format,
      byte_size: buf.byteLength,
      page_count: null,
      table_count: 0,
      truncated,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("pdf_runtime_missing")) {
      return {
        _not_configured: true,
        reason: "pdf_runtime_missing",
        category: "not_configured",
        detail: msg.slice("pdf_runtime_missing: ".length),
        remediation:
          "pdfjs-dist failed to load. Reinstall apps/api dependencies — the package is part of the standard apps/api install.",
        format_detected: format,
      };
    }
    if (msg.startsWith("docx_runtime_missing")) {
      return {
        _not_configured: true,
        reason: "docx_runtime_missing",
        category: "not_configured",
        detail: msg.slice("docx_runtime_missing: ".length),
        remediation: "mammoth failed to load. Reinstall apps/api dependencies.",
        format_detected: format,
      };
    }
    return {
      _not_configured: true,
      reason: "parse_failed",
      category: "bad_input",
      detail: msg.slice(0, 800),
      remediation:
        "The parser ran but the document was malformed or unsupported by the upstream library. " +
        "For PDFs: try a different PDF (encrypted / scanned-image-only PDFs need OCR which isn't shipped here). " +
        "For DOCX: ensure the file is a real .docx (.doc legacy format isn't supported).",
      format_detected: format,
    };
  }
}

// ─── Test-only helpers ──────────────────────────────────────────

/** Test-only helper. Reads a fixture from disk and returns the bytes. */
export async function loadFixtureForTests(absPath: string): Promise<Buffer> {
  return fs.readFile(absPath);
}
