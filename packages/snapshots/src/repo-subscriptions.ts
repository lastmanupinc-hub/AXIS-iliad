import { sql } from "./pg.js";

// ─── Types ──────────────────────────────────────────────────────

export interface RepoSubscription {
  account_id: string;
  product_id: string;
  repo_full_name: string;
  created_at: string;
  /** Set by the watch-dispatcher's re-sync step (app_20_mcp_hosted) — null until the first successful watch job for this subscription. */
  latest_snapshot_id: string | null;
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
    `SELECT account_id, product_id, repo_full_name, created_at, latest_snapshot_id FROM repo_subscriptions WHERE repo_full_name = ? ORDER BY created_at ASC`,
    [repo_full_name],
  );
}

/** Every repo+product an account currently watches. */
export async function listSubscriptionsForAccount(account_id: string): Promise<RepoSubscription[]> {
  return sql.many<RepoSubscription>(
    `SELECT account_id, product_id, repo_full_name, created_at, latest_snapshot_id FROM repo_subscriptions WHERE account_id = ? ORDER BY created_at ASC`,
    [account_id],
  );
}

/** One subscription, if it exists — the lookup the hosted MCP endpoint (app_20) uses to resolve a caller's account+repo to its latest synced snapshot. */
export async function getRepoSubscription(account_id: string, product_id: string, repo_full_name: string): Promise<RepoSubscription | undefined> {
  return sql.one<RepoSubscription>(
    `SELECT account_id, product_id, repo_full_name, created_at, latest_snapshot_id FROM repo_subscriptions WHERE account_id = ? AND product_id = ? AND repo_full_name = ?`,
    [account_id, product_id, repo_full_name],
  );
}

/** Records the snapshot a successful watch-job re-sync produced — app_20_mcp_hosted's Watch step. A no-op (0 rows affected) if the subscription doesn't exist, e.g. it was removed mid-flight. */
export async function setLatestSnapshot(account_id: string, product_id: string, repo_full_name: string, snapshot_id: string): Promise<void> {
  await sql.run(
    `UPDATE repo_subscriptions SET latest_snapshot_id = ? WHERE account_id = ? AND product_id = ? AND repo_full_name = ?`,
    [snapshot_id, account_id, product_id, repo_full_name],
  );
}
