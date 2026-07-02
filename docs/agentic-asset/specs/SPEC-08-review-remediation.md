# SPEC-08 — Remediation of the WO-01..07 adversarial review findings

**Origin:** a 39-agent adversarial review of the merged PRs #110–#117
(2026-07-01) confirmed 7 distinct defects (9 findings, 7 refuted as
spec-intended). This WO fixes all 7. Three root causes are the planning
model's own (the SPEC-05 elaboration missed the delete paths; the SPEC-06
trackEvent idiom nested an unguarded `await`; the export-skip ↔ MCP-persist
interaction was not analyzed) — the fixes below are decisions, not
suggestions.

## Read first
`packages/snapshots/src/store.ts:100-125` (`deleteSnapshot`/`deleteProject`),
`packages/snapshots/src/pg-schema.ts:180,196,277` (the three no-cascade FKs),
`apps/api/src/versions.ts` (whole file), `apps/api/src/memory-handlers.ts`
(GET limit parsing + the trackEvent line),
`packages/generator-core/src/memory-weave.ts`,
`packages/generator-core/src/delta-report.ts:210-260` (sizeSection +
summary assembly), `apps/api/src/deletion.test.ts` (the test idiom for
delete paths).

## Fix 1 — delete paths vs the three no-cascade FKs (data integrity, HIGH)

In `store.ts`, inside the EXISTING transactions (no migration — code-side
cleanup keeps the FKs strict, which is correct for a money-adjacent ledger):

- `deleteSnapshot`: before `DELETE FROM snapshots`, add
  `DELETE FROM generation_versions WHERE snapshot_id = ?` and
  `UPDATE persistence_credits SET snapshot_id = NULL WHERE snapshot_id = ?`.
  The ledger row is **never deleted** — it is a monetary audit trail; only
  the snapshot reference is nulled (the column is already nullable).
- `deleteProject`: the same two statements inside the per-snapshot loop,
  plus `DELETE FROM project_memory WHERE project_id = ?` immediately before
  `DELETE FROM projects`.

Tests (extend `apps/api/src/deletion.test.ts`): (1) a project with 2 memory
entries deletes cleanly via `DELETE /v1/projects/:id` (200; project, snapshots
AND memory rows gone); (2) a snapshot that was metered (paid account, credits,
one diff call — or insert the ledger row via `meterPersistenceOp` directly)
deletes cleanly via `DELETE /v1/snapshots/:id`, and the persistence_credits
row STILL EXISTS with `snapshot_id IS NULL` (assert via `getPersistenceLedger`
— balance history intact); (3) same for project-level delete.

## Fix 2 — un-awaited async ownership guard (security, HIGH)

`apps/api/src/versions.ts` lines 28, 46, 75:
`if (!assertSnapshotAccess(req, res, snapshot)) return;` — the guard is
async (`handlers.ts:104`) and a Promise is always truthy, so it NEVER blocks
and, worse, the handler races ahead while the guard may still write a 401/404
to the same response. Change all three to
`if (!(await assertSnapshotAccess(req, res, snapshot))) return;`.
This bug predates the program (Neon sync→async migration fallout) — record
that in the PR body — but WO-02's metering sits on top of it, so it is ours
to fix. Check the repo for OTHER un-awaited `assertSnapshotAccess(` call
sites while there (grep; fix any found the same way and say so in evidence).

Tests (extend `apps/api/src/versions.test.ts`): create an OWNED snapshot
(pass account_id to createSnapshot) with version history; assert (1) an
unauthenticated caller gets 401 from all three endpoints; (2) a different
authenticated account gets 404 from all three (no-leak); (3) neither caller
produced a persistence_credits debit or a persistence_metered event; (4) the
owner still gets 200s. Existing anonymous-snapshot tests must pass unchanged
(the guard returns true for ownerless snapshots).

## Fix 3 — memory weave refresh semantics (staleness, HIGH)

The MCP paths persist the woven package (`saveGeneratorResult` after
`maybeRunQualityGate` at mcp-tool-impls.ts:1547, 1700, 2009, 2767), so the
export path's skip-if-present guard freezes memory at first-MCP-analysis
state. **Decision: the weave becomes REPLACE, not skip.**

In `memory-weave.ts`:
- Wrap the injected section in delimiters:
  `<!-- axis:project-memory:start -->` / `<!-- axis:project-memory:end -->`
  (emitted around the section in AGENTS.md/CLAUDE.md injections).
- `appendMemoryWeave`: when `project-memory.md` already exists, REPLACE its
  `content` with the freshly built artifact (do not push a duplicate). For
  AGENTS.md/CLAUDE.md: if the delimiter pair is present, replace everything
  between the markers (inclusive) with the fresh delimited section; else
  append as today. Still a no-op on empty `entries` and empty packages.
  Best-effort try/catch stays.
- Keep `buildMemorySection` pure and delimiter-free (the delimiters are the
  weaver's concern); rendering is otherwise unchanged.

Tests (extend `memory-weave.test.ts`): (1) weave once with 1 entry, weave
again with 2 ⇒ project-memory.md says "2 entries", AGENTS.md contains the
new entry exactly once, exactly one delimiter pair, no duplicated section;
(2) delimiters present in injected files. Extend `apps/api/src/export.test.ts`
with the end-to-end staleness case: save a generator result that ALREADY
contains a stale project-memory.md + a woven (delimited) AGENTS.md — as the
MCP path would persist — then `addMemoryEntry` a NEW entry and export ⇒ the
ZIP's project-memory.md contains the new entry and AGENTS.md has exactly one
section containing it. Note: `memory_woven` keeps firing only on first-weave
(the before/after presence check in export.ts is unchanged and correct —
refresh is not a new weave).

## Fix 4 — unguarded `await resolveStage()` inside guarded trackEvent (MEDIUM)

`versions.ts:101` and `memory-handlers.ts:153` evaluate
`await resolveStage(...)` as an ARGUMENT, before `trackEvent`'s `.catch()`
exists — a resolveStage rejection 500s the request after the debit/insert.
Replace both with the guarded form (this supersedes SPEC-06's one-line idiom):

```ts
try {
  const stage = await resolveStage(account_id);
  await trackEvent(account_id, "<event>", stage, { ...meta });
} catch {
  // best-effort KPI — never fail the request on analytics
}
```
The export.ts call sites already sit inside try/catch blocks — verify, don't
change them.

Tests: not separately testable without fault injection into resolveStage —
cover by code review; state that in evidence (do NOT mock the snapshots
module in these test files for this).

## Fix 5 — delta summary sentence for language-mix-only changes (LOW)

`delta-report.ts` sizeSection: when `totalDelta === 0` but `langDeltas` is
non-empty, no fragment is pushed ⇒ summary renders
"Since the last snapshot: ." Add, in that exact case:
`fragments.push(frag(langDeltas.length, "language mix shifted", "language mixes shifted"))`.
Test (extend `delta-report.test.ts`): prev/curr with identical `total_loc`
but JS→TS LOC moved ⇒ summary sentence contains "language mix" and never
ends with ": .".

## Fix 6 — memory GET `limit` integer validation (LOW, spec conformance)

`memory-handlers.ts` GET: `parseInt` truncates `"2.9"` → 2 and `"10abc"` → 10,
contra SPEC-05's fixed contract ("non-integer or < 1 ⇒ 400"). Replace with
`const n = Number(limitParam); if (!Number.isInteger(n) || n < 1) → 400`.
Test (extend `memory-handlers.test.ts`): `?limit=2.9` and `?limit=10abc` ⇒
400; `?limit=10` still 200.

## Explicitly NOT fixed (review verdicts of record — do not "improve")
Charge-before-404 and GET-retry metering (spec-intended, SPEC-02); per-export
KPI event semantics (spec-intended, SPEC-06); watchtower no-ctx skip (known
limitation, WO-04 evidence); the personalization-line vs event gate asymmetry
(spec-intended, SPEC-03/06); the "+1 earlier entries omitted" cap (the +1
loading convention, SPEC-07).

## Estimate & guards
~380 changed lines, most of it tests. Packages touched: snapshots (store.ts),
generator-core (memory-weave.ts, delta-report.ts), api (versions.ts,
memory-handlers.ts) + their tests + apps/api/src/export.test.ts +
apps/api/src/deletion.test.ts. **No migration** (code-side cleanup keeps FKs
strict), no new dependencies, no forbidden zones. Rebuild BOTH packages
(`pnpm --filter @axis/snapshots build && pnpm --filter @axis/generator-core build`)
before the api typecheck (the WO-06 dist finding).
