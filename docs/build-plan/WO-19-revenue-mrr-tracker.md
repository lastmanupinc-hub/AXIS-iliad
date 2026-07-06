# WO-19 · revenue-mrr-tracker  _(Phase 1 — revenue rail / instrumentation; recovered spec)_

**Claim it makes true:** the funding-doc figure "$0 MRR, ~7 free accounts, zero paid conversions" — turn it from a **founder-attested** number into a **live, settled-payment-derived receipt** that ticks up from $0 the instant the first dollar settles.

**Tier:** A_pure_software · **Effort:** M · **Package:** CHANGED `@axis/snapshots` + `apps/api` + `apps/web` (optional new receipts table)

**Verify note:** hand-authored (workflow design stage hit the schema-retry cap). Grounding **corrected the premise**: a revenue surface already exists — it's an *estimate*, not settled-money. This WO makes it real. Also the highest-leverage instrumentation on the activation critical path, and the definitive proof that the WO-03 live-collection loop works.

## Current state (grounded — a surface exists, but MRR is an estimate)
- Live revenue surface already wired: `handleAdminRevenue` (`apps/api/src/admin.ts:118-142`, route `server.ts:454`) -> `getGrowthSnapshot` (`packages/snapshots/src/growth-store.ts:37-91`: paid/free/suite counts, `estimated_mrr_cents:85`, `metered_overage_cents_this_month:87` (current month only), `active_subscriptions`) + `getFunnelMetrics` (`funnel-store.ts:382-442`: `conversion_rate:436`, `activation_rate`). Displayed at `AdminPage.tsx:38,99,111` via `api.ts:766 getAdminRevenue`.
- **What's an estimate / missing:** MRR = tier_count x assumed $29/$299 (`TIER_MONTHLY_CENTS`, `growth-store.ts:34`), **NOT settled revenue**. No all-time total revenue; no per-tool revenue; no first-paid-call timestamp; `conversion_rate` derives from tier counts, not payments. `recordPaidCall` (`referral-store.ts:165-173`) only bumps `paid_call_count` — stores no amount/timestamp/tool. The cashier (`cashier.ts:28-42 settleOverageCash`) charges mppx but **persists no receipt**; there is no receipts/settlement table.
- **The real money record already exists:** `usage_credit_ledger` (`pg-schema.ts:419-432`: `amount_cents`, `overage_credits`, `tool`, `created_at`), written by `consumeUsageCredits` (`usage-credit-metering.ts:238-256`) from `chargeWithDiscounts` (`handlers.ts:60-83`).

## Target state (== the claim is a live receipt)
Revenue metrics **derived from actual settled payments**, not tier estimates:
1. Aggregate over `usage_credit_ledger` (overage rows) for **all-time settled revenue**, **per-tool revenue**, and **first-paid-call timestamp**.
2. Persist the H1 **cash settlements** (Stripe SPT / mppx, from `settleOverageCash` on a 200) into a **`payment_receipts`** table so real card/USDC revenue is captured distinctly from plan-credit overage.
3. Compute a **payment-based** conversion (accounts with >=1 settled payment / total) alongside the existing tier-based one.
4. Keep the existing `estimated_mrr_cents` but **relabel it explicitly "estimated"**, and add a separate **`settled_revenue_cents_all_time`** / **`settled_mrr_cents`** (trailing-30-day settled) that reads $0 today and rises automatically.

## Files to create / edit
- `packages/snapshots/src/growth-store.ts` (edit: add `settled_revenue_cents_all_time`, `revenue_by_tool`, `first_paid_call_at`, `settled_mrr_cents`, `paying_account_count`, `payment_conversion_rate` via SQL over `usage_credit_ledger` + `payment_receipts`; relabel the existing MRR as estimated)
- `packages/snapshots/src/pg-schema.ts` (edit: new `payment_receipts` table: `id, account_id, tool, amount_cents, currency, provider('stripe'|'tempo'), external_receipt, created_at`)
- `packages/snapshots/src/payment-receipts-store.ts` (new: `recordSettledPayment(...)`, `getSettledRevenue(...)`)
- `apps/api/src/cashier.ts` (edit: on `settleOverageCash` -> chargeMpp 200, call `recordSettledPayment` with the Payment-Receipt details)
- `apps/api/src/admin.ts` (edit: `handleAdminRevenue` returns the new derived fields)
- `apps/web/src/api.ts` + `apps/web/src/pages/AdminPage.tsx` (edit: display "Settled MRR $X (live)" distinct from "Estimated MRR")
- `packages/snapshots/src/growth-store.test.ts` + `payment-receipts-store.test.ts` (new/edit)

## Interfaces
```ts
// packages/snapshots/src/growth-store.ts (extend GrowthSnapshot)
export interface GrowthSnapshot {
  // ...existing fields...
  estimated_mrr_cents: number;          // KEEP, but rename display to "estimated"
  settled_mrr_cents: number;            // NEW: sum of settled payments in trailing 30d
  settled_revenue_cents_all_time: number;
  revenue_by_tool: Array<{ tool: string; cents: number; calls: number }>;
  first_paid_call_at: string | null;    // MIN(created_at) of overage/settled
  paying_account_count: number;         // DISTINCT accounts with >=1 settled payment
  payment_conversion_rate: number;      // paying_account_count / total_accounts
}
// packages/snapshots/src/payment-receipts-store.ts
export function recordSettledPayment(p: {
  account_id: string; tool: string; amount_cents: number;
  currency: string; provider: "stripe" | "tempo"; external_receipt?: string;
}): Promise<void>;
export function getSettledRevenue(): Promise<{ all_time_cents: number; trailing_30d_cents: number; by_tool: Array<{tool:string;cents:number}>; first_at: string|null }>;
```

## Acceptance tests (DONE == claim true)
- Seed `usage_credit_ledger` with overage rows across 2 tools -> `getGrowthSnapshot().settled_revenue_cents_all_time == SUM(amount_cents)`, `revenue_by_tool` grouped correctly, `first_paid_call_at == MIN(created_at)`.
- Zero paid rows -> `settled_mrr_cents == 0`, `settled_revenue_cents_all_time == 0`, `payment_conversion_rate == 0` (a true, live **$0** — not the tier estimate).
- `settleOverageCash` returning `{status:200}` calls `recordSettledPayment`; a row lands in `payment_receipts` and shows up in `getSettledRevenue().all_time_cents`.
- `handleAdminRevenue` response includes the new fields; the estimated vs settled MRR are distinct keys.
- Determinism: given fixed rows + a fixed `now` (injected, per the no-`Date.now` rule in stores), the snapshot is stable.

## External gates
- _none to instrument_. (The number only *rises above $0* once WO-03 live-collection actually settles a payment — but the tracker is honest at $0 until then, which is the point.)

## New runtime deps
- _none_ (SQL over existing Postgres via `pg`).

## Depends on
- (data source) WO-03 live-collection-fix + the H1 cashier — the tracker reads their receipts. Build the tracker independently; it correctly reads $0 until collection lands, then ticks up automatically.

## Doc impact / residual honesty caveat
"$0 MRR" stops being an attested claim and becomes a **live, code-derived figure** off settled payments. Funding docs can then cite "settled MRR (live, instrumented): $X" instead of an assertion. Residual: the pre-existing `estimated_mrr_cents` must always be labeled **estimated** and never conflated with settled revenue; until WO-03 lands, the settled figure is a truthful **$0**.
