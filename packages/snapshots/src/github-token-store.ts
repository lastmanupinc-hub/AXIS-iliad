import { randomUUID, createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { sql } from "./pg.js";

// ─── Encryption helpers (AES-256-GCM) ───────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let warnedDevKeyFallback = false;

function getEncryptionKey(): Buffer {
  const envKey = process.env.AXIS_TOKEN_KEY;
  if (envKey && envKey.length >= 32) {
    return Buffer.from(envKey.slice(0, 32), "utf-8");
  }
  if (process.env.NODE_ENV === "production") {
    // Fail closed: never encrypt real tokens with the well-known dev key.
    throw new Error(
      "AXIS_TOKEN_KEY must be set to a 32+ char secret in production — refusing to encrypt GitHub tokens with the public dev key",
    );
  }
  // Deterministic fallback for development — NOT suitable for production
  if (!warnedDevKeyFallback) {
    warnedDevKeyFallback = true;
    console.warn(
      "[github-token-store] AXIS_TOKEN_KEY is unset or shorter than 32 chars — falling back to the public dev encryption key (development only). Set AXIS_TOKEN_KEY before deploying.",
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
  return decipher.update(encrypted) + decipher.final("utf-8");
}

// ─── Types ──────────────────────────────────────────────────────

export interface GitHubToken {
  token_id: string;
  account_id: string;
  label: string;
  token_prefix: string;   // first 8 chars for display
  scopes: string;          // comma-separated validated scopes
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  last_validated_at: string | null;
  valid: number;           // 1 = valid, 0 = invalid/expired
}

// ─── Store functions ────────────────────────────────────────────

export async function saveGitHubToken(
  account_id: string,
  rawToken: string,
  label: string = "default",
  scopes: string[] = [],
  expires_at?: string,
): Promise<GitHubToken> {
  const token_id = randomUUID();
  const encrypted = encrypt(rawToken);
  const token_prefix = rawToken.slice(0, 8);
  const now = new Date().toISOString();

  const token: GitHubToken = {
    token_id,
    account_id,
    label,
    token_prefix,
    scopes: scopes.join(","),
    created_at: now,
    expires_at: expires_at ?? null,
    last_used_at: null,
    last_validated_at: now,
    valid: 1,
  };

  await sql.run(
    `INSERT INTO github_tokens
       (token_id, account_id, label, token_prefix, encrypted_token, scopes, created_at, expires_at, last_used_at, last_validated_at, valid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      token.token_id, token.account_id, token.label, token.token_prefix,
      encrypted, token.scopes, token.created_at, token.expires_at,
      token.last_used_at, token.last_validated_at, token.valid,
    ],
  );

  return token;
}

export async function getGitHubTokens(account_id: string): Promise<GitHubToken[]> {
  return await sql.many<GitHubToken>(
    "SELECT token_id, account_id, label, token_prefix, scopes, created_at, expires_at, last_used_at, last_validated_at, valid FROM github_tokens WHERE account_id = ? ORDER BY created_at DESC",
    [account_id],
  );
}

export async function getGitHubTokenDecrypted(account_id: string, token_id?: string): Promise<string | undefined> {
  const query = token_id
    ? "SELECT encrypted_token FROM github_tokens WHERE account_id = ? AND token_id = ? AND valid = 1"
    : "SELECT encrypted_token FROM github_tokens WHERE account_id = ? AND valid = 1 ORDER BY created_at DESC LIMIT 1";
  const params = token_id ? [account_id, token_id] : [account_id];
  const row = await sql.one<{ encrypted_token: string }>(query, params);
  if (!row) return undefined;
  return decrypt(row.encrypted_token);
}

export async function deleteGitHubToken(account_id: string, token_id: string): Promise<boolean> {
  const result = await sql.run(
    "DELETE FROM github_tokens WHERE account_id = ? AND token_id = ?",
    [account_id, token_id],
  );
  return result.rowCount > 0;
}

export async function markTokenUsed(token_id: string): Promise<void> {
  await sql.run(
    "UPDATE github_tokens SET last_used_at = ? WHERE token_id = ?",
    [new Date().toISOString(), token_id],
  );
}

export async function markTokenInvalid(token_id: string): Promise<void> {
  await sql.run(
    "UPDATE github_tokens SET valid = 0 WHERE token_id = ?",
    [token_id],
  );
}

export async function markTokenValidated(token_id: string, scopes: string[]): Promise<void> {
  await sql.run(
    "UPDATE github_tokens SET last_validated_at = ?, scopes = ?, valid = 1 WHERE token_id = ?",
    [new Date().toISOString(), scopes.join(","), token_id],
  );
}
