import { describe, it, expect, beforeEach } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import {
  createAccount,
  getAccount,
  getAccountByEmail,
  updateAccountTier,
  createApiKey,
  resolveApiKey,
  revokeApiKey,
  listApiKeys,
  enableProgram,
  disableProgram,
  getEntitlements,
  isProgramEnabled,
  recordUsage,
  getUsageSummary,
  getMonthlySnapshotCount,
  checkQuota,
} from "./billing-store.js";
import { TIER_LIMITS, ALL_PROGRAMS } from "./billing-types.js";
import { createSnapshot } from "./store.js";
import type { SnapshotInput } from "./types.js";

beforeEach(async () => { await resetTestDb(); });

// ─── Accounts ───────────────────────────────────────────────────

describe("Accounts", () => {
  it("creates a free account with correct fields", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    expect(acct.account_id).toBeTruthy();
    expect(acct.name).toBe("Alice");
    expect(acct.email).toBe("alice@example.com");
    expect(acct.tier).toBe("free");
    expect(acct.created_at).toBeTruthy();
  });

  it("creates a paid account", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    expect(acct.tier).toBe("paid");
  });

  it("creates a suite account and auto-enables all programs", async () => {
    const acct = await createAccount("Corp", "corp@example.com", "suite");
    expect(acct.tier).toBe("suite");
    const ents = await getEntitlements(acct.account_id);
    expect(ents.length).toBe(ALL_PROGRAMS.length);
  });

  it("retrieves account by ID", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const found = await getAccount(acct.account_id);
    expect(found).toBeTruthy();
    expect(found!.account_id).toBe(acct.account_id);
  });

  it("retrieves account by email", async () => {
    await createAccount("Alice", "alice@example.com");
    const found = await getAccountByEmail("alice@example.com");
    expect(found).toBeTruthy();
    expect(found!.name).toBe("Alice");
  });

  it("returns undefined for unknown account", async () => {
    expect(await getAccount("nonexistent")).toBeUndefined();
    expect(await getAccountByEmail("nobody@example.com")).toBeUndefined();
  });

  it("rejects duplicate emails", async () => {
    await createAccount("Alice", "alice@example.com");
    await expect(createAccount("Alice2", "alice@example.com")).rejects.toThrow();
  });

  it("normalizes email to lowercase on create", async () => {
    const acct = await createAccount("Alice", "  Alice@Example.COM  ");
    expect(acct.email).toBe("alice@example.com");
    expect((await getAccount(acct.account_id))!.email).toBe("alice@example.com");
  });

  it("retrieves account by email case-insensitively", async () => {
    await createAccount("Alice", "alice@example.com");
    const found = await getAccountByEmail("ALICE@Example.com");
    expect(found).toBeTruthy();
    expect(found!.name).toBe("Alice");
  });

  it("finds legacy rows stored with mixed-case emails", async () => {
    // Simulate a pre-normalization row written directly to the table
    await sql.run(
      "INSERT INTO accounts (account_id, name, email, tier, created_at) VALUES ('legacy1', 'Legacy', 'Legacy@Test.COM', 'free', '2024-01-01')",
    );
    expect((await getAccountByEmail("legacy@test.com"))?.account_id).toBe("legacy1");
    expect((await getAccountByEmail("LEGACY@TEST.COM"))?.account_id).toBe("legacy1");
  });

  it("rejects duplicate emails differing only by case", async () => {
    await createAccount("Alice", "alice@example.com");
    await expect(createAccount("Alice2", "ALICE@EXAMPLE.COM")).rejects.toThrow(/duplicate key|unique/i);
  });

  it("upgrades tier from free to paid", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const ok = await updateAccountTier(acct.account_id, "paid");
    expect(ok).toBe(true);
    const updated = await getAccount(acct.account_id);
    expect(updated!.tier).toBe("paid");
  });

  it("upgrade to suite auto-enables all programs", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    await updateAccountTier(acct.account_id, "suite");
    const ents = await getEntitlements(acct.account_id);
    expect(ents.length).toBe(ALL_PROGRAMS.length);
  });
});

// ─── API Keys ───────────────────────────────────────────────────

describe("API Keys", () => {
  it("creates an API key with axis_ prefix", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const { apiKey, rawKey } = await createApiKey(acct.account_id, "test-key");
    expect(rawKey).toMatch(/^axis_[0-9a-f]{32}$/);
    expect(apiKey.key_id).toBeTruthy();
    expect(apiKey.account_id).toBe(acct.account_id);
    expect(apiKey.label).toBe("test-key");
    expect(apiKey.revoked_at).toBeNull();
  });

  it("resolves a valid raw key to account", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const { rawKey } = await createApiKey(acct.account_id);
    const resolved = await resolveApiKey(rawKey);
    expect(resolved).toBeTruthy();
    expect(resolved!.account.account_id).toBe(acct.account_id);
    expect(resolved!.account.name).toBe("Alice");
  });

  it("returns undefined for unknown key", async () => {
    expect(await resolveApiKey("axis_0000000000000000000000000000dead")).toBeUndefined();
  });

  it("returns undefined for revoked key", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const { apiKey, rawKey } = await createApiKey(acct.account_id);
    await revokeApiKey(apiKey.key_id);
    expect(await resolveApiKey(rawKey)).toBeUndefined();
  });

  it("lists all keys for an account", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    await createApiKey(acct.account_id, "key-1");
    await createApiKey(acct.account_id, "key-2");
    const keys = await listApiKeys(acct.account_id);
    expect(keys.length).toBe(2);
  });

  it("revoked keys still appear in list", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const { apiKey } = await createApiKey(acct.account_id);
    await revokeApiKey(apiKey.key_id);
    const keys = await listApiKeys(acct.account_id);
    expect(keys.length).toBe(1);
    expect(keys[0].revoked_at).toBeTruthy();
  });
});

// ─── Program Entitlements ───────────────────────────────────────

describe("Program Entitlements", () => {
  it("free tier has built-in programs only", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    expect(await isProgramEnabled(acct.account_id, "search")).toBe(true);
    expect(await isProgramEnabled(acct.account_id, "skills")).toBe(true);
    expect(await isProgramEnabled(acct.account_id, "debug")).toBe(true);
    expect(await isProgramEnabled(acct.account_id, "seo")).toBe(false);
    expect(await isProgramEnabled(acct.account_id, "marketing")).toBe(false);
  });

  it("suite tier has all programs", async () => {
    const acct = await createAccount("Corp", "corp@example.com", "suite");
    for (const p of ALL_PROGRAMS) {
      expect(await isProgramEnabled(acct.account_id, p)).toBe(true);
    }
  });

  it("paid tier uses entitlements table", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    expect(await isProgramEnabled(acct.account_id, "seo")).toBe(false);
    await enableProgram(acct.account_id, "seo");
    expect(await isProgramEnabled(acct.account_id, "seo")).toBe(true);
    await disableProgram(acct.account_id, "seo");
    expect(await isProgramEnabled(acct.account_id, "seo")).toBe(false);
  });

  it("returns false for unknown account", async () => {
    expect(await isProgramEnabled("nonexistent", "search")).toBe(false);
  });

  it("getEntitlements returns enabled programs only", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    await enableProgram(acct.account_id, "seo");
    await enableProgram(acct.account_id, "brand");
    await disableProgram(acct.account_id, "seo");
    const ents = await getEntitlements(acct.account_id);
    expect(ents.length).toBe(1);
    expect(ents[0].program).toBe("brand");
  });
});

// ─── Usage Tracking ─────────────────────────────────────────────

describe("Usage Tracking", () => {
  it("records usage and retrieves summary", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    await recordUsage(acct.account_id, "search", "snap-1", 3, 10, 5000);
    await recordUsage(acct.account_id, "search", "snap-2", 2, 5, 2500);
    await recordUsage(acct.account_id, "debug", "snap-1", 1, 10, 5000);

    const summary = await getUsageSummary(acct.account_id);
    expect(summary.length).toBe(2);

    const searchSummary = summary.find(s => s.program === "search")!;
    expect(searchSummary.total_runs).toBe(2);
    expect(searchSummary.total_generators).toBe(5);
    expect(searchSummary.total_input_files).toBe(15);
    expect(searchSummary.total_input_bytes).toBe(7500);

    const debugSummary = summary.find(s => s.program === "debug")!;
    expect(debugSummary.total_runs).toBe(1);
  });

  it("tracks monthly snapshot count by distinct snapshot_id", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    await recordUsage(acct.account_id, "search", "snap-1", 1, 1, 100);
    await recordUsage(acct.account_id, "debug", "snap-1", 1, 1, 100);  // same snapshot
    await recordUsage(acct.account_id, "search", "snap-2", 1, 1, 100);

    const count = await getMonthlySnapshotCount(acct.account_id);
    expect(count).toBe(2); // snap-1 and snap-2 (deduplicated)
  });
});

// ─── Quota Enforcement ──────────────────────────────────────────

describe("Quota Enforcement", () => {
  it("allows usage under free tier limits", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const check = await checkQuota(acct.account_id);
    expect(check.allowed).toBe(true);
    expect(check.tier).toBe("free");
    expect(check.usage.snapshots_this_month).toBe(0);
  });

  it("blocks after reaching monthly snapshot limit", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    // Record 10 distinct snapshots (free tier limit)
    for (let i = 0; i < TIER_LIMITS.free.max_snapshots_per_month; i++) {
      await recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    const check = await checkQuota(acct.account_id);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Monthly snapshot limit");
  });

  it("suite tier is never blocked by snapshot count", async () => {
    const acct = await createAccount("Corp", "corp@example.com", "suite");
    for (let i = 0; i < 50; i++) {
      await recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    const check = await checkQuota(acct.account_id);
    expect(check.allowed).toBe(true);
  });

  it("blocks free tier after project limit", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    // Create a real snapshot so the project_id exists in the snapshots table
    const input: SnapshotInput = {
      input_method: "api_submission",
      manifest: { project_name: "proj-1", project_type: "saas_web_app", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "a.ts", content: "a", size: 1 }],
    };
    const snap1 = await createSnapshot(input);
    await recordUsage(acct.account_id, "search", snap1.snapshot_id, 1, 1, 100);

    // Second snapshot under a different project
    const input2: SnapshotInput = {
      ...input,
      manifest: { ...input.manifest, project_name: "proj-2" },
    };
    const snap2 = await createSnapshot(input2);
    await recordUsage(acct.account_id, "search", snap2.snapshot_id, 1, 1, 100);

    // Free tier allows 1 project, now we have 2
    const check = await checkQuota(acct.account_id);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Project limit");
  });

  it("returns not-allowed for unknown account", async () => {
    const check = await checkQuota("nonexistent");
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Account not found");
  });

  it("paid tier has higher limits", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    // 10 snapshots is fine for paid (limit is 200)
    for (let i = 0; i < 10; i++) {
      await recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    const check = await checkQuota(acct.account_id);
    expect(check.allowed).toBe(true);
    expect(check.tier).toBe("paid");
  });
});

// ─── Tier Constants ─────────────────────────────────────────────

describe("Tier Constants", () => {
  it("free tier has correct limits", () => {
    expect(TIER_LIMITS.free.max_snapshots_per_month).toBe(10);
    expect(TIER_LIMITS.free.max_projects).toBe(1);
    expect(TIER_LIMITS.free.programs).toEqual(["search", "skills", "debug"]);
  });

  it("paid tier has higher limits", () => {
    expect(TIER_LIMITS.paid.max_snapshots_per_month).toBe(200);
    expect(TIER_LIMITS.paid.max_projects).toBe(20);
  });

  it("suite tier is unlimited", () => {
    expect(TIER_LIMITS.suite.max_snapshots_per_month).toBe(-1);
    expect(TIER_LIMITS.suite.max_projects).toBe(-1);
  });

  it("ALL_PROGRAMS has 21 programs", () => {
    expect(ALL_PROGRAMS.length).toBe(21);
  });
});
