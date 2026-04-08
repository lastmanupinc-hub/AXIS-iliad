import { randomBytes } from "node:crypto";
import { getDb } from "./db.js";
import { createAccount, getAccountByEmail, createApiKey } from "./billing-store.js";
import type { Account } from "./billing-types.js";

// ─── OAuth state management (CSRF protection) ──────────────────

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function createOAuthState(): string {
  const state = randomBytes(32).toString("hex");
  getDb()
    .prepare("INSERT INTO oauth_states (state, created_at) VALUES (?, ?)")
    .run(state, new Date().toISOString());
  return state;
}

export function consumeOAuthState(state: string): boolean {
  const db = getDb();
  // Delete expired states first
  const cutoff = new Date(Date.now() - STATE_TTL_MS).toISOString();
  db.prepare("DELETE FROM oauth_states WHERE created_at < ?").run(cutoff);

  // Try to consume
  const result = db.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
  return result.changes > 0;
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

  return data as unknown as GitHubTokenResponse;
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

export function getAccountByGitHubId(githubId: string): Account | undefined {
  return getDb()
    .prepare("SELECT * FROM accounts WHERE github_id = ?")
    .get(githubId) as Account | undefined;
}

export function linkGitHubId(accountId: string, githubId: string): boolean {
  const result = getDb()
    .prepare("UPDATE accounts SET github_id = ? WHERE account_id = ?")
    .run(githubId, accountId);
  return result.changes > 0;
}

/**
 * Find or create an account from GitHub OAuth data.
 * Priority: match by github_id → match by email → create new.
 * Returns the account and a fresh API key.
 */
export function upsertAccountByGitHub(
  githubId: number,
  name: string | null,
  email: string | null,
): { account: Account; rawKey: string } {
  const gid = String(githubId);

  // 1. Match by github_id
  const byGid = getAccountByGitHubId(gid);
  if (byGid) {
    const { rawKey } = createApiKey(byGid.account_id, "oauth-login");
    return { account: byGid, rawKey };
  }

  // 2. Match by email — link github_id
  if (email) {
    const byEmail = getAccountByEmail(email);
    if (byEmail) {
      linkGitHubId(byEmail.account_id, gid);
      const { rawKey } = createApiKey(byEmail.account_id, "oauth-login");
      return { account: byEmail, rawKey };
    }
  }

  // 3. Create new account
  const displayName = name ?? `github-${githubId}`;
  const acctEmail = email ?? `${githubId}@github.oauth`;
  const account = createAccount(displayName, acctEmail);
  linkGitHubId(account.account_id, gid);
  const { rawKey } = createApiKey(account.account_id, "oauth-login");
  return { account, rawKey };
}
