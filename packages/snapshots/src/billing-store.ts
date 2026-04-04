import { randomUUID, createHash } from "node:crypto";
import { getDb } from "./db.js";
import type {
  Account,
  ApiKey,
  BillingTier,
  ProgramEntitlement,
  UsageRecord,
  UsageSummary,
  TierLimits,
} from "./billing-types.js";
import { TIER_LIMITS, ALL_PROGRAMS } from "./billing-types.js";

// ─── Helpers ────────────────────────────────────────────────────

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRawKey(): string {
  // axis_xxxxxxxxxxxxxxxxxxxxxxxxxxxx (32 random hex chars)
  return `axis_${randomUUID().replace(/-/g, "")}`;
}

// ─── Accounts ───────────────────────────────────────────────────

export function createAccount(name: string, email: string, tier: BillingTier = "free"): Account {
  const account: Account = {
    account_id: randomUUID(),
    name,
    email,
    tier,
    created_at: new Date().toISOString(),
  };

  getDb().prepare(
    "INSERT INTO accounts (account_id, name, email, tier, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(account.account_id, account.name, account.email, account.tier, account.created_at);

  // For suite tier, enable all programs
  if (tier === "suite") {
    for (const program of ALL_PROGRAMS) {
      enableProgram(account.account_id, program);
    }
  }

  return account;
}

export function getAccount(account_id: string): Account | undefined {
  return getDb().prepare("SELECT * FROM accounts WHERE account_id = ?").get(account_id) as Account | undefined;
}

export function getAccountByEmail(email: string): Account | undefined {
  return getDb().prepare("SELECT * FROM accounts WHERE email = ?").get(email) as Account | undefined;
}

export function updateAccountTier(account_id: string, tier: BillingTier): boolean {
  const result = getDb().prepare("UPDATE accounts SET tier = ? WHERE account_id = ?").run(tier, account_id);
  if (result.changes > 0 && tier === "suite") {
    for (const program of ALL_PROGRAMS) {
      enableProgram(account_id, program);
    }
  }
  return result.changes > 0;
}

// ─── API Keys ───────────────────────────────────────────────────

/** Creates a new API key. Returns the key record AND the raw key (only time it's available). */
export function createApiKey(account_id: string, label: string = ""): { apiKey: ApiKey; rawKey: string } {
  const rawKey = generateRawKey();
  const apiKey: ApiKey = {
    key_id: randomUUID(),
    key_hash: hashKey(rawKey),
    account_id,
    label,
    created_at: new Date().toISOString(),
    revoked_at: null,
  };

  getDb().prepare(
    "INSERT INTO api_keys (key_id, key_hash, account_id, label, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(apiKey.key_id, apiKey.key_hash, apiKey.account_id, apiKey.label, apiKey.created_at, apiKey.revoked_at);

  return { apiKey, rawKey };
}

/** Lookup an account by raw API key. Returns undefined if key is invalid or revoked. */
export function resolveApiKey(rawKey: string): { apiKey: ApiKey; account: Account } | undefined {
  const hash = hashKey(rawKey);
  const row = getDb().prepare(
    "SELECT k.*, a.name as account_name, a.email, a.tier, a.created_at as account_created_at FROM api_keys k JOIN accounts a ON k.account_id = a.account_id WHERE k.key_hash = ? AND k.revoked_at IS NULL",
  ).get(hash) as (ApiKey & { account_name: string; email: string; tier: BillingTier; account_created_at: string }) | undefined;

  if (!row) return undefined;

  const apiKey: ApiKey = {
    key_id: row.key_id,
    key_hash: row.key_hash,
    account_id: row.account_id,
    label: row.label,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
  };

  const account: Account = {
    account_id: row.account_id,
    name: row.account_name,
    email: row.email,
    tier: row.tier,
    created_at: row.account_created_at,
  };

  return { apiKey, account };
}

export function revokeApiKey(key_id: string): boolean {
  const result = getDb().prepare("UPDATE api_keys SET revoked_at = ? WHERE key_id = ?").run(new Date().toISOString(), key_id);
  return result.changes > 0;
}

export function listApiKeys(account_id: string): ApiKey[] {
  return getDb().prepare("SELECT * FROM api_keys WHERE account_id = ? ORDER BY created_at DESC").all(account_id) as ApiKey[];
}

// ─── Program Entitlements ───────────────────────────────────────

export function enableProgram(account_id: string, program: string): void {
  getDb().prepare(
    "INSERT OR REPLACE INTO program_entitlements (account_id, program, enabled) VALUES (?, ?, 1)",
  ).run(account_id, program);
}

export function disableProgram(account_id: string, program: string): void {
  getDb().prepare(
    "INSERT OR REPLACE INTO program_entitlements (account_id, program, enabled) VALUES (?, ?, 0)",
  ).run(account_id, program);
}

export function getEntitlements(account_id: string): ProgramEntitlement[] {
  return getDb().prepare(
    "SELECT * FROM program_entitlements WHERE account_id = ? AND enabled = 1",
  ).all(account_id) as ProgramEntitlement[];
}

export function isProgramEnabled(account_id: string, program: string): boolean {
  const account = getAccount(account_id);
  if (!account) return false;

  const limits = TIER_LIMITS[account.tier];

  // Suite tier: all programs enabled
  if (account.tier === "suite") return true;

  // Free tier: check built-in programs
  if (account.tier === "free") {
    return limits.programs.includes(program);
  }

  // Paid tier: check entitlements table
  const row = getDb().prepare(
    "SELECT enabled FROM program_entitlements WHERE account_id = ? AND program = ?",
  ).get(account_id, program) as { enabled: number } | undefined;

  return row?.enabled === 1;
}

// ─── Usage Tracking ─────────────────────────────────────────────

export function recordUsage(
  account_id: string,
  program: string,
  snapshot_id: string,
  generators_run: number,
  input_files: number,
  input_bytes: number,
): UsageRecord {
  const record: UsageRecord = {
    usage_id: randomUUID(),
    account_id,
    program,
    snapshot_id,
    generators_run,
    input_files,
    input_bytes,
    created_at: new Date().toISOString(),
  };

  getDb().prepare(
    `INSERT INTO usage_records (usage_id, account_id, program, snapshot_id, generators_run, input_files, input_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.usage_id, record.account_id, record.program, record.snapshot_id,
    record.generators_run, record.input_files, record.input_bytes, record.created_at,
  );

  return record;
}

export function getUsageSummary(account_id: string, since?: string): UsageSummary[] {
  const query = since
    ? "SELECT program, COUNT(*) as total_runs, SUM(generators_run) as total_generators, SUM(input_files) as total_input_files, SUM(input_bytes) as total_input_bytes FROM usage_records WHERE account_id = ? AND created_at >= ? GROUP BY program"
    : "SELECT program, COUNT(*) as total_runs, SUM(generators_run) as total_generators, SUM(input_files) as total_input_files, SUM(input_bytes) as total_input_bytes FROM usage_records WHERE account_id = ? GROUP BY program";

  const params = since ? [account_id, since] : [account_id];
  return getDb().prepare(query).all(...params) as UsageSummary[];
}

export function getMonthlySnapshotCount(account_id: string): number {
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);
  const since = firstOfMonth.toISOString();

  const row = getDb().prepare(
    "SELECT COUNT(DISTINCT snapshot_id) as count FROM usage_records WHERE account_id = ? AND created_at >= ?",
  ).get(account_id, since) as { count: number };

  return row.count;
}

export function getProjectCount(account_id: string): number {
  // Count projects from snapshots linked to this account's usage
  const row = getDb().prepare(
    `SELECT COUNT(DISTINCT s.project_id) as count
     FROM usage_records u
     JOIN snapshots s ON u.snapshot_id = s.snapshot_id
     WHERE u.account_id = ?`,
  ).get(account_id) as { count: number };

  return row.count;
}

// ─── Quota Enforcement ──────────────────────────────────────────

export interface QuotaCheck {
  allowed: boolean;
  reason?: string;
  tier: BillingTier;
  limits: TierLimits;
  usage: { snapshots_this_month: number; project_count: number };
}

export function checkQuota(account_id: string): QuotaCheck {
  const account = getAccount(account_id);
  if (!account) {
    return {
      allowed: false,
      reason: "Account not found",
      tier: "free",
      limits: TIER_LIMITS.free,
      usage: { snapshots_this_month: 0, project_count: 0 },
    };
  }

  const limits = TIER_LIMITS[account.tier];
  const snapshotsThisMonth = getMonthlySnapshotCount(account_id);
  const projectCount = getProjectCount(account_id);

  const usage = { snapshots_this_month: snapshotsThisMonth, project_count: projectCount };

  if (limits.max_snapshots_per_month !== -1 && snapshotsThisMonth >= limits.max_snapshots_per_month) {
    return { allowed: false, reason: `Monthly snapshot limit reached (${limits.max_snapshots_per_month})`, tier: account.tier, limits, usage };
  }

  if (limits.max_projects !== -1 && projectCount >= limits.max_projects) {
    return { allowed: false, reason: `Project limit reached (${limits.max_projects})`, tier: account.tier, limits, usage };
  }

  return { allowed: true, tier: account.tier, limits, usage };
}
