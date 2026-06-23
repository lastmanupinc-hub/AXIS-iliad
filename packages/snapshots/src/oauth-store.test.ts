import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { createAccount, getAccountByEmail, resolveApiKey } from "./billing-store.js";
import {
  createOAuthState,
  consumeOAuthState,
  createAuthCode,
  consumeAuthCode,
  getGitHubAuthUrl,
  exchangeGitHubCode,
  getGitHubUser,
  getAccountByGitHubId,
  linkGitHubId,
  upsertAccountByGitHub,
} from "./oauth-store.js";

beforeEach(async () => { await resetTestDb(); });

// ─── OAuth state (CSRF protection) ──────────────────────────────

describe("OAuth state management", () => {
  it("creates a random 64-char hex state", async () => {
    const state = await createOAuthState();
    expect(state).toMatch(/^[0-9a-f]{64}$/);
  });

  it("consumes a valid state exactly once", async () => {
    const state = await createOAuthState();
    expect(await consumeOAuthState(state)).toBe(true);
    expect(await consumeOAuthState(state)).toBe(false);
  });

  it("rejects unknown state", async () => {
    expect(await consumeOAuthState("nonexistent")).toBe(false);
  });

  it("rejects expired state", async () => {
    const state = await createOAuthState();
    // Manually backdate the created_at to > 10 minutes ago
    const expired = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    await sql.run("UPDATE oauth_states SET created_at = ? WHERE state = ?", [expired, state]);
    expect(await consumeOAuthState(state)).toBe(false);
  });
});

// ─── GitHub auth URL builder ────────────────────────────────────

describe("getGitHubAuthUrl", () => {
  it("builds correct GitHub authorize URL", async () => {
    const url = getGitHubAuthUrl("my-client-id", "http://localhost:4000/callback", "abc123");
    expect(url).toContain("https://github.com/login/oauth/authorize?");
    expect(url).toContain("client_id=my-client-id");
    expect(url).toContain("redirect_uri=http");
    expect(url).toContain("state=abc123");
    expect(url).toContain("scope=read%3Auser+user%3Aemail");
  });
});

// ─── GitHub ID linking ──────────────────────────────────────────

describe("GitHub ID linking", () => {
  it("links and retrieves account by github_id", async () => {
    const acct = await createAccount("Bob", "bob@example.com");
    await linkGitHubId(acct.account_id, "12345");

    const found = await getAccountByGitHubId("12345");
    expect(found).toBeDefined();
    expect(found!.account_id).toBe(acct.account_id);
  });

  it("returns undefined for unknown github_id", async () => {
    expect(await getAccountByGitHubId("99999")).toBeUndefined();
  });

  it("returns false when linking to nonexistent account", async () => {
    expect(await linkGitHubId("no-such-account", "12345")).toBe(false);
  });
});

// ─── Account upsert by GitHub ───────────────────────────────────

describe("upsertAccountByGitHub", () => {
  it("creates new account when no match exists", async () => {
    const { account, rawKey } = await upsertAccountByGitHub(42, "Alice", "alice@gh.com");
    expect(account.name).toBe("Alice");
    expect(account.email).toBe("alice@gh.com");
    expect(rawKey).toMatch(/^axis_/);

    // Verify github_id was linked
    const found = await getAccountByGitHubId("42");
    expect(found!.account_id).toBe(account.account_id);

    // Verify key resolves
    const resolved = await resolveApiKey(rawKey);
    expect(resolved).toBeDefined();
    expect(resolved!.account.account_id).toBe(account.account_id);
  });

  it("matches existing account by github_id", async () => {
    const existing = await createAccount("Bob", "bob@example.com");
    await linkGitHubId(existing.account_id, "100");

    const { account, rawKey } = await upsertAccountByGitHub(100, "Bob Updated", "bob-new@example.com");
    expect(account.account_id).toBe(existing.account_id);
    expect(rawKey).toMatch(/^axis_/);
  });

  it("matches existing account by email and links github_id", async () => {
    const existing = await createAccount("Carol", "carol@example.com");

    const { account, rawKey } = await upsertAccountByGitHub(200, "Carol GH", "carol@example.com");
    expect(account.account_id).toBe(existing.account_id);
    expect(rawKey).toMatch(/^axis_/);

    // github_id should now be linked
    const found = await getAccountByGitHubId("200");
    expect(found!.account_id).toBe(existing.account_id);
  });

  it("uses fallback name and email when null", async () => {
    const { account } = await upsertAccountByGitHub(300, null, null);
    expect(account.name).toBe("github-300");
    expect(account.email).toBe("300@github.oauth");
  });

  it("creates new account when email doesn't match", async () => {
    await createAccount("Dave", "dave@example.com");

    const { account } = await upsertAccountByGitHub(400, "Eve", "eve@example.com");
    expect(account.email).toBe("eve@example.com");
    expect(account.name).toBe("Eve");
  });
});

// ─── Migration v9 check ─────────────────────────────────────────

describe("OAuth migration", () => {
  it("accounts table has github_id column", async () => {
    // Postgres equivalent of SQLite's pragma table_info(accounts).
    const cols = await sql.many<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'accounts'",
    );
    const names = cols.map((c) => c.name);
    expect(names).toContain("github_id");
  });

  it("oauth_states table exists", async () => {
    // Postgres equivalent of querying SQLite's sqlite_master for the table.
    const tables = await sql.many<{ name: string }>(
      "SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema() AND tablename = 'oauth_states'",
    );
    expect(tables).toHaveLength(1);
  });

  it("github_id unique index enforced", async () => {
    const a1 = await createAccount("X", "x@test.com");
    const a2 = await createAccount("Y", "y@test.com");
    await linkGitHubId(a1.account_id, "unique-gh-id");
    await expect(linkGitHubId(a2.account_id, "unique-gh-id")).rejects.toThrow();
  });
});

// ─── exchangeGitHubCode (mocked fetch) ──────────────────────────

describe("one-time auth code", () => {
  it("hands back the raw key exactly once (single-use)", async () => {
    const code = createAuthCode("axis_rawkey_abc");
    expect(consumeAuthCode(code)).toBe("axis_rawkey_abc");
    expect(consumeAuthCode(code)).toBeNull(); // already consumed
  });

  it("returns null for an unknown code", async () => {
    expect(consumeAuthCode("does-not-exist")).toBeNull();
  });

  it("issues distinct codes per call", async () => {
    expect(createAuthCode("k1")).not.toBe(createAuthCode("k2"));
  });
});

describe("exchangeGitHubCode", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns access token on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "gho_abc123", token_type: "bearer", scope: "read:user" }),
    } as Response);

    const result = await exchangeGitHubCode("cid", "csecret", "code123");
    expect(result.access_token).toBe("gho_abc123");
    expect(result.token_type).toBe("bearer");
  });

  it("throws on non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    await expect(exchangeGitHubCode("cid", "csecret", "bad")).rejects.toThrow("GitHub token exchange failed: 500");
  });

  it("throws on GitHub error response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: "bad_verification_code", error_description: "The code has expired" }),
    } as Response);

    await expect(exchangeGitHubCode("cid", "csecret", "expired")).rejects.toThrow("The code has expired");
  });

  it("uses error field when no description", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: "bad_code" }),
    } as Response);

    await expect(exchangeGitHubCode("cid", "csecret", "x")).rejects.toThrow("bad_code");
  });

  it("throws when a 200 response carries no access_token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_type: "bearer", scope: "read:user" }), // no access_token, no error
    } as Response);

    await expect(exchangeGitHubCode("cid", "csecret", "weird")).rejects.toThrow("no access_token");
  });
});

// ─── getGitHubUser (mocked fetch) ───────────────────────────────

describe("getGitHubUser", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns user profile on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 42, login: "octocat", name: "The Octocat", email: "octocat@github.com" }),
    } as Response);

    const user = await getGitHubUser("gho_token");
    expect(user.id).toBe(42);
    expect(user.login).toBe("octocat");
    expect(user.name).toBe("The Octocat");
    expect(user.email).toBe("octocat@github.com");
  });

  it("throws on non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    await expect(getGitHubUser("bad-token")).rejects.toThrow("GitHub user fetch failed: 401");
  });
});
