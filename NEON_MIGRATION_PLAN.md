# Iliad → Neon Postgres Migration Plan

Move the Iliad data layer off local SQLite (`better-sqlite3`, `/data/axis.db` on a
single Render disk) onto **Neon Postgres**, consolidated with PAI'D's existing Neon.
This is a pervasive refactor; it is **not** a config change. Read the whole plan
before starting — phases have checkpoints and a clean rollback until cutover.

## Why
- Durability: accounts/usage/subscriptions currently live on one 1 GB Render disk with no managed PITR.
- Consolidation: PAI'D already runs on Neon; one platform DB.
- Scaling: SQLite + local disk forces `numInstances: 1`; Postgres unblocks horizontal scale.

## Scope (measured)
- `@axis/snapshots`: **22 store modules**, **289** sync DB ops, **~144 exports** (most functions go async).
- `apps/api`: **19** files import `@axis/snapshots` and call those functions → `await` propagation.
- SQLite-isms to port: `INSERT OR REPLACE` (9 files), `db.transaction()` (6), `AUTOINCREMENT`/`lastInsertRowid`/`PRAGMA` (a few), **FTS5 `search_fts`** (the one non-mechanical piece).
- `better-sqlite3` imported in 4 files; replaced by `pg`.

## The crux: synchronous → asynchronous
`better-sqlite3` is synchronous (`getDb().prepare(sql).get(args)`); Postgres is networked → async.
Every store fn becomes `async` and every caller must `await`. There is **no sync-over-async shim** in
Node, so this propagation is unavoidable and is the dominant cost.

**Effort-reducer (key strategic decision):** introduce a thin async query helper that mirrors the
current ergonomics and auto-translates `?` placeholders to `$n`, so the 289 call sites convert
mechanically and the SQL strings mostly survive:
```ts
// packages/snapshots/src/db.ts (new Postgres core)
export const sql = {
  one:  <T>(text: string, params?: unknown[]) => Promise<T | undefined>,   // .get()
  many: <T>(text: string, params?: unknown[]) => Promise<T[]>,             // .all()
  run:  (text: string, params?: unknown[]) => Promise<{ rowCount: number; rows: any[] }>, // .run()
  tx:   <T>(fn: (c: PoolClient) => Promise<T>) => Promise<T>,              // db.transaction()
};
```
Call sites go from `const r = db.prepare(SQL).get(a, b)` → `const r = await sql.one(SQL, [a, b])`.

## Dialect port (reference table)
| SQLite | Postgres |
|---|---|
| `?` placeholders | `$1, $2, …` (helper auto-translates) |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `GENERATED ALWAYS AS IDENTITY` (or `BIGSERIAL`) |
| `lastInsertRowid` | `INSERT … RETURNING id` |
| `INSERT OR REPLACE` | `INSERT … ON CONFLICT (pk) DO UPDATE SET …` |
| `INTEGER` boolean (0/1) | `BOOLEAN` (keep `0/1`→`false/true` in mapping, or migrate columns) |
| `TEXT` ISO timestamps | keep `TEXT`, **or** move to `TIMESTAMPTZ` (recommend keep TEXT first to reduce churn) |
| `PRAGMA journal_mode/foreign_keys` | drop (Postgres FKs always on) |
| `db.transaction(fn)()` (sync) | `await sql.tx(async (c) => …)` |
| `datetime('now')` | `now()` (or keep app-side ISO strings) |
| FTS5 virtual table `search_fts` | `tsvector` column + GIN index + `to_tsquery` (see Phase 5) |

## Driver
`pg` (node-postgres) with a `Pool`. Mature, standard, supports `RETURNING`, transactions, `tsvector`.
⚠️ New dependency (`pg`), removes `better-sqlite3` — inherent to this migration (per the Neon decision).

## Phased plan
**Phase 0 — Provision (you + me).** Create an `iliad` database in the existing Neon project (isolated
from PAI'D's tables). Set `DATABASE_URL` (Render `axis-api`, `sync:false`). Keep `DATABASE_PATH` until cutover.

**Phase 1 — Schema + migration runner.** Port `SCHEMA_V1` + the `MIGRATIONS` array (db.ts) to Postgres
DDL. Build a Postgres-native runner (`schema_migrations` table, same version sequence). Checkpoint: a
fresh Neon DB stands up all ~30 tables + indexes.

**Phase 2 — Async core.** Implement the `sql` helper (Pool, `?`→`$n`, `one/many/run/tx`) + `getPool()`.
Provide `openTestDb()`/`closeDb()` equivalents for tests (see Phase 6).

**Phase 3 — Convert stores (22 modules).** Per module: swap `getDb().prepare(...).get/all/run` →
`await sql.one/many/run`, port upserts to `ON CONFLICT`, `lastInsertRowid`→`RETURNING`, transactions→`sql.tx`.
Mark exports `async`. Do it module-by-module with the existing tests as the guardrail (run after each).

**Phase 4 — Propagate `await` (19 api files).** Add `await` at every now-async call; make containing
handlers async. tsc is the guardrail (a non-awaited Promise is usually a type error at the use site).

**Phase 5 — FTS replacement.** Replace `search_fts` (FTS5) with a `tsvector` column on `search_index`
(or a generated column) + GIN index; rewrite `searchSnapshotContent` to `to_tsquery`/`websearch_to_tsquery`.
Port the symbol search similarly. Verify result parity against a few fixtures.

**Phase 6 — Tests.** ~every suite calls `openMemoryDb()`. Decide the test-Postgres strategy (DECISION
below), add a global setup that provisions a clean schema per run/suite, and convert sync DB assertions
to `await`. This is a large but mechanical sweep.

**Phase 7 — Data ETL + cutover.** Snapshot prod `/data/axis.db`; export each table; load into Neon
(`pg COPY`/inserts) with type coercions (0/1→bool if columns changed; timestamps as-is). Validate row
counts + spot-check accounts/api_keys/subscriptions. Brief maintenance window (pre-launch, low traffic):
freeze writes, final ETL, set `DATABASE_URL`, redeploy, smoke-test signup/login/account.

**Phase 8 — Decommission.** Remove `DATABASE_PATH` + the Render disk after a soak period + a verified backup.

## Test-Postgres options (DECISION NEEDED)
- **Dockerized Postgres** (recommended): real Postgres in CI (`services:` in the workflow) + local Docker.
  Highest fidelity (FTS, transactions). CI gains a Postgres service container.
- **`pg-mem`** (in-memory JS Postgres): fast, no network, but **incomplete** — FTS/`tsvector` and some
  functions are unsupported, so the search tests couldn't run against it. Risky given Phase 5.
- **Neon branch per CI run**: real Neon, networked; needs a Neon API token in CI + branch cleanup.

## Risks & mitigations
- **Blast radius of async** — mitigate with the `sql` helper + module-by-module conversion gated by tests; tsc catches missing `await` at call sites.
- **FTS parity** — the only non-mechanical rewrite; fixture-test before/after.
- **Test rewrite volume** — every suite's `openMemoryDb` → Postgres setup; do it as one mechanical pass after the stores compile.
- **Cutover data correctness** — validate row counts per table + spot-check; keep the SQLite file as rollback until soak passes.
- **Boolean/timestamp typing** — start by keeping `TEXT` timestamps + integer-booleans-as-`BOOLEAN` mapping to minimize churn; tighten later.

## Rough effort
Phase 1–2: ~0.5–1 day. Phase 3–4: ~1.5–2 days. Phase 5: ~0.5 day. Phase 6: ~1 day. Phase 7–8: ~0.5 day + soak.
**Total ≈ 4–5 focused days**, reviewable in PRs per phase.

## Decisions — LOCKED (2026-06-21)
1. **Neon placement:** **SEPARATE Neon project** for Iliad (full blast-radius isolation from PAI'D). Owner provisions it + provides `DATABASE_URL` (Render `axis-api`, `sync:false`).
2. **Test Postgres:** **Real Postgres** (Dockerized in CI + local) for the strongest signal — not `pg-mem`.
3. **Timestamps:** **keep `TEXT` ISO strings** (least churn).
4. **Cutover window:** **pre-launch** (trivial — minimal live data).
