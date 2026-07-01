# SPEC-02 — Wire `meterPersistenceOp` at the version REST surface

**Goal:** activate the reserved economic surface. Version persistence
operations consume persistence credits for paid tiers and refuse cleanly for
free tier. No new pricing logic — the metering function already encodes all
policy (free-tier refusal, costs, suite monthly grant).

## Read first
`apps/api/src/versions.ts` (all three handlers), `packages/snapshots/src/
persistence-metering.ts:95-140` (`meterPersistenceOp` + `PERSISTENCE_CREDIT_COSTS`
— note which op names exist), `apps/api/src/billing.ts` `resolveAuth` usage in
sibling handlers (copy the house auth idiom).

## Behavior (exact)

1. `handleDiffVersions` (`versions.ts:60`): after auth resolution and BEFORE
   computing the diff, call
   `meterPersistenceOp(account.account_id, account.tier, "diff_versions", snapshot_id)`.
   - `{ok:true}` → proceed unchanged.
   - `{ok:false, reason}` → respond **402** JSON:
     `{ error: "persistence_credits_required", reason }` and return.
   - Anonymous callers: keep the handler's CURRENT anonymous behavior if it
     already rejects; if it currently allows anonymous reads, meter only
     authenticated calls and leave anonymous behavior untouched (note which
     branch you found in the PR body).
2. The version **write** path: locate where generated-file versions are saved
   (grep `saveGeneratedFileVersion|insert.*versions` in `apps/api/src` +
   `packages/snapshots/src`). If the write happens in a REST handler, meter
   `"save_version"` there with the same 402 contract. **If the write happens
   implicitly inside generation** (not a user-initiated persistence op), DO NOT
   meter it — record that finding in `WORK_ORDERS.yaml` evidence and the PR
   body, and meter only the diff path. (STOP rule §6.1 does not apply here;
   this fork is pre-authorized.)
3. `handleListVersions` / `handleGetVersion`: explicitly NOT metered (reads).
4. On every successful metered op:
   `trackEvent(account_id, "persistence_metered", "revenue", {op, snapshot_id})`
   best-effort (`.catch` swallow).

## Tests (write first — extend/create `apps/api/src/versions.test.ts`)

(1) free-tier account → diff returns 402 with `persistence_credits_required`
and the upgrade reason; (2) paid account with credits → diff succeeds AND the
persistence ledger shows the debit; (3) paid account with zero credits →
402; (4) list/get remain un-metered for the same free account (200/404
semantics unchanged). Use the existing test helpers for account creation
(`createAccount`, `updateAccountTier`, credit grant via the store the metering
module uses — read its test file for the grant helper).

## Guards
Do not touch `persistence-metering.ts` itself. Do not change
`PERSISTENCE_CREDIT_COSTS`. If `versions.ts` has no auth today and adding it
changes public behavior beyond the 402 contract, STOP and report. ~120 LOC.
