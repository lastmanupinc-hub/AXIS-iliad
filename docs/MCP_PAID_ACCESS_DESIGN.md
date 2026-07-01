# MCP Paid Access → PAI'D Credit Wallet — Design & Rollout

Wiring Iliad's paid MCP tool calls to **PAI'D's Fabric‑Credit (FC) wallet**, so Iliad debits credits per paid generation and, on insufficient funds, points the caller to a PAI'D top‑up. **Iliad never touches payment rails** — PAI'D owns the wallet and the money.

## The seam already exists
Every metered MCP tool call already runs `authorize → work → capture` (`mcp-runtime.ts`): `authorizeMcpToolCredits()` is a read‑only pre‑auth (previews included vs overage); `captureMcpToolCredits()` is the single post‑**success** debit. So wiring PAI'D = **change one function (`captureMcpToolCredits`) to also debit the wallet** → all 17 metered tools covered at once, on success paths only. Failed calls never reach capture. MCP `Idempotency-Key` replay already short‑circuits before dispatch.

## PAI'D `/v1/credit_wallet` contract (mapped from the Go backend)
Relative to `PAID_API_BASE_URL` (the `/v1` root, same base `/checkout/sessions` uses):
- `GET  /trust-fabric/billing/wallet/{developer_id}` → `{balance_fc, lifetime_fc, tier, status}` (auto‑provisions a free 60‑FC wallet).
- `POST /trust-fabric/billing/wallet/{developer_id}/debit` `{amount_fc, product_code, reason, reference_type, reference_id}` → `{balance_fc, transaction}`; **HTTP 402** `{error:"insufficient_credits", balance_fc, required_fc, shortfall_fc, upgrade_options}` when short.
- `POST .../top-up` and `GET .../transactions` also available. Units: integer FC, **$1 = 1 FC**. Auth: `Bearer PAID_API_KEY`.

## Source‑of‑truth decision: **bridge, not replace**
The local `usage_credit_*` ledger stays the **quota/display** layer (drives plan allowance + the `_usage` block); the PAI'D wallet becomes the **authoritative money** layer. If they disagree, **PAI'D balance wins** for spend. Persistence‑credits (a separate, currently‑unwired subsystem) is untouched here.

## Mapping
- Merchant = `PAID_MERCHANT_ID` (Iliad). Wallet `developer_id` = Iliad `account.account_id` (1:1); store an explicit nullable `paid_developer_id` on the account so it's reroutable.
- Debit amount: `amountFc = ceil(charge.amountCents / 100)` (50¢→1 FC, engineer $25→25 FC).
- Idempotency (3 layers): MCP `Idempotency-Key` replay → per‑debit key `checkoutIdempotencyKey(account, "mcp-debit:{tool}:{referenceId}")` → **client‑side dedupe table** (because PAI'D's HTTP layer may not honor the key yet — verify).

## Phased rollout (`PAID_WALLET_MODE`, default `off`)
- **Phase 0 — plumbing (this PR, `off`):** `getPaidWallet` / `debitPaidWallet` client methods + `PaidWalletMode` flag + tests. Ships dark; no call‑path changes.
- **Phase 1 — `read`:** call `getPaidWallet` in authorize; surface `balance_fc` in `_usage`. No debits. Confirms mapping/auth/base‑path/provisioning against live PAI'D.
- **Phase 2 — `shadow`:** compute + **log** would‑be debits/402s; compare vs local ledger. Still no real debit.
- **Phase 3 — `enforce`:** capture debits the wallet; pre‑flight balance check; 402 → top‑up challenge. Per‑tool/per‑account allowlist first.

## ⚠ Open decisions (owner) — needed before Phase 3 (`enforce`)
1. **Base path:** is it `/trust-fabric/billing/...` off the `/v1` base (assumed), or a different mount? *(verify against live PAI'D in Phase 1.)*
2. **`product_code` for MCP debits:** `tf_marketplace_take`, or a dedicated code?
3. **Top‑up refill:** does Iliad top‑up the wallet on `checkout.session.completed`, or does **PAI'D checkout credit the wallet natively** (cleaner — Iliad stays out of grants)?
4. **Capture‑time 402 (rare race after work succeeded):** withhold output + 402 (default), or return output once un‑charged?
5. **Does PAI'D's HTTP debit honor a caller `Idempotency-Key`?** If not, the client‑side dedupe table is mandatory before enforce.

## Must dogfood before enforce
Run Phase 1/2 against **live PAI'D** with the owner's own account: confirm wallet provisioning, the base path, auth, FC amounts, and that shadow debits match the local ledger — per `MERCHANT_INTEGRATION_DOGFOODING.md`. Only then flip `enforce` on an allowlist.
