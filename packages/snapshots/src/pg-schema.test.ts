import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Runs only when PG_TEST_URL points at a real Postgres. CI without a Postgres
// service skips this (Phase 6 wires the CI Postgres service). Locally:
//   docker run -d --name iliad-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=iliad -p 55432:5432 postgres:16
//   PG_TEST_URL=postgres://postgres:test@127.0.0.1:55432/iliad pnpm vitest run packages/snapshots/src/pg-schema.test.ts
const PG_TEST_URL = process.env.PG_TEST_URL;
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

  it("stands up the schema at v30 with all core tables", async () => {
    expect(await schema.getPgSchemaVersion()).toBe(30);
    const rows = await pg.sql.many<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = current_schema()",
    );
    const names = rows.map((r) => r.tablename);
    for (const t of ["accounts", "api_keys", "snapshots", "mcp_usage", "stripe_subscriptions", "search_index", "project_memory"]) {
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
