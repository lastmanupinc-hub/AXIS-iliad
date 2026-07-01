# SPEC-05 — Project brain (memory) — SCOPED, GATED ⛔

**Status: `blocked` — ELABORATE gate.** This spec fixes the architecture and
the migration block so nothing drifts, but the planning model expands it to
full SPEC-01-level detail (exact weave points, test matrix, auth edge cases)
before the executor takes it. Executor: if you are reading this while its
work order is still `blocked`, stop — take nothing from this file as license.

## Fixed decisions (will not change at elaboration)

**Purpose:** per-project, server-side memory — decisions made, conventions
confirmed, evidence of what worked — written by agents/humans during work and
**read back into generation**, so every new agent session inherits everything
prior sessions learned. This is Pillar 2 of the strategy and the single
strongest accrual surface.

**Migration v30** (follow the v29 `accounts_google_id` pattern exactly —
additive, idempotent, index inside the migration, never the baseline… and ALSO
add the table to the baseline `PG_SCHEMA` for fresh DBs, as v29 did with its
column):

```sql
CREATE TABLE IF NOT EXISTS project_memory (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  kind TEXT NOT NULL CHECK (kind IN ('decision','convention','evidence','goal')),
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_memory_project
  ON project_memory(project_id, created_at);
```

**REST surface** (2 routes; `openapi.ts` paths + `ENDPOINT_COUNT += 2` in the
same PR — explicitly authorized by the work order):
- `GET  /v1/projects/:project_id/memory?kind=&limit=` — owning account only.
- `POST /v1/projects/:project_id/memory` `{kind, content, source?}` — owning
  account only; content length-capped (spec elaboration sets the cap); append-only
  (no update/delete in v1 — corrections are new `decision` entries).

**Weave (pure):** generation surface loads memory (bounded, newest-first) and
passes it as an explicit input to a pure `weaveMemory(files, entries)` in
generator-core that appends a "Decisions already made — do not re-litigate"
section to AGENTS.md / CLAUDE.md / begin.yaml when entries exist. Determinism:
f(snapshot, memory) — memory is a versioned explicit input, per the strategy.

**Explicitly deferred (owner decisions, not the executor's):** any MCP tool
exposure (bumps `MCP_TOOL_COUNT`); memory in the free tier vs paid-only
(candidate: memory *writes* free, memory-woven *generation* metered via
`meterPersistenceOp("save_version")`-style op — elaboration decides); email/
digest surfacing.

## At elaboration, the planning model will add
Exact weave call sites (export + MCP generation), the test matrix (auth,
ownership, caps, weave determinism, migration fresh+existing paths — mirror
the v29 verification), KPI events (`memory_written`, `memory_woven`), and the
export path so memory rides the zero-lock-in guarantee (memory must appear in
the exported bundle).
