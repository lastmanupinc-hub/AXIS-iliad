import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { createAccount } from "./billing-store.js";
import {
  getIdempotentResult,
  saveIdempotentResult,
  pruneIdempotencyKeys,
} from "./idempotency-store.js";

describe("idempotency-store", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("round-trips a stored result", async () => {
    const acct = await createAccount("A", "a@example.com", "paid");
    await saveIdempotentResult(acct.account_id, "key-1", "hash-1", '{"ok":true}');
    expect(await getIdempotentResult(acct.account_id, "key-1")).toEqual({
      request_hash: "hash-1",
      response: '{"ok":true}',
    });
  });

  it("returns undefined for an unknown key", async () => {
    const acct = await createAccount("B", "b@example.com", "paid");
    expect(await getIdempotentResult(acct.account_id, "nope")).toBeUndefined();
  });

  it("is scoped per account", async () => {
    const a = await createAccount("A2", "a2@example.com", "paid");
    const b = await createAccount("B2", "b2@example.com", "paid");
    await saveIdempotentResult(a.account_id, "shared", "h", "r");
    expect(await getIdempotentResult(b.account_id, "shared")).toBeUndefined();
  });

  it("keeps the first result on a same-key conflict (ON CONFLICT DO NOTHING)", async () => {
    const acct = await createAccount("C", "c@example.com", "paid");
    await saveIdempotentResult(acct.account_id, "k", "h1", "first");
    await saveIdempotentResult(acct.account_id, "k", "h2", "second");
    expect(await getIdempotentResult(acct.account_id, "k")).toEqual({ request_hash: "h1", response: "first" });
  });

  it("treats an expired key as absent and prunes it", async () => {
    const acct = await createAccount("D", "d@example.com", "paid");
    await saveIdempotentResult(acct.account_id, "old", "h", "r");
    const stale = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await sql.run(
      "UPDATE idempotency_keys SET created_at = ? WHERE account_id = ? AND idempotency_key = ?",
      [stale, acct.account_id, "old"],
    );
    expect(await getIdempotentResult(acct.account_id, "old")).toBeUndefined();
    expect(await pruneIdempotencyKeys()).toBe(1);
  });
});
