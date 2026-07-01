# Failure-Modes Record — axis-iliad

> Live record of the fault-injection gauntlet (process: [`FAULT_INJECTION_GAUNTLET.md`](./FAULT_INJECTION_GAUNTLET.md)).
> **Characterize-only** — nothing in this run is fixed or committed except these docs. Every injection was reverted immediately.
> Run started on branch `chore/fault-injection-gauntlet` off `main@0f298d3`.

## Legend

`LOUD_SAFE` net caught it ✅ · `ACCEPTABLE` deliberate ✅ · `OBSERVABILITY` 🟠 · `REVIEW` 🟠 · `SILENT` 🔴 · `CRASH` 🔴 · `FAIL_OPEN` ⛔ (worst)

## Findings

| ID | Category | Site / injection | Measure | Class | Evidence | Fix candidate |
|----|----------|------------------|---------|-------|----------|---------------|
| G1 | export-removal cascade | rename `SnapshotResponse` export in `apps/web/src/api.ts` (#1 hotspot, 20 inbound) | `tsc --noEmit` (web) | ✅ LOUD_SAFE | 8 errors / 7 files; all `TS2305 no exported member`; blast radius bounded to 7 files | none — net works |
| G2 | pinned-constant vs reality | drift `ENDPOINT_COUNT` 143→999 in `apps/api/src/counts.ts` | `counts-consistency.test.ts` | 🔴 SILENT | test **passed 4/4** — it only asserts positive-integer, not the live route count. counts.ts comment *claims* "asserts … equal the live values" (overstated). doc-honesty catches doc drift, not spec-vs-reality | add a guard: `ENDPOINT_COUNT === (# routes parsed from server.ts)`, reusing the #2 server.ts parser |
| G3 | swallowed async error | `apps/api/src/stripe.ts:223` `sendUpgradeConfirmation(...).catch(() => {})` | static sweep | 🔴 SILENT | upgrade-confirmation email failure is invisible — same class as the fixed eq_202 welcome email | `.catch((e) => log("warn", "email.upgrade_confirmation_failed", {…}))` |
| G4 | swallowed async error | `apps/api/src/funnel.ts:124` `sendSeatInvitation(...).catch(() => {})` | static sweep | 🔴 SILENT | seat-invitation email failure invisible | `.catch((e) => log("warn", "email.seat_invite_failed", {…}))` |
| G5 | unstructured payment logging | `apps/api/src/mpp.ts:160/167/171` charge-failed / 402 / 200 via `console.*` | static sweep | 🟠 OBSERVABILITY | payment-path events go to `console`, not structured `log()` — not queryable/correlated (same class as #3 architecture-drift fix) | route through `log("info"/"error", "mpp.*", {…})` |
| G6 | empty catch | `apps/api/src/document-parsing.ts:181` `} catch {}` | static sweep | 🟠 REVIEW | swallows a parse error path — confirm intentional vs. hides a real failure | inspect; log or narrow |
| G7 | best-effort cleanup swallow | `code-sandbox.ts:408`, `speech-to-text.ts`, `text-to-speech.ts` `catch {}` on `kill()`/`rm` | static sweep | ✅ ACCEPTABLE | swallow is correct for resource cleanup | none |

`as any` in `apps/api/src`: **1** (type net is tight; eq_204 held).

## Tally (running)

| Class | Count |
|-------|-------|
| ⛔ FAIL_OPEN | 0 |
| 🔴 CRASH | 0 |
| 🔴 SILENT | 3 (G2, G3, G4) |
| 🟠 OBSERVABILITY | 1 (G5) |
| 🟠 REVIEW | 1 (G6) |
| ✅ LOUD_SAFE | 1 (G1) |
| ✅ ACCEPTABLE | 1 (G7) |

## Read so far

The **type net is strong** (G1 loud, cascade bounded). All real gaps sit on the **async / observability seam** the type checker can't see: swallowed side-effects (G3, G4), a pin with no reality check (G2), unstructured payment logs (G5). No crashes or fail-open guards found yet — the remaining injection categories (runtime throw/null, env fail-closed, malformed-input guard removal, guard fail-direction) are still to run.
