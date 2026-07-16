# Rollback Runbook

## Section 1 — Database: Neon Postgres PITR / branch-restore (H8.7)

**Status: procedure documented, drill NOT yet executed against the live
project — this is a disclosed owner action, not silently done or silently
skipped.** Escalating per the spec's own named condition ("Escalate if no
Neon credential label exists"): this environment has only `DATABASE_URL` (a
bare Postgres connection string, dashboard-set with `sync: false` in
`render.yaml`) — no `NEON_API_KEY` or equivalent Neon-console/API credential
exists anywhere in this repo's env inventory (`docs/SECURITY_ROTATION.md`),
`render.yaml`, or this session's environment. A Postgres connection string
cannot create, list, or delete a Neon branch — that requires the separate
Neon API (`https://console.neon.tech/api/v2`) or the `neonctl` CLI, both of
which authenticate with a Neon API key, not a database password. Creating and
deleting a real branch on the live project is therefore an action only the
project owner (with console access) can perform.

### What PITR/branching means on Neon (platform capability, not project-specific)

Neon separates storage from compute: every project's data lives in a
continuous, versioned history, and a "branch" is a cheap, copy-on-write
reference into that history — creating one does not copy data, so it's fast
and does not double storage cost the way a traditional snapshot-restore does.
Two restore mechanisms, both branch-based:

- **Instant restore** (Neon's own built-in PITR): from the Neon Console or API,
  restore the project's **default branch itself** to any point within the
  retention window, in place. This is what you'd use for an actual incident.
- **Branch-from-timestamp**: create a **new, separate branch** rooted at a
  specific past timestamp (or LSN), leaving the current default branch
  untouched. This is the safer choice for a *drill* — it never touches
  production data, and the drill branch is deleted afterward.

Retention window (how far back you can go) is a property of the specific
Neon project's plan/settings — **unverified for this project without console
access**; do not assume a specific number of days without checking the Neon
Console → Project → Settings → Storage (or `neonctl branches list` /
the "Restore" tab) directly.

### The drill procedure (to be run by the owner, console or `neonctl`)

1. **Confirm PITR/branching is enabled and note the retention window** — Neon
   Console → the project → Branches tab (branching is a core feature on every
   plan; the number that varies by plan is the retention window). Record
   the actual window here once checked (currently unverified).
2. **Create a branch at T-minus-15-minutes**:
   - Console: Branches → Create Branch → Source: `main` (or whatever the
     current default branch is named) → Point in time: now minus 15 minutes
     → Create.
   - CLI equivalent: `neonctl branches create --project-id <id> --parent main --timestamp <ISO 8601, now-15m>`
3. **Verify row counts on 3 core tables**, connecting to the NEW branch's own
   connection string (Neon issues a distinct connection string per branch —
   never reuse the production `DATABASE_URL` for this step):
   ```sql
   SELECT 'accounts' AS t, COUNT(*) FROM accounts
   UNION ALL SELECT 'snapshots', COUNT(*) FROM snapshots
   UNION ALL SELECT 'payment_receipts', COUNT(*) FROM payment_receipts;
   ```
   These three were chosen to span the product's data classes: `accounts`
   (identity), `snapshots` (core product data), `payment_receipts` (financial
   data — see `payment-receipts-store.ts`, WO-19). Record the three counts
   and compare them to the production values at the same moment (they should
   match, modulo the 15-minute lag — any material divergence beyond normal
   15-minute write volume is itself a finding worth investigating before
   trusting PITR for a real incident).
4. **Delete the branch** — Console: Branches → the drill branch → Delete.
   CLI: `neonctl branches delete --project-id <id> <branch-id>`. Confirm it's
   gone (`neonctl branches list` no longer shows it) — a drill branch left
   behind is a small ongoing storage cost and, more importantly, an
   unaccounted-for copy of production data sitting around.
5. **Record evidence here**: timestamps (drill start, branch-created-at,
   branch-deleted-at) and the 3 row counts, once actually run.

_Drill evidence: none yet — pending owner execution (see Status above)._

## Section 2 — Deploy rollback (H8.8)

_Not yet written — tracked as the next HARDEN_POLISH_LOOP unit._
