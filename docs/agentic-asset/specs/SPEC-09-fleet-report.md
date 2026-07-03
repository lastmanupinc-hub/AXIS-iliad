# SPEC-09 — Fleet v1: cross-project intelligence for accounts with ≥2 repos

**Goal:** Pillar 4 (breadth). Once an account has two or more analyzed
projects, it gets org-level artifacts computed across them: a portfolio
health report and an org-wide CLAUDE.md ("this is how *we* build"). Each repo
added makes every other repo's analysis sharper — the natural expansion
motion for teams, and the third accrual surface after history (delta) and
state (memory).

**Planning decisions (fixed):**
- Fleet is **paid/suite only** (403 `TIER_REQUIRED` for free — the strategy
  prices the relationship, not the transaction). No credit metering in v1;
  a `meterPersistenceOp`-style op is a later owner decision.
- Read-only compute-on-demand: nothing is persisted. Determinism holds as
  `f(latest context maps, memory decisions)` — same inputs ⇒ byte-identical
  files. No new tables, no migration.
- Artifacts are **account-level, not part of the 137-generator registry** —
  do not touch ARTIFACT_COUNT/PROGRAM_COUNT or claim new artifact counts
  anywhere.

## Read first
`packages/generator-core/src/memory-weave.ts` (the pure-builder idiom and
§7 grounding rules — `domain_models` has NO field_names, only counts),
`packages/context-engine/src/types.ts` (the ONLY ctx fields you may read),
`apps/api/src/funnel.ts:83-98` (the `requireAuth` + tier-gate + readBody
idiom), `packages/snapshots/src/store.ts` (`getProjectSnapshots`,
`getContextMap`, `getProjectOwner`), `packages/snapshots/src/memory-store.ts`
(`listMemoryEntries`), SPEC-05's OpenAPI/counts section (the ENDPOINT_COUNT
knock-on pattern — it applies here again).

## Pure core (`packages/generator-core/src/fleet-report.ts` — new)

```ts
export interface FleetProjectInput {
  project_name: string;
  ctx: ContextMap;
  /** Newest-first decision contents (≤5), already loaded at the surface. May be empty. */
  memory_decisions: string[];
}
export const FLEET_MIN_PROJECTS = 2;
export const FLEET_MAX_PROJECTS = 25;
/** Pure. Exactly 2 files, or null when projects.length < FLEET_MIN_PROJECTS.
 *  Sort inputs by project_name before rendering (deterministic regardless of
 *  caller order); use at most FLEET_MAX_PROJECTS (alphabetical, note the
 *  overflow count). Never call Date — no timestamps in output. */
export function buildFleetReport(projects: FleetProjectInput[]): GeneratedFile[] | null;
```

File 1 — `fleet-report.md` (program `"fleet"`, `text/markdown`): header
`# Fleet Report — <n> projects`; a per-project table with columns
Project / Language / LOC / Frameworks / Warnings (from
`project_identity.primary_language`, `structure.total_loc`,
`detection.frameworks[].name` joined (≤3 then `+N`), and
`ai_context.warnings.length`); a **Shared stack** section — frameworks and
languages appearing in ≥2 projects, each with the list of projects using it;
an **Org-wide warnings** section — warning strings appearing verbatim in ≥2
projects (exact-string match only — computed overlap, never inference), each
with its project list. Render sections only when non-empty.

File 2 — `fleet-CLAUDE.md` (program `"fleet"`, `text/markdown`): header
`# CLAUDE.md — <n>-project fleet` + one intro line ("How this organization
builds — computed from the latest analysis of each project. Read your
project's own CLAUDE.md first; this file adds the cross-repo context.");
**Stack** — languages/frameworks used by ≥half the projects (rounded up),
each listed with its project count; **Conventions** — `ai_context.conventions`
strings appearing verbatim in ≥2 projects; **Decisions already made across
this fleet** — each project's `memory_decisions` under a `### <project_name>`
subheading (omit projects with none; omit the whole section when all are
empty). Footer: "_Computed from real analyses of <n> projects — every line
is a cross-repo fact, not an inference._"

Export both symbols + the type + both constants from
`packages/generator-core/src/index.ts` with a one-line comment (fleet is an
account-level surface, not a counted generator).

## Store (`packages/snapshots/src/store.ts` — one added function)

```ts
/** All projects owned by an account, alphabetical by name (deterministic). */
export async function listProjectsByAccount(account_id: string): Promise<Array<{ project_id: string; project_name: string }>>;
```
Plain `SELECT project_id, project_name FROM projects WHERE account_id = ?
ORDER BY project_name` — export from `packages/snapshots/src/index.ts`.

## REST (`apps/api/src/fleet-handlers.ts` — new)

`GET /v1/account/fleet` registered in `server.ts` next to the other
`/v1/account/*` routes:
1. `requireAuth` (401 handled inside it).
2. Tier gate: `tier === "free"` ⇒ **403** `TIER_REQUIRED`,
   `"Fleet intelligence requires a paid plan — it computes cross-project reports over your whole portfolio."`
3. `listProjectsByAccount`; for each project (stop after `FLEET_MAX_PROJECTS`
   ELIGIBLE projects COLLECTED — this caps the report's input, not the work
   done; `FLEET_SCAN_LIMIT` (added SPEC-10) separately caps the total projects
   EXAMINED, since an account with many context-less projects would otherwise
   force a full-account walk before finding enough eligible ones), find the
   NEWEST snapshot whose `getContextMap` returns a value (walk
   `getProjectSnapshots` from the end, bounded to the newest
   `FLEET_MAX_SNAPSHOTS_PER_PROJECT` per SPEC-10). Load
   `listMemoryEntries(project_id, { kind: "decision", limit: 5 })` and map to
   content strings. Any per-project load error: skip that project (fail-open
   per project, never fail the request).
4. Fewer than `FLEET_MIN_PROJECTS` with context ⇒ **200**
   `{ ready: false, project_count, eligible_projects, reason }` where
   `reason` says what's missing in plain language ("Fleet reports need at
   least 2 analyzed projects; this account has N with a completed analysis.").
   Not an error — dashboards poll this.
5. Otherwise **200**
   `{ ready: true, project_count, eligible_projects, projects: [names…], files }`
   (`files` = the two `GeneratedFile`s), and fire
   `await trackEvent(account_id, "fleet_viewed", await resolveStage(account_id), { projects: eligible_projects }).catch(() => {})`.

## KPI, OpenAPI, counts (same PR — explicitly authorized)

- `packages/snapshots/src/funnel-types.ts`: append `"fleet_viewed"` to
  `FunnelEventType` (WO-06 comment block). No new stages. Remember the
  WO-06 finding: `pnpm --filter @axis/snapshots build` before typechecking
  apps/api (same for `@axis/generator-core`).
- `openapi.ts`: path `"/v1/account/fleet"` (get; `security: [{apiKey: []}]`,
  tag `"Fleet"`, operationId `getAccountFleet`; 200 `FleetResponse`, 401,
  403). Schemas: `FleetResponse` (both ready shapes — mark `files`/`projects`
  optional), `FleetFile` ({path, content, content_type, program, description}).
- `counts.ts`: `ENDPOINT_COUNT` 145 → **146**, plus the two doc knock-ons
  (README.md "145 endpoints" → 146; QAPage.tsx "145 endpoints" → 146 —
  same count-honesty landmine as SPEC-05, same two files).

## Tests (write first)

`packages/generator-core/src/fleet-report.test.ts` (new; mirror
memory-weave.test.ts): (1) <2 projects ⇒ null; (2) exactly 2 ⇒ both files,
correct headers, per-project table rows present; (3) shared-stack: a
framework in 2 of 3 projects lists exactly those 2; one unique to a single
project appears nowhere in shared sections; (4) org-wide warnings only on
verbatim ≥2 overlap; (5) conventions intersection ≥2; (6) memory decisions
render under the right project subheading, section omitted when all empty;
(7) input order irrelevant — shuffled input ⇒ byte-identical output
(determinism + sort proof); (8) 26 projects ⇒ 25 used + overflow note;
(9) never contains "undefined"/"NaN" with minimal/empty ctx fields.

`apps/api/src/fleet-handlers.test.ts` (new; mirror memory-handlers.test.ts):
(1) 401 unauthenticated; (2) 403 free tier with TIER_REQUIRED; (3) paid
account, 0-1 analyzed projects ⇒ 200 `ready: false` with counts; (4) paid
account, 2 projects with saved context maps (+1 memory decision on one) ⇒
200 `ready: true`, both files present, fleet-CLAUDE.md contains the decision
under the right project heading; (5) another account's projects never leak
into the caller's fleet (create a second account's project, assert absent);
(6) `fleet_viewed` funnel event on ready:true and NOT on ready:false.

## Explicitly deferred (owner decisions — do not implement)
MCP tool exposure (`get_fleet_report` bumps `MCP_TOOL_COUNT`); weaving
fleet-CLAUDE.md into each repo's per-project export; portfolio trends over
time (needs delta history aggregation); credit metering; email digest.

## Estimate & guards
~620 changed lines (two new test files carry most of it) — exceeds the §5
~400 guidance; pre-authorized here, state it in the PR body. Do not touch
`billing.ts` (import `requireAuth` from it — that's reading, not editing),
any generator, or the memory/delta/funnel/weave modules. No persistence, no
migration, no new dependencies.
