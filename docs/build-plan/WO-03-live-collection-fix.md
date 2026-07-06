# WO-03 · live-collection-fix

**Claim it makes true:** InstallPage/ForAgents: "HTTP 402 -> MPP challenge -> Stripe payment -> retry. No human needed." (live in-band collection).

**Tier:** B_client_external_gated · **Effort:** M · **Package:** apps/api (@axis/api)

**Verify verdict:** implementable_by_sonnet5=`False` · fully_closes_claim=`False` · confidence=`high`
**Missing for codeability:** The headline deliverable -- the gated e2e that "proves the collection leg" -- is left as `/* ... */`. To author it an agent must construct the X-Payment retry header from a challengeId + a Stripe shared-payment-token, which requires mppx's undocumented client-side protocol (challenge binding via MPP_SECRET_KEY, header encoding, SPT format). The spec supplies none of this, and it cannot be reverse-engineered locally because mppx is not installed in node_modules and the in-repo H1 doc only says "retry with the X-Payment credential" without showing construction. The test also cannot be run to green without external Stripe SPT credentials, so an agent cannot verify its own work on the one piece that matters. Everything else (paymentRailStatus + readiness wiring, the [MPP] not configured warn, unit/route tests reusing the existing metrics.test.ts DB harness, InstallPage interim copy, runbook) is fully spec'd and buildable.
**Spec overclaims flagged:** Presents the e2e as 'a runnable gated test' that proves the settlement leg while leaving its body as `/* ... */`; making it pass is itself the hard, external-gated part, so 'THIS PASSING == the collection leg is proven' understates that the passing is not achievable from code+spec alone; 'a runnable gated test' overstates runnability -- it is skip-by-default and unrunnable without an allowlisted Stripe feature plus an out-of-band token, so in practice it never runs in CI; Frames the three external gates as separable items when the SPT-capability gate and the test-token gate are effectively the same allowlist, so the 'code proves it in TEST mode' promise still bottoms out on the live allowlist gate; Effort 'M' is optimistic given the e2e requires reverse-engineering an uninstalled library's payment protocol
**Hidden external gates:** STRIPE_SECRET_KEY must be set in the Render dashboard (render.yaml:62-63 is sync:false) -- human action, correctly flagged by the spec; Stripe Shared Payment Tokens (SPT) is an allowlisted/limited-availability capability that must be enabled on the account even for the card settlement leg -- flagged by the spec; A valid shared-payment-token (STRIPE_TEST_SPT_TOKEN) must be minted out of band; code cannot create it -- but minting one likely itself requires SPT capability, so this gate is COUPLED to the previous one, not independent as the spec implies; The gated e2e is skip-by-default, so it produces NO green signal in normal CI/automation -- its passing depends on a human supplying creds, i.e. the same external gate; it adds no automated assurance; Closing prod to payment_rail:'live' + observing a live X-Payment 200 requires a real-money card charge against a real customer token -- an operational gate beyond merely enabling the feature; mppx client-side X-Payment protocol knowledge is an undocumented soft dependency: the format is neither in the spec nor discoverable in-repo (library uninstalled)

## Current state
The full H1 in-band settlement wiring exists and the flag is ON in prod, but the loop's Stripe leg is unverified and the failure is silent. Flag `inbandSettlementEnabled()` at apps/api/src/mcp-runtime.ts:140-142 reads `AXIS_MCP_INBAND_SETTLEMENT`, which render.yaml:35-36 sets to "true". The MCP gate `settleMcpCallInband` (mcp-server.ts:400-428) and REST twin `chargeWithDiscounts` (handlers.ts:60-83) both call the shared tail `settleOverageCash` (apps/api/src/cashier.ts:28-42), which calls `chargeMpp` (apps/api/src/mpp.ts:105-175). `chargeMpp` gets its instance from `getMppx()` (mpp.ts:53-88), which returns null at mpp.ts:55 when `STRIPE_SECRET_KEY` is absent. That null then bails at mpp.ts:110-111 WITH NO LOG (the silent path (a)). render.yaml:62-63 declares `STRIPE_SECRET_KEY` as `sync:false` (dashboard-only secret) -- the prime suspect for a process that never receives the key. `shouldEmitRuntimeLogs()` (logger.ts:95-96) is true in prod, so the absence of any `[MPP] charge failed` log (which only path (b), mpp.ts:158-163, emits) indicates path (a): the key is not reaching the process, not an SPT throw at settlement. mpp.test.ts:120-123 already proves the 402 challenge issues locally from a fake key without contacting Stripe, so "402 not issued" is not the gap; the unproven leg is X-Payment -> 200 settlement, which requires a real Stripe SPT call. The readiness endpoint `/v1/health/ready` (handleReadiness, metrics.ts:86-104) exposes `checks.database` but has NO payment_rail presence check, so operators cannot see whether the key reached the process.

## Target state (== the claim is literally true)
Three things become literally true: (1) a safe, presence-only diagnostic lets anyone confirm from prod whether the payment rail is wired and in which mode, without exposing the secret; (2) the previously silent "not configured" path is observable in logs; (3) the 402 -> X-Payment -> 200 settlement loop is proven end-to-end against Stripe TEST mode by a runnable gated test, so DONE for the InstallPage claim == that test passes AND prod `/v1/health/ready` reports `payment_rail:"live"`. Concretely: `handleReadiness` `checks{}` gains `payment_rail: "absent"|"test"|"live"` (derived from `STRIPE_SECRET_KEY` prefix, never the value) and this check does NOT gate `ready` (rail absence degrades to 429, it is not an outage). `chargeMpp`'s null-instance branch emits a `[MPP] not configured` warn. A gated integration test drives an over-quota request to a 402 with challengeId, then retries with a valid Stripe test-mode shared-payment-token X-Payment header and asserts 200 + a `Payment-Receipt` response header. The manual prod steps (set the dashboard secret, confirm SPT capability, curl readiness) are captured in a runbook so the external gate is explicit and checkable.

## Files to create / edit
- apps/api/src/metrics.ts
- apps/api/src/metrics.test.ts
- apps/api/src/mpp.ts
- apps/api/src/mpp.test.ts
- apps/api/src/live-settlement.e2e.test.ts
- docs/runbooks/live-collection-verification.md
- apps/web/src/pages/InstallPage.tsx

## Interfaces
```ts
// apps/api/src/metrics.ts -- presence-only rail diagnostic (NO secret value ever returned)
export type PaymentRailStatus = "absent" | "test" | "live";
export function paymentRailStatus(): PaymentRailStatus {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) return "absent";
  if (k.startsWith("sk_live_") || k.startsWith("rk_live_")) return "live";
  return "test"; // sk_test_/rk_test_ or any other non-empty value treated as non-live
}
// handleReadiness checks{} gains payment_rail; it MUST NOT be folded into `ready`:
//   const ready = !shutting && dbCheck.success;            // unchanged
//   checks: { shutting_down, database, payment_rail: paymentRailStatus() }

// apps/api/src/mpp.ts -- make the silent path (a) observable (mpp.ts:110-111)
// replace `const inst = getMppx(); if (!inst) return null;` with:
const inst = getMppx();
if (!inst) {
  if (shouldEmitRuntimeLogs()) {
    console.warn(`[MPP] not configured (STRIPE_SECRET_KEY absent) - ${options.description ?? "AXIS API credit"}`);
  }
  return null;
}

// apps/api/src/live-settlement.e2e.test.ts -- gated end-to-end proof of the settlement leg.
// External gate is explicit: skips unless a real Stripe test key + SPT-capable token are provided.
const STRIPE = process.env.STRIPE_TEST_SECRET_KEY;      // sk_test_...
const SPT    = process.env.STRIPE_TEST_SPT_TOKEN;       // a Stripe test shared-payment-token
(STRIPE && SPT ? describe : describe.skip)("402 -> X-Payment -> 200 (Stripe test mode)", () => { /* ... */ });
```

## Acceptance tests (DONE == claim true)
- Unit (metrics.test.ts, runs now): with STRIPE_SECRET_KEY unset, paymentRailStatus() === 'absent'; with 'sk_test_x' it === 'test'; with 'sk_live_x' it === 'live'. Assert the returned value is always one of the three literals and never contains the key substring.
- Route (metrics.test.ts, runs now): GET /v1/health/ready with STRIPE_SECRET_KEY unset returns HTTP 200 (service still ready) and JSON body checks.payment_rail === 'absent' -- proving the rail check is diagnostic-only and does NOT gate readiness. The raw response body must not contain the secret value.
- Route (metrics.test.ts, runs now): with STRIPE_SECRET_KEY='sk_test_fake', checks.payment_rail === 'test' and status stays 200; with 'sk_live_fake', checks.payment_rail === 'live'.
- Unit (mpp.test.ts, runs now): with STRIPE_SECRET_KEY unset and AXIS_ENABLE_TEST_LOGS='1', a console.warn spy captures a message matching /\[MPP\] not configured/ and chargeMpp resolves to null -- path (a) is now observable.
- Gated e2e (live-settlement.e2e.test.ts): given STRIPE_TEST_SECRET_KEY + STRIPE_TEST_SPT_TOKEN, an over-quota request to a metered route returns 402 with a non-empty challengeId (RFC 9457 body type 'https://paymentauth.org/problems/payment-required'); a follow-up request carrying the X-Payment header built from the challenge + SPT returns 200 with a non-empty 'Payment-Receipt' response header. When either env var is absent the suite is skipped (never a false green). THIS PASSING == the claim's collection leg is proven in test mode.
- Prod verification (runbook, manual, non-code gate): curl https://api.iliad.trustfabric.ai/v1/health/ready returns checks.payment_rail === 'live'. Until this reads 'live', the InstallPage copy MUST carry the residual caveat and not assert live collection as verified.

## External gates (code alone can't satisfy)
- STRIPE_SECRET_KEY must be set in the Render dashboard for axis-api (render.yaml:62-63 is sync:false -- code cannot set it; a human/dashboard action is required and is the prime suspected root cause).
- The Stripe account must have Shared Payment Tokens (SPT) capability enabled -- this is an allowlisted/limited-availability Stripe feature. Without it, the 402 issues but the X-Payment -> 200 settlement leg cannot complete with cards even when the key is present. Confirm via Stripe dashboard/support.
- The paying agent (or the e2e test) must supply a valid shared-payment-token to retry with X-Payment; code cannot mint a real customer card token. The gated test needs STRIPE_TEST_SECRET_KEY + STRIPE_TEST_SPT_TOKEN provided out of band.

## New runtime deps (project forbids w/o discussion)
_none_

## Depends on
_none_

## Doc impact / residual honesty caveat
Makes InstallPage.tsx:170 / ForAgents '402 -> MPP challenge -> Stripe payment -> retry. No human needed.' honest ONCE the gated e2e passes AND prod /v1/health/ready shows payment_rail:'live'. Residual honesty caveat that must remain until both hold: the copy should not present LIVE in-band collection as verified while payment_rail is 'absent' or 'test'. Recommended interim wording (this WO edits InstallPage to match reality): 'Over-quota agents get an HTTP 402 MPP challenge and can settle in-band via X-Payment retry (Stripe test-mode verified; live-mode collection is enabled once the account's Stripe SPT capability is active).' Flip to the unqualified claim only after the prod readiness check reads 'live' and a live X-Payment 200 has been observed. The spec deliberately proves the loop in Stripe TEST mode by code; 'live' is gated on the two external Stripe gates above and cannot be closed by code alone.
