import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  openMemoryDb,
  closeDb,
  walCheckpoint,
  vacuum,
  integrityCheck,
  getDbStats,
  purgeStaleData,
  runMaintenance,
} from "./db.js";
import type Database from "better-sqlite3";

let db: Database.Database;

beforeEach(() => {
  db = openMemoryDb();
});

afterEach(() => {
  closeDb();
});

describe("walCheckpoint", () => {
  it("succeeds on valid database", () => {
    const result = walCheckpoint(db);
    expect(result.action).toBe("wal_checkpoint");
    expect(result.success).toBe(true);
  });

  it("returns failure when no database", () => {
    closeDb();
    const result = walCheckpoint(undefined);
    expect(result.success).toBe(false);
    expect(result.details.error).toBe("no_database");
  });
});

describe("vacuum", () => {
  it("succeeds on valid database", () => {
    const result = vacuum(db);
    expect(result.action).toBe("vacuum");
    expect(result.success).toBe(true);
  });

  it("returns failure when no database", () => {
    closeDb();
    const result = vacuum(undefined);
    expect(result.success).toBe(false);
    expect(result.details.error).toBe("no_database");
  });
});

describe("integrityCheck", () => {
  it("returns ok for clean database", () => {
    const result = integrityCheck(db);
    expect(result.action).toBe("integrity_check");
    expect(result.success).toBe(true);
    expect(result.details.result).toEqual(["ok"]);
  });

  it("returns failure when no database", () => {
    closeDb();
    const result = integrityCheck(undefined);
    expect(result.success).toBe(false);
  });
});

describe("getDbStats", () => {
  it("returns table counts and size info", () => {
    const result = getDbStats(db);
    expect(result.action).toBe("db_stats");
    expect(result.success).toBe(true);
    expect(result.details.page_size).toBeGreaterThan(0);
    expect(result.details.page_count).toBeGreaterThan(0);
    expect(typeof result.details.size_bytes).toBe("number");
    expect(typeof result.details.wal_pages).toBe("number");
    expect(typeof result.details.freelist_pages).toBe("number");

    const tables = result.details.tables as Record<string, number>;
    expect(tables).toHaveProperty("projects");
    expect(tables).toHaveProperty("snapshots");
    expect(tables).toHaveProperty("accounts");
    expect(tables).toHaveProperty("rate_limits");
    expect(tables).toHaveProperty("search_index");
    expect(tables.projects).toBe(0);
  });

  it("reflects inserted rows", () => {
    db.prepare(
      "INSERT INTO projects (project_id, project_name) VALUES ('p1', 'test')",
    ).run();
    const result = getDbStats(db);
    const tables = result.details.tables as Record<string, number>;
    expect(tables.projects).toBe(1);
  });

  it("returns failure when no database", () => {
    closeDb();
    const result = getDbStats(undefined);
    expect(result.success).toBe(false);
  });
});

describe("purgeStaleData", () => {
  it("deletes expired rate limits", () => {
    const pastReset = Date.now() - 120000;
    db.prepare(
      "INSERT INTO rate_limits (client_key, count, reset_at) VALUES (?, ?, ?)",
    ).run("ip_1.2.3.4", 50, pastReset);

    const result = purgeStaleData(db);
    expect(result.success).toBe(true);
    expect(result.details.expired_rate_limits).toBe(1);
  });

  it("keeps non-expired rate limits", () => {
    const futureReset = Date.now() + 60000;
    db.prepare(
      "INSERT INTO rate_limits (client_key, count, reset_at) VALUES (?, ?, ?)",
    ).run("ip_5.6.7.8", 10, futureReset);

    const result = purgeStaleData(db);
    expect(result.details.expired_rate_limits).toBe(0);
    const row = db.prepare("SELECT * FROM rate_limits WHERE client_key = ?").get("ip_5.6.7.8");
    expect(row).toBeTruthy();
  });

  it("deletes old revoked API keys beyond retention", () => {
    db.prepare(
      "INSERT INTO accounts (account_id, name, email, tier, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run("acct_1", "Test", "test@example.com", "free", new Date().toISOString());

    const oldDate = new Date(Date.now() - 100 * 86400000).toISOString();
    db.prepare(
      "INSERT INTO api_keys (key_id, key_hash, account_id, label, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("k1", "hash1", "acct_1", "old key", oldDate, oldDate);

    const result = purgeStaleData(db, { retentionDays: 90 });
    expect(result.details.old_revoked_keys).toBe(1);
  });

  it("keeps recently revoked API keys within retention", () => {
    db.prepare(
      "INSERT INTO accounts (account_id, name, email, tier, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run("acct_2", "Test2", "test2@example.com", "free", new Date().toISOString());

    const recentDate = new Date(Date.now() - 10 * 86400000).toISOString();
    db.prepare(
      "INSERT INTO api_keys (key_id, key_hash, account_id, label, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("k2", "hash2", "acct_2", "recent key", recentDate, recentDate);

    const result = purgeStaleData(db, { retentionDays: 90 });
    expect(result.details.old_revoked_keys).toBe(0);
  });

  it("deletes old revoked seats beyond retention", () => {
    db.prepare(
      "INSERT INTO accounts (account_id, name, email, tier, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run("acct_3", "Test3", "test3@example.com", "free", new Date().toISOString());

    const oldDate = new Date(Date.now() - 100 * 86400000).toISOString();
    db.prepare(
      "INSERT INTO seats (seat_id, account_id, email, role, invited_by, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("s1", "acct_3", "old@example.com", "member", "owner", oldDate, oldDate);

    const result = purgeStaleData(db, { retentionDays: 90 });
    expect(result.details.old_revoked_seats).toBe(1);
  });

  it("returns failure when no database", () => {
    closeDb();
    const result = purgeStaleData(undefined);
    expect(result.success).toBe(false);
  });
});

describe("closeDb edge cases", () => {
  it("is a no-op when called on an already-closed database", () => {
    closeDb(); // first close — db is open
    closeDb(); // second close — db is already null, should not throw
  });
});

describe("runMaintenance", () => {
  it("runs all 4 maintenance steps", () => {
    const results = runMaintenance(db);
    expect(results).toHaveLength(4);
    expect(results[0].action).toBe("wal_checkpoint");
    expect(results[1].action).toBe("purge_stale");
    expect(results[2].action).toBe("vacuum");
    expect(results[3].action).toBe("integrity_check");
    expect(results.every((r) => r.success)).toBe(true);
  });
});
