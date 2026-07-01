# SPEC-04 — Watchtower v1: webhook re-analysis stores a delta (fail-open)

**Goal:** a `git push` to a connected repo doesn't just re-snapshot — it
produces the *delta* unprompted and records the compounding event. This turns
the webhook from plumbing into the ambient-value surface. Email digest is
explicitly OUT of scope for this WO (later work order once this is proven).

Depends on WO-01 (`buildDeltaReport` exists and is exported).

## Read first
`apps/api/src/github-webhook.ts` — the whole `dispatchWebhookSnapshot` function
(~lines 242-310), noting the dedupe (`duplicate_delivery`), module-unavailable
guards, and the `github-webhook.snapshot_created` log (~307). Note the house
pattern: every failure mode logs a namespaced event and returns without
throwing.

## Behavior (exact)

After `snapshot_created`, inside a new `try` block (the webhook's existing
success path must be unreachable by any new throw):
1. Resolve the project's snapshot list (same store call the export surface
   uses); find the snapshot immediately before the new one. None ⇒ log
   `github-webhook.delta_skipped {reason:"first_snapshot"}` and return.
2. `getContextMap` for both; either missing ⇒ `delta_skipped {reason:"no_ctx"}`.
3. `buildDeltaReport(prev, curr)`; null ⇒ `delta_skipped {reason:"no_change"}`.
4. Persist the report as a generated file on the NEW snapshot using the same
   storage call the generation path uses for artifact files (grep how
   generated files are stored for a snapshot in `packages/snapshots` — reuse,
   don't invent). Path `delta-report.md`, program `"skills"`.
5. Log `github-webhook.delta_stored {project_id, snapshot_id, bytes}` and
   `trackEvent(account_id, "watchtower_delta", "product", {project_id})`
   best-effort (account may be null for anonymous projects — skip tracking then).
6. Catch-all: `log("error", "github-webhook.delta_failed", {error})` — never
   rethrow.

## Tests (write first — extend `apps/api/src/github-webhook.test.ts`)

Follow the file's existing mocking style. Cases: (1) second webhook snapshot
for the same repo stores `delta-report.md` on the new snapshot; (2) first-ever
snapshot ⇒ no delta, `delta_skipped` logged, webhook response unchanged;
(3) `buildDeltaReport` throwing (mock) ⇒ webhook still succeeds and
`delta_failed` is logged. If the existing test file mocks the snapshots module
wholesale, extend the mock rather than fighting it.

## Guards
No email in this WO. No changes to webhook auth/signature verification. The
new code must be provably fail-open (test case 3 is the proof). ~120 LOC.
