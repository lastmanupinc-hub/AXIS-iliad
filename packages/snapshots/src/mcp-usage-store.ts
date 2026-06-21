import { randomUUID } from "node:crypto";
import { getDb, peekDb } from "./db.js";

// ─── Types ──────────────────────────────────────────────────────

export interface McpUsageInput {
  /** account_id when the caller is authenticated, null for anonymous free-tool calls */
  account_id: string | null;
  tool: string;
  /** derived client (claude, cursor, copilot, …); see detectMcpSource in mcp-server */
  source?: string;
  /** coarse probe classification (quality-agent, registry-crawler, …) */
  probe_class?: string;
  user_agent?: string;
}

export interface McpUsageRow {
  usage_id: string;
  account_id: string | null;
  tool: string;
  source: string;
  probe_class: string;
  user_agent: string;
  created_at: string;
}

export interface McpUsageWindows {
  total: number;
  last_24h: number;
  last_7d: number;
  last_30d: number;
}

export interface McpUsageSummary {
  since: string;
  window_days: number;
  total_calls: number;
  unique_accounts: number;
  anonymous_calls: number;
  by_tool: Record<string, number>;
  by_source: Record<string, number>;
  by_probe_class: Record<string, number>;
}

export interface McpNewVsReturning {
  window_days: number;
  new_accounts: number;
  returning_accounts: number;
}

// ─── Helpers ────────────────────────────────────────────────────

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

// ─── Write ──────────────────────────────────────────────────────

/**
 * Fire-and-forget telemetry insert for one MCP tool call.
 *
 * Uses peekDb() so it NEVER lazily opens a database — if no handle is open it
 * is a silent no-op. Callers on the hot request path should still wrap this in
 * try/catch: persistence telemetry must never break or slow a tool call.
 */
export function recordMcpUsage(input: McpUsageInput): void {
  const d = peekDb();
  if (!d) return;
  d.prepare(
    `INSERT INTO mcp_usage (usage_id, account_id, tool, source, probe_class, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    input.account_id,
    input.tool,
    input.source ?? "unknown",
    input.probe_class ?? "unknown",
    input.user_agent ?? "",
    new Date().toISOString(),
  );
}

// ─── Read / analytics ───────────────────────────────────────────

/** Rolling-window call totals (daily / weekly / monthly + all-time). */
export function getMcpUsageWindows(): McpUsageWindows {
  const d = getDb();
  const count = (sql: string, ...args: unknown[]): number =>
    (d.prepare(sql).get(...args) as { c: number }).c;
  return {
    total: count("SELECT COUNT(*) c FROM mcp_usage"),
    last_24h: count("SELECT COUNT(*) c FROM mcp_usage WHERE created_at >= ?", sinceIso(1)),
    last_7d: count("SELECT COUNT(*) c FROM mcp_usage WHERE created_at >= ?", sinceIso(7)),
    last_30d: count("SELECT COUNT(*) c FROM mcp_usage WHERE created_at >= ?", sinceIso(30)),
  };
}

/** Aggregate breakdown of calls in the trailing window (default 30 days). */
export function getMcpUsageSummary(options?: { windowDays?: number }): McpUsageSummary {
  const windowDays = options?.windowDays ?? 30;
  const since = sinceIso(windowDays);
  const d = getDb();

  const scalar = (sql: string): number =>
    (d.prepare(sql).get(since) as { c: number }).c;

  // col is from a fixed internal set below — never user input — so the
  // template interpolation is injection-safe.
  const groupBy = (col: "tool" | "source" | "probe_class"): Record<string, number> => {
    const rows = d
      .prepare(
        `SELECT ${col} AS k, COUNT(*) AS c FROM mcp_usage WHERE created_at >= ? GROUP BY ${col} ORDER BY c DESC`,
      )
      .all(since) as { k: string | null; c: number }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.k ?? "unknown"] = r.c;
    return out;
  };

  return {
    since,
    window_days: windowDays,
    total_calls: scalar("SELECT COUNT(*) c FROM mcp_usage WHERE created_at >= ?"),
    unique_accounts: scalar(
      "SELECT COUNT(DISTINCT account_id) c FROM mcp_usage WHERE created_at >= ? AND account_id IS NOT NULL",
    ),
    anonymous_calls: scalar(
      "SELECT COUNT(*) c FROM mcp_usage WHERE created_at >= ? AND account_id IS NULL",
    ),
    by_tool: groupBy("tool"),
    by_source: groupBy("source"),
    by_probe_class: groupBy("probe_class"),
  };
}

/**
 * New vs returning authenticated callers active in the trailing window.
 * "New" = account whose first-ever call falls inside the window; "returning" =
 * active in the window but first seen before it. Anonymous calls are excluded
 * (no stable identity).
 */
export function getMcpUsageNewVsReturning(options?: { windowDays?: number }): McpNewVsReturning {
  const windowDays = options?.windowDays ?? 30;
  const since = sinceIso(windowDays);
  const rows = getDb()
    .prepare(
      `SELECT account_id,
              MIN(created_at) AS first_seen,
              MAX(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS active_in_window
       FROM mcp_usage
       WHERE account_id IS NOT NULL
       GROUP BY account_id`,
    )
    .all(since) as { account_id: string; first_seen: string; active_in_window: number }[];

  let newAccounts = 0;
  let returningAccounts = 0;
  for (const r of rows) {
    if (r.active_in_window !== 1) continue;
    if (r.first_seen >= since) newAccounts++;
    else returningAccounts++;
  }
  return { window_days: windowDays, new_accounts: newAccounts, returning_accounts: returningAccounts };
}

/** Most recent telemetry rows (newest first) — for admin inspection. */
export function getRecentMcpUsage(limit = 50): McpUsageRow[] {
  return getDb()
    .prepare("SELECT * FROM mcp_usage ORDER BY created_at DESC, rowid DESC LIMIT ?")
    .all(limit) as McpUsageRow[];
}
