# SPEC-05 — Project brain: `project_memory` migration + store + REST

**Status: elaborated 2026-07-01 by the planning model — the ELABORATE gate is
cleared and the executor may take this work order.** Scope was SPLIT at
elaboration: this WO ships storage + REST only. The weave into context files
is WO-07 (SPEC-07); the `memory_written` KPI event this WO emits requires the
union members added by WO-06 (SPEC-06) — hence `depends_on: [WO-06]`.

**Goal:** per-project, server-side memory — decisions made, conventions
confirmed, evidence of what worked — written via REST during work and (in
WO-07) read back into generation, so every new agent session inherits what
prior sessions learned. Pillar 2 of the strategy; the strongest accrual
surface.

## Read first
`packages/snapshots/src/pg-schema.ts` (baseline + `PG_MIGRATIONS` v28/v29
pattern; `PG_LATEST_VERSION` stays 27 — do NOT bump it),
`packages/snapshots/src/version-store.ts` (the store idiom to copy),
`apps/api/src/versions.ts` + `versions.test.ts` (the handler + test idiom to
copy), `apps/api/src/handlers.ts:104-116` (`assertSnapshotAccess` — the
404-on-mismatch no-leak pattern), `packages/snapshots/src/funnel-store.ts:127`
(`trackEvent`) and `:192` (`resolveStage`).

## Migration v30 (SQL block is FIXED — byte-identical to the gated spec)

Add to `PG_MIGRATIONS` (after v29):

```ts
{
  // Project brain (agentic-asset WO-05): per-project memory entries written by
  // agents/humans and read back into generation. Fresh DBs get the table from
  // the baseline; this migration creates it for existing DBs. The index lives
  // ONLY here (v29 pattern) so it always runs after the table exists.
  version: 30,
  name: "project_memory",
  sql: `CREATE TABLE IF NOT EXISTS project_memory (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  kind TEXT NOT NULL CHECK (kind IN ('decision','convention','evidence','goal')),
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_memory_project
  ON project_memory(project_id, created_at);`,
},
```

ALSO add the `CREATE TABLE` statement (WITHOUT the index — v29 pattern) to the
baseline `PG_SCHEMA` string, placed after `generation_versions`. Fresh path:
baseline creates the table, stamps v27, migrations 28→30 run (30 adds the
index). Existing path: baseline no-ops, migration 30 creates table + index.
`PG_LATEST_VERSION` remains 27.

While in `pg-schema.test.ts`: fix the stale assertion at line 27 —
`expect(await schema.getPgSchemaVersion()).toBe(23)` predates v24-v29 and is
false today (the file is `PG_TEST_URL`-gated so it never runs in CI, but a
knowingly false assertion violates docs-honesty). Change to `.toBe(30)`,
update the `it` title, and add `"project_memory"` to its core-table list.

## Store (`packages/snapshots/src/memory-store.ts` — new; copy version-store idiom)

```ts
export type MemoryKind = "decision" | "convention" | "evidence" | "goal";
export const MEMORY_KINDS: readonly MemoryKind[] = ["decision", "convention", "evidence", "goal"];
export const MEMORY_CONTENT_MAX = 4000;   // chars; bounds the WO-07 weave
export const MEMORY_SOURCE_MAX = 500;
export const MEMORY_PROJECT_CAP = 500;    // entries per project (append-only ⇒ cap abuse)

export interface MemoryEntry {
  id: string; project_id: string; account_id: string;
  kind: MemoryKind; content: string; source: string; created_at: string;
}

/** Insert one entry (id = randomUUID(), created_at = new Date().toISOString()). No validation here — the handler owns HTTP-level validation. */
export async function addMemoryEntry(project_id: string, account_id: string, kind: MemoryKind, content: string, source?: string): Promise<MemoryEntry>;
/** Newest-first: ORDER BY created_at DESC, id DESC (deterministic tiebreak). Optional kind filter; LIMIT applied as given (handler clamps). */
export async function listMemoryEntries(project_id: string, opts?: { kind?: MemoryKind; limit?: number }): Promise<MemoryEntry[]>;
export async function countMemoryEntries(project_id: string): Promise<number>; // coerce COUNT with Number() — pg bigint trap
/** The projects row, or undefined when the project doesn't exist. Lets the handler distinguish 404 (missing) from 403 (anonymous). */
export async function getMemoryProject(project_id: string): Promise<{ project_id: string; account_id: string | null } | undefined>;
```

Export everything above (values and types) from
`packages/snapshots/src/index.ts` under a `// Project memory` comment.

## REST (`apps/api/src/memory-handlers.ts` — new)

Routes in `server.ts`, registered in the "Project context endpoints" block
after the `generated-files` routes:

```ts
router.get("/v1/projects/:project_id/memory", handleListMemory);
router.post("/v1/projects/:project_id/memory", handleAddMemory);
```

**Shared auth ladder (both handlers, in this order):**
1. `resolveAuth(req)` → no `account` ⇒ **401** `AUTH_REQUIRED`.
2. `getMemoryProject(project_id)` → undefined ⇒ **404** `NOT_FOUND`.
3. `account_id === null` (anonymous project) ⇒ **403** `FORBIDDEN`, message:
   `"Memory requires an account-owned project — re-analyze while authenticated to claim it."`
4. Owner mismatch ⇒ **404** `NOT_FOUND` (no-leak, mirrors `assertSnapshotAccess`).

**GET** `?kind=&limit=`: `kind` present but ∉ `MEMORY_KINDS` ⇒ 400
`INVALID_FORMAT`. `limit` present but non-integer or < 1 ⇒ 400
`INVALID_FORMAT`; otherwise `Math.min(limit, 200)`; default 50. Respond 200:
`{ project_id, entries, count: entries.length, total }` (`total` =
`countMemoryEntries`).

**POST** body `{kind, content, source?}`: malformed JSON ⇒ 400
`INVALID_FORMAT`. `kind` ∉ `MEMORY_KINDS` ⇒ 400 `INVALID_FORMAT`. `content`
missing/empty/not-string ⇒ 400 `MISSING_FIELD`; length > `MEMORY_CONTENT_MAX`
⇒ 400 `INVALID_FORMAT` (message states the cap). `source` non-string or
length > `MEMORY_SOURCE_MAX` ⇒ 400 `INVALID_FORMAT`. Cap:
`countMemoryEntries(project_id) >= MEMORY_PROJECT_CAP` ⇒ **409** `CONFLICT`
(message states the cap and that memory is append-only). The count-then-insert
race is benign (a couple of entries past 500 under concurrency is acceptable)
— note this in a comment, do not add locking. On success respond **201**
`{ entry, total }` and
`await trackEvent(account.account_id, "memory_written", await resolveStage(account.account_id), { project_id, kind }).catch(() => {})`
— awaited-but-swallowed so tests are deterministic and the request never fails
on analytics. Append-only: no PUT/DELETE in v1 — corrections are new
`decision` entries.

## OpenAPI + counts (same PR — explicitly authorized)

- `openapi.ts`: one path `"/v1/projects/{project_id}/memory"` with `get` (200
  `MemoryListResponse`, 400, 401, 403, 404) and `post` (requestBody
  `AddMemoryRequest`; 201 `MemoryEntryResponse`, 400, 401, 403, 404, 409); both
  `security: [{ apiKey: [] }]`, tag `"Memory"`, operationIds `listProjectMemory`
  / `addProjectMemory`. Schemas: `MemoryEntry`, `AddMemoryRequest`,
  `MemoryListResponse`, `MemoryEntryResponse`.
- `counts.ts`: `ENDPOINT_COUNT` 143 → **145**.
- **Count-honesty knock-on (verified 2026-07-01 — missing this fails the
  gate):** update the two doc claims of "143 endpoints" to 145:
  `README.md:170` and `apps/web/src/pages/QAPage.tsx:91`. Both are in
  `files_expected`. Touch nothing else in those files.

## Tests (write first)

`packages/snapshots/src/memory-store.test.ts` (new; `resetTestDb` in
`beforeEach`): (1) migration fresh path — `project_memory` exists and a raw
insert with `kind='banana'` rejects (CHECK); (2) idempotency — a second direct
`runPgMigrations()` returns `{ current_version: 30, applied: 0 }`;
(3) add/list roundtrip — newest-first with `created_at DESC, id DESC` order,
kind filter, limit honored; (4) `countMemoryEntries` counts only that project;
(5) `getMemoryProject`: missing ⇒ undefined, anonymous ⇒ `account_id: null`,
owned ⇒ the owner.

`apps/api/src/memory-handlers.test.ts` (new; mirror versions.test.ts:
`Router` + `startTestServer`, `createAccount`/`createApiKey` Bearer helpers):
(1) 401 both routes unauthenticated; (2) 404 unknown project; (3) 403
anonymous project; (4) 404 non-owner; (5) POST happy path — 201, entry echoes
fields, ISO `created_at`, then GET returns it with `total: 1`; (6) POST 400s —
bad kind, empty content, content > 4000 (`"x".repeat(4001)`), source > 500,
malformed JSON; (7) GET `?kind=` filters, invalid kind 400; (8) GET `?limit=0`
400, `?limit=999` silently capped at 200; (9) cap — bulk-seed 500 rows with a
single `INSERT … SELECT gen_random_uuid()::text, … FROM generate_series(1,500)`
(never 500 sequential inserts), then POST ⇒ 409; (10) successful POST writes a
`funnel_events` row with `event_type='memory_written'` for the account.

## Explicitly deferred (owner decisions — do not implement)
MCP tool exposure (bumps `MCP_TOOL_COUNT`); metering memory writes or
memory-woven generation (v1 is FREE — adoption before monetization on the
accrual surface; `meterPersistenceOp` hooks remain available); email/digest
surfacing; begin.yaml memory injection (needs an autonomy-loop signature
change — noted in SPEC-07).

## Estimate & guards
~580 changed lines (test-heavy: two new test files + the bulk-seed cap case).
This exceeds the §5 ~400 guidance; the overage is pre-authorized here — state
it in the PR body, don't STOP on it. Do not touch `pg.ts`, any forbidden-zone
file, or `PG_LATEST_VERSION`. The migration SQL block above is byte-fixed.
