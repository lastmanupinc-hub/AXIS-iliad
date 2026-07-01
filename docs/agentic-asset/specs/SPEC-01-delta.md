# SPEC-01 — Delta intelligence (`delta-report.md`)

**Goal:** the second analysis of a repo ships a deterministic *narrative of
change* computed from the previous vs current ContextMap. This is the first
compounding surface: it only exists because history exists.

## Read first
`packages/context-engine/src/types.ts` (ContextMap shape — the ONLY fields you
may read), `packages/generator-core/src/program-funnel.ts` (the surface-append
idiom to copy), `apps/api/src/export.ts` (~lines 160-170, the append call site),
`packages/snapshots/src/store.ts` (`listSnapshots`/`getContextMap`).

## Contract (exact)

New file `packages/generator-core/src/delta-report.ts`:

```ts
export interface DeltaSummary { changed: boolean; sections: number }
/** Pure. Returns the markdown body, or null when nothing meaningful changed. */
export function buildDeltaReport(prev: ContextMap, curr: ContextMap): string | null;
/** Appends artifact "delta-report.md" (program "skills") when buildDeltaReport
 *  returns non-null. Best-effort (try/catch swallow), idempotent (skip if the
 *  path already exists), mirrors appendProgramFunnel exactly. */
export function appendDeltaReport(generated: GeneratorResult, prev: ContextMap, curr: ContextMap): void;
```

Export both from `packages/generator-core/src/index.ts` next to
`appendProgramFunnel` with a one-line comment.

## Sections (render ONLY when non-empty; computed diffs, never inference)

Keyed comparisons (stable sort all lists before diffing):
1. **Stack** — frameworks added / removed / version-changed (key: `name`;
   compare `version`).
2. **Routes** — added/removed (key: `method + " " + path`). Show up to 15 per
   direction, then `… +N more`.
3. **Domain models** — added/removed (key: `name`); models whose `field_count`
   changed (render `name: 12 → 15 fields`).
4. **Hotspots** — paths that entered/left `dependency_graph.hotspots` (key: `path`).
5. **Warnings** — `ai_context.warnings` appeared/resolved (exact-string key).
   Resolved warnings are the win — render them first with "✓ resolved".
6. **Entry points** — added/removed (key: `path`).
7. **Size** — total LOC and per-language deltas from
   `structure.file_tree_summary` aggregate (render only if |Δ| > 0).

Header: `# Delta Report — <curr.project_identity.name>`, then a single
plain-English summary sentence assembled from section counts via template
string (e.g. "Since the last snapshot: 2 routes added, 1 warning resolved,
3 hotspots changed."). Footer note: "Computed from snapshot-to-snapshot
comparison — every line above is a real diff, not an inference."
`buildDeltaReport` returns null when every section is empty. Use
`prev/curr.generated_at` verbatim if rendered — never call Date.

## Surface wiring (`apps/api/src/export.ts`)

In the same `if (!programFilter)` block that calls `appendProgramFunnel`:
fetch the project's snapshots (already ordered ASC), find the snapshot
immediately BEFORE the one being exported; if found, `getContextMap(prevId)`;
if that returns a ContextMap, call `appendDeltaReport(generated, prevCtx, ctx)`
**before** `appendProgramFunnel` (so the funnel + loop sequence it). Any
throw: catch and continue (the export must never fail because of the delta).
Emit `trackEvent(account_id, "delta_generated", "product", {project_id})`
best-effort if an account is in scope at that call site — if auth context is
not available there, skip tracking rather than restructuring (note it in the PR).

## Tests (write first — `delta-report.test.ts`)

Minimum cases: (1) identical ctx ⇒ null; (2) added framework + removed route +
resolved warning each render in the right section with correct counts;
(3) field_count change renders `12 → 15`; (4) determinism — same inputs twice
⇒ identical string; (5) appendDeltaReport appends exactly one file, idempotent
on second call, no-op when builder returns null; (6) >15 routes truncates with
`+N more`. For export wiring: extend `apps/api/src/export.test.ts` with one
case — two snapshots on one project ⇒ export of the newer contains
`delta-report.md`; single-snapshot project ⇒ absent.

## Estimate & guards
~250 LOC total. Do not modify any existing generator. Do not add the delta to
the MCP path in this WO (that's WO-04's decision surface).
