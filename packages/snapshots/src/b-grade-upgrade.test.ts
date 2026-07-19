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
  updateAccountPaidPlanId,
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

  // H-Phase-A cycle 2 originally fixed logTierChange's Pro-vs-Starter plan
  // resolution for the "from" side of the (now-removed) day-fraction delta.
  // H-Phase-A cycle 10 removed the delta itself (PAI'D has no billing
  // period to prorate within — see calculateProration's own comment) —
  // proration_amount is now always to_tier's full one-time price, so both
  // a Pro and a Starter subscriber log the SAME amount for the same
  // to_tier; only `direction` could still depend on the "from" plan (and
  // doesn't, for any of today's real tier/plan combinations — see the
  // calculateProration describe block above).
  it("logs the same to_tier price for a Pro and a Starter subscriber alike (no more per-plan delta to distinguish)", async () => {
    const proAcct = await createAccount("ProChange", "pro-change@example.com", "paid");
    await updateAccountPaidPlanId(proAcct.account_id, "pro");
    const starterAcct = await createAccount("StarterChange", "starter-change@example.com", "paid");
    await updateAccountPaidPlanId(starterAcct.account_id, "starter");

    const proChange = await logTierChange(proAcct.account_id, "paid", "suite", "user_request");
    const starterChange = await logTierChange(starterAcct.account_id, "paid", "suite", "user_request");
    // Full $299 one-time price either way — no credit for time already
    // paid on Pro's $99 or Starter's $29.
    expect(proChange.proration_amount).toBe(29900);
    expect(starterChange.proration_amount).toBe(29900);
    expect(proChange.from_tier).toBe("paid");
    expect(proChange.to_tier).toBe("suite");
  });
});

// ─── Proration Calculation ──────────────────────────────────────

// H-Phase-A cycle 10: PAI'D is one-time-charge only — there is no billing
// period to prorate within, so calculateProration no longer takes day-count
// args and no longer computes a fictional day-fraction "credit" for unused
// time (which, for a downgrade, used to return a NEGATIVE amount directly
// contradicting TermsPage.tsx's own "we do not provide refunds for unused
// time" clause). proration_amount is now simply to_tier's full one-time
// price — what a real switch actually costs, with zero credit for time
// already paid on from_tier.
describe("calculateProration", () => {
  it("returns zero for same tier", () => {
    const result = calculateProration("paid", "paid");
    expect(result.proration_amount).toBe(0);
    expect(result.direction).toBe("none");
  });

  it("upgrading free → paid costs paid's full price", () => {
    const result = calculateProration("free", "paid");
    expect(result.direction).toBe("upgrade");
    expect(result.proration_amount).toBe(2900); // $29
  });

  it("upgrading paid → suite costs suite's FULL price, not a delta", () => {
    const result = calculateProration("paid", "suite");
    expect(result.direction).toBe("upgrade");
    expect(result.proration_amount).toBe(29900); // full $299 — no credit for the $29 already paid
  });

  it("downgrading suite → free costs nothing (free tier), never a negative 'credit'", () => {
    const result = calculateProration("suite", "free");
    expect(result.direction).toBe("downgrade");
    expect(result.proration_amount).toBe(0);
    expect(result.proration_amount).toBeGreaterThanOrEqual(0); // no refund/credit is ever fabricated
  });

  it("downgrading paid → free costs nothing", () => {
    const result = calculateProration("paid", "free");
    expect(result.direction).toBe("downgrade");
    expect(result.proration_amount).toBe(0);
  });

  it("a Pro fromPaidPlanId still affects direction correctly (H-Phase-A cycle 2's real concern), but proration_amount is fromPrice-independent now", () => {
    const result = calculateProration("paid", "suite", "pro");
    expect(result.direction).toBe("upgrade");
    expect(result.proration_amount).toBe(29900); // full $299 regardless of the $29-vs-$99 'from' price
  });

  it("no fromPaidPlanId (undefined) still defaults to Starter's $29 for direction purposes", () => {
    const result = calculateProration("paid", "suite");
    expect(result.direction).toBe("upgrade");
    expect(result.proration_amount).toBe(29900);
  });
});
