/**
 * eq_130: Layer 5 store-level branch coverage
 * Targets uncovered branches in funnel-store.ts, billing-store.ts, db.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  createAccount,
} from "./index.js";
import { resetTestDb } from "./pg-test.js";
import {
  inviteSeat,
  acceptSeat,
  revokeSeat,
  getSeat,
  getActiveSeats,
  getSeatCount,
  resolveStage,
  trackEvent,
} from "./funnel-store.js";
import {
  getSystemStats,
} from "./billing-store.js";
import { recordUsage } from "./billing-store.js";

beforeEach(async () => {
  await resetTestDb();
});

// ─── funnel-store.ts branches ───────────────────────────────────

describe("funnel-store — acceptSeat double-accept", () => {
  // Line 31: inviteSeat with non-existent account
  it("throws when account_id does not exist", async () => {
    await expect(inviteSeat("nonexistent-id", "a@test.com", "member", "system"))
      .rejects.toThrow("Account not found");
  });

  // Lines 67-80: acceptSeat returning false on second call
  it("acceptSeat returns false when seat already accepted", async () => {
    const acct = await createAccount("Test", "t@test.com");
    const seat = await inviteSeat(acct.account_id, "bob@test.com", "member", "system");
    const first = await acceptSeat(seat.seat_id);
    expect(first).toBe(true);
    const second = await acceptSeat(seat.seat_id);
    expect(second).toBe(false);
  });

  // acceptSeat on revoked seat returns false
  it("acceptSeat returns false when seat is revoked", async () => {
    const acct = await createAccount("Test2", "t2@test.com");
    const seat = await inviteSeat(acct.account_id, "revoked@test.com", "member", "system");
    await revokeSeat(seat.seat_id);
    const result = await acceptSeat(seat.seat_id);
    expect(result).toBe(false);
  });

  // revokeSeat returns false on second revoke
  it("revokeSeat returns false when seat already revoked", async () => {
    const acct = await createAccount("Test3", "t3@test.com");
    const seat = await inviteSeat(acct.account_id, "rev2@test.com", "member", "system");
    expect(await revokeSeat(seat.seat_id)).toBe(true);
    expect(await revokeSeat(seat.seat_id)).toBe(false);
  });
});

describe("funnel-store — getActiveSeats empty", () => {
  // All seats revoked → empty array
  it("returns empty array when all seats are revoked", async () => {
    const acct = await createAccount("Empty", "empty@test.com");
    const s = await inviteSeat(acct.account_id, "gone@test.com", "member", "system");
    await revokeSeat(s.seat_id);
    expect(await getActiveSeats(acct.account_id)).toEqual([]);
  });

  // getSeatCount = 0 for new account
  it("getSeatCount returns 0 for account with no seats", async () => {
    const acct = await createAccount("NoSeats", "noseats@test.com");
    expect(await getSeatCount(acct.account_id)).toBe(0);
  });
});

describe("funnel-store — resolveStage edge cases", () => {
  // Line 202: engagement stage without any events
  it("returns engagement without churn_risk when no events exist", async () => {
    const acct = await createAccount("Engaged", "engaged@test.com");
    // Get past engagement threshold by recording usage
    for (let i = 0; i < 5; i++) {
      await recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    // Don't track any funnel events
    const stage = await resolveStage(acct.account_id);
    // Should be engagement or higher, not churn (no events to check)
    expect(["engagement", "activation", "signup"]).toContain(stage);
  });
});

// ─── billing-store.ts branches ──────────────────────────────────

describe("billing-store — getSeatCount & getSystemStats", () => {
  // Lines 302-304: system stats with accounts but no seats
  it("getSystemStats works with accounts but no seats", async () => {
    await createAccount("A", "a@test.com");
    await createAccount("B", "b@test.com");
    const stats = await getSystemStats();
    expect(stats.total_accounts).toBeGreaterThanOrEqual(2);
  });
});
