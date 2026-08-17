// Guards the dirty-only resetTestDb (infra_01_test_suite_cost). The blanket
// "TRUNCATE every table" sweep it replaced was correct-by-brute-force; the fast
// path is only correct if it also catches the case no row count can see —
// an EMPTY table whose sequence has already advanced.
//
// The sequence test below is the one that matters. Delete the `kind === "s"`
// branch from pg-test.ts's probe and it fails with id=4 instead of 1, which is
// exactly how this would have shipped as intermittent "flakiness" in whichever
// unlucky test asserted a generated id.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resetTestDb, closeTestDb } from "./pg-test.js";
import { sql } from "./pg.js";

// code_symbols, deliberately: it is created by the CORE migrations
// (pg-schema.ts), carries a GENERATED ALWAYS AS IDENTITY sequence, and has no
// foreign keys. An earlier draft used analytics_events and broke — that table
// is created LAZILY by apps/api/src/analytics.ts, so it simply doesn't exist in
// a snapshots-only run. A fixture guarding the reset must not depend on another
// package having run first.
async function insertEvents(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await sql.run(
      `INSERT INTO code_symbols (snapshot_id, file_path, symbol_name, symbol_type, line_number) VALUES (?, ?, ?, ?, ?)`,
      ["snap-reset-test", "src/probe.ts", `probe${i}`, "function", i + 1],
    );
  }
}

async function rowCount(): Promise<number> {
  const r = await sql.one<{ n: string }>(`SELECT count(*)::int AS n FROM code_symbols`);
  return Number(r!.n);
}

/** NULL means "never advanced since the last reset" — the signal the probe keys off. */
async function sequenceLastValue(): Promise<string | null> {
  const r = await sql.one<{ last_value: string | null }>(
    `SELECT last_value FROM pg_sequences WHERE schemaname = current_schema() AND sequencename = 'code_symbols_symbol_id_seq'`,
  );
  return r?.last_value ?? null;
}

async function firstId(): Promise<string> {
  const r = await sql.one<{ symbol_id: string }>(
    `SELECT symbol_id FROM code_symbols ORDER BY symbol_id LIMIT 1`,
  );
  return String(r!.symbol_id);
}

describe("resetTestDb — dirty-only reset", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("clears rows from a table that actually has them", async () => {
    await insertEvents(3);
    expect(await rowCount()).toBe(3);
    await resetTestDb();
    expect(await rowCount()).toBe(0);
  });

  it("restarts IDENTITY so generated ids are deterministic per test", async () => {
    await insertEvents(2);
    await resetTestDb();
    await insertEvents(1);
    expect(await firstId()).toBe("1");
  });

  // ─── the trap ────────────────────────────────────────────────────
  it("resets an advanced sequence even when its table is ALREADY EMPTY", async () => {
    await insertEvents(3);
    await sql.run(`DELETE FROM code_symbols`);

    // Precondition: the trap conditions genuinely exist, so a green result
    // below can't be a vacuous pass.
    expect(await rowCount()).toBe(0);
    expect(await sequenceLastValue()).toBe("3");

    // A row-count-only probe finds nothing dirty here and skips the table.
    await resetTestDb();

    await insertEvents(1);
    expect(await firstId()).toBe("1"); // would be "4" without the sequence branch
  });

  // ─── the second trap the fast path introduces ────────────────────
  // Clearing uses DELETE with FK triggers suspended via session_replication_role.
  // That setting is per-CONNECTION, and the data layer runs on a pool — so a
  // leak would hand a later test a connection with constraint enforcement
  // silently switched off, letting genuinely invalid writes succeed and
  // masking real bugs. SET LOCAL inside sql.tx is what prevents it; this is
  // the assertion that the prevention actually holds.
  it("leaves foreign-key enforcement ON after a reset", async () => {
    await sql.run(
      `INSERT INTO accounts (account_id, name, email, tier, created_at) VALUES (?, ?, ?, ?, ?)`,
      ["acct-fk", "FK Probe", "fk-probe@example.com", "free", "2026-08-04T00:00:00.000Z"],
    );
    await resetTestDb();

    // projects.account_id references accounts.account_id, and that account is
    // gone — so this MUST be rejected. If the replica role leaked, it succeeds.
    await expect(
      sql.run(`INSERT INTO projects (project_id, project_name, account_id) VALUES (?, ?, ?)`, [
        "proj-orphan",
        "Orphan",
        "acct-does-not-exist",
      ]),
    ).rejects.toMatchObject({ code: "23503" }); // foreign_key_violation
  });

  // ─── the third trap ──────────────────────────────────────────────
  // Tables can be created LAZILY, after the first reset has already run —
  // apps/api/src/analytics.ts does exactly that on first use. An earlier draft
  // cached the probe SQL, so any such table was invisible to every later reset
  // and its rows leaked across tests indefinitely, surfacing as some unrelated
  // assertion failing much later. The probe is rebuilt per reset to prevent it.
  it("clears a table that did not exist when the first reset ran", async () => {
    await sql.exec(`CREATE TABLE IF NOT EXISTS _axis_late_table (id TEXT PRIMARY KEY)`);
    try {
      await sql.run(`INSERT INTO _axis_late_table (id) VALUES (?)`, ["leaked"]);
      await resetTestDb();
      const r = await sql.one<{ n: string }>(`SELECT count(*)::int AS n FROM _axis_late_table`);
      expect(Number(r!.n)).toBe(0);
    } finally {
      await sql.exec(`DROP TABLE IF EXISTS _axis_late_table`);
    }
  });

  it("is a safe no-op when nothing is dirty", async () => {
    expect(await rowCount()).toBe(0);
    await expect(resetTestDb()).resolves.toBeUndefined();
    await expect(resetTestDb()).resolves.toBeUndefined();
    expect(await sequenceLastValue()).toBeNull();
  });

  // 60s, not the file-wide 30s. Kept as a real invocation rather than a mock:
  // an escape hatch that is never actually run is not an escape hatch, so this
  // is the one test that deliberately pays for the whole blanket sweep.
  //
  // The budget used to be justified by "~7.8s unloaded", and that number had
  // gone stale: measured 2026-08-16 on an IDLE machine the sweep ran med 30.8s
  // / max 43.4s against a 60s budget, so it was consuming most of its own
  // ceiling before any load and timed out repeatedly in the Docker gate. That
  // was diagnosed as contention (infra_03) and it was not — it was the sweep
  // issuing one TRUNCATE per table. Fixed in pg-test.ts (one statement over all
  // tables, 5.6x), which is what makes the number below honest again:
  //   sweep now: min 4.1s  med 5.5s  max 8.7s idle  => ~7x headroom at 60s
  // If this test ever times out again, suspect a real regression in the sweep
  // (or genuine lock contention) — do NOT just raise the number, measure first.
  it("still clears everything under the AXIS_TEST_RESET_FULL escape hatch", async () => {
    await insertEvents(2);
    process.env.AXIS_TEST_RESET_FULL = "1";
    try {
      await resetTestDb();
    } finally {
      delete process.env.AXIS_TEST_RESET_FULL;
    }
    expect(await rowCount()).toBe(0);
    expect(await sequenceLastValue()).toBeNull();
  }, 60_000);
});

// ─── the shape guard (infra_03) ────────────────────────────────────
// The behavioural tests above pass either way — a per-table loop and a single
// multi-table statement both clear the DB correctly. What separates them is a
// 5.6x cost difference that only shows up as "flakiness" in whichever test is
// closest to its timeout, which is exactly how this shipped: clearTables()
// already knew not to truncate table-by-table and said so in its own comment,
// but the escape hatch kept looping and nothing could fail when the lesson
// failed to propagate. A comment cannot fail a build; this can.
//
// Asserted against source rather than timing on purpose — a wall-clock budget
// on a shared machine is the flakiness this whole exercise exists to remove.
describe("full-sweep shape — one TRUNCATE, not one per table", () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "pg-test.ts"),
    "utf8",
  );

  /** The FULL_SWEEP_SQL template literal, comments excluded. */
  function sweepSql(): string {
    const start = source.indexOf("const FULL_SWEEP_SQL");
    expect(start, "FULL_SWEEP_SQL not found — was it renamed?").toBeGreaterThan(-1);
    const open = source.indexOf("`", start);
    const close = source.indexOf("`", open + 1);
    expect(close, "FULL_SWEEP_SQL is not a single template literal").toBeGreaterThan(open);
    return source.slice(open + 1, close);
  }

  // Counting TRUNCATE literals ALONE would be vacuous: the old per-table loop
  // also contains exactly one, inside an EXECUTE it runs 47 times. What has to
  // be asserted is that it runs once — i.e. one literal AND no iteration.
  it("truncates every table in a single statement, not once per table", () => {
    const sweep = sweepSql();
    const truncates = sweep.match(/TRUNCATE/gi) ?? [];
    const why =
      "The blanket sweep must truncate every table in ONE statement. Each " +
      "execution pays its own ACCESS EXCLUSIVE lock, relfilenode swap and " +
      "fsync, so cost scales with table count, not row count — measured " +
      "med 30.8s (per-table) vs 5.5s (single) across 47 tables, against a 60s " +
      "test budget. See pg-test.ts's FULL_SWEEP_SQL comment.";

    expect(truncates.length, why).toBe(1);
    // The clause that actually catches the historical regression: one literal
    // inside a FOR ... LOOP is still one truncate PER TABLE at runtime.
    expect(/\bLOOP\b/i.test(sweep), why).toBe(false);
    expect(/\bFOR\b/i.test(sweep), why).toBe(false);
  });

  it("still discovers tables at call time, so lazily-created ones are swept", () => {
    // The speed fix must not become a static table list: analytics.ts creates
    // its table on first use, long after the first reset has run.
    expect(sweepSql()).toMatch(/pg_tables/);
    expect(sweepSql()).toMatch(/current_schema\(\)/);
  });
});
