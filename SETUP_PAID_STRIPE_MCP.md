# External Setup — Paid (PAI'D) · Stripe · MCP

> **[2026-07-26]** Track A1 (direct-Stripe checkout price creation) is
> superseded by PAI'D-only checkout -- see its own annotation below. The
> rest of this runbook (webhook, PAI'D, Render env, MCP distribution, ops)
> remains current.

**Scope:** the dashboard / account / CLI steps that **only you can do** (they live outside
this repo — Stripe, PAI'D, Render, npm, the MCP registry). The code is already wired; what's
missing is the external configuration that turns it on. Work top-to-bottom — each track
depends on the ones above it.

**Owner:** Jonathan Arvay · **API host:** `https://axis-api-6c7z.onrender.com` ·
**Web host:** `https://iliad.trustfabric.ai`

---

## 0. What's already done vs. what you must do

| Already in code (no action) | You must do externally (this doc) |
|---|---|
| PAI'D hosted-checkout client + webhook receiver (`paid-handlers.ts`, commit `bcb97ab`) | Set PAI'D secrets + take the PAI'D merchant live |
| Stripe checkout + webhook handlers (`stripe.ts`) | Create Stripe products/prices, set the webhook + price-ID env vars |
| Deny-by-default entitlements (`AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS=false`) | Set the secret env vars on Render and redeploy |
| Per-call metering + x402/MPP 402 negotiation (`@axis/mpp`, `meterMcpToolCredits`) | Nothing — already live once an account exists |
| MCP server + `server.json` manifest + discovery endpoints | Publish to the MCP registry, Glama, Smithery |
| `iliad-md` zero-dep CLI (the free funnel) | `npm publish` it |

> **Two code-side gaps** are **not** in this checklist because I (Claude) do them in-repo, not
> you in a dashboard — see the chat message: (1) the `mcp_usage` persistence table for your
> tracking dashboard, (2) the 3 missing discovery routes (`ai-plugin.json`,
> `oauth-protected-resource`, `/agents.json`) that are throwing the 404s in your logs.

---

## Pre-flight — credentials you need open in tabs

- [ ] Stripe Dashboard (test mode **and** live mode) — <https://dashboard.stripe.com>
- [ ] PAI'D / Trust Fabric merchant dashboard (the `axis-pai-paid-api-main` service)
- [ ] Render Dashboard → `axis-api` service → Environment
- [ ] npm account, logged in (`npm whoami`)
- [ ] MCP registry publisher auth (`mcp-publisher login github`)
- [ ] A throwaway test repo + one real card you can refund

---

## Track A — Stripe (the settlement rail) **[REVENUE]**

Stripe moves the actual money. PAI'D and the per-call x402 tools both settle through it.

### A1. Create 3 products, each with monthly + annual price

> **[2026-07-26] SUPERSEDED by PAI'D-only checkout** — new subscriptions go
> through PAI'D's hosted checkout (Track B), not this direct-Stripe price
> creation. Not deleted: the six price IDs below may still be load-bearing
> for legacy/existing subscribers created via this path, and Track A2's
> webhook still processes subscription lifecycle events regardless of which
> checkout created them. Do not use this section to set up a NEW deployment's
> checkout flow.

| Product | Monthly | Annual (20% off) | Env vars to record |
|---|---|---|---|
| Axis Starter | $29.00 | $278.40 | `STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_STARTER_ANNUAL` |
| Axis Pro | $99.00 | $950.40 | `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_PRO_ANNUAL` |
| Axis Growth | $299.00 | $2,870.40 | `STRIPE_PRICE_ID_GROWTH`, `STRIPE_PRICE_ID_GROWTH_ANNUAL` |

- [ ] Do it in **test mode first** (`sk_test_…`), validate end-to-end, then repeat in **live mode**.
- [ ] All products/prices **Active** (inactive prices make checkout creation fail).
- [ ] Record the six `price_…` IDs — you paste them into Render in Track C.

### A2. Create one webhook endpoint

- [ ] URL: `https://axis-api-6c7z.onrender.com/v1/webhooks/stripe`
- [ ] Subscribe to **exactly** these 5 events (the handler ignores the rest):
  `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] Copy the `whsec_…` signing secret → you'll set it as `STRIPE_WEBHOOK_SECRET` in Track C.

### A3. Confirm the per-call (x402/MPP) tools need **no** extra Stripe objects

The metered tools (`analyze_repo`, `prepare_agentic_purchasing`, `iliad_web_research`, the
`iliad_*` infra tools, etc.) charge through the MPP flow on `STRIPE_SECRET_KEY` alone.

- [ ] Ensure your Stripe account has the capability the MPP path uses enabled, and that the key is live.
- [ ] No new products/prices for these — confirmed in code.

---

## Track B — PAI'D (the hosted-checkout / control-plane rail) **[REVENUE]**

PAI'D hosts the payment page and settles into Stripe; your backend just creates a session and
redirects. Non-secret values (`PAID_API_BASE_URL`, `PAID_MERCHANT_ID`, the Pro plan IDs) are
**already committed in `render.yaml`** — you only add the two secrets and take the merchant live.

### B1. PAI'D host — RESOLVED (verified same service)

The two hosts are the **same Render service**: `api.trustfabric.ai` is a CNAME onto
`axis-pai-paid-api-main.onrender.com` (both return identical `/health` + root manifest,
`service: "axis-pai-paid-api"`). No mismatch — the old value was already live. `render.yaml`
now uses the custom domain `https://api.trustfabric.ai/v1` (durable across a service rename).

- [ ] **Mirror it in the Render dashboard:** set `PAID_API_BASE_URL=https://api.trustfabric.ai/v1`
      on the `axis-api` service (env var values in the dashboard override `render.yaml`), then redeploy.
      Functionally optional today (both URLs hit the same backend), but keeps dashboard ↔ blueprint in sync.

### B2. Take the PAI'D merchant live

- [ ] Confirm `PAID_MERCHANT_ID` (`acct_7ec95648-…`) is an **onboarding-complete, live** merchant:
      KYC cleared, Trust Fabric admission `onboarding_complete`, live mode enabled.
- [ ] Reference the PAI'D-side runbook: `payment processing/docs/AXIS_MERCHANT_GO_LIVE.md`.

### B3. Set the 2 PAI'D secrets (in Render, Track C — listed here so you have them ready)

- [ ] `PAID_API_KEY` — the merchant `sk_live_…` bearer key
- [ ] `PAID_WEBHOOK_SIGNING_KEY` — the `whsec_…` for inbound webhook verification

> Values already exist in your gitignored `.env.local` — copy them into Render, never commit them.
> No `PAID_API_SECRET` and no publishable key — PAI'D authenticates via the bearer key alone.

### B4. Register the webhook **on the PAI'D side**

- [ ] Point it at `https://axis-api-6c7z.onrender.com/portal/api/paid/webhook`
- [ ] Use the **same** signing key as `PAID_WEBHOOK_SIGNING_KEY`.
- [ ] PAI'D signs `Webhook-Signature: t=<unix>,v1=<hex>` over `"{t}.{body}"`; the receiver rejects
      timestamps older than **300s**, so the PAI'D box clock must be sane.

### B5. Scope note (so you're not surprised)

Today PAI'D processes **Starter monthly**; **Starter annual + Pro + Growth** go Stripe-direct.
To route Pro/Growth through PAI'D too, that's a small code change (`PAID_PLAN_ID` in
`paid-handlers.ts` + lift the `planId === "starter"` gate) — flag me when you want it.

---

## Track C — Render env + redeploy (activation) **[REVENUE]**

> **Production lags `main` by several releases.** Set every env var **first**, then redeploy **once**.

In Render → `axis-api` → Environment, set/confirm:

**Secrets (`sync:false` — must be entered by hand):**
- [ ] `AXIS_TOKEN_KEY` — generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
      → save in your password manager (losing it orphans every encrypted GitHub token).
- [ ] `STRIPE_SECRET_KEY` (live `sk_live_…`)
- [ ] `STRIPE_WEBHOOK_SECRET` (the `whsec_…` from A2)
- [ ] `MPP_SECRET_KEY` — any 32-byte hex; keeps x402 challenge signing stable across restarts.
- [ ] `PAID_API_KEY`, `PAID_WEBHOOK_SIGNING_KEY` (from B3)
- [ ] The six `STRIPE_PRICE_ID_*` values (from A1)
- [ ] `ADMIN_API_KEY` — strong random secret (`openssl rand -hex 32`). This is the **only**
      thing that unlocks the private analytics dashboard (`/v1/admin/*`, incl. the MCP-usage
      panel). Sign in to the web AdminPage with **this exact key** as your API key. Anyone
      without it gets 403; if it's unset, every admin endpoint returns 403 (fails closed).
      Keep it out of git.

**Confirm already-correct values:**
- [ ] `AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS=false`  ← **must stay false in prod** (this is what forces payment)
- [ ] `NODE_ENV=production`
- [ ] `PAID_API_BASE_URL` matches your B1 decision

**Redeploy:** Manual Deploy → "Deploy latest commit" (or push
`ghcr.io/lastmanupinc-hub/axis-api:latest` and trigger). Then verify **without leaking secrets**:

```sh
curl https://axis-api-6c7z.onrender.com/v1/health
curl https://axis-api-6c7z.onrender.com/portal/api/paid/config     # expect {"configured":true}

# create a free account, then start a checkout (expect 201 + checkout_url):
curl -X POST https://axis-api-6c7z.onrender.com/v1/checkout \
  -H "Authorization: Bearer <key-from-POST-/v1/accounts>" \
  -H "Content-Type: application/json" -d '{"plan_id":"starter"}'
```

- [ ] `/v1/health` → 200
- [ ] `/portal/api/paid/config` → `{"configured":true}` (false ⇒ a PAI'D var is missing)
- [ ] `/v1/checkout` → 201 + `checkout_url`

---

## Track D — MCP distribution + the free funnel (this is what's actually starving revenue)

No installs ⇒ no traffic ⇒ nothing to convert. These steps create the top of the funnel.

### D1. npm publish — the free `npx iliad-md` command **[FUNNEL TOP]**

```sh
npm whoami                          # right account?
pnpm --filter iliad-md build
cd packages/iliad-md && npm publish --access public
npx iliad-md@latest --help          # verify from a clean dir / other machine
```

- [ ] Published, and `npx iliad-md@latest` works from a fresh directory.
- [ ] (Optional) also publish `@axis/mpp` and `@axis/sdk` per `V1_LAUNCH_TODO.md`.

### D2. MCP registry publish

```sh
mcp-publisher publish               # manifest = server.json at repo root
# if auth expired (tokens on disk since April):
mcp-publisher login github && mcp-publisher publish
```

- [ ] Listing appears; the `remotes` URL `https://axis-api-6c7z.onrender.com/mcp` answers an
      `initialize` request.

### D3. Glama + Smithery submissions (do **after** D2 — both crawl `server.json`)

- [ ] Smithery: <https://smithery.ai> → submit server
- [ ] Glama: <https://glama.ai/mcp/servers> → submit server
- [ ] Use the ready copy in `seo-distribution-playbook.md` lines 15–34 (description, tags, endpoints).

### D4. GitHub App + Marketplace Action (the second funnel) **[FUNNEL]**

- [ ] Create the GitHub App from `.github/app-manifest.json`; set `GITHUB_WEBHOOK_SECRET` in **both**
      GitHub App settings and Render (endpoint returns 503 until set).
- [ ] Publish the `context-freshness` Action to the Marketplace from its **standalone** public repo
      (Marketplace requires `action.yml` at repo root + a semver tag `git tag -a v1 -m v1`).

---

## Track E — Ops + final smoke test (before you announce)

### E1. Backups + uptime (10 minutes, don't skip — Render starter instances restart)

- [ ] Daily SQLite backup of `/data/axis.db` (`scripts/backup-db.sh` sketch in `LAUNCH_RUNBOOK.md`),
      and **restore-test it once**.
- [ ] UptimeRobot/Better Stack monitor on `/v1/health` + the web root, alerting to email + phone.

### E2. One real end-to-end transaction (trust the dashboard, not the 200)

- [ ] Subscribe to Starter with a **real card** → land on PAI'D's hosted page → pay.
- [ ] **Confirm the charge in Stripe** (PaymentIntent visible) — a 200 alone is not proof.
- [ ] Account tier flips to `paid` after `checkout.session.completed`, and a row appears in
      `tier_changes` with source `paid_webhook`.
- [ ] Refund the test charge.

### E3. Full-funnel dry run as a stranger

- [ ] `npx iliad-md` in a fresh repo → artifacts generated.
- [ ] `POST /v1/accounts` → key → MCP `tools/list` → one **free** tool call (e.g. `list_programs`).
- [ ] One **paid** MCP call with no credits → confirm you get the x402 / payment-required negotiation.
- [ ] Uptime green; backup exists and restores.

---

## Dependency order (the critical path to first dollar)

```
A (Stripe prices+webhook) ─┐
B (PAI'D live + secrets) ──┼─► C (Render env + redeploy) ─► E2 (live test txn)  ◄── first $
                           │
D1 (npm publish) ──────────┴─► D2 (MCP registry) ─► D3 (Glama/Smithery)  ◄── funnel that feeds it
D4 (GitHub App/Action) ─────────────────────────────────────────────────┘
```

**Minimum to accept money:** A → B → C → E2.
**Minimum to *earn* money:** also D1 → D2 → D3 (distribution), or there's no traffic to convert.

---

## Verification quick-reference

| Check | Command / location | Pass |
|---|---|---|
| API up | `curl …/v1/health` | 200 |
| PAI'D configured | `curl …/portal/api/paid/config` | `{"configured":true}` |
| Checkout works | `POST /v1/checkout {"plan_id":"starter"}` | 201 + `checkout_url` |
| Stripe webhook | Stripe Dashboard → webhook → Recent deliveries | 2xx |
| PAI'D webhook | one live txn → `tier_changes` row `paid_webhook` | row exists |
| MCP discoverable | `mcp-publisher` listing + `/mcp` `initialize` | responds |
| Free funnel | `npx iliad-md@latest --help` from clean dir | help prints |
| Entitlements locked | `POST /v1/accounts {"tier":"paid"}` without payment | **402** |
