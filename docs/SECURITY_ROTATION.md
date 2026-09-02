# Runbook — Credential Rotation (H6.1)

**Scope:** the credentials axis-iliad's own runtime depends on (Render env vars for the
`axis-api` service, GitHub Actions repo secrets, and the Stripe/PAI'D keys those wire in).
This does **not** cover the owner's broader multi-product credential estate (PAI'D's own
infra, Foundry, or unrelated integrations) — only what this repo's deploy pipeline and
running service actually consume.

**No values appear anywhere in this document, on principle** — only credential names,
where each lives, what it's for, and the steps to rotate it. Treat this file as safe to
commit; if a future edit ever adds an actual key/token/secret value to it, that edit is
wrong and must be reverted before merge.

---

## Inventory

### Render (`axis-api` service — see `render.yaml`, every row below is `sync: false`)

| Env var | Purpose |
|---|---|
| `AXIS_TOKEN_KEY` | AES-256-GCM key encrypting stored GitHub OAuth tokens at rest. API fails closed (refuses to encrypt) in production if unset — never silently falls back. |
| `DATABASE_URL` | Neon Postgres connection string. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_CALLBACK_URL` | GitHub OAuth app (web login + private-repo analysis). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth app (web login). Callback URL is a fixed public value, not a secret. |
| `STRIPE_SECRET_KEY` | Stripe API key — subscriptions, checkout, disputes, payment-method reads. See [Stripe restricted-key scope](#stripe-restricted-key-rk_-migration-prep) below. |
| `STRIPE_WEBHOOK_SECRET` | HMAC verification of incoming Stripe webhook payloads. **Not an API credential** — has no Stripe dashboard "permission" of its own, so it's irrelevant to the `rk_` migration below. |
| `MPP_SECRET_KEY` | `mppx` package's own signing secret (Machine Payments Protocol / 402 in-band settlement), unrelated to the Stripe API key. |
| `PAID_API_KEY` | Bearer auth to the PAI'D hosted-checkout processor. |
| `PAID_WEBHOOK_SIGNING_KEY` | HMAC verification of incoming PAI'D webhook payloads. Same "not an API permission" note as `STRIPE_WEBHOOK_SECRET`. |
| `FIRECRAWL_API_KEY`, `REPLICATE_API_TOKEN`, `FASTIO_API_KEY`, `RESEND_API_KEY` | Proxied third-party tool integrations (web scraping, media generation, email). Independent of everything else in this table — rotating one never affects another. |

### GitHub Actions repo secrets (`.github/workflows/*.yml`)

| Secret | Purpose |
|---|---|
| `GITHUB_TOKEN` | Auto-provisioned per-run by GitHub Actions. Not manually managed, not rotatable in the usual sense — nothing to do here. |
| `RENDER_DEPLOY_HOOK_URL` | Break-glass manual deploy trigger for `axis-api` (the `docker-build`/`deploy-api` jobs are `workflow_dispatch`-only — axis-api's real deploy path is Render's own docker-from-Git Blueprint, independent of this). |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | `deploy-web` job's push to Cloudflare Pages. |
| `AXIS_API_KEY` | Used by the Compliance Check workflow. Already rotated once this loop (see [[ci-compliance-gate-perma-red]] in memory) after a prior incident — the rotation procedure below is exactly what was done then. |

---

## Rotation procedures

Each procedure ends the same way: **redeploy, then verify** — a rotated credential that
never reaches the running process is worse than an un-rotated one (silent failure, not a
loud one). Use `GET /v1/health/ready` (checks `payment_rail` and other subsystem presence
without ever exposing a value) as the generic post-rotation check where applicable.

### Render-dashboard secrets (`AXIS_TOKEN_KEY`, `DATABASE_URL`, OAuth client secrets, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MPP_SECRET_KEY`, `PAID_API_KEY`, `PAID_WEBHOOK_SIGNING_KEY`, proxied-tool keys)

1. Mint the new value at the source (Stripe dashboard / GitHub OAuth app settings /
   Google Cloud Console / Neon console / PAI'D dashboard / the tool provider's own
   dashboard, as applicable).
2. Render dashboard → `axis-api` service → **Environment** → update the var. This does
   **not** go through `render.yaml` (every row above is `sync: false` specifically so
   the value never touches the repo).
3. Render auto-redeploys on env var save for this service (confirm via Render's own
   `/deploys` API, not elapsed time — see [[render-deployment-audit]] in memory for why
   `gh run`/wall-clock guessing is unreliable here).
4. Verify: `curl -s https://api.iliad.trustfabric.ai/v1/health/ready | jq` — confirm the
   relevant `checks.*` entry reflects the new configuration state, and exercise one real
   call path if the credential gates something user-facing (e.g. a login round-trip for
   an OAuth secret, a checkout session create for `STRIPE_SECRET_KEY`).
5. Revoke the OLD value at the source once step 4 is green — don't revoke before
   confirming the new one actually works end to end.

### GitHub Actions repo secrets

1. Mint the new value at the source (Cloudflare dashboard for `CLOUDFLARE_API_TOKEN`,
   Render dashboard → deploy hook for `RENDER_DEPLOY_HOOK_URL`, or wherever
   `AXIS_API_KEY`'s issuing system is).
2. GitHub repo → **Settings → Secrets and variables → Actions** → update the secret.
3. Verify on the next workflow run that consumes it (`deploy-web` for the Cloudflare
   pair, the Compliance Check workflow for `AXIS_API_KEY`) — confirm the job succeeds,
   not just that it started.
4. Revoke the old value at the source once verified.

---

## Two standing risks (flagged for the owner, not something this loop can close itself)

Two account-level operational risks were identified during this runbook's authoring —
one around the scope of a shared infrastructure API key, one around account-wide
two-factor auth enforcement. Neither is a code change this repo can make, and neither
detail belongs in a public document (redacted 2026-09-02; full detail is in the owner's
private ops notes). Flagging their existence here so closing them stays a deliberate
decision, not an oversight buried in a private channel only.

---

## Stripe restricted-key (`rk_`) migration prep

Every real (non-generated, non-test) call this repo's own runtime makes to the Stripe
API, enumerated from source — this is the complete, minimal permission set a restricted
key needs; grant nothing broader:

| File | Endpoint | Resource : Permission |
|---|---|---|
| `apps/api/src/stripe.ts` | `POST /v1/checkout/sessions` | **Checkout Sessions : Write** |
| `apps/api/src/stripe.ts` | `GET`/`POST /v1/subscriptions/:id` (price lookup, cancel-at-period-end) | **Subscriptions : Write** (Write covers the Read call too) |
| `apps/api/src/network-token.ts` | `GET /v1/payment_methods/:id` | **Payment Methods : Read** |
| `packages/agentic-compliance/src/dispute-clients.ts` | `GET`/`POST /v1/disputes/:id` (fetch + submit evidence) | **Disputes : Write** |

Four resource permissions total. `STRIPE_WEBHOOK_SECRET` is separate (HMAC verification,
not an API call) and needs no permission grant at all. `apps/api/src/commerce-integration.ts`
also contains the string `api.stripe.com` but only as a **generated code template** emitted
for a customer's own repo (their own key, their own runtime) — it is not a call this
system's own key ever makes, and is correctly excluded from the table above.

If a restricted key narrower than the account's full `sk_live_` key doesn't already
exist with exactly this scope, minting one and swapping it in via the rotation procedure
above closes the standing "why does this key have more access than it uses" gap from the
July report — re-run this file's enumeration after any future Stripe-call-site change,
since the table above is a snapshot, not a live guarantee.
