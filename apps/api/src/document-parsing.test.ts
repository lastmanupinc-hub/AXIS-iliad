import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Handler-level lite-cap tests (bottom of this file) follow the
// mcp-embeddings.test.ts harness: resolveAuth + the usage-credit fns are
// mocked; the module under test (document-parsing.js) stays fully real.
vi.mock("./billing.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./billing.js")>();
  return {
    ...actual,
    resolveAuth: vi.fn(async () => ({ account: { account_id: "acc-doc", tier: "paid" as const } })),
  };
});

vi.mock("@axis/snapshots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@axis/snapshots")>();
  return {
    ...actual,
    previewUsageCredits: vi.fn(async () => ({ effective_overage_cents: 0 })),
    consumeUsageCredits: vi.fn(async () => ({ effective_overage_cents: 0 })),
  };
});

import {
  runDocumentParsing,
  validateParseOptions,
  withTimeout,
  type NotConfiguredResult,
  type ParseResult,
} from "./document-parsing.js";
import { runDocumentParsingDispatch } from "./mcp-tool-impls.js";
import * as snapshots from "@axis/snapshots";
import type { IncomingMessage } from "node:http";

function isNotConfigured(r: unknown): r is NotConfiguredResult {
  return Boolean(r && typeof r === "object" && (r as { _not_configured?: unknown })._not_configured === true);
}

function isParsed(r: unknown): r is ParseResult {
  return Boolean(r && typeof r === "object" && !(r as { _not_configured?: unknown })._not_configured);
}

describe("withTimeout (parse guards)", () => {
  it("returns the value when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, "nope")).resolves.toBe(42);
  });
  it("rejects with the label when the work is too slow", async () => {
    const never = new Promise<never>(() => {});
    await expect(withTimeout(never, 20, "docx_parse_timeout")).rejects.toThrow("docx_parse_timeout");
  });
});

// ─── Validation ─────────────────────────────────────────────────

describe("document-parsing — validateParseOptions", () => {
  it("accepts a minimal document_url call", () => {
    expect(() => validateParseOptions({ document_url: "https://example.com/doc.pdf" })).not.toThrow();
  });

  it("accepts a minimal document_base64 call", () => {
    expect(() => validateParseOptions({ document_base64: "aGVsbG8=" })).not.toThrow();
  });

  it("rejects neither input", () => {
    expect(() => validateParseOptions({})).toThrow(/exactly one of/);
  });

  it("rejects both inputs", () => {
    expect(() =>
      validateParseOptions({
        document_url: "https://example.com/a.pdf",
        document_base64: "aGVsbG8=",
      }),
    ).toThrow(/exactly one of/);
  });

  it("rejects non-http document_url", () => {
    expect(() => validateParseOptions({ document_url: "file:///etc/passwd" })).toThrow(/http\(s\)/);
  });

  it("rejects empty mime_type when provided", () => {
    expect(() =>
      validateParseOptions({ document_url: "https://x.com/a.pdf", mime_type: "" }),
    ).toThrow(/mime_type/);
  });

  it("rejects oversized mime_type", () => {
    expect(() =>
      validateParseOptions({
        document_url: "https://x.com/a.pdf",
        mime_type: "x".repeat(201),
      }),
    ).toThrow(/mime_type/);
  });
});

// ─── Format detection + small in-memory parses ──────────────────

describe("document-parsing — runDocumentParsing format dispatch", () => {
  it("validates options BEFORE doing anything else", async () => {
    await expect(runDocumentParsing({})).rejects.toThrow(/exactly one of/);
  });

  it("parses plain text as 'text' passthrough", async () => {
    const text = "Hello AXIS Iliad — this is plain text.";
    const r = await runDocumentParsing({
      document_base64: Buffer.from(text, "utf8").toString("base64"),
    });
    expect(isParsed(r)).toBe(true);
    if (isParsed(r)) {
      expect(r.format_detected).toBe("text");
      expect(r.markdown).toBe(text);
      expect(r.page_count).toBeNull();
      expect(r.table_count).toBe(0);
      expect(r.truncated).toBe(false);
      expect(r.byte_size).toBe(Buffer.byteLength(text, "utf8"));
    }
  });

  it("honors mime_type=text/markdown as markdown passthrough", async () => {
    const md = "# Heading\n\nA paragraph.";
    const r = await runDocumentParsing({
      document_base64: Buffer.from(md, "utf8").toString("base64"),
      mime_type: "text/markdown",
    });
    expect(isParsed(r)).toBe(true);
    if (isParsed(r)) {
      expect(r.format_detected).toBe("markdown");
      expect(r.markdown).toBe(md);
    }
  });

  it("strips html into markdown-ish text", async () => {
    const html =
      `<!DOCTYPE html>
<html><head><style>body{color:red}</style><script>alert(1)</script></head>
<body>
<h1>Title</h1>
<p>First paragraph.</p>
<ul><li>One</li><li>Two</li></ul>
<p>Second &amp; third.</p>
</body></html>`;
    const r = await runDocumentParsing({
      document_base64: Buffer.from(html, "utf8").toString("base64"),
    });
    expect(isParsed(r)).toBe(true);
    if (isParsed(r)) {
      expect(r.format_detected).toBe("html");
      expect(r.markdown).toContain("# Title");
      expect(r.markdown).toContain("First paragraph.");
      expect(r.markdown).toContain("- One");
      expect(r.markdown).toContain("- Two");
      expect(r.markdown).toContain("Second & third.");
      // script + style bodies must be excluded
      expect(r.markdown).not.toContain("alert(1)");
      expect(r.markdown).not.toContain("color:red");
    }
  });

  it("returns unsupported_format envelope for binary blobs that don't sniff as anything we handle", async () => {
    // A short random binary buffer that isn't PDF, isn't a ZIP, doesn't
    // start with <html, and isn't >85% printable.
    const blob = Buffer.from([0x00, 0xff, 0x00, 0xff, 0x12, 0x34, 0x00, 0xff, 0x00, 0xff]);
    const r = await runDocumentParsing({
      document_base64: blob.toString("base64"),
    });
    expect(isNotConfigured(r)).toBe(true);
    if (isNotConfigured(r)) {
      expect(r.reason).toBe("unsupported_format");
      expect(r.format_detected).toBe("unknown");
      expect(r.remediation).toContain("mime_type");
    }
  });

  it("returns document_decode_failed when base64 decodes to empty", async () => {
    const r = await runDocumentParsing({ document_base64: "===" });
    expect(isNotConfigured(r)).toBe(true);
    if (isNotConfigured(r)) {
      expect(r.reason).toBe("document_decode_failed");
    }
  });

  it("PDF magic bytes route through the pdf parser (real tiny PDF)", async () => {
    // A minimal valid PDF crafted by hand. Just the bare structure needed
    // for pdfjs to load it; text content is intentionally tiny.
    const pdf = makeMinimalPdfBuffer("AXIS");
    const r = await runDocumentParsing({
      document_base64: pdf.toString("base64"),
    });
    expect(isParsed(r) || isNotConfigured(r)).toBe(true);
    if (isParsed(r)) {
      expect(r.format_detected).toBe("pdf");
      expect(r.page_count).toBeGreaterThanOrEqual(1);
      expect(r.markdown).toContain("--- page 1 ---");
      // The minimal PDF embeds the literal text "AXIS" — extraction
      // should surface it.
      expect(r.markdown).toContain("AXIS");
    } else if (isNotConfigured(r)) {
      // Some pdfjs releases reject the hand-crafted minimal layout. In
      // that case we still expect a clean parse_failed envelope rather
      // than a crash.
      expect(["parse_failed", "pdf_runtime_missing"]).toContain(r.reason);
      expect(r.format_detected).toBe("pdf");
    }
  }, 30_000);

  it("ZIP magic bytes route through the docx parser (envelope when not real .docx)", async () => {
    // A 4-byte ZIP signature with garbage after — enough to trip the
    // docx sniff but not a real .docx. mammoth will reject it; we
    // expect the parse_failed envelope.
    const fakeDocx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0xff, 0xff, 0xff]);
    const r = await runDocumentParsing({
      document_base64: fakeDocx.toString("base64"),
    });
    expect(isNotConfigured(r)).toBe(true);
    if (isNotConfigured(r)) {
      expect(r.format_detected).toBe("docx");
      expect(["parse_failed", "docx_runtime_missing"]).toContain(r.reason);
    }
  }, 30_000);
});

// ─── Markdown output cap ────────────────────────────────────────

describe("document-parsing — output cap", () => {
  it("truncates oversized text input with a marker", async () => {
    // Push past the 1 MiB markdown cap.
    const big = "a".repeat(1_200_000);
    const r = await runDocumentParsing({
      document_base64: Buffer.from(big, "utf8").toString("base64"),
    });
    expect(isParsed(r)).toBe(true);
    if (isParsed(r)) {
      expect(r.truncated).toBe(true);
      expect(r.markdown).toMatch(/truncated/);
    }
  });
});

// ─── Cap overrides (lite-mode plumbing) ─────────────────────────
//
// max_doc_bytes / max_markdown_chars are internal, handler-supplied overrides
// that may only TIGHTEN the standard 50 MiB / 1 MiB ceilings. Defaults leave
// standard behavior byte-identical (proven by every other test in this file).

describe("document-parsing — cap overrides (lite plumbing)", () => {
  it("max_markdown_chars tightens the output cap and mirrors the standard truncation marker", async () => {
    const text = "b".repeat(5_000);
    const r = await runDocumentParsing({
      document_base64: Buffer.from(text, "utf8").toString("base64"),
      max_markdown_chars: 1_000,
    });
    expect(isParsed(r)).toBe(true);
    if (isParsed(r)) {
      expect(r.truncated).toBe(true);
      expect(r.markdown).toContain("[...truncated at 1000 chars...]");
      expect(r.markdown.startsWith("b".repeat(1_000))).toBe(true);
    }
  });

  it("max_doc_bytes tightens the input cap → clean document_decode_failed envelope", async () => {
    const payload = Buffer.alloc(2_048, 0x61); // 'a' × 2048 — over a 1024-byte cap
    const r = await runDocumentParsing({
      document_base64: payload.toString("base64"),
      max_doc_bytes: 1_024,
    });
    expect(isNotConfigured(r)).toBe(true);
    if (isNotConfigured(r)) {
      expect(r.reason).toBe("document_decode_failed");
      expect(r.detail).toMatch(/exceeds 1024/);
    }
  });

  it("an override LARGER than the standard cap is ignored (can only tighten)", async () => {
    const big = "c".repeat(1_200_000); // over the standard 1 MiB output cap
    const r = await runDocumentParsing({
      document_base64: Buffer.from(big, "utf8").toString("base64"),
      max_markdown_chars: 99_999_999,
    });
    expect(isParsed(r)).toBe(true);
    if (isParsed(r)) {
      expect(r.truncated).toBe(true);
      expect(r.markdown).toContain("[...truncated at 1048576 chars...]");
    }
  });
});

// ─── Lite mode (runDocumentParsingDispatch handler) ─────────────
//
// Direct handler-level tests (mcp-embeddings.test.ts style): lite input over
// 5 MiB is rejected BEFORE any parsing or metering; lite markdown output is
// truncated at 256 KiB (charged — the work was delivered); standard keeps the
// 50 MiB / 1 MiB ceilings untouched.

describe("runDocumentParsingDispatch — lite caps", () => {
  const liteReq = { headers: { "x-agent-mode": "lite" }, socket: {} } as unknown as IncomingMessage;
  const stdReq = { headers: {}, socket: {} } as unknown as IncomingMessage;

  beforeEach(() => {
    vi.mocked(snapshots.previewUsageCredits).mockClear();
    vi.mocked(snapshots.consumeUsageCredits).mockClear();
  });

  it("rejects a >5 MiB base64 input in lite mode BEFORE the charge", async () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0x61).toString("base64");
    await expect(
      runDocumentParsingDispatch({ document_base64: oversized }, liteReq),
    ).rejects.toThrow(/lite mode caps document input at 5 MiB.*X-Agent-Mode: standard/);
    // Charge-not-taken proof: neither authorize (preview) nor capture (consume) ran.
    expect(snapshots.previewUsageCredits).not.toHaveBeenCalled();
    expect(snapshots.consumeUsageCredits).not.toHaveBeenCalled();
  });

  it("truncates lite markdown output at 256 KiB with the standard marker (charged once)", async () => {
    const text = "d".repeat(300_000); // > 262,144 chars out, well under 5 MiB in
    const out = JSON.parse(
      await runDocumentParsingDispatch({ document_base64: Buffer.from(text, "utf8").toString("base64") }, liteReq),
    );
    expect(out.truncated).toBe(true);
    expect(out.markdown).toContain(`[...truncated at ${256 * 1024} chars...]`);
    expect(out.markdown.startsWith("d".repeat(256 * 1024))).toBe(true);
    expect(snapshots.consumeUsageCredits).toHaveBeenCalledTimes(1);
  });

  it("standard mode keeps the standard caps (same input passes through untruncated)", async () => {
    const text = "d".repeat(300_000); // over the lite cap, under the standard 1 MiB cap
    const out = JSON.parse(
      await runDocumentParsingDispatch({ document_base64: Buffer.from(text, "utf8").toString("base64") }, stdReq),
    );
    expect(out.truncated).toBe(false);
    expect(out.markdown.length).toBe(300_000);
    expect(snapshots.consumeUsageCredits).toHaveBeenCalledTimes(1);
  });
});

// ─── document_url ingestion — unhappy paths (safeFetch / url-guard) ──
//
// Every test above drives document_base64 only. downloadDocument() (the
// document_url path, via safeFetch in url-guard.ts) had zero coverage.
// These stub global fetch — matching the vi.spyOn(globalThis, "fetch")
// convention used elsewhere for safeFetch-routed code (see
// cashier-paid-wallet.test.ts) — and target a literal public IP host
// (93.184.216.34, already vetted as non-blocked in url-guard.test.ts) so
// assertPublicUrl's DNS-lookup branch is never hit and no real network
// I/O occurs.

describe("document-parsing — document_url download failures (safeFetch integration)", () => {
  const DOC_URL = "http://93.184.216.34/report.pdf";
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("returns a clean document_download_failed envelope when the guard's download timeout fires", async () => {
    // downloadDocument races safeFetch against a 60s AbortController timer. Simulating the abort
    // by rejecting fetch itself (rather than waiting out a real 60s timer) matches this codebase's
    // existing convention for testing abort-driven timeouts (see cashier-paid-wallet.test.ts's
    // `Object.assign(new Error(...), { name: "AbortError" })` fetch rejection).
    fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      Object.assign(new Error("The operation was aborted"), { name: "AbortError" }),
    );
    const r = await runDocumentParsing({ document_url: DOC_URL });
    expect(isNotConfigured(r)).toBe(true);
    if (isNotConfigured(r)) {
      expect(r.reason).toBe("document_download_failed");
      expect(r.detail).toMatch(/abort/i);
      expect(r.remediation).toMatch(/60 seconds/);
    }
  });

  it("returns a clean document_download_failed envelope on a transport-level fetch rejection", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNRESET: connection reset by peer"));
    const r = await runDocumentParsing({ document_url: DOC_URL });
    expect(isNotConfigured(r)).toBe(true);
    if (isNotConfigured(r)) {
      expect(r.reason).toBe("document_download_failed");
      expect(r.detail).toMatch(/ECONNRESET/);
    }
  });

  it("returns a clean parse_failed envelope for malformed bytes served at document_url (200 OK, ZIP magic, not a real docx)", async () => {
    // Identical malformed payload to the document_base64 "ZIP magic bytes" test above — this proves
    // mammoth's throw on a fake docx gets caught the same way regardless of ingestion path (base64
    // vs safeFetch-downloaded bytes).
    const fakeDocx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0xff, 0xff, 0xff]);
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(fakeDocx, { status: 200 }));
    const r = await runDocumentParsing({ document_url: "http://93.184.216.34/report.docx" });
    expect(isNotConfigured(r)).toBe(true);
    if (isNotConfigured(r)) {
      expect(r.format_detected).toBe("docx");
      expect(["parse_failed", "docx_runtime_missing"]).toContain(r.reason);
    }
  }, 30_000);
});

// ─── Helper: build a minimal one-page PDF in memory ─────────────
//
// Produces a tiny single-page PDF with one Tj-emitted string. Used
// to validate the dispatch + extraction path without dragging a
// fixture file into the repo.

function makeMinimalPdfBuffer(text: string): Buffer {
  // 7 objects: catalog, pages, page, font, contents, +xref + trailer.
  // Strings inside PDF content streams use the literal-string syntax (....).
  const stream = `BT /F1 24 Tf 50 700 Td (${text}) Tj ET`;
  const streamBuf = Buffer.from(stream, "ascii");
  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${streamBuf.byteLength} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];
  const header = "%PDF-1.4\n";
  let body = header;
  const offsets: number[] = [];
  for (const o of objects) {
    offsets.push(Buffer.byteLength(body, "ascii"));
    body += o;
  }
  const xrefOffset = Buffer.byteLength(body, "ascii");
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (const off of offsets) {
    xref += off.toString().padStart(10, "0") + " 00000 n \n";
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body + xref + trailer, "ascii");
}
