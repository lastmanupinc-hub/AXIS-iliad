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

/**
 * Canonical email form: trimmed + lowercased.
 *
 * Payment processors (PAI'D/Stripe) may normalize customer_email casing in
 * webhook echoes, so emails are stored lowercase and looked up
 * case-insensitively — otherwise a charged customer whose account email was
 * typed with mixed case would never be tier-synced.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ─── Accounts ───────────────────────────────────────────────────

export function createAccount(name: string, email: string, tier: BillingTier = "free"): Account {
  const account: Account = {
    account_id: randomUUID(),
    name,
    email: normalizeEmail(email),
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
  // COLLATE NOCASE also matches legacy rows stored before emails were
  // normalized to lowercase (migration 22 rewrites them, but skips rows
  // whose lowercase form collides with another account).
  return getDb().prepare("SELECT * FROM accounts WHERE email = ? COLLATE NOCASE").get(normalizeEmail(email)) as Account | undefined;
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

// ─── Admin queries (cross-account) ──────────────────────────────

export interface SystemStats {
  total_accounts: number;
  accounts_by_tier: Record<BillingTier, number>;
  total_snapshots: number;
  total_projects: number;
  total_usage_records: number;
  total_api_keys: number;
  active_api_keys: number;
}

export interface ApiEndpointUsage {
  method: string;
  path: string;
  calls: number;
  last_called_at: string;
}

export interface ApiStatusUsage {
  status_bucket: string;
  calls: number;
}

export interface AccountApiAnalyticsSummary {
  account_id: string;
  since: string;
  total_calls: number;
  calls_last_24h: number;
  calls_last_7d: number;
  by_endpoint: ApiEndpointUsage[];
  by_status: ApiStatusUsage[];
}

function normalizeApiPath(path: string): string {
  const base = path.split("?")[0];
  return base
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+\b/g, "/:id");
}

export function recordApiCall(
  account_id: string,
  method: string,
  path: string,
  status_code: number,
): void {
  getDb().prepare(
    `INSERT INTO account_api_calls (call_id, account_id, method, path, status_code, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    account_id,
    method,
    normalizeApiPath(path),
    status_code,
    new Date().toISOString(),
  );
}

export function getApiCallSummary(
  account_id: string,
  since: string,
  limit = 100,
): AccountApiAnalyticsSummary {
  const db = getDb();
  const totalRow = db.prepare(
    "SELECT COUNT(*) as c FROM account_api_calls WHERE account_id = ? AND created_at >= ?",
  ).get(account_id, since) as { c: number };

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const calls24hRow = db.prepare(
    "SELECT COUNT(*) as c FROM account_api_calls WHERE account_id = ? AND created_at >= ?",
  ).get(account_id, since24h) as { c: number };

  const calls7dRow = db.prepare(
    "SELECT COUNT(*) as c FROM account_api_calls WHERE account_id = ? AND created_at >= ?",
  ).get(account_id, since7d) as { c: number };

  const byEndpoint = db.prepare(
    `SELECT method, path, COUNT(*) as calls, MAX(created_at) as last_called_at
     FROM account_api_calls
     WHERE account_id = ? AND created_at >= ?
     GROUP BY method, path
     ORDER BY calls DESC, last_called_at DESC
     LIMIT ?`,
  ).all(account_id, since, Math.max(1, limit)) as ApiEndpointUsage[];

  const byStatus = db.prepare(
    `SELECT
       CASE
         WHEN status_code >= 200 AND status_code < 300 THEN '2xx'
         WHEN status_code >= 300 AND status_code < 400 THEN '3xx'
         WHEN status_code >= 400 AND status_code < 500 THEN '4xx'
         WHEN status_code >= 500 THEN '5xx'
         ELSE 'other'
       END as status_bucket,
       COUNT(*) as calls
     FROM account_api_calls
     WHERE account_id = ? AND created_at >= ?
     GROUP BY status_bucket
     ORDER BY calls DESC`,
  ).all(account_id, since) as ApiStatusUsage[];

  return {
    account_id,
    since,
    total_calls: totalRow.c,
    calls_last_24h: calls24hRow.c,
    calls_last_7d: calls7dRow.c,
    by_endpoint: byEndpoint,
    by_status: byStatus,
  };
}

export function getSystemStats(): SystemStats {
  const db = getDb();
  const accountRow = db.prepare(
    "SELECT COUNT(*) as total, SUM(CASE WHEN tier='free' THEN 1 ELSE 0 END) as free_count, SUM(CASE WHEN tier='paid' THEN 1 ELSE 0 END) as paid_count, SUM(CASE WHEN tier='suite' THEN 1 ELSE 0 END) as suite_count FROM accounts",
  ).get() as { total: number; free_count: number; paid_count: number; suite_count: number };

  const snapCount = (db.prepare("SELECT COUNT(*) as c FROM snapshots").get() as { c: number }).c;
  const projCount = (db.prepare("SELECT COUNT(DISTINCT project_id) as c FROM snapshots").get() as { c: number }).c;
  const usageCount = (db.prepare("SELECT COUNT(*) as c FROM usage_records").get() as { c: number }).c;
  const keyTotals = db.prepare(
    "SELECT COUNT(*) as total, SUM(CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END) as active FROM api_keys",
  ).get() as { total: number; active: number };

  return {
    total_accounts: accountRow.total,
    accounts_by_tier: {
      free: accountRow.free_count ?? 0,
      paid: accountRow.paid_count ?? 0,
      suite: accountRow.suite_count ?? 0,
    },
    total_snapshots: snapCount,
    total_projects: projCount,
    total_usage_records: usageCount,
    total_api_keys: keyTotals.total,
    active_api_keys: keyTotals.active ?? 0,
  };
}

export interface AccountSummary {
  account_id: string;
  name: string;
  email: string;
  tier: BillingTier;
  created_at: string;
  snapshot_count: number;
  project_count: number;
}

export function listAllAccounts(limit = 100, offset = 0): { accounts: AccountSummary[]; total: number } {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as c FROM accounts").get() as { c: number }).c;

  const rows = db.prepare(`
    SELECT a.account_id, a.name, a.email, a.tier, a.created_at,
      (SELECT COUNT(*) FROM snapshots s JOIN (SELECT DISTINCT project_id FROM snapshots) p ON s.project_id = p.project_id WHERE EXISTS (SELECT 1 FROM usage_records u WHERE u.account_id = a.account_id AND u.snapshot_id = s.snapshot_id)) as snapshot_count,
      (SELECT COUNT(DISTINCT u.snapshot_id) FROM usage_records u WHERE u.account_id = a.account_id) as project_count
    FROM accounts a
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as AccountSummary[];

  return { accounts: rows, total };
}

export interface RecentActivity {
  event_id: string;
  account_id: string;
  event_type: string;
  stage: string;
  created_at: string;
}

export function getRecentActivity(limit = 50): RecentActivity[] {
  const db = getDb();
  return db.prepare(
    "SELECT event_id, account_id, event_type, stage, created_at FROM funnel_events ORDER BY created_at DESC LIMIT ?",
  ).all(limit) as RecentActivity[];
}
