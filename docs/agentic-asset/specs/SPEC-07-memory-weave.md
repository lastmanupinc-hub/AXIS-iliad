# SPEC-07 — Memory weave: read the project brain back into generation

**Goal:** close the accrual loop opened by WO-05. Generation output carries the
project's memory — a "Decisions already made — do not re-litigate" section in
the context files plus a standalone `project-memory.md` artifact — so every
new agent session inherits what prior sessions recorded. Determinism holds as
`f(snapshot, memory)`: memory is an explicit, bounded input loaded at the
surface; generator-core never does I/O.

Depends on WO-05 (store + REST exist) and, transitively, WO-06
(`memory_woven` union member).

## Read first
`packages/generator-core/src/program-funnel.ts` (the surface-append idiom —
copy its shape exactly), `packages/generator-core/src/autonomy-loop.ts:31-33`
(`isMarkdown`; note footers append to CURRENT content — the weave must run
before the loop), `apps/api/src/export.ts` (the `if (!programFilter)` block),
`apps/api/src/mcp-tool-impls.ts:1411-1429` (`maybeRunQualityGate` — the MCP
append site), `packages/snapshots/src/memory-store.ts` (WO-05's
`listMemoryEntries`, `MemoryEntry`).

## Contract (exact) — `packages/generator-core/src/memory-weave.ts` (new)

```ts
/** Content-only view of a memory entry — no ids, so output is a pure function of what's shown. */
export interface WovenMemoryEntry {
  kind: "decision" | "convention" | "evidence" | "goal";
  content: string;
  source: string;
  created_at: string;
}
export const MEMORY_WEAVE_LIMIT = 50;
/** Pure. Markdown section body, or null when entries is empty. */
export function buildMemorySection(entries: WovenMemoryEntry[]): string | null;
/** Weave IN PLACE: append the section to AGENTS.md and CLAUDE.md when present,
 *  and add artifact "project-memory.md" (program "skills"). Best-effort
 *  (try/catch swallow), idempotent (skip entirely if project-memory.md already
 *  exists), no-op on empty entries or empty package. */
export function appendMemoryWeave(generated: GeneratorResult, entries: WovenMemoryEntry[]): void;
```

Export both + the type from `packages/generator-core/src/index.ts` with a
one-line comment, next to the delta-report exports.

**Section rendering (deterministic):** heading
`## Decisions already made — do not re-litigate`, one intro line telling the
agent these were recorded by prior sessions via the project's memory API and
to treat them as settled unless the human reopens them. Entries grouped in
fixed kind order `decision, convention, goal, evidence` (section heading per
non-empty kind), each entry rendered
`- <content> _(source, created_at)_` — source segment omitted when empty.
Take the newest `MEMORY_WEAVE_LIMIT` entries (input is already newest-first
from the store; do NOT re-sort — trust the explicit input); when more were
provided, end with `_… +N earlier entries omitted — full log via GET
/v1/projects/{project_id}/memory._` `project-memory.md` = header
`# Project Memory — <n> entries` + the same section + a footer telling the
agent how to WRITE new entries (POST body shape, the four kinds) — this makes
memory self-propagating: every export teaches the next agent to add to it.
Never call Date — render `created_at` verbatim.

**begin.yaml injection is explicitly deferred** (requires an autonomy-loop
signature change — a later WO). Because `project-memory.md` is a markdown
artifact added BEFORE `appendAutonomyLoop`, it automatically gets a ⟳ footer
and a continuation.yaml step — the loop sequences the memory without touching
autonomy-loop.ts.

## Surface wiring

1. **`apps/api/src/export.ts`** — in the `if (!programFilter)` block, FIRST
   (before `appendDeltaReport`, so section injection lands before footers and
   the delta/funnel sequencing): try/catch-swallowed, load
   `listMemoryEntries(project_id, { limit: MEMORY_WEAVE_LIMIT + 1 })` (the +1
   lets the renderer know entries were omitted), map to `WovenMemoryEntry`
   (strip `id`/`project_id`/`account_id`), call
   `appendMemoryWeave(generated, entries)`. Fire
   `memory_woven` via the WO-06 idiom (before/after presence check on
   `project-memory.md`; `accountId` non-null;
   `await trackEvent(accountId, "memory_woven", await resolveStage(accountId), { project_id }).catch(() => {})`).
   Tenancy: project_id scoping IS the boundary — memory is only writable by
   the project owner (WO-05) and weaves only into that project's own package;
   the export handler has already enforced ownership above.
2. **`apps/api/src/mcp-tool-impls.ts`** — in `maybeRunQualityGate`, after
   `appendQualityArtifacts` and before `appendProgramFunnel`: same
   load-map-append, try/catch-swallowed, using `generated.project_id`. No
   trackEvent here in v1 (the MCP auth context varies; the export path is the
   KPI surface).

## Tests (write first)

`packages/generator-core/src/memory-weave.test.ts` (new; mirror
program-funnel.test.ts): (1) empty entries ⇒ `buildMemorySection` null,
`appendMemoryWeave` no-op; (2) grouping — kinds render in fixed order with
per-kind headings, entries under the right kind; (3) source omitted when
empty, shown when present; (4) 51 entries ⇒ 50 rendered + the omitted-note
with N=1; (5) determinism — same input twice ⇒ byte-identical; (6)
`appendMemoryWeave` injects the section into AGENTS.md + CLAUDE.md, adds
project-memory.md exactly once, leaves non-target files (JSON, other md)
untouched, and is idempotent on a second call; (7) no-op on empty package.

`apps/api/src/export.test.ts` (extend): owned project + 2 memory entries via
`addMemoryEntry` ⇒ exported ZIP's `project-memory.md` exists and AGENTS.md
(seed one in the generator result) contains "Decisions already made"; a
`memory_woven` funnel_events row exists for the account. Project with no
memory ⇒ no `project-memory.md`, no section, no event.

MCP-path integration test is **waived** (running the full analyze pipeline to
reach `maybeRunQualityGate` is disproportionate; the shared pure function is
fully covered above). State the waiver in the PR body.

## Guards
Generator-core stays I/O-free — entries arrive as an argument. Do not modify
`autonomy-loop.ts`, any generator, or the funnel/delta modules. No metering
(v1 memory is free — SPEC-05 decision). ~300 changed lines.
