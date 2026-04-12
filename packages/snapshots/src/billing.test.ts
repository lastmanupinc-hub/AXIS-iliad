import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemoryDb, closeDb } from "./db.js";
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

beforeEach(() => { openMemoryDb(); });
afterEach(() => { closeDb(); });

// ─── Accounts ───────────────────────────────────────────────────

describe("Accounts", () => {
  it("creates a free account with correct fields", () => {
    const acct = createAccount("Alice", "alice@example.com");
    expect(acct.account_id).toBeTruthy();
    expect(acct.name).toBe("Alice");
    expect(acct.email).toBe("alice@example.com");
    expect(acct.tier).toBe("free");
    expect(acct.created_at).toBeTruthy();
  });

  it("creates a paid account", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    expect(acct.tier).toBe("paid");
  });

  it("creates a suite account and auto-enables all programs", () => {
    const acct = createAccount("Corp", "corp@example.com", "suite");
    expect(acct.tier).toBe("suite");
    const ents = getEntitlements(acct.account_id);
    expect(ents.length).toBe(ALL_PROGRAMS.length);
  });

  it("retrieves account by ID", () => {
    const acct = createAccount("Alice", "alice@example.com");
    const found = getAccount(acct.account_id);
    expect(found).toBeTruthy();
    expect(found!.account_id).toBe(acct.account_id);
  });

  it("retrieves account by email", () => {
    createAccount("Alice", "alice@example.com");
    const found = getAccountByEmail("alice@example.com");
    expect(found).toBeTruthy();
    expect(found!.name).toBe("Alice");
  });

  it("returns undefined for unknown account", () => {
    expect(getAccount("nonexistent")).toBeUndefined();
    expect(getAccountByEmail("nobody@example.com")).toBeUndefined();
  });

  it("rejects duplicate emails", () => {
    createAccount("Alice", "alice@example.com");
    expect(() => createAccount("Alice2", "alice@example.com")).toThrow();
  });

  it("upgrades tier from free to paid", () => {
    const acct = createAccount("Alice", "alice@example.com");
    const ok = updateAccountTier(acct.account_id, "paid");
    expect(ok).toBe(true);
    const updated = getAccount(acct.account_id);
    expect(updated!.tier).toBe("paid");
  });

  it("upgrade to suite auto-enables all programs", () => {
    const acct = createAccount("Alice", "alice@example.com");
    updateAccountTier(acct.account_id, "suite");
    const ents = getEntitlements(acct.account_id);
    expect(ents.length).toBe(ALL_PROGRAMS.length);
  });
});

// ─── API Keys ───────────────────────────────────────────────────

describe("API Keys", () => {
  it("creates an API key with axis_ prefix", () => {
    const acct = createAccount("Alice", "alice@example.com");
    const { apiKey, rawKey } = createApiKey(acct.account_id, "test-key");
    expect(rawKey).toMatch(/^axis_[0-9a-f]{32}$/);
    expect(apiKey.key_id).toBeTruthy();
    expect(apiKey.account_id).toBe(acct.account_id);
    expect(apiKey.label).toBe("test-key");
    expect(apiKey.revoked_at).toBeNull();
  });

  it("resolves a valid raw key to account", () => {
    const acct = createAccount("Alice", "alice@example.com");
    const { rawKey } = createApiKey(acct.account_id);
    const resolved = resolveApiKey(rawKey);
    expect(resolved).toBeTruthy();
    expect(resolved!.account.account_id).toBe(acct.account_id);
    expect(resolved!.account.name).toBe("Alice");
  });

  it("returns undefined for unknown key", () => {
    expect(resolveApiKey("axis_0000000000000000000000000000dead")).toBeUndefined();
  });

  it("returns undefined for revoked key", () => {
    const acct = createAccount("Alice", "alice@example.com");
    const { apiKey, rawKey } = createApiKey(acct.account_id);
    revokeApiKey(apiKey.key_id);
    expect(resolveApiKey(rawKey)).toBeUndefined();
  });

  it("lists all keys for an account", () => {
    const acct = createAccount("Alice", "alice@example.com");
    createApiKey(acct.account_id, "key-1");
    createApiKey(acct.account_id, "key-2");
    const keys = listApiKeys(acct.account_id);
    expect(keys.length).toBe(2);
  });

  it("revoked keys still appear in list", () => {
    const acct = createAccount("Alice", "alice@example.com");
    const { apiKey } = createApiKey(acct.account_id);
    revokeApiKey(apiKey.key_id);
    const keys = listApiKeys(acct.account_id);
    expect(keys.length).toBe(1);
    expect(keys[0].revoked_at).toBeTruthy();
  });
});

// ─── Program Entitlements ───────────────────────────────────────

describe("Program Entitlements", () => {
  it("free tier has built-in programs only", () => {
    const acct = createAccount("Alice", "alice@example.com");
    expect(isProgramEnabled(acct.account_id, "search")).toBe(true);
    expect(isProgramEnabled(acct.account_id, "skills")).toBe(true);
    expect(isProgramEnabled(acct.account_id, "debug")).toBe(true);
    expect(isProgramEnabled(acct.account_id, "seo")).toBe(false);
    expect(isProgramEnabled(acct.account_id, "marketing")).toBe(false);
  });

  it("suite tier has all programs", () => {
    const acct = createAccount("Corp", "corp@example.com", "suite");
    for (const p of ALL_PROGRAMS) {
      expect(isProgramEnabled(acct.account_id, p)).toBe(true);
    }
  });

  it("paid tier uses entitlements table", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    expect(isProgramEnabled(acct.account_id, "seo")).toBe(false);
    enableProgram(acct.account_id, "seo");
    expect(isProgramEnabled(acct.account_id, "seo")).toBe(true);
    disableProgram(acct.account_id, "seo");
    expect(isProgramEnabled(acct.account_id, "seo")).toBe(false);
  });

  it("returns false for unknown account", () => {
    expect(isProgramEnabled("nonexistent", "search")).toBe(false);
  });

  it("getEntitlements returns enabled programs only", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    enableProgram(acct.account_id, "seo");
    enableProgram(acct.account_id, "brand");
    disableProgram(acct.account_id, "seo");
    const ents = getEntitlements(acct.account_id);
    expect(ents.length).toBe(1);
    expect(ents[0].program).toBe("brand");
  });
});

// ─── Usage Tracking ─────────────────────────────────────────────

describe("Usage Tracking", () => {
  it("records usage and retrieves summary", () => {
    const acct = createAccount("Alice", "alice@example.com");
    recordUsage(acct.account_id, "search", "snap-1", 3, 10, 5000);
    recordUsage(acct.account_id, "search", "snap-2", 2, 5, 2500);
    recordUsage(acct.account_id, "debug", "snap-1", 1, 10, 5000);

    const summary = getUsageSummary(acct.account_id);
    expect(summary.length).toBe(2);

    const searchSummary = summary.find(s => s.program === "search")!;
    expect(searchSummary.total_runs).toBe(2);
    expect(searchSummary.total_generators).toBe(5);
    expect(searchSummary.total_input_files).toBe(15);
    expect(searchSummary.total_input_bytes).toBe(7500);

    const debugSummary = summary.find(s => s.program === "debug")!;
    expect(debugSummary.total_runs).toBe(1);
  });

  it("tracks monthly snapshot count by distinct snapshot_id", () => {
    const acct = createAccount("Alice", "alice@example.com");
    recordUsage(acct.account_id, "search", "snap-1", 1, 1, 100);
    recordUsage(acct.account_id, "debug", "snap-1", 1, 1, 100);  // same snapshot
    recordUsage(acct.account_id, "search", "snap-2", 1, 1, 100);

    const count = getMonthlySnapshotCount(acct.account_id);
    expect(count).toBe(2); // snap-1 and snap-2 (deduplicated)
  });
});

// ─── Quota Enforcement ──────────────────────────────────────────

describe("Quota Enforcement", () => {
  it("allows usage under free tier limits", () => {
    const acct = createAccount("Alice", "alice@example.com");
    const check = checkQuota(acct.account_id);
    expect(check.allowed).toBe(true);
    expect(check.tier).toBe("free");
    expect(check.usage.snapshots_this_month).toBe(0);
  });

  it("blocks after reaching monthly snapshot limit", () => {
    const acct = createAccount("Alice", "alice@example.com");
    // Record 10 distinct snapshots (free tier limit)
    for (let i = 0; i < TIER_LIMITS.free.max_snapshots_per_month; i++) {
      recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    const check = checkQuota(acct.account_id);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Monthly snapshot limit");
  });

  it("suite tier is never blocked by snapshot count", () => {
    const acct = createAccount("Corp", "corp@example.com", "suite");
    for (let i = 0; i < 50; i++) {
      recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    const check = checkQuota(acct.account_id);
    expect(check.allowed).toBe(true);
  });

  it("blocks free tier after project limit", () => {
    const acct = createAccount("Alice", "alice@example.com");
    // Create a real snapshot so the project_id exists in the snapshots table
    const input: SnapshotInput = {
      input_method: "api_submission",
      manifest: { project_name: "proj-1", project_type: "saas_web_app", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "a.ts", content: "a", size: 1 }],
    };
    const snap1 = createSnapshot(input);
    recordUsage(acct.account_id, "search", snap1.snapshot_id, 1, 1, 100);

    // Second snapshot under a different project
    const input2: SnapshotInput = {
      ...input,
      manifest: { ...input.manifest, project_name: "proj-2" },
    };
    const snap2 = createSnapshot(input2);
    recordUsage(acct.account_id, "search", snap2.snapshot_id, 1, 1, 100);

    // Free tier allows 1 project, now we have 2
    const check = checkQuota(acct.account_id);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Project limit");
  });

  it("returns not-allowed for unknown account", () => {
    const check = checkQuota("nonexistent");
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Account not found");
  });

  it("paid tier has higher limits", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    // 10 snapshots is fine for paid (limit is 200)
    for (let i = 0; i < 10; i++) {
      recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    const check = checkQuota(acct.account_id);
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

  it("ALL_PROGRAMS has 18 programs", () => {
    expect(ALL_PROGRAMS.length).toBe(18);
  });
});
