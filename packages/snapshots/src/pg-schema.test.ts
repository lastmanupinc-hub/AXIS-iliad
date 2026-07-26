import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Runs whenever a real Postgres connection string is available. CI supplies
// DATABASE_URL (Phase 6's CI Postgres service) and test-ci-mirror.mjs mirrors
// that, so this now actually executes in CI instead of always skipping --
// PG_TEST_URL alone (nothing ever set it) meant this suite silently never ran
// anywhere, and its assertions rotted 7 schema versions behind (R2.2). Locally:
//   docker start axis-test-pg   (or: docker run -d --name axis-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=axis_test -p 5433:5432 postgres:16)
//   PG_TEST_URL=postgres://postgres:postgres@127.0.0.1:5433/axis_test pnpm vitest run packages/snapshots/src/pg-schema.test.ts
const PG_TEST_URL = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
const d = PG_TEST_URL ? describe : describe.skip;

d("Postgres schema + async sql helper (real Postgres)", () => {
  let pg: typeof import("./pg.js");
  let schema: typeof import("./pg-schema.js");

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_TEST_URL;
    pg = await import("./pg.js");
    schema = await import("./pg-schema.js");
    await schema.dropAllPgTables();
    await schema.runPgMigrations();
  });

  afterAll(async () => {
    if (pg) await pg.closePool();
  });

  it("stands up the schema at the latest migration version with all core tables", async () => {
    // Derived from the same PG_MIGRATIONS list runPgMigrations() applies, not a
    // hand-copied literal -- a hardcoded v32 pin here is exactly what rotted
    // silently for months while the gate above kept this suite from ever running.
    const expectedVersion = Math.max(schema.PG_LATEST_VERSION, ...schema.PG_MIGRATIONS.map((m) => m.version));
    expect(await schema.getPgSchemaVersion()).toBe(expectedVersion);
    const rows = await pg.sql.many<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = current_schema()",
    );
    const names = rows.map((r) => r.tablename);
    for (const t of ["accounts", "api_keys", "snapshots", "mcp_usage", "stripe_subscriptions", "search_index", "project_memory", "payment_receipts", "disputes", "dispute_transitions"]) {
      expect(names).toContain(t);
    }
  });

  it("sql.run/one: ?→$n translation + case-insensitive email lookup", async () => {
    const now = new Date().toISOString();
    await pg.sql.run("INSERT INTO accounts (account_id,name,email,tier,created_at) VALUES (?,?,?,?,?)", [
      "a1", "T", "A@B.com", "free", now,
    ]);
    const a = await pg.sql.one<{ account_id: string }>(
      "SELECT account_id FROM accounts WHERE lower(email) = lower(?)",
      ["a@b.com"],
    );
    expect(a?.account_id).toBe("a1");
  });

  it("sql.tx commits its work", async () => {
    const now = new Date().toISOString();
    await pg.sql.tx(async (c) => {
      await c.query(
        "INSERT INTO accounts (account_id,name,email,tier,created_at) VALUES ($1,$2,$3,$4,$5)",
        ["a2", "T2", "c@d.com", "paid", now],
      );
    });
    const n = await pg.sql.one<{ n: number }>("SELECT COUNT(*)::int AS n FROM accounts");
    expect(n?.n).toBeGreaterThanOrEqual(2);
  });

  it("tsvector full-text search replaces FTS5", async () => {
    const now = new Date().toISOString();
    await pg.sql.run("INSERT INTO projects (project_id,project_name,account_id) VALUES (?,?,?)", ["p1", "proj", "a1"]);
    await pg.sql.run(
      "INSERT INTO snapshots (snapshot_id,project_id,created_at,input_method,manifest,file_count,total_size_bytes,files,status,account_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ["s1", "p1", now, "api", "{}", 0, 0, "[]", "ready", "a1"],
    );
    await pg.sql.run("INSERT INTO search_index (snapshot_id,file_path,line_number,content) VALUES (?,?,?,?)", [
      "s1", "x.ts", 1, "the quick brown fox jumps over the lazy dog",
    ]);
    const hits = await pg.sql.many<{ file_path: string }>(
      "SELECT file_path FROM search_index WHERE content_tsv @@ websearch_to_tsquery('english', ?)",
      ["fox"],
    );
    expect(hits).toHaveLength(1);
  });
});
