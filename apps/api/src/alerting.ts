// ─── Threshold alerting on the emitted metrics ──────────────────
//
// The server already records request/error counters + latency histograms
// (metrics.ts) and exposes them at /v1/metrics, but nothing acted on them —
// PI-01 in the readiness scorecard ("alerting is the missing piece"). This adds
// a small, OPT-IN evaluator: every interval it diffs the cumulative counters over
// the window and POSTs a configurable webhook when the 5xx rate breaches a
// threshold. No ALERT_WEBHOOK_URL → it never starts (zero overhead).
//
// Design notes:
//   - Window DELTAS, not cumulative totals, so a fresh spike isn't diluted by
//     hours of prior clean traffic.
//   - Debounced: fire once on entering breach, then at most every ALERT_REALERT_MS
//     while still breaching; emit a one-shot "recovered" when it clears.
//   - The timer is unref()'d (never blocks process exit) and webhook failures are
//     swallowed (alerting must never crash the server).

import { getMetricsSnapshot } from "./metrics.js";
import { log } from "./logger.js";

export interface AlertThresholds {
  /** Fire when the window 5xx rate (%) exceeds this. */
  errorRatePct: number;
  /** Require at least this many requests in the window before alerting (avoids tiny-sample noise). */
  minSample: number;
}

export interface WindowResult {
  sample: number;
  errors: number;
  errorRatePct: number;
  breached: boolean;
}

export interface DebounceState {
  breaching: boolean;
  lastAlertAt: number;
}

type Counters = { requestCount: number; errorCount: number };

/**
 * Pure: window error rate from the delta between two cumulative snapshots, and
 * whether it breaches the threshold (only once the sample is large enough).
 */
export function evalErrorRate(prev: Counters, curr: Counters, t: AlertThresholds): WindowResult {
  const sample = Math.max(0, curr.requestCount - prev.requestCount);
  const errors = Math.max(0, curr.errorCount - prev.errorCount);
  const errorRatePct = sample > 0 ? (errors / sample) * 100 : 0;
  const breached = sample >= t.minSample && errorRatePct > t.errorRatePct;
  return { sample, errors, errorRatePct, breached };
}

/**
 * Pure: given the current breach + the prior debounce state, decide whether to
 * fire (entering breach, or re-alert interval elapsed) or emit a recovery notice.
 */
export function decideFire(
  breached: boolean,
  state: DebounceState,
  now: number,
  reAlertMs: number,
): { fire: boolean; resolved: boolean; next: DebounceState } {
  if (breached) {
    const fire = !state.breaching || now - state.lastAlertAt >= reAlertMs;
    return { fire, resolved: false, next: { breaching: true, lastAlertAt: fire ? now : state.lastAlertAt } };
  }
  return { fire: false, resolved: state.breaching, next: { breaching: false, lastAlertAt: state.lastAlertAt } };
}

// ─── Runner (impure: timer + webhook) ───────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;
let prev: Counters = { requestCount: 0, errorCount: 0 };
let state: DebounceState = { breaching: false, lastAlertAt: 0 };

async function postAlert(url: string, body: Record<string, unknown>): Promise<void> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5000);
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(to);
    }
  } catch (err) {
    log("warn", "alert_post_failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

/** Start the opt-in alerting evaluator. No-op (and no timer) without ALERT_WEBHOOK_URL. */
export function startAlerting(): void {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    log("info", "alerting_disabled", { reason: "ALERT_WEBHOOK_URL unset" });
    return;
  }
  if (timer) return;

  const intervalMs = Math.max(10_000, parseInt(process.env.ALERT_EVAL_INTERVAL_MS ?? "60000", 10));
  const reAlertMs = parseInt(process.env.ALERT_REALERT_MS ?? "900000", 10);
  const t: AlertThresholds = {
    errorRatePct: parseFloat(process.env.ALERT_ERROR_RATE_PCT ?? "5"),
    minSample: parseInt(process.env.ALERT_MIN_SAMPLE ?? "20", 10),
  };

  prev = getMetricsSnapshot(); // seed the baseline so the first window starts clean
  state = { breaching: false, lastAlertAt: 0 };

  timer = setInterval(() => {
    const now = Date.now();
    const curr = getMetricsSnapshot();
    const r = evalErrorRate(prev, curr, t);
    prev = curr;
    const d = decideFire(r.breached, state, now, reAlertMs);
    state = d.next;
    if (d.fire) {
      void postAlert(url, {
        service: "axis-api",
        kind: "error_rate_high",
        error_rate_pct: Number(r.errorRatePct.toFixed(1)),
        threshold_pct: t.errorRatePct,
        errors: r.errors,
        requests: r.sample,
        window_ms: intervalMs,
        ts: new Date(now).toISOString(),
      });
    } else if (d.resolved) {
      void postAlert(url, { service: "axis-api", kind: "error_rate_recovered", ts: new Date(now).toISOString() });
    }
  }, intervalMs);
  (timer as { unref?: () => void }).unref?.();

  log("info", "alerting_enabled", { interval_ms: intervalMs, error_rate_pct: t.errorRatePct, min_sample: t.minSample });
}

/** Stop the evaluator + reset state (used on shutdown and in tests). */
export function stopAlerting(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  state = { breaching: false, lastAlertAt: 0 };
}
