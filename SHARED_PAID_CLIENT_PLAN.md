# Shared PAI'D Client — extraction plan (migration 3/3)

Goal: stop maintaining three near-identical PAI'D clients (Iliad TS, Odyssey TS, Avatar
Python).

> **Status (updated):** Steps 1–3 are **DONE** — `@axis/paid-client` exists in
> `packages/paid-client`, the API is generalized (app-agnostic), Iliad consumes it via
> `workspace:*` through a thin adapter, and the full build + 132 PAI'D/credit/stripe tests
> pass. What remains is **infra you own**: step 4 (publish to npm), then 5 (Odyssey consumes)
> and 6 (Python port). The route is built; publishing is the gate.

## Finding — it's cleanly extractable
`apps/api/src/paid-client.ts` imports **only `node:crypto`** (`createHmac`, `randomUUID`,
`timingSafeEqual`). No `@axis/*`, no app state. The whole PAI'D HTTP client — `paidPost`,
`createCheckoutSession`, `createTopupCheckoutSession`, `verifyPaidWebhookSignature`,
`PaidError`, and the env resolvers (`resolvePaidBaseUrl` / `resolvePaidWebhookSecret` /
`isPaidConfigured` / `loadPaidConfig`) — is generic and portable as-is.

## The only app-specific bits to remove from the shared core
- `CheckoutPlanId` — Iliad: `starter|pro|growth`; Odyssey: `paid|suite`.
- `tierForPlan(planId)` — the plan→tier mapping differs per app.

These must NOT live in the shared package. Generalize `createCheckoutSession` to take
**generic metadata** (like `createTopupCheckoutSession` already does) and let each app's thin
wrapper build the `metadata.tier` / `metadata.plan_id`. Then the package is fully app-agnostic.

## Blocker — true sharing needs publishing
Iliad and Odyssey are **separate repos** with no shared workspace. A `packages/paid-client`
in Iliad can't be consumed by Odyssey via `workspace:*`. Real de-dup requires **publishing
`@axis/paid-client` to npm** (or a private registry / git dependency). No npm publish pipeline
exists yet. Until that decision is made, extracting in-Iliad is setup without payoff, and the
**current copy-sync** (Odyssey's `paid-client.ts` is a 2-line-adapted copy of Iliad's) is the
pragmatic shared model.

## Steps (≈1 focused session once publishing is decided)
1. **Generalize the API** in Iliad: drop `CheckoutPlanId`/`tierForPlan` from `paid-client`;
   make `createCheckoutSession` take `{ amountCents, description, successUrl, cancelUrl,
   metadata, customerEmail?, idempotencyKey? }`. Move the plan→price→metadata logic into
   `paid-handlers` (it already has `planPriceCents`, `resolvePaidPlanId`, `tierForPlan`).
2. **Extract** `packages/paid-client/` (`@axis/paid-client`): move the generalized client,
   add `package.json` + `tsconfig`, `src/index.ts` re-exports. Iliad consumes via `workspace:*`.
   Update the 2 importers (`paid-handlers.ts`, `credit-pack-handlers.ts`).
3. **Verify** Iliad (tsc + the `paid-handlers`/`paid-integration-resilience` suites).
4. **Publish** `@axis/paid-client` to npm (the gating infra step).
5. **Consume in Odyssey**: `npm i @axis/paid-client`, delete Odyssey's copied `paid-client.ts`,
   keep its thin tier-mapping wrapper.
6. **Python (Avatar)**: separate — a small `paid_client.py` matching the same env contract
   (`PAID_API_BASE_URL`/`PAID_API_KEY`/`PAID_WEBHOOK_SECRET`) and `/checkout/sessions` shape.
   Not shareable with the TS package; share the *contract*, not the code.

## Order vs the other migrations
Do this **after** the Odyssey port (migration 2/3) merges — otherwise generalizing the API
churns against that in-flight branch. And only once publishing is set up; otherwise it's
premature. The env-name resilience (PR #30) already removes the worst pain of the divergence.
