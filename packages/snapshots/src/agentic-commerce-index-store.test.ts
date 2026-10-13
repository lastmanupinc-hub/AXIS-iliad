import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { recordMcpUsage, getRecentMcpUsage } from "./mcp-usage-store.js";
import {
  aggregateMcpUsageForIndex,
  getAgenticCommerceIndexStatus,
  claimAgenticCommerceIndexPeriod,
  publishAgenticCommerceIndex,
  getLatestAgenticCommerceIndex,
} from "./agentic-commerce-index-store.js";

// Real Postgres throughout (the owner's standing rule: no mocked database
// tests). The claim's single-winner guarantee is a property of the database's
// PRIMARY KEY + ON CONFLICT, so only a real database can prove it.

const WEEK_START = "2026-10-05T00:00:00.000Z";
const WEEK_END = "2026-10-12T00:00:00.000Z";

async function insertCall(
  created_at: string,
  f: Partial<{ tool: string; account_id: string | null; probe_class: string; user_agent: string; agent_mode: string | null; budget_header: boolean | null }> = {},
): Promise<void> {
  await sql.run(
    `INSERT INTO mcp_usage (usage_id, account_id, tool, source, probe_class, user_agent, created_at, agent_mode, budget_header)
     VALUES (?, ?, ?, 'claude', ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      f.account_id ?? "acct_private_1",
      f.tool ?? "analyze_repo",
      f.probe_class ?? "dev-tool",
      f.user_agent ?? "Claude-Desktop/9.9 (private-ua)",
      created_at,
      f.agent_mode === undefined ? "standard" : f.agent_mode,
      f.budget_header === undefined ? false : f.budget_header,
    ],
  );
}

const claimArgs = (claimed_by: string, now: string, stale_before = "1970-01-01T00:00:00.000Z") => ({
  period_start: WEEK_START,
  period_end: WEEK_END,
  claimed_by,
  now,
  stale_before,
});

describe("agentic-commerce index store — aggregate reads", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("recordMcpUsage persists the v48 call attributes, and leaves them NULL when not supplied", async () => {
    await recordMcpUsage({ account_id: null, tool: "list_programs", agent_mode: "lite", budget_header: true });
    await recordMcpUsage({ account_id: null, tool: "list_programs" });
    const rows = await getRecentMcpUsage();
    const withAttrs = rows.find((r) => r.agent_mode !== null);
    const without = rows.find((r) => r.agent_mode === null);
    expect(withAttrs?.agent_mode).toBe("lite");
    expect(withAttrs?.budget_header).toBe(true);
    expect(without?.budget_header).toBeNull();
  });

  it("groups calls by tool × mode × budget for the half-open window, and returns nothing row-level", async () => {
    await insertCall("2026-10-05T00:00:00.000Z"); // first instant — inside
    await insertCall("2026-10-08T12:00:00.000Z");
    await insertCall("2026-10-08T12:00:00.000Z", { agent_mode: "lite", budget_header: true, account_id: "acct_private_2" });
    await insertCall("2026-10-11T23:59:59.999Z", { tool: "list_programs" });
    await insertCall("2026-10-12T00:00:00.000Z"); // period_end — outside
    await insertCall("2026-10-04T23:59:59.999Z"); // before start — outside

    const rows = await aggregateMcpUsageForIndex(WEEK_START, WEEK_END, {
      tools: ["analyze_repo", "list_programs"],
      excludeProbeClasses: [],
    });
    const byKey = new Map(rows.map((r) => [`${r.tool}|${r.agent_mode}|${r.budget_header}`, r.calls]));
    expect(byKey.get("analyze_repo|standard|false")).toBe(2);
    expect(byKey.get("analyze_repo|lite|true")).toBe(1);
    expect(byKey.get("list_programs|standard|false")).toBe(1);
    expect(rows.reduce((a, r) => a + r.calls, 0)).toBe(4);
    // Aggregate-only: exactly these four keys, and no seeded identifier anywhere.
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(["agent_mode", "budget_header", "calls", "tool"]);
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain("acct_private");
    expect(serialized).not.toContain("private-ua");
  });

  it("counts only the listed tools and drops excluded probe classes", async () => {
    await insertCall("2026-10-06T00:00:00.000Z", { tool: "__verifymcp_auth_probe_1__" });
    await insertCall("2026-10-06T00:00:00.000Z", { tool: "analyze_repo", probe_class: "registry-crawler" });
    await insertCall("2026-10-06T00:00:00.000Z", { tool: "analyze_repo", probe_class: "quality-agent" });
    await insertCall("2026-10-06T00:00:00.000Z", { tool: "analyze_repo", probe_class: "unknown" });

    const rows = await aggregateMcpUsageForIndex(WEEK_START, WEEK_END, {
      tools: ["analyze_repo"],
      excludeProbeClasses: ["registry-crawler", "quality-agent"],
    });
    expect(rows).toEqual([{ tool: "analyze_repo", agent_mode: "standard", budget_header: false, calls: 1 }]);
    expect(await aggregateMcpUsageForIndex(WEEK_START, WEEK_END, { tools: [], excludeProbeClasses: [] })).toEqual([]);
  });

  it("keeps pre-v48 rows (NULL mode/budget) as their own group so the index can tell 'not recorded' apart", async () => {
    await insertCall("2026-10-06T00:00:00.000Z", { agent_mode: null, budget_header: null });
    const rows = await aggregateMcpUsageForIndex(WEEK_START, WEEK_END, { tools: ["analyze_repo"], excludeProbeClasses: [] });
    expect(rows).toEqual([{ tool: "analyze_repo", agent_mode: null, budget_header: null, calls: 1 }]);
  });
});

describe("agentic-commerce index store — the single-instance claim", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("exactly one of many concurrent claimants wins a week", async () => {
    const now = "2026-10-12T01:00:00.000Z";
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => claimAgenticCommerceIndexPeriod(claimArgs(`instance-${i}`, now))),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await getAgenticCommerceIndexStatus(WEEK_END)).toBe("claimed");
    const owners = await sql.many<{ claimed_by: string }>("SELECT claimed_by FROM agentic_commerce_index");
    expect(owners).toHaveLength(1);
  });

  it("a live claim is not taken over; a stale one is, and the old owner then cannot publish", async () => {
    expect(await claimAgenticCommerceIndexPeriod(claimArgs("dead-instance", "2026-10-12T01:00:00.000Z"))).toBe(true);
    // Still fresh relative to this stale_before → not reclaimable.
    expect(
      await claimAgenticCommerceIndexPeriod(claimArgs("other", "2026-10-12T01:05:00.000Z", "2026-10-12T00:50:00.000Z")),
    ).toBe(false);
    // Past the stale cutoff → taken over.
    expect(
      await claimAgenticCommerceIndexPeriod(claimArgs("rescuer", "2026-10-12T02:00:00.000Z", "2026-10-12T01:45:00.000Z")),
    ).toBe(true);
    expect(
      await publishAgenticCommerceIndex({ period_end: WEEK_END, claimed_by: "dead-instance", payload: "{}", published_at: "2026-10-12T02:01:00.000Z" }),
    ).toBe(false);
    expect(
      await publishAgenticCommerceIndex({ period_end: WEEK_END, claimed_by: "rescuer", payload: '{"ok":1}', published_at: "2026-10-12T02:01:00.000Z" }),
    ).toBe(true);
    expect(await getAgenticCommerceIndexStatus(WEEK_END)).toBe("published");
  });

  it("a published week is never reclaimed, however old", async () => {
    await claimAgenticCommerceIndexPeriod(claimArgs("a", "2026-10-12T01:00:00.000Z"));
    await publishAgenticCommerceIndex({ period_end: WEEK_END, claimed_by: "a", payload: '{"v":1}', published_at: "2026-10-12T01:01:00.000Z" });
    expect(
      await claimAgenticCommerceIndexPeriod(claimArgs("b", "2030-01-01T00:00:00.000Z", "2029-12-31T00:00:00.000Z")),
    ).toBe(false);
    expect((await getLatestAgenticCommerceIndex())?.payload).toBe('{"v":1}');
  });

  it("latest returns the newest PUBLISHED week, ignoring an unpublished claim", async () => {
    expect(await getLatestAgenticCommerceIndex()).toBeUndefined();
    await claimAgenticCommerceIndexPeriod(claimArgs("a", "2026-10-12T01:00:00.000Z"));
    await publishAgenticCommerceIndex({ period_end: WEEK_END, claimed_by: "a", payload: '{"week":41}', published_at: "2026-10-12T01:01:00.000Z" });
    await claimAgenticCommerceIndexPeriod({
      period_start: WEEK_END,
      period_end: "2026-10-19T00:00:00.000Z",
      claimed_by: "a",
      now: "2026-10-19T01:00:00.000Z",
      stale_before: "1970-01-01T00:00:00.000Z",
    });
    const latest = await getLatestAgenticCommerceIndex();
    expect(latest?.period_end).toBe(WEEK_END);
    expect(latest?.payload).toBe('{"week":41}');
  });
});
