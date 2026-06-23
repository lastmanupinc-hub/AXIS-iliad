// ─── iliad_analytics — Postgres-backed product analytics ─────────
//
// AXIS-owned implementation of the analytics capability. Uses the
// existing @axis/snapshots Postgres database (no new dependency) with a
// dedicated `analytics_events` table. Each row stores one captured
// event with namespace, name, properties (JSON), optional user_id, and
// a unix-ms timestamp. Queries are aggregations expressed as plain SQL
// — count, count-by-event, distinct-users, time-bucketed counts —
// returned in deterministic order.
//
// Future upgrade path: replace this module with a ClickHouse or DuckDB
// backend when scan volume justifies the columnar engine. Exported
// function signatures stay stable across the swap; only internals
// change.

import { sql, pgPlaceholders } from "@axis/snapshots";

export interface AnalyticsEvent {
  /** Event name (e.g. "pageview", "purchase"). 1-200 chars. */
  event: string;
  /** Optional user id. Free-form string up to 200 chars. */
  user_id?: string;
  /** Arbitrary structured properties stored as JSON. */
  properties?: Record<string, unknown>;
  /** Unix epoch milliseconds. Defaults to capture time. */
  timestamp?: number;
}

export type AnalyticsQueryKind =
  | "count"
  | "count_by_event"
  | "distinct_users"
  | "count_by_bucket";

export interface AnalyticsQuery {
  kind: AnalyticsQueryKind;
  /** Restrict to a single event name. Applies to all kinds. */
  event?: string;
  /** Inclusive lower bound (unix ms). */
  from_ts?: number;
  /** Exclusive upper bound (unix ms). */
  to_ts?: number;
  /** Property exact-match filter (top-level keys only). */
  property_filter?: Record<string, unknown>;
  /** Bucket size for count_by_bucket. One of: minute, hour, day. Defaults to "day". */
  bucket?: "minute" | "hour" | "day";
  /** Cap on rows returned for count_by_event and count_by_bucket. Defaults 100, max 1000. */
  limit?: number;
}

export interface AnalyticsCountResult {
  kind: "count";
  total: number;
}

export interface AnalyticsCountByEventRow {
  event: string;
  count: number;
}

export interface AnalyticsCountByEventResult {
  kind: "count_by_event";
  rows: AnalyticsCountByEventRow[];
}

export interface AnalyticsDistinctUsersResult {
  kind: "distinct_users";
  distinct_users: number;
}

export interface AnalyticsCountByBucketRow {
  bucket_start: number;
  count: number;
}

export interface AnalyticsCountByBucketResult {
  kind: "count_by_bucket";
  bucket: "minute" | "hour" | "day";
  rows: AnalyticsCountByBucketRow[];
}

export type AnalyticsQueryResult =
  | AnalyticsCountResult
  | AnalyticsCountByEventResult
  | AnalyticsDistinctUsersResult
  | AnalyticsCountByBucketResult;

let initialized = false;

async function ensureSchema(): Promise<void> {
  if (initialized) return;
  await sql.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      namespace   TEXT NOT NULL,
      event       TEXT NOT NULL,
      user_id     TEXT,
      properties  TEXT,
      ts          BIGINT NOT NULL,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_ns_ts ON analytics_events(namespace, ts);
    CREATE INDEX IF NOT EXISTS idx_analytics_ns_event ON analytics_events(namespace, event);
  `);
  initialized = true;
}

/** Test-only helper. Drops the table and resets the lazy-init flag. */
export async function resetAnalyticsForTests(): Promise<void> {
  await sql.exec("DROP TABLE IF EXISTS analytics_events;");
  initialized = false;
}

// ─── Capture ────────────────────────────────────────────────────

const INSERT_EVENT_SQL =
  "INSERT INTO analytics_events (namespace, event, user_id, properties, ts, created_at) VALUES (?, ?, ?, ?, ?, ?)";

/**
 * Validate one event and produce the positional INSERT params. Throws with the
 * same messages the public captureEvent contract has always used. Shared by the
 * single and batch insert paths so the batch can run inside one transaction.
 */
function buildEventRow(namespace: string, event: AnalyticsEvent): unknown[] {
  if (!namespace || typeof namespace !== "string") {
    throw new Error("captureEvent: namespace is required");
  }
  if (!event || typeof event !== "object") {
    throw new Error("captureEvent: event payload is required");
  }
  if (typeof event.event !== "string" || event.event.length === 0) {
    throw new Error("captureEvent: event.event must be a non-empty string");
  }
  if (event.event.length > 200) {
    throw new Error("captureEvent: event.event exceeds 200 chars");
  }
  if (event.user_id !== undefined) {
    if (typeof event.user_id !== "string" || event.user_id.length === 0) {
      throw new Error("captureEvent: user_id must be a non-empty string when provided");
    }
    if (event.user_id.length > 200) {
      throw new Error("captureEvent: user_id exceeds 200 chars");
    }
  }
  const ts = typeof event.timestamp === "number" && Number.isFinite(event.timestamp)
    ? Math.floor(event.timestamp)
    : Date.now();

  let propsJson: string | null = null;
  if (event.properties !== undefined) {
    if (typeof event.properties !== "object" || Array.isArray(event.properties)) {
      throw new Error("captureEvent: properties must be a plain object");
    }
    propsJson = JSON.stringify(event.properties);
    // 256 KiB cap so a single event can't bloat the DB.
    if (propsJson.length > 262144) {
      throw new Error("captureEvent: properties JSON exceeds 256 KiB");
    }
  }

  return [namespace, event.event, event.user_id ?? null, propsJson, ts, new Date().toISOString()];
}

export async function captureEvent(namespace: string, event: AnalyticsEvent): Promise<number> {
  const params = buildEventRow(namespace, event);
  await ensureSchema();
  const r = await sql.run(`${INSERT_EVENT_SQL} RETURNING id`, params);
  return Number((r.rows[0] as { id: number | string }).id);
}

/** Batch capture. Transactional — partial inserts never persist. */
export async function captureEvents(namespace: string, events: AnalyticsEvent[]): Promise<number> {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error("captureEvents: events[] must be a non-empty array");
  }
  // Validate every row up front so a malformed event aborts the whole batch
  // before any insert, matching the original transactional contract.
  const rows = events.map((e) => buildEventRow(namespace, e));
  await ensureSchema();
  await sql.tx(async (client) => {
    for (const params of rows) {
      await client.query(pgPlaceholders(INSERT_EVENT_SQL), params);
    }
  });
  return events.length;
}

// ─── Query ──────────────────────────────────────────────────────

const MAX_LIMIT = 1000;

interface WhereClause {
  sql: string;
  params: unknown[];
}

function buildWhere(namespace: string, q: AnalyticsQuery): WhereClause {
  const parts: string[] = ["namespace = ?"];
  const params: unknown[] = [namespace];
  if (q.event !== undefined) {
    if (typeof q.event !== "string" || q.event.length === 0) {
      throw new Error("query: event filter must be a non-empty string");
    }
    parts.push("event = ?");
    params.push(q.event);
  }
  if (q.from_ts !== undefined) {
    if (!Number.isFinite(q.from_ts)) throw new Error("query: from_ts must be a finite number");
    parts.push("ts >= ?");
    params.push(Math.floor(q.from_ts));
  }
  if (q.to_ts !== undefined) {
    if (!Number.isFinite(q.to_ts)) throw new Error("query: to_ts must be a finite number");
    parts.push("ts < ?");
    params.push(Math.floor(q.to_ts));
  }
  return { sql: parts.join(" AND "), params };
}

function clampLimit(raw: unknown): number {
  const limit = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 100;
  if (limit <= 0) return 100;
  return Math.min(limit, MAX_LIMIT);
}

function matchesPropertyFilter(
  propsJson: string | null,
  filter: Record<string, unknown>,
): boolean {
  if (!propsJson) return false;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(propsJson) as Record<string, unknown>;
  } catch {
    return false;
  }
  for (const [k, expected] of Object.entries(filter)) {
    if (parsed[k] !== expected) return false;
  }
  return true;
}

function bucketWidthMs(b: "minute" | "hour" | "day"): number {
  if (b === "minute") return 60_000;
  if (b === "hour") return 3_600_000;
  return 86_400_000;
}

export async function queryAnalytics(
  namespace: string,
  q: AnalyticsQuery,
): Promise<AnalyticsQueryResult> {
  if (!namespace || typeof namespace !== "string") {
    throw new Error("queryAnalytics: namespace is required");
  }
  if (!q || typeof q !== "object") {
    throw new Error("queryAnalytics: query payload is required");
  }
  await ensureSchema();
  const where = buildWhere(namespace, q);

  // Property filter happens in JS because SQLite has no first-class JSON
  // index here; for the namespace+event prefilter most rows are already
  // pruned by the index, so the JS pass is bounded.
  const applyPropFilter =
    q.property_filter !== undefined && typeof q.property_filter === "object";
  if (applyPropFilter && Array.isArray(q.property_filter)) {
    throw new Error("queryAnalytics: property_filter must be an object");
  }

  if (q.kind === "count") {
    if (!applyPropFilter) {
      const row = await sql.one<{ c: number | string }>(
        `SELECT COUNT(*) AS c FROM analytics_events WHERE ${where.sql}`,
        where.params,
      );
      return { kind: "count", total: Number(row?.c ?? 0) };
    }
    const rows = await sql.many<{ properties: string | null }>(
      `SELECT properties FROM analytics_events WHERE ${where.sql}`,
      where.params,
    );
    let total = 0;
    for (const r of rows) {
      if (matchesPropertyFilter(r.properties, q.property_filter as Record<string, unknown>)) {
        total++;
      }
    }
    return { kind: "count", total };
  }

  if (q.kind === "distinct_users") {
    if (!applyPropFilter) {
      const row = await sql.one<{ c: number | string }>(
        `SELECT COUNT(DISTINCT user_id) AS c FROM analytics_events WHERE ${where.sql} AND user_id IS NOT NULL`,
        where.params,
      );
      return { kind: "distinct_users", distinct_users: Number(row?.c ?? 0) };
    }
    const rows = await sql.many<{ user_id: string; properties: string | null }>(
      `SELECT user_id, properties FROM analytics_events WHERE ${where.sql} AND user_id IS NOT NULL`,
      where.params,
    );
    const seen = new Set<string>();
    for (const r of rows) {
      if (matchesPropertyFilter(r.properties, q.property_filter as Record<string, unknown>)) {
        seen.add(r.user_id);
      }
    }
    return { kind: "distinct_users", distinct_users: seen.size };
  }

  if (q.kind === "count_by_event") {
    const limit = clampLimit(q.limit);
    if (!applyPropFilter) {
      const rows = await sql.many<{ event: string; c: number | string }>(
        `SELECT event, COUNT(*) AS c FROM analytics_events WHERE ${where.sql} GROUP BY event ORDER BY c DESC, event ASC LIMIT ?`,
        [...where.params, limit],
      );
      return {
        kind: "count_by_event",
        rows: rows.map((r) => ({ event: r.event, count: Number(r.c) })),
      };
    }
    const rows = await sql.many<{ event: string; properties: string | null }>(
      `SELECT event, properties FROM analytics_events WHERE ${where.sql}`,
      where.params,
    );
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (matchesPropertyFilter(r.properties, q.property_filter as Record<string, unknown>)) {
        counts.set(r.event, (counts.get(r.event) ?? 0) + 1);
      }
    }
    const sorted: AnalyticsCountByEventRow[] = Array.from(counts.entries())
      .map(([event, count]) => ({ event, count }))
      .sort((a, b) => (b.count - a.count) || (a.event < b.event ? -1 : a.event > b.event ? 1 : 0))
      .slice(0, limit);
    return { kind: "count_by_event", rows: sorted };
  }

  if (q.kind === "count_by_bucket") {
    const bucket = q.bucket ?? "day";
    if (bucket !== "minute" && bucket !== "hour" && bucket !== "day") {
      throw new Error("queryAnalytics: bucket must be minute, hour, or day");
    }
    const width = bucketWidthMs(bucket);
    const limit = clampLimit(q.limit);
    // Bucketing happens in JS to sidestep SQLite/JS double-binding quirks
    // around INTEGER vs REAL division. The namespace+ts index still
    // narrows the row set, so the JS pass is bounded.
    const rows = await sql.many<{ ts: number | string; properties: string | null }>(
      `SELECT ts, properties FROM analytics_events WHERE ${where.sql}`,
      where.params,
    );
    const counts = new Map<number, number>();
    for (const r of rows) {
      if (applyPropFilter) {
        if (!matchesPropertyFilter(r.properties, q.property_filter as Record<string, unknown>)) continue;
      }
      const key = Math.floor(Number(r.ts) / width) * width;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const sorted: AnalyticsCountByBucketRow[] = Array.from(counts.entries())
      .map(([bucket_start, count]) => ({ bucket_start, count }))
      .sort((a, b) => a.bucket_start - b.bucket_start)
      .slice(0, limit);
    return { kind: "count_by_bucket", bucket, rows: sorted };
  }

  throw new Error(`queryAnalytics: unknown query kind \"${String((q as { kind: unknown }).kind)}\"`);
}

// ─── Maintenance ────────────────────────────────────────────────

export async function deleteAnalyticsNamespace(namespace: string): Promise<number> {
  if (!namespace || typeof namespace !== "string") {
    throw new Error("deleteAnalyticsNamespace: namespace is required");
  }
  await ensureSchema();
  const r = await sql.run("DELETE FROM analytics_events WHERE namespace = ?", [namespace]);
  return r.rowCount;
}

export async function countAnalyticsEvents(namespace: string): Promise<number> {
  await ensureSchema();
  const row = await sql.one<{ c: number | string }>(
    "SELECT COUNT(*) AS c FROM analytics_events WHERE namespace = ?",
    [namespace],
  );
  return Number(row?.c ?? 0);
}

// ─── Namespace scoping ──────────────────────────────────────────

/**
 * Prefix a caller-supplied namespace with the account id so accounts cannot
 * read each other's events. Mirrors vector-db.scopeNamespace and
 * object-storage.scopeAccountKey — same defence-in-depth approach.
 */
export function scopeAnalyticsNamespace(
  account_id: string,
  raw_namespace: string | undefined,
): string {
  if (!account_id || typeof account_id !== "string") {
    throw new Error("scopeAnalyticsNamespace: account_id is required");
  }
  const ns = raw_namespace && raw_namespace.length > 0 ? raw_namespace : "default";
  if (ns.length > 200) {
    throw new Error("scopeAnalyticsNamespace: namespace exceeds 200 chars");
  }
  if (ns.includes("..") || ns.includes("/") || ns.includes("\\")) {
    throw new Error("scopeAnalyticsNamespace: namespace must not contain '..', '/', or '\\'");
  }
  return `acct:${account_id}:${ns}`;
}
