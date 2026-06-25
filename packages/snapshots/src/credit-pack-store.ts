// Credit-pack top-ups — one-shot AXIS persistence-credit purchases routed
// through PAI'D (the first production revenue path for the PAI'D integration).
//
// The spendable balance lives in the existing persistence_credits ledger; this
// module only tracks the PURCHASE lifecycle (pending → succeeded) so a webhook
// retry can never double-grant. Catalog + grant reuse the existing
// PERSISTENCE_CREDIT_PACKS / addPersistenceCredits — no parallel balance.

import { randomUUID } from "node:crypto";
import { sql, pgPlaceholders } from "./pg.js";
import { PERSISTENCE_CREDIT_PACKS } from "./billing-types.js";

export type CreditPackStatus = "pending" | "succeeded";

export interface CreditPackPurchase {
  purchase_id: string;
  account_id: string;
  pack_id: string;
  credits: number;
  price_cents: number;
  paid_session_id: string | null;
  paid_payment_intent_id: string | null;
  status: CreditPackStatus;
  created_at: string;
  succeeded_at: string | null;
}

export interface CreditPackCatalogEntry {
  pack_id: string;
  credits: number;
  price_cents: number;
}

/** The purchasable packs (shared with the direct-grant path in billing.ts). */
export function listCreditPackCatalog(): CreditPackCatalogEntry[] {
  return PERSISTENCE_CREDIT_PACKS.map((p) => ({ ...p }));
}

export function getCreditPack(pack_id: string): CreditPackCatalogEntry | null {
  return PERSISTENCE_CREDIT_PACKS.find((p) => p.pack_id === pack_id) ?? null;
}

/** Record a PENDING purchase keyed by the PAI'D checkout session id. */
export async function recordPendingPurchase(input: {
  account_id: string;
  pack_id: string;
  credits: number;
  price_cents: number;
  paid_session_id: string;
}): Promise<CreditPackPurchase> {
  const purchase: CreditPackPurchase = {
    purchase_id: randomUUID(),
    account_id: input.account_id,
    pack_id: input.pack_id,
    credits: input.credits,
    price_cents: input.price_cents,
    paid_session_id: input.paid_session_id,
    paid_payment_intent_id: null,
    status: "pending",
    created_at: new Date().toISOString(),
    succeeded_at: null,
  };
  await sql.run(
    `INSERT INTO credit_pack_purchases
      (purchase_id, account_id, pack_id, credits, price_cents, paid_session_id, paid_payment_intent_id, status, created_at, succeeded_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', ?, NULL)`,
    [
      purchase.purchase_id,
      purchase.account_id,
      purchase.pack_id,
      purchase.credits,
      purchase.price_cents,
      purchase.paid_session_id,
      purchase.created_at,
    ],
  );
  return purchase;
}

/**
 * Idempotently settle a purchase and grant its credits. Returns the granted
 * purchase on the FIRST success only; null when the session is unknown or was
 * already settled — so a webhook retry never double-grants. The status flip and
 * the credit grant run in one transaction.
 */
export async function markPurchaseSucceeded(
  paid_session_id: string,
  payment_intent_id?: string,
): Promise<CreditPackPurchase | null> {
  const pi = payment_intent_id ?? null;
  return await sql.tx<CreditPackPurchase | null>(async (client) => {
    // FOR UPDATE locks the purchase row: a concurrent webhook delivery blocks here
    // until we commit, then re-reads status='succeeded' and bails — no double-grant.
    const sel = await client.query<CreditPackPurchase>(
      pgPlaceholders(`SELECT * FROM credit_pack_purchases WHERE paid_session_id = ? FOR UPDATE`),
      [paid_session_id],
    );
    const row = sel.rows[0];
    if (!row || row.status === "succeeded") return null; // unknown or already granted
    const now = new Date().toISOString();
    const upd = await client.query(
      pgPlaceholders(
        `UPDATE credit_pack_purchases
            SET status = 'succeeded', succeeded_at = ?, paid_payment_intent_id = ?
          WHERE purchase_id = ? AND status = 'pending'`,
      ),
      [now, pi, row.purchase_id],
    );
    // Belt-and-suspenders alongside FOR UPDATE: if we lost the race to flip
    // pending→succeeded, do NOT grant credits.
    if ((upd.rowCount ?? 0) === 0) return null;
    // Grant the credits ON THE SAME TRANSACTION. The previous code called
    // addPersistenceCredits via the pool, so the grant escaped this tx — a rollback
    // could flip status without granting (or grant without flipping). Inline the
    // ledger insert on the tx client so status-flip + grant are atomic.
    const balRow = await client.query<{ bal: string | number | null }>(
      "SELECT COALESCE(SUM(credits_delta), 0) AS bal FROM persistence_credits WHERE account_id = $1",
      [row.account_id],
    );
    const balance_after = Math.max(0, Number(balRow.rows[0]?.bal ?? 0)) + row.credits;
    await client.query(
      pgPlaceholders(
        `INSERT INTO persistence_credits
             (credit_id, account_id, credits_delta, operation, snapshot_id, balance_after, created_at)
           VALUES (?, ?, ?, 'purchase', NULL, ?, ?)`,
      ),
      [randomUUID(), row.account_id, row.credits, balance_after, now],
    );
    return { ...row, status: "succeeded", succeeded_at: now, paid_payment_intent_id: pi };
  });
}

export async function getPurchaseBySession(
  paid_session_id: string,
): Promise<CreditPackPurchase | null> {
  return (
    (await sql.one<CreditPackPurchase>(
      `SELECT * FROM credit_pack_purchases WHERE paid_session_id = ?`,
      [paid_session_id],
    )) ?? null
  );
}

export async function listPurchasesByAccount(
  account_id: string,
  limit = 50,
): Promise<CreditPackPurchase[]> {
  return await sql.many<CreditPackPurchase>(
    `SELECT * FROM credit_pack_purchases
      WHERE account_id = ? ORDER BY created_at DESC LIMIT ?`,
    [account_id, limit],
  );
}
