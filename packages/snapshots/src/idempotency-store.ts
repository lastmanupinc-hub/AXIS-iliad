import { sql } from "./pg.js";

// Idempotency for the paid MCP path. A client sends an Idempotency-Key with a
// tools/call; the first call runs + charges, subsequent retries with the same
// key return the stored result and never re-charge. Only successful results are
// stored — a failed call doesn't charge (charge-on-success) and stays retryable.
//
// H2.6 (red-team fix, WAVE-0 finding #1, CRITICAL): a plain read-then-later-
// write left a window where two concurrent requests sharing one key both saw
// "nothing yet" and both charged + ran the billable work. claimIdempotencyKey
// is now the FIRST step, before any charge or dispatch — an atomic INSERT (or
// reclaim of a stale, presumably-crashed 'pending' row) that only one
// concurrent caller can win. The loser must NOT charge or dispatch; it is told
// to retry shortly instead.

export interface IdempotentRecord {
  request_hash: string;
  response: string;
}

/** Records older than this are treated as absent (best-effort expiry). */
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** A 'pending' claim older than this is presumed abandoned (a crashed request) and may be reclaimed. */
const STALE_CLAIM_MS = 60 * 1000; // 60s — generous even for the slowest metered tool call

/**
 * Return a previously-stored COMPLETED result for (account_id, key), or
 * undefined if none exists, it's still 'pending' (genuinely in flight), or it
 * has expired. The caller compares request_hash to detect a key reused with
 * different arguments.
 */
export async function getIdempotentResult(
  account_id: string,
  key: string,
): Promise<IdempotentRecord | undefined> {
  const row = await sql.one<{ request_hash: string; response: string | null; created_at: string; status: string }>(
    `SELECT request_hash, response, created_at, status
       FROM idempotency_keys
      WHERE account_id = ? AND idempotency_key = ?`,
    [account_id, key],
  );
  if (!row || row.status !== "completed" || row.response == null) return undefined;
  if (Date.now() - new Date(row.created_at).getTime() > TTL_MS) return undefined;
  return { request_hash: row.request_hash, response: row.response };
}

/**
 * Atomically claim (account_id, key) for processing — the FIRST step, before
 * any charge or work happens. Returns true iff THIS call won the claim (a
 * fresh row, or a reclaimed stale 'pending' row abandoned by a crashed
 * request); false means another request is genuinely in flight right now.
 * Callers must check getIdempotentResult FIRST — a 'completed' row is a
 * legitimate replay, not a claim conflict.
 */
export async function claimIdempotencyKey(
  account_id: string,
  key: string,
  request_hash: string,
): Promise<boolean> {
  const staleCutoff = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const now = new Date().toISOString();
  const rows = await sql.many<{ account_id: string }>(
    `INSERT INTO idempotency_keys (account_id, idempotency_key, request_hash, response, status, created_at)
     VALUES (?, ?, ?, NULL, 'pending', ?)
     ON CONFLICT (account_id, idempotency_key) DO UPDATE
       SET request_hash = excluded.request_hash, response = NULL, status = 'pending', created_at = excluded.created_at
       WHERE idempotency_keys.status = 'pending' AND idempotency_keys.created_at < ?
     RETURNING account_id`,
    [account_id, key, request_hash, now, staleCutoff],
  );
  return rows.length > 0;
}

/** Mark a claimed key completed with its result. Call ONLY after the claimed work succeeds. */
export async function completeIdempotencyKey(
  account_id: string,
  key: string,
  response: string,
): Promise<void> {
  await sql.run(
    `UPDATE idempotency_keys SET response = ?, status = 'completed'
      WHERE account_id = ? AND idempotency_key = ? AND status = 'pending'`,
    [response, account_id, key],
  );
}

/**
 * Release a claim without completing it — the claimed work failed, or the
 * claim was made but the request ended before the work could run (e.g. a
 * payment-required challenge). Deletes the pending row so the SAME logical
 * retry can claim it again immediately, instead of waiting out the
 * stale-claim window.
 */
export async function releaseIdempotencyKey(account_id: string, key: string): Promise<void> {
  await sql.run(
    `DELETE FROM idempotency_keys WHERE account_id = ? AND idempotency_key = ? AND status = 'pending'`,
    [account_id, key],
  );
}

/** Delete expired keys. Best-effort housekeeping; safe to call periodically. */
export async function pruneIdempotencyKeys(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - TTL_MS).toISOString();
  const info = await sql.run(`DELETE FROM idempotency_keys WHERE created_at < ?`, [cutoff]);
  return info.rowCount;
}
