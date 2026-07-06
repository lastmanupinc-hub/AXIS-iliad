# MCP Paid Access → PAI'D Credit Wallet — Design & Rollout

Wiring Iliad's paid MCP tool calls to **PAI'D's Fabric‑Credit (FC) wallet**, so Iliad debits credits per paid generation and, on insufficient funds, points the caller to a PAI'D top‑up. **Iliad never touches payment rails** — PAI'D owns the wallet and the money.

## WO-04: where the wallet debit actually landed
The Phase 0 draft below sketched wiring the wallet into `captureMcpToolCredits` (MCP-only).
**WO-04 shipped it one level lower instead**: `settleOverageCash` in `apps/api/src/cashier.ts`
— the single per-call cash-collection tail already shared by BOTH the REST cashier
(`chargeWithDiscounts`) and the MCP in-band settlement gate (`settleMcpCallInband`). One
seam, both surfaces, in one change, rather than a second MCP-only integration point. The
branch (`settleOverageViaPaidWallet`) lives entirely inside that shared tail; no changes
to `chargeMpp`, `handlers.ts`, or `mcp-server.ts` call signatures. See
`apps/api/H1_INBAND_SETTLEMENT.md` for the full flow and `cashier.ts`'s
`cashier-paid-wallet.test.ts` for the offline, mocked-fetch proof.

## The seam already exists
Every metered MCP tool call already runs `authorize → work → capture` (`mcp-runtime.ts`): `authorizeMcpToolCredits()` is a read‑only pre‑auth (previews included vs overage); `captureMcpToolCredits()` is the single post‑**success** debit. The original Phase 0 draft proposed wiring PAI'D there; WO-04 instead wired it into `settleOverageCash` (above) — the same 17 metered tools are covered because *all* of them, and the REST surface, resolve their overage through that one shared function. MCP `Idempotency-Key` replay already short‑circuits before dispatch.

## PAI'D `/v1/credit_wallet` contract (verified against the Go backend source, WO-04)
Relative to `PAID_API_BASE_URL` (the `/v1` root, same base `/checkout/sessions` uses).
Routes confirmed in `paid-pr34/go-backend/internal/app/tfapp/routes.go` (handlers in
`internal/trustfabric/http/handlers/tf_handler.go`, `GetWallet`/`TopUpWallet`/`DebitWallet`):
- `GET  /trust-fabric/billing/wallet/{developer_id}` → `{balance_fc, lifetime_fc, tier, status}` (auto‑provisions a free 60‑FC wallet).
- `POST /trust-fabric/billing/wallet/{developer_id}/debit` `{amount_fc, product_code, reason, reference_type, reference_id}` → `{balance_fc, transaction}`; **HTTP 402** `{error:"insufficient_credits", balance_fc, required_fc, shortfall_fc, upgrade_options}` when short.
- `POST .../top-up` and `GET .../transactions` also available. Units: integer FC, **$1 = 1 FC**. Auth: `Bearer PAID_API_KEY`.

**⚠ Important finding (WO-04 investigation):** on the PAI'D side, this wallet is a
**pure internal ledger** — `DebitWallet`/`TopUpWallet`/`GetWallet` only read/write an
`int64 BalanceFC` column in Postgres. None of them call into PAI'D's own
`internal/provider` package (which DOES have real `stripe.go`, `plaid.go`,
`circle_w3s.go`, `dwolla.go`, `fednow.go`, `sepa.go`, `swift.go`, `paypal.go`, `solana.go`,
`usdc.go` adapters plus a `ProviderRegistry` for connect/health-check/capability-gating).
Debiting FC does not itself select or move money across **any** rail — Stripe, Plaid, and
Circle are all equally uninvolved in this endpoint today. "PAI'D → PAI'D's Stripe →
founder settlement" describes the **separate** `/checkout/sessions` hosted-checkout flow
(already used for subscriptions/credit-packs); it is not what a wallet debit does. See
"Multi-rail selection" below for the closest thing PAI'D has to a rail selector, and why
it doesn't change this conclusion yet.

## Source‑of‑truth decision: **bridge, not replace**
The local `usage_credit_*` ledger stays the **quota/display** layer (drives plan allowance + the `_usage` block); the PAI'D wallet becomes the **authoritative money** layer. If they disagree, **PAI'D balance wins** for spend. Persistence‑credits (a separate, currently‑unwired subsystem) is untouched here.

## Mapping
- Merchant = `PAID_MERCHANT_ID` (Iliad). Wallet `developer_id` = Iliad `account.account_id` (1:1); store an explicit nullable `paid_developer_id` on the account so it's reroutable.
- Debit amount: `amountFc = centsToFabricCredits(overageCents)` = `Math.max(1, Math.ceil(cents/100))` for `cents > 0`, else `0` (50¢→1 FC, engineer $25→25 FC). **Sub‑dollar overages round UP to a full FC — a known overcharge, see the residual honesty caveat below.**
- Idempotency (WO-04 as-shipped): `checkoutIdempotencyKey(accountId, "fc-debit:{tool}")` (HMAC'd, per-account-seed, time-bucketed so a client retry within the window collapses to the same key) sent as the debit's `Idempotency-Key` header. **PAI'D's HTTP layer honoring that header is still unverified** — a client-side dedupe table remains recommended before `enforce` sees real traffic (double-debit risk on retry otherwise).

## Phased rollout (`PAID_WALLET_MODE`, default `off`)
- **Phase 0 — plumbing (shipped):** `getPaidWallet` / `debitPaidWallet` client methods + `PaidWalletMode` flag + tests. Ships dark; no call‑path changes.
- **Phase 1 — `read`** *(shipped, WO-04)*: `settleOverageCash` calls `getPaidWallet` and logs the balance; no debits; falls through to mppx.
- **Phase 2 — `shadow`** *(shipped, WO-04)*: computes + **logs** the FC amount that `enforce` would debit (with the raw `overageCents`, so the cents-vs-FC rounding drift is auditable); still no real debit; falls through to mppx.
- **Phase 3 — `enforce`** *(shipped dark, WO-04 — default remains `off`)*: `settleOverageCash` debits the wallet as the collection rail; PAI'D 402 `insufficient_credits` → writes a top‑up challenge and does **not** fall back to mppx; any other PAI'D error (unreachable, 5xx) falls back to mppx rather than hard-failing the request. Flipping this to `enforce` in production still requires the external gates below to be closed first — it is NOT gated on more Iliad-side code.

## ⚠ Open decisions / external gates — needed before flipping `enforce` live
1. **Base path** is now **verified** against the Go backend source (see contract section above) — no longer an open question, though it has NOT been exercised against a *running* PAI'D instance from this code.
2. **`product_code` for the per-call agentic debit:** shipped as `"iliad_agentic_call"` (see `cashier.ts`) — a dedicated code, distinct from `tf_marketplace_take`.
3. **Top‑up refill:** `enforce`'s 402 body points at `/v1/credits/topup` — **this funds Iliad's own `persistence_credits` ledger, NOT the PAI'D FC wallet the 402 is about.** No FC top-up endpoint exists in this repo; until PAI'D exposes (or Iliad wires) a real FC-refill path, `enforce`'s economic loop does not close — a paying agent following the top-up link tops up the wrong ledger. This is the single biggest reason `enforce` must stay off in production.
4. **Capture‑time 402:** N/A as shipped — the wallet debit happens *before* work runs (mirrors the existing REST/MCP cash-tail semantics), so there is no post-success 402 race to resolve.
5. **Does PAI'D's HTTP debit honor a caller `Idempotency-Key`?** Still unverified — client‑side dedupe remains recommended before enforce sees real traffic.
6. **PAI'D-side Stripe Connect settling to the founder's own Stripe** — the actual "MTL-safe → owner's own Stripe" guarantee — lives entirely on PAI'D's side; this code only proves it routes THROUGH PAI'D, it cannot prove where PAI'D settles.
7. **Payment-Receipt header parity:** the mppx-200 path sets a `Payment-Receipt` header; the enforce-200 path (as shipped) does not. An agent that hard-depends on that header for its own record-keeping sees different behaviour in enforce vs off/read/shadow. Flagged, not fixed in WO-04 (non-blocking per the WO's verify verdict).

## Multi-rail selection (Stripe + Plaid + Circle) — investigated for WO-04, not built
The STRATEGIC CONTEXT for WO-04 asked whether PAI'D's own Go backend already exposes a
rail/provider selector before assuming Plaid/Circle are Iliad-side work. Findings from
reading `paid-pr34/go-backend` directly:
- PAI'D's `internal/provider/` package genuinely is multi-rail: `stripe.go`, `plaid.go`,
  `circle_w3s.go`, `circle_notification.go`, `dwolla.go`, `fednow.go`, `sepa.go`, `swift.go`,
  `paypal.go`, `solana.go`, `usdc.go`, `cctp.go`, plus a `ProviderRegistry`
  (register → connect → health-check → capability-gate; "NO FATE: capabilities only
  exist when CONNECTED").
- PAI'D also has a merchant-facing preference CRUD surface —
  `internal/http/handlers/merchant_provider_preference_handler.go` — exposing
  `GET/PUT/DELETE /v1/merchants/:id/provider-preferences/:provider_id` with a
  `preferred_rail` bool, `fallback_order`, `timeout_seconds`, `environment`, and
  free-form `metadata` per `provider_id`. This looks exactly like the rail selector the
  strategic context asked about.
- **However:** grepping the whole Go backend shows `MerchantProviderPreference` is
  referenced ONLY by its own handler/model/repository/route-registration — **nothing in
  the charge-execution path (the FC wallet debit, `TopUpWallet`, or the provider
  registry's `Connect`/`GetProvider`) ever reads it.** It is a preference-storage stub
  with no consumer today, not a live selector.
- **Net finding:** PAI'D is architecturally multi-rail-capable, and even has a
  plausible-looking per-merchant rail-preference API — but the specific FC-wallet debit
  endpoint this WO integrates with doesn't call `internal/provider` at all (see the
  contract section above), and the preference API isn't wired to anything that does. So
  today, debiting the wallet doesn't select Stripe, Plaid, or Circle — it just moves a
  number in a ledger. This is a **PAI'D-side gap**, not something blocked by missing
  Plaid/Circle SDK code in Iliad's repo (there genuinely is none, and building
  speculative Plaid/Circle clients here would not close this gap — the gap is on the
  other side of the wire).
- **Fast-follow seam** (tracked, not built in WO-04): once PAI'D's `DebitWallet` (or a
  new top-up/funding path) reads a merchant's `provider-preferences` row and dispatches
  through a *connected* `ProviderRegistry` entry, Iliad's job becomes selecting/reading
  that preference via a new PAI'D API call — plausibly a small addition, but it is not
  "trivially the same shape as `debitPaidWallet`" because it requires new PAI'D-side
  wiring (reading the preference in the wallet handlers) that does not exist yet, and a
  provider actually `Connect()`-ed with real Stripe/Plaid/Circle credentials, which is
  also unverified. Foundry's own `paid_client.py` (a separate Python service) needs the
  equivalent Iliad-side wiring as its own follow-on WO once this seam is real.

## Must dogfood before enforce
Run Phase 1/2 against **live PAI'D** with the owner's own account: confirm wallet provisioning, the base path, auth, FC amounts, and that shadow debits match the local ledger — per `MERCHANT_INTEGRATION_DOGFOODING.md`. Only then flip `enforce` on an allowlist — and only once the FC top-up funding gate above is closed.
