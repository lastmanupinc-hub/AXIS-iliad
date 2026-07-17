import { randomUUID, createHash } from "node:crypto";
import { sql, pgPlaceholders } from "./pg.js";
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

export async function createAccount(name: string, email: string, tier: BillingTier = "free"): Promise<Account> {
  const account: Account = {
    account_id: randomUUID(),
    name,
    email: normalizeEmail(email),
    tier,
    created_at: new Date().toISOString(),
  };

  await sql.run(
    "INSERT INTO accounts (account_id, name, email, tier, created_at) VALUES (?, ?, ?, ?, ?)",
    [account.account_id, account.name, account.email, account.tier, account.created_at],
  );

  // For suite tier, enable all programs
  if (tier === "suite") {
    for (const program of ALL_PROGRAMS) {
      await enableProgram(account.account_id, program);
    }
  }

  return account;
}

export async function getAccount(account_id: string): Promise<Account | undefined> {
  return await sql.one<Account>("SELECT * FROM accounts WHERE account_id = ?", [account_id]);
}

export async function getAccountByEmail(email: string): Promise<Account | undefined> {
  // Match case-insensitively via lower(email) (backed by idx_accounts_email_lower).
  // The input is already normalized to lowercase; comparing lower(email) also
  // matches any legacy rows stored before emails were normalized to lowercase.
  return await sql.one<Account>(
    "SELECT * FROM accounts WHERE lower(email) = ?",
    [normalizeEmail(email)],
  );
}

/**
 * PATCH /v1/account (WO-A5). Returns the updated account, or "email_taken"
 * if another account already owns the normalized target email (the UNIQUE
 * constraint would otherwise surface as a raw DB error). No email-verification
 * step exists in this system (Honesty H1 — no password/verification infra),
 * so a change takes effect immediately; the caller (handlePatchAccount)
 * is expected to write an audit funnel_events row.
 */
export async function updateAccountProfile(
  account_id: string,
  updates: { name?: string; email?: string },
): Promise<{ account: Account; nameChanged: boolean; emailChanged: boolean } | "email_taken" | "not_found"> {
  const existing = await getAccount(account_id);
  if (!existing) return "not_found";

  const nextName = updates.name !== undefined ? updates.name : existing.name;
  const nextEmail = updates.email !== undefined ? normalizeEmail(updates.email) : existing.email;
  const nameChanged = nextName !== existing.name;
  const emailChanged = nextEmail !== existing.email;

  if (emailChanged) {
    const owner = await getAccountByEmail(nextEmail);
    if (owner && owner.account_id !== account_id) return "email_taken";
  }

  if (nameChanged || emailChanged) {
    await sql.run("UPDATE accounts SET name = ?, email = ? WHERE account_id = ?", [nextName, nextEmail, account_id]);
  }

  return { account: { ...existing, name: nextName, email: nextEmail }, nameChanged, emailChanged };
}

/**
 * DELETE /v1/account (WO-A5) — retention policy (documented here since this
 * is the one place it can never silently drift from what actually runs):
 *
 * HARD-DELETED (access surfaces + user-generated content — no legal/financial
 * retention need): API keys, OAuth sessions (auth codes/refresh/access
 * tokens), GitHub tokens, seats, program entitlements, webhooks + their
 * delivery logs, the account's free-scrape quota counter, and every project/
 * snapshot the account owns (+ all snapshot-derived data: context maps, repo
 * profiles, generator results, generation versions, project memory, search
 * index, code symbols) — mirrors deleteProject/deleteSnapshot's existing
 * per-table list so this can't drift from those independently-reviewed
 * cascades.
 *
 * DELIBERATELY RETAINED, untouched (financial/audit records — a paying
 * customer's billing history, ledger entries, and dispute evidence must
 * survive account deletion for accounting/tax/chargeback-defense purposes;
 * none of this is exposed by any authenticated read once the account itself
 * is anonymized below): usage_records, tier_changes, persistence_credits,
 * lemon_squeezy_subscriptions, stripe_subscriptions, referral_codes/
 * referral_conversions/referral_credits, account_api_calls,
 * usage_credit_monthly/usage_credit_ledger, credit_pack_purchases,
 * payment_receipts, disputes, compensation_ledger, mcp_usage,
 * idempotency_keys, funnel_events (the pre-existing history, plus this
 * deletion's own audit entry, written by the caller after this resolves).
 *
 * The `accounts` row itself is NEVER deleted (all of the above RETAINED
 * tables carry a real FK to it) — it is anonymized in place (name + email
 * scrubbed to a tombstone value) so it can no longer authenticate or be
 * found by the former owner's email, while remaining a valid FK anchor.
 * This is a v1, no-grace-period policy: everything hard-deleted above is
 * gone the instant this call returns, matching the plan's own
 * recommendation (hard-delete, 0-day grace) for projects/snapshots,
 * extended here to the rest of the access-surface list on the same
 * reasoning — none of it has a retention requirement, so a grace/undo
 * window would only be product polish, not a data-safety necessity.
 */
export async function deleteAccount(account_id: string): Promise<{ deleted: boolean; projects_deleted: number }> {
  const existing = await getAccount(account_id);
  if (!existing) return { deleted: false, projects_deleted: 0 };

  const projects = await sql.many<{ project_id: string }>(
    "SELECT project_id FROM projects WHERE account_id = ?",
    [account_id],
  );
  const snapshots = await sql.many<{ snapshot_id: string }>(
    "SELECT snapshot_id FROM snapshots WHERE account_id = ?",
    [account_id],
  );

  await sql.tx(async (client) => {
    for (const { snapshot_id } of snapshots) {
      await client.query(pgPlaceholders("DELETE FROM search_index WHERE snapshot_id = ?"), [snapshot_id]);
      await client.query(pgPlaceholders("DELETE FROM code_symbols WHERE snapshot_id = ?"), [snapshot_id]);
      await client.query(pgPlaceholders("DELETE FROM generator_results WHERE snapshot_id = ?"), [snapshot_id]);
      await client.query(pgPlaceholders("DELETE FROM repo_profiles WHERE snapshot_id = ?"), [snapshot_id]);
      await client.query(pgPlaceholders("DELETE FROM context_maps WHERE snapshot_id = ?"), [snapshot_id]);
      await client.query(pgPlaceholders("DELETE FROM generation_versions WHERE snapshot_id = ?"), [snapshot_id]);
      // persistence_credits is a monetary audit trail — never delete the ledger row,
      // only null out the snapshot it references (mirrors deleteSnapshot).
      await client.query(pgPlaceholders("UPDATE persistence_credits SET snapshot_id = NULL WHERE snapshot_id = ?"), [snapshot_id]);
    }
    await client.query(pgPlaceholders("DELETE FROM snapshots WHERE account_id = ?"), [account_id]);
    await client.query(pgPlaceholders("DELETE FROM project_memory WHERE account_id = ?"), [account_id]);
    for (const { project_id } of projects) {
      await client.query(pgPlaceholders("DELETE FROM projects WHERE project_id = ?"), [project_id]);
    }

    await client.query(pgPlaceholders("DELETE FROM webhook_deliveries WHERE webhook_id IN (SELECT webhook_id FROM webhooks WHERE account_id = ?)"), [account_id]);
    await client.query(pgPlaceholders("DELETE FROM webhooks WHERE account_id = ?"), [account_id]);
    await client.query(pgPlaceholders("DELETE FROM github_tokens WHERE account_id = ?"), [account_id]);
    await client.query(pgPlaceholders("DELETE FROM seats WHERE account_id = ?"), [account_id]);
    await client.query(pgPlaceholders("DELETE FROM program_entitlements WHERE account_id = ?"), [account_id]);
    await client.query(pgPlaceholders("DELETE FROM account_free_scrape_pool WHERE account_id = ?"), [account_id]);
    await client.query(pgPlaceholders("DELETE FROM oauth_authorization_codes WHERE user_id = ?"), [account_id]);
    await client.query(pgPlaceholders("DELETE FROM oauth_access_tokens WHERE user_id = ?"), [account_id]);
    await client.query(pgPlaceholders("DELETE FROM oauth_refresh_tokens WHERE user_id = ?"), [account_id]);
    await client.query(pgPlaceholders("DELETE FROM api_keys WHERE account_id = ?"), [account_id]);

    // Tombstone, never a row delete — every RETAINED table above still holds
    // a live FK to this account_id. A per-account_id value (not a fixed
    // literal) keeps the accounts.email UNIQUE constraint satisfiable even
    // if this account is deleted more than once (idempotent retry-safe).
    await client.query(
      pgPlaceholders("UPDATE accounts SET name = ?, email = ? WHERE account_id = ?"),
      ["[deleted account]", `deleted-${account_id}@deleted.invalid`, account_id],
    );
  });

  return { deleted: true, projects_deleted: projects.length };
}

export async function updateAccountTier(account_id: string, tier: BillingTier): Promise<boolean> {
  const result = await sql.run("UPDATE accounts SET tier = ? WHERE account_id = ?", [tier, account_id]);
  if (result.rowCount > 0 && tier === "suite") {
    for (const program of ALL_PROGRAMS) {
      await enableProgram(account_id, program);
    }
  }
  return result.rowCount > 0;
}

/**
 * Atomically move an account from `fromTier` to `toTier` ONLY if it's currently
 * at `fromTier` — a compare-and-set. This makes concurrent tier-change webhooks
 * safe (no lost update from a blind SET) and idempotent for a redelivered event
 * (if a duplicate/racing handler already applied the move, the row no longer
 * matches `fromTier` and this no-ops). Returns true only when THIS call made the
 * change, so the caller writes the audit row + fires analytics exactly once.
 * Callers should only invoke this when fromTier !== toTier.
 */
export async function updateAccountTierIfCurrent(
  account_id: string,
  fromTier: BillingTier,
  toTier: BillingTier,
): Promise<boolean> {
  const result = await sql.run(
    "UPDATE accounts SET tier = ? WHERE account_id = ? AND tier = ?",
    [toTier, account_id, fromTier],
  );
  if (result.rowCount > 0 && toTier === "suite") {
    for (const program of ALL_PROGRAMS) {
      await enableProgram(account_id, program);
    }
  }
  return result.rowCount > 0;
}

/**
 * The specific marketed plan (starter/pro/growth) behind an account's coarse
 * BillingTier. Starter and Pro both collapse into the same "paid" tier, so
 * this is the only durable record of which one a PAI'D subscriber actually
 * bought — resolvePlanForAccount reads it to avoid metering a Pro subscriber
 * against Starter's smaller credit allowance. Null for free accounts, or
 * paid accounts predating this column (H-Phase-A cycle 1).
 */
export async function getAccountPaidPlanId(account_id: string): Promise<string | null> {
  const row = await sql.one<{ paid_plan_id: string | null }>(
    "SELECT paid_plan_id FROM accounts WHERE account_id = ?",
    [account_id],
  );
  return row?.paid_plan_id ?? null;
}

export async function updateAccountPaidPlanId(account_id: string, paid_plan_id: string | null): Promise<boolean> {
  const result = await sql.run("UPDATE accounts SET paid_plan_id = ? WHERE account_id = ?", [paid_plan_id, account_id]);
  return result.rowCount > 0;
}

// ─── API Keys ───────────────────────────────────────────────────

/** Creates a new API key. Returns the key record AND the raw key (only time it's available). */
export async function createApiKey(account_id: string, label: string = ""): Promise<{ apiKey: ApiKey; rawKey: string }> {
  const rawKey = generateRawKey();
  const apiKey: ApiKey = {
    key_id: randomUUID(),
    key_hash: hashKey(rawKey),
    account_id,
    label,
    created_at: new Date().toISOString(),
    revoked_at: null,
  };

  await sql.run(
    "INSERT INTO api_keys (key_id, key_hash, account_id, label, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)",
    [apiKey.key_id, apiKey.key_hash, apiKey.account_id, apiKey.label, apiKey.created_at, apiKey.revoked_at],
  );

  return { apiKey, rawKey };
}

/** Lookup an account by raw API key. Returns undefined if key is invalid or revoked. */
export async function resolveApiKey(rawKey: string): Promise<{ apiKey: ApiKey; account: Account } | undefined> {
  const hash = hashKey(rawKey);
  const row = await sql.one<ApiKey & { account_name: string; email: string; tier: BillingTier; account_created_at: string }>(
    "SELECT k.*, a.name as account_name, a.email, a.tier, a.created_at as account_created_at FROM api_keys k JOIN accounts a ON k.account_id = a.account_id WHERE k.key_hash = ? AND k.revoked_at IS NULL",
    [hash],
  );

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

export async function revokeApiKey(key_id: string): Promise<boolean> {
  const result = await sql.run("UPDATE api_keys SET revoked_at = ? WHERE key_id = ?", [new Date().toISOString(), key_id]);
  return result.rowCount > 0;
}

export async function listApiKeys(account_id: string): Promise<ApiKey[]> {
  return await sql.many<ApiKey>("SELECT * FROM api_keys WHERE account_id = ? ORDER BY created_at DESC", [account_id]);
}

// ─── Program Entitlements ───────────────────────────────────────

export async function enableProgram(account_id: string, program: string): Promise<void> {
  await sql.run(
    `INSERT INTO program_entitlements (account_id, program, enabled) VALUES (?, ?, 1)
     ON CONFLICT (account_id, program) DO UPDATE SET enabled = EXCLUDED.enabled`,
    [account_id, program],
  );
}

export async function disableProgram(account_id: string, program: string): Promise<void> {
  await sql.run(
    `INSERT INTO program_entitlements (account_id, program, enabled) VALUES (?, ?, 0)
     ON CONFLICT (account_id, program) DO UPDATE SET enabled = EXCLUDED.enabled`,
    [account_id, program],
  );
}

export async function getEntitlements(account_id: string): Promise<ProgramEntitlement[]> {
  return await sql.many<ProgramEntitlement>(
    "SELECT * FROM program_entitlements WHERE account_id = ? AND enabled = 1",
    [account_id],
  );
}

export async function isProgramEnabled(account_id: string, program: string): Promise<boolean> {
  const account = await getAccount(account_id);
  if (!account) return false;

  const limits = TIER_LIMITS[account.tier];

  // Suite tier: all programs enabled
  if (account.tier === "suite") return true;

  // Free tier: check built-in programs
  if (account.tier === "free") {
    return limits.programs.includes(program);
  }

  // Paid tier: check entitlements table
  const row = await sql.one<{ enabled: number }>(
    "SELECT enabled FROM program_entitlements WHERE account_id = ? AND program = ?",
    [account_id, program],
  );

  return row?.enabled === 1;
}

// ─── Usage Tracking ─────────────────────────────────────────────

export async function recordUsage(
  account_id: string,
  program: string,
  snapshot_id: string,
  generators_run: number,
  input_files: number,
  input_bytes: number,
): Promise<UsageRecord> {
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

  await sql.run(
    `INSERT INTO usage_records (usage_id, account_id, program, snapshot_id, generators_run, input_files, input_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.usage_id, record.account_id, record.program, record.snapshot_id,
      record.generators_run, record.input_files, record.input_bytes, record.created_at,
    ],
  );

  return record;
}

export async function getUsageSummary(account_id: string, since?: string): Promise<UsageSummary[]> {
  const query = since
    ? "SELECT program, COUNT(*) as total_runs, SUM(generators_run) as total_generators, SUM(input_files) as total_input_files, SUM(input_bytes) as total_input_bytes FROM usage_records WHERE account_id = ? AND created_at >= ? GROUP BY program"
    : "SELECT program, COUNT(*) as total_runs, SUM(generators_run) as total_generators, SUM(input_files) as total_input_files, SUM(input_bytes) as total_input_bytes FROM usage_records WHERE account_id = ? GROUP BY program";

  const params = since ? [account_id, since] : [account_id];
  // pg COUNT/SUM return strings/bigints — coerce each aggregate column so the
  // returned UsageSummary fields are JS numbers.
  const rows = await sql.many<{
    program: string;
    total_runs: string | number;
    total_generators: string | number | null;
    total_input_files: string | number | null;
    total_input_bytes: string | number | null;
  }>(query, params);
  return rows.map((r) => ({
    program: r.program,
    total_runs: Number(r.total_runs ?? 0),
    total_generators: Number(r.total_generators ?? 0),
    total_input_files: Number(r.total_input_files ?? 0),
    total_input_bytes: Number(r.total_input_bytes ?? 0),
  }));
}

/** One day's worth of program-run usage — `GET /v1/account/usage/timeseries` (WO-A3). */
export interface UsageDayBucket {
  /** UTC calendar date, "YYYY-MM-DD". */
  date: string;
  runs: number;
  by_program: Record<string, number>;
}

/**
 * Per-day run counts (+ per-program breakdown) since `since` (inclusive, ISO
 * timestamp). Sparse — only dates with at least one run are returned; the
 * caller zero-fills the full requested window so charts get a contiguous
 * series. Bucketing happens in JS (a `usage_records(account_id)` index-backed
 * scan is already narrow at typical per-account volumes) rather than a SQL
 * date_trunc, mirroring the count_by_bucket approach in analytics.ts.
 */
export async function getUsageByDay(account_id: string, since: string): Promise<UsageDayBucket[]> {
  const rows = await sql.many<{ program: string; created_at: string }>(
    "SELECT program, created_at FROM usage_records WHERE account_id = ? AND created_at >= ? ORDER BY created_at ASC",
    [account_id, since],
  );
  const buckets = new Map<string, UsageDayBucket>();
  for (const row of rows) {
    const date = row.created_at.slice(0, 10);
    let bucket = buckets.get(date);
    if (!bucket) {
      bucket = { date, runs: 0, by_program: {} };
      buckets.set(date, bucket);
    }
    bucket.runs += 1;
    bucket.by_program[row.program] = (bucket.by_program[row.program] ?? 0) + 1;
  }
  return [...buckets.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export async function getMonthlySnapshotCount(account_id: string): Promise<number> {
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);
  const since = firstOfMonth.toISOString();

  const row = await sql.one<{ count: number }>(
    "SELECT COUNT(DISTINCT snapshot_id) as count FROM usage_records WHERE account_id = ? AND created_at >= ?",
    [account_id, since],
  );

  return Number(row?.count ?? 0);
}

export async function getProjectCount(account_id: string): Promise<number> {
  // Count projects from snapshots linked to this account's usage
  const row = await sql.one<{ count: number }>(
    `SELECT COUNT(DISTINCT s.project_id) as count
     FROM usage_records u
     JOIN snapshots s ON u.snapshot_id = s.snapshot_id
     WHERE u.account_id = ?`,
    [account_id],
  );

  return Number(row?.count ?? 0);
}

// ─── Quota Enforcement ──────────────────────────────────────────

export interface QuotaCheck {
  allowed: boolean;
  reason?: string;
  tier: BillingTier;
  limits: TierLimits;
  usage: { snapshots_this_month: number; project_count: number };
}

export async function checkQuota(account_id: string): Promise<QuotaCheck> {
  const account = await getAccount(account_id);
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
  const snapshotsThisMonth = await getMonthlySnapshotCount(account_id);
  const projectCount = await getProjectCount(account_id);

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

export async function recordApiCall(
  account_id: string,
  method: string,
  path: string,
  status_code: number,
): Promise<void> {
  await sql.run(
    `INSERT INTO account_api_calls (call_id, account_id, method, path, status_code, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      account_id,
      method,
      normalizeApiPath(path),
      status_code,
      new Date().toISOString(),
    ],
  );
}

export async function getApiCallSummary(
  account_id: string,
  since: string,
  limit = 100,
): Promise<AccountApiAnalyticsSummary> {
  const totalRow = await sql.one<{ c: number }>(
    "SELECT COUNT(*) as c FROM account_api_calls WHERE account_id = ? AND created_at >= ?",
    [account_id, since],
  );

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const calls24hRow = await sql.one<{ c: number }>(
    "SELECT COUNT(*) as c FROM account_api_calls WHERE account_id = ? AND created_at >= ?",
    [account_id, since24h],
  );

  const calls7dRow = await sql.one<{ c: number }>(
    "SELECT COUNT(*) as c FROM account_api_calls WHERE account_id = ? AND created_at >= ?",
    [account_id, since7d],
  );

  // pg COUNT(*) returns a string/bigint — coerce the `calls` column on each row.
  const byEndpointRows = await sql.many<Omit<ApiEndpointUsage, "calls"> & { calls: string | number }>(
    `SELECT method, path, COUNT(*) as calls, MAX(created_at) as last_called_at
     FROM account_api_calls
     WHERE account_id = ? AND created_at >= ?
     GROUP BY method, path
     ORDER BY calls DESC, last_called_at DESC
     LIMIT ?`,
    [account_id, since, Math.max(1, limit)],
  );
  const byEndpoint: ApiEndpointUsage[] = byEndpointRows.map((r) => ({
    method: r.method,
    path: r.path,
    calls: Number(r.calls ?? 0),
    last_called_at: r.last_called_at,
  }));

  const byStatusRows = await sql.many<Omit<ApiStatusUsage, "calls"> & { calls: string | number }>(
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
    [account_id, since],
  );
  const byStatus: ApiStatusUsage[] = byStatusRows.map((r) => ({
    status_bucket: r.status_bucket,
    calls: Number(r.calls ?? 0),
  }));

  return {
    account_id,
    since,
    total_calls: Number(totalRow?.c ?? 0),
    calls_last_24h: Number(calls24hRow?.c ?? 0),
    calls_last_7d: Number(calls7dRow?.c ?? 0),
    by_endpoint: byEndpoint,
    by_status: byStatus,
  };
}

export async function getSystemStats(): Promise<SystemStats> {
  const accountRow = await sql.one<{ total: number; free_count: number; paid_count: number; suite_count: number }>(
    "SELECT COUNT(*) as total, SUM(CASE WHEN tier='free' THEN 1 ELSE 0 END) as free_count, SUM(CASE WHEN tier='paid' THEN 1 ELSE 0 END) as paid_count, SUM(CASE WHEN tier='suite' THEN 1 ELSE 0 END) as suite_count FROM accounts",
  );

  const snapCount = Number((await sql.one<{ c: number }>("SELECT COUNT(*) as c FROM snapshots"))?.c ?? 0);
  const projCount = Number((await sql.one<{ c: number }>("SELECT COUNT(DISTINCT project_id) as c FROM snapshots"))?.c ?? 0);
  const usageCount = Number((await sql.one<{ c: number }>("SELECT COUNT(*) as c FROM usage_records"))?.c ?? 0);
  const keyTotals = await sql.one<{ total: number; active: number }>(
    "SELECT COUNT(*) as total, SUM(CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END) as active FROM api_keys",
  );

  return {
    total_accounts: Number(accountRow?.total ?? 0),
    accounts_by_tier: {
      free: Number(accountRow?.free_count ?? 0),
      paid: Number(accountRow?.paid_count ?? 0),
      suite: Number(accountRow?.suite_count ?? 0),
    },
    total_snapshots: snapCount,
    total_projects: projCount,
    total_usage_records: usageCount,
    total_api_keys: Number(keyTotals?.total ?? 0),
    active_api_keys: Number(keyTotals?.active ?? 0),
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

export async function listAllAccounts(limit = 100, offset = 0): Promise<{ accounts: AccountSummary[]; total: number }> {
  const total = Number((await sql.one<{ c: number }>("SELECT COUNT(*) as c FROM accounts"))?.c ?? 0);

  const rows = await sql.many<Omit<AccountSummary, "snapshot_count" | "project_count"> & {
    snapshot_count: string | number;
    project_count: string | number;
  }>(`
    SELECT a.account_id, a.name, a.email, a.tier, a.created_at,
      (SELECT COUNT(*) FROM snapshots s JOIN (SELECT DISTINCT project_id FROM snapshots) p ON s.project_id = p.project_id WHERE EXISTS (SELECT 1 FROM usage_records u WHERE u.account_id = a.account_id AND u.snapshot_id = s.snapshot_id)) as snapshot_count,
      (SELECT COUNT(DISTINCT u.snapshot_id) FROM usage_records u WHERE u.account_id = a.account_id) as project_count
    FROM accounts a
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `, [limit, offset]);

  // pg COUNT(...) subqueries return strings/bigints — coerce per row.
  const accounts: AccountSummary[] = rows.map((r) => ({
    account_id: r.account_id,
    name: r.name,
    email: r.email,
    tier: r.tier,
    created_at: r.created_at,
    snapshot_count: Number(r.snapshot_count ?? 0),
    project_count: Number(r.project_count ?? 0),
  }));

  return { accounts, total };
}

export interface RecentActivity {
  event_id: string;
  account_id: string;
  event_type: string;
  stage: string;
  created_at: string;
}

export async function getRecentActivity(limit = 50): Promise<RecentActivity[]> {
  return await sql.many<RecentActivity>(
    "SELECT event_id, account_id, event_type, stage, created_at FROM funnel_events ORDER BY created_at DESC LIMIT ?",
    [limit],
  );
}
