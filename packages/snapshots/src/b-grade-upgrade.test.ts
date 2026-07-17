import { describe, it, expect, beforeEach } from "vitest";
import { resetTestDb } from "./pg-test.js";
import {
  saveGitHubToken,
  getGitHubTokens,
  getGitHubTokenDecrypted,
  deleteGitHubToken,
  markTokenUsed,
  markTokenInvalid,
  markTokenValidated,
  createAccount,
  logTierChange,
  getTierHistory,
  getLastTierChange,
  calculateProration,
} from "@axis/snapshots";

beforeEach(async () => {
  await resetTestDb();
});

// ─── GitHub Token Store ─────────────────────────────────────────

describe("GitHub Token Store", () => {
  it("saves and retrieves a token", async () => {
    const acct = await createAccount("Test", "test@example.com");
    const saved = await saveGitHubToken(acct.account_id, "ghp_abc123456789def", "my-token", ["repo", "read:org"]);

    expect(saved.token_id).toBeTruthy();
    expect(saved.account_id).toBe(acct.account_id);
    expect(saved.label).toBe("my-token");
    expect(saved.token_prefix).toBe("ghp_abc1");
    expect(saved.scopes).toBe("repo,read:org");
    expect(saved.valid).toBe(1);
  });

  it("lists tokens for an account (without exposing raw token)", async () => {
    const acct = await createAccount("Test", "test@example.com");
    await saveGitHubToken(acct.account_id, "ghp_first111111111", "token-1");
    await saveGitHubToken(acct.account_id, "ghp_second22222222", "token-2");

    const tokens = await getGitHubTokens(acct.account_id);
    expect(tokens).toHaveLength(2);
    // Should NOT contain raw or encrypted token
    expect(tokens[0]).not.toHaveProperty("encrypted_token");
    expect(tokens[1]).not.toHaveProperty("encrypted_token");
  });

  it("decrypts stored token", async () => {
    const acct = await createAccount("Test", "test@example.com");
    const rawToken = "ghp_secretvalue12345";
    await saveGitHubToken(acct.account_id, rawToken);

    const decrypted = await getGitHubTokenDecrypted(acct.account_id);
    expect(decrypted).toBe(rawToken);
  });

  it("decrypts specific token by ID", async () => {
    const acct = await createAccount("Test", "test@example.com");
    await saveGitHubToken(acct.account_id, "ghp_first111111111", "token-1");
    const second = await saveGitHubToken(acct.account_id, "ghp_second22222222", "token-2");

    const decrypted = await getGitHubTokenDecrypted(acct.account_id, second.token_id);
    expect(decrypted).toBe("ghp_second22222222");
  });

  it("returns undefined for non-existent account", async () => {
    const result = await getGitHubTokenDecrypted("no-such-account");
    expect(result).toBeUndefined();
  });

  it("deletes a token", async () => {
    const acct = await createAccount("Test", "test@example.com");
    const saved = await saveGitHubToken(acct.account_id, "ghp_deleteme12345");

    const deleted = await deleteGitHubToken(acct.account_id, saved.token_id);
    expect(deleted).toBe(true);

    const tokens = await getGitHubTokens(acct.account_id);
    expect(tokens).toHaveLength(0);
  });

  it("returns false when deleting non-existent token", async () => {
    const acct = await createAccount("Test", "test@example.com");
    const deleted = await deleteGitHubToken(acct.account_id, "no-such-id");
    expect(deleted).toBe(false);
  });

  it("marks token as used (updates last_used_at)", async () => {
    const acct = await createAccount("Test", "test@example.com");
    const saved = await saveGitHubToken(acct.account_id, "ghp_useme123456789");
    expect(saved.last_used_at).toBeNull();

    await markTokenUsed(saved.token_id);

    const tokens = await getGitHubTokens(acct.account_id);
    expect(tokens[0].last_used_at).toBeTruthy();
  });

  it("marks token as invalid (skipped on decrypt)", async () => {
    const acct = await createAccount("Test", "test@example.com");
    const saved = await saveGitHubToken(acct.account_id, "ghp_invalidate1234");

    await markTokenInvalid(saved.token_id);

    const tokens = await getGitHubTokens(acct.account_id);
    expect(tokens[0].valid).toBe(0);

    // Should not return invalid tokens during decrypt
    const decrypted = await getGitHubTokenDecrypted(acct.account_id);
    expect(decrypted).toBeUndefined();
  });

  it("marks token as validated with updated scopes", async () => {
    const acct = await createAccount("Test", "test@example.com");
    const saved = await saveGitHubToken(acct.account_id, "ghp_revalidate1234", "default", ["repo"]);

    await markTokenValidated(saved.token_id, ["repo", "read:org", "admin:repo_hook"]);

    const tokens = await getGitHubTokens(acct.account_id);
    expect(tokens[0].scopes).toBe("repo,read:org,admin:repo_hook");
    expect(tokens[0].last_validated_at).toBeTruthy();
  });
});

// ─── Tier Audit ─────────────────────────────────────────────────

describe("Tier Audit", () => {
  it("logs a tier change", async () => {
    const acct = await createAccount("Test", "test@example.com");
    const change = await logTierChange(acct.account_id, "free", "paid", "user_request");

    expect(change.change_id).toBeTruthy();
    expect(change.from_tier).toBe("free");
    expect(change.to_tier).toBe("paid");
    expect(change.reason).toBe("user_request");
    expect(change.proration_amount).toBeGreaterThan(0); // free→paid should have positive proration
  });

  it("retrieves tier history in reverse chronological order", async () => {
    const acct = await createAccount("Test", "test@example.com");
    await logTierChange(acct.account_id, "free", "paid");
    // Small delay to ensure distinct timestamps
    await new Promise((r) => setTimeout(r, 10));
    await logTierChange(acct.account_id, "paid", "suite");

    const history = await getTierHistory(acct.account_id);
    expect(history).toHaveLength(2);
    expect(history[0].to_tier).toBe("suite"); // most recent first
    expect(history[1].to_tier).toBe("paid");
  });

  it("returns last tier change", async () => {
    const acct = await createAccount("Test", "test@example.com");
    await logTierChange(acct.account_id, "free", "paid");
    await new Promise((r) => setTimeout(r, 10));
    await logTierChange(acct.account_id, "paid", "suite");

    const last = await getLastTierChange(acct.account_id);
    expect(last).toBeTruthy();
    expect(last!.to_tier).toBe("suite");
  });

  it("returns undefined for account with no changes", async () => {
    const acct = await createAccount("Test", "test@example.com");
    const last = await getLastTierChange(acct.account_id);
    expect(last).toBeUndefined();
  });

  it("stores metadata as JSON", async () => {
    const acct = await createAccount("Test", "test@example.com");
    const change = await logTierChange(acct.account_id, "free", "paid", "user_request", { source: "api", campaign: "spring2026" });

    const parsed = JSON.parse(change.metadata);
    expect(parsed.source).toBe("api");
    expect(parsed.campaign).toBe("spring2026");
  });
});

// ─── Proration Calculation ──────────────────────────────────────

describe("calculateProration", () => {
  it("returns zero for same tier", () => {
    const result = calculateProration("paid", "paid");
    expect(result.proration_amount).toBe(0);
    expect(result.direction).toBe("none");
  });

  it("calculates upgrade proration (free → paid, full month)", () => {
    const result = calculateProration("free", "paid", 30, 30);
    expect(result.direction).toBe("upgrade");
    expect(result.proration_amount).toBe(2900); // $29 full month
  });

  it("calculates upgrade proration (free → paid, half month)", () => {
    const result = calculateProration("free", "paid", 15, 30);
    expect(result.direction).toBe("upgrade");
    expect(result.proration_amount).toBe(1450); // $14.50
  });

  it("calculates upgrade proration (paid → suite, full month)", () => {
    const result = calculateProration("paid", "suite", 30, 30);
    expect(result.direction).toBe("upgrade");
    expect(result.proration_amount).toBe(27000); // $299 - $29 = $270
  });

  it("calculates downgrade proration (suite → free, half month)", () => {
    const result = calculateProration("suite", "free", 15, 30);
    expect(result.direction).toBe("downgrade");
    expect(result.proration_amount).toBe(-14950); // credit of $149.50
  });

  it("calculates downgrade proration (paid → free)", () => {
    const result = calculateProration("paid", "free", 20, 30);
    expect(result.direction).toBe("downgrade");
    const expectedCredit = -Math.round(2900 * (20 / 30));
    expect(result.proration_amount).toBe(expectedCredit);
  });
});
