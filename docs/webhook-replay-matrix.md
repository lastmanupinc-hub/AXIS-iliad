# Webhook Replay-Protection Matrix (H8.11b)

Every inbound webhook receiver this repo exposes, what stops a captured
payload from being replayed, and what actually proves it (not just what the
code appears to do by reading it — the acceptance bar this unit set for
itself was proving each row, not asserting it).

| Handler | File : function | Signature method | Timestamp/tolerance check | Other replay protection | Test coverage |
|---|---|---|---|---|---|
| Stripe | `stripe.ts:handleStripeWebhook` | Custom HMAC-SHA256 (`{t}.{rawBody}`) | **Yes** — `age > 300` (5 min); boundary itself is tested | `eventCreated <= last_event_created_at` compare-and-set on subscription events — a stale OR exact-replay event is a no-op | Strong: stale-signature 401, exact-300s boundary, stale-event-order, exact-replay-is-noop all covered (`stripe.test.ts`, `stripe-branches.test.ts`) |
| PAI'D | `paid-handlers.ts:handlePaidWebhook` (sig fn in `packages/paid-client/src/index.ts:verifyPaidWebhookSignature`) | Custom HMAC-SHA256 (`{t}.{rawBody}`), same scheme as Stripe, header-name fallback chain (`webhook-signature`→`paid-signature`→`x-paid-signature`) | **Yes** — `age > tolerance` (default 300s) + an explicit `Number.isFinite(age)` guard Stripe's version doesn't have (defends a malformed `t` producing `NaN`, which `NaN > 300` would otherwise silently pass) | Idempotent `markPurchaseSucceeded` (credit top-ups, keyed on the PAI'D session id) + compare-and-set `updateAccountTierIfCurrent` (tier changes) — no delivery-id cache needed, the writes themselves are idempotent | Strong: stale/fresh timestamp tested, AND the exact same webhook body delivered twice through the real HTTP handler is proven idempotent for both credit-topup and tier-change paths (`paid-handlers.test.ts`) |
| GitHub — push/PR (App) | `github-webhook.ts:handleGitHubWebhook` | Custom HMAC-SHA256 over the raw body, `X-Hub-Signature-256: sha256=<hex>` | **No** — GitHub's signature scheme carries no timestamp at all; there is nothing to check a staleness tolerance against (structural, not a coding gap) | In-memory `deliveryCache`, keyed on `X-GitHub-Delivery`, 15-minute TTL | Was untested before this unit — **now covered**: same-delivery-id dedup, distinct-delivery-id non-dedup, the `duplicate_delivery` log line, and `resetGitHubWebhookState()`'s own contract (`github-webhook.test.ts`) |
| GitHub — architecture-drift | `architecture-drift-webhook.ts:handleArchitectureDriftWebhook` (sig fn `architecture-drift.ts:verifyGitHubWebhookSignature`) | Custom HMAC-SHA256, same scheme, stricter digest-format validation (`/^[0-9a-f]{64}$/i`) | **No** — same structural reason as above | In-memory `seenDeliveries` (15-min TTL) — and unlike the plain GitHub handler, this one gates the HTTP response itself (`sendJSON(res, 202, {ignored: "duplicate delivery"})` fires before any work starts) — plus an `inFlightRepos` same-repo concurrency guard | Had **zero** HTTP-layer test coverage before this unit (only the pure `processArchitectureDrift` orchestration was tested) — **now covered**: signature 401, missing-secret 503, ping, non-push events, invalid JSON, non-default-branch, the happy-path 202, duplicate-delivery dedup, and distinct-delivery non-dedup (`architecture-drift-webhook.test.ts`) |

## The one real, disclosed limitation: in-memory dedup has no timestamp backstop

Both GitHub-signed handlers' *only* defense against a captured-and-replayed
payload is the 15-minute delivery-ID cache — there is no timestamp check to
fall back on (GitHub's signature scheme doesn't carry one). Two consequences,
both accepted as-is rather than fixed in this unit, with the reasoning
written down instead of silently left unexamined:

1. **TTL window**: a captured, validly-signed old payload replayed *after*
   15 minutes is indistinguishable from a fresh delivery to the dedup cache.
2. **Process-restart survival**: the cache is a plain in-memory `Map`, so a
   deploy (or crash) between the original delivery and a replay attempt also
   defeats it.

**Why this is accepted rather than fixed here**: both handlers' downstream
effect is a re-analysis / snapshot / PR-open pipeline with no financial or
PII exposure — the worst case of a successful replay is wasted compute
(a duplicate snapshot, or a duplicate drift-check that itself no-ops if the
branch already exists — `driftBranchName` derives the branch name from the
analyzed content, so a genuine repeat produces the same branch name and
`openDriftPullRequest` reports `pr_skipped`, not a second PR). Compare this
to Stripe/PAI'D, where the equivalent gap would mean money — those two get
a real timestamp tolerance *and* idempotent/CAS writes; the GitHub handlers
get dedup sized to the actual risk. `render.yaml` currently pins
`numInstances: 1` for `axis-api`, so there is also no cross-instance
coordination gap today — **if that ever changes, the in-memory cache stops
being a safe assumption and should be replaced with a persistent,
DB-backed delivery-ID table** (the same shape as the existing
`idempotency_keys` table already used for MCP call idempotency) before
scaling horizontally.

## What changed in this unit

- `github-webhook.test.ts`: added the duplicate-delivery/distinct-delivery/
  log-line/reset-contract tests that didn't exist before.
- `architecture-drift-webhook.test.ts`: added an entirely new
  `handleArchitectureDriftWebhook` HTTP-layer describe block (signature,
  config, routing, and both replay-protection guards) — previously only the
  pure orchestration function was tested.
- No production code changed. The audit found the *protection* was already
  correctly implemented in both handlers; the gap was exclusively in proving
  it, which is what H8.11b's own acceptance bar asked for.
