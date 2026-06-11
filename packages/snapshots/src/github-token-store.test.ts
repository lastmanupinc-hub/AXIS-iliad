/**
 * github-token-store encryption-key policy:
 *  - production + missing/short AXIS_TOKEN_KEY → fail closed (throw at first use)
 *  - production + 32+ char AXIS_TOKEN_KEY → works
 *  - non-production + missing key → dev fallback (with a one-time console.warn)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openMemoryDb, closeDb } from "./db.js";
import { createAccount } from "./billing-store.js";
import { saveGitHubToken, getGitHubTokenDecrypted } from "./github-token-store.js";

const LONG_KEY = "0123456789abcdef0123456789abcdef"; // exactly 32 chars

beforeEach(() => { openMemoryDb(); });
afterEach(() => {
  closeDb();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getEncryptionKey — production fail-closed", () => {
  it("throws at first use in production when AXIS_TOKEN_KEY is unset", () => {
    const acct = createAccount("ProdUnset", "prod-unset@test.com");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AXIS_TOKEN_KEY", "");
    expect(() => saveGitHubToken(acct.account_id, "ghp_secret_token_123456789012345"))
      .toThrow(/AXIS_TOKEN_KEY must be set to a 32\+ char secret in production/);
  });

  it("throws in production when AXIS_TOKEN_KEY is shorter than 32 chars", () => {
    const acct = createAccount("ProdShort", "prod-short@test.com");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AXIS_TOKEN_KEY", "way-too-short");
    expect(() => saveGitHubToken(acct.account_id, "ghp_secret_token_123456789012345"))
      .toThrow(/refusing to encrypt GitHub tokens with the public dev key/);
  });

  it("fails closed on decrypt too when the key disappears in production", () => {
    const acct = createAccount("ProdDecrypt", "prod-decrypt@test.com");
    vi.stubEnv("AXIS_TOKEN_KEY", LONG_KEY);
    const saved = saveGitHubToken(acct.account_id, "ghp_round_trip_1234567890123456");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AXIS_TOKEN_KEY", "");
    expect(() => getGitHubTokenDecrypted(acct.account_id, saved.token_id))
      .toThrow(/AXIS_TOKEN_KEY must be set/);
  });

  it("encrypts and decrypts in production when AXIS_TOKEN_KEY is a 32+ char secret", () => {
    const acct = createAccount("ProdOk", "prod-ok@test.com");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AXIS_TOKEN_KEY", LONG_KEY);
    const saved = saveGitHubToken(acct.account_id, "ghp_production_token_12345678901");
    expect(saved.token_id).toBeTruthy();
    expect(getGitHubTokenDecrypted(acct.account_id, saved.token_id))
      .toBe("ghp_production_token_12345678901");
  });
});

describe("getEncryptionKey — dev fallback outside production", () => {
  // NOTE: the dev-key warning fires once per module instance. The production
  // tests above never reach the fallback, so this is the first fallback use
  // in this file and the warn assertion is deterministic.
  it("falls back to the dev key with a console.warn and round-trips", () => {
    const acct = createAccount("DevFallback", "dev-fallback@test.com");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AXIS_TOKEN_KEY", "");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const saved = saveGitHubToken(acct.account_id, "ghp_dev_fallback_123456789012345");
    expect(getGitHubTokenDecrypted(acct.account_id, saved.token_id))
      .toBe("ghp_dev_fallback_123456789012345");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("AXIS_TOKEN_KEY");
  });

  it("does not warn again on subsequent fallback uses", () => {
    const acct = createAccount("DevQuiet", "dev-quiet@test.com");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AXIS_TOKEN_KEY", "");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const saved = saveGitHubToken(acct.account_id, "ghp_dev_quiet_1234567890123456789");
    expect(getGitHubTokenDecrypted(acct.account_id, saved.token_id))
      .toBe("ghp_dev_quiet_1234567890123456789");

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
