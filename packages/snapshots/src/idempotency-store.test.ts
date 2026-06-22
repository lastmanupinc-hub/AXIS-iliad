import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, openMemoryDb } from "./db.js";
import { createAccount } from "./billing-store.js";
import {
  getIdempotentResult,
  saveIdempotentResult,
  pruneIdempotencyKeys,
} from "./idempotency-store.js";

describe("idempotency-store", () => {
  beforeEach(() => {
    openMemoryDb();
  });
  afterEach(() => {
    closeDb();
  });

  it("round-trips a stored result", () => {
    const acct = createAccount("A", "a@example.com", "paid");
    saveIdempotentResult(acct.account_id, "key-1", "hash-1", '{"ok":true}');
    expect(getIdempotentResult(acct.account_id, "key-1")).toEqual({
      request_hash: "hash-1",
      response: '{"ok":true}',
    });
  });

  it("returns undefined for an unknown key", () => {
    const acct = createAccount("B", "b@example.com", "paid");
    expect(getIdempotentResult(acct.account_id, "nope")).toBeUndefined();
  });

  it("is scoped per account", () => {
    const a = createAccount("A2", "a2@example.com", "paid");
    const b = createAccount("B2", "b2@example.com", "paid");
    saveIdempotentResult(a.account_id, "shared", "h", "r");
    expect(getIdempotentResult(b.account_id, "shared")).toBeUndefined();
  });

  it("keeps the first result on a same-key conflict (ON CONFLICT DO NOTHING)", () => {
    const acct = createAccount("C", "c@example.com", "paid");
    saveIdempotentResult(acct.account_id, "k", "h1", "first");
    saveIdempotentResult(acct.account_id, "k", "h2", "second");
    expect(getIdempotentResult(acct.account_id, "k")).toEqual({ request_hash: "h1", response: "first" });
  });

  it("treats an expired key as absent and prunes it", () => {
    const acct = createAccount("D", "d@example.com", "paid");
    saveIdempotentResult(acct.account_id, "old", "h", "r");
    const stale = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    getDb()
      .prepare("UPDATE idempotency_keys SET created_at = ? WHERE account_id = ? AND idempotency_key = ?")
      .run(stale, acct.account_id, "old");
    expect(getIdempotentResult(acct.account_id, "old")).toBeUndefined();
    expect(pruneIdempotencyKeys()).toBe(1);
  });
});
