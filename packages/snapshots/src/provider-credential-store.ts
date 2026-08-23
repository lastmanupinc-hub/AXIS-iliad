import { randomUUID, createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { sql } from "./pg.js";

// ─── app_33: provider-key connection store ──────────────────────
//
// Same AES-256-GCM / AXIS_TOKEN_KEY scheme as github-token-store.ts and
// sentry-token-store.ts, deliberately NOT a third bespoke table — see the
// migration comment (pg-schema.ts v46) for why. `provider` discriminates the
// row ("openai" | "anthropic" today); `metadata` is a JSON string for
// whatever a provider needs beyond the shared columns (an OpenAI org id, for
// instance) — a third provider is a data value here, not a migration.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

let warnedDevKeyFallback = false;

function getEncryptionKey(): Buffer {
  const envKey = process.env.AXIS_TOKEN_KEY;
  if (envKey && envKey.length >= 32) {
    return Buffer.from(envKey.slice(0, 32), "utf-8");
  }
  if (process.env.NODE_ENV === "production") {
    // Fail closed: never encrypt real keys with the well-known dev key.
    throw new Error(
      "AXIS_TOKEN_KEY must be set to a 32+ char secret in production — refusing to encrypt provider keys with the public dev key",
    );
  }
  // Deterministic fallback for development — NOT suitable for production
  if (!warnedDevKeyFallback) {
    warnedDevKeyFallback = true;
    console.warn(
      "[provider-credential-store] AXIS_TOKEN_KEY is unset or shorter than 32 chars — falling back to the public dev encryption key (development only). Set AXIS_TOKEN_KEY before deploying.",
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
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted key format");
  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const encrypted = Buffer.from(parts[2], "hex");
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf-8");
}

// ─── Types ──────────────────────────────────────────────────────

export type LlmProvider = "openai" | "anthropic";

export interface ProviderCredential {
  credential_id: string;
  account_id: string;
  provider: LlmProvider;
  label: string;
  key_prefix: string;
  repo_full_name: string;
  metadata: Record<string, unknown>;
  created_at: string;
  last_used_at: string | null;
  valid: number;
}

export interface ProviderCredentialSecrets {
  credential_id: string;
  account_id: string;
  provider: LlmProvider;
  repo_full_name: string;
  key: string;
  metadata: Record<string, unknown>;
}

interface ProviderCredentialRow {
  credential_id: string;
  account_id: string;
  provider: string;
  label: string;
  key_prefix: string;
  encrypted_key: string;
  repo_full_name: string;
  metadata: string;
  created_at: string;
  last_used_at: string | null;
  valid: number;
}

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toMetadataView(row: Omit<ProviderCredentialRow, "encrypted_key">): ProviderCredential {
  return {
    credential_id: row.credential_id,
    account_id: row.account_id,
    provider: row.provider as LlmProvider,
    label: row.label,
    key_prefix: row.key_prefix,
    repo_full_name: row.repo_full_name,
    metadata: parseMetadata(row.metadata),
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    valid: row.valid,
  };
}

// ─── Store functions ────────────────────────────────────────────

export async function saveProviderCredential(
  account_id: string,
  provider: LlmProvider,
  rawKey: string,
  repo_full_name: string,
  opts: { label?: string; metadata?: Record<string, unknown> } = {},
): Promise<ProviderCredential> {
  const credential_id = randomUUID();
  const now = new Date().toISOString();
  const label = opts.label ?? "default";
  const metadata = opts.metadata ?? {};

  await sql.run(
    `INSERT INTO provider_credentials
       (credential_id, account_id, provider, label, key_prefix, encrypted_key, repo_full_name, metadata, created_at, last_used_at, valid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      credential_id, account_id, provider, label, rawKey.slice(0, 8),
      encrypt(rawKey), repo_full_name, JSON.stringify(metadata), now, null, 1,
    ],
  );

  return {
    credential_id, account_id, provider, label,
    key_prefix: rawKey.slice(0, 8),
    repo_full_name, metadata,
    created_at: now, last_used_at: null, valid: 1,
  };
}

const METADATA_COLUMNS =
  "credential_id, account_id, provider, label, key_prefix, repo_full_name, metadata, created_at, last_used_at, valid";

/** Metadata only — encrypted_key is never selected here. */
export async function getProviderCredentials(account_id: string): Promise<ProviderCredential[]> {
  const rows = await sql.many<Omit<ProviderCredentialRow, "encrypted_key">>(
    `SELECT ${METADATA_COLUMNS} FROM provider_credentials WHERE account_id = ? ORDER BY created_at DESC`,
    [account_id],
  );
  return rows.map(toMetadataView);
}

/**
 * Decrypted credential for one provider, for the watcher's outbound usage
 * pulls. Newest valid credential for the account+provider+repo triple.
 */
export async function getProviderCredentialDecrypted(
  account_id: string,
  provider: LlmProvider,
  repo_full_name: string,
): Promise<ProviderCredentialSecrets | undefined> {
  const row = await sql.one<ProviderCredentialRow>(
    `SELECT * FROM provider_credentials WHERE account_id = ? AND provider = ? AND repo_full_name = ? AND valid = 1 ORDER BY created_at DESC LIMIT 1`,
    [account_id, provider, repo_full_name],
  );
  if (!row) return undefined;
  return {
    credential_id: row.credential_id,
    account_id: row.account_id,
    provider: row.provider as LlmProvider,
    repo_full_name: row.repo_full_name,
    key: decrypt(row.encrypted_key),
    metadata: parseMetadata(row.metadata),
  };
}

/** Every valid credential for a repo, across providers — the meter watcher pulls whichever providers are connected. */
export async function getProviderCredentialsForRepo(account_id: string, repo_full_name: string): Promise<ProviderCredentialSecrets[]> {
  const rows = await sql.many<ProviderCredentialRow>(
    `SELECT * FROM provider_credentials WHERE account_id = ? AND repo_full_name = ? AND valid = 1 ORDER BY provider, created_at DESC`,
    [account_id, repo_full_name],
  );
  const seen = new Set<string>();
  const out: ProviderCredentialSecrets[] = [];
  for (const row of rows) {
    if (seen.has(row.provider)) continue; // newest per provider only
    seen.add(row.provider);
    out.push({
      credential_id: row.credential_id,
      account_id: row.account_id,
      provider: row.provider as LlmProvider,
      repo_full_name: row.repo_full_name,
      key: decrypt(row.encrypted_key),
      metadata: parseMetadata(row.metadata),
    });
  }
  return out;
}

export async function deleteProviderCredential(account_id: string, credential_id: string): Promise<boolean> {
  const result = await sql.run(
    "DELETE FROM provider_credentials WHERE account_id = ? AND credential_id = ?",
    [account_id, credential_id],
  );
  return result.rowCount > 0;
}

export async function markProviderCredentialUsed(credential_id: string): Promise<void> {
  await sql.run(
    "UPDATE provider_credentials SET last_used_at = ? WHERE credential_id = ?",
    [new Date().toISOString(), credential_id],
  );
}

export async function markProviderCredentialInvalid(credential_id: string): Promise<void> {
  await sql.run(
    "UPDATE provider_credentials SET valid = 0 WHERE credential_id = ?",
    [credential_id],
  );
}
