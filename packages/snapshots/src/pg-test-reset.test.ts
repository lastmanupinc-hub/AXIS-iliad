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

  it("is a safe no-op when nothing is dirty", async () => {
    expect(await rowCount()).toBe(0);
    await expect(resetTestDb()).resolves.toBeUndefined();
    await expect(resetTestDb()).resolves.toBeUndefined();
    expect(await sequenceLastValue()).toBeNull();
  });

  // 60s timeout, not the 5s default. The blanket sweep this escape hatch
  // restores measures ~7.8s unloaded, but it is highly variable under
  // contention — at 30s this test itself flaked. Needing a 12x timeout just to
  // exercise the OLD path is the clearest possible summary of why the new one
  // exists. Kept as a real invocation rather than a mock: an escape hatch that
  // is never actually run is not an escape hatch.
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
