/**
 * eq_129: GitHub token store branch coverage
 * Targets uncovered branches: lines 31 (valid decrypt format), 103-106 (token_id query path)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemoryDb, closeDb, getDb } from "./db.js";
import { createAccount } from "./billing-store.js";
import {
  saveGitHubToken,
  getGitHubTokens,
  getGitHubTokenDecrypted,
} from "./github-token-store.js";

beforeEach(() => { openMemoryDb(); });
afterEach(() => { closeDb(); });

describe("github-token-store branches", () => {
  it("decrypts a saved token via getGitHubTokenDecrypted (no token_id)", () => {
    const acct = createAccount("TokenTest", "token@test.com");
    const raw = "ghp_1234567890abcdef1234567890abcdef12";
    saveGitHubToken(acct.account_id, raw, "default", ["repo"]);

    const decrypted = getGitHubTokenDecrypted(acct.account_id);
    expect(decrypted).toBe(raw);
  });

  it("decrypts a saved token via specific token_id", () => {
    const acct = createAccount("TokenTest2", "token2@test.com");
    const raw = "ghp_abcdef1234567890abcdef1234567890ab";
    const saved = saveGitHubToken(acct.account_id, raw, "ci", ["repo", "read:org"]);

    const decrypted = getGitHubTokenDecrypted(acct.account_id, saved.token_id);
    expect(decrypted).toBe(raw);
  });

  it("returns undefined when token_id does not match", () => {
    const acct = createAccount("TokenTest3", "token3@test.com");
    saveGitHubToken(acct.account_id, "ghp_something1234567890123456789012", "x");

    const decrypted = getGitHubTokenDecrypted(acct.account_id, "nonexistent-id");
    expect(decrypted).toBeUndefined();
  });

  it("lists multiple tokens for an account", () => {
    const acct = createAccount("TokenTest4", "token4@test.com");
    saveGitHubToken(acct.account_id, "ghp_first12345678901234567890123456", "first");
    saveGitHubToken(acct.account_id, "ghp_second1234567890123456789012345", "second");

    const tokens = getGitHubTokens(acct.account_id);
    expect(tokens).toHaveLength(2);
    expect(tokens.map(t => t.label)).toContain("first");
    expect(tokens.map(t => t.label)).toContain("second");
  });

  it("stores token_prefix as first 8 chars", () => {
    const acct = createAccount("TokenTest5", "token5@test.com");
    const raw = "ghp_abcdefgh_rest_of_token_here12345";
    const saved = saveGitHubToken(acct.account_id, raw, "prefix-check");
    expect(saved.token_prefix).toBe("ghp_abcd");
  });

  // Layer 10: env-based encryption key (TRUE branch of getEncryptionKey)
  it("encrypts and decrypts with AXIS_TOKEN_KEY env var", () => {
    const origKey = process.env.AXIS_TOKEN_KEY;
    try {
      // Set a 32+ char key to trigger the TRUE branch
      process.env.AXIS_TOKEN_KEY = "axis-test-encryption-key-32chars!";
      const acct = createAccount("EnvKeyTest", "envkey@test.com");
      const raw = "ghp_envkeytesttoken1234567890123456";
      saveGitHubToken(acct.account_id, raw, "env-key");
      const decrypted = getGitHubTokenDecrypted(acct.account_id);
      expect(decrypted).toBe(raw);
    } finally {
      if (origKey !== undefined) process.env.AXIS_TOKEN_KEY = origKey;
      else delete process.env.AXIS_TOKEN_KEY;
    }
  });

  // Layer 10: decrypt with corrupted encrypted_token format
  it("handles corrupted encrypted token in DB gracefully", () => {
    const acct = createAccount("CorruptTest", "corrupt@test.com");
    saveGitHubToken(acct.account_id, "ghp_valid_token_1234567890123456", "corrupt");
    // Corrupt the encrypted_token directly in DB
    getDb().prepare("UPDATE github_tokens SET encrypted_token = 'not-valid-format' WHERE account_id = ?").run(acct.account_id);
    // getGitHubTokenDecrypted should throw or return undefined for invalid format
    expect(() => getGitHubTokenDecrypted(acct.account_id)).toThrow();
  });
});
