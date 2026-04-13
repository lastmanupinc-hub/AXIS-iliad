import Database from "better-sqlite3";
import { join } from "node:path";

let db: Database.Database | null = null;

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  project_name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  snapshot_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  created_at TEXT NOT NULL,
  input_method TEXT NOT NULL,
  manifest TEXT NOT NULL,
  file_count INTEGER NOT NULL,
  total_size_bytes INTEGER NOT NULL,
  files TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
);

CREATE INDEX IF NOT EXISTS idx_snapshots_project ON snapshots(project_id);

CREATE TABLE IF NOT EXISTS context_maps (
  snapshot_id TEXT PRIMARY KEY REFERENCES snapshots(snapshot_id),
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repo_profiles (
  snapshot_id TEXT PRIMARY KEY REFERENCES snapshots(snapshot_id),
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generator_results (
  snapshot_id TEXT PRIMARY KEY REFERENCES snapshots(snapshot_id),
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  account_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  key_id TEXT PRIMARY KEY,
  key_hash TEXT UNIQUE NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_account ON api_keys(account_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS program_entitlements (
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  program TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (account_id, program)
);

CREATE TABLE IF NOT EXISTS usage_records (
  usage_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  program TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  generators_run INTEGER NOT NULL DEFAULT 0,
  input_files INTEGER NOT NULL DEFAULT 0,
  input_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_account ON usage_records(account_id);
CREATE INDEX IF NOT EXISTS idx_usage_account_program ON usage_records(account_id, program);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_records(created_at);

CREATE TABLE IF NOT EXISTS seats (
  seat_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seats_account ON seats(account_id);
CREATE INDEX IF NOT EXISTS idx_seats_email ON seats(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seats_account_email ON seats(account_id, email) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS funnel_events (
  event_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  event_type TEXT NOT NULL,
  stage TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_funnel_account ON funnel_events(account_id);
CREATE INDEX IF NOT EXISTS idx_funnel_stage ON funnel_events(stage);
CREATE INDEX IF NOT EXISTS idx_funnel_type ON funnel_events(event_type);
CREATE INDEX IF NOT EXISTS idx_funnel_created ON funnel_events(created_at);
`;

// ─── Migration framework ────────────────────────────────────────

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 2,
    name: "add_rate_limits_table",
    sql: `
CREATE TABLE IF NOT EXISTS rate_limits (
  client_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);
`,
  },
  {
    version: 3,
    name: "add_search_index_table",
    sql: `
CREATE TABLE IF NOT EXISTS search_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id),
  file_path TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_search_snapshot ON search_index(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_search_content ON search_index(content);
`,
  },
  {
    version: 4,
    name: "add_fts5_search",
    sql: `
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  content,
  content='search_index',
  content_rowid='id'
);
`,
  },
  {
    version: 5,
    name: "add_webhooks",
    sql: `
CREATE TABLE IF NOT EXISTS webhooks (
  webhook_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  url TEXT NOT NULL,
  events TEXT NOT NULL,
  secret TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhooks_account ON webhooks(account_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(active);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks(webhook_id),
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status_code INTEGER,
  response_body TEXT,
  success INTEGER NOT NULL DEFAULT 0,
  attempted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_attempted ON webhook_deliveries(attempted_at);
`,
  },
  {
    version: 6,
    name: "add_generation_versions",
    sql: `
CREATE TABLE IF NOT EXISTS generation_versions (
  version_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id),
  version_number INTEGER NOT NULL,
  program TEXT,
  files TEXT NOT NULL,
  file_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gv_snapshot ON generation_versions(snapshot_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gv_snapshot_version ON generation_versions(snapshot_id, version_number);
`,
  },
  {
    version: 7,
    name: "add_webhook_retry_columns",
    sql: `
ALTER TABLE webhook_deliveries ADD COLUMN attempt_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE webhook_deliveries ADD COLUMN next_retry_at TEXT;
ALTER TABLE webhook_deliveries ADD COLUMN dead_lettered INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE next_retry_at IS NOT NULL AND dead_lettered = 0 AND success = 0;
`,
  },
  {
    version: 8,
    name: "add_github_tokens_and_tier_changes",
    sql: `
CREATE TABLE IF NOT EXISTS github_tokens (
  token_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  label TEXT NOT NULL DEFAULT 'default',
  token_prefix TEXT NOT NULL,
  encrypted_token TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT,
  last_used_at TEXT,
  last_validated_at TEXT,
  valid INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_github_tokens_account ON github_tokens(account_id);

CREATE TABLE IF NOT EXISTS tier_changes (
  change_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  from_tier TEXT NOT NULL,
  to_tier TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'user_request',
  proration_amount INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tier_changes_account ON tier_changes(account_id);
CREATE INDEX IF NOT EXISTS idx_tier_changes_created ON tier_changes(created_at);
`,
  },
  {
    version: 9,
    name: "add_oauth_support",
    sql: `
ALTER TABLE accounts ADD COLUMN github_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_github_id ON accounts(github_id) WHERE github_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
`,
  },
  {
    version: 10,
    name: "add_email_deliveries",
    sql: `
CREATE TABLE IF NOT EXISTS email_deliveries (
  delivery_id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  template TEXT NOT NULL,
  subject TEXT NOT NULL,
  variables TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  provider_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_to ON email_deliveries(to_email);
CREATE INDEX IF NOT EXISTS idx_email_status ON email_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_email_created ON email_deliveries(created_at);
`,
  },
  {
    version: 11,
    name: "add_lemon_squeezy_subscriptions",
    sql: `
CREATE TABLE IF NOT EXISTS lemon_squeezy_subscriptions (
  subscription_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  variant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TEXT,
  current_period_end TEXT,
  card_brand TEXT,
  card_last_four TEXT,
  cancel_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ls_account ON lemon_squeezy_subscriptions(account_id);
CREATE INDEX IF NOT EXISTS idx_ls_customer ON lemon_squeezy_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_ls_status ON lemon_squeezy_subscriptions(status);
`,
  },
  {
    version: 12,
    name: "add_account_id_to_snapshots_and_projects",
    sql: `
ALTER TABLE snapshots ADD COLUMN account_id TEXT REFERENCES accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_account ON snapshots(account_id);

-- Rebuild projects table: replace global UNIQUE(project_name) with per-account uniqueness
PRAGMA foreign_keys=OFF;

CREATE TABLE projects_new (
  project_id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(account_id)
);
INSERT INTO projects_new (project_id, project_name) SELECT project_id, project_name FROM projects;
DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

CREATE INDEX IF NOT EXISTS idx_projects_account ON projects(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name_anon ON projects(project_name) WHERE account_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name_account ON projects(project_name, account_id) WHERE account_id IS NOT NULL;

PRAGMA foreign_keys=ON;
`,
  },
  {
    version: 13,
    name: "add_persistence_credits",
    sql: `
CREATE TABLE IF NOT EXISTS persistence_credits (
  credit_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  credits_delta INTEGER NOT NULL,
  operation TEXT NOT NULL,
  snapshot_id TEXT REFERENCES snapshots(snapshot_id),
  balance_after INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pcredits_account ON persistence_credits(account_id);
CREATE INDEX IF NOT EXISTS idx_pcredits_created ON persistence_credits(created_at);
`,
  },
  {
    version: 14,
    name: "add_code_symbols",
    sql: `
CREATE TABLE IF NOT EXISTS code_symbols (
  symbol_id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  symbol_name TEXT NOT NULL COLLATE NOCASE,
  symbol_type TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  parent TEXT
);
CREATE INDEX IF NOT EXISTS idx_symbols_snapshot ON code_symbols(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON code_symbols(snapshot_id, symbol_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_symbols_type ON code_symbols(snapshot_id, symbol_type);
`,
  },
  {
    version: 15,
    name: "add_stripe_subscriptions",
    sql: `
CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  subscription_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  price_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TEXT,
  current_period_end TEXT,
  card_brand TEXT,
  card_last_four TEXT,
  cancel_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stripe_account ON stripe_subscriptions(account_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customer ON stripe_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_status ON stripe_subscriptions(status);
`,
  },
  {
    version: 16,
    name: "add_referral_system",
    sql: `
CREATE TABLE IF NOT EXISTS referral_codes (
  code TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_referral_codes_account ON referral_codes(account_id);

CREATE TABLE IF NOT EXISTS referral_conversions (
  conversion_id TEXT PRIMARY KEY,
  referrer_account_id TEXT NOT NULL REFERENCES accounts(account_id),
  referee_account_id TEXT NOT NULL UNIQUE,
  converted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_referrer ON referral_conversions(referrer_account_id);

CREATE TABLE IF NOT EXISTS referral_credits (
  account_id TEXT PRIMARY KEY REFERENCES accounts(account_id),
  earned_credits_millicents INTEGER NOT NULL DEFAULT 0,
  lifetime_referrals INTEGER NOT NULL DEFAULT 0,
  free_calls_remaining INTEGER NOT NULL DEFAULT 0,
  last_reset_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`,
  },
];

function ensureMigrationsTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

export function runMigrations(database: Database.Database): { applied: number; current_version: number } {
  ensureMigrationsTable(database);

  const getVersion = database.prepare("SELECT MAX(version) as v FROM schema_migrations");
  const currentRow = getVersion.get() as { v: number | null } | undefined;
  let currentVersion = currentRow?.v ?? 1; // v1 = initial schema

  const insertMigration = database.prepare(
    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
  );

  let applied = 0;
  const pending = MIGRATIONS.filter((m) => m.version > currentVersion).sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    database.exec(migration.sql);
    insertMigration.run(migration.version, migration.name, new Date().toISOString());
    applied++;
    currentVersion = migration.version;
  }

  return { applied, current_version: currentVersion };
}

export function getSchemaVersion(database: Database.Database): number {
  ensureMigrationsTable(database);
  const row = database.prepare("SELECT MAX(version) as v FROM schema_migrations").get() as { v: number | null } | undefined;
  /* v8 ignore next — V8 quirk: row always present, ?? 1 is defensive */
  return row?.v ?? 1;
}

export function getDb(): Database.Database {
  /* v8 ignore start — test suites always call openMemoryDb, production path never runs in tests */
  if (db) return db;
  const dbPath = process.env.DATABASE_PATH ?? process.env.AXIS_DB_PATH ?? join(process.cwd(), "axis.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_V1);
  runMigrations(db);
  return db;
  /* v8 ignore stop */
}

/** Open an in-memory database (for tests). */
export function openMemoryDb(): Database.Database {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_V1);
  runMigrations(db);
  return db;
}

/** Close and reset the database handle. */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ─── Database maintenance utilities ─────────────────────────────

export interface DbMaintenanceResult {
  action: string;
  success: boolean;
  details: Record<string, unknown>;
}

/** Run WAL checkpoint to merge WAL file back into main database. */
export function walCheckpoint(database?: Database.Database): DbMaintenanceResult {
  const d = database ?? db;
  if (!d) return { action: "wal_checkpoint", success: false, details: { error: "no_database" } };
  const row = d.pragma("wal_checkpoint(TRUNCATE)") as Array<{ busy: number; log: number; checkpointed: number }>;
  /* v8 ignore next — V8 quirk: pragma always returns rows, ?? is defensive */
  const result = row[0] ?? { busy: 0, log: 0, checkpointed: 0 };
  return {
    action: "wal_checkpoint",
    success: result.busy === 0,
    details: { busy: result.busy, wal_pages: result.log, checkpointed: result.checkpointed },
  };
}

/** Run VACUUM to defragment and reclaim disk space. */
export function vacuum(database?: Database.Database): DbMaintenanceResult {
  const d = database ?? db;
  if (!d) return { action: "vacuum", success: false, details: { error: "no_database" } };
  d.exec("VACUUM");
  return { action: "vacuum", success: true, details: {} };
}

/** Run integrity check on the database. */
export function integrityCheck(database?: Database.Database): DbMaintenanceResult {
  const d = database ?? db;
  if (!d) return { action: "integrity_check", success: false, details: { error: "no_database" } };
  const rows = d.pragma("integrity_check") as Array<{ integrity_check: string }>;
  const ok = rows.length === 1 && rows[0].integrity_check === "ok";
  return {
    action: "integrity_check",
    success: ok,
    details: { result: rows.map((r) => r.integrity_check) },
  };
}

/** Get database size and table row counts for monitoring. */
export function getDbStats(database?: Database.Database): DbMaintenanceResult {
  const d = database ?? db;
  if (!d) return { action: "db_stats", success: false, details: { error: "no_database" } };

  const pageSizeRow = d.pragma("page_size") as Array<{ page_size: number }>;
  const pageCountRow = d.pragma("page_count") as Array<{ page_count: number }>;
  const freelistRow = d.pragma("freelist_count") as Array<{ freelist_count: number }>;
  const walRow = d.pragma("wal_checkpoint") as Array<{ busy: number; log: number; checkpointed: number }>;

  /* v8 ignore start — V8 quirk: pragma always returns rows, ?? 0 is defensive */
  const pageSize = pageSizeRow[0]?.page_size ?? 0;
  const pageCount = pageCountRow[0]?.page_count ?? 0;
  const freelistCount = freelistRow[0]?.freelist_count ?? 0;
  const walPages = walRow[0]?.log ?? 0;
  /* v8 ignore stop */

  const tables = d
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>;

  const tableCounts: Record<string, number> = {};
  for (const { name } of tables) {
    const row = d.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number };
    tableCounts[name] = row.c;
  }

  return {
    action: "db_stats",
    success: true,
    details: {
      size_bytes: pageSize * pageCount,
      page_size: pageSize,
      page_count: pageCount,
      freelist_pages: freelistCount,
      wal_pages: walPages,
      tables: tableCounts,
    },
  };
}

/** Purge stale data: expired rate limits, old search index entries, revoked API keys older than retention days. */
export function purgeStaleData(
  database?: Database.Database,
  options?: { retentionDays?: number },
): DbMaintenanceResult {
  const d = database ?? db;
  if (!d) return { action: "purge_stale", success: false, details: { error: "no_database" } };

  const retentionDays = options?.retentionDays ?? 90;
  const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
  const now = Date.now();

  const expiredRateLimits = d.prepare("DELETE FROM rate_limits WHERE reset_at < ?").run(now);
  const revokedKeys = d.prepare("DELETE FROM api_keys WHERE revoked_at IS NOT NULL AND revoked_at < ?").run(cutoff);
  const revokedSeats = d.prepare("DELETE FROM seats WHERE revoked_at IS NOT NULL AND revoked_at < ?").run(cutoff);

  return {
    action: "purge_stale",
    success: true,
    details: {
      expired_rate_limits: expiredRateLimits.changes,
      old_revoked_keys: revokedKeys.changes,
      old_revoked_seats: revokedSeats.changes,
      retention_days: retentionDays,
    },
  };
}

/** Run full maintenance routine: checkpoint → purge → vacuum → integrity check. */
export function runMaintenance(database?: Database.Database): DbMaintenanceResult[] {
  /* v8 ignore next — V8 quirk: compound ?? tested in db.test.ts */
  const d = database ?? db ?? undefined;
  return [
    walCheckpoint(d),
    purgeStaleData(d),
    vacuum(d),
    integrityCheck(d),
  ];
}
