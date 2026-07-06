import type { IncomingMessage, ServerResponse } from "node:http";
import { getPgDbStats, pgIntegrityCheck } from "@axis/snapshots";
import { isShuttingDown } from "./router.js";

const startTime = Date.now();

// ─── Counters ───────────────────────────────────────────────────

let requestCount = 0;
let errorCount = 0;
const statusCounts: Record<string, number> = {};

export function recordRequest(statusCode: number): void {
  requestCount++;
  if (statusCode >= 500) errorCount++;
  const bucket = `${Math.floor(statusCode / 100)}xx`;
  statusCounts[bucket] = (statusCounts[bucket] ?? 0) + 1;
}

/** Point-in-time copy of the cumulative request counters (for the alerting evaluator). */
export function getMetricsSnapshot(): { requestCount: number; errorCount: number; statusCounts: Record<string, number> } {
  return { requestCount, errorCount, statusCounts: { ...statusCounts } };
}

// ─── Latency Histogram ─────────────────────────────────────────

const HISTOGRAM_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

interface HistogramEntry {
  buckets: number[];
  sum: number;
  count: number;
}

const routeHistograms = new Map<string, HistogramEntry>();

function normalizeRoute(path: string): string {
  // Strip query strings
  const base = path.split("?")[0];
  // Replace UUIDs with :id
  return base.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");
}

export function recordLatency(method: string, path: string, durationMs: number): void {
  const route = `${method} ${normalizeRoute(path)}`;
  let entry = routeHistograms.get(route);
  if (!entry) {
    entry = { buckets: new Array(HISTOGRAM_BUCKETS.length + 1).fill(0), sum: 0, count: 0 };
    routeHistograms.set(route, entry);
  }
  entry.sum += durationMs;
  entry.count++;
  let placed = false;
  for (let i = 0; i < HISTOGRAM_BUCKETS.length; i++) {
    if (durationMs <= HISTOGRAM_BUCKETS[i]) {
      entry.buckets[i]++;
      placed = true;
      break;
    }
  }
  // +Inf overflow (value exceeds all fixed buckets)
  if (!placed) {
    entry.buckets[HISTOGRAM_BUCKETS.length]++;
  }
}

export function getLatencyStats(): { routes: Map<string, HistogramEntry>; buckets: number[] } {
  return { routes: routeHistograms, buckets: HISTOGRAM_BUCKETS };
}

export function resetLatencyStats(): void {
  routeHistograms.clear();
}

// ─── Payment rail diagnostic (presence-only, NEVER the secret value) ────

export type PaymentRailStatus = "absent" | "test" | "live";

/**
 * Presence-only diagnostic for whether the Stripe payment rail is wired and
 * in which mode. Never returns (or logs) the actual secret value -- only a
 * derived literal based on the well-known Stripe key prefix.
 */
export function paymentRailStatus(): PaymentRailStatus {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) return "absent";
  if (k.startsWith("sk_live_") || k.startsWith("rk_live_")) return "live";
  return "test"; // sk_test_/rk_test_ or any other non-empty value treated as non-live
}

// ─── Readiness / Liveness ───────────────────────────────────────

export async function handleLiveness(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Liveness: is the process responsive?
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "alive" }));
}

export async function handleReadiness(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Readiness: is the service ready to accept traffic?
  // payment_rail is diagnostic-only -- absence degrades to a 429 on paid calls,
  // it is NOT an outage, so it must never gate `ready`.
  const shutting = isShuttingDown();
  const dbCheck = await pgIntegrityCheck();
  const ready = !shutting && dbCheck.success;

  res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: ready ? "ready" : "not_ready",
      checks: {
        shutting_down: shutting,
        database: dbCheck.success ? "ok" : "error",
        payment_rail: paymentRailStatus(),
      },
    }),
  );
}

// ─── Prometheus-compatible metrics ──────────────────────────────

export async function handleMetrics(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const mem = process.memoryUsage();
  const dbStats = await getPgDbStats();
  const tables = (dbStats.details?.tables ?? {}) as Record<string, number>;

  const lines: string[] = [];

  // Process metrics
  lines.push("# HELP axis_uptime_seconds Time since server start");
  lines.push("# TYPE axis_uptime_seconds gauge");
  lines.push(`axis_uptime_seconds ${uptime}`);

  lines.push("# HELP axis_requests_total Total HTTP requests");
  lines.push("# TYPE axis_requests_total counter");
  lines.push(`axis_requests_total ${requestCount}`);

  lines.push("# HELP axis_errors_total Total 5xx responses");
  lines.push("# TYPE axis_errors_total counter");
  lines.push(`axis_errors_total ${errorCount}`);

  for (const [bucket, count] of Object.entries(statusCounts)) {
    lines.push(`axis_http_responses_total{status="${bucket}"} ${count}`);
  }

  lines.push("# HELP axis_memory_rss_bytes Resident set size");
  lines.push("# TYPE axis_memory_rss_bytes gauge");
  lines.push(`axis_memory_rss_bytes ${mem.rss}`);

  lines.push("# HELP axis_memory_heap_used_bytes V8 heap used");
  lines.push("# TYPE axis_memory_heap_used_bytes gauge");
  lines.push(`axis_memory_heap_used_bytes ${mem.heapUsed}`);

  lines.push("# HELP axis_memory_heap_total_bytes V8 heap total");
  lines.push("# TYPE axis_memory_heap_total_bytes gauge");
  lines.push(`axis_memory_heap_total_bytes ${mem.heapTotal}`);

  // Database metrics
  if (dbStats.success) {
    const sizeBytes = dbStats.details.size_bytes as number;
    lines.push("# HELP axis_db_size_bytes Database file size");
    lines.push("# TYPE axis_db_size_bytes gauge");
    lines.push(`axis_db_size_bytes ${sizeBytes}`);

    for (const [table, count] of Object.entries(tables)) {
      lines.push(`axis_db_table_rows{table="${table}"} ${count}`);
    }
  }

  // Latency histograms
  const stats = getLatencyStats();
  if (stats.routes.size > 0) {
    lines.push("# HELP axis_http_request_duration_ms HTTP request duration in milliseconds");
    lines.push("# TYPE axis_http_request_duration_ms histogram");
    for (const [route, entry] of stats.routes) {
      const label = route.replace(/"/g, '\\"');
      let cumulative = 0;
      for (let i = 0; i < stats.buckets.length; i++) {
        cumulative += entry.buckets[i];
        lines.push(`axis_http_request_duration_ms_bucket{route="${label}",le="${stats.buckets[i]}"} ${cumulative}`);
      }
      cumulative += entry.buckets[stats.buckets.length]; // should already equal entry.count
      lines.push(`axis_http_request_duration_ms_bucket{route="${label}",le="+Inf"} ${entry.count}`);
      lines.push(`axis_http_request_duration_ms_sum{route="${label}"} ${entry.sum}`);
      lines.push(`axis_http_request_duration_ms_count{route="${label}"} ${entry.count}`);
    }
  }

  res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
  res.end(lines.join("\n") + "\n");
}
