import { randomUUID } from "node:crypto";
import { sql } from "./pg.js";
import type { BillingTier, PersistenceOp, PersistenceCreditRecord } from "./billing-types.js";
import {
  PERSISTENCE_CREDIT_COSTS,
  PERSISTENCE_MIN_TIER,
  SUITE_MONTHLY_PERSISTENCE_CREDITS,
} from "./billing-types.js";

// ─── Balance ─────────────────────────────────────────────────────

/** Get current persistence credit balance for an account. Returns 0 if no credits exist. */
export async function getPersistenceBalance(account_id: string): Promise<number> {
  const row = await sql.one<{ balance: number | null }>(
    "SELECT SUM(credits_delta) as balance FROM persistence_credits WHERE account_id = ?",
    [account_id],
  );
  return Math.max(0, row?.balance ?? 0);
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
  const alreadyGranted = await sql.one(
    `SELECT 1 FROM persistence_credits
       WHERE account_id = ? AND operation = 'suite_monthly_grant'
         AND created_at >= ? AND created_at < ?`,
    [account_id, `${month}-01`, `${month}-32`],
  );

  if (alreadyGranted) return null;

  return await addPersistenceCredits(account_id, SUITE_MONTHLY_PERSISTENCE_CREDITS, "suite_monthly_grant");
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
  const balance = await getPersistenceBalance(account_id);

  if (balance < cost) {
    return {
      ok: false,
      reason: `Insufficient persistence credits. Need ${cost}, have ${balance}. Purchase more at iliad.trustfabric.ai/billing.`,
    };
  }

  const balance_after = balance - cost;

  await sql.run(
    `INSERT INTO persistence_credits
         (credit_id, account_id, credits_delta, operation, snapshot_id, balance_after, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      account_id,
      -cost,
      op,
      snapshot_id ?? null,
      balance_after,
      new Date().toISOString(),
    ],
  );

  return { ok: true, balance_after };
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
