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
  | "cancellation_requested";

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
  pro: string | boolean | number;
  suite: string | boolean | number;
}

export interface PlanDefinition {
  id: BillingTier;
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
  paid: 5,        // small team
  suite: -1,      // unlimited (enterprise)
};

// ─── Plan Catalog ───────────────────────────────────────────────

export const PLAN_CATALOG: PlanDefinition[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Get started with core analysis tools — no credit card required",
    price_monthly_cents: 0,
    price_annual_cents: 0,
    highlights: [
      "3 core programs (Search, Skills, Debug)",
      "10 snapshots per month",
      "1 active project",
      "200 files per snapshot (5 MB max)",
      "API access with key",
      "CLI and web interface",
    ],
  },
  {
    id: "paid",
    name: "Pro",
    tagline: "Unlock the full toolkit for professional development teams",
    price_monthly_cents: 2900,       // $29/mo
    price_annual_cents: 27900,       // $279/yr ($23.25/mo effective)
    highlights: [
      "All 17 programs — pick what you need",
      "200 snapshots per month",
      "20 active projects",
      "2,000 files per snapshot (50 MB max)",
      "Team seats (up to 5)",
      "Priority support",
      "Saved history & automation",
      "Per-program billing — coming soon",
    ],
  },
  {
    id: "suite",
    name: "Enterprise Suite",
    tagline: "Full platform access with unlimited scale for engineering organizations",
    price_monthly_cents: -1,         // contact sales
    price_annual_cents: -1,
    highlights: [
      "All 17 programs — always on",
      "Unlimited snapshots & projects",
      "5,000 files per snapshot (100 MB max)",
      "Unlimited team seats",
      "Cross-program workflows",
      "Consolidated usage analytics",
      "Dedicated support & onboarding",
      "SSO & audit logs (roadmap)",
      "Custom integrations",
    ],
  },
];

export const PLAN_FEATURES: PlanFeature[] = [
  { name: "Programs available",    free: "3 core",             pro: "All 17 (pick & choose)", suite: "All 17 (always on)" },
  { name: "Snapshots per month",   free: 10,                   pro: 200,                      suite: "Unlimited" },
  { name: "Active projects",       free: 1,                    pro: 20,                       suite: "Unlimited" },
  { name: "Max files per snapshot", free: 200,                 pro: 2000,                     suite: 5000 },
  { name: "Max upload size",       free: "5 MB",               pro: "50 MB",                  suite: "100 MB" },
  { name: "Team seats",            free: 1,                    pro: 5,                        suite: "Unlimited" },
  { name: "API access",            free: true,                 pro: true,                     suite: true },
  { name: "CLI access",            free: true,                 pro: true,                     suite: true },
  { name: "GitHub URL intake",     free: true,                 pro: true,                     suite: true },
  { name: "Saved snapshot history", free: false,               pro: true,                     suite: true },
  { name: "Per-program billing",   free: false,                pro: "Coming soon",            suite: "Coming soon" },
  { name: "Cross-program workflows", free: false,              pro: false,                    suite: true },
  { name: "Consolidated analytics", free: false,               pro: false,                    suite: true },
  { name: "Priority support",      free: false,                pro: true,                     suite: "Dedicated" },
  { name: "SSO & audit logs",      free: false,                pro: false,                    suite: "Roadmap" },
];

// ─── Funnel Stage Progression Rules ─────────────────────────────

export const ACTIVATION_THRESHOLD = 1;    // snapshots to reach "activation"
export const ENGAGEMENT_THRESHOLD = 3;    // snapshots to reach "engagement"
export const CHURN_RISK_DAYS = 14;        // days of inactivity after engagement
