import { randomUUID, createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getDb } from "./db.js";

// ─── Encryption helpers (AES-256-GCM) ───────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const envKey = process.env.AXIS_TOKEN_KEY;
  if (envKey && envKey.length >= 32) {
    return Buffer.from(envKey.slice(0, 32), "utf-8");
  }
  // Deterministic fallback for development — NOT suitable for production
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

export function saveGitHubToken(
  account_id: string,
  rawToken: string,
  label: string = "default",
  scopes: string[] = [],
  expires_at?: string,
): GitHubToken {
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

  getDb().prepare(
    `INSERT INTO github_tokens
       (token_id, account_id, label, token_prefix, encrypted_token, scopes, created_at, expires_at, last_used_at, last_validated_at, valid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    token.token_id, token.account_id, token.label, token.token_prefix,
    encrypted, token.scopes, token.created_at, token.expires_at,
    token.last_used_at, token.last_validated_at, token.valid,
  );

  return token;
}

export function getGitHubTokens(account_id: string): GitHubToken[] {
  return getDb().prepare(
    "SELECT token_id, account_id, label, token_prefix, scopes, created_at, expires_at, last_used_at, last_validated_at, valid FROM github_tokens WHERE account_id = ? ORDER BY created_at DESC",
  ).all(account_id) as GitHubToken[];
}

export function getGitHubTokenDecrypted(account_id: string, token_id?: string): string | undefined {
  const query = token_id
    ? "SELECT encrypted_token FROM github_tokens WHERE account_id = ? AND token_id = ? AND valid = 1"
    : "SELECT encrypted_token FROM github_tokens WHERE account_id = ? AND valid = 1 ORDER BY created_at DESC LIMIT 1";
  const params = token_id ? [account_id, token_id] : [account_id];
  const row = getDb().prepare(query).get(...params) as { encrypted_token: string } | undefined;
  if (!row) return undefined;
  return decrypt(row.encrypted_token);
}

export function deleteGitHubToken(account_id: string, token_id: string): boolean {
  const result = getDb().prepare(
    "DELETE FROM github_tokens WHERE account_id = ? AND token_id = ?",
  ).run(account_id, token_id);
  return result.changes > 0;
}

export function markTokenUsed(token_id: string): void {
  getDb().prepare(
    "UPDATE github_tokens SET last_used_at = ? WHERE token_id = ?",
  ).run(new Date().toISOString(), token_id);
}

export function markTokenInvalid(token_id: string): void {
  getDb().prepare(
    "UPDATE github_tokens SET valid = 0 WHERE token_id = ?",
  ).run(token_id);
}

export function markTokenValidated(token_id: string, scopes: string[]): void {
  getDb().prepare(
    "UPDATE github_tokens SET last_validated_at = ?, scopes = ?, valid = 1 WHERE token_id = ?",
  ).run(new Date().toISOString(), scopes.join(","), token_id);
}
