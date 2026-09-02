// Postgres schema for Iliad (Neon) — the cumulative result of the SQLite
// SCHEMA_V1 + all 22 migrations, in final form, ported to Postgres DDL.
// Neon starts fresh, so we apply one idempotent schema and stamp the baseline
// at the latest version; future changes go in PG_MIGRATIONS (version > 23).
// See NEON_MIGRATION_PLAN.md. FTS5 (search_fts) is replaced by a tsvector column.
import { sql } from "./pg.js";

export const PG_LATEST_VERSION = 27;

// Ordering matters for FKs (accounts before dependents; oauth_refresh_tokens
// before oauth_access_tokens). Timestamps stay TEXT (app writes ISO strings).
// 0/1 "boolean" columns stay INTEGER (least churn vs the existing app code).
const PG_SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  account_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL,
  github_id TEXT,
  google_id TEXT,
  paid_plan_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_github_id ON accounts(github_id) WHERE github_id IS NOT NULL;
-- NOTE: idx_accounts_google_id is created in PG_MIGRATIONS v29, NOT here. On an
-- existing DB, CREATE TABLE IF NOT EXISTS is a no-op so google_id isn't added by
-- this baseline; creating the index here would fail ("column does not exist")
-- before the v29 ALTER adds the column. The migration does ALTER + index in order.
CREATE INDEX IF NOT EXISTS idx_accounts_email_lower ON accounts(lower(email));

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(account_id)
);
CREATE INDEX IF NOT EXISTS idx_projects_account ON projects(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name_anon ON projects(project_name) WHERE account_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name_account ON projects(project_name, account_id) WHERE account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS snapshots (
  snapshot_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  created_at TEXT NOT NULL,
  input_method TEXT NOT NULL,
  manifest TEXT NOT NULL,
  file_count INTEGER NOT NULL,
  total_size_bytes INTEGER NOT NULL,
  files TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  account_id TEXT REFERENCES accounts(account_id)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_project ON snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_account ON snapshots(account_id);

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
  created_at TEXT NOT NULL,
  -- Monotonic insertion order: restores the SQLite rowid tiebreaker so events
  -- sharing an identical created_at still sort deterministically (newest first).
  seq BIGINT GENERATED ALWAYS AS IDENTITY
);
CREATE INDEX IF NOT EXISTS idx_funnel_account ON funnel_events(account_id);
CREATE INDEX IF NOT EXISTS idx_funnel_stage ON funnel_events(stage);
CREATE INDEX IF NOT EXISTS idx_funnel_type ON funnel_events(event_type);
CREATE INDEX IF NOT EXISTS idx_funnel_created ON funnel_events(created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  client_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);

-- search_index + Postgres full-text (replaces the SQLite FTS5 search_fts table).
CREATE TABLE IF NOT EXISTS search_index (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id),
  file_path TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);
CREATE INDEX IF NOT EXISTS idx_search_snapshot ON search_index(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_search_tsv ON search_index USING GIN (content_tsv);

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
  attempted_at TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  next_retry_at TEXT,
  dead_lettered INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_attempted ON webhook_deliveries(attempted_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE next_retry_at IS NOT NULL AND dead_lettered = 0 AND success = 0;

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

-- NOTE: idx_project_memory_project is created in PG_MIGRATIONS v30, NOT here —
-- same trap as idx_accounts_google_id above (CREATE TABLE IF NOT EXISTS is a
-- no-op on an existing DB, so the index must come from the migration, after
-- the table is guaranteed to exist).
CREATE TABLE IF NOT EXISTS project_memory (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  kind TEXT NOT NULL CHECK (kind IN ('decision','convention','evidence','goal')),
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS oauth_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  secret TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  grant_types TEXT NOT NULL DEFAULT '["authorization_code"]',
  is_confidential INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(id),
  user_id TEXT NOT NULL REFERENCES accounts(account_id),
  code TEXT UNIQUE NOT NULL,
  code_challenge TEXT,
  code_challenge_method TEXT,
  redirect_uri TEXT NOT NULL,
  scopes TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_client ON oauth_authorization_codes(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_user ON oauth_authorization_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_code ON oauth_authorization_codes(code);

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(id),
  user_id TEXT NOT NULL REFERENCES accounts(account_id),
  refresh_token TEXT UNIQUE NOT NULL,
  scopes TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_client ON oauth_refresh_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_user ON oauth_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_token ON oauth_refresh_tokens(refresh_token);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(id),
  user_id TEXT NOT NULL REFERENCES accounts(account_id),
  access_token TEXT UNIQUE NOT NULL,
  refresh_token_id TEXT REFERENCES oauth_refresh_tokens(id),
  scopes TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_access_tokens_client ON oauth_access_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_access_tokens_user ON oauth_access_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_access_tokens_token ON oauth_access_tokens(access_token);

CREATE TABLE IF NOT EXISTS code_symbols (
  symbol_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  symbol_name TEXT NOT NULL,
  symbol_type TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  parent TEXT
);
CREATE INDEX IF NOT EXISTS idx_symbols_snapshot ON code_symbols(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON code_symbols(snapshot_id, lower(symbol_name));
CREATE INDEX IF NOT EXISTS idx_symbols_type ON code_symbols(snapshot_id, symbol_type);

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
  updated_at TEXT NOT NULL,
  initial_grant_given INTEGER NOT NULL DEFAULT 0,
  paid_call_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS account_api_calls (
  call_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_api_calls_account ON account_api_calls(account_id);
CREATE INDEX IF NOT EXISTS idx_account_api_calls_created ON account_api_calls(created_at);
CREATE INDEX IF NOT EXISTS idx_account_api_calls_path ON account_api_calls(path);

CREATE TABLE IF NOT EXISTS usage_credit_monthly (
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  month_key TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  monthly_allowance INTEGER NOT NULL,
  included_credits_used INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, month_key)
);
CREATE INDEX IF NOT EXISTS idx_usage_credit_monthly_month ON usage_credit_monthly(month_key);

CREATE TABLE IF NOT EXISTS usage_credit_ledger (
  entry_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  month_key TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  credits_required INTEGER NOT NULL,
  included_credits_applied INTEGER NOT NULL,
  overage_credits INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_credit_ledger_account_month ON usage_credit_ledger(account_id, month_key);
CREATE INDEX IF NOT EXISTS idx_usage_credit_ledger_created ON usage_credit_ledger(created_at);

CREATE TABLE IF NOT EXISTS mcp_usage (
  usage_id TEXT PRIMARY KEY,
  account_id TEXT,
  tool TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'unknown',
  probe_class TEXT NOT NULL DEFAULT 'unknown',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcp_usage_created ON mcp_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_mcp_usage_tool ON mcp_usage(tool);
CREATE INDEX IF NOT EXISTS idx_mcp_usage_account ON mcp_usage(account_id);
CREATE INDEX IF NOT EXISTS idx_mcp_usage_source ON mcp_usage(source);

-- v24: idempotency for the paid MCP path (transport retries return the original
-- result instead of re-charging). No FK — telemetry-grade, must not block deletes.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  account_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);

-- v25: audit + idempotency ledger for paid credit-pack top-ups via PAI'D. Partial
-- UNIQUE on paid_session_id enforces one purchase per checkout session.
CREATE TABLE IF NOT EXISTS credit_pack_purchases (
  purchase_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  pack_id TEXT NOT NULL,
  credits INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  paid_session_id TEXT,
  paid_payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  succeeded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_credit_packs_account ON credit_pack_purchases(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_packs_session ON credit_pack_purchases(paid_session_id) WHERE paid_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_packs_status ON credit_pack_purchases(status);

-- v26: 24h shared cache for Firecrawl scrape responses, deduped by normalized-URL
-- hash. Absolute expires_at so restarts don't extend stale entries.
CREATE TABLE IF NOT EXISTS scrape_cache (
  url_hash TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  markdown TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  status_code INTEGER NOT NULL DEFAULT 200,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_scrape_cache_expires ON scrape_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_scrape_cache_created ON scrape_cache(created_at);
CREATE INDEX IF NOT EXISTS idx_scrape_cache_hits ON scrape_cache(hit_count DESC);

-- v27: per-account free Firecrawl page pool, 100 pages/calendar-month, keyed by
-- (account_id, month_key) so it resets on the first of each month.
CREATE TABLE IF NOT EXISTS account_free_scrape_pool (
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  month_key TEXT NOT NULL,
  free_scrapes_used INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, month_key)
);
CREATE INDEX IF NOT EXISTS idx_free_scrape_pool_month ON account_free_scrape_pool(month_key);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
`;

// Future Postgres-only migrations (version > PG_LATEST_VERSION) go here.
export interface PgMigration { version: number; name: string; sql: string }
export const PG_MIGRATIONS: PgMigration[] = [
  {
    // Existing DBs created before the seq column: add it so the created_at-DESC
    // ordering has a deterministic tiebreaker. Fresh DBs already have it from the
    // baseline, so ADD COLUMN IF NOT EXISTS is a no-op there.
    version: 28,
    name: "funnel_events_seq_tiebreaker",
    sql: `ALTER TABLE funnel_events ADD COLUMN IF NOT EXISTS seq BIGINT GENERATED ALWAYS AS IDENTITY;`,
  },
  {
    // Google OAuth login: existing DBs predate the google_id column. Fresh DBs
    // already have it from the baseline, so ADD COLUMN IF NOT EXISTS is a no-op.
    // Mirrors the github_id column + partial unique index.
    version: 29,
    name: "accounts_google_id",
    sql: `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS google_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_google_id ON accounts(google_id) WHERE google_id IS NOT NULL;`,
  },
  {
    // Project brain (agentic-asset WO-05): per-project memory entries written by
    // agents/humans and read back into generation. Fresh DBs get the table from
    // the baseline; this migration creates it for existing DBs. The index lives
    // ONLY here (v29 pattern) so it always runs after the table exists.
    version: 30,
    name: "project_memory",
    sql: `CREATE TABLE IF NOT EXISTS project_memory (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  kind TEXT NOT NULL CHECK (kind IN ('decision','convention','evidence','goal')),
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_memory_project
  ON project_memory(project_id, created_at);`,
  },
  {
    // WO-19 (revenue-mrr-tracker): persisted H1 cash settlements (Stripe SPT /
    // Tempo USDC via mppx, collected through settleOverageCash) so real
    // card/USDC revenue is captured distinctly from plan-credit overage
    // metering (usage_credit_ledger). This is the table that lets settled MRR
    // rise above a true $0 the instant the first dollar actually settles.
    version: 31,
    name: "payment_receipts",
    sql: `CREATE TABLE IF NOT EXISTS payment_receipts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  tool TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  provider TEXT NOT NULL CHECK (provider IN ('stripe','tempo')),
  external_receipt TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_account ON payment_receipts(account_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_created ON payment_receipts(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_tool ON payment_receipts(tool);`,
  },
  {
    // WO-08 (dispute-lifecycle): persisted DisputeRecords ingested from the
    // charge.dispute.* / radar.early_fraud_warning.created Stripe webhooks,
    // plus an append-only transition ledger written through the
    // @axis/agentic-compliance dispute state machine. account_id is nullable
    // (a webhook dispute may arrive before it can be attributed) and has NO
    // FK for the same reason the mcp_usage table doesn't: ingestion must
    // never bounce on referential timing.
    version: 32,
    name: "disputes",
    sql: `CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  rail TEXT NOT NULL DEFAULT 'stripe',
  charge_id TEXT,
  account_id TEXT,
  reason_code TEXT NOT NULL DEFAULT 'unknown',
  amount_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  state TEXT NOT NULL DEFAULT 'needs_response',
  due_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  representment_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_disputes_account ON disputes(account_id);
CREATE INDEX IF NOT EXISTS idx_disputes_state ON disputes(state);
CREATE INDEX IF NOT EXISTS idx_disputes_created ON disputes(created_at);
CREATE TABLE IF NOT EXISTS dispute_transitions (
  seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dispute_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  event TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dispute_transitions_dispute ON dispute_transitions(dispute_id, seq);`,
  },
  {
    // H0.3 (harden-polish loop): admit the PAI'D FC-wallet rail into settled
    // revenue. A successful enforce-mode wallet debit is real settled cash
    // (PAI'D -> its Stripe -> founder settlement), but v31's provider CHECK
    // only allowed the two mppx rails, so the wallet rail could never write a
    // receipt and WO-19's settled-revenue tracker was blind to it. Constraint
    // WIDENING only — no rows change, nothing destructive. Postgres auto-names
    // an inline column CHECK <table>_<column>_check, which is what v31's
    // CREATE produced.
    version: 33,
    name: "payment_receipts_paid_fc_provider",
    sql: `ALTER TABLE payment_receipts DROP CONSTRAINT IF EXISTS payment_receipts_provider_check;
ALTER TABLE payment_receipts ADD CONSTRAINT payment_receipts_provider_check CHECK (provider IN ('stripe','tempo','paid_fc'));`,
  },
  {
    // H2.1 (WO-20 phase 3, charge-integrity hybrid): the compensation ledger —
    // the durable record that money moved but the work (or the rail's answer)
    // didn't. Producers: a cash-settled MCP call whose tool then threw
    // ("settled_then_error"), and an enforce-mode wallet call whose outcome is
    // unknowable ("wallet_rail_ambiguous" — e.g. a timeout after the debit may
    // have landed). The compensator claims 'owed' rows exactly once
    // (conditional UPDATE) and makes the customer whole; every state is
    // auditable, nothing is silently absorbed. FK on account_id mirrors
    // payment_receipts: producers only run for resolved, authed accounts.
    version: 34,
    name: "compensation_ledger",
    sql: `CREATE TABLE IF NOT EXISTS compensation_ledger (
  entry_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  tool TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  receipt_ref TEXT,
  reason TEXT NOT NULL CHECK (reason IN ('settled_then_error','wallet_rail_ambiguous','manual')),
  status TEXT NOT NULL DEFAULT 'owed' CHECK (status IN ('owed','credited','cash_refunded','waived')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_compensation_account ON compensation_ledger(account_id);
CREATE INDEX IF NOT EXISTS idx_compensation_status ON compensation_ledger(status);
CREATE INDEX IF NOT EXISTS idx_compensation_created ON compensation_ledger(created_at);`,
  },
  {
    // H2.6 (red-team fix, WAVE-0 finding #1, CRITICAL): idempotency_keys only
    // ever recorded a COMPLETED result (response TEXT NOT NULL), written after
    // the billable work finished. There was no way to represent "a request
    // with this key is being processed RIGHT NOW" — so two concurrent requests
    // sharing one Idempotency-Key both read "nothing yet" and both charged +
    // ran the billable tool. `status` adds a claim state: a request first
    // claims the key ('pending', response NULL) BEFORE any charge or work;
    // only the request that wins the atomic claim proceeds. A 'pending' claim
    // older than the staleness window (60s — see idempotency-store.ts) is
    // presumed abandoned (a crashed request) and may be reclaimed, so one dead
    // request can never permanently lock out that key. Existing rows are
    // implicitly 'completed' (the default) — the old code path only ever
    // wrote finished results, so backfilling the default is correct as-is.
    version: 35,
    name: "idempotency_keys_claim_status",
    sql: `ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE idempotency_keys ALTER COLUMN response DROP NOT NULL;
ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS idempotency_keys_status_check;
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_status_check CHECK (status IN ('pending','completed'));`,
  },
  {
    // CI-fix (discovered while shipping RT.1, unrelated to the red-team
    // findings): project_memory's documented "newest-first, created_at DESC,
    // id DESC deterministic tiebreak" is NOT actually deterministic —
    // created_at is millisecond-precision (new Date().toISOString()), so two
    // entries inserted in the same millisecond (routine under CI load, or
    // even locally) tie, and the id DESC tiebreak then sorts by random UUID
    // string, which has zero relationship to insertion order. `seq` is a
    // real monotonic identity column: ties on created_at now break on
    // genuine insertion order, always.
    version: 36,
    name: "project_memory_monotonic_seq",
    sql: `ALTER TABLE project_memory ADD COLUMN IF NOT EXISTS seq BIGINT GENERATED ALWAYS AS IDENTITY;`,
  },
  {
    // H2.6 (red-team fix, WAVE-0 finding #7): Stripe does not guarantee
    // webhook delivery order. A stale customer.subscription.deleted event
    // (e.g. an old cancellation, redelivered late) arriving AFTER a newer
    // customer.subscription.updated (e.g. the customer reactivated) used to
    // silently overwrite the newer state — downgrading an actively-paying
    // customer. last_event_created_at tracks the Stripe Event object's own
    // `created` (Unix seconds) for the last subscription.* webhook actually
    // applied, so handleSubscriptionEvent can reject an event older than
    // what it already processed for that subscription.
    version: 37,
    name: "stripe_subscriptions_last_event",
    sql: `ALTER TABLE stripe_subscriptions ADD COLUMN IF NOT EXISTS last_event_created_at BIGINT;`,
  },
  {
    // x402 onboarding program, Phase 0 (visibility): every x402/MPP challenge
    // actually issued to an agent, plus the $0 ping_payment probe's forced
    // settlements — neither of these was persisted anywhere before, so
    // GET /v1/stats could not show a real challenge->settlement funnel across
    // restarts. account_id is nullable and has NO FK, same reasoning as
    // mcp_usage/disputes: an anonymous caller can be challenged (and the
    // free ping_payment probe explicitly supports anonymous callers), so
    // ingestion must never bounce on referential timing or auth state. Real
    // (non-zero) settled cash is already fully captured by payment_receipts —
    // this table intentionally does NOT duplicate that; it only records the
    // challenge side (never persisted before) and the probe's $0 settlements.
    version: 38,
    name: "payment_funnel_events",
    sql: `CREATE TABLE IF NOT EXISTS payment_funnel_events (
  event_id TEXT PRIMARY KEY,
  account_id TEXT,
  tool TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('challenge','settlement')),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_funnel_events_kind ON payment_funnel_events(kind);
CREATE INDEX IF NOT EXISTS idx_payment_funnel_events_created ON payment_funnel_events(created_at);`,
  },
  {
    // H-Phase-A cycle 1: Starter and Pro both collapse into the same coarse
    // "paid" BillingTier, so resolvePlanForAccount had no way to tell a real
    // Pro subscriber (via PAI'D, the only live checkout path) from a Starter
    // one — Pro subscribers were silently metered against Starter's smaller
    // credit allowance. This column lets the PAI'D checkout webhook persist
    // the specific marketed plan id; existing DBs get it via ADD COLUMN IF NOT
    // EXISTS (a no-op on fresh DBs, which already have it from the baseline).
    version: 39,
    name: "accounts_paid_plan_id",
    sql: `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS paid_plan_id TEXT;`,
  },
  {
    // R5.7 (web-logout content discard): TermsPage.tsx told users "we don't
    // save your source" while snapshots.files kept the raw uploaded content
    // indefinitely. The real policy, per product decision, is retain-while-
    // logged-in / discard-on-logout for the web dashboard specifically (API/
    // CLI/MCP callers have no session concept and are unaffected). This
    // column is the audit trail: NULL means content is still live; a
    // timestamp means discardAccountSnapshotContent (store.ts) already
    // blanked every FileEntry.content for this snapshot, so callers can
    // distinguish "discarded" from "genuinely empty file" instead of
    // guessing from content/size mismatch.
    version: 40,
    name: "snapshots_content_discarded_at",
    sql: `ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS content_discarded_at TEXT;`,
  },
  {
    // Hub-and-spoke (docs/saas-strategy/CONSOLIDATION.md): 20 generator
    // programs sold as 9 standalone products, each independently purchasable
    // without owning the full hub bundle. `accounts.tier` stays exactly what
    // it is today — quota/rate-limit tier, read at 43 call sites across this
    // codebase — and is NOT touched by this table. Entitlement is a SEPARATE,
    // additive concept: which spoke PRODUCTS (packages/generator-core/src/
    // product-registry.ts) an account owns.
    //
    // No backfill migration for existing accounts. Deliberate, not an
    // oversight: Iliad has no paying customers on this surface yet, so there
    // is nothing to grandfather. Every row here comes from a real purchase
    // from this point forward. If that ever stops being true, backfilling
    // existing accounts is a new, explicit migration — not a silent default
    // baked into this one.
    version: 41,
    name: "account_entitlements",
    sql: `CREATE TABLE IF NOT EXISTS account_entitlements (
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  product_id TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('purchase','manual')),
  PRIMARY KEY (account_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_account_entitlements_account ON account_entitlements(account_id);`,
  },
  {
    // app_01 (docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md substrate table):
    // the "installation -> account mapping" apps/api/src/github-webhook.ts's own
    // comment names as missing — "webhook-created snapshots are anonymous until
    // an installation->account mapping table lands". This IS that table, doing
    // one more job at the same time: which PRODUCT an account wants re-run
    // (the Watch mechanic every one of the 20 apps depends on), not just which
    // account owns the repo.
    //
    // Keyed on repo_full_name (owner/repo), not installation_id — a repo can be
    // watched by an account before or independent of any GitHub App install
    // (e.g. a manually-configured webhook secret), and repo_full_name is the
    // field every existing webhook payload already carries.
    version: 42,
    name: "repo_subscriptions",
    sql: `CREATE TABLE IF NOT EXISTS repo_subscriptions (
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  product_id TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, product_id, repo_full_name)
);
CREATE INDEX IF NOT EXISTS idx_repo_subscriptions_repo ON repo_subscriptions(repo_full_name);
CREATE INDEX IF NOT EXISTS idx_repo_subscriptions_account ON repo_subscriptions(account_id);`,
  },
  {
    // app_20_mcp_hosted: the hosted MCP endpoint serves whatever the LATEST
    // synced snapshot for an account+repo+product contains — this pointer is
    // what the watch-dispatcher's re-sync step updates on every push, and
    // what the hosted HTTP handler reads to resolve a request to real data.
    // Nullable: a subscription exists from the moment it's created, but has
    // no synced snapshot until the first successful watch job.
    version: 43,
    name: "repo_subscriptions_latest_snapshot",
    sql: `ALTER TABLE repo_subscriptions ADD COLUMN IF NOT EXISTS latest_snapshot_id TEXT;`,
  },
  {
    // money_01: subscription checkouts never persisted a joinable reference to
    // their PAI'D checkout session, so the webhook that grants tier access
    // could never write a settled-revenue receipt for it — subscription money
    // was real but invisible in settled_revenue_cents_all_time. Mirrors
    // credit_pack_purchases's exact shape (pending -> succeeded, keyed by
    // paid_session_id, idempotent on webhook retry) rather than inventing a
    // new pattern for the same problem.
    version: 44,
    name: "subscription_purchases",
    sql: `CREATE TABLE IF NOT EXISTS subscription_purchases (
  purchase_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  target_tier TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_session_id TEXT,
  paid_payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  succeeded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_subscription_purchases_account ON subscription_purchases(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_purchases_session ON subscription_purchases(paid_session_id) WHERE paid_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscription_purchases_status ON subscription_purchases(status);`,
  },
  {
    // app_32: the debug program's Sentry connect flow ("plain REST to Sentry
    // API — deliberately no SDK / user connects their Sentry token",
    // APPLICATION_BUILD_STRATEGY.md #8). Mirrors github_tokens' exact shape
    // (AES-256-GCM via the same AXIS_TOKEN_KEY, token_prefix for display,
    // valid flag) rather than inventing a new pattern for the same problem —
    // with three additions github_tokens doesn't need: org_slug/project_slug
    // (a Sentry API token is only usable against a specific org+project) and
    // repo_full_name (the mapping that tells the incident webhook WHICH
    // watched repo a Sentry project's incidents belong to — GitHub webhooks
    // carry the repo name in the payload; Sentry webhooks carry only the
    // project, so the join must be stored at connect time). encrypted_webhook_secret
    // is the per-connection signing secret for POST /v1/sentry/webhook —
    // per-connection rather than a global env var because each user's Sentry
    // integration signs with its own secret; a connection without one stored
    // cannot trigger the webhook (fail closed), only manual regeneration.
    version: 45,
    name: "sentry_tokens",
    sql: `CREATE TABLE IF NOT EXISTS sentry_tokens (
  token_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  label TEXT NOT NULL DEFAULT 'default',
  token_prefix TEXT NOT NULL,
  encrypted_token TEXT NOT NULL,
  org_slug TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  encrypted_webhook_secret TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  valid INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_sentry_tokens_account ON sentry_tokens(account_id);
CREATE INDEX IF NOT EXISTS idx_sentry_tokens_project ON sentry_tokens(project_slug);`,
  },
  {
    // app_33: the optimization program's provider-key connect flow ("plain
    // REST to OpenAI/Anthropic usage endpoints — user connects provider admin
    // keys", APPLICATION_BUILD_STRATEGY.md #9). GENERALIZED rather than a
    // third bespoke mirror of github_tokens/sentry_tokens' shape — this
    // candidate needs TWO providers (OpenAI, Anthropic) with different extra
    // fields (an OpenAI org id; Anthropic needs none today), and a third
    // hand-copied encryption table is exactly the hand-duplicated-catalog
    // drift family this repo's own tooling (tool_01_redundancy_sweep) exists
    // to catch — caught here at design time instead. `provider` discriminates
    // the row; `metadata` (TEXT JSON, matching this schema's existing
    // metadata-column convention — see funnel_events/webhooks/api_keys) holds
    // whatever a given provider needs beyond the shared columns, so a THIRD
    // provider is a data value, not a migration. Same AES-256-GCM scheme via
    // the same AXIS_TOKEN_KEY as the two mirrors it declines to become a
    // third of — the encryption code is proven, only the table shape changes.
    // DELIBERATE NON-ACTION, recorded rather than silent: github_tokens and
    // sentry_tokens are NOT retroactively migrated onto this shape. Both are
    // shipped and live; a data migration with a dual-read fallback window is
    // real, separate, riskier scope with its own blast radius — not something
    // to fold into a candidate that doesn't need it. Revisit only if a fourth
    // provider-credential need actually arrives.
    version: 46,
    name: "provider_credentials",
    sql: `CREATE TABLE IF NOT EXISTS provider_credentials (
  credential_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  provider TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'default',
  key_prefix TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  valid INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_provider_credentials_account ON provider_credentials(account_id);
CREATE INDEX IF NOT EXISTS idx_provider_credentials_account_provider ON provider_credentials(account_id, provider);
CREATE INDEX IF NOT EXISTS idx_provider_credentials_repo ON provider_credentials(repo_full_name);`,
  },
  {
    // @axis/revops — the revenue pipeline (see packages/revops/README.md).
    //
    // TWO TABLES, and the split is the whole design. `revops_prospects` holds
    // durable identity + enriched facts; `revops_events` is an APPEND-ONLY log
    // of things that actually happened. There is deliberately NO `stage`
    // column anywhere: stage and next_action are derived from the event log on
    // read (packages/revops/src/stages.ts). Adding a stage column here would
    // let stored state drift from the events and turn this back into a CRM.
    //
    // `seq` is BIGINT GENERATED ALWAYS AS IDENTITY so ordering is authoritative
    // and independent of `at` — timestamps collide and skew across ingesters,
    // and the fold in deriveState() sorts by seq for exactly that reason.
    // Mirrors the funnel_events_seq_tiebreaker precedent in v28.
    //
    // No FK to accounts: prospects are OUR sales targets, not Iliad accounts.
    // A prospect only becomes an account if we actually close them, and that
    // link (if ever needed) belongs in facts, not a constraint that would make
    // ingestion depend on account creation.
    version: 47,
    name: "closer_pipeline",
    sql: `CREATE TABLE IF NOT EXISTS revops_prospects (
  prospect_id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  website TEXT,
  source_id TEXT NOT NULL,
  facts TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revops_prospects_source ON revops_prospects(source_id);
CREATE INDEX IF NOT EXISTS idx_revops_prospects_created ON revops_prospects(created_at);
-- Dedup guard: the same company ingested twice from public sources must not
-- become two prospects that both get contacted. Website is the strongest cheap
-- key; partial so rows without one are still allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_revops_prospects_website
  ON revops_prospects(lower(website)) WHERE website IS NOT NULL;

CREATE TABLE IF NOT EXISTS revops_events (
  seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES revops_prospects(prospect_id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  at TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  actor TEXT
);
CREATE INDEX IF NOT EXISTS idx_revops_events_prospect ON revops_events(prospect_id, seq);
CREATE INDEX IF NOT EXISTS idx_revops_events_type ON revops_events(type);
CREATE INDEX IF NOT EXISTS idx_revops_events_at ON revops_events(at);`,
  },
];

/**
 * Stand up / upgrade the Postgres schema. Idempotent: applies the cumulative
 * baseline, stamps it at PG_LATEST_VERSION, then runs any PG_MIGRATIONS beyond it.
 */
export async function runPgMigrations(): Promise<{ current_version: number; applied: number }> {
  await sql.exec(PG_SCHEMA);

  const row = await sql.one<{ v: number | null }>("SELECT MAX(version) AS v FROM schema_migrations");
  let current = row?.v ?? 0;
  if (current < PG_LATEST_VERSION) {
    await sql.run(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?) ON CONFLICT (version) DO NOTHING",
      [PG_LATEST_VERSION, "pg_baseline_v27", new Date().toISOString()],
    );
    current = PG_LATEST_VERSION;
  }

  let applied = 0;
  for (const m of PG_MIGRATIONS.filter((m) => m.version > current).sort((a, b) => a.version - b.version)) {
    await sql.exec(m.sql);
    await sql.run("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", [
      m.version,
      m.name,
      new Date().toISOString(),
    ]);
    applied++;
    current = m.version;
  }
  return { current_version: current, applied };
}

export async function getPgSchemaVersion(): Promise<number> {
  const row = await sql.one<{ v: number | null }>("SELECT MAX(version) AS v FROM schema_migrations");
  return row?.v ?? 0;
}

/** Drop every Iliad table (test teardown / clean reprovision). */
export async function dropAllPgTables(): Promise<void> {
  await sql.exec(`
    DO $$ DECLARE r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = current_schema()) LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);
}
