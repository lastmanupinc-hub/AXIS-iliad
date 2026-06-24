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

let schemaReady = false;

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

/**
 * Provision the schema once per worker, then truncate all tables (except the
 * migration ledger) so the next test starts from empty. Sequences restart so
 * IDENTITY columns are deterministic per test.
 */
export async function resetTestDb(): Promise<void> {
  assertTestEnv();
  if (!schemaReady) {
    await runPgMigrations();
    schemaReady = true;
  }
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

/** Close the pool (registered as a global afterAll in vitest.setup.ts). */
export async function closeTestDb(): Promise<void> {
  schemaReady = false;
  await closePool();
}
