# Routing Go-Live Runbook — get the repos talking

The **target state** for every merchant app ↔ PAI'D ↔ Stripe, and the exact dashboard
steps to switch it on. Companion to `ENV_ROUTING_MAP.md` (current/actual state).

**What the code already does for you** (shipped in `feat/paid-integration-resilience`):
Iliad now tolerates the env-name chaos — it reads PAI'D's base URL under **any** of
`PAID_API_BASE_URL` / `PAID_API_URL` / `PAID_BASE_URL`, and the webhook secret under
**either** `PAID_WEBHOOK_SIGNING_KEY` **or** `PAID_WEBHOOK_SECRET`, and strips a pasted
`(label)` off any `STRIPE_PRICE_ID_*`. So you can't trip the silent-failure traps anymore.
Your job below is just to set the values.

---

## Target topology
```
        Stripe (your acct_1SPT3v…)
                ▲  settles to your Stripe
                │
            ┌───┴────┐   one canonical host: api.trustfabric.ai
            │  PAI'D │◀──────────────── all merchant apps point here
            └───┬────┘   signs webhooks with PAID_WEBHOOK_SECRET
       PAID_*   │  forwards checkout.session.completed → each app's webhook
   ┌───────────┼───────────┬───────────────┐
   ▼           ▼           ▼               ▼
 Iliad      Avatar      Odyssey        (future apps)
 /portal/api/paid/webhook  …each verifies with the SAME secret value
```
Goal: **no app calls Stripe directly for checkout** — Stripe is reached *through* PAI'D.
(Today Odyssey + Iliad-fallback + Pro/Growth still call Stripe direct; those are the migrations.)

---

## Step 1 — Pick the canonical PAI'D host (do this once)
Choose **`https://api.trustfabric.ai`** (recommended) and use it everywhere. Resolves the
open host mismatch (`axis-pai-paid-api-main.onrender.com` vs `api.trustfabric.ai` vs
`paid.trustfabric.ai`).

## Step 2 — Per merchant app, set the canonical PAI'D env block
On each app's service (Render dashboard → Environment), set:

| Var | Value | Notes |
|---|---|---|
| `PAID_API_BASE_URL` | `https://api.trustfabric.ai` | the canonical host from Step 1 |
| `PAID_API_KEY` | this app's PAI'D merchant key | minted in PAI'D per merchant |
| `PAID_MERCHANT_ID` | this app's PAI'D merchant id | |
| `PAID_WEBHOOK_SIGNING_KEY` | **= PAI'D's `PAID_WEBHOOK_SECRET` for this merchant** | ⚠️ must match exactly, or webhooks are rejected |

> The webhook value is the #1 silent failure: payment succeeds, but tier/credits never
> apply because the signature doesn't verify. Copy PAI'D's `PAID_WEBHOOK_SECRET` value
> verbatim into the app's `PAID_WEBHOOK_SIGNING_KEY` (the code accepts either name, but the
> **value** must be identical).

For **Iliad** specifically, that's the service behind `iliad.trustfabric.ai`.

## Step 3 — Clean the Stripe price env values (Pro/Growth still use Stripe-direct)
On each app that keeps a Stripe-direct path, every `STRIPE_PRICE_ID_*` must be the **bare id**:
```
STRIPE_PRICE_ID_STARTER = price_1TkWfbELErUdQ5HwbibF1tXB     ✅
STRIPE_PRICE_ID_STARTER = price_1TkWfbELErUdQ5HwbibF1tXB (monthly $29.00)   ❌ (the error you hit)
```
The code now strips the ` (label)` defensively, but clean values keep the dashboards honest.
Clean: `STRIPE_PRICE_ID_{STARTER,PAID,PRO,GROWTH,SUITE}` and their `_ANNUAL` variants.

## Step 4 — Verify, per app
1. `GET /portal/api/paid/config` → `{ "configured": true }`. If false, one of
   `PAID_API_BASE_URL` / `PAID_MERCHANT_ID` / `PAID_API_KEY` is missing.
2. Click **Starter** in the UI → you should land on **PAI'D hosted checkout** (not a Stripe
   `checkout.stripe.com` page). If you still hit Stripe, `configured` is false → recheck Step 2.
3. Complete a test payment → confirm the tier/credits apply (proves the webhook secret matches).
4. (Stripe-direct paths) click **Pro/Growth** → no "No such price" error → Step 3 is correct.

---

## Step 5 — The migrations (code work, separate PRs — I can do these)
These move the estate from "tolerated" to "optimal":
1. **Route Pro/Growth through PAI'D too** (Iliad) — today only Starter has a PAI'D branch;
   extend it so *all* tiers go through PAI'D and no app needs `STRIPE_PRICE_ID_*`.
2. **Switch Odyssey to PAI'D** (it's Stripe-direct only today).
3. **Extract a shared PAI'D client SDK** (TS + Python) so Iliad / Avatar / Odyssey integrate
   identically instead of each re-implementing checkout + webhook verification.
4. **Consolidate Iliad + PAI'D on one Neon project** (already the migration plan).
5. **Lift Iliad's `validateEnv()`** into a shared boot/CI check every app runs.

---

## Quick reference — who needs what (non-secret names only)
- **Every merchant app:** `PAID_API_BASE_URL`, `PAID_API_KEY`, `PAID_MERCHANT_ID`, `PAID_WEBHOOK_SIGNING_KEY` (+ return URLs).
- **PAI'D server:** its own `STRIPE_API_KEY`, `PAID_WEBHOOK_SECRET`, `DATABASE_URL`, `REDIS_URL`, `VAULT_*`, plus the `TF_*` TrustFabric layer.
- **Stripe-direct paths (until migrated):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_*` (bare).
