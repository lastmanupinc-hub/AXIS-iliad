# Runbook — Live Collection Verification (WO-03)

**Claim this closes:** McpPage / ForAgentsPage (formerly InstallPage — renamed since this
runbook was written) — *"HTTP 402 → MPP challenge → Stripe payment → retry. No human
needed."* (live in-band settlement of the Machine Payments Protocol / MPP overage charge,
via `chargeMpp` → `mppx` → Stripe).

**Status until every step below reads green:** the claim is **not yet fully live**.
Code alone cannot close it — three external Stripe/Render gates require a human. This
runbook makes those gates explicit and checkable so "done" isn't guesswork.

---

## What code already proves (no human needed for this part)

- `apps/api/src/metrics.ts` — `paymentRailStatus()` is a presence-only diagnostic
  (`"absent" | "test" | "live"`), derived only from the `STRIPE_SECRET_KEY` prefix,
  **never** the key value. `GET /v1/health/ready` now exposes it under
  `checks.payment_rail` and it does **not** gate `ready` — rail absence degrades paid
  calls to HTTP 429, it is not an outage.
- `apps/api/src/mpp.ts` — the previously silent "no `STRIPE_SECRET_KEY`" branch in
  `chargeMpp` now emits `[MPP] not configured (STRIPE_SECRET_KEY absent) - <description>`
  via `console.warn` whenever `shouldEmitRuntimeLogs()` is true (i.e. in prod, or in
  tests with `AXIS_ENABLE_TEST_LOGS=1`).
- `apps/api/src/live-settlement.e2e.test.ts` — a **gated** (skip-by-default) test that
  proves the full `402 → challenge → credential retry → 200 + Payment-Receipt` loop
  against real Stripe **TEST mode**, using the actual `mppx/client` payment-aware fetch
  (not a hand-rolled stand-in). It only runs when both `STRIPE_TEST_SECRET_KEY` and
  `STRIPE_TEST_SPT_TOKEN` are supplied out of band — see below.

These are necessary, but **not sufficient**, to call the InstallPage claim true. The
remaining steps are external gates: human/dashboard actions that code cannot perform.

---

## External gate 1 — Stripe secret key reaches the prod process

`render.yaml:62-63` declares `STRIPE_SECRET_KEY` with `sync: false` — it is a
dashboard-only secret. Render does not sync it from `render.yaml`; a human must set it
in the Render dashboard for the `axis-api` service.

**Verify:**

```bash
curl -s https://api.iliad.trustfabric.ai/v1/health/ready | jq '.checks.payment_rail'
```

- `"absent"` → the key has not reached the process. This is the prime suspected root
  cause of the silent settlement gap this WO was opened to fix. Set the key in the
  Render dashboard (Environment → `STRIPE_SECRET_KEY`) and redeploy/restart.
- `"test"` → a `sk_test_*` / `rk_test_*` (or non-`live`-prefixed) key reached the
  process. The 402 challenge issues, but real customer cards cannot settle.
- `"live"` → a `sk_live_*` / `rk_live_*` key reached the process. Proceed to gate 2.

Also check the logs for `[MPP] not configured` — if it appears in prod output, the key
is absent (confirms path (a) from the original diagnosis); if it never appears and
`payment_rail` still isn't `"live"`, look for `[MPP] charge failed` instead (path (b) —
the key is present but Stripe rejected the charge attempt).

## External gate 2 — Stripe Shared Payment Tokens (SPT) capability

Even with a valid key present, the `Authorization: Payment` retry leg (in-band card
settlement — the real mppx wire header; this doc used to call it "X-Payment", which
does not exist on the wire, see `live-settlement.e2e.test.ts`) requires the Stripe
account to have **Shared Payment Tokens** capability enabled. This is an allowlisted /
limited-availability Stripe feature — it is not something code can turn on.

**Verify:** confirm via the Stripe Dashboard or Stripe support that SPT is enabled for
the account backing `STRIPE_SECRET_KEY`. Without it, `chargeMpp` will issue the 402
challenge correctly, but a real customer card cannot complete the retry leg.

## External gate 3 — a valid test-mode SPT to drive the gated e2e locally

The gated e2e test (`live-settlement.e2e.test.ts`) needs two env vars that code cannot
mint on their own:

```bash
STRIPE_TEST_SECRET_KEY=sk_test_...      # a Stripe TEST-mode secret key
STRIPE_TEST_SPT_TOKEN=...               # a Stripe TEST-mode shared-payment-token,
                                         # minted out of band (requires SPT capability
                                         # on the same test account)
```

Run it with both set:

```bash
STRIPE_TEST_SECRET_KEY=sk_test_xxx STRIPE_TEST_SPT_TOKEN=xxx \
  npx vitest run apps/api/src/live-settlement.e2e.test.ts
```

If either is unset, the suite is `describe.skip` — it reports 0 tests run, not a false
pass. **This gate is coupled to gate 2**: minting a test-mode SPT itself requires SPT
capability to be active on the Stripe account, so it is not an independent step — it is
evidence that gate 2 already holds for at least the test-mode account.

---

## Definition of done for the InstallPage claim

All of the following must hold simultaneously — until they do, InstallPage/ForAgents
copy must keep the residual caveat (see below), not assert unqualified live collection:

1. `npx vitest run apps/api/src/live-settlement.e2e.test.ts` passes (not skipped) —
   proves the loop in Stripe **TEST** mode.
2. `curl https://api.iliad.trustfabric.ai/v1/health/ready` → `checks.payment_rail ==
   "live"` — proves a live-mode key reached the prod process.
3. A real live-mode `Authorization: Payment` retry has been observed to return `200`
   with a `Payment-Receipt` header against production (an actual, small, real-money
   charge — an operational step beyond simply enabling the feature; do this
   deliberately and only when ready to accept a real charge).

## Residual honesty caveat

Until all three hold, ForAgentsPage/McpPage copy must not assert unqualified live
in-band collection. The exact interim wording this runbook originally quoted
(InstallPage's "Autonomous Payment" section) no longer appears verbatim in the current
UI — the page was renamed and its copy has since evolved (see `ForAgentsPage.tsx`,
which today just says "Native x402 payments" / "Respect x402 responses for autonomous
payment" without a header-name claim to get wrong). That is not itself a violation of
this caveat, but it means the specific quoted-copy check below is historical, not a
live diff target — re-derive the current caveat wording from whatever payment-flow
copy is on the live page before flipping it to an unqualified claim.

Flip to the unqualified "No human needed" claim only after all three DONE steps above
are satisfied.
