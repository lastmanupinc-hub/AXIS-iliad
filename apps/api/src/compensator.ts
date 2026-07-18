// Compensator — WO-20 phase 3, H2.4.
//
// The other half of the charge-integrity saga: H2.2/H2.3 are the PRODUCERS
// (they write an 'owed' row the instant money and work go asymmetric). This
// module is the COMPENSATOR — it claims an owed row (at-most-once, via
// claimCompensationForCredit's conditional UPDATE) and grants the account
// usage-credit headroom equal to the owed cents, per WO-20's default make-good
// ("usage-credit grant... instant, no processor dependency, no PCI surface").
//
// Triggered LAZILY — called wherever an account's _usage envelope is built
// (mcp-server.ts) — instead of a standalone sweep process, so no new
// background infra is needed: an account with owed compensation is made whole
// on its very next call, and the ledger is the durable record if that never
// comes (visible via listOwedCompensation for an operator sweep).
import { getAccount, claimCompensationForCredit, revertCompensationClaim, grantUsageCredits, listOwedCompensationForAccount, getCompensationSummary } from "@axis/snapshots";
import { log } from "./logger.js";

/**
 * Claim ONE owed entry and grant its account usage-credit headroom.
 * At-most-once: claimCompensationForCredit's conditional UPDATE guarantees
 * only the caller that wins the 'owed' -> 'credited' transition proceeds to
 * grant; every other (concurrent or replayed) call sees null and does nothing.
 * Returns true if this call performed the grant, false if there was nothing
 * to claim (already resolved, or not owed).
 *
 * H-Phase-A cycle 8: the claim and the grant are still two separate
 * operations (not one shared transaction — grantUsageCredits owns its own
 * internal sql.tx), so a failure between them is possible in principle. If
 * the grant throws, revert the claim back to 'owed' so the next lazy sweep
 * (compensateAccountOwed) retries this entry instead of leaving it
 * permanently stuck 'credited' with no credit actually granted — the exact
 * failure mode this compensation system exists to prevent, previously
 * possible in its own recovery path.
 */
export async function compensateEntry(entry_id: string): Promise<boolean> {
  const claimed = await claimCompensationForCredit(entry_id);
  if (!claimed) return false;
  try {
    const account = await getAccount(claimed.account_id);
    const tier = account?.tier ?? "free";
    await grantUsageCredits(claimed.account_id, tier, claimed.amount_cents);
    return true;
  } catch (err) {
    await revertCompensationClaim(entry_id).catch((revertErr) => {
      log("error", "compensation_revert_failed", {
        entry_id,
        account_id: claimed.account_id,
        original_error: err instanceof Error ? err.message : String(err),
        revert_error: revertErr instanceof Error ? revertErr.message : String(revertErr),
      });
    });
    throw err;
  }
}

/**
 * Sweep every owed entry for ONE account (bounded — an account accumulating
 * more than `limit` owed entries between calls is itself worth an operator
 * look, not a bigger page size). Failures are logged and skipped, never
 * thrown — a compensation hiccup must not break the caller's actual request.
 */
export async function compensateAccountOwed(account_id: string, limit = 10): Promise<void> {
  const owed = await listOwedCompensationForAccount(account_id, limit);
  for (const entry of owed) {
    try {
      await compensateEntry(entry.entry_id);
    } catch (err) {
      log("warn", "compensation_grant_failed", {
        entry_id: entry.entry_id,
        account_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Convenience for the _usage envelope: run the lazy sweep for this account,
 * then return its post-sweep summary. Never throws (a compensation hiccup
 * must not break the tool response it's attached to).
 */
export async function compensateAndSummarize(
  account_id: string,
): Promise<{ owed_cents: number; credited_cents: number }> {
  try {
    await compensateAccountOwed(account_id);
  } catch (err) {
    log("warn", "compensation_sweep_failed", {
      account_id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return getCompensationSummary(account_id);
}
