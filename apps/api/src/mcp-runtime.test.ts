import { describe, it, expect } from "vitest";
import { MCP_ERROR_CATEGORY_CATALOG, categorizeError, type ErrorCategory } from "./mcp-runtime.js";

const ALL_CATEGORIES: ErrorCategory[] = ["auth", "validation", "quota", "tier_limit", "external", "internal"];

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
