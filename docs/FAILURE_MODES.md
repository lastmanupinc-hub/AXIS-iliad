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
| G8 | env fail-closed | `env.ts` ENV_SPEC — **no `required: true` var**; `DATABASE_URL` marked `required: false` | read `validateEnv` + `pg.ts` | 🟠 REVIEW | the required-missing branch (present at env.ts:11-12) is dormant; `validateEnv` won't fail-fast on a missing DB URL — but `pg.ts:23` throws loud at connect time, so the failure is deferred, **not silent** | declare `DATABASE_URL` (+ prod-critical vars) `required: true` so it fails at the validator, earlier/clearer |
| G9 | malformed-input guard removal | invert crawl `limit` guard `\|\|`→`&&` (`handlers.ts`) | crawl test | ✅ LOUD_SAFE | #1's "rejects limit outside 1–100" test went red (`expected 503 to be 400`) — guard + test hold | none |
| G10 | billing fail-direction | disable crawl final-charge `402`-on-null (`handlers.ts`) | drained-pool test | 🟠 REVIEW | test **passed** with the guard disabled: it asserts `paid_pages>0` but not that the charge *succeeded*, so a removed/failing 402 guard = silent billing bypass. Current code is fail-closed; the gap is in the **test** | harden #1's drained-pool test to assert 402-on-charge-failure, not just `paid_pages>0` |

`as any` in `apps/api/src`: **1** (type net is tight; eq_204 held).

## Tally (running)

| Class | Count |
|-------|-------|
| ⛔ FAIL_OPEN | 0 |
| 🔴 CRASH | 0 |
| 🔴 SILENT | 3 (G2, G3, G4) |
| 🟠 OBSERVABILITY | 1 (G5) |
| 🟠 REVIEW | 3 (G6, G8, G10) |
| ✅ LOUD_SAFE | 2 (G1, G9) |
| ✅ ACCEPTABLE | 1 (G7) |

## Read so far

All 8 gauntlet categories exercised. **The type + input nets are strong** (G1 loud & bounded; G9 caught by #1's test) and **no live crash or fail-open guard was found** — the code's runtime guards are fail-closed.

The real gaps cluster in two seams the type checker can't see:

1. **Async / observability** — swallowed side-effects (G3 upgrade email, G4 seat invite) and unstructured payment logs (G5). *Code fixes.*
2. **Test-net gaps** — a guard exists in the code but the *test* doesn't assert the fail-closed behavior, so a future regression would slip through silently: G2 (pinned `ENDPOINT_COUNT` not checked against reality) and G10 (drained-pool test asserts `paid_pages>0`, not charge-success). *Test hardening.*

Net: nothing is on fire, but there are **7 "refusals that don't fire"** worth closing — 3 code (G3, G4, G5), 2 test (G2, G10), 1 config (G8), 1 review (G6). Fix order by blast radius: billing/observability (G3–G5, G10) → drift guard (G2) → config (G8) → review (G6).
