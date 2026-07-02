# SPEC-11 — Watchtower analysis-on-push (make the delta real in production)

**Origin:** WO-04's own evidence recorded that `dispatchWebhookSnapshot` never
populates a context map for the snapshots it creates, so the watchtower delta
is a production no-op: `getContextMap(snapshot.snapshot_id)` at
`github-webhook.ts:333` is ALWAYS null for the just-created snapshot ⇒ every
dispatch logs `delta_skipped reason:no_ctx`. Watchtower v1 shipped the
narrative machinery (WO-01's `buildDeltaReport`, WO-04's storage) but no
analysis to feed it. This order closes that gap — it is also a Phase-0 item in
NO_FATE_ROLLOUT (watchtower deltas are launch-story fuel).

## Read first
`apps/api/src/github-webhook.ts:244-383` (the dispatch + delta block — the
whole change lands inside it), `apps/api/src/handlers.ts:550-558` (the REST
analyze pipeline this mirrors), `apps/api/src/github-webhook.test.ts` (23
existing tests + their fetch-mocking idiom).

## The fix — analyze the snapshot the webhook just created

In `dispatchWebhookSnapshot` (github-webhook.ts), immediately after the
`snapshot_created` log (line ~319) and BEFORE the delta block:

```ts
// Analysis-on-push: build + persist the context map so the delta below (and any
// later consumer) has something to diff. Fail-open — analysis failure must never
// surface past the webhook's success path; the snapshot itself already persisted.
try {
  const contextMap = buildContextMap(snapshot);
  const repoProfile = buildRepoProfile(snapshot);
  await saveContextMap(snapshot.snapshot_id, contextMap);
  await saveRepoProfile(snapshot.snapshot_id, repoProfile);
  log("info", "github-webhook.analysis_completed", {
    repo: target.repoFullName,
    snapshot_id: snapshot.snapshot_id,
  });
} catch (err) {
  log("error", "github-webhook.analysis_failed", {
    repo: target.repoFullName,
    snapshot_id: snapshot.snapshot_id,
    error: err instanceof Error ? err.message : String(err),
  });
  // No ctx ⇒ the delta block below will skip with reason:no_ctx, as today.
}
```

Wiring details (decisions, not options):
- `buildContextMap`/`buildRepoProfile` come in via a STATIC import from
  `@axis/context-engine` at the top of the file (matching the existing static
  `buildDeltaReport` import from `@axis/generator-core` — they are pure and
  cheap to load).
- `saveContextMap`/`saveRepoProfile` join the existing dynamic-import
  destructure at line ~269 (`const { createSnapshot, ... } = snapshotsMod;`).
- Save the repo profile too (parity with the REST pipeline at
  handlers.ts:554-558; it is one pure call + one write, and downstream
  consumers of webhook snapshots get the same shape as analyzed ones).

## Deliberately NOT in scope (decisions of record)
- **No `generateFiles`.** The 140-artifact package is the paid product
  surface; webhook snapshots are anonymous. Watchtower needs the context map,
  nothing more. Priming full packages on every push would be a free-compute
  abuse surface.
- **`watchtower_delta` trackEvent stays unwired** — unchanged SPEC-06 verdict:
  webhook snapshots have no account until an installation→account mapping
  lands; there is nothing to attribute the event to.
- **No per-repo rate limiting in this order.** The dominant per-push cost
  (fetchGitHubRepo network + createSnapshot write) already exists today and is
  bounded by GitHub App signature verification + delivery dedup; the analysis
  adds pure CPU. A per-repo cooldown is future hardening, not this fix.
- **No retention/pruning of webhook snapshots** — pre-existing property,
  separate concern.

## Tests (extend `apps/api/src/github-webhook.test.ts`, existing mock idiom)
1. **Analysis lands:** a dispatched webhook snapshot has a non-null context
   map (`getContextMap(snapshot_id)`) and repo profile after dispatch resolves.
2. **Watchtower goes live end-to-end:** two sequential dispatches for the SAME
   repo (different delivery ids, changed file content between them — e.g. add
   a route or dependency so `buildDeltaReport` returns non-null) ⇒ the second
   snapshot's stored generator result contains `delta-report.md` whose content
   reflects the change; the `delta_stored` log fires instead of
   `delta_skipped`.
3. **First-snapshot skip unchanged:** a single dispatch for a fresh repo still
   logs `delta_skipped reason:first_snapshot` (regression).
4. **Identical re-push:** two dispatches with identical files ⇒ second skips
   with `reason:no_change` (buildDeltaReport null path — proves analysis ran
   AND the delta correctly says nothing changed).
5. **Fail-open:** covered structurally by the try/catch + the existing
   fail-open tests' pattern; if no clean injection point exists for a forced
   `saveContextMap` failure, state that in evidence (code-review coverage) —
   do NOT mock the snapshots module wholesale to manufacture it.

## Estimate & guards
~120 changed lines, majority tests. ONE source file: `apps/api/src/github-webhook.ts`
(+ its test file + WORK_ORDERS.yaml evidence). No new dependencies, no schema
changes, no forbidden zones (the webhook's signature verification and ack path
are untouched — the change is entirely inside the post-ack background
dispatch). `pnpm --filter @axis/api exec tsc --noEmit` and the full
github-webhook test file must pass; count gates unaffected (no route changes).
Branch from `main`.
