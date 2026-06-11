# Launch Runbook — Axis Iliad (Manual Steps, Solo Founder)

Ordered checklist of every manual step required to go live. Steps are ordered by
dependency: each step assumes the ones above it are done. Steps tagged
**[REVENUE]** directly unblock money coming in; tags like **[FUNNEL]** unblock the
free-tier acquisition path that feeds revenue.

Sources of truth referenced below (read them before executing the step):

- `STRIPE_CHANGES_REQUIRED.md` — exact Stripe products/prices/webhooks
- `render.yaml` — current production env-var surface
- `server.json` (repo root) — MCP registry manifest for `mcp-publisher`
- `.github/app-manifest.json` — GitHub App settings
- `seo-distribution-playbook.md` lines 15–34 — ready-to-paste directory copy

---

## Step 0 (a) — Package name (DECIDED — blocks Steps 4, 6, 7, 10)

**Decision made:** npm package name is **`iliad-md`**, installed bin command is
**`iliad`**. All launch copy and docs use `npx iliad-md` (npx resolves the
package name, not the bin name).

The bare `iliad` name on npm is squatted by an abandoned v0.0.0 package
(dkolba, 2022). If the bare name is ever wanted, pursue it via npm's
package-name dispute process (<https://docs.npmjs.com/policies/disputes>) —
do NOT block launch on it.

The rename is applied in the repo: `packages/iliad-md/package.json` has
`"name": "iliad-md"` and `"bin": { "iliad": "./dist/cli.js" }`; the marker
line, CLI help, action defaults, and this runbook all reference the new name.

---

## Step 1 (g) — Stripe: create the six prices **[REVENUE]**

Per `STRIPE_CHANGES_REQUIRED.md` (follow it exactly; summary below). In the Stripe
Dashboard create three products, each with a monthly and an annual recurring price:

| Product | Monthly | Annual (20% off) | Env vars |
|---|---|---|---|
| Axis Starter | $29.00 | $278.40 | `STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_STARTER_ANNUAL` |
| Axis Pro | $99.00 | $950.40 | `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_PRO_ANNUAL` |
| Axis Growth | $299.00 | $2,870.40 | `STRIPE_PRICE_ID_GROWTH`, `STRIPE_PRICE_ID_GROWTH_ANNUAL` |

Then:

1. Keep all products/prices **active** (inactive prices fail checkout creation).
2. Verify the webhook endpoint exists:
   `https://axis-api-6c7z.onrender.com/v1/webhooks/stripe`, subscribed to exactly:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`. Copy the `whsec_...` into `STRIPE_WEBHOOK_SECRET`
   (set in Step 2).
3. No new Stripe objects are needed for the per-call x402/MPP tools
   (`iliad_web_research`, `iliad_web_research_crawl`) — they charge through the
   MPP flow using `STRIPE_SECRET_KEY` only.
4. Do the whole thing in test mode first (`sk_test_...`), then repeat in live mode.

Record the six `price_...` IDs — you set them in Render in the next step.

---

## Step 2 (h) — Render env + redeploy **[REVENUE]**

Production is several releases behind `main`. Set env vars FIRST, then redeploy once.

In the Render dashboard for the `axis-api` service → Environment:

1. **`AXIS_TOKEN_KEY`** — encryption key for stored GitHub tokens. Generate:

   ```sh
   openssl rand -hex 32
   # no openssl on Windows? equivalent:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Save the value in your password manager — losing it orphans every encrypted
   GitHub token at rest.

2. **`AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS=false`** — must be `false` in production
   so entitlements only come from billing, never self-asserted.

3. **The six `STRIPE_PRICE_ID_*` vars** from Step 1, plus confirm
   `STRIPE_SECRET_KEY` (live key), `STRIPE_WEBHOOK_SECRET`, and `MPP_SECRET_KEY`
   are set (the latter keeps x402 challenge signing stable across restarts).

4. **Verify the production flag:** `NODE_ENV=production` (already in
   `render.yaml`; confirm it survived in the dashboard).

5. **Redeploy:** Manual Deploy → "Deploy latest commit" (or push the current
   image to `ghcr.io/lastmanupinc-hub/axis-api:latest` and trigger). After deploy:

   ```sh
   curl https://axis-api-6c7z.onrender.com/v1/health
   curl -X POST https://axis-api-6c7z.onrender.com/v1/checkout \
     -H "Authorization: Bearer <test-key>" -H "Content-Type: application/json" \
     -d '{"plan_id":"starter"}'          # expect 201 + checkout_url
   ```

   Run the full 6-combination checkout validation from
   `STRIPE_CHANGES_REQUIRED.md` section 6.

---

## Step 3 (e) — GitHub App: create, secret, test install **[FUNNEL]**

Uses `.github/app-manifest.json` as the source of values. Without this,
`/v1/github/webhook` never receives events.

1. Go to <https://github.com/settings/apps/new> and create the app with the
   manifest's values:
   - Name: `Axis Iliad Compliance`
   - Homepage: `https://axis-iliad.jonathanarvay.com`
   - Webhook URL: `https://axis-api-6c7z.onrender.com/v1/github/webhook`, active
   - Callback/redirect: `https://axis-iliad.jonathanarvay.com/install/github/callback`
   - Events: `push`, `pull_request`
   - Permissions: checks **write**, contents **read**, metadata **read**,
     pull requests **read**
   - Public app: yes
2. Generate a webhook secret and set it in BOTH places:

   ```sh
   openssl rand -hex 32
   ```

   - GitHub App settings → Webhook secret
   - Render env → `GITHUB_WEBHOOK_SECRET` (the endpoint returns 503 until set;
     GitHub auto-retries, so no events are lost, but nothing works either)
3. Install the app on a throwaway test repo, push a commit, and confirm:
   - GitHub App → Advanced → Recent Deliveries shows a 2xx,
   - an "Axis Compliance: <grade>" Check Run appears on the head commit.

---

## Step 4 (i) — Ops: backups + uptime monitor (before traffic arrives)

### Daily SQLite backup

The Render persistent disk (`/data`, holds `axis.db`) attaches to the web service
only — a separate Render Cron Job service cannot mount the same disk. Two workable
patterns; (A) is simplest:

**(A) In-container cron via Render's native cron-on-service or a start-script
sidecar loop** — sketch (`scripts/backup-db.sh`, runs inside the service container):

```sh
#!/bin/sh
# Daily SQLite backup — safe online backup via sqlite3 .backup
set -eu
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /data/backups
sqlite3 /data/axis.db ".backup '/data/backups/axis-$STAMP.db'"
# keep 14 days locally; the disk is only 1 GB so pruning matters
find /data/backups -name 'axis-*.db' -mtime +14 -delete
# OPTIONAL but recommended: ship off-box to R2 using the existing presign path
# curl -X PUT "$(presigned R2 URL)" --data-binary @/data/backups/axis-$STAMP.db
```

**(B) Render Cron Job service hitting an admin maintenance endpoint** that runs
`.backup` server-side and uploads to R2 — preferable long-term because the backup
leaves the box.

Either way: restore-test the backup once (`sqlite3 restored.db ".tables"`) before
calling this done.

### Uptime monitor

Create a monitor on `https://axis-api-6c7z.onrender.com/v1/health` (UptimeRobot
free tier or Better Stack): interval 1–5 min, alert to email + phone push. Add a
second monitor on the web frontend root. Done in 10 minutes; do not skip — Render
starter-plan instances do restart.

---

## Step 5 (b) — npm publish **[FUNNEL — the free `npx` command is the top of the funnel]**

The Step 0 name decision (`iliad-md`) is already applied in
`packages/iliad-md/package.json`:

```sh
# from repo root
npm whoami                            # confirm you're logged in as the right user
pnpm --filter iliad-md build          # build the package via the workspace filter
cd packages/iliad-md
npm publish --access public
```

Verify:

```sh
npx iliad-md@latest --help            # from a clean directory / different machine
```

Optional same-session follow-ups (already prepped per `V1_LAUNCH_TODO.md`):
`pnpm --filter @axis/mpp publish --access public` and the same for `@axis/sdk`.

---

## Step 6 (c) — MCP registry publish

The manifest is `server.json` at the repo root
(`io.github.lastmanupinc-hub/axis-iliad`, v0.5.3).

```sh
# from repo root
mcp-publisher publish
```

**Note:** login tokens have been on disk since April — they may have expired. If
publish fails with an auth error:

```sh
mcp-publisher login github
mcp-publisher publish
```

Verify the listing appears in the registry and that the `remotes` URL
(`https://axis-api-6c7z.onrender.com/mcp`) answers an `initialize` request.

---

## Step 7 (d) — Glama / Smithery submissions

Use the ready-to-paste copy in **`seo-distribution-playbook.md` lines 15–34**
("Smithery Submission Pack"): the two-sentence description, the suggested tags
(`mcp`, `ai-agents`, `codebase-analysis`, `agentic-commerce`,
`autonomous-purchasing`, `developer-tools`), the primary endpoint, and the two
discovery endpoints. Submit the same pack to both:

- **Smithery:** <https://smithery.ai> → submit server (manual review form)
- **Glama:** <https://glama.ai/mcp/servers> → submit server

Both crawl `server.json` metadata, so do this AFTER Step 6.

---

## Step 8 (f) — GitHub Marketplace listing for the context-freshness Action

The compliance-check Action already lives at
`.github/actions/compliance-check/action.yml`; the context-freshness Action ships
from its own public repo (Marketplace requires the Action in a standalone repo
with `action.yml` at the root).

1. Create/verify the public Action repo with `action.yml` at root, README with a
   usage snippet, and a semver tag:

   ```sh
   git tag -a v1 -m "v1" && git push origin v1
   ```

2. On the repo → Releases → "Draft a release" → check **"Publish this Action to
   the GitHub Marketplace"**, pick categories (Continuous integration, Code
   quality), confirm the branding `icon`/`color` fields exist in `action.yml`.
3. Verify the listing renders and `uses: <org>/<repo>@v1` works from the Step 3
   test repo.

---

## Step 9 — Final pre-announcement smoke test

Run through the entire funnel once as a stranger:

1. `npx iliad-md` in a fresh repo → artifacts generated.
2. `POST /v1/accounts` → key → MCP `tools/list` → one free tool call.
3. Checkout a Starter plan with a real card in live mode, then refund it.
4. Uptime monitor green; backup file from Step 4 exists and restores.

---

## Step 10 (j) — Launch posts (everything above must be done first)

All copy points at the free command: **`npx iliad-md`**. One-line drafts:

- **Product Hunt:** "iliad — one `npx` command turns any repo into AGENTS.md,
  CLAUDE.md, and .cursorrules your coding agent actually uses."
- **Show HN:** "Show HN: Iliad – generate AGENTS.md/CLAUDE.md for any repo
  with one npx command"
- **r/ClaudeAI:** "Stop hand-writing CLAUDE.md — `npx iliad-md` generates it from
  your actual codebase (free, no signup)."
- **r/cursor:** ".cursorrules + AGENTS.md generated from your codebase in one
  command: `npx iliad-md` — feedback welcome."
- **awesome-agents-md PR:** add the entry:
  `- [iliad-md](https://github.com/lastmanupinc-hub/axis-iliad) — Generate AGENTS.md (plus CLAUDE.md and .cursorrules) from any repository with one command: npx iliad-md.`

Additional channel copy
(r/mcp, r/LocalLLM, r/AI_Agents) is pre-written in `seo-distribution-playbook.md`.

Timing: Show HN Tuesday ~8:00 AM PT; Product Hunt 12:01 AM PT same day; Reddit
posts staggered over the following 48 h.

---

## Dependency / revenue summary

| Step | Section | Unblocks | Revenue impact |
|---|---|---|---|
| 0 | (a) Naming | 4, 5, 6, 7, 8, 10 | indirect (everything brand-facing) |
| 1 | (g) Stripe prices | 2 | **[REVENUE] — subscriptions cannot exist without it** |
| 2 | (h) Render env + redeploy | 3, 9 | **[REVENUE] — checkout + x402 tools go live here** |
| 3 | (e) GitHub App | 8, 9 | [FUNNEL] |
| 4 | (i) Backups + uptime | safe to take traffic | protects revenue |
| 5 | (b) npm publish | 10 | [FUNNEL] — free tier top-of-funnel |
| 6 | (c) MCP registry | 7 | [FUNNEL] — agent discovery |
| 7 | (d) Glama/Smithery | — | [FUNNEL] |
| 8 | (f) Marketplace Action | — | [FUNNEL] |
| 9 | smoke test | 10 | gate |
| 10 | (j) Launch posts | — | demand |
