import { describe, it, expect, beforeEach } from "vitest";
import {
  captureEvent,
  captureEvents,
  queryAnalytics,
  countAnalyticsEvents,
  deleteAnalyticsNamespace,
  scopeAnalyticsNamespace,
  resetAnalyticsForTests,
  type AnalyticsCountResult,
  type AnalyticsCountByEventResult,
  type AnalyticsDistinctUsersResult,
  type AnalyticsCountByBucketResult,
} from "./analytics.js";

describe("analytics — captureEvent", () => {
  beforeEach(() => resetAnalyticsForTests());

  it("inserts a single event and increments count", () => {
    captureEvent("ns1", { event: "pageview" });
    expect(countAnalyticsEvents("ns1")).toBe(1);
  });

  it("returns the new row id", () => {
    const id1 = captureEvent("ns1", { event: "pageview" });
    const id2 = captureEvent("ns1", { event: "pageview" });
    expect(id2).toBeGreaterThan(id1);
  });

  it("rejects missing event name", () => {
    expect(() => captureEvent("ns1", { event: "" })).toThrow(/non-empty/);
  });

  it("rejects oversized event name", () => {
    expect(() => captureEvent("ns1", { event: "a".repeat(201) })).toThrow(/200 chars/);
  });

  it("rejects missing namespace", () => {
    expect(() => captureEvent("", { event: "pageview" })).toThrow(/namespace is required/);
  });

  it("rejects array as properties (must be plain object)", () => {
    expect(() =>
      captureEvent("ns1", { event: "x", properties: [] as unknown as Record<string, unknown> }),
    ).toThrow(/plain object/);
  });

  it("rejects oversized properties JSON", () => {
    const big = { blob: "x".repeat(300_000) };
    expect(() => captureEvent("ns1", { event: "x", properties: big })).toThrow(/256 KiB/);
  });

  it("uses provided timestamp when given", () => {
    captureEvent("ns1", { event: "x", timestamp: 1_700_000_000_000 });
    const r = queryAnalytics("ns1", {
      kind: "count",
      from_ts: 1_700_000_000_000,
      to_ts: 1_700_000_000_001,
    }) as AnalyticsCountResult;
    expect(r.total).toBe(1);
  });
});

describe("analytics — captureEvents (batch)", () => {
  beforeEach(() => resetAnalyticsForTests());

  it("inserts every event in the batch", () => {
    captureEvents("ns1", [
      { event: "a" },
      { event: "b" },
      { event: "c" },
    ]);
    expect(countAnalyticsEvents("ns1")).toBe(3);
  });

  it("rolls back on a single malformed event (transactional)", () => {
    expect(() =>
      captureEvents("ns1", [
        { event: "a" },
        { event: "" },
        { event: "c" },
      ]),
    ).toThrow();
    expect(countAnalyticsEvents("ns1")).toBe(0);
  });

  it("rejects empty batch", () => {
    expect(() => captureEvents("ns1", [])).toThrow(/non-empty/);
  });
});

describe("analytics — queryAnalytics count", () => {
  beforeEach(() => resetAnalyticsForTests());

  it("totals all events in namespace when no filter", () => {
    captureEvents("ns1", [{ event: "a" }, { event: "b" }, { event: "a" }]);
    const r = queryAnalytics("ns1", { kind: "count" }) as AnalyticsCountResult;
    expect(r.total).toBe(3);
  });

  it("filters by event name", () => {
    captureEvents("ns1", [{ event: "a" }, { event: "b" }, { event: "a" }]);
    const r = queryAnalytics("ns1", { kind: "count", event: "a" }) as AnalyticsCountResult;
    expect(r.total).toBe(2);
  });

  it("applies time range (inclusive lower, exclusive upper)", () => {
    captureEvent("ns1", { event: "x", timestamp: 100 });
    captureEvent("ns1", { event: "x", timestamp: 200 });
    captureEvent("ns1", { event: "x", timestamp: 300 });
    const r = queryAnalytics("ns1", { kind: "count", from_ts: 100, to_ts: 300 }) as AnalyticsCountResult;
    expect(r.total).toBe(2);
  });

  it("applies property_filter (exact match on top-level keys)", () => {
    captureEvent("ns1", { event: "x", properties: { plan: "pro" } });
    captureEvent("ns1", { event: "x", properties: { plan: "free" } });
    captureEvent("ns1", { event: "x", properties: { plan: "pro" } });
    const r = queryAnalytics("ns1", {
      kind: "count",
      property_filter: { plan: "pro" },
    }) as AnalyticsCountResult;
    expect(r.total).toBe(2);
  });
});

describe("analytics — queryAnalytics count_by_event", () => {
  beforeEach(() => resetAnalyticsForTests());

  it("groups counts by event, sorted desc with deterministic tiebreak", () => {
    captureEvents("ns1", [
      { event: "click" },
      { event: "click" },
      { event: "click" },
      { event: "view" },
      { event: "view" },
      { event: "purchase" },
    ]);
    const r = queryAnalytics("ns1", { kind: "count_by_event" }) as AnalyticsCountByEventResult;
    expect(r.rows).toEqual([
      { event: "click", count: 3 },
      { event: "view", count: 2 },
      { event: "purchase", count: 1 },
    ]);
  });

  it("respects limit", () => {
    captureEvents("ns1", [{ event: "a" }, { event: "b" }, { event: "c" }]);
    const r = queryAnalytics("ns1", { kind: "count_by_event", limit: 2 }) as AnalyticsCountByEventResult;
    expect(r.rows).toHaveLength(2);
  });

  it("clamps limit to MAX_LIMIT (1000)", () => {
    captureEvent("ns1", { event: "a" });
    // No throw — just verify the call accepts an oversized limit.
    const r = queryAnalytics("ns1", { kind: "count_by_event", limit: 999_999 }) as AnalyticsCountByEventResult;
    expect(r.rows).toHaveLength(1);
  });
});

describe("analytics — queryAnalytics distinct_users", () => {
  beforeEach(() => resetAnalyticsForTests());

  it("counts distinct user_ids only", () => {
    captureEvents("ns1", [
      { event: "x", user_id: "u1" },
      { event: "x", user_id: "u1" },
      { event: "x", user_id: "u2" },
      { event: "x" },
    ]);
    const r = queryAnalytics("ns1", { kind: "distinct_users" }) as AnalyticsDistinctUsersResult;
    expect(r.distinct_users).toBe(2);
  });

  it("respects event filter", () => {
    captureEvents("ns1", [
      { event: "view", user_id: "u1" },
      { event: "purchase", user_id: "u2" },
    ]);
    const r = queryAnalytics("ns1", {
      kind: "distinct_users",
      event: "purchase",
    }) as AnalyticsDistinctUsersResult;
    expect(r.distinct_users).toBe(1);
  });

  it("respects property_filter", () => {
    captureEvents("ns1", [
      { event: "x", user_id: "u1", properties: { plan: "pro" } },
      { event: "x", user_id: "u2", properties: { plan: "free" } },
      { event: "x", user_id: "u3", properties: { plan: "pro" } },
    ]);
    const r = queryAnalytics("ns1", {
      kind: "distinct_users",
      property_filter: { plan: "pro" },
    }) as AnalyticsDistinctUsersResult;
    expect(r.distinct_users).toBe(2);
  });
});

describe("analytics — queryAnalytics count_by_bucket", () => {
  beforeEach(() => resetAnalyticsForTests());

  it("buckets into days by default", () => {
    // Two events on day 1, one on day 2.
    captureEvent("ns1", { event: "x", timestamp: 86_400_000 + 1_000 });
    captureEvent("ns1", { event: "x", timestamp: 86_400_000 + 2_000 });
    captureEvent("ns1", { event: "x", timestamp: 86_400_000 * 2 + 5_000 });
    const r = queryAnalytics("ns1", { kind: "count_by_bucket" }) as AnalyticsCountByBucketResult;
    expect(r.bucket).toBe("day");
    expect(r.rows).toEqual([
      { bucket_start: 86_400_000, count: 2 },
      { bucket_start: 86_400_000 * 2, count: 1 },
    ]);
  });

  it("supports hour buckets", () => {
    captureEvent("ns1", { event: "x", timestamp: 3_600_000 + 100 });
    captureEvent("ns1", { event: "x", timestamp: 3_600_000 + 200 });
    captureEvent("ns1", { event: "x", timestamp: 3_600_000 * 2 + 50 });
    const r = queryAnalytics("ns1", { kind: "count_by_bucket", bucket: "hour" }) as AnalyticsCountByBucketResult;
    expect(r.bucket).toBe("hour");
    expect(r.rows).toEqual([
      { bucket_start: 3_600_000, count: 2 },
      { bucket_start: 3_600_000 * 2, count: 1 },
    ]);
  });

  it("supports minute buckets", () => {
    captureEvent("ns1", { event: "x", timestamp: 60_000 + 100 });
    captureEvent("ns1", { event: "x", timestamp: 120_000 + 100 });
    const r = queryAnalytics("ns1", { kind: "count_by_bucket", bucket: "minute" }) as AnalyticsCountByBucketResult;
    expect(r.rows).toEqual([
      { bucket_start: 60_000, count: 1 },
      { bucket_start: 120_000, count: 1 },
    ]);
  });

  it("combines bucket + property_filter", () => {
    captureEvent("ns1", { event: "x", timestamp: 86_400_000, properties: { plan: "pro" } });
    captureEvent("ns1", { event: "x", timestamp: 86_400_000, properties: { plan: "free" } });
    captureEvent("ns1", { event: "x", timestamp: 86_400_000 * 2, properties: { plan: "pro" } });
    const r = queryAnalytics("ns1", {
      kind: "count_by_bucket",
      property_filter: { plan: "pro" },
    }) as AnalyticsCountByBucketResult;
    expect(r.rows).toEqual([
      { bucket_start: 86_400_000, count: 1 },
      { bucket_start: 86_400_000 * 2, count: 1 },
    ]);
  });
});

describe("analytics — namespace isolation", () => {
  beforeEach(() => resetAnalyticsForTests());

  it("events from one namespace are invisible to another", () => {
    captureEvent("ns_a", { event: "x" });
    captureEvent("ns_a", { event: "x" });
    captureEvent("ns_b", { event: "x" });
    expect(countAnalyticsEvents("ns_a")).toBe(2);
    expect(countAnalyticsEvents("ns_b")).toBe(1);
    const ra = queryAnalytics("ns_a", { kind: "count" }) as AnalyticsCountResult;
    const rb = queryAnalytics("ns_b", { kind: "count" }) as AnalyticsCountResult;
    expect(ra.total).toBe(2);
    expect(rb.total).toBe(1);
  });

  it("deleteAnalyticsNamespace only deletes the targeted namespace", () => {
    captureEvent("ns_a", { event: "x" });
    captureEvent("ns_b", { event: "x" });
    const removed = deleteAnalyticsNamespace("ns_a");
    expect(removed).toBe(1);
    expect(countAnalyticsEvents("ns_a")).toBe(0);
    expect(countAnalyticsEvents("ns_b")).toBe(1);
  });
});

describe("analytics — scopeAnalyticsNamespace", () => {
  it("prefixes namespace with account id", () => {
    expect(scopeAnalyticsNamespace("acct_123", "events")).toBe("acct:acct_123:events");
  });

  it("defaults missing namespace to 'default'", () => {
    expect(scopeAnalyticsNamespace("acct_123", undefined)).toBe("acct:acct_123:default");
  });

  it("rejects empty account id", () => {
    expect(() => scopeAnalyticsNamespace("", "x")).toThrow(/account_id is required/);
  });

  it("rejects path-traversal segments", () => {
    expect(() => scopeAnalyticsNamespace("a", "../bad")).toThrow(/must not contain/);
    expect(() => scopeAnalyticsNamespace("a", "x/y")).toThrow(/must not contain/);
    expect(() => scopeAnalyticsNamespace("a", "x\\y")).toThrow(/must not contain/);
  });

  it("rejects oversized namespace", () => {
    expect(() => scopeAnalyticsNamespace("a", "n".repeat(201))).toThrow(/200 chars/);
  });

  it("isolates two accounts even when they use the same logical namespace", () => {
    resetAnalyticsForTests();
    const nsA = scopeAnalyticsNamespace("acct_a", "events");
    const nsB = scopeAnalyticsNamespace("acct_b", "events");
    captureEvent(nsA, { event: "purchase" });
    captureEvent(nsB, { event: "purchase" });
    captureEvent(nsB, { event: "purchase" });
    expect(countAnalyticsEvents(nsA)).toBe(1);
    expect(countAnalyticsEvents(nsB)).toBe(2);
  });
});
