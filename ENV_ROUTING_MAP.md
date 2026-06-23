# Cross-Service Env Routing Map — No Fate Platform

How the repos connect (or *should*) via environment configuration. Built by scanning
every repo's `process.env` / `os.Getenv` reads — **no secret values, only variable names
and the edges between services.** Goal: make the apps work together instead of each
re-inventing payment/DB/auth wiring. Generated 2026-06-22.

> Only variable **names** appear here. Actual values live in each service's dashboard
> (Render env, Stripe, PAI'D) — never in this file or in git.

---

## 1. Active services (the ones with real env footprints)

| Service | Repo | Stack | Deploy | Public host | Role |
|---|---|---|---|---|---|
| **PAI'D** | `payment processing` | Go | Render | `paid.trustfabric.ai` / `api.trustfabric.ai` | Full PSP hub: Stripe + Plaid ACH + Apple/Google Pay + tax (Avalara/TaxJar) + SOC2/SCIM/SAML; secrets in **Vault** (`VAULT_*`) |
| **TrustFabric (TF)** | (in `payment processing`, `TF_*` layer) | Go | Render | `trustfabric.ai` | Identity/link layer — own OAuth (GitHub/Google/LinkedIn), DB, Redis; PAI'D↔TF **link handshake** |
| **payment-engine-demo** | `payment-engine-demo` | Go | — | — | PAI'D fork/demo (same `PAID_*`/`TF_*`/Vault surface) |
| **Iliad / Toolbox** | `AXIS Toolbox` | TS | Render | `iliad.trustfabric.ai` | Main API + web + MCP; **revenue app** |
| **Odyssey** | `AXIS odyssey` (`_axis_push_clean` is a clone) | TS | Render + Docker | — | Sibling codebase-intelligence platform |
| **Avatar Foundry** | `AXIS Avatar Foundry` | Python | Render | `avatar.jonathanarvay.com` | 3D asset pipeline + portal |
| **Chlover** | `AXIS Chlover` | TS | Render | — | Fintech MCP (ledger/disputes/mandates) |
| **Novel** | `AXIS Novel` | TS | Render/local | — | GDD generator; calls Toolbox CLI |
| **Onboard** | `AXIS Onboard` | TS | local | — | Identity onboarding (only `PORT`) |

**No env footprint** (specs / CLIs / empty): Payouts, Quote, Recon, Evidence, Scalpel(×3),
Gold, MARS, monolith, SHIP, no-fate-contract, IRSv1.1.0, NoFate Coin, Diamond Clarity,
odyssey-v3-*, slate, the gauntlet, RUUUUN!!!, frontend, mcp.

---

## 2. The cross-service edges (who talks to whom, via which env)

```
                         ┌─────────────────────────────┐
        Stripe ◀─────────│           PAI'D             │  (settles to YOUR Stripe;
   (your acct_1SPT3v…)   │   payment orchestrator hub  │   MTL-safe, non-custodial)
                         └──────────────┬──────────────┘
            PAID_* keys + webhook        │  forwards checkout.session.completed
            ┌────────────────────────────┼────────────────────────────┐
            ▼                            ▼                             ▼
   ┌──────────────┐            ┌──────────────┐              ┌──────────────────┐
   │   Iliad      │            │ Avatar       │              │ (other merchant  │
   │  Toolbox     │            │ Foundry      │              │  apps → PAI'D)   │
   │  STRIPE_* +  │            │  PAID_* only │              └──────────────────┘
   │  PAID_*      │            └──────────────┘
   └──────────────┘
   Odyssey → STRIPE_* only (NOT through PAI'D)
```

**Edges in detail:**

| From | To | Via env vars | Notes |
|---|---|---|---|
| Iliad | PAI'D | `PAID_API_BASE_URL`, `PAID_API_KEY`, `PAID_MERCHANT_ID`, `PAID_WEBHOOK_SIGNING_KEY`, `PAID_PLAN_PRO_*` | Starter routes here *iff* `getPaidConfig()` sees all set |
| Iliad | Stripe (direct) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_{STARTER,PAID,PRO,GROWTH,SUITE}[_ANNUAL]` | **Fallback path** — the one that just errored |
| Avatar Foundry | PAI'D | `PAID_API_KEY`, `PAID_API_SECRET`, **`PAID_BASE_URL`**, `PAID_SUCCESS_URL`, `PAID_CANCEL_URL`, `PAID_WEBHOOK_SIGNING_KEY`, `PAID_USE_SANDBOX` | ⚠️ uses `PAID_BASE_URL`, **not** `PAID_API_BASE_URL` like Iliad |
| Odyssey | Stripe (direct) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PAID`, `STRIPE_PRICE_ID_SUITE` | **Bypasses PAI'D entirely** |
| PAI'D | each merchant | `PAID_WEBHOOK_SIGNING_KEY` (per merchant) → `/portal/api/paid/webhook` | Signing key must match per merchant |
| Avatar Foundry | TrustFabric | `AXIS_TRUSTFABRIC_API_URL`, `AXIS_TRUSTFABRIC_API_KEY` | provenance/listing |
| Avatar Foundry | GPU | `TRELLIS*`, `FLUX2*`, `RUNPOD_*` | outsourced compute |
| Novel | Toolbox | `AXIS_TOOLBOX_CLI` (filesystem path) | local CLI call, no network |
| Iliad + Odyssey | Tempo chain | `TEMPO_TESTNET`, `TEMPO_RECIPIENT_ADDRESS` | crypto payout rail |

**Databases (fragmented):** PAI'D → Neon · Iliad → SQLite **migrating to Neon** (`DATABASE_URL`/`PG*`)
· Odyssey → SQLite (`DATABASE_PATH`) · Chlover → Supabase · Novel → SQLite.

**Auth (duplicated):** GitHub OAuth in Iliad, Odyssey, Avatar (each its own
`GITHUB_CLIENT_ID/SECRET/CALLBACK_URL`); Avatar adds Google/Apple; Chlover uses Supabase auth.

---

## 3. The problems this map exposes (and the wins)

### 🔴 P1 — Payment routing is three different things at once
- Iliad does **both** Stripe-direct and PAI'D; Odyssey is **Stripe-direct only**; Avatar is **PAI'D only**.
- Consequence you just hit: Iliad fell back to Stripe-direct (because PAI'D config was incomplete) and died on a `STRIPE_PRICE_ID_*` typo.
- **Win:** route **all** merchant apps through **PAI'D** (your stated MTL-safe design — "drop AXIS-direct Stripe"). Then no app needs `STRIPE_PRICE_ID_*` at all; settlement + state is centralized; the typo class disappears.

### 🔴 P2 — PAI'D env contract is inconsistent across the estate (highest-leverage fix)
The same concept has a **different variable name in every repo**:

| Concept | PAI'D (server) | Iliad | Avatar Foundry |
|---|---|---|---|
| PAI'D base URL | `PAID_API_URL` | `PAID_API_BASE_URL` | `PAID_BASE_URL` |
| webhook secret | `PAID_WEBHOOK_SECRET` | `PAID_WEBHOOK_SIGNING_KEY` | `PAID_WEBHOOK_SIGNING_KEY` |
| return URLs | (allowlists) | built inline | `PAID_SUCCESS_URL` / `PAID_CANCEL_URL` |
| merchant id | — | `PAID_MERCHANT_ID` | (key-derived) |

Each app reads its *own* name, so nothing crashes — **but the webhook secret is a live trap**: PAI'D **signs** outgoing webhooks with the value in `PAID_WEBHOOK_SECRET`, and Iliad/Avatar **verify** with `PAID_WEBHOOK_SIGNING_KEY`. The *same secret value* must be set under both names, or signature verification silently fails and **fulfilment webhooks get rejected** (payments succeed, tier/credits never granted). You also can't keep one shared env block when "PAI'D URL" has three names.
- **Win:** one **canonical PAI'D env contract** (§4) + a shared client SDK, adopted everywhere. Single biggest "repos working together" lever.

### 🟠 P3 — Canonical PAI'D host (the open B1 mismatch)
`render.yaml` / various apps point at PAI'D via different hosts: `axis-pai-paid-api-main.onrender.com`
vs `api.trustfabric.ai` vs `paid.trustfabric.ai`. **Win:** pick one (recommend `api.trustfabric.ai`)
and set `PAID_API_BASE_URL` to it everywhere.

### 🟠 P4 — DB consolidation
Revenue services (Iliad, PAI'D) should share **one Neon project** (already the Iliad-migration plan).
Odyssey is a candidate too. Chlover (Supabase) is a separate stack — fine to leave.

### 🟡 P5 — Hygiene
- Strip pasted ` (label)` from `STRIPE_PRICE_ID_*` in code (the typo guard) — keeps the fallback safe while it exists.
- Avatar Foundry hardcodes `CONTACT_EMAIL`/`APP_BASE_URL`; Chlover `.env.example` shows a service-role key — confirm `.env` is gitignored everywhere; nothing real committed.

---

## 4. Proposed canonical PAI'D client env contract

Every merchant app (Iliad, Avatar, Odyssey, future) reads **exactly these**:

```
PAID_API_BASE_URL          # canonical PAI'D host (api.trustfabric.ai)
PAID_API_KEY               # this merchant's PAI'D key (sk_live_… from PAI'D)
PAID_MERCHANT_ID           # this merchant's id in PAI'D
PAID_WEBHOOK_SIGNING_KEY   # per-merchant webhook HMAC key
PAID_RETURN_SUCCESS_URL    # this app's post-checkout success URL
PAID_RETURN_CANCEL_URL     # this app's cancel URL
PAID_USE_SANDBOX           # bool, default false
```

**Reconcile with what PAI'D actually emits** (server side reads `PAID_API_URL` + signs with
`PAID_WEBHOOK_SECRET`): the contract's `PAID_API_BASE_URL` = PAI'D's `PAID_API_URL` value, and
`PAID_WEBHOOK_SIGNING_KEY` **must hold the same value as PAI'D's `PAID_WEBHOOK_SECRET`** for that
merchant. Until the names are unified, set the webhook secret under **both** names. (Renaming PAI'D's
own vars is the cleaner end-state, but it's the riskier change — do the consumers first.)

Back it with a **shared PAI'D client SDK** so apps don't each re-implement checkout/webhook
verification (Iliad's `paid-client.ts`, Avatar's Python client, etc. converge on one impl per language).

---

## 5. "Benefit each other" — shared-code opportunities
- **PAI'D client SDK** (TS + Python) — one integration, many apps. Removes P1/P2 by construction.
- **Shared env-schema + `validateEnv()`** — Iliad already has `validateEnv()` + `scripts/check-artifact-freshness.ts`; lift it into a shared check every app runs at boot/CI (catches the typo class).
- **Iliad already publishes `@axis/*` packages** (snapshots, mpp, generator-core) — Odyssey/Novel can consume them instead of forking.
- **One GitHub OAuth app** with per-app callback URLs, if you want unified identity.

---

## 6. Suggested order of operations
**Execute via `ROUTING_GO_LIVE_RUNBOOK.md`** (the dashboard steps). Code-side hardening is
already shipped (`feat/paid-integration-resilience`): Iliad tolerates all three PAI'D URL
names + either webhook-secret name, and strips a pasted `(label)` off `STRIPE_PRICE_ID_*`.

1. ✅ **Code guard shipped** — Iliad won't trip the name/typo traps.
2. **You — values:** set the canonical PAI'D env block + clean Stripe price values per app (runbook Steps 1–4).
3. **Code (next PRs, I can do):** route Pro/Growth through PAI'D, switch Odyssey to PAI'D, extract a shared PAI'D SDK (P1/P2 — biggest payoff).
4. Consolidate Iliad + PAI'D on **one Neon project** (P4).
