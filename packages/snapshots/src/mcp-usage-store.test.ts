import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetTestDb } from "./pg-test.js";
import { sql, closePool } from "./pg.js";
import {
  recordMcpUsage,
  getMcpUsageWindows,
  getMcpUsageSummary,
  getMcpUsageNewVsReturning,
  getRecentMcpUsage,
} from "./mcp-usage-store.js";

const daysAgo = (n: number): string => new Date(Date.now() - n * 86400000).toISOString();

/** Insert a row with an explicit created_at (recordMcpUsage always stamps "now"). */
async function insertAt(
  created_at: string,
  fields: Partial<{ account_id: string | null; tool: string; source: string; probe_class: string; user_agent: string }> = {},
): Promise<void> {
  await sql.run(
    `INSERT INTO mcp_usage (usage_id, account_id, tool, source, probe_class, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      fields.account_id ?? null,
      fields.tool ?? "list_programs",
      fields.source ?? "unknown",
      fields.probe_class ?? "unknown",
      fields.user_agent ?? "",
      created_at,
    ],
  );
}

describe("mcp-usage-store", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("recordMcpUsage persists a row with the supplied fields", async () => {
    await recordMcpUsage({
      account_id: "acc_1",
      tool: "analyze_repo",
      source: "claude",
      probe_class: "dev-tool",
      user_agent: "Claude-Desktop/1.0",
    });
    const rows = await getRecentMcpUsage();
    expect(rows).toHaveLength(1);
    expect(rows[0].account_id).toBe("acc_1");
    expect(rows[0].tool).toBe("analyze_repo");
    expect(rows[0].source).toBe("claude");
    expect(rows[0].probe_class).toBe("dev-tool");
  });

  it("recordMcpUsage allows null account_id (anonymous calls) and defaults", async () => {
    await recordMcpUsage({ account_id: null, tool: "list_programs" });
    const rows = await getRecentMcpUsage();
    expect(rows[0].account_id).toBeNull();
    expect(rows[0].source).toBe("unknown");
    expect(rows[0].probe_class).toBe("unknown");
  });

  it("getMcpUsageWindows counts rolling 24h / 7d / 30d windows", async () => {
    await insertAt(daysAgo(0));
    await insertAt(daysAgo(3));
    await insertAt(daysAgo(10));
    await insertAt(daysAgo(40));
    const w = await getMcpUsageWindows();
    expect(w.total).toBe(4);
    expect(w.last_24h).toBe(1);
    expect(w.last_7d).toBe(2);
    expect(w.last_30d).toBe(3);
  });

  it("getMcpUsageSummary breaks down by tool / source and counts unique vs anonymous", async () => {
    await insertAt(daysAgo(1), { account_id: "acc_1", tool: "analyze_repo", source: "claude" });
    await insertAt(daysAgo(1), { account_id: "acc_1", tool: "analyze_repo", source: "claude" });
    await insertAt(daysAgo(2), { account_id: "acc_2", tool: "list_programs", source: "cursor" });
    await insertAt(daysAgo(2), { account_id: null, tool: "list_programs", source: "smithery" });

    const s = await getMcpUsageSummary();
    expect(s.total_calls).toBe(4);
    expect(s.unique_accounts).toBe(2);
    expect(s.anonymous_calls).toBe(1);
    expect(s.by_tool["analyze_repo"]).toBe(2);
    expect(s.by_tool["list_programs"]).toBe(2);
    expect(s.by_source["claude"]).toBe(2);
    expect(s.by_source["cursor"]).toBe(1);
  });

  it("getMcpUsageSummary honors a custom window", async () => {
    await insertAt(daysAgo(2), { account_id: "acc_1" });
    await insertAt(daysAgo(20), { account_id: "acc_1" });
    expect((await getMcpUsageSummary({ windowDays: 7 })).total_calls).toBe(1);
    expect((await getMcpUsageSummary({ windowDays: 30 })).total_calls).toBe(2);
  });

  it("getMcpUsageNewVsReturning splits first-seen-in-window from older accounts", async () => {
    // A: first seen 40d ago, active 2d ago -> returning
    await insertAt(daysAgo(40), { account_id: "acc_A" });
    await insertAt(daysAgo(2), { account_id: "acc_A" });
    // B: first (and only) seen 2d ago -> new
    await insertAt(daysAgo(2), { account_id: "acc_B" });
    // C: only seen 40d ago, inactive in window -> excluded
    await insertAt(daysAgo(40), { account_id: "acc_C" });

    const r = await getMcpUsageNewVsReturning();
    expect(r.new_accounts).toBe(1);
    expect(r.returning_accounts).toBe(1);
  });

  it("getRecentMcpUsage returns newest first and respects the limit", async () => {
    await insertAt(daysAgo(3), { tool: "old" });
    await insertAt(daysAgo(0), { tool: "new" });
    const rows = await getRecentMcpUsage(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].tool).toBe("new");
  });
});

describe("recordMcpUsage resilience", () => {
  it("is a silent no-op when no database is open (never opens axis.db)", async () => {
    // Postgres analogue of the old SQLite "no db open": close the pool so
    // recordMcpUsage's peekPool() guard sees no pool and must short-circuit.
    await closePool();
    await expect(recordMcpUsage({ account_id: null, tool: "list_programs" })).resolves.not.toThrow();
  });
});
