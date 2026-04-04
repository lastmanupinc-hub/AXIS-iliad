import Database from "better-sqlite3";
import { join } from "node:path";

let db: Database.Database | null = null;

const SCHEMA = `
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
`;

export function getDb(): Database.Database {
  if (db) return db;
  const dbPath = process.env.AXIS_DB_PATH ?? join(process.cwd(), "axis.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

/** Open an in-memory database (for tests). */
export function openMemoryDb(): Database.Database {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

/** Close and reset the database handle. */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
