import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openMemoryDb, closeDb, getDb } from "./db.js";
import { createAccount, getAccountByEmail, resolveApiKey } from "./billing-store.js";
import {
  createOAuthState,
  consumeOAuthState,
  getGitHubAuthUrl,
  exchangeGitHubCode,
  getGitHubUser,
  getAccountByGitHubId,
  linkGitHubId,
  upsertAccountByGitHub,
} from "./oauth-store.js";

beforeEach(() => { openMemoryDb(); });
afterEach(() => { closeDb(); });

// ─── OAuth state (CSRF protection) ──────────────────────────────

describe("OAuth state management", () => {
  it("creates a random 64-char hex state", () => {
    const state = createOAuthState();
    expect(state).toMatch(/^[0-9a-f]{64}$/);
  });

  it("consumes a valid state exactly once", () => {
    const state = createOAuthState();
    expect(consumeOAuthState(state)).toBe(true);
    expect(consumeOAuthState(state)).toBe(false);
  });

  it("rejects unknown state", () => {
    expect(consumeOAuthState("nonexistent")).toBe(false);
  });

  it("rejects expired state", () => {
    const state = createOAuthState();
    // Manually backdate the created_at to > 10 minutes ago
    const expired = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    getDb().prepare("UPDATE oauth_states SET created_at = ? WHERE state = ?").run(expired, state);
    expect(consumeOAuthState(state)).toBe(false);
  });
});

// ─── GitHub auth URL builder ────────────────────────────────────

describe("getGitHubAuthUrl", () => {
  it("builds correct GitHub authorize URL", () => {
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
  it("links and retrieves account by github_id", () => {
    const acct = createAccount("Bob", "bob@example.com");
    linkGitHubId(acct.account_id, "12345");

    const found = getAccountByGitHubId("12345");
    expect(found).toBeDefined();
    expect(found!.account_id).toBe(acct.account_id);
  });

  it("returns undefined for unknown github_id", () => {
    expect(getAccountByGitHubId("99999")).toBeUndefined();
  });

  it("returns false when linking to nonexistent account", () => {
    expect(linkGitHubId("no-such-account", "12345")).toBe(false);
  });
});

// ─── Account upsert by GitHub ───────────────────────────────────

describe("upsertAccountByGitHub", () => {
  it("creates new account when no match exists", () => {
    const { account, rawKey } = upsertAccountByGitHub(42, "Alice", "alice@gh.com");
    expect(account.name).toBe("Alice");
    expect(account.email).toBe("alice@gh.com");
    expect(rawKey).toMatch(/^axis_/);

    // Verify github_id was linked
    const found = getAccountByGitHubId("42");
    expect(found!.account_id).toBe(account.account_id);

    // Verify key resolves
    const resolved = resolveApiKey(rawKey);
    expect(resolved).toBeDefined();
    expect(resolved!.account.account_id).toBe(account.account_id);
  });

  it("matches existing account by github_id", () => {
    const existing = createAccount("Bob", "bob@example.com");
    linkGitHubId(existing.account_id, "100");

    const { account, rawKey } = upsertAccountByGitHub(100, "Bob Updated", "bob-new@example.com");
    expect(account.account_id).toBe(existing.account_id);
    expect(rawKey).toMatch(/^axis_/);
  });

  it("matches existing account by email and links github_id", () => {
    const existing = createAccount("Carol", "carol@example.com");

    const { account, rawKey } = upsertAccountByGitHub(200, "Carol GH", "carol@example.com");
    expect(account.account_id).toBe(existing.account_id);
    expect(rawKey).toMatch(/^axis_/);

    // github_id should now be linked
    const found = getAccountByGitHubId("200");
    expect(found!.account_id).toBe(existing.account_id);
  });

  it("uses fallback name and email when null", () => {
    const { account } = upsertAccountByGitHub(300, null, null);
    expect(account.name).toBe("github-300");
    expect(account.email).toBe("300@github.oauth");
  });

  it("creates new account when email doesn't match", () => {
    createAccount("Dave", "dave@example.com");

    const { account } = upsertAccountByGitHub(400, "Eve", "eve@example.com");
    expect(account.email).toBe("eve@example.com");
    expect(account.name).toBe("Eve");
  });
});

// ─── Migration v9 check ─────────────────────────────────────────

describe("OAuth migration", () => {
  it("accounts table has github_id column", () => {
    const cols = getDb().pragma("table_info(accounts)") as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("github_id");
  });

  it("oauth_states table exists", () => {
    const tables = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='oauth_states'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  it("github_id unique index enforced", () => {
    const a1 = createAccount("X", "x@test.com");
    const a2 = createAccount("Y", "y@test.com");
    linkGitHubId(a1.account_id, "unique-gh-id");
    expect(() => linkGitHubId(a2.account_id, "unique-gh-id")).toThrow();
  });
});

// ─── exchangeGitHubCode (mocked fetch) ──────────────────────────

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
