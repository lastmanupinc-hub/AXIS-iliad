import { describe, it, expect } from "vitest";
import { TIER_LIMITS, exceedsFileSizeLimit, exceedsFileCountLimit } from "./billing-types.js";

// Hub-and-spoke pricing correction: paid/suite dropped their file-count and
// file-size caps entirely (differentiator moved to max_snapshots_per_month),
// free's cap was raised from 5MB/1000 files to 50MB/2000. Every enforcement
// site across handlers.ts and mcp-tool-impls.ts reads -1 through these two
// functions rather than comparing against the raw limit directly — a naive
// `size > limit` comparison rejects EVERY file once limit is -1, since any
// real size is > -1. This is the one place that invariant is guaranteed.

describe("exceedsFileSizeLimit", () => {
  it("-1 never exceeds, regardless of size", () => {
    expect(exceedsFileSizeLimit(0, -1)).toBe(false);
    expect(exceedsFileSizeLimit(1, -1)).toBe(false);
    expect(exceedsFileSizeLimit(Number.MAX_SAFE_INTEGER, -1)).toBe(false);
  });

  it("a real limit is enforced normally", () => {
    expect(exceedsFileSizeLimit(100, 100)).toBe(false); // exactly at the limit
    expect(exceedsFileSizeLimit(101, 100)).toBe(true);
    expect(exceedsFileSizeLimit(99, 100)).toBe(false);
  });
});

describe("exceedsFileCountLimit", () => {
  it("-1 never exceeds, regardless of count", () => {
    expect(exceedsFileCountLimit(0, -1)).toBe(false);
    expect(exceedsFileCountLimit(1, -1)).toBe(false);
    expect(exceedsFileCountLimit(Number.MAX_SAFE_INTEGER, -1)).toBe(false);
  });

  it("a real limit is enforced normally", () => {
    expect(exceedsFileCountLimit(100, 100)).toBe(false);
    expect(exceedsFileCountLimit(101, 100)).toBe(true);
    expect(exceedsFileCountLimit(99, 100)).toBe(false);
  });
});

describe("TIER_LIMITS — hub-and-spoke pricing correction", () => {
  it("free is 50MB / 2000 files", () => {
    expect(TIER_LIMITS.free.max_file_size_bytes).toBe(50 * 1024 * 1024);
    expect(TIER_LIMITS.free.max_files_per_snapshot).toBe(2000);
  });

  it("paid and suite both have no file-count or file-size cap", () => {
    expect(TIER_LIMITS.paid.max_file_size_bytes).toBe(-1);
    expect(TIER_LIMITS.paid.max_files_per_snapshot).toBe(-1);
    expect(TIER_LIMITS.suite.max_file_size_bytes).toBe(-1);
    expect(TIER_LIMITS.suite.max_files_per_snapshot).toBe(-1);
  });

  it("paid and suite still differ on rescan volume — the actual differentiator", () => {
    expect(TIER_LIMITS.paid.max_snapshots_per_month).toBe(200);
    expect(TIER_LIMITS.suite.max_snapshots_per_month).toBe(-1);
    expect(TIER_LIMITS.suite.max_snapshots_per_month).not.toBe(TIER_LIMITS.paid.max_snapshots_per_month);
  });
});
