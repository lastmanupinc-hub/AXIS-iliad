export type BillingTier = "free" | "paid" | "suite";

export interface ApiKey {
  key_id: string;
  /** The hashed key (SHA-256). Raw key is only returned on creation. */
  key_hash: string;
  account_id: string;
  label: string;
  created_at: string;
  revoked_at: string | null;
}

export interface Account {
  account_id: string;
  name: string;
  email: string;
  tier: BillingTier;
  created_at: string;
}

export interface ProgramEntitlement {
  account_id: string;
  program: string;
  enabled: boolean;
}

export interface UsageRecord {
  usage_id: string;
  account_id: string;
  program: string;
  snapshot_id: string;
  generators_run: number;
  input_files: number;
  input_bytes: number;
  created_at: string;
}

export interface UsageSummary {
  program: string;
  total_runs: number;
  total_generators: number;
  total_input_files: number;
  total_input_bytes: number;
}

/** Per-tier limits. -1 means unlimited. */
export interface TierLimits {
  max_snapshots_per_month: number;
  max_projects: number;
  max_file_size_bytes: number;
  max_files_per_snapshot: number;
  programs: string[];        // which programs are available
}

export const TIER_LIMITS: Record<BillingTier, TierLimits> = {
  free: {
    max_snapshots_per_month: 10,
    max_projects: 1,
    max_file_size_bytes: 5 * 1024 * 1024,      // 5 MB
    max_files_per_snapshot: 200,
    programs: ["search", "skills", "debug"],     // 3 free programs
  },
  paid: {
    max_snapshots_per_month: 200,
    max_projects: 20,
    max_file_size_bytes: 50 * 1024 * 1024,      // 50 MB
    max_files_per_snapshot: 2000,
    programs: [],                                 // governed by entitlements
  },
  suite: {
    max_snapshots_per_month: -1,
    max_projects: -1,
    max_file_size_bytes: 100 * 1024 * 1024,     // 100 MB
    max_files_per_snapshot: 5000,
    programs: [],                                 // all programs
  },
};

export const ALL_PROGRAMS = [
  "search", "debug", "skills", "frontend", "seo",
  "optimization", "theme", "brand", "superpowers",
  "marketing", "notebook", "obsidian", "mcp",
  "artifacts", "remotion", "canvas", "algorithmic",
] as const;

export type ProgramName = typeof ALL_PROGRAMS[number];

// ─── Persistence Add-On (metered, purchasable on top of paid/suite) ──────────

/** Operations that consume persistence credits. */
export type PersistenceOp =
  | "save_version"          // store a generation output version (2 credits)
  | "diff_versions"         // diff two versions of the same snapshot (1 credit)
  | "cross_snapshot_diff";  // diff outputs across two different snapshots (5 credits)

/** Credit cost per operation. */
export const PERSISTENCE_CREDIT_COSTS: Record<PersistenceOp, number> = {
  save_version: 2,
  diff_versions: 1,
  cross_snapshot_diff: 5,
};

/** Pre-defined credit packs available for purchase. */
export const PERSISTENCE_CREDIT_PACKS = [
  { pack_id: "pack_100",  credits: 100,  price_cents: 500  },  // $5
  { pack_id: "pack_500",  credits: 500,  price_cents: 2000 },  // $20
  { pack_id: "pack_2000", credits: 2000, price_cents: 6000 },  // $60
] as const;

export type PersistencePackId = typeof PERSISTENCE_CREDIT_PACKS[number]["pack_id"];

/** A ledger entry: either a purchase/grant (positive delta) or an operation spend (negative). */
export interface PersistenceCreditRecord {
  credit_id: string;
  account_id: string;
  /** Positive = credits added, negative = credits spent. */
  credits_delta: number;
  operation: PersistenceOp | "purchase" | "suite_monthly_grant";
  snapshot_id: string | null;
  balance_after: number;
  created_at: string;
}

/** Minimum tier required to access persistence at all. */
export const PERSISTENCE_MIN_TIER: BillingTier = "paid";

/** Monthly persistence credits automatically granted to suite accounts. */
export const SUITE_MONTHLY_PERSISTENCE_CREDITS = 500;
