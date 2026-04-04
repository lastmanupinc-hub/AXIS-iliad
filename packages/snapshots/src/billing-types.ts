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
