import { sql } from "./pg.js";

// ─── Types ──────────────────────────────────────────────────────

export interface RepoSubscription {
  account_id: string;
  product_id: string;
  repo_full_name: string;
  created_at: string;
}

// ─── Store functions ────────────────────────────────────────────

/**
 * Subscribe one account's product to watching a repo — the Watch mechanic
 * every one of the 20 apps depends on (docs/saas-strategy/
 * APPLICATION_BUILD_STRATEGY.md). Idempotent on (account_id, product_id,
 * repo_full_name), matching the same idempotency discipline as
 * entitlements.ts's grantEntitlement.
 */
export async function subscribeRepo(
  account_id: string,
  product_id: string,
  repo_full_name: string,
): Promise<void> {
  await sql.run(
    `INSERT INTO repo_subscriptions (account_id, product_id, repo_full_name, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (account_id, product_id, repo_full_name) DO NOTHING`,
    [account_id, product_id, repo_full_name, new Date().toISOString()],
  );
}

export async function unsubscribeRepo(
  account_id: string,
  product_id: string,
  repo_full_name: string,
): Promise<void> {
  await sql.run(
    `DELETE FROM repo_subscriptions WHERE account_id = ? AND product_id = ? AND repo_full_name = ?`,
    [account_id, product_id, repo_full_name],
  );
}

/**
 * Every (account, product) watching a given repo — what a push webhook reads
 * to know which watch jobs to enqueue. This is the query
 * apps/api/src/github-webhook.ts's own comment names as the missing piece:
 * webhook-created snapshots were anonymous because nothing mapped a repo back
 * to an account.
 */
export async function listSubscriptionsForRepo(repo_full_name: string): Promise<RepoSubscription[]> {
  return sql.many<RepoSubscription>(
    `SELECT account_id, product_id, repo_full_name, created_at FROM repo_subscriptions WHERE repo_full_name = ? ORDER BY created_at ASC`,
    [repo_full_name],
  );
}

/** Every repo+product an account currently watches. */
export async function listSubscriptionsForAccount(account_id: string): Promise<RepoSubscription[]> {
  return sql.many<RepoSubscription>(
    `SELECT account_id, product_id, repo_full_name, created_at FROM repo_subscriptions WHERE account_id = ? ORDER BY created_at ASC`,
    [account_id],
  );
}
