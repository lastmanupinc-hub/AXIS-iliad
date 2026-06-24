import { describe, it, expect, beforeEach } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import {
  createAccount,
  getAccount,
  updateAccountTier,
  recordUsage,
} from "./billing-store.js";
import {
  inviteSeat,
  acceptSeat,
  revokeSeat,
  getActiveSeats,
  getAllSeats,
  getSeatByEmail,
  getSeatCount,
  trackEvent,
  getAccountEvents,
  getLatestEvent,
  getEventsByType,
  resolveStage,
  generateUpgradePrompt,
  getFunnelMetrics,
} from "./funnel-store.js";
import {
  SEAT_LIMITS,
  PLAN_CATALOG,
  PLAN_FEATURES,
  ACTIVATION_THRESHOLD,
  ENGAGEMENT_THRESHOLD,
} from "./funnel-types.js";

beforeEach(async () => { await resetTestDb(); });

// ─── Seats ──────────────────────────────────────────────────────

describe("Seats", () => {
  it("invites a team member (paid tier)", async () => {
    const acct = await createAccount("Org", "org@example.com", "paid");
    const seat = await inviteSeat(acct.account_id, "dev@example.com", "member", acct.account_id);
    expect(seat.seat_id).toBeTruthy();
    expect(seat.email).toBe("dev@example.com");
    expect(seat.role).toBe("member");
    expect(seat.accepted_at).toBeNull();
    expect(seat.revoked_at).toBeNull();
  });

  it("rejects seat invite on free tier (limit = 1)", async () => {
    const acct = await createAccount("Solo", "solo@example.com", "free");
    // Free tier has 1 seat — but the owner counts implicitly, so first invite should fail
    // Actually SEAT_LIMITS.free = 1, and getActiveSeats starts at 0
    // So the first invite succeeds, second fails
    await inviteSeat(acct.account_id, "a@example.com", "member", acct.account_id);
    await expect(inviteSeat(acct.account_id, "b@example.com", "member", acct.account_id))
      .rejects.toThrow("Seat limit reached");
  });

  it("suite tier allows unlimited seats", async () => {
    const acct = await createAccount("Enterprise", "ent@example.com", "suite");
    for (let i = 0; i < 10; i++) {
      await inviteSeat(acct.account_id, `user${i}@example.com`, "member", acct.account_id);
    }
    expect(await getSeatCount(acct.account_id)).toBe(10);
  });

  it("accepts a seat invitation", async () => {
    const acct = await createAccount("Org", "org@example.com", "paid");
    const seat = await inviteSeat(acct.account_id, "dev@example.com", "member", acct.account_id);
    expect(seat.accepted_at).toBeNull();

    const ok = await acceptSeat(seat.seat_id);
    expect(ok).toBe(true);

    const seats = await getActiveSeats(acct.account_id);
    expect(seats[0].accepted_at).toBeTruthy();
  });

  it("revokes a seat", async () => {
    const acct = await createAccount("Org", "org@example.com", "paid");
    const seat = await inviteSeat(acct.account_id, "dev@example.com", "member", acct.account_id);

    const ok = await revokeSeat(seat.seat_id);
    expect(ok).toBe(true);

    const active = await getActiveSeats(acct.account_id);
    expect(active.length).toBe(0);

    const all = await getAllSeats(acct.account_id);
    expect(all.length).toBe(1);
    expect(all[0].revoked_at).toBeTruthy();
  });

  it("finds seat by email", async () => {
    const acct = await createAccount("Org", "org@example.com", "paid");
    await inviteSeat(acct.account_id, "dev@example.com", "member", acct.account_id);

    const found = await getSeatByEmail(acct.account_id, "dev@example.com");
    expect(found).toBeTruthy();
    expect(found!.email).toBe("dev@example.com");

    expect(await getSeatByEmail(acct.account_id, "nobody@example.com")).toBeUndefined();
  });

  it("seat invite fires funnel event", async () => {
    const acct = await createAccount("Org", "org@example.com", "paid");
    await inviteSeat(acct.account_id, "dev@example.com", "member", acct.account_id);

    const events = await getEventsByType(acct.account_id, "seat_invited");
    expect(events.length).toBe(1);
    expect(events[0].metadata.email).toBe("dev@example.com");
  });

  it("paid tier allows up to 5 seats", async () => {
    const acct = await createAccount("Org", "org@example.com", "paid");
    for (let i = 0; i < SEAT_LIMITS.paid; i++) {
      await inviteSeat(acct.account_id, `user${i}@example.com`, "member", acct.account_id);
    }
    expect(await getSeatCount(acct.account_id)).toBe(SEAT_LIMITS.paid);
    await expect(inviteSeat(acct.account_id, "overflow@example.com", "member", acct.account_id))
      .rejects.toThrow("Seat limit reached");
  });
});

// ─── Funnel Events ──────────────────────────────────────────────

describe("Funnel Events", () => {
  it("tracks events with metadata", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const event = await trackEvent(acct.account_id, "account_created", "signup", { source: "web" });
    expect(event.event_id).toBeTruthy();
    expect(event.event_type).toBe("account_created");
    expect(event.stage).toBe("signup");
    expect(event.metadata.source).toBe("web");
  });

  it("retrieves events in reverse chronological order", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    await trackEvent(acct.account_id, "account_created", "signup", {});
    await trackEvent(acct.account_id, "first_snapshot", "activation", {});
    await trackEvent(acct.account_id, "snapshot_created", "engagement", {});

    const events = await getAccountEvents(acct.account_id);
    expect(events.length).toBe(3);
    expect(events[0].event_type).toBe("snapshot_created");
    expect(events[2].event_type).toBe("account_created");
  });

  it("gets latest event", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    await trackEvent(acct.account_id, "account_created", "signup", {});
    await trackEvent(acct.account_id, "snapshot_created", "activation", {});

    const latest = await getLatestEvent(acct.account_id);
    expect(latest).toBeTruthy();
    expect(latest!.event_type).toBe("snapshot_created");
  });

  it("filters events by type", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    await trackEvent(acct.account_id, "account_created", "signup", {});
    await trackEvent(acct.account_id, "snapshot_created", "activation", {});
    await trackEvent(acct.account_id, "snapshot_created", "engagement", {});

    const snapshotEvents = await getEventsByType(acct.account_id, "snapshot_created");
    expect(snapshotEvents.length).toBe(2);
  });

  it("returns undefined for account with no events", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    expect(await getLatestEvent(acct.account_id)).toBeUndefined();
    expect(await getAccountEvents(acct.account_id)).toEqual([]);
  });
});

// ─── Stage Resolution ───────────────────────────────────────────

describe("Stage Resolution", () => {
  it("new free account is at signup stage", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    expect(await resolveStage(acct.account_id)).toBe("signup");
  });

  it("returns visitor for unknown account", async () => {
    expect(await resolveStage("nonexistent")).toBe("visitor");
  });

  it("moves to activation after first snapshot", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    for (let i = 0; i < ACTIVATION_THRESHOLD; i++) {
      await recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    expect(await resolveStage(acct.account_id)).toBe("activation");
  });

  it("moves to engagement after threshold snapshots", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    for (let i = 0; i < ENGAGEMENT_THRESHOLD; i++) {
      await recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    expect(await resolveStage(acct.account_id)).toBe("engagement");
  });

  it("moves to limit_hit when quota exhausted", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    for (let i = 0; i < 10; i++) {
      await recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    expect(await resolveStage(acct.account_id)).toBe("limit_hit");
  });

  it("paid account is at conversion", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    expect(await resolveStage(acct.account_id)).toBe("conversion");
  });

  it("suite account is at conversion", async () => {
    const acct = await createAccount("Corp", "corp@example.com", "suite");
    expect(await resolveStage(acct.account_id)).toBe("conversion");
  });

  it("paid account with seats is at expansion", async () => {
    const acct = await createAccount("Org", "org@example.com", "paid");
    await inviteSeat(acct.account_id, "dev@example.com", "member", acct.account_id);
    expect(await resolveStage(acct.account_id)).toBe("expansion");
  });
});

// ─── Upgrade Prompts ────────────────────────────────────────────

describe("Upgrade Prompts", () => {
  it("returns null for suite users", async () => {
    const acct = await createAccount("Corp", "corp@example.com", "suite");
    expect(await generateUpgradePrompt(acct.account_id)).toBeNull();
  });

  it("returns null for new free account (no usage)", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    // New signup — no snapshot usage, no prompt
    expect(await generateUpgradePrompt(acct.account_id)).toBeNull();
  });

  it("returns activation prompt after first snapshot", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    await recordUsage(acct.account_id, "search", "snap-1", 1, 1, 100);

    const prompt = await generateUpgradePrompt(acct.account_id);
    expect(prompt).toBeTruthy();
    expect(prompt!.trigger).toBe("first_snapshot_completed");
    expect(prompt!.current_tier).toBe("free");
    expect(prompt!.recommended_tier).toBe("paid");
    expect(prompt!.urgency).toBe("low");
  });

  it("returns engagement prompt for active users", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    for (let i = 0; i < ENGAGEMENT_THRESHOLD; i++) {
      await recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }

    const prompt = await generateUpgradePrompt(acct.account_id);
    expect(prompt).toBeTruthy();
    expect(prompt!.trigger).toBe("active_user_value");
    expect(prompt!.urgency).toBe("medium");
    expect(prompt!.features_unlocked.length).toBeGreaterThan(0);
  });

  it("returns high-urgency limit prompt when quota exhausted", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    for (let i = 0; i < 10; i++) {
      await recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }

    const prompt = await generateUpgradePrompt(acct.account_id);
    expect(prompt).toBeTruthy();
    expect(prompt!.trigger).toBe("monthly_limit_reached");
    expect(prompt!.urgency).toBe("high");
    expect(prompt!.cta_label).toContain("Upgrade");
  });

  it("returns seat limit prompt for paid tier at capacity", async () => {
    const acct = await createAccount("Org", "org@example.com", "paid");
    for (let i = 0; i < SEAT_LIMITS.paid; i++) {
      await inviteSeat(acct.account_id, `user${i}@example.com`, "member", acct.account_id);
    }

    const prompt = await generateUpgradePrompt(acct.account_id);
    expect(prompt).toBeTruthy();
    expect(prompt!.trigger).toBe("seat_limit_reached");
    expect(prompt!.recommended_tier).toBe("suite");
    expect(prompt!.features_unlocked).toContain("Unlimited team seats");
  });

  it("returns null for paid tier with no pressure", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    // No snapshots, no seats filled — no upgrade pressure
    expect(await generateUpgradePrompt(acct.account_id)).toBeNull();
  });

  it("returns null for unknown account", async () => {
    expect(await generateUpgradePrompt("nonexistent")).toBeNull();
  });
});

// ─── Funnel Metrics ─────────────────────────────────────────────

describe("Funnel Metrics", () => {
  it("computes metrics for empty system", async () => {
    const metrics = await getFunnelMetrics();
    expect(metrics.total_accounts).toBe(0);
    expect(metrics.conversion_rate).toBe(0);
    expect(metrics.activation_rate).toBe(0);
    expect(metrics.total_seats).toBe(0);
  });

  it("computes tier distribution", async () => {
    await createAccount("A", "a@example.com", "free");
    await createAccount("B", "b@example.com", "free");
    await createAccount("C", "c@example.com", "paid");
    await createAccount("D", "d@example.com", "suite");

    const metrics = await getFunnelMetrics();
    expect(metrics.total_accounts).toBe(4);
    expect(metrics.by_tier.free).toBe(2);
    expect(metrics.by_tier.paid).toBe(1);
    expect(metrics.by_tier.suite).toBe(1);
    expect(metrics.conversion_rate).toBe(0.5); // 2/4
  });

  it("counts active seats", async () => {
    const acct = await createAccount("Org", "org@example.com", "paid");
    await inviteSeat(acct.account_id, "a@example.com", "member", acct.account_id);
    await inviteSeat(acct.account_id, "b@example.com", "member", acct.account_id);
    const seat3 = await inviteSeat(acct.account_id, "c@example.com", "member", acct.account_id);
    await revokeSeat(seat3.seat_id);

    const metrics = await getFunnelMetrics();
    expect(metrics.total_seats).toBe(2);
  });

  it("computes stage distribution", async () => {
    const free1 = await createAccount("A", "a@example.com", "free");
    const free2 = await createAccount("B", "b@example.com", "free");
    await createAccount("C", "c@example.com", "paid");

    // free1 has 1 snapshot → activation
    await recordUsage(free1.account_id, "search", "snap-1", 1, 1, 100);
    // free2 has no usage → signup

    const metrics = await getFunnelMetrics();
    expect(metrics.by_stage.signup).toBe(1);      // free2
    expect(metrics.by_stage.activation).toBe(1);   // free1
    expect(metrics.by_stage.conversion).toBe(1);   // paid
  });

  it("counts recent events", async () => {
    const acct = await createAccount("A", "a@example.com");
    await trackEvent(acct.account_id, "account_created", "signup", {});
    await trackEvent(acct.account_id, "snapshot_created", "activation", {});

    const metrics = await getFunnelMetrics();
    expect(metrics.events_last_24h).toBe(2);
    expect(metrics.events_last_7d).toBe(2);
  });
});

// ─── Plan Catalog ───────────────────────────────────────────────

describe("Plan Catalog", () => {
  it("has 5 plans (free, starter, pro, growth, enterprise)", async () => {
    expect(PLAN_CATALOG.length).toBe(5);
    expect(PLAN_CATALOG.map((p) => p.id)).toEqual(["free", "starter", "pro", "growth", "enterprise"]);
  });

  it("free plan is $0", async () => {
    const free = PLAN_CATALOG.find(p => p.id === "free")!;
    expect(free.price_monthly_cents).toBe(0);
    expect(free.price_annual_cents).toBe(0);
  });

  it("starter plan has a price", async () => {
    const starter = PLAN_CATALOG.find((p) => p.id === "starter")!;
    expect(starter.price_monthly_cents).toBe(2900);
    expect(starter.price_annual_cents).toBe(27840);
    expect(starter.name).toBe("Starter");
  });

  it("pro plan has a price", async () => {
    const pro = PLAN_CATALOG.find((p) => p.id === "pro")!;
    expect(pro.price_monthly_cents).toBe(9900);
    expect(pro.price_annual_cents).toBe(95040);
    expect(pro.name).toBe("Pro");
  });

  it("growth plan has a price", async () => {
    const growth = PLAN_CATALOG.find((p) => p.id === "growth")!;
    expect(growth.price_monthly_cents).toBe(29900);
    expect(growth.price_annual_cents).toBe(287040);
    expect(growth.name).toBe("Growth");
  });

  it("enterprise plan is contact sales", async () => {
    const enterprise = PLAN_CATALOG.find((p) => p.id === "enterprise")!;
    expect(enterprise.price_monthly_cents).toBe(-1);
    expect(enterprise.name).toBe("Enterprise");
  });

  it("feature comparison has entries for all tiers", async () => {
    expect(PLAN_FEATURES.length).toBe(9);
    for (const feature of PLAN_FEATURES) {
      expect(feature).toHaveProperty("free");
      expect(feature).toHaveProperty("starter");
      expect(feature).toHaveProperty("pro");
      expect(feature).toHaveProperty("growth");
      expect(feature).toHaveProperty("enterprise");
    }
  });

  it("seat limits match tier expectations", async () => {
    expect(SEAT_LIMITS.free).toBe(1);
    expect(SEAT_LIMITS.paid).toBe(5);
    expect(SEAT_LIMITS.suite).toBe(-1);
  });
});

// ─── Corruption resilience ──────────────────────────────────────

describe("Funnel event corruption resilience", () => {
  it("getAccountEvents returns fallback metadata for corrupted rows", async () => {
    const acct = await createAccount("Test", "test@example.com");
    await trackEvent(acct.account_id, "account_created", "signup", { source: "web" });

    // Directly corrupt the metadata column
    await sql.run("UPDATE funnel_events SET metadata = ? WHERE account_id = ?", ["not-json{{{", acct.account_id]);

    const events = await getAccountEvents(acct.account_id);
    expect(events).toHaveLength(1);
    // Should return {} as fallback metadata instead of throwing
    expect(events[0].metadata).toEqual({});
  });

  it("getLatestEvent returns fallback metadata for corrupted row", async () => {
    const acct = await createAccount("Test", "test@example.com");
    await trackEvent(acct.account_id, "account_created", "signup", { source: "web" });

    await sql.run("UPDATE funnel_events SET metadata = ? WHERE account_id = ?", ["broken", acct.account_id]);

    const latest = await getLatestEvent(acct.account_id);
    expect(latest).toBeDefined();
    expect(latest!.metadata).toEqual({});
    expect(latest!.event_type).toBe("account_created");
  });

  it("getEventsByType returns fallback metadata for corrupted rows", async () => {
    const acct = await createAccount("Test", "test@example.com");
    await trackEvent(acct.account_id, "snapshot_created", "activation", { count: 1 });

    await sql.run("UPDATE funnel_events SET metadata = ? WHERE account_id = ?", ["{corrupt", acct.account_id]);

    const events = await getEventsByType(acct.account_id, "snapshot_created");
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toEqual({});
  });
});
