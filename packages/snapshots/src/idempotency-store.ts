import { getDb } from "./db.js";

// Idempotency for the paid MCP path. A client sends an Idempotency-Key with a
// tools/call; the first call runs + charges, subsequent retries with the same
// key return the stored result and never re-charge. Only successful results are
// stored — a failed call doesn't charge (charge-on-success) and stays retryable.

export interface IdempotentRecord {
  request_hash: string;
  response: string;
}

/** Records older than this are treated as absent (best-effort expiry). */
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Return a previously-stored result for (account_id, key), or undefined if none
 * exists or it has expired. The caller compares request_hash to detect a key
 * reused with different arguments.
 */
export function getIdempotentResult(account_id: string, key: string): IdempotentRecord | undefined {
  const row = getDb()
    .prepare(
      `SELECT request_hash, response, created_at
         FROM idempotency_keys
        WHERE account_id = ? AND idempotency_key = ?`,
    )
    .get(account_id, key) as { request_hash: string; response: string; created_at: string } | undefined;
  if (!row) return undefined;
  if (Date.now() - new Date(row.created_at).getTime() > TTL_MS) return undefined;
  return { request_hash: row.request_hash, response: row.response };
}

/**
 * Persist a successful result. Uses ON CONFLICT DO NOTHING so a concurrent
 * first-call race keeps the earliest-committed result rather than overwriting.
 */
export function saveIdempotentResult(
  account_id: string,
  key: string,
  request_hash: string,
  response: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO idempotency_keys (account_id, idempotency_key, request_hash, response, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(account_id, idempotency_key) DO NOTHING`,
    )
    .run(account_id, key, request_hash, response, new Date().toISOString());
}

/** Delete expired keys. Best-effort housekeeping; safe to call periodically. */
export function pruneIdempotencyKeys(now = Date.now()): number {
  const cutoff = new Date(now - TTL_MS).toISOString();
  const info = getDb()
    .prepare(`DELETE FROM idempotency_keys WHERE created_at < ?`)
    .run(cutoff);
  return info.changes;
}
