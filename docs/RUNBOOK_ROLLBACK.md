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

*Drill evidence: none yet — pending owner execution (see Status above).*

## Section 2 — Deploy rollback (H8.8)

**Standing rule, above everything else in this section: CI red after your
push is priority zero — nothing else proceeds until it's green again.** A
rollback is not a substitute for fixing forward; it's what buys the time to
fix forward without users sitting on a broken deploy. Every push this repo's
own workflow makes already ends with a CI-status check for exactly this
reason (see `HARDEN_POLISH_LOOP.md`'s own governing rule).

axis-api and axis-web deploy via two independent paths (confirmed from
`render.yaml` and `.github/workflows/ci.yml`):

- **axis-api (Render)**: Render's own Blueprint `autoSync` watches `main`
  directly and builds from `./Dockerfile` on every push — this is
  independent of GitHub Actions (the `deploy-api`/`docker-build` GHA jobs are
  break-glass-only, gated on manual `workflow_dispatch`, per their own
  comments in `ci.yml`; they do NOT run on a normal push). **Always verify a
  deploy via Render's own `/deploys` API** (`GET
  https://api.render.com/v1/services/<id>/deploys`), not `gh run` status or
  elapsed time — this is a standing lesson from a prior incident (see
  `[[render-deployment-audit]]`).
- **axis-web (Cloudflare Pages)**: deployed by the `deploy-web` job in
  `ci.yml` via `wrangler pages deploy` on every push to `main`.

### Rollback path 1 (default) — git-revert-and-push

Works identically for both surfaces, since a revert commit triggers the exact
same CI/deploy pipeline as any other push — no extra credential beyond normal
repo push access, which every unit in this loop already uses.

```bash
git revert <bad-commit-sha> --no-edit   # or a range: <old>..<bad>
git push origin HEAD:main
```

Then follow this repo's standing post-push discipline exactly as for a
forward push: poll GitHub Actions to completion, confirm axis-api via
Render's `/deploys` API (not elapsed time), and re-run
`scripts/live-probe.mjs` (H6.3) against production before considering the
rollback complete.

### Rollback path 2 — API: Render "redeploy a previous deploy"

Render retains a deploy history per service (Dashboard → `axis-api` →
Deploys tab). Selecting an older, previously-successful deploy and choosing
**Redeploy** rebuilds and serves that exact prior commit's image WITHOUT
requiring a new git commit — faster than a revert when the fix is "go back
to what was running 10 minutes ago," at the cost of the git history not
reflecting the rollback (a git-revert should still follow once the
immediate incident is contained, so `main` and production don't diverge
silently). **Requires Render dashboard or API access this environment does
not have** (only a Postgres connection string is available here, not a
Render API key) — this path is documented for the owner to use directly; it
was not (and could not be) rehearsed from this session.

### Rollback path 3 — Web: Cloudflare Pages "rollback to this deployment"

Cloudflare Pages similarly retains every deployment (Dashboard → Pages →
`axis-web` → the deployment list) and offers an instant "Rollback to this
deployment" action — no rebuild, near-immediate. **Same caveat as path 2**:
requires Cloudflare dashboard or API access (`CLOUDFLARE_API_TOKEN` is a
GitHub Actions secret, not available in this session) — documented, not
rehearsed here.

### Rehearsal (H8.8 acceptance: rehearsal evidence or explicit deferral)

Rehearsed **path 1 (git-revert-and-push)** for real, since it needs no
credential this session lacks — the only path of the three that could
actually be exercised end-to-end here. Paths 2 and 3 are documented above
but explicitly deferred to the owner (see PENDING-OWNER below) since they
need dashboard/API access this environment doesn't have; the underlying
mechanism (both platforms retain deploy history and support a one-click
prior-deploy redeploy) is standard, well-documented platform behavior, not
something this repo's own code could misconfigure.

**Rehearsal evidence (2026-07-16, real production `main`):**

- Forward: `d0417de` (adds `docs/.rollback-rehearsal-marker`, an inert file
  with zero runtime effect) pushed at `2026-07-16T22:31:10Z`. CI: `success`
  (both the `CI` and `Compliance Check` workflows). Live health check
  (`GET /v1/health`, `GET /v1/health/ready`) confirmed `ok`/`ready`
  post-deploy.
- Revert: `git revert d0417de --no-edit` → `e720eb1`, pushed at
  `2026-07-16T22:44:57Z`. CI: `success` (both workflows). Live health check
  confirmed `ok` again post-deploy.
- Mid-rehearsal finding, not a code bug: the `gh` CLI's stored credential
  went invalid partway through (`gh auth status` — "The token in keyring is
  invalid," persisting across retries; not a GitHub outage, confirmed via
  githubstatus.com showing all-green). Workaround used instead: this repo is
  **public**, so `curl https://api.github.com/repos/.../actions/runs` needs
  no auth at all — every status check above used that unauthenticated
  endpoint. Worth knowing for a real incident: if `gh` is ever unusable,
  the public REST API is a working fallback for a public repo without
  waiting on re-authentication.

**PENDING-OWNER**: rehearse rollback paths 2 (Render dashboard redeploy) and
3 (Cloudflare Pages dashboard rollback) directly — both need owner-held
dashboard/API access this session does not have.
