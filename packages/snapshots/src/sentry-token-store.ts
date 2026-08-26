import { randomUUID, createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { sql } from "./pg.js";

// ─── app_32: Sentry connection store ────────────────────────────
//
// Mirrors github-token-store.ts deliberately — same AES-256-GCM scheme, same
// AXIS_TOKEN_KEY, same iv:tag:ciphertext wire format, same fail-closed
// production behavior — because two encryption patterns for the same problem
// is how one of them silently rots. Differences from github_tokens are the
// three columns a Sentry connection needs and a GitHub token doesn't:
// org_slug/project_slug (the token is only usable against a specific
// org+project via plain REST), repo_full_name (the join from an incoming
// Sentry incident to the watched repo — Sentry webhooks carry only the
// project, so the mapping must be stored at connect time), and a
// per-connection webhook signing secret (each user's Sentry integration
// signs with its own secret; there is no global one to verify against).

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

let warnedDevKeyFallback = false;

function getEncryptionKey(): Buffer {
  const envKey = process.env.AXIS_TOKEN_KEY;
  if (envKey && envKey.length >= 32) {
    return Buffer.from(envKey.slice(0, 32), "utf-8");
  }
  if (process.env.NODE_ENV === "production") {
    // Fail closed: never encrypt real tokens with the well-known dev key.
    throw new Error(
      "AXIS_TOKEN_KEY must be set to a 32+ char secret in production — refusing to encrypt Sentry tokens with the public dev key",
    );
  }
  // Deterministic fallback for development — NOT suitable for production
  if (!warnedDevKeyFallback) {
    warnedDevKeyFallback = true;
    console.warn(
      "[sentry-token-store] AXIS_TOKEN_KEY is unset or shorter than 32 chars — falling back to the public dev encryption key (development only). Set AXIS_TOKEN_KEY before deploying.",
    );
  }
  return createHash("sha256").update("axis-dev-token-key").digest();
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted token format");
  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const encrypted = Buffer.from(parts[2], "hex");
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  // Concat the raw buffers and decode ONCE — see the identical fix in
  // provider-credential-store.ts. `update(...) + final("utf-8")` decoded the
  // first chunk independently via Buffer's implicit toString(), corrupting any
  // multi-byte UTF-8 character that straddled the chunk boundary.
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
}

// ─── Types ──────────────────────────────────────────────────────

/** Metadata-only view — never carries a decrypted secret. */
export interface SentryConnection {
  token_id: string;
  account_id: string;
  label: string;
  token_prefix: string; // first 8 chars for display
  org_slug: string;
  project_slug: string;
  repo_full_name: string;
  has_webhook_secret: boolean;
  created_at: string;
  last_used_at: string | null;
  valid: number; // 1 = valid, 0 = invalid/revoked
}

/** Decrypted view for the watcher/webhook — internal use only, never serialized to a response. */
export interface SentryConnectionSecrets {
  token_id: string;
  account_id: string;
  org_slug: string;
  project_slug: string;
  repo_full_name: string;
  token: string;
  webhook_secret: string | null;
}

interface SentryTokenRow {
  token_id: string;
  account_id: string;
  label: string;
  token_prefix: string;
  encrypted_token: string;
  org_slug: string;
  project_slug: string;
  repo_full_name: string;
  encrypted_webhook_secret: string | null;
  created_at: string;
  last_used_at: string | null;
  valid: number;
}

// ─── Store functions ────────────────────────────────────────────

export async function saveSentryConnection(
  account_id: string,
  rawToken: string,
  org_slug: string,
  project_slug: string,
  repo_full_name: string,
  opts: { label?: string; webhook_secret?: string } = {},
): Promise<SentryConnection> {
  const token_id = randomUUID();
  const now = new Date().toISOString();
  const label = opts.label ?? "default";
  const encrypted_webhook_secret = opts.webhook_secret ? encrypt(opts.webhook_secret) : null;

  await sql.run(
    `INSERT INTO sentry_tokens
       (token_id, account_id, label, token_prefix, encrypted_token, org_slug, project_slug, repo_full_name, encrypted_webhook_secret, created_at, last_used_at, valid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      token_id, account_id, label, rawToken.slice(0, 8),
      encrypt(rawToken), org_slug, project_slug, repo_full_name,
      encrypted_webhook_secret, now, null, 1,
    ],
  );

  return {
    token_id, account_id, label,
    token_prefix: rawToken.slice(0, 8),
    org_slug, project_slug, repo_full_name,
    has_webhook_secret: encrypted_webhook_secret !== null,
    created_at: now, last_used_at: null, valid: 1,
  };
}

const METADATA_COLUMNS =
  "token_id, account_id, label, token_prefix, org_slug, project_slug, repo_full_name, encrypted_webhook_secret, created_at, last_used_at, valid";

function toMetadata(row: Omit<SentryTokenRow, "encrypted_token">): SentryConnection {
  return {
    token_id: row.token_id,
    account_id: row.account_id,
    label: row.label,
    token_prefix: row.token_prefix,
    org_slug: row.org_slug,
    project_slug: row.project_slug,
    repo_full_name: row.repo_full_name,
    has_webhook_secret: row.encrypted_webhook_secret !== null,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    valid: row.valid,
  };
}

/** Metadata only — encrypted_token is never selected here. */
export async function getSentryConnections(account_id: string): Promise<SentryConnection[]> {
  const rows = await sql.many<Omit<SentryTokenRow, "encrypted_token">>(
    `SELECT ${METADATA_COLUMNS} FROM sentry_tokens WHERE account_id = ? ORDER BY created_at DESC`,
    [account_id],
  );
  return rows.map(toMetadata);
}

/**
 * Decrypted connection for the watcher's outbound Sentry REST calls.
 * Newest valid connection for the account+repo pair — a repo maps to one
 * Sentry project in practice; if a user reconnects, the newer row wins.
 */
export async function getSentryConnectionDecrypted(
  account_id: string,
  repo_full_name: string,
): Promise<SentryConnectionSecrets | undefined> {
  const row = await sql.one<SentryTokenRow>(
    `SELECT * FROM sentry_tokens WHERE account_id = ? AND repo_full_name = ? AND valid = 1 ORDER BY created_at DESC LIMIT 1`,
    [account_id, repo_full_name],
  );
  if (!row) return undefined;
  return {
    token_id: row.token_id,
    account_id: row.account_id,
    org_slug: row.org_slug,
    project_slug: row.project_slug,
    repo_full_name: row.repo_full_name,
    token: decrypt(row.encrypted_token),
    webhook_secret: row.encrypted_webhook_secret ? decrypt(row.encrypted_webhook_secret) : null,
  };
}

/**
 * Every valid connection watching a Sentry project — the webhook handler's
 * candidate set for signature verification. A Sentry webhook names only the
 * project, not the account, so verification tries each candidate's own
 * secret; connections without a stored secret are excluded (fail closed:
 * they can never trigger, only be listed and used outbound).
 */
export async function getSentryConnectionsForProject(project_slug: string): Promise<SentryConnectionSecrets[]> {
  const rows = await sql.many<SentryTokenRow>(
    `SELECT * FROM sentry_tokens WHERE project_slug = ? AND valid = 1 AND encrypted_webhook_secret IS NOT NULL ORDER BY created_at DESC`,
    [project_slug],
  );
  return rows.map((row) => ({
    token_id: row.token_id,
    account_id: row.account_id,
    org_slug: row.org_slug,
    project_slug: row.project_slug,
    repo_full_name: row.repo_full_name,
    token: decrypt(row.encrypted_token),
    webhook_secret: row.encrypted_webhook_secret ? decrypt(row.encrypted_webhook_secret) : null,
  }));
}

export async function deleteSentryConnection(account_id: string, token_id: string): Promise<boolean> {
  const result = await sql.run(
    "DELETE FROM sentry_tokens WHERE account_id = ? AND token_id = ?",
    [account_id, token_id],
  );
  return result.rowCount > 0;
}

export async function markSentryConnectionUsed(token_id: string): Promise<void> {
  await sql.run(
    "UPDATE sentry_tokens SET last_used_at = ? WHERE token_id = ?",
    [new Date().toISOString(), token_id],
  );
}

export async function markSentryConnectionInvalid(token_id: string): Promise<void> {
  await sql.run(
    "UPDATE sentry_tokens SET valid = 0 WHERE token_id = ?",
    [token_id],
  );
}
