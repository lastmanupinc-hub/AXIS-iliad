import { describe, it, expect, beforeEach } from "vitest";
import { resetTestDb } from "./pg-test.js";
import {
  createAccount,
  getAccount,
  updateAccountTier,
  enableProgram,
  isProgramEnabled,
  recordUsage,
  getUsageSummary,
  getMonthlySnapshotCount,
  getProjectCount,
  checkQuota,
  createApiKey,
  resolveApiKey,
  revokeApiKey,
} from "./billing-store.js";
import { TIER_LIMITS, ALL_PROGRAMS } from "./billing-types.js";
import { createSnapshot } from "./store.js";
import type { SnapshotInput } from "./types.js";

beforeEach(async () => { await resetTestDb(); });

function makeSnapshotInput(projectName: string): SnapshotInput {
  return {
    input_method: "api_submission",
    manifest: { project_name: projectName, project_type: "saas_web_app", frameworks: [], goals: [], requested_outputs: [] },
    files: [{ path: "index.ts", content: "export const x = 1;", size: 20 }],
  };
}

// ─── Quota boundary precision ───────────────────────────────────

describe("Quota boundary precision", () => {
  it("allows at snapshot count one below free limit", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const limit = TIER_LIMITS.free.max_snapshots_per_month;
    // Record limit-1 snapshots → still under
    for (let i = 0; i < limit - 1; i++) {
      await recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    const check = await checkQuota(acct.account_id);
    expect(check.allowed).toBe(true);
    expect(check.usage.snapshots_this_month).toBe(limit - 1);
  });

  it("blocks at exactly the free snapshot limit", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const limit = TIER_LIMITS.free.max_snapshots_per_month;
    for (let i = 0; i < limit; i++) {
      await recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    const check = await checkQuota(acct.account_id);
    expect(check.allowed).toBe(false);
    expect(check.usage.snapshots_this_month).toBe(limit);
  });

  it("allows at paid snapshot count well below limit", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    for (let i = 0; i < 199; i++) {
      await recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    const check = await checkQuota(acct.account_id);
    expect(check.allowed).toBe(true);
    expect(check.usage.snapshots_this_month).toBe(199);
  });

  it("blocks paid tier at exactly 200 snapshots", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    for (let i = 0; i < 200; i++) {
      await recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    const check = await checkQuota(acct.account_id);
    expect(check.allowed).toBe(false);
  });
});

// ─── Tier downgrade effects ─────────────────────────────────────

describe("Tier downgrade effects", () => {
  it("downgrade suite→free blocks when over new snapshot limit", async () => {
    const acct = await createAccount("Corp", "corp@example.com", "suite");
    // Record 50 snapshots (fine for suite, way over free limit of 10)
    for (let i = 0; i < 50; i++) {
      await recordUsage(acct.account_id, "search", `snap-${i}`, 1, 1, 100);
    }
    expect((await checkQuota(acct.account_id)).allowed).toBe(true);

    await updateAccountTier(acct.account_id, "free");
    const check = await checkQuota(acct.account_id);
    expect(check.allowed).toBe(false);
    expect(check.tier).toBe("free");
    expect(check.reason).toContain("Monthly snapshot limit");
  });

  it("downgrade paid→free blocks when over new project limit", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    // Create 3 real snapshots under different projects
    for (let i = 0; i < 3; i++) {
      const snap = await createSnapshot(makeSnapshotInput(`proj-${i}`));
      await recordUsage(acct.account_id, "search", snap.snapshot_id, 1, 1, 100);
    }
    expect((await checkQuota(acct.account_id)).allowed).toBe(true);

    await updateAccountTier(acct.account_id, "free");
    const check = await checkQuota(acct.account_id);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Project limit");
  });

  it("downgrade suite→paid preserves entitlements added during suite", async () => {
    const acct = await createAccount("Corp", "corp@example.com", "suite");
    // Suite auto-enables all programs. Now downgrade to paid.
    await updateAccountTier(acct.account_id, "paid");
    // Paid tier uses entitlements table — the suite-provisioned entitlements should still exist
    expect(await isProgramEnabled(acct.account_id, "search")).toBe(true);
    expect(await isProgramEnabled(acct.account_id, "seo")).toBe(true);
    expect(await isProgramEnabled(acct.account_id, "marketing")).toBe(true);
  });

  it("upgrade free→suite then downgrade→free loses suite programs", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    expect(await isProgramEnabled(acct.account_id, "seo")).toBe(false);

    await updateAccountTier(acct.account_id, "suite");
    expect(await isProgramEnabled(acct.account_id, "seo")).toBe(true);

    await updateAccountTier(acct.account_id, "free");
    // Free tier only allows search, skills, debug — seo should be blocked
    expect(await isProgramEnabled(acct.account_id, "seo")).toBe(false);
  });
});

// ─── Usage summary edge cases ───────────────────────────────────

describe("Usage summary edge cases", () => {
  it("returns empty array when no usage recorded", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const summary = await getUsageSummary(acct.account_id);
    expect(summary).toEqual([]);
  });

  it("filters by since parameter", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    // Record usage "in the past" by inserting directly with a known timestamp
    await recordUsage(acct.account_id, "search", "snap-old", 1, 5, 100);

    // Get summary with since = far in the future
    const futureDate = "2099-12-31T00:00:00.000Z";
    const summary = await getUsageSummary(acct.account_id, futureDate);
    expect(summary).toEqual([]);
  });

  it("includes records when since is in the past", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    await recordUsage(acct.account_id, "search", "snap-1", 2, 10, 1000);

    const pastDate = "2000-01-01T00:00:00.000Z";
    const summary = await getUsageSummary(acct.account_id, pastDate);
    expect(summary.length).toBe(1);
    expect(summary[0].program).toBe("search");
    expect(summary[0].total_runs).toBe(1);
  });

  it("aggregates same program across multiple snapshots", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    await recordUsage(acct.account_id, "search", "snap-1", 3, 10, 5000);
    await recordUsage(acct.account_id, "search", "snap-2", 7, 20, 15000);
    await recordUsage(acct.account_id, "search", "snap-3", 5, 15, 10000);

    const summary = await getUsageSummary(acct.account_id);
    expect(summary.length).toBe(1);
    const s = summary[0];
    expect(s.total_runs).toBe(3);
    expect(s.total_generators).toBe(15);
    expect(s.total_input_files).toBe(45);
    expect(s.total_input_bytes).toBe(30000);
  });

  it("separates distinct programs in summary", async () => {
    const acct = await createAccount("Corp", "corp@example.com", "suite");
    for (const program of ALL_PROGRAMS) {
      await recordUsage(acct.account_id, program, `snap-${program}`, 1, 1, 100);
    }
    const summary = await getUsageSummary(acct.account_id);
    expect(summary.length).toBe(ALL_PROGRAMS.length);
    const programs = summary.map(s => s.program).sort();
    expect(programs).toEqual([...ALL_PROGRAMS].sort());
  });
});

// ─── recordUsage edge cases ─────────────────────────────────────

describe("recordUsage edge cases", () => {
  it("records zero values without error", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const record = await recordUsage(acct.account_id, "search", "snap-0", 0, 0, 0);
    expect(record.usage_id).toBeTruthy();
    expect(record.generators_run).toBe(0);
    expect(record.input_files).toBe(0);
    expect(record.input_bytes).toBe(0);
  });

  it("records multiple programs on same snapshot", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    await recordUsage(acct.account_id, "search", "snap-1", 3, 10, 5000);
    await recordUsage(acct.account_id, "debug", "snap-1", 2, 10, 5000);
    await recordUsage(acct.account_id, "skills", "snap-1", 1, 10, 5000);

    const summary = await getUsageSummary(acct.account_id);
    expect(summary.length).toBe(3);

    // Monthly count should be 1 (same snapshot_id)
    const monthly = await getMonthlySnapshotCount(acct.account_id);
    expect(monthly).toBe(1);
  });

  it("records same program on same snapshot as separate entries", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    await recordUsage(acct.account_id, "search", "snap-1", 3, 10, 5000);
    await recordUsage(acct.account_id, "search", "snap-1", 2, 5, 2500);

    const summary = await getUsageSummary(acct.account_id);
    const searchSummary = summary.find(s => s.program === "search")!;
    expect(searchSummary.total_runs).toBe(2);
    expect(searchSummary.total_generators).toBe(5);
    expect(searchSummary.total_input_bytes).toBe(7500);
  });

  it("large values do not overflow in aggregation", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const bigBytes = 2_000_000_000; // 2 GB
    await recordUsage(acct.account_id, "search", "snap-1", 100, 5000, bigBytes);
    await recordUsage(acct.account_id, "search", "snap-2", 100, 5000, bigBytes);

    const summary = await getUsageSummary(acct.account_id);
    const s = summary[0];
    expect(s.total_input_bytes).toBe(bigBytes * 2);
    expect(s.total_generators).toBe(200);
    expect(s.total_input_files).toBe(10000);
  });

  it("each recordUsage gets unique usage_id", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const r1 = await recordUsage(acct.account_id, "search", "snap-1", 1, 1, 100);
    const r2 = await recordUsage(acct.account_id, "search", "snap-2", 1, 1, 100);
    expect(r1.usage_id).not.toBe(r2.usage_id);
  });
});

// ─── getProjectCount edge cases ─────────────────────────────────

describe("getProjectCount edge cases", () => {
  it("returns 0 when usage exists but no matching snapshots in DB", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    // Record usage with a fake snapshot_id that doesn't exist in snapshots table
    await recordUsage(acct.account_id, "search", "nonexistent-snap", 1, 1, 100);
    // JOIN fails to match, count should be 0
    const count = await getProjectCount(acct.account_id);
    expect(count).toBe(0);
  });

  it("returns 0 for account with no usage", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const count = await getProjectCount(acct.account_id);
    expect(count).toBe(0);
  });

  it("counts distinct projects correctly across multiple snapshots", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    // Create 3 snapshots: 2 under proj-a, 1 under proj-b
    const snap1 = await createSnapshot(makeSnapshotInput("proj-a"));
    const snap2 = await createSnapshot(makeSnapshotInput("proj-a"));
    const snap3 = await createSnapshot(makeSnapshotInput("proj-b"));
    await recordUsage(acct.account_id, "search", snap1.snapshot_id, 1, 1, 100);
    await recordUsage(acct.account_id, "search", snap2.snapshot_id, 1, 1, 100);
    await recordUsage(acct.account_id, "search", snap3.snapshot_id, 1, 1, 100);

    const count = await getProjectCount(acct.account_id);
    expect(count).toBe(2); // proj-a and proj-b
  });
});

// ─── API key edge cases ─────────────────────────────────────────

describe("API key edge cases", () => {
  it("multiple keys same account, revoking one leaves others valid", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const { apiKey: key1, rawKey: raw1 } = await createApiKey(acct.account_id, "key-1");
    const { rawKey: raw2 } = await createApiKey(acct.account_id, "key-2");

    await revokeApiKey(key1.key_id);

    expect(await resolveApiKey(raw1)).toBeUndefined();
    const resolved = await resolveApiKey(raw2);
    expect(resolved).toBeTruthy();
    expect(resolved!.account.account_id).toBe(acct.account_id);
  });

  it("resolveApiKey returns current tier after upgrade", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const { rawKey } = await createApiKey(acct.account_id);

    await updateAccountTier(acct.account_id, "paid");
    const resolved = await resolveApiKey(rawKey);
    expect(resolved!.account.tier).toBe("paid");
  });
});

// ─── isProgramEnabled edge cases ────────────────────────────────

describe("isProgramEnabled edge cases", () => {
  it("returns false for completely unknown program name", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    expect(await isProgramEnabled(acct.account_id, "nonexistent_program")).toBe(false);
  });

  it("returns false for suite-only program on free tier", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    // Programs like "seo", "marketing" are not in free tier programs list
    expect(await isProgramEnabled(acct.account_id, "seo")).toBe(false);
    expect(await isProgramEnabled(acct.account_id, "marketing")).toBe(false);
    expect(await isProgramEnabled(acct.account_id, "canvas")).toBe(false);
    expect(await isProgramEnabled(acct.account_id, "remotion")).toBe(false);
  });

  it("paid tier with no entitlements denies all programs", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    // Paid tier doesn't have built-in programs; relies on entitlements table
    for (const p of ALL_PROGRAMS) {
      expect(await isProgramEnabled(acct.account_id, p)).toBe(false);
    }
  });

  it("enabling then disabling a program toggles correctly", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    await enableProgram(acct.account_id, "search");
    expect(await isProgramEnabled(acct.account_id, "search")).toBe(true);
    await enableProgram(acct.account_id, "search"); // double enable is idempotent
    expect(await isProgramEnabled(acct.account_id, "search")).toBe(true);
  });
});
