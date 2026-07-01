# Fault-Injection Gauntlet — Deterministic Process Spec

> **Purpose.** A repeatable, **AI-free** procedure that characterizes a codebase's *failure surface* by deliberately injecting faults and recording how the system **refuses** (or fails to). Designed to be built into the AXIS `debug` generator as a deterministic capability — no LLM, no GPU: it is grep + `tsc` + the dependency graph + a fixed rule table.
>
> Companion record of an actual run: [`FAILURE_MODES.md`](./FAILURE_MODES.md).

## Core principle

A **loud, fail-closed refusal is the system working** — a `tsc` error, an HTTP 400, "REFUSING TO START", a red test. Those are the safety net catching the fault; they are **passes**, not findings.

The findings that matter are the failures that *don't* refuse:

| Class | Meaning | Why it's dangerous |
|-------|---------|--------------------|
| `SILENT` | Fault compiles clean **and** tests stay green, but behavior is wrong at runtime | No signal — ships undetected |
| `CRASH` | Unhandled rejection / throw with no structured response | Request dies with no body; caller can't recover |
| `FAIL_OPEN` | A guard (auth, quota, signature, validation) that fails *permissive* | Security / billing bypass |
| `OBSERVABILITY` | Real failure that only reaches `console.*` or nowhere | Invisible in production logs; not queryable/correlated |
| `REVIEW` | Ambiguous swallow (empty `catch`) — may be intentional | Needs a human/rule decision |
| `LOUD_SAFE` | Caught loudly by the type/test/validation net | ✅ net works — record as evidence, not a bug |
| `ACCEPTABLE` | Deliberate best-effort swallow (e.g. cleanup `kill()`) | ✅ correct by design |

Rank fixes by class, worst first: `FAIL_OPEN` > `CRASH` > `SILENT` > `OBSERVABILITY` > `REVIEW`.

## Safety protocol (non-negotiable)

1. **Sandbox only.** Work on a throwaway branch (`chore/fault-injection-gauntlet`). Every injection is **reverted immediately** after measurement (`git checkout -- <file>`). **Nothing is committed except these docs.**
2. **Code-level only.** "Cascade" = compile / test / dependency cascade. **Never** inject into live infrastructure (prod DB, payment rails, deployed services).
3. **Characterize-first.** Record the whole surface *before* fixing anything, so fixes are prioritized by real severity, not discovery order.

## Fault categories & deterministic recipes

Each recipe is: **detect** (where to look — deterministic) → **inject** (the fault) → **measure** (command) → **classify** (rule).

### 1. Export-removal cascade
- **Detect:** dependency-graph hotspots (files with high inbound imports).
- **Inject:** rename/remove one exported symbol.
- **Measure:** `tsc --noEmit`; count `error TS` + unique files.
- **Classify:** errors > 0 → `LOUD_SAFE` (record cascade breadth = the blast radius). 0 errors on a used symbol → `SILENT` (dead export or missing consumer typing).

### 2. Type-contract break
- **Detect:** exported `interface`/`type`/return types consumed across modules.
- **Inject:** change a field type / return type to a structurally-incompatible one.
- **Measure:** `tsc --noEmit`.
- **Classify:** loud → `LOUD_SAFE`; compiles despite semantic change → `SILENT` (structural typing hole).

### 3. Runtime throw / null injection (test-net probe)
- **Detect:** exported functions that **have** a test.
- **Inject:** force a throw / return `null` / invert a boolean / off-by-one.
- **Measure:** run the covering test file.
- **Classify:** a test goes red → `LOUD_SAFE` (coverage holds). Tests stay green → `SILENT` (coverage gap on real logic).

### 4. Swallowed-error site sweep (static)
- **Detect (grep):** `.catch(() => {})`, `.catch(() => undefined)`, `} catch {}`, `catch (e) {}` with empty body, `.catch(() => {})` on `await`ed side-effects (emails, webhooks, charges).
- **Inject (optional):** make the swallowed operation reject; run any covering test.
- **Classify:** side-effect that a user/operator depends on (email, webhook, charge, grant) → `SILENT`. Best-effort resource cleanup (`kill()`, `rm`, `close`) → `ACCEPTABLE`. Unclear → `REVIEW`.

### 5. Env / config fault (fail-closed check)
- **Detect:** required env vars read at startup / in validators.
- **Inject:** unset one; boot the process / run the validator.
- **Measure:** exit code + log.
- **Classify:** refuses to start with a clear message → `LOUD_SAFE`. Boots degraded / uses an unsafe default → `SILENT` or `FAIL_OPEN`.

### 6. Malformed-input guard removal
- **Detect:** handler input validation (`sendError(… 400 …)`, schema checks) before side-effects.
- **Inject:** remove one guard; POST the now-unguarded bad input in a test.
- **Measure:** status + whether a covering test catches it.
- **Classify:** 400/422 preserved by another layer or a test → `LOUD_SAFE`. Reaches the side-effect / crashes → `CRASH` or `FAIL_OPEN`.

### 7. Pinned-constant vs reality drift
- **Detect:** manually-pinned constants that *claim* to mirror a live value (counts, versions, limits).
- **Inject:** change the constant to a wrong value.
- **Measure:** run the "consistency" test.
- **Classify:** test catches the wrong value → `LOUD_SAFE`. Test only checks shape (positive-int, non-empty) → `SILENT` (the pin can drift from reality).

### 8. Guard fail-direction (security/billing)
- **Detect:** auth / signature / quota / entitlement checks.
- **Inject:** make the check's dependency throw or return ambiguous.
- **Measure:** does the request proceed?
- **Classify:** denied on error → `LOUD_SAFE` (fail-closed). Proceeds → `FAIL_OPEN` (highest severity).

## Measurement commands (this repo)

```bash
# type cascade (per package)
pnpm --filter @axis/api exec tsc --noEmit
pnpm --filter @axis/web exec tsc --noEmit

# test-net probe (DB-backed needs a throwaway Postgres, matching CI's postgres:16)
docker run -d --name axis-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=axis_test -p 5433:5432 postgres:16
DATABASE_URL="postgres://postgres:postgres@localhost:5433/axis_test" \
  node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run <file> --no-coverage

# static silent-site sweep
grep -rnE "\.catch\(\(\) *=> *\{? *\}?\)|\} catch \{\s*\}" apps/api/src --include=*.ts | grep -v .test.ts
```

## Building it into the AI-free debugger — status: **partially implemented**

The `debug` generator produces this catalog with **no model**:

- **Input:** repo snapshot + symbol/dependency graph (already built by `@axis/repo-parser` / `@axis/context-engine`) + `source_files[].content`.
- **Steps:** (a) rank hotspots from inbound-import counts; (b) run the static sweeps (categories 4, 7 patterns are pure regex); (c) optionally drive categories 1–3, 5, 6, 8 via `tsc`/test harness in a sandbox; (d) apply the fixed classification rule table above.
- **Output:** deterministic, reproducible, diffable — no LLM, no GPU.

**Implemented (`packages/generator-core/src/generators-debug.ts`):** `analyzeFailureSurface(files)` runs the static recipes — **category 4** (swallowed-async-error, empty-catch), the observability variant (unstructured `console.*`), and **type-holes** (`as any` / `@ts-ignore`) — classifies each by the rule table (`SILENT`/`OBSERVABILITY`/`REVIEW`/`ACCEPTABLE`/`TYPE_HOLE`), and `renderFailureSurface()` emits the **"Failure Surface (deterministic)"** section into `debug-playbook.md`. Category 1 (cascade hotspots) was already surfaced via the dependency graph.

**Not yet implemented (injection-driven):** categories 1–3, 5, 6, 8 need a sandbox harness (branch + `tsc`/test runner + revert) — a future `debug --deep` mode. The static half already flags most real gaps (this repo: the swallowed side-effects + unstructured payment logs) with zero injection.

The gold this surfaces is always in the same seam: the **async / observability boundary** (swallowed side-effects, unstructured logs, un-derived pins) — where the type net can't reach.
