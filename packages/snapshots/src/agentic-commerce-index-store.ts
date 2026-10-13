import { sql } from "./pg.js";

// ─── The agentic-commerce index: storage (pg-schema.ts v48) ─────
//
// Two concerns, both aggregate-only:
//
//   1. READ  — call counts grouped by (tool, agent_mode, budget_header) for a
//      half-open time window, straight out of mcp_usage. The query selects no
//      row-level column: no account_id, user_agent, source, usage_id or
//      timestamp ever leaves the database through this module.
//   2. CLAIM + PUBLISH — one row per published week in agentic_commerce_index.
//      The PRIMARY KEY on period_end is what makes the weekly computation run
//      once across every instance of the service.
//
// The share/rank/suppression arithmetic lives in apps/api
// (agentic-commerce-index.ts) because it needs the MCP tool catalog.

export interface McpUsageAggregate {
  tool: string;
  /** standard | lite | engineer, or null for calls recorded before v48. */
  agent_mode: string | null;
  /** Whether an X-Agent-Budget header was sent; null for calls recorded before v48. */
  budget_header: boolean | null;
  calls: number;
}

/**
 * Call counts for [fromIso, toIso), grouped by tool and the two v48 call
 * attributes. Only tools named in `tools` are counted (callers pass the
 * published catalog, so a scanner's made-up tool names never reach the
 * index), and calls whose probe_class is in `excludeProbeClasses` are left
 * out (registry crawlers and quality-scoring agents are not usage).
 */
export async function aggregateMcpUsageForIndex(
  fromIso: string,
  toIso: string,
  opts: { tools: readonly string[]; excludeProbeClasses: readonly string[] },
): Promise<McpUsageAggregate[]> {
  if (opts.tools.length === 0) return [];
  const rows = await sql.many<{
    tool: string;
    agent_mode: string | null;
    budget_header: boolean | null;
    calls: string | number;
  }>(
    `SELECT tool, agent_mode, budget_header, COUNT(*) AS calls
       FROM mcp_usage
      WHERE created_at >= ? AND created_at < ?
        AND tool = ANY(?::text[])
        AND NOT (probe_class = ANY(?::text[]))
      GROUP BY tool, agent_mode, budget_header`,
    [fromIso, toIso, [...opts.tools], [...opts.excludeProbeClasses]],
  );
  // pg COUNT(*) is a bigint → string; Number() coerces.
  return rows.map((r) => ({
    tool: r.tool,
    agent_mode: r.agent_mode,
    budget_header: r.budget_header,
    calls: Number(r.calls),
  }));
}

export type AgenticCommerceIndexStatus = "claimed" | "published";

/** The stored state of one week, or undefined when nothing has claimed it yet. */
export async function getAgenticCommerceIndexStatus(
  periodEnd: string,
): Promise<AgenticCommerceIndexStatus | undefined> {
  const row = await sql.one<{ status: AgenticCommerceIndexStatus }>(
    "SELECT status FROM agentic_commerce_index WHERE period_end = ?",
    [periodEnd],
  );
  return row?.status;
}

export interface AgenticCommerceIndexClaim {
  period_start: string;
  period_end: string;
  /** This instance's id — internal only, never published. */
  claimed_by: string;
  /** ISO time of the claim. */
  now: string;
  /** A 'claimed' row older than this ISO time is abandoned and may be taken over. */
  stale_before: string;
}

/**
 * Atomically claim one week for computation. True means this caller — and
 * nobody else — now owns the week and should compute and publish it.
 *
 * One statement, so the database arbitrates: of any number of concurrent
 * callers, exactly one INSERT wins the PRIMARY KEY; the rest hit ON CONFLICT,
 * whose UPDATE only fires for a claim that is still unpublished AND stale
 * (its owner crashed mid-computation). A published week is never reclaimed.
 */
export async function claimAgenticCommerceIndexPeriod(claim: AgenticCommerceIndexClaim): Promise<boolean> {
  const r = await sql.run(
    `INSERT INTO agentic_commerce_index (period_end, period_start, status, claimed_by, claimed_at)
     VALUES (?, ?, 'claimed', ?, ?)
     ON CONFLICT (period_end) DO UPDATE
        SET claimed_by = EXCLUDED.claimed_by, claimed_at = EXCLUDED.claimed_at
      WHERE agentic_commerce_index.status = 'claimed'
        AND agentic_commerce_index.claimed_at < ?
     RETURNING period_end`,
    [claim.period_end, claim.period_start, claim.claimed_by, claim.now, claim.stale_before],
  );
  return r.rowCount === 1;
}

/**
 * Store the computed index for a week this instance claimed. False when the
 * claim was lost in the meantime (taken over as stale) — the payload is then
 * discarded rather than overwriting the new owner's work.
 */
export async function publishAgenticCommerceIndex(p: {
  period_end: string;
  claimed_by: string;
  payload: string;
  published_at: string;
}): Promise<boolean> {
  const r = await sql.run(
    `UPDATE agentic_commerce_index
        SET status = 'published', payload = ?, published_at = ?
      WHERE period_end = ? AND status = 'claimed' AND claimed_by = ?`,
    [p.payload, p.published_at, p.period_end, p.claimed_by],
  );
  return r.rowCount === 1;
}

export interface StoredAgenticCommerceIndex {
  period_start: string;
  period_end: string;
  published_at: string;
  /** The published JSON document, exactly as stored. */
  payload: string;
}

/** The most recent published week, or undefined before the first publication. */
export async function getLatestAgenticCommerceIndex(): Promise<StoredAgenticCommerceIndex | undefined> {
  return await sql.one<StoredAgenticCommerceIndex>(
    `SELECT period_start, period_end, published_at, payload
       FROM agentic_commerce_index
      WHERE status = 'published'
      ORDER BY period_end DESC
      LIMIT 1`,
  );
}
