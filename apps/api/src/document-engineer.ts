// ─── E7 Document Intelligence: engineer-tier extraction ─────────
//
// iliad_document_parsing's engineer upgrade turns markdown into TYPED data:
//   1. retrieval chunking — heading-aware, overlapping chunks for RAG
//   2. extract-to-caller-schema — pull a json_schema-shaped object from the doc,
//      reusing E8's grammar-constrained decode + validator (the guarantee)
//   3. (separately) image OCR via tesseract.js — see document-ocr.ts
//
// Chunking is pure + deterministic. Extraction injects the completion fn so the
// orchestration is testable without a model.

import { validateStructuredOutput } from "./json-schema-validate.js";

export interface DocChunk {
  index: number;
  heading: string | null;
  text: string;
}

/**
 * Split markdown into heading-aware, overlapping chunks. Each `## heading`
 * starts a new section; long sections are windowed into <=maxChars slices with
 * `overlapChars` carried between them. Pure + deterministic.
 */
export function chunkMarkdown(markdown: string, opts?: { maxChars?: number; overlapChars?: number }): DocChunk[] {
  const maxChars = Math.max(200, Math.floor(opts?.maxChars ?? 1200));
  const overlap = Math.max(0, Math.min(Math.floor(opts?.overlapChars ?? 150), maxChars - 50));
  const chunks: DocChunk[] = [];

  let heading: string | null = null;
  let buf: string[] = [];

  const flush = (h: string | null): void => {
    const text = buf.join("\n").trim();
    buf = [];
    if (text.length === 0) return;
    if (text.length <= maxChars) {
      chunks.push({ index: chunks.length, heading: h, text });
      return;
    }
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + maxChars, text.length);
      const slice = text.slice(start, end).trim();
      if (slice.length > 0) chunks.push({ index: chunks.length, heading: h, text: slice });
      if (end >= text.length) break;
      start = end - overlap; // step forward, keeping the overlap window
    }
  };

  for (const line of markdown.split(/\r?\n/)) {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      flush(heading);
      heading = m[2].trim();
    } else {
      buf.push(line);
    }
  }
  flush(heading);
  return chunks;
}

export interface CompletionLike {
  text?: string;
  _not_configured?: boolean;
}

/**
 * Why extractToSchema degraded to configured:false — distinguishes a genuine
 * operator-configuration gap from a transient completion failure or an unexpected
 * response shape, so the paid artifact's error message doesn't call every one of
 * these "no local model configured" (H-Phase-A cycle 16).
 */
export type DegradedReason = "not_configured" | "completion_threw" | "malformed_response";

export type CompletionFn = (opts: {
  prompt: string;
  system?: string;
  temperature?: number;
  max_tokens?: number;
  json_schema?: unknown;
}) => Promise<CompletionLike>;

export interface ExtractResult {
  configured: boolean;
  valid: boolean;
  parsed: unknown;
  errors: string[];
  degraded_reason?: DegradedReason;
}

/**
 * Extract a json_schema-shaped object from a document's markdown — grammar-
 * constrained decode (the injected completion passes the schema through) +
 * deterministic validation against the same schema (E8). `completion` is
 * injected so this is testable without a model; degrades to configured:false.
 */
export async function extractToSchema(
  markdown: string,
  schema: unknown,
  completion: CompletionFn,
  opts?: { maxDocChars?: number },
): Promise<ExtractResult> {
  const doc = markdown.slice(0, Math.max(500, opts?.maxDocChars ?? 12_000));
  const prompt = [
    "Extract data from the DOCUMENT below into a JSON object matching the schema.",
    "Return ONLY the JSON object — no prose, no markdown code fences.",
    "",
    "DOCUMENT:",
    doc,
  ].join("\n");

  let res: CompletionLike;
  let completionThrew = false;
  try {
    res = await completion({
      prompt,
      system: "You extract structured data from documents and output only valid JSON.",
      temperature: 0,
      max_tokens: 1024,
      json_schema: schema,
    });
  } catch {
    res = {};
    completionThrew = true;
  }

  if (!res || res._not_configured === true || typeof res.text !== "string") {
    const degraded_reason: DegradedReason = completionThrew
      ? "completion_threw"
      : res?._not_configured === true
        ? "not_configured"
        : "malformed_response";
    const errors =
      degraded_reason === "completion_threw"
        ? ["the completion call raised an unexpected error (not a configuration issue — this may be transient)"]
        : degraded_reason === "malformed_response"
          ? ["the completion call returned an unexpected response shape (not a configuration issue — this may be a bug)"]
          : ["no local model configured for extraction"];
    return { configured: false, valid: false, parsed: undefined, errors, degraded_reason };
  }

  const { valid, parsed, errors } = validateStructuredOutput(res.text, schema);
  return { configured: true, valid, parsed, errors };
}
