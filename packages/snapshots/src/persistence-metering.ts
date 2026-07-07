import { randomUUID } from "node:crypto";
import { sql, pgPlaceholders } from "./pg.js";
import type { BillingTier, PersistenceOp, PersistenceCreditRecord } from "./billing-types.js";
import {
  PERSISTENCE_CREDIT_COSTS,
  PERSISTENCE_MIN_TIER,
  SUITE_MONTHLY_PERSISTENCE_CREDITS,
} from "./billing-types.js";

// ─── Balance ─────────────────────────────────────────────────────

/** Get current persistence credit balance for an account. Returns 0 if no credits exist. */
export async function getPersistenceBalance(account_id: string): Promise<number> {
  const row = await sql.one<{ balance: string | number | null }>(
    "SELECT SUM(credits_delta) as balance FROM persistence_credits WHERE account_id = ?",
    [account_id],
  );
  // pg SUM(...) returns a string/bigint — coerce before Math.max so the balance
  // is compared numerically.
  return Math.max(0, Number(row?.balance ?? 0));
}

// ─── Access check ────────────────────────────────────────────────

/**
 * Whether an account can use persistence features.
 * Free tier is always blocked. Paid/suite require a positive balance.
 */
export async function canUsePersistence(account_id: string, tier: BillingTier): Promise<boolean> {
  if (tier === PERSISTENCE_MIN_TIER || tier === "suite") {
    return (await getPersistenceBalance(account_id)) > 0;
  }
  return false;
}

// ─── Credit grants ───────────────────────────────────────────────

/** Record a credit purchase or grant. Returns the new balance. */
export async function addPersistenceCredits(
  account_id: string,
  credits: number,
  operation: "purchase" | "suite_monthly_grant" = "purchase",
): Promise<number> {
  const balance_after = (await getPersistenceBalance(account_id)) + credits;

  await sql.run(
    `INSERT INTO persistence_credits
       (credit_id, account_id, credits_delta, operation, snapshot_id, balance_after, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    [randomUUID(), account_id, credits, operation, balance_after, new Date().toISOString()],
  );

  return balance_after;
}

/** Apply the monthly suite credit grant. Idempotent within the same calendar month. */
export async function applySuiteMonthlyGrant(account_id: string, tier: BillingTier): Promise<number | null> {
  if (tier !== "suite") return null;

  const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  // Check-then-insert over the append-only ledger: two concurrent calls (e.g. parallel
  // GET /v1/account/credits) both pass the "already granted?" check and double-grant.
  // Serialize per-account with a tx-scoped advisory lock (namespace 3 = suite grant),
  // mirroring meterPersistenceOp (namespace 1); the lock releases at COMMIT.
  return await sql.tx<number | null>(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(3, hashtext($1))", [account_id]);

    const granted = await client.query(
      `SELECT 1 FROM persistence_credits
         WHERE account_id = $1 AND operation = 'suite_monthly_grant'
           AND created_at >= $2 AND created_at < $3 LIMIT 1`,
      [account_id, `${month}-01`, `${month}-32`],
    );
    if (granted.rows.length > 0) return null;

    const balRow = await client.query<{ bal: string | number | null }>(
      "SELECT COALESCE(SUM(credits_delta), 0) AS bal FROM persistence_credits WHERE account_id = $1",
      [account_id],
    );
    const balance_after = Math.max(0, Number(balRow.rows[0]?.bal ?? 0)) + SUITE_MONTHLY_PERSISTENCE_CREDITS;

    await client.query(
      pgPlaceholders(
        `INSERT INTO persistence_credits
             (credit_id, account_id, credits_delta, operation, snapshot_id, balance_after, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ),
      [randomUUID(), account_id, SUITE_MONTHLY_PERSISTENCE_CREDITS, "suite_monthly_grant", null, balance_after, new Date().toISOString()],
    );

    return balance_after;
  });
}

// ─── Metering ────────────────────────────────────────────────────

export type MeterResult =
  | { ok: true; balance_after: number }
  | { ok: false; reason: string };

/**
 * Deduct credits for a persistence operation.
 * Returns ok:true on success or ok:false with a human-readable reason on failure.
 */
export async function meterPersistenceOp(
  account_id: string,
  tier: BillingTier,
  op: PersistenceOp,
  snapshot_id?: string,
): Promise<MeterResult> {
  if (tier === "free") {
    return {
      ok: false,
      reason: "Persistence requires a paid plan. Upgrade at iliad.trustfabric.ai/billing.",
    };
  }

  const cost = PERSISTENCE_CREDIT_COSTS[op];

  // The balance is SUM(credits_delta) over an append-only ledger — there is no single
  // row to lock, so a naive read-check-insert lets two concurrent ops both pass the
  // `balance < cost` gate and both debit (double-spend, balance goes negative).
  // Serialize per-account with a transaction-scoped advisory lock (namespace 1 =
  // persistence credits) so check-then-debit is atomic; the lock releases at COMMIT.
  return await sql.tx<MeterResult>(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(1, hashtext($1))", [account_id]);

    const balRow = await client.query<{ bal: string | number | null }>(
      "SELECT COALESCE(SUM(credits_delta), 0) AS bal FROM persistence_credits WHERE account_id = $1",
      [account_id],
    );
    const balance = Math.max(0, Number(balRow.rows[0]?.bal ?? 0));

    if (balance < cost) {
      return {
        ok: false,
        reason: `Insufficient persistence credits. Need ${cost}, have ${balance}. Purchase more at iliad.trustfabric.ai/billing.`,
      };
    }

    const balance_after = balance - cost;
    await client.query(
      pgPlaceholders(
        `INSERT INTO persistence_credits
             (credit_id, account_id, credits_delta, operation, snapshot_id, balance_after, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ),
      [randomUUID(), account_id, -cost, op, snapshot_id ?? null, balance_after, new Date().toISOString()],
    );

    return { ok: true, balance_after };
  });
}

// ─── Ledger ──────────────────────────────────────────────────────

/** Full credit ledger for an account, newest first. */
export async function getPersistenceLedger(
  account_id: string,
  limit = 50,
): Promise<PersistenceCreditRecord[]> {
  return await sql.many<PersistenceCreditRecord>(
    "SELECT * FROM persistence_credits WHERE account_id = ? ORDER BY created_at DESC LIMIT ?",
    [account_id, limit],
  );
}

/** One day's worth of persistence-credit spend — `GET /v1/account/usage/timeseries` (WO-A3). */
export interface PersistenceSpendDayBucket {
  /** UTC calendar date, "YYYY-MM-DD". */
  date: string;
  /** Positive number of credits consumed that day (debits only — grants are excluded). */
  credits_spent: number;
}

/**
 * Per-day persistence-credit spend since `since` (inclusive, ISO timestamp).
 * Only debit rows (`credits_delta < 0`, e.g. a diff view) count as "spend" —
 * grants/purchases (`credits_delta > 0`) are the balance-over-time story the
 * ledger UI already shows, not a per-day usage-graph metric. Sparse; the
 * caller zero-fills the full requested window.
 */
export async function getPersistenceSpendByDay(account_id: string, since: string): Promise<PersistenceSpendDayBucket[]> {
  const rows = await sql.many<{ credits_delta: number | string; created_at: string }>(
    "SELECT credits_delta, created_at FROM persistence_credits WHERE account_id = ? AND created_at >= ? AND credits_delta < 0",
    [account_id, since],
  );
  const spendByDate = new Map<string, number>();
  for (const row of rows) {
    const date = row.created_at.slice(0, 10);
    spendByDate.set(date, (spendByDate.get(date) ?? 0) + -Number(row.credits_delta));
  }
  return [...spendByDate.entries()]
    .map(([date, credits_spent]) => ({ date, credits_spent }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
