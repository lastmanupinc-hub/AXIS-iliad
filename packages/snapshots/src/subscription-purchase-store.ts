// money_01 — subscription checkouts, tracked so their settlement is joinable.
//
// A PAI'D subscription checkout already grants tier access on webhook
// confirmation (paid-handlers.ts's updateAccountTierIfCurrent) — that part
// was never broken. What was missing: nothing durably recorded WHICH checkout
// session that grant came from, so the webhook had no way to write a
// payment_receipts row for it. settled_revenue_cents_all_time (growth-store.ts)
// sums payment_receipts exclusively, so real subscription money was — and had
// always been — invisible there, reading a false $0 for a revenue stream that
// was genuinely earning.
//
// Mirrors credit_pack_purchases's exact shape (pending -> succeeded, keyed by
// paid_session_id, idempotent on webhook retry) rather than inventing a new
// pattern for the same problem. Deliberately simpler than that module: a
// subscription's "grant" (tier access) already happens elsewhere in the same
// webhook handler, independent of this table — this module exists PURELY to
// make the settlement record joinable and to prevent a webhook retry from
// writing a duplicate payment_receipts row, not to gate any spendable balance
// the way credit-pack's atomic credit-grant transaction has to.
import { randomUUID } from "node:crypto";
import { sql, pgPlaceholders } from "./pg.js";

export type SubscriptionPurchaseStatus = "pending" | "succeeded";

export interface SubscriptionPurchase {
  purchase_id: string;
  account_id: string;
  /** The AXIS tier this checkout is for ("paid" | "suite") — never "free". */
  target_tier: string;
  /** The PAI'D/marketed plan id (starter/pro/growth) at checkout time. */
  plan_id: string;
  amount_cents: number;
  paid_session_id: string | null;
  paid_payment_intent_id: string | null;
  status: SubscriptionPurchaseStatus;
  created_at: string;
  succeeded_at: string | null;
}

/** Record a PENDING subscription checkout keyed by the PAI'D checkout session id. */
export async function recordPendingSubscription(input: {
  account_id: string;
  target_tier: string;
  plan_id: string;
  amount_cents: number;
  paid_session_id: string;
}): Promise<SubscriptionPurchase> {
  const purchase: SubscriptionPurchase = {
    purchase_id: randomUUID(),
    account_id: input.account_id,
    target_tier: input.target_tier,
    plan_id: input.plan_id,
    amount_cents: input.amount_cents,
    paid_session_id: input.paid_session_id,
    paid_payment_intent_id: null,
    status: "pending",
    created_at: new Date().toISOString(),
    succeeded_at: null,
  };
  await sql.run(
    `INSERT INTO subscription_purchases
      (purchase_id, account_id, target_tier, plan_id, amount_cents, paid_session_id, paid_payment_intent_id, status, created_at, succeeded_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', ?, NULL)`,
    [
      purchase.purchase_id,
      purchase.account_id,
      purchase.target_tier,
      purchase.plan_id,
      purchase.amount_cents,
      purchase.paid_session_id,
      purchase.created_at,
    ],
  );
  return purchase;
}

/**
 * Idempotently flip a purchase pending -> succeeded. Returns the row on the
 * FIRST success only; null when the session is unknown or was already
 * settled — so a webhook retry (or a second lifecycle event for the same
 * checkout, e.g. both checkout.session.completed and payment_intent.captured
 * firing for one purchase) can never produce a duplicate payment_receipts
 * row. FOR UPDATE locks the row across the transaction: a concurrent webhook
 * delivery for the SAME session blocks here until the first commits, then
 * re-reads status='succeeded' and bails.
 *
 * Unlike credit-pack's markPurchaseSucceeded, this does NOT also grant
 * anything in the same transaction — tier access was already granted
 * elsewhere in the webhook handler (updateAccountTierIfCurrent), independent
 * of this table. The caller writes the payment_receipts row itself, as a
 * best-effort step after this resolves — matching cashier.ts's own
 * established convention for settlement bookkeeping (recordSettlementBookkeepingBestEffort):
 * losing a receipt on a rare failure is a reporting gap, not a spendable
 * balance that could be lost or double-granted, so it does not need the same
 * atomicity guarantee credit-pack's ledger grant does.
 */
export async function markSubscriptionSucceeded(
  paid_session_id: string,
  payment_intent_id?: string,
): Promise<SubscriptionPurchase | null> {
  const pi = payment_intent_id ?? null;
  return await sql.tx<SubscriptionPurchase | null>(async (client) => {
    const sel = await client.query<SubscriptionPurchase>(
      pgPlaceholders(`SELECT * FROM subscription_purchases WHERE paid_session_id = ? FOR UPDATE`),
      [paid_session_id],
    );
    const row = sel.rows[0];
    if (!row || row.status === "succeeded") return null; // unknown or already settled
    const now = new Date().toISOString();
    const upd = await client.query(
      pgPlaceholders(
        `UPDATE subscription_purchases
            SET status = 'succeeded', succeeded_at = ?, paid_payment_intent_id = ?
          WHERE purchase_id = ? AND status = 'pending'`,
      ),
      [now, pi, row.purchase_id],
    );
    if ((upd.rowCount ?? 0) === 0) return null; // lost the race to flip pending -> succeeded
    return { ...row, status: "succeeded", succeeded_at: now, paid_payment_intent_id: pi };
  });
}

export async function getSubscriptionPurchaseBySession(
  paid_session_id: string,
): Promise<SubscriptionPurchase | null> {
  return (
    (await sql.one<SubscriptionPurchase>(
      `SELECT * FROM subscription_purchases WHERE paid_session_id = ?`,
      [paid_session_id],
    )) ?? null
  );
}

export async function listSubscriptionPurchasesByAccount(
  account_id: string,
  limit = 50,
): Promise<SubscriptionPurchase[]> {
  return await sql.many<SubscriptionPurchase>(
    `SELECT * FROM subscription_purchases
      WHERE account_id = ? ORDER BY created_at DESC LIMIT ?`,
    [account_id, limit],
  );
}
