// Compensation ledger — WO-20 phase 3 (charge-integrity hybrid, H2.1).
//
// The durable record that money moved but the work didn't: a cash-settled MCP
// call whose tool then threw, or an enforce-mode wallet call whose outcome is
// unknowable (timeout after the debit may have landed). Rows are written by
// the producers at the moment the asymmetry happens and resolved by the
// compensator (usage-credit grant / operator cash refund / explicit waiver).
//
// Idempotency model:
//   - PRODUCERS get lifecycle idempotency for free: one dispatch writes at
//     most one row (a single catch per request), and idempotent-key retries
//     replay from cache before any tool runs (see settleMcpCallInband's cache
//     check), so a replayed request cannot re-produce. Two genuine payments
//     for two genuine failures are two legitimate rows, not duplicates.
//   - The COMPENSATOR is at-most-once per entry: claimCompensationForCredit
//     is a conditional UPDATE (status='owed' -> 'credited') that returns the
//     row only to the caller that won the transition; every other attempt
//     gets null. Crash-safe: a crash after the claim but before the grant is
//     visible as credited-with-attempts in the audit trail, never a double
//     grant, and `attempts` counts every claim try.
import { randomUUID } from "node:crypto";
import { sql } from "./pg.js";

export type CompensationReason = "settled_then_error" | "wallet_rail_ambiguous" | "manual";
export type CompensationStatus = "owed" | "credited" | "cash_refunded" | "waived";

export interface CompensationEntry {
  entry_id: string;
  account_id: string;
  tool: string;
  amount_cents: number;
  currency: string;
  receipt_ref: string | null;
  reason: CompensationReason;
  status: CompensationStatus;
  attempts: number;
  created_at: string;
  resolved_at: string | null;
}

export interface RecordCompensationInput {
  account_id: string;
  tool: string;
  amount_cents: number;
  currency?: string;
  receipt_ref?: string | null;
  reason: CompensationReason;
}

/** Write an 'owed' row at the moment the money/work asymmetry happens. */
export async function recordCompensationOwed(input: RecordCompensationInput): Promise<CompensationEntry> {
  const entry: CompensationEntry = {
    entry_id: randomUUID(),
    account_id: input.account_id,
    tool: input.tool,
    amount_cents: input.amount_cents,
    currency: input.currency ?? "usd",
    receipt_ref: input.receipt_ref ?? null,
    reason: input.reason,
    status: "owed",
    attempts: 0,
    created_at: new Date().toISOString(),
    resolved_at: null,
  };
  await sql.run(
    `INSERT INTO compensation_ledger
       (entry_id, account_id, tool, amount_cents, currency, receipt_ref, reason, status, attempts, created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.entry_id, entry.account_id, entry.tool, entry.amount_cents, entry.currency,
      entry.receipt_ref, entry.reason, entry.status, entry.attempts, entry.created_at, entry.resolved_at,
    ],
  );
  return entry;
}

/**
 * Claim an 'owed' entry for crediting — at-most-once. Returns the claimed row
 * (already stamped credited/resolved) to exactly one caller; null for
 * everyone else, including replays. The CALLER performs the actual grant
 * after a successful claim (H2.4 wires the grant mechanism).
 */
export async function claimCompensationForCredit(entry_id: string): Promise<CompensationEntry | null> {
  const rows = await sql.many<CompensationEntry>(
    `UPDATE compensation_ledger
        SET status = 'credited', attempts = attempts + 1, resolved_at = ?
      WHERE entry_id = ? AND status = 'owed'
      RETURNING *`,
    [new Date().toISOString(), entry_id],
  );
  return rows[0] ?? null;
}

// H-Phase-A cycle 8: claimCompensationForCredit's own at-most-once claim
// (owed -> credited) and the actual usage-credit grant compensator.ts
// performs afterward are two separate, non-transactional operations. If the
// grant throws after the claim already committed (a transient DB hiccup —
// exactly the failure class this whole compensation system exists to
// survive), the entry is PERMANENTLY stuck 'credited' with no credit ever
// granted, and the at-most-once guard (WHERE status='owed') means it can
// never be reclaimed. Lets compensator.ts undo a failed grant's claim so
// the next lazy sweep retries it instead of silently abandoning it.
export async function revertCompensationClaim(entry_id: string): Promise<boolean> {
  const rows = await sql.many<{ entry_id: string }>(
    `UPDATE compensation_ledger
        SET status = 'owed', resolved_at = NULL
      WHERE entry_id = ? AND status = 'credited'
      RETURNING entry_id`,
    [entry_id],
  );
  return rows.length > 0;
}

/** Resolve an entry out-of-band (operator cash refund or explicit waiver). */
export async function resolveCompensation(
  entry_id: string,
  status: Extract<CompensationStatus, "cash_refunded" | "waived">,
): Promise<boolean> {
  const rows = await sql.many<{ entry_id: string }>(
    `UPDATE compensation_ledger
        SET status = ?, attempts = attempts + 1, resolved_at = ?
      WHERE entry_id = ? AND status = 'owed'
      RETURNING entry_id`,
    [status, new Date().toISOString(), entry_id],
  );
  return rows.length > 0;
}

/** Per-account totals for the _usage envelope: what's owed, what's been made whole. */
export async function getCompensationSummary(
  account_id: string,
): Promise<{ owed_cents: number; credited_cents: number }> {
  const rows = await sql.many<{ status: string; total: string | number }>(
    `SELECT status, COALESCE(SUM(amount_cents), 0) as total
       FROM compensation_ledger WHERE account_id = ? GROUP BY status`,
    [account_id],
  );
  let owed = 0;
  let credited = 0;
  for (const r of rows) {
    if (r.status === "owed") owed = Number(r.total);
    if (r.status === "credited") credited = Number(r.total);
  }
  return { owed_cents: owed, credited_cents: credited };
}

/** Platform-wide owed total (admin revenue subtracts this from gross). */
export async function getTotalCompensationOwed(): Promise<number> {
  const row = await sql.one<{ total: string | number }>(
    "SELECT COALESCE(SUM(amount_cents), 0) as total FROM compensation_ledger WHERE status = 'owed'",
  );
  return Number(row?.total ?? 0);
}

/** Oldest-first batch of unresolved entries for the compensator sweep. */
export async function listOwedCompensation(limit = 50): Promise<CompensationEntry[]> {
  return sql.many<CompensationEntry>(
    "SELECT * FROM compensation_ledger WHERE status = 'owed' ORDER BY created_at ASC LIMIT ?",
    [limit],
  );
}

/**
 * H2.4 — oldest-first owed entries for ONE account, so the compensator can be
 * triggered lazily (on that account's next `_usage` envelope) instead of
 * needing a standalone sweep process.
 */
export async function listOwedCompensationForAccount(
  account_id: string,
  limit = 10,
): Promise<CompensationEntry[]> {
  return sql.many<CompensationEntry>(
    `SELECT * FROM compensation_ledger WHERE account_id = ? AND status = 'owed'
     ORDER BY created_at ASC LIMIT ?`,
    [account_id, limit],
  );
}
