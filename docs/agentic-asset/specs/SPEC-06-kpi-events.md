# SPEC-06 — KPI event activation (unblocks the 4 skipped trackEvent calls)

**Goal:** make AD-7's compounding KPIs real. WO-01 through WO-04 each skipped
their spec'd `trackEvent` call for the same disclosed reason: the event names
(`delta_generated`, `persistence_metered`, `funnel_personalized`,
`watchtower_delta`) are not members of `FunnelEventType`, and the specs' stage
literals (`"product"`, `"revenue"`) are not members of `FunnelStage`. This WO
adds the event types and wires the three calls that have an account in scope.

**Planning-model decision (supersedes the stage literals in SPEC-01/02/04 and
the gated SPEC-05):** NO new `FunnelStage` members. The stage column records
where the account is in the lifecycle funnel — shoehorning `"product"` /
`"revenue"` into it would dilute the type. Call sites use the house pattern
already in handlers.ts/billing.ts: `await resolveStage(account_id)`.

## Read first
`packages/snapshots/src/funnel-types.ts:18-36` (`FunnelEventType`),
`packages/snapshots/src/funnel-store.ts:127` (`trackEvent`) and `:192`
(`resolveStage`), `apps/api/src/handlers.ts:576` (the
`trackEvent(…, await resolveStage(…), …)` idiom to copy),
`apps/api/src/export.ts` (the `if (!programFilter)` weave block — `accountId`
is in scope since WO-03), `apps/api/src/versions.ts` (`handleDiffVersions`
metering block from WO-02), `apps/api/src/github-webhook.ts` (the
trackEvent-omission comment in the watchtower block from WO-04).

## Changes (exact)

1. **`packages/snapshots/src/funnel-types.ts`** — append to `FunnelEventType`,
   with a one-line comment crediting the agentic-asset program:
   `"delta_generated" | "persistence_metered" | "funnel_personalized" |
   "watchtower_delta" | "memory_written" | "memory_woven"`.
   (`memory_written` is consumed by WO-05, `memory_woven` by WO-07 — added now
   so neither WO touches this file.) No `FunnelStage` changes.

2. **`apps/api/src/export.ts`** — in the `if (!programFilter)` block:
   - `delta_generated`: capture
     `const hadDelta = generated.files.some(f => f.path === "delta-report.md")`
     before the `appendDeltaReport` call; after it, if `!hadDelta`, the file is
     now present, and `accountId` is non-null ⇒
     `await trackEvent(accountId, "delta_generated", await resolveStage(accountId), { project_id }).catch(() => {})`.
   - `funnel_personalized`: same before/after presence check around
     `appendProgramFunnel` on `recommended-next-programs.md`; fire only when
     the artifact was appended in this call AND `accountUsage` was passed with
     at least one key.
   Both awaited-but-swallowed; the export must never fail on analytics.

3. **`apps/api/src/versions.ts`** — in `handleDiffVersions`, after a metered
   `{ok:true}` result:
   `await trackEvent(account.account_id, "persistence_metered", await resolveStage(account.account_id), { op: "diff_versions", snapshot_id }).catch(() => {})`.
   Fire on success only — a 402 is not a metered op.

4. **`apps/api/src/github-webhook.ts`** — comment-only change: update the
   WO-04 omission comment to say the union member now exists and the call
   remains unwired solely because webhook snapshots have no account until an
   installation→account mapping lands. No code change.

## Tests (write first — extend the two existing files)

`apps/api/src/export.test.ts`: (1) the existing personalization scenario
(paid account + recorded usage) also asserts a `funnel_events` row with
`event_type='funnel_personalized'` for that account after the export;
(2) a NEW owned two-snapshot project (the existing delta test is anonymous —
create accounts/keys as in the personalization test, pass `account_id` to
`createSnapshot`, auth the export request) asserts a `delta_generated` row.
The existing anonymous delta test must pass untouched — it exercises the
`accountId`-null guard (no trackEvent call possible without an account).

`apps/api/src/versions.test.ts`: (1) the paid-with-credits diff also asserts a
`persistence_metered` funnel_events row; (2) the free-tier 402 case asserts NO
`persistence_metered` row for that account.

Query events via `getEventsByType(account_id, type)` from `@axis/snapshots`
(funnel-store) — no raw SQL in tests.

## Guards
No new stages. No changes to `resolveStage` or `trackEvent` themselves. No
wiring in `github-webhook.ts` (comment only). ~80 changed lines.
