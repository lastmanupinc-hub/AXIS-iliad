// ─── Credit Pack Store ──────────────────────────────────────────
//
// One-shot credit pack purchases routed through PAI'D → Stripe. Distinct
// from the monthly plan allowance (usage_credit_monthly) and the
// persistence credits ledger (persistence_credits) — credit packs are
// universal AXIS credits, usable by any tier, drawn AFTER the monthly
// plan allowance and BEFORE per-call MPP overage.
//
// Pack lifecycle:
//   1. User clicks "Top up $20 → 12,500 credits" on AccountPage
//   2. AXIS records a PENDING purchase row, mints a PAI'D checkout session
//   3. User pays on PAI'D-hosted Stripe Checkout
//   4. PAI'D webhook fires checkout.session.completed → AXIS marks pack
//      SUCCEEDED and credits become spendable
//   5. consumePackCredits draws from oldest succeeded pack FIFO until depleted
//
// Refund policy: not yet implemented (column reserved). For now any pack
// with status='succeeded' and credits_remaining > 0 is spendable.

import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";

export type CreditPackStatus = "pending" | "succeeded" | "refunded" | "failed";

export interface CreditPack {
  purchase_id: string;
  account_id: string;
  pack_id: string;
  credits_purchased: number;
  credits_remaining: number;
  price_cents: number;
  paid_session_id: string | null;
  paid_payment_intent_id: string | null;
  status: CreditPackStatus;
  created_at: string;
  succeeded_at: string | null;
  metadata: Record<string, unknown>;
}

export interface CreditPackCatalogEntry {
  pack_id: string;
  credits: number;
  price_cents: number;
  label: string;
  price_per_1k_credits_cents: number;
  description: string;
}

// ─── Catalog ─────────────────────────────────────────────────────
//
// Pricing math vs the $0.0018/credit ($0.18/100credits) overage rate:
//   pack_starter: $5 / 2,500c   = $0.0020/c — 11% premium for no-commit buyers
//   pack_mid:     $20 / 12,500c = $0.0016/c — 11% discount, rewards mid-spend
//   pack_pro:     $50 / 35,000c = $0.00143/c — 21% discount, rewards bulk
//
// This is the classic "buy more, save more" ladder. The starter pack runs
// slightly above overage rate to nudge undecided buyers toward the mid pack.

export const CREDIT_PACK_CATALOG: readonly CreditPackCatalogEntry[] = [
  {
    pack_id: "pack_starter",
    credits: 2_500,
    price_cents: 500,
    label: "$5 — 2,500 credits",
    price_per_1k_credits_cents: 200,
    description: "Top up without commitment. ~9 codebase analyses or ~2,500 web scrapes.",
  },
  {
    pack_id: "pack_mid",
    credits: 12_500,
    price_cents: 2_000,
    label: "$20 — 12,500 credits",
    price_per_1k_credits_cents: 160,
    description: "Best value for active builders. ~45 codebase analyses or ~12,500 web scrapes.",
  },
  {
    pack_id: "pack_pro",
    credits: 35_000,
    price_cents: 5_000,
    label: "$50 — 35,000 credits",
    price_per_1k_credits_cents: 143,
    description: "Bulk discount. ~125 codebase analyses or 35k web scrapes. Best $/credit rate.",
  },
] as const;

const CATALOG_BY_ID = new Map<string, CreditPackCatalogEntry>(
  CREDIT_PACK_CATALOG.map((p) => [p.pack_id, p]),
);

export function getPackById(pack_id: string): CreditPackCatalogEntry | null {
  return CATALOG_BY_ID.get(pack_id) ?? null;
}

// ─── Row → domain mapping ────────────────────────────────────────

interface PackRow {
  purchase_id: string;
  account_id: string;
  pack_id: string;
  credits_purchased: number;
  credits_remaining: number;
  price_cents: number;
  paid_session_id: string | null;
  paid_payment_intent_id: string | null;
  status: string;
  created_at: string;
  succeeded_at: string | null;
  metadata: string;
}

function rowToPack(row: PackRow): CreditPack {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
  } catch {
    metadata = {};
  }
  return {
    purchase_id: row.purchase_id,
    account_id: row.account_id,
    pack_id: row.pack_id,
    credits_purchased: row.credits_purchased,
    credits_remaining: row.credits_remaining,
    price_cents: row.price_cents,
    paid_session_id: row.paid_session_id,
    paid_payment_intent_id: row.paid_payment_intent_id,
    status: row.status as CreditPackStatus,
    created_at: row.created_at,
    succeeded_at: row.succeeded_at,
    metadata,
  };
}

// ─── Pending purchase creation ───────────────────────────────────

/**
 * Record a PENDING purchase row before sending the user to PAI'D's hosted
 * checkout. Returns the purchase_id which is stamped into the PAI'D
 * session metadata so the webhook can find this row to mark succeeded.
 */
export function recordPendingPurchase(
  account_id: string,
  pack_id: string,
  paid_session_id: string,
  metadata: Record<string, unknown> = {},
): CreditPack {
  const pack = getPackById(pack_id);
  if (!pack) {
    throw new Error(`Unknown pack_id: ${pack_id}`);
  }

  const purchase_id = randomUUID();
  const now = new Date().toISOString();

  const db = getDb();
  db.prepare(
    `INSERT INTO credit_pack_purchases
       (purchase_id, account_id, pack_id, credits_purchased, credits_remaining,
        price_cents, paid_session_id, paid_payment_intent_id, status,
        created_at, succeeded_at, metadata)
     VALUES (?, ?, ?, ?, 0, ?, ?, NULL, 'pending', ?, NULL, ?)`,
  ).run(
    purchase_id,
    account_id,
    pack_id,
    pack.credits,
    pack.price_cents,
    paid_session_id,
    now,
    JSON.stringify(metadata),
  );

  return {
    purchase_id,
    account_id,
    pack_id,
    credits_purchased: pack.credits,
    credits_remaining: 0, // not yet succeeded — credits only become spendable after webhook
    price_cents: pack.price_cents,
    paid_session_id,
    paid_payment_intent_id: null,
    status: "pending",
    created_at: now,
    succeeded_at: null,
    metadata,
  };
}

// ─── Webhook completion ──────────────────────────────────────────

/**
 * Mark a pending purchase as succeeded. Idempotent — if already succeeded,
 * returns the existing pack unchanged. Returns null if the session ID
 * isn't recognized.
 */
export function markPurchaseSucceeded(
  paid_session_id: string,
  paid_payment_intent_id?: string,
): CreditPack | null {
  const db = getDb();
  const existing = db.prepare(
    `SELECT * FROM credit_pack_purchases WHERE paid_session_id = ?`,
  ).get(paid_session_id) as PackRow | undefined;

  if (!existing) return null;

  if (existing.status === "succeeded") {
    // Idempotent path — already marked succeeded.
    return rowToPack(existing);
  }

  if (existing.status === "refunded" || existing.status === "failed") {
    // Don't undo a terminal non-success state.
    return rowToPack(existing);
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE credit_pack_purchases
       SET status = 'succeeded',
           succeeded_at = ?,
           credits_remaining = credits_purchased,
           paid_payment_intent_id = COALESCE(?, paid_payment_intent_id)
     WHERE paid_session_id = ?`,
  ).run(now, paid_payment_intent_id ?? null, paid_session_id);

  const updated = db.prepare(
    `SELECT * FROM credit_pack_purchases WHERE paid_session_id = ?`,
  ).get(paid_session_id) as PackRow;
  return rowToPack(updated);
}

// ─── Consumption ─────────────────────────────────────────────────

export interface PackConsumptionResult {
  consumed: number;
  remaining_after: number;
  unfunded: number;
  packs_drawn: Array<{ purchase_id: string; pack_id: string; drawn: number }>;
}

/**
 * Draw up to `credits_needed` from the account's succeeded packs, FIFO by
 * created_at. If insufficient credits across all packs, consumes what's
 * available and reports `unfunded` for the caller to handle (typically by
 * falling through to per-call MPP overage).
 *
 * Atomic via a single transaction — safe under concurrent consumption.
 */
export function consumePackCredits(
  account_id: string,
  credits_needed: number,
): PackConsumptionResult {
  if (!Number.isFinite(credits_needed) || credits_needed <= 0) {
    return { consumed: 0, remaining_after: 0, unfunded: 0, packs_drawn: [] };
  }

  const db = getDb();
  const txn = db.transaction(() => {
    const packs = db.prepare(
      `SELECT * FROM credit_pack_purchases
        WHERE account_id = ? AND status = 'succeeded' AND credits_remaining > 0
        ORDER BY created_at ASC`,
    ).all(account_id) as PackRow[];

    let needed = credits_needed;
    let totalDrawn = 0;
    const drawn: Array<{ purchase_id: string; pack_id: string; drawn: number }> = [];

    for (const pack of packs) {
      if (needed <= 0) break;
      const take = Math.min(needed, pack.credits_remaining);
      if (take <= 0) continue;
      db.prepare(
        `UPDATE credit_pack_purchases
           SET credits_remaining = credits_remaining - ?
         WHERE purchase_id = ?`,
      ).run(take, pack.purchase_id);
      drawn.push({ purchase_id: pack.purchase_id, pack_id: pack.pack_id, drawn: take });
      totalDrawn += take;
      needed -= take;
    }

    return { totalDrawn, drawn };
  });

  const { totalDrawn, drawn } = txn();
  const remaining_after = getTotalPackCredits(account_id);

  return {
    consumed: totalDrawn,
    remaining_after,
    unfunded: Math.max(0, credits_needed - totalDrawn),
    packs_drawn: drawn,
  };
}

// ─── Read helpers ────────────────────────────────────────────────

/** Sum of credits_remaining across all succeeded packs for the account. */
export function getTotalPackCredits(account_id: string): number {
  const row = getDb().prepare(
    `SELECT COALESCE(SUM(credits_remaining), 0) AS total
       FROM credit_pack_purchases
      WHERE account_id = ? AND status = 'succeeded'`,
  ).get(account_id) as { total: number };
  return row.total;
}

/** Full purchase history for an account, newest first. */
export function listCreditPacks(account_id: string, limit = 50): CreditPack[] {
  const rows = getDb().prepare(
    `SELECT * FROM credit_pack_purchases
      WHERE account_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
  ).all(account_id, limit) as PackRow[];
  return rows.map(rowToPack);
}

/** Lookup by paid_session_id — used by the webhook handler. */
export function getPackBySession(paid_session_id: string): CreditPack | null {
  const row = getDb().prepare(
    `SELECT * FROM credit_pack_purchases WHERE paid_session_id = ?`,
  ).get(paid_session_id) as PackRow | undefined;
  return row ? rowToPack(row) : null;
}

// ─── Test/debug helpers ──────────────────────────────────────────

export function _resetCreditPacksForTests(): void {
  getDb().prepare("DELETE FROM credit_pack_purchases").run();
}
