import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemoryDb, closeDb } from "./db.js";
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

beforeEach(() => { openMemoryDb(); });
afterEach(() => { closeDb(); });

// ─── Seats ──────────────────────────────────────────────────────

describe("Seats", () => {
  it("invites a team member (paid tier)", () => {
    const acct = createAccount("Org", "org@example.com", "paid");
    const seat = inviteSeat(acct.account_id, "dev@example.com", "member", acct.account_id);
    expect(seat.seat_id).toBeTruthy();
    expect(seat.email).toBe("dev@example.com");
    expect(seat.role).toBe("member");
    expect(seat.accepted_at).toBeNull();
    expect(seat.revoked_at).toBeNull();
  });

  it("rejects seat invite on free tier (limit = 1)", () => {
    const acct = createAccount("Solo", "solo@example.com", "free");
    // Free tier has 1 seat — but the owner counts implicitly, so first invite should fail
    // Actually SEAT_LIMITS.free = 1, and getActiveSeats starts at 0
    // So the first invite succeeds, second fails
    inviteSeat(acct.account_id, "a@example.com", "member", acct.account_id);
    expect(() => inviteSeat(acct.account_id, "b@example.com", "member", acct.account_id))
      .toThrow("Seat limit reached");
  });

  it("suite tier allows unlimited seats", () => {
    const acct = createAccount("Enterprise", "ent@example.com", "suite");
    for (let i = 0; i < 10; i++) {
      inviteSeat(acct.account_id, `user${i}@example.com`, "member", acct.account_id);
    }
    expect(getSeatCount(acct.account_id)).toBe(10);
  });

  it("accepts a seat invitation", () => {
    const acct = createAccount("Org", "org@example.com", "paid");
    const seat = inviteSeat(acct.account_id, "dev@example.com", "member", acct.account_id);
    expect(seat.accepted_at).toBeNull();

    const ok = acceptSeat(seat.seat_id);
    expect(ok).toBe(true);

    const seats = getActiveSeats(acct.account_id);
    expect(seats[0].accepted_at).toBeTruthy();
  });

  it("revokes a seat", () => {
    const acct = createAccount("Org", "org@example.com", "paid");
    const seat = inviteSeat(acct.account_id, "dev@example.com", "member", acct.account_id);

    const ok = revokeSeat(seat.seat_id);
    expect(ok).toBe(true);

    const active = getActiveSeats(acct.account_id);
    expect(active.length).toBe(0);

    const all = getAllSeats(acct.account_id);
    expect(all.length).toBe(1);
    expect(all[0].revoked_at).toBeTruthy();
  });

  it("finds seat by email", () => {
    const acct = createAccount("Org", "org@example.com", "paid");
    inviteSeat(acct.account_id, "dev@example.com", "member", acct.account_id);

    const found = getSeatByEmail(acct.account_id, "dev@example.com");
    expect(found).toBeTruthy();
    expect(found!.email).toBe("dev@example.com");

    expect(getSeatByEmail(acct.account_id, "nobody@example.com")).toBeUndefined();
  });

  it("seat invite fires funnel event", () => {
    const acct = createAccount("Org", "org@example.com", "paid");
    inviteSeat(acct.account_id, "dev@example.com", "member", acct.account_id);

    const events = getEventsByType(acct.account_id, "seat_invited");
    expect(events.length).toBe(1);
    expect(events[0].metadata.email).toBe("dev@example.com");
  });

  it("paid tier allows up to 5 seats", () => {
    const acct = createAccount("Org", "org@example.com", "paid");
    for (let i = 0; i < SEAT_LIMITS.paid; i++) {
      inviteSeat(acct.account_id, `user${i}@example.com`, "member", acct.account_id);
    }
    expect(getSeatCount(acct.account_id)).toBe(SEAT_LIMITS.paid);
    expect(() => inviteSeat(acct.account_id, "overflow@example.com", "member", acct.account_id))
      .toThrow("Seat limit reached");
  });
});

// ─── Funnel Events ──────────────────────────────────────────────

describe("Funnel Events", () => {
  it("tracks events with metadata", () => {
    const acct = createAccount("Alice", "alice@example.com");
    const event = trackEvent(acct.account_id, "account_created", "signup", { source: "web" });
    expect(event.event_id).toBeTruthy();
    expect(event.event_type).toBe("account_created");
    expect(event.stage).toBe("signup");
    expect(event.metadata.source).toBe("web");
  });

  it("retrieves events in reverse chronological order", () => {
    const acct = createAccount("Alice", "alice@example.com");
    trackEvent(acct.account_id, "account_created", "signup", {});
    trackEvent(acct.account_id, "first_snapshot", "activation", {});
    trackEvent(acct.account_id, "snapshot_created", "engagement", {});

    const events = getAccountEvents(acct.account_id);
    expect(events.length).toBe(3);
    expect(events[0].event_type).toBe("snapshot_created");
    expect(events[2].event_type).toBe("account_created");
  });

  it("gets latest event", () => {
    const acct = createAccount("Alice", "alice@example.com");
    trackEvent(acct.account_id, "account_created", "signup", {});
    trackEvent(acct.account_id, "snapshot_created", "activation", {});

    const latest = getLatestEvent(acct.account_id);
    expect(latest).toBeTruthy();
    expect(latest!.event_type).toBe("snapshot_created");
  });

  it("filters events by type", () => {
    const acct = createAccount("Alice", "alice@example.com");
    trackEvent(acct.account_id, "account_created", "signup", {});
    trackEvent(acct.account_id, "snapshot_created", "activation", {});
    trackEvent(acct.account_id, "snapshot_created", "engagement", {});

    const snapshotEvents = getEventsByType(acct.account_id, "snapshot_created");
    expect(snapshotEvents.length).toBe(2);
  });

  it("returns undefined for account with no events", () => {
    const acct = createAccount("Alice", "alice@example.com");
    expect(getLatestEvent(acct.account_id)).toBeUndefined();
    expect(getAccountEvents(acct.account_id)).toEqual([]);
  });
});

// ─── Stage Resolution ───────────────────────────────────────────

describe("Stage Resolution", () => {
  it("new free account is at signup stage", () => {
    const acct = createAccount("Alice", "alice@example.com");
    expect(resolveStage(acct.account_id)).toBe("signup");
  });

  it("returns visitor for unknown account", () => {
    expect(resolveStage("nonexistent")).toBe("visitor");
  });

  it("moves to activation after first snapshot", () => {
    const acct = createAccount("Alice", "alice@example.com");
    for (let i = 0; i < ACTIVATION_THRESHOLD; i++) {
      recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    expect(resolveStage(acct.account_id)).toBe("activation");
  });

  it("moves to engagement after threshold snapshots", () => {
    const acct = createAccount("Alice", "alice@example.com");
    for (let i = 0; i < ENGAGEMENT_THRESHOLD; i++) {
      recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    expect(resolveStage(acct.account_id)).toBe("engagement");
  });

  it("moves to limit_hit when quota exhausted", () => {
    const acct = createAccount("Alice", "alice@example.com");
    for (let i = 0; i < 10; i++) {
      recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    expect(resolveStage(acct.account_id)).toBe("limit_hit");
  });

  it("paid account is at conversion", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    expect(resolveStage(acct.account_id)).toBe("conversion");
  });

  it("suite account is at conversion", () => {
    const acct = createAccount("Corp", "corp@example.com", "suite");
    expect(resolveStage(acct.account_id)).toBe("conversion");
  });

  it("paid account with seats is at expansion", () => {
    const acct = createAccount("Org", "org@example.com", "paid");
    inviteSeat(acct.account_id, "dev@example.com", "member", acct.account_id);
    expect(resolveStage(acct.account_id)).toBe("expansion");
  });
});

// ─── Upgrade Prompts ────────────────────────────────────────────

describe("Upgrade Prompts", () => {
  it("returns null for suite users", () => {
    const acct = createAccount("Corp", "corp@example.com", "suite");
    expect(generateUpgradePrompt(acct.account_id)).toBeNull();
  });

  it("returns null for new free account (no usage)", () => {
    const acct = createAccount("Alice", "alice@example.com");
    // New signup — no snapshot usage, no prompt
    expect(generateUpgradePrompt(acct.account_id)).toBeNull();
  });

  it("returns activation prompt after first snapshot", () => {
    const acct = createAccount("Alice", "alice@example.com");
    recordUsage(acct.account_id, "search", "snap-1", 1, 1, 100);

    const prompt = generateUpgradePrompt(acct.account_id);
    expect(prompt).toBeTruthy();
    expect(prompt!.trigger).toBe("first_snapshot_completed");
    expect(prompt!.current_tier).toBe("free");
    expect(prompt!.recommended_tier).toBe("paid");
    expect(prompt!.urgency).toBe("low");
  });

  it("returns engagement prompt for active users", () => {
    const acct = createAccount("Alice", "alice@example.com");
    for (let i = 0; i < ENGAGEMENT_THRESHOLD; i++) {
      recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }

    const prompt = generateUpgradePrompt(acct.account_id);
    expect(prompt).toBeTruthy();
    expect(prompt!.trigger).toBe("active_user_value");
    expect(prompt!.urgency).toBe("medium");
    expect(prompt!.features_unlocked.length).toBeGreaterThan(0);
  });

  it("returns high-urgency limit prompt when quota exhausted", () => {
    const acct = createAccount("Alice", "alice@example.com");
    for (let i = 0; i < 10; i++) {
      recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }

    const prompt = generateUpgradePrompt(acct.account_id);
    expect(prompt).toBeTruthy();
    expect(prompt!.trigger).toBe("monthly_limit_reached");
    expect(prompt!.urgency).toBe("high");
    expect(prompt!.cta_label).toContain("Upgrade");
  });

  it("returns seat limit prompt for paid tier at capacity", () => {
    const acct = createAccount("Org", "org@example.com", "paid");
    for (let i = 0; i < SEAT_LIMITS.paid; i++) {
      inviteSeat(acct.account_id, `user${i}@example.com`, "member", acct.account_id);
    }

    const prompt = generateUpgradePrompt(acct.account_id);
    expect(prompt).toBeTruthy();
    expect(prompt!.trigger).toBe("seat_limit_reached");
    expect(prompt!.recommended_tier).toBe("suite");
    expect(prompt!.features_unlocked).toContain("Unlimited team seats");
  });

  it("returns null for paid tier with no pressure", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    // No snapshots, no seats filled — no upgrade pressure
    expect(generateUpgradePrompt(acct.account_id)).toBeNull();
  });

  it("returns null for unknown account", () => {
    expect(generateUpgradePrompt("nonexistent")).toBeNull();
  });
});

// ─── Funnel Metrics ─────────────────────────────────────────────

describe("Funnel Metrics", () => {
  it("computes metrics for empty system", () => {
    const metrics = getFunnelMetrics();
    expect(metrics.total_accounts).toBe(0);
    expect(metrics.conversion_rate).toBe(0);
    expect(metrics.activation_rate).toBe(0);
    expect(metrics.total_seats).toBe(0);
  });

  it("computes tier distribution", () => {
    createAccount("A", "a@example.com", "free");
    createAccount("B", "b@example.com", "free");
    createAccount("C", "c@example.com", "paid");
    createAccount("D", "d@example.com", "suite");

    const metrics = getFunnelMetrics();
    expect(metrics.total_accounts).toBe(4);
    expect(metrics.by_tier.free).toBe(2);
    expect(metrics.by_tier.paid).toBe(1);
    expect(metrics.by_tier.suite).toBe(1);
    expect(metrics.conversion_rate).toBe(0.5); // 2/4
  });

  it("counts active seats", () => {
    const acct = createAccount("Org", "org@example.com", "paid");
    inviteSeat(acct.account_id, "a@example.com", "member", acct.account_id);
    inviteSeat(acct.account_id, "b@example.com", "member", acct.account_id);
    const seat3 = inviteSeat(acct.account_id, "c@example.com", "member", acct.account_id);
    revokeSeat(seat3.seat_id);

    const metrics = getFunnelMetrics();
    expect(metrics.total_seats).toBe(2);
  });

  it("computes stage distribution", () => {
    const free1 = createAccount("A", "a@example.com", "free");
    const free2 = createAccount("B", "b@example.com", "free");
    createAccount("C", "c@example.com", "paid");

    // free1 has 1 snapshot → activation
    recordUsage(free1.account_id, "search", "snap-1", 1, 1, 100);
    // free2 has no usage → signup

    const metrics = getFunnelMetrics();
    expect(metrics.by_stage.signup).toBe(1);      // free2
    expect(metrics.by_stage.activation).toBe(1);   // free1
    expect(metrics.by_stage.conversion).toBe(1);   // paid
  });

  it("counts recent events", () => {
    const acct = createAccount("A", "a@example.com");
    trackEvent(acct.account_id, "account_created", "signup", {});
    trackEvent(acct.account_id, "snapshot_created", "activation", {});

    const metrics = getFunnelMetrics();
    expect(metrics.events_last_24h).toBe(2);
    expect(metrics.events_last_7d).toBe(2);
  });
});

// ─── Plan Catalog ───────────────────────────────────────────────

describe("Plan Catalog", () => {
  it("has 3 plans (free, pro, suite)", () => {
    expect(PLAN_CATALOG.length).toBe(3);
    expect(PLAN_CATALOG.map(p => p.id)).toEqual(["free", "paid", "suite"]);
  });

  it("free plan is $0", () => {
    const free = PLAN_CATALOG.find(p => p.id === "free")!;
    expect(free.price_monthly_cents).toBe(0);
    expect(free.price_annual_cents).toBe(0);
  });

  it("pro plan has a price", () => {
    const pro = PLAN_CATALOG.find(p => p.id === "paid")!;
    expect(pro.price_monthly_cents).toBe(2900);
    expect(pro.name).toBe("Pro");
  });

  it("suite plan is contact sales", () => {
    const suite = PLAN_CATALOG.find(p => p.id === "suite")!;
    expect(suite.price_monthly_cents).toBe(-1);
    expect(suite.name).toBe("Enterprise Suite");
  });

  it("feature comparison has entries for all tiers", () => {
    expect(PLAN_FEATURES.length).toBeGreaterThan(10);
    for (const feature of PLAN_FEATURES) {
      expect(feature).toHaveProperty("free");
      expect(feature).toHaveProperty("pro");
      expect(feature).toHaveProperty("suite");
    }
  });

  it("seat limits match tier expectations", () => {
    expect(SEAT_LIMITS.free).toBe(1);
    expect(SEAT_LIMITS.paid).toBe(5);
    expect(SEAT_LIMITS.suite).toBe(-1);
  });
});
