// Postgres test fixture — the replacement for the old SQLite openMemoryDb().
//
// Tests call `await resetTestDb()` in a beforeEach: it provisions the schema once
// per worker (idempotent), then truncates every table so each test starts clean.
//
// SAFETY: resetTestDb TRUNCATES every table. It refuses to run unless this is a
// test process (VITEST / NODE_ENV=test), and DATABASE_URL must point at a
// THROWAWAY Postgres (Docker locally, services:postgres in CI) — never a real DB.
import { sql, closePool } from "./pg.js";
import { runPgMigrations } from "./pg-schema.js";

// A pending/settled migration promise, not a boolean: the first caller starts
// runPgMigrations() and stores the promise SYNCHRONOUSLY (no await between the
// check and the assignment), so any resetTestDb() call arriving before it
// resolves awaits the SAME promise instead of re-triggering migrations. A plain
// boolean flag set *after* an await has a race window — two beforeEach hooks
// firing close together both see `!schemaReady`, both run CREATE TABLE
// concurrently, and race a third test's concurrent TRUNCATE in a different lock
// order, deadlocking Postgres. This pattern closes that window.
let schemaReadyPromise: Promise<unknown> | null = null;

function assertTestEnv(): void {
  if (process.env.VITEST !== "true" && process.env.NODE_ENV !== "test") {
    throw new Error(
      "resetTestDb() refused: not a test process (VITEST/NODE_ENV=test unset). " +
        "It truncates every table — only run it against a throwaway test Postgres.",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("resetTestDb() requires DATABASE_URL (a throwaway test Postgres).");
  }
}

// ─── Why this doesn't just TRUNCATE everything (infra_01_test_suite_cost) ──
//
// It used to: a DO block looping over all ~49 tables, issuing a SEPARATE
// `TRUNCATE ... RESTART IDENTITY CASCADE` per table, on EVERY test's
// beforeEach. Measured against the real test Postgres, that cost ~7.8 SECONDS
// per reset — the single dominant reason the full local suite took ~4 hours
// while CI did the same work in 11 minutes.
//
// Truncating a table that is ALREADY EMPTY is a no-op for its rows, so the
// only thing the blanket sweep bought was resetting every table. Probing first
// and truncating only what is actually dirty measured 65ms (1 dirty table) /
// 153ms (3) — a 51-121x cut on a typical test.
//
// The subtlety that makes a naive row-only probe WRONG: `RESTART IDENTITY`
// resets a table's sequence even when the table is empty, and this fixture
// promises deterministic per-test IDENTITY values. A test that inserts then
// deletes leaves the table EMPTY but its sequence ADVANCED (verified: 3
// inserts + DELETE => 0 rows, last_value=3, next id 4 instead of 1). A
// row-only probe skips that table and the next test's IDs silently shift —
// intermittent failures that look like flakes, not like this function.
// So the probe checks BOTH conditions, in one roundtrip:
//   * tables holding rows                  -> TRUNCATE (also resets their seqs)
//   * sequences with last_value NOT NULL   -> ALTER SEQUENCE ... RESTART
// `last_value IS NOT NULL` is exactly the right signal: TRUNCATE ... RESTART
// IDENTITY puts it back to NULL, so a non-NULL value means "used since the
// last reset" (verified empirically, not assumed).
//
// Escape hatch: set AXIS_TEST_RESET_FULL=1 to restore the old blanket sweep.
// Kept deliberately — this is the verification substrate the whole suite rests
// on, and a one-env-var fallback is cheap next to debugging a subtly wrong reset.

/** Cached per worker: the table/sequence set is fixed once migrations have run. */
let probeSql: string | null = null;

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const FULL_SWEEP_SQL = `DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN (
        SELECT tablename FROM pg_tables
        WHERE schemaname = current_schema() AND tablename <> 'schema_migrations'
      ) LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;`;

/** One roundtrip that names every table holding rows AND every sequence that has been advanced. */
async function buildProbeSql(): Promise<string> {
  const tables = await sql.many<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = current_schema() AND tablename <> 'schema_migrations'
     ORDER BY tablename`,
  );
  // EXISTS short-circuits, and on an empty table it needs no heap I/O — which
  // is why probing 49 tables costs ~7ms while truncating them costs seconds.
  const parts = tables.map(
    (t) =>
      `SELECT 't'::text AS kind, ${quoteLiteral(t.tablename)}::text AS name` +
      ` WHERE EXISTS (SELECT 1 FROM ${quoteIdent(t.tablename)})`,
  );
  parts.push(
    `SELECT 's'::text AS kind, sequencename::text AS name FROM pg_sequences` +
      ` WHERE schemaname = current_schema() AND last_value IS NOT NULL`,
  );
  return parts.join(" UNION ALL ");
}

async function resetTestDbUnserialized(): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = runPgMigrations();
  }
  await schemaReadyPromise;

  if (process.env.AXIS_TEST_RESET_FULL === "1") {
    await sql.exec(FULL_SWEEP_SQL);
    return;
  }

  if (!probeSql) probeSql = await buildProbeSql();
  const dirty = await sql.many<{ kind: string; name: string }>(probeSql);
  if (dirty.length === 0) return; // already pristine — the common case between tests

  const tables: string[] = [];
  const sequences: string[] = [];
  for (const row of dirty) {
    if (row.kind === "t") tables.push(row.name);
    else sequences.push(row.name);
  }

  await clearTables(tables);

  // Must run AFTER clearing, and is not optional: DELETE (the fast path below)
  // does not touch sequences at all, and even TRUNCATE's RESTART IDENTITY only
  // covers tables it actually truncated — never a table that is already empty
  // with an advanced sequence. The probe found both cases; this closes them.
  if (sequences.length > 0) {
    await sql.exec(sequences.map((n) => `ALTER SEQUENCE ${quoteIdent(n)} RESTART`).join("; "));
  }
}

/**
 * null = not yet probed, true = FK triggers can be suspended, false = fall back
 * to TRUNCATE forever (a non-superuser test Postgres can't set the role).
 */
let canSuspendFkTriggers: boolean | null = null;

/**
 * Empties the dirty tables. Prefers DELETE over TRUNCATE: test tables hold a
 * handful of rows, and at that scale DELETE is ~19.5x cheaper (measured 450ms
 * vs 8793ms over a 12-table write-heavy set) because it skips TRUNCATE's
 * per-relation ACCESS EXCLUSIVE lock, file truncation and fsync.
 *
 * DELETE has no CASCADE, so FK order would matter — suspending FK triggers via
 * session_replication_role sidesteps that. Two things make that safe here:
 * it runs inside sql.tx so every statement shares ONE connection (the setting
 * is per-session, and on a pool the DELETEs could otherwise land on a different
 * connection with FK checks still live), and SET LOCAL reverts at COMMIT *or*
 * ROLLBACK, so a mid-reset failure can never return a connection to the pool
 * with constraint enforcement quietly disabled.
 */
async function clearTables(tables: string[]): Promise<void> {
  if (tables.length === 0) return;
  const idents = tables.map(quoteIdent);

  if (canSuspendFkTriggers !== false) {
    try {
      await sql.tx(async (client) => {
        await client.query(`SET LOCAL session_replication_role = replica`);
        await client.query(idents.map((t) => `DELETE FROM ${t}`).join("; "));
      });
      canSuspendFkTriggers = true;
      return;
    } catch (err) {
      // 42501 = insufficient_privilege: this Postgres role may not set the
      // parameter, so use TRUNCATE from here on. Any OTHER error is a real
      // failure and must surface rather than be masked by a silent fallback.
      if ((err as { code?: string }).code !== "42501") throw err;
      canSuspendFkTriggers = false;
    }
  }

  // One multi-table statement, not N single-table ones: Postgres takes the
  // locks and syncs once instead of per table (2348ms vs 7825ms across all 49).
  await sql.exec(`TRUNCATE TABLE ${idents.join(", ")} RESTART IDENTITY CASCADE`);
}

// Serializes resetTestDb() calls one at a time (migration AND truncate), so
// overlapping beforeEach hooks can never run concurrent DDL/TRUNCATE against
// the same connection pool. Chained off the previous call's SETTLEMENT (not
// just success) so one test's failure never wedges every test after it.
let resetChain: Promise<void> = Promise.resolve();

/**
 * Provision the schema once per worker, then truncate all tables (except the
 * migration ledger) so the next test starts from empty. Sequences restart so
 * IDENTITY columns are deterministic per test. Safe to call from concurrent
 * beforeEach hooks — calls are serialized internally (see resetChain above).
 */
export function resetTestDb(): Promise<void> {
  assertTestEnv();
  const run = resetChain.then(resetTestDbUnserialized, resetTestDbUnserialized);
  resetChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Close the pool (registered as a global afterAll in vitest.setup.ts). */
export async function closeTestDb(): Promise<void> {
  schemaReadyPromise = null;
  probeSql = null; // rebuilt against the schema the next worker migrates
  resetChain = Promise.resolve();
  await closePool();
}
