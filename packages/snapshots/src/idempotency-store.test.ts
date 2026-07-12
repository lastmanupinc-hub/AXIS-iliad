import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { createAccount } from "./billing-store.js";
import {
  getIdempotentResult,
  claimIdempotencyKey,
  completeIdempotencyKey,
  releaseIdempotencyKey,
  pruneIdempotencyKeys,
} from "./idempotency-store.js";

describe("idempotency-store", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("round-trips a completed result through claim -> complete", async () => {
    const acct = await createAccount("A", "a@example.com", "paid");
    expect(await claimIdempotencyKey(acct.account_id, "key-1", "hash-1")).toBe(true);
    expect(await getIdempotentResult(acct.account_id, "key-1")).toBeUndefined(); // pending, not yet replayable
    await completeIdempotencyKey(acct.account_id, "key-1", '{"ok":true}');
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
    await claimIdempotencyKey(a.account_id, "shared", "h");
    await completeIdempotencyKey(a.account_id, "shared", "r");
    expect(await getIdempotentResult(b.account_id, "shared")).toBeUndefined();
  });

  it("treats an expired completed key as absent and prunes it", async () => {
    const acct = await createAccount("D", "d@example.com", "paid");
    await claimIdempotencyKey(acct.account_id, "old", "h");
    await completeIdempotencyKey(acct.account_id, "old", "r");
    const stale = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await sql.run(
      "UPDATE idempotency_keys SET created_at = ? WHERE account_id = ? AND idempotency_key = ?",
      [stale, acct.account_id, "old"],
    );
    expect(await getIdempotentResult(acct.account_id, "old")).toBeUndefined();
    expect(await pruneIdempotencyKeys()).toBe(1);
  });

  // ─── H2.6 — claim/reservation (WAVE-0 finding #1, CRITICAL) ─────────

  describe("claimIdempotencyKey — at-most-one claim before any money moves", () => {
    it("the second claim attempt for a still-pending key fails (no complete/release between them)", async () => {
      const acct = await createAccount("Claim1", "claim1@example.com", "paid");
      expect(await claimIdempotencyKey(acct.account_id, "k", "h")).toBe(true);
      expect(await claimIdempotencyKey(acct.account_id, "k", "h")).toBe(false); // genuinely in flight
    });

    it("a released claim can be reclaimed immediately (failed work stays retryable)", async () => {
      const acct = await createAccount("Claim2", "claim2@example.com", "paid");
      expect(await claimIdempotencyKey(acct.account_id, "k", "h")).toBe(true);
      await releaseIdempotencyKey(acct.account_id, "k");
      expect(await claimIdempotencyKey(acct.account_id, "k", "h2")).toBe(true); // fresh claim, new hash allowed
    });

    it("a completed key cannot be re-claimed — getIdempotentResult must be checked first for a legitimate replay", async () => {
      const acct = await createAccount("Claim3", "claim3@example.com", "paid");
      await claimIdempotencyKey(acct.account_id, "k", "h");
      await completeIdempotencyKey(acct.account_id, "k", "response");
      expect(await claimIdempotencyKey(acct.account_id, "k", "h")).toBe(false);
      expect(await getIdempotentResult(acct.account_id, "k")).toEqual({ request_hash: "h", response: "response" });
    });

    it("a STALE pending claim (crashed request, past the 60s window) can be reclaimed by a new request", async () => {
      const acct = await createAccount("Claim4", "claim4@example.com", "paid");
      expect(await claimIdempotencyKey(acct.account_id, "k", "h-abandoned")).toBe(true);
      const stale = new Date(Date.now() - 61_000).toISOString();
      await sql.run(
        "UPDATE idempotency_keys SET created_at = ? WHERE account_id = ? AND idempotency_key = ?",
        [stale, acct.account_id, "k"],
      );
      expect(await claimIdempotencyKey(acct.account_id, "k", "h-fresh")).toBe(true);
      // The reclaim overwrote the abandoned claim's hash — completing now completes the FRESH request.
      await completeIdempotencyKey(acct.account_id, "k", "fresh-response");
      expect(await getIdempotentResult(acct.account_id, "k")).toEqual({ request_hash: "h-fresh", response: "fresh-response" });
    });

    it("a RECENT pending claim (well within the window) is NOT reclaimable — this is the exact race the fix closes", async () => {
      const acct = await createAccount("Claim5", "claim5@example.com", "paid");
      expect(await claimIdempotencyKey(acct.account_id, "k", "h")).toBe(true);
      // No time has passed — a concurrent second request must be rejected, not allowed to also charge.
      expect(await claimIdempotencyKey(acct.account_id, "k", "h")).toBe(false);
    });

    it("N-way concurrent claims for ONE key yield exactly one winner — the core proof this fix exists for", async () => {
      const acct = await createAccount("ClaimRace", "claim-race@example.com", "paid");
      const results = await Promise.all(
        Array.from({ length: 10 }, () => claimIdempotencyKey(acct.account_id, "race-key", "h")),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it("distinct keys claim independently — no cross-key interference", async () => {
      const acct = await createAccount("Claim6", "claim6@example.com", "paid");
      expect(await claimIdempotencyKey(acct.account_id, "k1", "h1")).toBe(true);
      expect(await claimIdempotencyKey(acct.account_id, "k2", "h2")).toBe(true);
    });
  });
});
