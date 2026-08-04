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

/**
 * The reset is a cached, STATIC probe followed by a clear — a shape arrived at
 * by measuring three alternatives against the real test Postgres:
 *
 *  * blanket TRUNCATE of all 49 tables per test ....... ~7825ms  (the original)
 *  * probe + clear, probe SQL cached ................... ~129s / snapshots pkg
 *  * probe + clear, catalog re-read every reset ........ ~230s   (correct, slow)
 *  * one server-side DO block doing everything ......... ~256s   (correct, slower)
 *
 * The two "correct" variants lose because they cannot reuse a query plan: the
 * DO block re-plans 49 dynamic `EXECUTE format(...)` statements per reset, and
 * re-reading the catalog rebuilds the SQL string so the planner sees a new
 * query each time. The cached static UNION ALL is planned once and reused.
 *
 * But a plain cache is WRONG: tables can be created LAZILY after the first
 * reset (apps/api/src/analytics.ts does `CREATE TABLE IF NOT EXISTS
 * analytics_events` on first use), and a stale probe never learns about them,
 * leaking their rows between tests forever — contamination that surfaces as
 * some unrelated assertion failing much later.
 *
 * So the probe reports the CURRENT table count as an extra row. If it differs
 * from the count the probe was built for, the probe is rebuilt and re-run. The
 * common case stays one roundtrip with a warm plan; a new table self-heals on
 * the very next reset. Tables are only ever added mid-run (never dropped), so
 * a count is a sound change signal here.
 */
const TABLE_SET_SQL = `SELECT tablename FROM pg_tables
   WHERE schemaname = current_schema() AND tablename <> 'schema_migrations'
   ORDER BY tablename`;

let probeSql: string | null = null;
let probeTableCount = -1;

function buildProbeSql(tables: string[]): string {
  // EXISTS short-circuits and touches no heap on an empty table, which is why
  // probing all 49 costs ~7ms while truncating them costs seconds.
  const parts = tables.map(
    (t) =>
      `SELECT 't'::text AS kind, ${quoteLiteral(t)}::text AS name` +
      ` WHERE EXISTS (SELECT 1 FROM ${quoteIdent(t)})`,
  );
  parts.push(
    `SELECT 's'::text AS kind, sequencename::text AS name FROM pg_sequences` +
      ` WHERE schemaname = current_schema() AND last_value IS NOT NULL`,
  );
  // Self-invalidation signal — see the docblock above.
  parts.push(
    `SELECT 'n'::text AS kind, count(*)::text AS name FROM pg_tables` +
      ` WHERE schemaname = current_schema() AND tablename <> 'schema_migrations'`,
  );
  return parts.join(" UNION ALL ");
}

async function refreshProbe(): Promise<void> {
  const rows = await sql.many<{ tablename: string }>(TABLE_SET_SQL);
  probeSql = buildProbeSql(rows.map((r) => r.tablename));
  probeTableCount = rows.length;
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

  if (!probeSql) await refreshProbe();

  let rows: Array<{ kind: string; name: string }>;
  try {
    rows = await sql.many<{ kind: string; name: string }>(probeSql!);
  } catch (err) {
    // 42P01 = undefined_table: a table the cached probe names has been DROPPED,
    // so the probe throws before it can report the count. The count signal only
    // catches ADDITIONS; this catches removals. Refresh and retry once.
    if ((err as { code?: string }).code !== "42P01") throw err;
    await refreshProbe();
    rows = await sql.many<{ kind: string; name: string }>(probeSql!);
  }

  // A table appeared since the probe was built — rebuild and re-probe so the
  // newcomer is not silently skipped (see the docblock above).
  const reported = rows.find((r) => r.kind === "n");
  if (reported && Number(reported.name) !== probeTableCount) {
    await refreshProbe();
    rows = await sql.many<{ kind: string; name: string }>(probeSql!);
  }

  const tables: string[] = [];
  const sequences: string[] = [];
  for (const r of rows) {
    if (r.kind === "t") tables.push(r.name);
    else if (r.kind === "s") sequences.push(r.name);
  }
  if (tables.length === 0 && sequences.length === 0) return; // already pristine

  await clearTables(tables);

  // Must run AFTER clearing, and is not optional: DELETE does not touch
  // sequences at all, and TRUNCATE's RESTART IDENTITY only covers tables it
  // actually truncated — never one already empty with an advanced sequence.
  if (sequences.length > 0) {
    await sql.exec(sequences.map((n) => `ALTER SEQUENCE ${quoteIdent(n)} RESTART`).join("; "));
  }
}

/** null = not yet probed, false = this role cannot suspend FK triggers. */
let canSuspendFkTriggers: boolean | null = null;

/**
 * Empties the dirty tables. DELETE rather than TRUNCATE: test tables hold a
 * handful of rows, and at that scale DELETE is ~19.5x cheaper (measured 450ms
 * vs 8793ms over a 12-table write-heavy set) because it skips TRUNCATE's
 * per-relation ACCESS EXCLUSIVE lock, file truncation and fsync.
 *
 * DELETE has no CASCADE, so FK order would matter — suspending FK triggers via
 * session_replication_role sidesteps that. Two things make that safe: it runs
 * inside sql.tx so every statement shares ONE connection (the setting is
 * per-session, and on a pool the DELETEs could otherwise land on a different
 * connection with FK checks still live), and SET LOCAL reverts on COMMIT *or*
 * ROLLBACK, so a mid-reset failure can never hand a pooled connection back
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
      // 42501 = insufficient_privilege: this role may not set the parameter, so
      // use TRUNCATE from here on. Any OTHER error is a real failure and must
      // surface rather than be masked by a silent fallback.
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
  // Drop the cached probe alongside the migration promise: the next caller may
  // migrate a different schema, and a probe naming the old tables would either
  // throw 42P01 or silently skip new ones.
  probeSql = null;
  probeTableCount = -1;
  canSuspendFkTriggers = null;
  resetChain = Promise.resolve();
  await closePool();
}
