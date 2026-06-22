// Credit-pack top-ups — one-shot AXIS persistence-credit purchases routed
// through PAI'D (the first production revenue path for the PAI'D integration).
//
// The spendable balance lives in the existing persistence_credits ledger; this
// module only tracks the PURCHASE lifecycle (pending → succeeded) so a webhook
// retry can never double-grant. Catalog + grant reuse the existing
// PERSISTENCE_CREDIT_PACKS / addPersistenceCredits — no parallel balance.

import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import { PERSISTENCE_CREDIT_PACKS } from "./billing-types.js";
import { addPersistenceCredits } from "./persistence-metering.js";

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
export function recordPendingPurchase(input: {
  account_id: string;
  pack_id: string;
  credits: number;
  price_cents: number;
  paid_session_id: string;
}): CreditPackPurchase {
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
  getDb()
    .prepare(
      `INSERT INTO credit_pack_purchases
        (purchase_id, account_id, pack_id, credits, price_cents, paid_session_id, paid_payment_intent_id, status, created_at, succeeded_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', ?, NULL)`,
    )
    .run(
      purchase.purchase_id,
      purchase.account_id,
      purchase.pack_id,
      purchase.credits,
      purchase.price_cents,
      purchase.paid_session_id,
      purchase.created_at,
    );
  return purchase;
}

/**
 * Idempotently settle a purchase and grant its credits. Returns the granted
 * purchase on the FIRST success only; null when the session is unknown or was
 * already settled — so a webhook retry never double-grants. The status flip and
 * the credit grant run in one transaction.
 */
export function markPurchaseSucceeded(
  paid_session_id: string,
  payment_intent_id?: string,
): CreditPackPurchase | null {
  const db = getDb();
  const settle = db.transaction((sessionId: string, pi: string | null): CreditPackPurchase | null => {
    const row = db
      .prepare(`SELECT * FROM credit_pack_purchases WHERE paid_session_id = ?`)
      .get(sessionId) as CreditPackPurchase | undefined;
    if (!row || row.status === "succeeded") return null; // unknown or already granted
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE credit_pack_purchases
          SET status = 'succeeded', succeeded_at = ?, paid_payment_intent_id = ?
        WHERE purchase_id = ? AND status = 'pending'`,
    ).run(now, pi, row.purchase_id);
    addPersistenceCredits(row.account_id, row.credits, "purchase");
    return { ...row, status: "succeeded", succeeded_at: now, paid_payment_intent_id: pi };
  });
  return settle(paid_session_id, payment_intent_id ?? null);
}

export function getPurchaseBySession(paid_session_id: string): CreditPackPurchase | null {
  return (
    (getDb()
      .prepare(`SELECT * FROM credit_pack_purchases WHERE paid_session_id = ?`)
      .get(paid_session_id) as CreditPackPurchase | undefined) ?? null
  );
}

export function listPurchasesByAccount(account_id: string, limit = 50): CreditPackPurchase[] {
  return getDb()
    .prepare(
      `SELECT * FROM credit_pack_purchases
        WHERE account_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(account_id, limit) as CreditPackPurchase[];
}
