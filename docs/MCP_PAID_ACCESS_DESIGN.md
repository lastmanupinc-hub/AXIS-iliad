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

## PAI'D `/v1/credit_wallet` contract (WO-04)
Relative to `PAID_API_BASE_URL` (the `/v1` root, same base `/checkout/sessions` uses).
- `GET  /trust-fabric/billing/wallet/{developer_id}` → `{balance_fc, lifetime_fc, tier, status}` (auto‑provisions a free 60‑FC wallet).
- `POST /trust-fabric/billing/wallet/{developer_id}/debit` `{amount_fc, product_code, reason, reference_type, reference_id}` → `{balance_fc, transaction}`; **HTTP 402** `{error:"insufficient_credits", balance_fc, required_fc, shortfall_fc, upgrade_options}` when short.
- `POST .../top-up` and `GET .../transactions` also available. Units: integer FC, **$1 = 1 FC**. Auth: `Bearer PAID_API_KEY`.

**⚠ Important finding (WO-04 investigation, redacted 2026-09-02):** this section
previously walked through PAI'D's private backend implementation — specific internal
file paths and an architectural read of how the wallet debit relates to PAI'D's payment
rails — sourced from reading PAI'D's own private repo. That's appropriate detail for an
internal design doc shared between the two teams; it isn't appropriate to publish in a
public repo, since it characterizes a sibling product's internals rather than Iliad's
own. The one fact Iliad's own integration code actually depends on, stated without the
internals: **a wallet debit here does not itself guarantee money moved across a specific
payment rail** — plan Iliad's own retry/reconciliation logic accordingly, and treat
"debited the FC wallet" and "settled real money" as two separate claims until PAI'D's own
docs say otherwise. See "Multi-rail selection" below for what that means for the rail
question specifically.

## Source‑of‑truth decision: **bridge, not replace**
The local `usage_credit_*` ledger stays the **quota/display** layer (drives plan allowance + the `_usage` block); the PAI'D wallet becomes the **authoritative money** layer. If they disagree, **PAI'D balance wins** for spend. Persistence‑credits (a separate, currently‑unwired subsystem) is untouched here.

## Mapping
- Merchant = `PAID_MERCHANT_ID` (Iliad). Wallet `developer_id` = Iliad `account.account_id` (1:1); store an explicit nullable `paid_developer_id` on the account so it's reroutable.
- Debit amount: `amountFc = centsToFabricCredits(overageCents)` = `Math.max(1, Math.ceil(cents/100))` for `cents > 0`, else `0` (50¢→1 FC, engineer $25→25 FC). **Sub‑dollar overages round UP to a full FC — a known overcharge, see the residual honesty caveat below.**
- Idempotency (WO-04 as-shipped): `checkoutIdempotencyKey(accountId, "fc-debit:{tool}")` (HMAC'd, per-account-seed, time-bucketed so a client retry within the window collapses to the same key) sent as the debit's `Idempotency-Key` header. **PAI'D's HTTP layer honoring that header is still unverified** — a client-side dedupe table remains recommended before `enforce` sees real traffic (double-debit risk on retry otherwise). H8.4 (HARDEN_POLISH_LOOP.md) added a gated live contract canary (`apps/api/src/paid-live-canary.e2e.test.ts`) that answers exactly this question against real PAI'D — written but not yet run (needs real PAI'D credentials, an explicit owner action); run it and update this line + the two comments it points at once it has.

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
5. **Does PAI'D's HTTP debit honor a caller `Idempotency-Key`?** Still unverified — client‑side dedupe remains recommended before enforce sees real traffic. A gated live canary now exists to answer this (`apps/api/src/paid-live-canary.e2e.test.ts`, H8.4) — running it against real PAI'D credentials is the remaining step; see the mapping section above.
6. **PAI'D-side Stripe Connect settling to the founder's own Stripe** — the actual "MTL-safe → owner's own Stripe" guarantee — lives entirely on PAI'D's side; this code only proves it routes THROUGH PAI'D, it cannot prove where PAI'D settles.
7. **Payment-Receipt header parity:** the mppx-200 path sets a `Payment-Receipt` header; the enforce-200 path (as shipped) does not. An agent that hard-depends on that header for its own record-keeping sees different behaviour in enforce vs off/read/shadow. Flagged, not fixed in WO-04 (non-blocking per the WO's verify verdict).

## Multi-rail selection (Stripe + Plaid + Circle) — investigated for WO-04, not built
The STRATEGIC CONTEXT for WO-04 asked whether PAI'D already exposes a rail/provider
selector before assuming Plaid/Circle are Iliad-side work. **(Redacted 2026-09-02: this
section previously detailed PAI'D's private backend package structure and named specific
internal source files — appropriate for a cross-team design conversation, not for a
public repo. Restated at the level Iliad's own integration actually needs.)**
- PAI'D is architecturally multi-rail (Stripe/Plaid/Circle and others), gated behind its
  own connect/health-check flow — a provider only participates once actually connected.
- PAI'D also exposes a merchant-level rail-preference API that looks, from the outside,
  like a selector — but as of this investigation, the FC-wallet debit endpoint this WO
  integrates with does not consult it. **Net finding for Iliad's own planning purposes:**
  debiting the wallet today does not select a specific payment rail; treat it purely as a
  ledger operation, not a rail-selection or settlement guarantee, until PAI'D's own public
  docs say otherwise. This is a PAI'D-side question to raise with PAI'D directly, not
  something addressable from Iliad's repo — there is no missing Plaid/Circle SDK code to
  write here.
- **Fast-follow seam** (tracked, not built in WO-04): if PAI'D's wallet debit is later
  wired to honor a merchant's rail preference, Iliad's own follow-on work is selecting/
  reading that preference via a new PAI'D API call once PAI'D confirms the seam is live —
  coordinate with PAI'D's team before building against it. Foundry's own PAI'D client
  needs the equivalent follow-on once this seam is real.

## Must dogfood before enforce
Run Phase 1/2 against **live PAI'D** with the owner's own account: confirm wallet provisioning, the base path, auth, FC amounts, and that shadow debits match the local ledger — per `MERCHANT_INTEGRATION_DOGFOODING.md`. Only then flip `enforce` on an allowlist — and only once the FC top-up funding gate above is closed.
