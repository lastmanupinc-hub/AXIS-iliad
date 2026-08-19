import { sql } from "./pg.js";

// ─── Types ──────────────────────────────────────────────────────

export type EntitlementSource = "purchase" | "manual";

export interface Entitlement {
  account_id: string;
  product_id: string;
  granted_at: string;
  source: EntitlementSource;
}

// ─── Store functions ────────────────────────────────────────────

/**
 * Grant an account access to one spoke product (packages/generator-core/src/
 * product-registry.ts). Idempotent on (account_id, product_id) — a webhook
 * retry re-granting an already-owned product is a no-op, not a duplicate row
 * or an error, matching the idempotency discipline the rest of the payment
 * path already follows (see paid-handlers.ts's markPurchaseSucceeded).
 */
export async function grantEntitlement(
  account_id: string,
  product_id: string,
  source: EntitlementSource = "purchase",
): Promise<void> {
  await sql.run(
    `INSERT INTO account_entitlements (account_id, product_id, granted_at, source)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (account_id, product_id) DO NOTHING`,
    [account_id, product_id, new Date().toISOString(), source],
  );
}

/** Whether an account has been granted a specific spoke product. */
/**
 * Does this account have a RECORD OF PURCHASE for this product?
 *
 * ⚠ THIS IS NOT AN ACCESS GATE, and must not be used as one. There are two
 * tables and they answer different questions:
 *
 *   account_entitlements  (this file)  — WHAT was bought, by product id.
 *   program_entitlements  (billing-store) — WHAT MAY RUN, by program name.
 *                                            isProgramEnabled() reads this,
 *                                            and every pro program gates on it.
 *
 * A product maps to one or more programs, so the two are not interchangeable.
 * As of 2026-08-18 this function has NO production caller — the access path
 * goes exclusively through isProgramEnabled(). That is deliberate, not an
 * oversight, and it is recorded here because the gap was expensive: the admin
 * grant endpoint wrote only account_entitlements, returned {"granted": true},
 * and left the customer as locked out as before (fixed in 75f9b95 — it now
 * writes both).
 *
 * If you are reaching for this to decide whether someone may DO something, you
 * want isProgramEnabled(). If you are reaching for it to show someone what they
 * have bought, this is the right function.
 */
export async function hasEntitlement(account_id: string, product_id: string): Promise<boolean> {
  const rows = await sql.many<{ account_id: string }>(
    `SELECT account_id FROM account_entitlements WHERE account_id = ? AND product_id = ?`,
    [account_id, product_id],
  );
  return rows.length > 0;
}

/** Every product an account currently owns. */
export async function listEntitlements(account_id: string): Promise<Entitlement[]> {
  return sql.many<Entitlement>(
    `SELECT account_id, product_id, granted_at, source FROM account_entitlements WHERE account_id = ? ORDER BY granted_at ASC`,
    [account_id],
  );
}
