import { describe, it, expect } from "vitest";
import type { IncomingMessage } from "node:http";
import { MCP_ERROR_CATEGORY_CATALOG, categorizeError, readIdempotencyKey, type ErrorCategory } from "./mcp-runtime.js";

// H-Phase-A cycle 5: the REAL exhaustiveness guarantee for MCP_ERROR_CATEGORY_CATALOG
// now lives in mcp-runtime.ts's MCP_ERROR_CATEGORY_SET (a genuine Record<ErrorCategory,
// ...>, checked by every tsc run since it's a normal source file, not excluded like
// this .test.ts is) — this hand-typed list is a secondary, independent runtime
// double-check, not the source of truth.
const ALL_CATEGORIES: ErrorCategory[] = ["auth", "validation", "quota", "tier_limit", "external", "internal"];

// H8.3 — mutation-lite kill: no other suite exercises the exact 255-char cap on
// readIdempotencyKey, so a boundary flip (`length > 255` -> `length >= 255`)
// would silently start rejecting legitimate max-length keys.
function reqWithIdempotencyKey(key: string | undefined): IncomingMessage {
  return { headers: key === undefined ? {} : { "idempotency-key": key } } as unknown as IncomingMessage;
}

describe("readIdempotencyKey — 255-char cap (H8.3)", () => {
  it("accepts a key at exactly the 255-char cap (inclusive boundary)", () => {
    const key255 = "a".repeat(255);
    expect(readIdempotencyKey(reqWithIdempotencyKey(key255))).toBe(key255);
  });

  it("rejects a key one character past the cap (256 chars)", () => {
    const key256 = "a".repeat(256);
    expect(readIdempotencyKey(reqWithIdempotencyKey(key256))).toBeNull();
  });

  it("returns null when no header is present", () => {
    expect(readIdempotencyKey(reqWithIdempotencyKey(undefined))).toBeNull();
  });
});

describe("MCP_ERROR_CATEGORY_CATALOG (H4.2)", () => {
  it("documents exactly the 6 ErrorCategory union members, no more, no less", () => {
    const catalogCodes = MCP_ERROR_CATEGORY_CATALOG.map((c) => c.code).sort();
    expect(catalogCodes).toEqual([...ALL_CATEGORIES].sort());
  });

  it("every entry has a non-empty description", () => {
    for (const entry of MCP_ERROR_CATEGORY_CATALOG) {
      expect(entry.description.length, `${entry.code} has an empty description`).toBeGreaterThan(0);
    }
  });

  it("retryable flags match categorizeError's real hardcoded return values", () => {
    // categorizeError itself can't be introspected (it's a regex chain), so this pins the
    // catalog's retryable claims against one representative message per category — if a
    // future edit to categorizeError changes what a category returns, this fails alongside
    // the doc-facing catalog going stale.
    const samples: Record<ErrorCategory, string> = {
      auth: "Authentication required",
      tier_limit: "Payment required for this program",
      quota: "Quota exceeded for this month",
      validation: "project_name is required",
      external: "GitHub fetch failed",
      internal: "Something unexpected happened",
    };
    for (const entry of MCP_ERROR_CATEGORY_CATALOG) {
      const real = categorizeError(samples[entry.code]);
      expect(real.code, `sample message for ${entry.code} classified as ${real.code}`).toBe(entry.code);
      expect(real.retryable, `${entry.code}'s catalog retryable flag doesn't match categorizeError`).toBe(entry.retryable);
    }
  });
});
