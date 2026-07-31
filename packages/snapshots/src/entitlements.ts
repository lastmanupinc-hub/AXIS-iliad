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
