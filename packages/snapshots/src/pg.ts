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
    // Fail an exhausted-pool acquire instead of queueing forever, so a future code path
    // that holds a tx connection while awaiting a second one surfaces a logged error
    // rather than hanging the pool. Opt-in via env (off by default) to avoid tripping
    // under legitimately bursty load or a slow test Postgres.
    connectionTimeoutMillis: process.env.PG_CONNECT_TIMEOUT_MS
      ? Number(process.env.PG_CONNECT_TIMEOUT_MS)
      : undefined,
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

// `?` → `$1,$2,…`  (positional, left-to-right). SQL-aware: only BARE `?` placeholders
// are rewritten. A `?` inside a string literal ('…'), quoted identifier ("…"), dollar-
// quoted block ($tag$…$tag$), line/block comment, or a jsonb operator (`?|`/`?&`) is left
// verbatim — a naive global replace corrupts e.g. `'why?'` → `'why$1'` and shifts every
// subsequent parameter index. (Assumes standard_conforming_strings, Postgres' default —
// regular strings escape a quote as `''`, not `\'`.)
function toPg(text: string): string {
  let out = "";
  let param = 0;
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];

    // Single-quoted string literal — '' is an escaped quote.
    if (c === "'") {
      out += c;
      i++;
      while (i < n) {
        out += text[i];
        if (text[i] === "'") {
          if (text[i + 1] === "'") {
            out += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Double-quoted identifier — "" is an escaped quote.
    if (c === '"') {
      out += c;
      i++;
      while (i < n) {
        out += text[i];
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            out += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Dollar-quoted string — $$…$$ or $tag$…$tag$.
    if (c === "$") {
      const m = /^\$([A-Za-z_]\w*)?\$/.exec(text.slice(i));
      if (m) {
        const tag = m[0];
        const end = text.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        out += text.slice(i, stop);
        i = stop;
        continue;
      }
    }

    // Line comment — -- … EOL.
    if (c === "-" && c2 === "-") {
      const nl = text.indexOf("\n", i);
      const stop = nl === -1 ? n : nl;
      out += text.slice(i, stop);
      i = stop;
      continue;
    }

    // Block comment — /* … */ (Postgres allows nesting).
    if (c === "/" && c2 === "*") {
      let depth = 1;
      out += "/*";
      i += 2;
      while (i < n && depth > 0) {
        if (text[i] === "/" && text[i + 1] === "*") {
          depth++;
          out += "/*";
          i += 2;
        } else if (text[i] === "*" && text[i + 1] === "/") {
          depth--;
          out += "*/";
          i += 2;
        } else {
          out += text[i];
          i++;
        }
      }
      continue;
    }

    // jsonb existence operators `?|` / `?&` — the `?` is an operator, not a placeholder.
    if (c === "?" && (c2 === "|" || c2 === "&")) {
      out += c;
      out += c2;
      i += 2;
      continue;
    }

    // Bare positional placeholder.
    if (c === "?") {
      out += "$" + ++param;
      i++;
      continue;
    }

    out += c;
    i++;
  }
  return out;
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
