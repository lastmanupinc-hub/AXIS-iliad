import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import { getAccount, getMonthlySnapshotCount, getEntitlements } from "./billing-store.js";
import { TIER_LIMITS, ALL_PROGRAMS } from "./billing-types.js";
import type { BillingTier } from "./billing-types.js";
import type {
  Seat,
  SeatRole,
  FunnelEvent,
  FunnelEventType,
  FunnelStage,
  UpgradePrompt,
} from "./funnel-types.js";
import {
  SEAT_LIMITS,
  PLAN_CATALOG,
  ACTIVATION_THRESHOLD,
  ENGAGEMENT_THRESHOLD,
  CHURN_RISK_DAYS,
} from "./funnel-types.js";

// ─── Seats ──────────────────────────────────────────────────────

export function inviteSeat(
  account_id: string,
  email: string,
  role: SeatRole,
  invited_by: string,
): Seat {
  const account = getAccount(account_id);
  if (!account) throw new Error("Account not found");

  // Check seat limit
  const limit = SEAT_LIMITS[account.tier];
  if (limit !== -1) {
    const active = getActiveSeats(account_id);
    if (active.length >= limit) {
      throw new Error(`Seat limit reached (${limit} for ${account.tier} tier)`);
    }
  }

  const seat: Seat = {
    seat_id: randomUUID(),
    account_id,
    email,
    role,
    invited_by,
    accepted_at: null,
    revoked_at: null,
    created_at: new Date().toISOString(),
  };

  getDb().prepare(
    `INSERT INTO seats (seat_id, account_id, email, role, invited_by, accepted_at, revoked_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(seat.seat_id, seat.account_id, seat.email, seat.role, seat.invited_by, seat.accepted_at, seat.revoked_at, seat.created_at);

  trackEvent(account_id, "seat_invited", resolveStage(account_id), { email, role });
  return seat;
}

export function acceptSeat(seat_id: string): boolean {
  const result = getDb().prepare(
    "UPDATE seats SET accepted_at = ? WHERE seat_id = ? AND accepted_at IS NULL AND revoked_at IS NULL",
  ).run(new Date().toISOString(), seat_id);

  if (result.changes > 0) {
    const seat = getSeat(seat_id);
    if (seat) trackEvent(seat.account_id, "seat_accepted", resolveStage(seat.account_id), { email: seat.email });
  }
  return result.changes > 0;
}

export function revokeSeat(seat_id: string): boolean {
  const seat = getSeat(seat_id);
  const result = getDb().prepare(
    "UPDATE seats SET revoked_at = ? WHERE seat_id = ? AND revoked_at IS NULL",
  ).run(new Date().toISOString(), seat_id);

  if (result.changes > 0 && seat) {
    trackEvent(seat.account_id, "seat_removed", resolveStage(seat.account_id), { email: seat.email });
  }
  return result.changes > 0;
}

export function getSeat(seat_id: string): Seat | undefined {
  return getDb().prepare("SELECT * FROM seats WHERE seat_id = ?").get(seat_id) as Seat | undefined;
}

export function getActiveSeats(account_id: string): Seat[] {
  return getDb().prepare(
    "SELECT * FROM seats WHERE account_id = ? AND revoked_at IS NULL ORDER BY created_at",
  ).all(account_id) as Seat[];
}

export function getAllSeats(account_id: string): Seat[] {
  return getDb().prepare(
    "SELECT * FROM seats WHERE account_id = ? ORDER BY created_at DESC",
  ).all(account_id) as Seat[];
}

export function getSeatByEmail(account_id: string, email: string): Seat | undefined {
  return getDb().prepare(
    "SELECT * FROM seats WHERE account_id = ? AND email = ? AND revoked_at IS NULL",
  ).get(account_id, email) as Seat | undefined;
}

export function getSeatCount(account_id: string): number {
  const row = getDb().prepare(
    "SELECT COUNT(*) as count FROM seats WHERE account_id = ? AND revoked_at IS NULL",
  ).get(account_id) as { count: number };
  return row.count;
}

// ─── Funnel Event Tracking ──────────────────────────────────────

export function trackEvent(
  account_id: string,
  event_type: FunnelEventType,
  stage: FunnelStage,
  metadata: Record<string, unknown> = {},
): FunnelEvent {
  const event: FunnelEvent = {
    event_id: randomUUID(),
    account_id,
    event_type,
    stage,
    metadata,
    created_at: new Date().toISOString(),
  };

  getDb().prepare(
    `INSERT INTO funnel_events (event_id, account_id, event_type, stage, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(event.event_id, event.account_id, event.event_type, event.stage, JSON.stringify(event.metadata), event.created_at);

  return event;
}

export function getAccountEvents(account_id: string, limit = 50): FunnelEvent[] {
  const rows = getDb().prepare(
    "SELECT * FROM funnel_events WHERE account_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
  ).all(account_id, limit) as (Omit<FunnelEvent, "metadata"> & { metadata: string })[];

  return rows.map(r => ({ ...r, metadata: JSON.parse(r.metadata) }));
}

export function getLatestEvent(account_id: string): FunnelEvent | undefined {
  const row = getDb().prepare(
    "SELECT * FROM funnel_events WHERE account_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
  ).get(account_id) as (Omit<FunnelEvent, "metadata"> & { metadata: string }) | undefined;

  if (!row) return undefined;
  return { ...row, metadata: JSON.parse(row.metadata) };
}

export function getEventsByType(account_id: string, event_type: FunnelEventType): FunnelEvent[] {
  const rows = getDb().prepare(
    "SELECT * FROM funnel_events WHERE account_id = ? AND event_type = ? ORDER BY created_at DESC, rowid DESC",
  ).all(account_id, event_type) as (Omit<FunnelEvent, "metadata"> & { metadata: string })[];

  return rows.map(r => ({ ...r, metadata: JSON.parse(r.metadata) }));
}

// ─── Stage Resolution ───────────────────────────────────────────

/** Compute the current funnel stage for an account based on their history. */
export function resolveStage(account_id: string): FunnelStage {
  const account = getAccount(account_id);
  if (!account) return "visitor";

  // Check if they've upgraded
  if (account.tier === "paid" || account.tier === "suite") {
    // Check for expansion events (seats, programs added)
    const expansionEvents = getEventsByType(account_id, "seat_invited");
    const programEvents = getEventsByType(account_id, "program_added");
    if (expansionEvents.length > 0 || programEvents.length > 0) return "expansion";
    return "conversion";
  }

  // Free tier — check usage progression
  const snapshotCount = getMonthlySnapshotCount(account_id);
  const limits = TIER_LIMITS.free;

  // Check if they've hit limits
  if (snapshotCount >= limits.max_snapshots_per_month) return "limit_hit";

  // Check engagement threshold
  if (snapshotCount >= ENGAGEMENT_THRESHOLD) {
    // Check for churn risk — any activity in last N days?
    const latest = getLatestEvent(account_id);
    if (latest) {
      const daysSince = (Date.now() - new Date(latest.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince >= CHURN_RISK_DAYS) return "churn_risk";
    }
    return "engagement";
  }

  // Check activation
  if (snapshotCount >= ACTIVATION_THRESHOLD) return "activation";

  return "signup";
}

// ─── Upgrade Prompt Engine ──────────────────────────────────────

/** Generate a contextual upgrade prompt based on current usage and stage. */
export function generateUpgradePrompt(account_id: string): UpgradePrompt | null {
  const account = getAccount(account_id);
  if (!account) return null;

  // Suite users don't need upgrade prompts
  if (account.tier === "suite") return null;

  const stage = resolveStage(account_id);
  const snapshotCount = getMonthlySnapshotCount(account_id);
  const limits = TIER_LIMITS[account.tier];

  // Paid → Suite upgrade
  if (account.tier === "paid") {
    const seatCount = getSeatCount(account_id);
    const seatLimit = SEAT_LIMITS.paid;

    if (seatCount >= seatLimit) {
      return {
        trigger: "seat_limit_reached",
        current_tier: "paid",
        recommended_tier: "suite",
        headline: "Your team is growing",
        body: `You've filled all ${seatLimit} Pro seats. Upgrade to Enterprise Suite for unlimited seats and cross-program workflows.`,
        cta_label: "Contact Sales",
        cta_url: "/enterprise",
        features_unlocked: [
          "Unlimited team seats",
          "Unlimited snapshots & projects",
          "Cross-program workflows",
          "Consolidated analytics",
          "Dedicated support",
        ],
        urgency: "medium",
      };
    }

    if (limits.max_snapshots_per_month !== -1 && snapshotCount >= limits.max_snapshots_per_month * 0.8) {
      return {
        trigger: "snapshot_limit_approaching",
        current_tier: "paid",
        recommended_tier: "suite",
        headline: "Running hot this month",
        body: `You've used ${snapshotCount} of ${limits.max_snapshots_per_month} snapshots. Enterprise Suite removes all limits.`,
        cta_label: "Explore Enterprise",
        cta_url: "/enterprise",
        features_unlocked: [
          "Unlimited snapshots",
          "Unlimited projects",
          "5,000 files per snapshot",
          "Cross-program workflows",
        ],
        urgency: "medium",
      };
    }

    return null;
  }

  // Free → Pro upgrade prompts
  switch (stage) {
    case "limit_hit":
      return {
        trigger: "monthly_limit_reached",
        current_tier: "free",
        recommended_tier: "paid",
        headline: "You've hit your monthly limit",
        body: `You've used all ${limits.max_snapshots_per_month} free snapshots this month. Upgrade to Pro for 200 snapshots/month and access to all 17 programs.`,
        cta_label: "Upgrade to Pro — $29/mo",
        cta_url: "/upgrade?plan=pro",
        features_unlocked: [
          "200 snapshots per month",
          "All 17 programs",
          "20 active projects",
          "Team seats (up to 5)",
          "Priority support",
        ],
        urgency: "high",
      };

    case "engagement": {
      // They're active — show value-based prompt
      const usedPrograms = TIER_LIMITS.free.programs;
      const lockedPrograms = ALL_PROGRAMS.filter(p => !usedPrograms.includes(p));
      return {
        trigger: "active_user_value",
        current_tier: "free",
        recommended_tier: "paid",
        headline: "You're getting value — unlock more",
        body: `You've run ${snapshotCount} snapshots with ${usedPrograms.length} programs. Pro unlocks ${lockedPrograms.length} more programs including SEO, optimization, theme, and marketing tools.`,
        cta_label: "Try Pro — $29/mo",
        cta_url: "/upgrade?plan=pro",
        features_unlocked: lockedPrograms.slice(0, 5),
        urgency: "medium",
      };
    }

    case "activation":
      return {
        trigger: "first_snapshot_completed",
        current_tier: "free",
        recommended_tier: "paid",
        headline: "Nice first analysis!",
        body: "Your free plan includes Search, Skills, and Debug programs. Upgrade to Pro to unlock all 17 programs and deeper analysis.",
        cta_label: "See Pro Features",
        cta_url: "/plans",
        features_unlocked: [
          "All 17 programs",
          "200 snapshots/month",
          "20 projects",
        ],
        urgency: "low",
      };

    case "churn_risk":
      return {
        trigger: "inactivity_detected",
        current_tier: "free",
        recommended_tier: "paid",
        headline: "We miss you",
        body: "Your projects may have changed since your last analysis. Run a fresh snapshot to catch drift, or upgrade to Pro for automated monitoring.",
        cta_label: "Run a Snapshot",
        cta_url: "/",
        features_unlocked: [
          "Saved history",
          "Automation",
          "More programs",
        ],
        urgency: "low",
      };

    default:
      return null;
  }
}

// ─── Funnel Analytics ───────────────────────────────────────────

export interface FunnelMetrics {
  total_accounts: number;
  by_stage: Record<FunnelStage, number>;
  by_tier: Record<BillingTier, number>;
  conversion_rate: number;      // (paid + suite) / total
  activation_rate: number;      // activated / signups
  total_seats: number;
  events_last_24h: number;
  events_last_7d: number;
}

/** Compute aggregate funnel metrics across all accounts. */
export function getFunnelMetrics(): FunnelMetrics {
  const db = getDb();

  const totalRow = db.prepare("SELECT COUNT(*) as count FROM accounts").get() as { count: number };
  const total = totalRow.count;

  const tierRows = db.prepare(
    "SELECT tier, COUNT(*) as count FROM accounts GROUP BY tier",
  ).all() as { tier: BillingTier; count: number }[];

  const byTier: Record<BillingTier, number> = { free: 0, paid: 0, suite: 0 };
  for (const row of tierRows) byTier[row.tier] = row.count;

  const seatRow = db.prepare(
    "SELECT COUNT(*) as count FROM seats WHERE revoked_at IS NULL",
  ).get() as { count: number };

  const now = new Date();
  const day_ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const week_ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const events24h = db.prepare(
    "SELECT COUNT(*) as count FROM funnel_events WHERE created_at >= ?",
  ).get(day_ago) as { count: number };

  const events7d = db.prepare(
    "SELECT COUNT(*) as count FROM funnel_events WHERE created_at >= ?",
  ).get(week_ago) as { count: number };

  // Compute stage distribution — resolve stage for each account
  const accounts = db.prepare("SELECT account_id FROM accounts").all() as { account_id: string }[];
  const byStage: Record<FunnelStage, number> = {
    visitor: 0, signup: 0, activation: 0, engagement: 0,
    limit_hit: 0, upgrade_shown: 0, trial_start: 0,
    conversion: 0, expansion: 0, churn_risk: 0, churned: 0,
  };

  for (const { account_id } of accounts) {
    const stage = resolveStage(account_id);
    byStage[stage]++;
  }

  // Activation: any account past signup stage / total
  const activated = total - byStage.signup - byStage.visitor;
  const converted = byTier.paid + byTier.suite;

  return {
    total_accounts: total,
    by_stage: byStage,
    by_tier: byTier,
    conversion_rate: total > 0 ? converted / total : 0,
    activation_rate: total > 0 ? activated / total : 0,
    total_seats: seatRow.count,
    events_last_24h: events24h.count,
    events_last_7d: events7d.count,
  };
}
