import { randomBytes } from "node:crypto";
import { sql } from "./pg.js";
import { createAccount, getAccountByEmail, createApiKey } from "./billing-store.js";
import type { Account } from "./billing-types.js";

// ─── OAuth state management (CSRF protection) ──────────────────

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function createOAuthState(): Promise<string> {
  const state = randomBytes(32).toString("hex");
  await sql.run(
    "INSERT INTO oauth_states (state, created_at) VALUES (?, ?)",
    [state, new Date().toISOString()],
  );
  return state;
}

export async function consumeOAuthState(state: string): Promise<boolean> {
  // Delete expired states first
  const cutoff = new Date(Date.now() - STATE_TTL_MS).toISOString();
  await sql.run("DELETE FROM oauth_states WHERE created_at < ?", [cutoff]);

  // Try to consume
  const result = await sql.run("DELETE FROM oauth_states WHERE state = ?", [state]);
  return result.rowCount > 0;
}

// ─── One-time auth code (OAuth → web app handoff) ──────────────
// In-memory, single-use, short-TTL. The callback redirects with this opaque code
// instead of the raw API key, so the key never lands in the URL / browser history
// / Referer header / access logs. (Single API instance; a restart inside the ~60s
// window just makes the user re-login.)
const AUTH_CODE_TTL_MS = 60 * 1000;
const authCodes = new Map<string, { rawKey: string; expiresAt: number }>();

export function createAuthCode(rawKey: string): string {
  const now = Date.now();
  for (const [c, e] of authCodes) if (now > e.expiresAt) authCodes.delete(c); // lazy sweep
  const code = randomBytes(32).toString("hex");
  authCodes.set(code, { rawKey, expiresAt: now + AUTH_CODE_TTL_MS });
  return code;
}

/** Consume a one-time code, returning the raw API key once (or null if unknown/expired). */
export function consumeAuthCode(code: string): string | null {
  const entry = authCodes.get(code);
  if (!entry) return null;
  authCodes.delete(code); // single-use
  if (Date.now() > entry.expiresAt) return null;
  return entry.rawKey;
}

// ─── GitHub OAuth helpers ───────────────────────────────────────

export function getGitHubAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: "read:user user:email",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export async function exchangeGitHubCode(
  clientId: string,
  clientSecret: string,
  code: string,
): Promise<GitHubTokenResponse> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub token exchange failed: ${res.status}`);
  }

  const data = (await res.json()) as Record<string, string>;
  if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error_description ?? data.error}`);
  }
  // A 200 with no access_token (malformed/unexpected body) previously slipped
  // through `as unknown as` and propagated `access_token: undefined` downstream.
  if (typeof data.access_token !== "string" || data.access_token === "") {
    throw new Error("GitHub token exchange returned no access_token");
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type ?? "bearer",
    scope: data.scope ?? "",
  };
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
}

export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub user fetch failed: ${res.status}`);
  }

  return (await res.json()) as GitHubUser;
}

// ─── Account upsert by GitHub identity ──────────────────────────

export async function getAccountByGitHubId(githubId: string): Promise<Account | undefined> {
  return await sql.one<Account>("SELECT * FROM accounts WHERE github_id = ?", [githubId]);
}

export async function linkGitHubId(accountId: string, githubId: string): Promise<boolean> {
  const result = await sql.run(
    "UPDATE accounts SET github_id = ? WHERE account_id = ?",
    [githubId, accountId],
  );
  return result.rowCount > 0;
}

/**
 * Find or create an account from GitHub OAuth data.
 * Priority: match by github_id → match by email → create new.
 * Returns the account and a fresh API key.
 */
export async function upsertAccountByGitHub(
  githubId: number,
  name: string | null,
  email: string | null,
): Promise<{ account: Account; rawKey: string }> {
  const gid = String(githubId);

  // 1. Match by github_id
  const byGid = await getAccountByGitHubId(gid);
  if (byGid) {
    const { rawKey } = await createApiKey(byGid.account_id, "oauth-login");
    return { account: byGid, rawKey };
  }

  // 2. Match by email — link github_id
  if (email) {
    const byEmail = await getAccountByEmail(email);
    if (byEmail) {
      await linkGitHubId(byEmail.account_id, gid);
      const { rawKey } = await createApiKey(byEmail.account_id, "oauth-login");
      return { account: byEmail, rawKey };
    }
  }

  // 3. Create new account
  const displayName = name ?? `github-${githubId}`;
  const acctEmail = email ?? `${githubId}@github.oauth`;
  const account = await createAccount(displayName, acctEmail);
  await linkGitHubId(account.account_id, gid);
  const { rawKey } = await createApiKey(account.account_id, "oauth-login");
  return { account, rawKey };
}
