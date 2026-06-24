// Postgres (Neon) async data core — the replacement for the synchronous
// better-sqlite3 db.ts. See NEON_MIGRATION_PLAN.md.
//
// The `sql` helper mirrors the old `getDb().prepare(text).get/all/run(...)`
// ergonomics so the ~289 SQLite call sites convert mechanically:
//   const row  = db.prepare(SQL).get(a, b)   →  const row  = await sql.one(SQL, [a, b])
//   const rows = db.prepare(SQL).all(a)       →  const rows = await sql.many(SQL, [a])
//   db.prepare(SQL).run(a, b)                 →  await sql.run(SQL, [a, b])
//   const r = db.transaction(fn)()            →  const r = await sql.tx(async (c) => …)
//
// It also auto-translates `?` positional placeholders to Postgres `$1,$2,…`.
// NOTE: do not use the Postgres jsonb `?` operators in query text passed here —
// the translator would rewrite them. None of the ported queries do.
import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | null = null;

/** Build the pool lazily from DATABASE_URL. SSL is enabled for Neon / sslmode=require. */
export function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — required for the Postgres data layer.");
  }
  const needsSsl =
    /sslmode=require/.test(connectionString) ||
    /neon\.tech/.test(connectionString) ||
    process.env.PGSSL === "require";
  const inTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
  pool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    // Neon pooled endpoints terminate the TLS chain themselves; rejectUnauthorized
    // false avoids local CA hassle while still using TLS in transit.
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    // Under vitest, let the process exit when all clients are idle so a lingering
    // pool can't keep the test runner alive. No effect in prod (the HTTP server
    // keeps the loop alive regardless).
    allowExitOnIdle: inTest,
  });
  return pool;
}

/** Return the current pool without creating one (telemetry/fire-and-forget safe). */
export function peekPool(): Pool | null {
  return pool;
}

/** Close and reset the pool (tests / shutdown). */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// `?` → `$1,$2,…`  (positional, left-to-right)
function toPg(text: string): string {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

export const sql = {
  /** First row or undefined. Mirrors better-sqlite3 .get(). */
  async one<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<T | undefined> {
    const r = await getPool().query<T>(toPg(text), params);
    return r.rows[0];
  },

  /** All rows. Mirrors .all(). */
  async many<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const r = await getPool().query<T>(toPg(text), params);
    return r.rows;
  },

  /** Execute; returns affected row count + any RETURNING rows. Mirrors .run(). */
  async run(
    text: string,
    params: unknown[] = [],
  ): Promise<{ rowCount: number; rows: QueryResultRow[] }> {
    const r = await getPool().query(toPg(text), params);
    return { rowCount: r.rowCount ?? 0, rows: r.rows };
  },

  /** Run multiple statements (no params) — used for schema DDL. */
  async exec(text: string): Promise<void> {
    await getPool().query(text);
  },

  /**
   * Run fn inside a transaction on a dedicated client. Mirrors
   * better-sqlite3's db.transaction(). Inside fn, use client.query (already
   * $-style) for statements that must share the transaction.
   */
  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },
};

/** $-style placeholder translation, exported for use inside sql.tx callbacks. */
export const pgPlaceholders = toPg;
