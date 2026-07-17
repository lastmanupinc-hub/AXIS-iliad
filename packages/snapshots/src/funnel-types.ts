import type { BillingTier, ProgramName } from "./billing-types.js";

// ─── Funnel Event Tracking ──────────────────────────────────────

export type FunnelStage =
  | "visitor"           // landed on site, no account
  | "signup"            // created free account
  | "activation"        // ran first snapshot
  | "engagement"        // ran 3+ snapshots
  | "limit_hit"         // hit free-tier quota wall
  | "upgrade_shown"     // saw upgrade prompt
  | "trial_start"       // started paid trial (if applicable)
  | "conversion"        // upgraded to paid or suite
  | "expansion"         // added seats or programs
  | "churn_risk"        // no activity in 14+ days after engagement
  | "churned";          // downgraded or deleted

export type FunnelEventType =
  | "account_created"
  | "first_snapshot"
  | "snapshot_created"
  | "limit_reached"
  | "upgrade_prompt_shown"
  | "upgrade_prompt_dismissed"
  | "upgrade_completed"
  | "downgrade_completed"
  | "program_added"
  | "program_removed"
  | "seat_invited"
  | "seat_accepted"
  | "seat_removed"
  | "api_key_created"
  | "trial_started"
  | "trial_expired"
  | "checkout_started"
  | "cancellation_requested"
  // Agentic-asset program (WO-01..09): compounding-value KPI events.
  | "delta_generated"
  | "persistence_metered"
  | "funnel_personalized"
  | "watchtower_delta"
  | "memory_written"
  | "memory_woven"
  | "fleet_viewed"
  // Dispute lifecycle (WO-08): Stripe charge.dispute.* / radar EFW webhooks.
  | "dispute_opened"
  | "dispute_closed"
  | "early_fraud_warning"
  // Account lifecycle (WO-A5): PATCH/DELETE /v1/account audit trail.
  | "account_profile_updated"
  | "account_deleted";

export interface FunnelEvent {
  event_id: string;
  account_id: string;
  event_type: FunnelEventType;
  stage: FunnelStage;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── Enterprise Seats ───────────────────────────────────────────

export type SeatRole = "owner" | "admin" | "member" | "viewer";

export interface Seat {
  seat_id: string;
  account_id: string;       // the org/enterprise account
  email: string;
  role: SeatRole;
  invited_by: string;       // account_id of inviter
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

// ─── Plan Definitions (pricing/feature matrix) ──────────────────

export interface PlanFeature {
  name: string;
  free: string | boolean | number;
  starter: string | boolean | number;
  pro: string | boolean | number;
  growth: string | boolean | number;
  enterprise: string | boolean | number;
}

export type PlanId = "free" | "starter" | "pro" | "growth" | "enterprise";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  price_monthly_cents: number;   // 0 = free, -1 = contact sales
  price_annual_cents: number;    // annual price (per year), -1 = contact
  highlights: string[];
}

export interface UpgradePrompt {
  trigger: string;               // what triggered the prompt
  current_tier: BillingTier;
  recommended_tier: BillingTier;
  headline: string;
  body: string;
  cta_label: string;
  cta_url: string;
  features_unlocked: string[];
  urgency: "low" | "medium" | "high";
}

// ─── Seat Limits ────────────────────────────────────────────────

export const SEAT_LIMITS: Record<BillingTier, number> = {
  free: 1,        // solo only
  paid: 5,        // small team (Starter's advertised count — Pro's is higher, see resolveSeatLimit)
  suite: -1,      // unlimited (enterprise)
};

/**
 * The actual seat cap for a "paid"-tier account, matching PLAN_FEATURES's
 * publicly advertised "Team seats" row (starter:5, pro:10) instead of
 * SEAT_LIMITS.paid's single coarse number. Starter and Pro both collapse
 * into BillingTier "paid", so SEAT_LIMITS.paid alone caps every Pro
 * subscriber at Starter's 5-seat count — a real Pro subscriber was capped at
 * half their advertised 10 seats (H-Phase-A cycle 3). suite/free are NOT
 * routed through PLAN_FEATURES here: suite is intentionally unlimited
 * (SEAT_LIMITS.suite = -1, matching this codebase's existing "suite =
 * enterprise" tested behavior) even though PLAN_FEATURES' "growth" column
 * separately advertises a 25-seat figure for the (distinct, non-enterprise)
 * Growth marketing plan — collapsing that into a hard suite-tier cap would
 * be a real behavior regression, not a bug fix, so it's left alone.
 */
export function resolveSeatLimit(tier: BillingTier, paidPlanId: string | null | undefined): number {
  if (tier !== "paid") return SEAT_LIMITS[tier];
  const row = PLAN_FEATURES.find((f) => f.name === "Team seats");
  const val = row?.[paidPlanId === "pro" ? "pro" : "starter"];
  return typeof val === "number" ? val : SEAT_LIMITS.paid;
}

// ─── Plan Catalog ───────────────────────────────────────────────
// Program totals in the copy below ("All N programs") are pinned — this package
// cannot import @axis/generator-core (it depends on us). apps/api's
// count-honesty.test.ts parses this file and fails CI if they drift from
// TOTAL_PROGRAMS.

export const PLAN_CATALOG: PlanDefinition[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Core files and evaluation tier — no credit card required",
    price_monthly_cents: 0,
    price_annual_cents: 0,
    highlights: [
      "10,000 monthly credits",
      "3 core programs (Search, Skills, Debug)",
      "Best for evaluation and trials",
      "Core outputs stay free",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "Best for solo builders and small agent workflows",
    price_monthly_cents: 2900,
    price_annual_cents: 27840,
    highlights: [
      "75,000 monthly credits",
      "All 20 programs",
      "Overage at $0.0018 per credit",
      "Annual billing saves 20%",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Higher credits for teams that ship frequently",
    price_monthly_cents: 9900,
    price_annual_cents: 95040,
    highlights: [
      "300,000 monthly credits",
      "All 20 programs",
      "Overage at $0.0018 per credit",
      "Annual billing saves 20%",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "For production teams and heavy usage",
    price_monthly_cents: 29900,
    price_annual_cents: 287040,
    highlights: [
      "1,200,000 monthly credits",
      "All 20 programs",
      "Overage at $0.0018 per credit",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Custom contracts, security review, and volume pricing",
    price_monthly_cents: -1,
    price_annual_cents: -1,
    highlights: [
      "Custom credits and limits",
      "Dedicated support and onboarding",
      "Security review and custom terms",
    ],
  },
];

export const PLAN_FEATURES: PlanFeature[] = [
  { name: "Monthly credits", free: 10000, starter: 75000, pro: 300000, growth: 1200000, enterprise: "Custom" },
  { name: "Programs available", free: "3 core", starter: "All 20", pro: "All 20", growth: "All 20", enterprise: "All 20" },
  { name: "Overage", free: "$0.0018 / credit", starter: "$0.0018 / credit", pro: "$0.0018 / credit", growth: "$0.0018 / credit", enterprise: "Custom" },
  { name: "Annual savings", free: false, starter: "20%", pro: "20%", growth: "20%", enterprise: "Custom" },
  { name: "Team seats", free: 1, starter: 5, pro: 10, growth: 25, enterprise: "Unlimited" },
  { name: "Saved history", free: false, starter: true, pro: true, growth: true, enterprise: true },
  { name: "Priority support", free: false, starter: false, pro: true, growth: true, enterprise: "Dedicated" },
  { name: "SSO & audit logs", free: false, starter: false, pro: false, growth: true, enterprise: true },
  { name: "Custom terms", free: false, starter: false, pro: false, growth: false, enterprise: true },
];

// ─── Funnel Stage Progression Rules ─────────────────────────────

export const ACTIVATION_THRESHOLD = 1;    // snapshots to reach "activation"
export const ENGAGEMENT_THRESHOLD = 3;    // snapshots to reach "engagement"
export const CHURN_RISK_DAYS = 14;        // days of inactivity after engagement
