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

async function resetTestDbUnserialized(): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = runPgMigrations();
  }
  await schemaReadyPromise;
  await sql.exec(`DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN (
        SELECT tablename FROM pg_tables
        WHERE schemaname = current_schema() AND tablename <> 'schema_migrations'
      ) LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;`);
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
  resetChain = Promise.resolve();
  await closePool();
}
