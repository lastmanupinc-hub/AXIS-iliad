# Execution Plan — from strategy to work orders

Companion to `docs/AGENTIC_ASSET_STRATEGY.md`. That doc says *why*; this one
fixes *what and how*. Architecture decisions (AD-x) below are **made** — the
executor implements them, it does not revisit them.

## Verified ground truth this plan stands on (2026-07-01)

- Snapshot lineage: re-analyses of the same repo link via
  `projects (project_name, account_id)` → `snapshots ORDER BY created_at`
  (`packages/snapshots/src/store.ts:16,90`).
- `getContextMap(snapshot_id)` returns the stored ContextMap (`store.ts:146`).
- Version endpoints exist: list/get/diff at `apps/api/src/versions.ts` routed in
  `server.ts:173-175`.
- `meterPersistenceOp(account_id, tier, op, snapshot_id?) → {ok, reason?}` is
  exported and **deliberately uncalled** (`packages/snapshots/src/index.ts:144`,
  impl `persistence-metering.ts:105`); free tier already refuses with an
  upgrade message; costs come from `PERSISTENCE_CREDIT_COSTS[op]`.
- GitHub webhook creates background snapshots; the post-creation hook point is
  `github-webhook.ts` right after the `github-webhook.snapshot_created` log
  (~line 307).
- The surface-append pattern (not counted as generators): `appendQualityArtifacts`
  → `appendProgramFunnel` → `appendAutonomyLoop`, called in `apps/api/src/export.ts`
  (~line 164) and `apps/api/src/mcp-tool-impls.ts` (~line 1421).
- Program funnel: `packages/generator-core/src/program-funnel.ts`
  (`buildNextPrograms(programsRun, ctx, limit)` — pure).

## Architecture decisions

**AD-1 — Delta is a pure two-input function.** New file
`packages/generator-core/src/delta-report.ts`:
`buildDeltaReport(prev: ContextMap, curr: ContextMap): string | null` (null when
nothing meaningful changed) and `appendDeltaReport(generated, prev, curr)` which
appends artifact `delta-report.md` (program `"skills"`, surface-appended, NOT a
counted generator). Determinism holds because both inputs are explicit. The API
surface (which has DB access) fetches the previous snapshot's ContextMap and
passes it in; generator-core never does I/O.

**AD-2 — Delta content is computed diffs only, never inference.** Sections:
frameworks added/removed/version-changed; routes added/removed (by
method+path); domain models added/removed (by name) + field_count changes;
dependency hotspots entering/leaving the top set (by path); warnings
appeared/resolved; entry points changed; LOC/language shifts (from
`structure.file_tree_summary` aggregates). Each section renders only when
non-empty; the artifact leads with a one-paragraph plain-English summary line
built from the counts (template string, no LLM).

**AD-3 — Persistence metering wires at the REST version surface.**
`handleDiffVersions` meters `diff_versions`; the version-*write* path (wherever
`saveGeneratedFileVersion`/equivalent is invoked — the spec pins it) meters
`save_version`. On `{ok:false}` respond HTTP 402 JSON
`{error:"persistence_credits_required", reason}`. MCP tools and free reads
(`list`, `get`) stay unmetered in this phase. This activates the reserved
economic surface without touching money rails (credits are Iliad-ledger, not
PAI'D).

**AD-4 — Usage-aware funnel keeps the core pure.** Extend
`buildNextPrograms(programsRun, ctx, limit?, usage?: Record<string, number>)` —
`usage` maps program → historical run count for the ACCOUNT (not the snapshot).
Ranking tweak: among candidates, prefer programs the account has never run
(cold-start discovery), then the existing adjacency order. The export surface
fetches per-account program-run counts (the same data the Account page's usage
summary uses) and passes them; callers that pass nothing get byte-identical
current behavior (determinism tests unchanged).

**AD-5 — Watchtower rides the webhook, fail-open.** In
`dispatchWebhookSnapshot`, after `snapshot_created`: find the project's previous
snapshot; if present, load both ContextMaps, `buildDeltaReport`, store the
result as a generated file on the new snapshot, and `trackEvent(...,
"watchtower_delta", ...)`. Errors are caught and logged
(`github-webhook.delta_failed`) — the webhook's existing behavior must never
break. Email digest is a LATER work order (Resend plumbing exists), not this one.

**AD-6 — Project memory is a table + REST + a pure weave (Phase Next).**
Migration v30 (follow the v29 pattern exactly): table `project_memory`
`(id TEXT PK, project_id TEXT NOT NULL REFERENCES projects, account_id TEXT NOT
NULL, kind TEXT CHECK (kind IN ('decision','convention','evidence','goal')),
content TEXT NOT NULL, source TEXT DEFAULT '', created_at TEXT NOT NULL)` +
index on (project_id, created_at). REST: `GET/POST
/v1/projects/:project_id/memory` (auth = owning account; both added to
openapi.ts + ENDPOINT_COUNT). Pure weave: generation surface loads memory
entries and passes them into context-file generation so AGENTS.md/CLAUDE.md
carry a "Decisions already made — do not re-litigate" section. **MCP tool
exposure is deferred** (bumps MCP_TOOL_COUNT — owner decision, not the
executor's).

**AD-7 — KPIs ride the existing analytics.** Each shipped surface calls
`trackEvent` with a stable event name (`delta_generated`, `persistence_metered`,
`funnel_personalized`, `watchtower_delta`, `memory_written`) so the strategy's
compounding KPIs are queryable from day one.

## Epics → work orders

| Epic | Work orders | Phase |
|------|------------|-------|
| E1 Delta intelligence | WO-01 (pure builder + export wiring) | Now |
| E2 Economic activation | WO-02 (persistence metering) | Now |
| E3 Learning funnel | WO-03 (usage-aware ranking) | Now |
| E4 Watchtower | WO-04 (webhook delta; email digest deferred) | Now/Next |
| E5 Project brain | WO-05 (migration + REST + weave; ELABORATE gate) | Next |
| E6 Fleet | not yet ordered — specs written at phase start | Later |

Dependencies: WO-04 depends on WO-01. Everything else is independent. The
enforce rollout of the PAI'D wallet and anything money-adjacent stays OUT of
this program (owner + planning-model lane).

## Definition of done for the program's first phase

WO-01..WO-04 merged; `delta-report.md` appears on the second analysis of any
repo; version diffs meter credits for paid tiers and 402 cleanly for free;
funnel output personalizes when account usage exists; webhook pushes produce
stored deltas; all honesty/determinism gates green; KPI events flowing.
