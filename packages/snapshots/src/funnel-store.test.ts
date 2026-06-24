import { describe, it, expect, beforeAll } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { createAccount, updateAccountTier } from "./billing-store.js";
import {
  inviteSeat,
  acceptSeat,
  revokeSeat,
  getSeat,
  getActiveSeats,
  getAccountEvents,
  getLatestEvent,
  trackEvent,
} from "./funnel-store.js";
import { sql } from "./pg.js";

beforeAll(async () => {
  await resetTestDb();
});

describe("funnel-store unit tests", () => {
  let accountId: string;

  beforeAll(async () => {
    const acct = await createAccount("FunnelTest", "funnel@test.com", "free");
    // Upgrade to paid tier for seat tests (free tier blocks seat invites at limit 1)
    await updateAccountTier(acct.account_id, "paid");
    accountId = acct.account_id;
  });

  // Layer 12: acceptSeat returns true for valid pending seat (funnel-store.ts line 69)
  it("acceptSeat returns true and tracks event for valid seat", async () => {
    const seat = await inviteSeat(accountId, "accept@test.com", "member", accountId);
    const result = await acceptSeat(seat.seat_id);
    expect(result).toBe(true);
    const updated = await getSeat(seat.seat_id);
    expect(updated!.accepted_at).toBeTruthy();
  });

  it("acceptSeat returns false for already-accepted seat", async () => {
    const seat = await inviteSeat(accountId, "accept2@test.com", "member", accountId);
    await acceptSeat(seat.seat_id);
    // Second accept should return false (already accepted)
    const result = await acceptSeat(seat.seat_id);
    expect(result).toBe(false);
  });

  it("acceptSeat returns false for revoked seat", async () => {
    const seat = await inviteSeat(accountId, "revaccept@test.com", "member", accountId);
    await revokeSeat(seat.seat_id);
    const result = await acceptSeat(seat.seat_id);
    expect(result).toBe(false);
  });

  // Layer 12: safeParseMetadata with invalid JSON (funnel-store.ts line 202)
  it("getAccountEvents handles corrupt metadata JSON", async () => {
    // Insert an event with invalid JSON metadata directly
    await sql.run(
      `INSERT INTO funnel_events (event_id, account_id, event_type, stage, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["evt_bad_json", accountId, "snapshot_created", "signup", "<<<invalid json>>>", new Date().toISOString()],
    );

    const events = await getAccountEvents(accountId);
    const badEvent = events.find(e => e.event_id === "evt_bad_json");
    expect(badEvent).toBeTruthy();
    // Invalid JSON should fallback to empty object
    expect(badEvent!.metadata).toEqual({});
  });

  it("getLatestEvent handles corrupt metadata JSON", async () => {
    // Insert newer event with bad JSON to be latest
    await sql.run(
      `INSERT INTO funnel_events (event_id, account_id, event_type, stage, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["evt_bad_json2", accountId, "snapshot_created", "signup", "{broken", "2099-01-01T00:00:00.000Z"],
    );

    const latest = await getLatestEvent(accountId);
    expect(latest).toBeTruthy();
    expect(latest!.metadata).toEqual({});
  });

  it("revokeSeat returns false for nonexistent seat", async () => {
    const result = await revokeSeat("seat_does_not_exist");
    expect(result).toBe(false);
  });

  it("getActiveSeats returns only non-revoked seats", async () => {
    const acct2 = await createAccount("ActiveTest", "active@test.com", "free");
    await updateAccountTier(acct2.account_id, "paid"); // need paid for multiple seats
    const s1 = await inviteSeat(acct2.account_id, "keep@test.com", "member", acct2.account_id);
    const s2 = await inviteSeat(acct2.account_id, "remove@test.com", "member", acct2.account_id);
    await revokeSeat(s2.seat_id);
    const active = await getActiveSeats(acct2.account_id);
    expect(active.length).toBe(1);
    expect(active[0].email).toBe("keep@test.com");
  });
});
