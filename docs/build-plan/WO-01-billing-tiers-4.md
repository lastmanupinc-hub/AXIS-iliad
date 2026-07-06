# WO-01 · billing-tiers-4

**Claim it makes true:** ForAgents pricing: Free $0/10k, Starter $29/75k, Pro $99/300k, Growth $299/1.2M; overage $0.0018/credit; referral up to 0.02%/call.

**Tier:** A_pure_software · **Effort:** M · **Package:** packages/snapshots (constants + tests) and apps/api (launch-claims registry test); the web page is only read by a test, not modified

**Verify verdict:** implementable_by_sonnet5=`True` · fully_closes_claim=`False` · confidence=`high`
**Missing for codeability:** Essentially nothing blocking; the spec is highly codeable. Two minor gaps a Sonnet-5 agent must close from adjacent code, not from the spec: (a) the referral-cap acceptance test must also seed last_reset_at to the current month, else getReferralCredits -> resetCreditsIfBillingCycleChanged zeroes earned_credits_millicents and reduction_rate becomes 0 (existing tests show this pattern); (b) deriving the ForAgents '0.02% per call' string from REFERRAL_MAX_REDUCTION_RATE*100 risks a float artifact (0.019999...), so the agent should assert the literal substring or use toFixed rather than String(rate*100). Behavioral tests also require a throwaway test Postgres (DATABASE_URL), which the whole snapshots suite already needs.
**Spec overclaims flagged:** target_state says 'every consuming plane derives from that single source' and 'drift-proof', but PLAN_FEATURES (funnel-types.ts:182-188), served live via apps/api/src/funnel.ts, still carries free:10000/starter:75000/pro:300000/growth:1200000 and '$0.0018 / credit' as unguarded hand-written literals that no acceptance test checks; the spec replaces the inline 0.0002 only at referral-store.ts:156 and :238 but misses a THIRD inline 0.0002 at :216 (max_token_usage_reduction_rate in buildIncentivesSummary, an agent-facing response), so the referral rate is not truly single-sourced; PLAN_CATALOG.highlights[] credit strings remain hand-written free-text (only test-asserted, not derived from MARKETED_TIERS); PLAN_CATALOG is never restructured to a single source, so 'defined ONCE' is not literally achieved for the catalog plane; external_gates says 'None for the claim itself - the constants are pure software', but the behavioral acceptance tests (getUsageCreditSummary/consumeUsageCredits/getReferralTokenUsageModifier and 'pnpm -r test') require a live throwaway test Postgres via DATABASE_URL
**Hidden external gates:** Behavioral acceptance tests and `pnpm -r test` require a throwaway test Postgres (DATABASE_URL; CI services:postgres) - pre-existing repo baseline but understated by the spec's 'pure software, no external gates' framing; Runtime resolution of a real customer to the Pro (300k) plan requires STRIPE_PRICE_ID_PRO/_ANNUAL env vars plus an active Stripe subscription (internal free/paid/suite BillingTier has no path to pro) - this one IS disclosed by the spec

## Current state
The claim is ALREADY ~90% code-backed; the suspected "not implemented" state is stale. All four marketed values exist as first-class constants, but on THREE unreconciled planes that can silently drift, and two of the four rates are inline magic numbers rather than named constants:

1. Credit grants -- DONE but isolated. `PLAN_MONTHLY_CREDITS` at packages/snapshots/src/usage-credit-metering.ts:26-32 = {free:10_000, starter:75_000, pro:300_000, growth:1_200_000, enterprise:0}. Type `UsageCreditPlanId` at :7.
2. Prices -- DONE but on a separate plane. `PLAN_CATALOG` at packages/snapshots/src/funnel-types.ts:114-178 carries price_monthly_cents 0/2900/9900/29900, but its credit grants live ONLY as free-text inside `highlights[]` strings ("75,000 monthly credits") -- not structured, not cross-checked against PLAN_MONTHLY_CREDITS. Served at apps/api/src/funnel.ts:71.
3. Overage $0.0018/credit -- DONE but as an inline magic number `18`. usage-credit-metering.ts:52 (`(amountCents*100)/18` in creditsFromUsdCents) and :141 (`(overage_credits*18)/100` in splitFromUsed). No named constant; the "0.18 cents" intent lives only in a code comment.
4. Referral 0.02%/call -- DONE but as an inline literal `0.0002`. referral-store.ts:156 and :238 (`Math.min(credits.earned_credits_millicents/100_000, 0.0002)`). MAX_EARNED_MILLICENTS=20 is named (:42) but the 0.02% rate cap is not.
5. Public surface hardcodes everything. apps/web/src/pages/ForAgentsPage.tsx lines 27-28, 119-132, 138, 172 hardcode $29/75,000, $99/300,000, $299/1,200,000, "$0.0018 per credit", "up to 0.02% per call" as literal JSX/markdown -- no linkage to the constants, free to drift.
6. Existing guard is partial. apps/api/src/launch-claims.test.ts:157-165 asserts ONLY the three prices (`pricing` claim in LAUNCH_CLAIMS.yaml:48-50) against PLAN_CATALOG. Nothing asserts the credit grants, the overage rate, or the referral rate against live constants, and nothing checks the ForAgents page.

Real residual seam (does NOT block this claim but must be stated honestly): the internal `BillingTier` axis is 3-valued (free/paid/suite, billing.ts:54-59). `resolvePlanForAccount` (usage-credit-metering.ts:38-47) maps paid->starter, suite->growth; `pro` (300k) is reachable ONLY via an active Stripe subscription whose price_id matches STRIPE_PRICE_ID_PRO (stripe-store.ts:61-74). So Pro is purchasable (Stripe checkout) but has no non-Stripe internal grant path.

## Target state (== the claim is literally true)
The four marketed tiers, the $0.0018/credit overage, and the 0.02%/call referral cap are defined ONCE as exported named constants, every consuming plane derives from that single source, and a test suite makes the public pricing provably code-backed and drift-proof (DONE == every acceptance assertion passes):

A. New SoT module packages/snapshots/src/pricing-constants.ts exports MARKETED_TIERS (4 tiers: structured plan_id + price_monthly_cents + monthly_credits), OVERAGE_USD_PER_CREDIT=0.0018, OVERAGE_CENTS_PER_CREDIT=0.18, REFERRAL_MAX_REDUCTION_RATE=0.0002.
B. PLAN_MONTHLY_CREDITS (usage-credit-metering.ts) is DERIVED from MARKETED_TIERS (+ enterprise:0), not a hand-written literal.
C. Inline `18` in creditsFromUsdCents/splitFromUsed replaced by OVERAGE_CENTS_PER_CREDIT; inline `0.0002` in referral-store replaced by REFERRAL_MAX_REDUCTION_RATE. Runtime math is byte-identical (same values), so no behavior changes.
D. All four constants re-exported from the @axis/snapshots barrel (packages/snapshots/src/index.ts).
E. LAUNCH_CLAIMS.yaml gains a `billing_tiers` claim; launch-claims.test.ts asserts it equals live constants; new pricing-constants.test.ts cross-checks every plane (metering ↔ catalog ↔ ForAgents page) against MARKETED_TIERS.

PARTIAL-CLOSURE / HONESTY CAVEAT (must remain, do not overclaim away): the marketed pricing NUMBERS become fully code-backed and pure-software here. But ACTUAL runtime resolution of a customer to the Pro (300k) plan still requires an active Stripe subscription carrying STRIPE_PRICE_ID_PRO -- the internal free/paid/suite BillingTier has no path to pro. This spec deliberately does NOT add such a mapping (that touches the 3-valued BillingTier and is a product decision, out of scope). The claim as written ("implement the 4 marketed tiers … as first-class code constants so the public pricing is fully code-backed") becomes literally true; it does NOT claim self-serve Pro reachability without Stripe.

## Files to create / edit
- packages/snapshots/src/pricing-constants.ts (NEW - single source of truth)
- packages/snapshots/src/pricing-constants.test.ts (NEW - cross-plane + ForAgents drift-guard acceptance tests)
- packages/snapshots/src/usage-credit-metering.ts (derive PLAN_MONTHLY_CREDITS from MARKETED_TIERS; replace inline 18 with OVERAGE_CENTS_PER_CREDIT at :52 and :141)
- packages/snapshots/src/referral-store.ts (replace inline 0.0002 with REFERRAL_MAX_REDUCTION_RATE at :156 and :238)
- packages/snapshots/src/index.ts (re-export the 4 constants + MarketedTier type)
- LAUNCH_CLAIMS.yaml (add billing_tiers claim entry)
- apps/api/src/launch-claims.test.ts (assert billing_tiers claim == live constants)

## Interfaces
```ts
// packages/snapshots/src/pricing-constants.ts  (NEW)
export type MarketedPlanId = "free" | "starter" | "pro" | "growth";

export interface MarketedTier {
  plan_id: MarketedPlanId;
  price_monthly_cents: number;   // 0 | 2900 | 9900 | 29900
  monthly_credits: number;       // 10_000 | 75_000 | 300_000 | 1_200_000
}

export const MARKETED_TIERS: readonly MarketedTier[] = [
  { plan_id: "free",    price_monthly_cents: 0,     monthly_credits: 10_000 },
  { plan_id: "starter", price_monthly_cents: 2900,  monthly_credits: 75_000 },
  { plan_id: "pro",     price_monthly_cents: 9900,  monthly_credits: 300_000 },
  { plan_id: "growth",  price_monthly_cents: 29900, monthly_credits: 1_200_000 },
];

/** Overage billed at $0.0018 per credit. */
export const OVERAGE_USD_PER_CREDIT = 0.0018;
/** Same rate in cents (0.18 per credit) - used by the cents-based charge math. */
export const OVERAGE_CENTS_PER_CREDIT = 0.18;
/** Referral reward caps token-usage reduction at 0.02% (0.0002) per call. */
export const REFERRAL_MAX_REDUCTION_RATE = 0.0002;

// packages/snapshots/src/usage-credit-metering.ts  (CHANGED - derive, don't hand-write)
import { MARKETED_TIERS, OVERAGE_CENTS_PER_CREDIT } from "./pricing-constants.js";
const PLAN_MONTHLY_CREDITS: Record<UsageCreditPlanId, number> = {
  ...Object.fromEntries(MARKETED_TIERS.map((t) => [t.plan_id, t.monthly_credits])),
  enterprise: 0,
} as Record<UsageCreditPlanId, number>;
// creditsFromUsdCents:  Math.max(1, Math.ceil(amountCents / OVERAGE_CENTS_PER_CREDIT))
// splitFromUsed:        overage_credits > 0 ? Math.ceil(overage_credits * OVERAGE_CENTS_PER_CREDIT) : 0

// packages/snapshots/src/referral-store.ts  (CHANGED)
import { REFERRAL_MAX_REDUCTION_RATE } from "./pricing-constants.js";
// :156  const reduction_rate = Math.min(credits.earned_credits_millicents / 100_000, REFERRAL_MAX_REDUCTION_RATE);
// :238  token_usage_reduction_rate: Math.min(credits.earned_credits_millicents / 100_000, REFERRAL_MAX_REDUCTION_RATE),

// packages/snapshots/src/index.ts  (CHANGED - barrel export)
export { MARKETED_TIERS, OVERAGE_USD_PER_CREDIT, OVERAGE_CENTS_PER_CREDIT, REFERRAL_MAX_REDUCTION_RATE } from "./pricing-constants.js";
export type { MarketedTier, MarketedPlanId } from "./pricing-constants.js";

# LAUNCH_CLAIMS.yaml  (ADD - mirrors the existing flat + one-flow-map shape the hand parser at launch-claims.test.ts supports)
  - id: billing_tiers
    text: "Free $0/10k, Starter $29/75k, Pro $99/300k, Growth $299/1.2M; overage $0.0018/credit; referral up to 0.02%/call"
    value: { free_credits: 10000, starter_credits: 75000, pro_credits: 300000, growth_credits: 1200000 }
    source: "packages/snapshots/src/pricing-constants.ts MARKETED_TIERS"
    status: "verified"
```

## Acceptance tests (DONE == claim true)
- pricing-constants.test.ts: MARKETED_TIERS grants - expect(byId('free').monthly_credits).toBe(10_000); starter 75_000; pro 300_000; growth 1_200_000 (byId = MARKETED_TIERS.find(t=>t.plan_id===id))
- pricing-constants.test.ts: MARKETED_TIERS prices - expect(byId('free').price_monthly_cents).toBe(0); starter 2900; pro 9900; growth 29900
- pricing-constants.test.ts: rate constants - expect(OVERAGE_USD_PER_CREDIT).toBe(0.0018); expect(OVERAGE_CENTS_PER_CREDIT).toBe(0.18); expect(REFERRAL_MAX_REDUCTION_RATE).toBe(0.0002)
- pricing-constants.test.ts: catalog plane consistency - for each marketed tier expect(PLAN_CATALOG.find(p=>p.id===t.plan_id).price_monthly_cents).toBe(t.price_monthly_cents); and expect that tier's highlights[] to contain `${t.monthly_credits.toLocaleString('en-US')} monthly credits`
- pricing-constants.test.ts: metering plane consistency - for a paid-tier account expect getUsageCreditSummary(...).monthly_allowance to equal the starter grant 75_000; suite -> growth 1_200_000; free -> 10_000
- pricing-constants.test.ts behavioral overage: consume enough to exceed a free account's 10_000 allowance by exactly 10_000 credits and assert effective_overage_cents === Math.ceil(10_000 * OVERAGE_CENTS_PER_CREDIT) === 1800 (i.e. $18.00 for 10k overage credits = $0.0018/credit)
- pricing-constants.test.ts round-trip: expect(creditsFromUsdCents(1800)).toBe(10_000) (export/import creditsFromUsdCents) - confirms the $0.0018 rate is symmetric
- pricing-constants.test.ts behavioral referral cap: seed referral_credits.earned_credits_millicents huge (e.g. 10_000_000) and assert getReferralTokenUsageModifier(account).reduction_rate === 0.0002 (capped at 0.02%)
- pricing-constants.test.ts ForAgents drift-guard: readFileSync apps/web/src/pages/ForAgentsPage.tsx and assert its text contains '$29' & '75,000', '$99' & '300,000', '$299' & '1,200,000', '$0.0018 per credit', and '0.02% per call' - each number produced from MARKETED_TIERS/constants via toLocaleString, so a constant change not mirrored on the page fails
- launch-claims.test.ts new assertion: const b = claimById(claims,'billing_tiers').value; expect(b.free_credits).toBe(10000); starter 75000; pro 300000; growth 1200000 - and each equals MARKETED_TIERS.find(...).monthly_credits (registry <-> live constants)
- Whole suite green under strict mode: `pnpm -r test` passes (no class components, no new deps) and `pnpm -r build` (tsc) passes with the derived Record typed as Record<UsageCreditPlanId, number>

## External gates (code alone can't satisfy)
- None for the claim itself - the constants are pure software. SEPARATE, out-of-scope caveat: resolving a real customer account to the Pro (300k) plan at runtime requires STRIPE_PRICE_ID_PRO / STRIPE_PRICE_ID_PRO_ANNUAL env vars set in prod plus an active Stripe subscription; the internal 3-valued BillingTier (paid->starter, suite->growth) has no path to pro. This spec deliberately does NOT touch that mapping.

## New runtime deps (project forbids w/o discussion)
_none_

## Depends on
_none_

## Doc impact / residual honesty caveat
Makes the ForAgents/CLAUDE-marketed pricing claim (Free $0/10k, Starter $29/75k, Pro $99/300k, Growth $299/1.2M; overage $0.0018/credit; referral up to 0.02%/call) literally code-backed and drift-proof via a single source of truth plus registry + cross-plane tests. Residual honesty caveat that MUST stay in any doc/PR text: the Pro tier's 300k grant is reachable only through a Stripe subscription (STRIPE_PRICE_ID_PRO), not through the internal free/paid/suite tier axis - so 'fully code-backed pricing constants' is true, but 'any customer can self-serve into Pro without Stripe configured' is NOT claimed by this work.
