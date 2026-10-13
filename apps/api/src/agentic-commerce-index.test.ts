import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { Server } from "node:http";
import { resetTestDb, sql, type McpUsageAggregate } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { resetRateLimits } from "./rate-limiter.js";
import { handleMcpPost, MCP_TOOLS } from "./mcp-server.js";
import { deriveMcpToolCatalog } from "./mcp-tool-impls.js";
import {
  INDEX_MIN_CALLS_PER_ROW,
  INDEX_MIN_CALLS_PER_PERIOD,
  INDEX_TOOL_CATEGORIES,
  INDEX_NOT_ENOUGH_CALLS_MESSAGE,
  INDEX_CLAIM_STALE_MS,
  buildIndexCatalog,
  closedWeekAt,
  computeAgenticCommerceIndex,
  publishDueAgenticCommerceIndex,
  handleGetAgenticCommerceIndex,
  type AgenticCommerceIndexDocument,
  type IndexBreakdown,
  type IndexCatalogEntry,
  type IndexRow,
} from "./agentic-commerce-index.js";

// ─── Shared helpers ─────────────────────────────────────────────

/** Every key the published document may contain, at any depth. Anything else is a leak. */
const ALLOWED_KEYS = new Set([
  // document
  "index", "schema_version", "publisher", "page_url", "status", "message",
  "period_start", "period_end", "comparison_period_start", "comparison_period_end", "generated_at", "method",
  "tools", "categories", "pricing", "agent_modes", "budget_headers",
  // publisher
  "name", "url",
  // breakdown
  "rows", "other_share_pct",
  // row
  "key", "label", "rank", "share_pct", "change_pp", "category",
]);
/** Named explicitly so a reader of this test sees what "no customer data, no volume" means here. */
const FORBIDDEN_KEY_FRAGMENTS = [
  "count", "calls", "total", "volume", "revenue", "cents", "account", "user", "agent_id", "caller",
  "ip", "api_key", "token", "email", "source", "probe", "ua",
];

function collectKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
  return out;
}

function collectNumbers(value: unknown, path = "", out: Array<{ path: string; n: number }> = []) {
  if (typeof value === "number") out.push({ path, n: value });
  else if (Array.isArray(value)) value.forEach((v, i) => collectNumbers(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collectNumbers(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

function expectNoIdentifyingOrVolumeData(doc: unknown): void {
  const keys = collectKeys(doc);
  for (const k of keys) expect(ALLOWED_KEYS.has(k), `unexpected key "${k}" in the published index`).toBe(true);
  for (const k of keys) {
    for (const frag of FORBIDDEN_KEY_FRAGMENTS) {
      expect(k.toLowerCase().includes(frag), `key "${k}" contains "${frag}"`).toBe(false);
    }
  }
  // No absolute number can hide in a document whose every number is a
  // percent, a percentage-point change or a rank (all within ±100).
  for (const { path, n } of collectNumbers(doc)) {
    if (path === "schema_version") continue;
    expect(Number.isInteger(n), `${path} is not an integer`).toBe(true);
    expect(Math.abs(n) <= 100, `${path} = ${n} is outside ±100 — looks like a count`).toBe(true);
  }
}

function sumOf(b: IndexBreakdown): number {
  return b.rows.reduce((a, r) => a + r.share_pct, 0) + b.other_share_pct;
}

function breakdowns(doc: AgenticCommerceIndexDocument): IndexBreakdown[] {
  return [doc.tools, doc.categories, doc.pricing, doc.agent_modes, doc.budget_headers].filter(
    (b): b is IndexBreakdown => b !== null,
  );
}

const rowByKey = (b: IndexBreakdown | null, key: string): IndexRow | undefined => b?.rows.find((r) => r.key === key);

// ─── Catalog ────────────────────────────────────────────────────

describe("agentic-commerce index — catalog classification", () => {
  it("every MCP tool has a category, and the category map names no tool that no longer exists", () => {
    const derived = new Map(deriveMcpToolCatalog().map((t) => [t.name, t]));
    const names = new Set(MCP_TOOLS.map((t) => t.name));
    for (const name of names) {
      const isEstate = derived.get(name)?.estate === true;
      expect(isEstate || name in INDEX_TOOL_CATEGORIES, `${name} has no index category`).toBe(true);
    }
    for (const name of Object.keys(INDEX_TOOL_CATEGORIES)) {
      expect(names.has(name), `${name} is categorized but not in MCP_TOOLS`).toBe(true);
      expect(derived.get(name)?.estate, `${name} is an estate relay and must not be listed by hand`).toBe(false);
    }
  });

  it("estate relays are categorized from the flag, and metered follows deriveMcpToolCatalog's pricing", () => {
    const catalog = new Map(buildIndexCatalog().map((t) => [t.name, t]));
    for (const d of deriveMcpToolCatalog()) {
      const c = catalog.get(d.name) as IndexCatalogEntry;
      expect(c.category === "estate").toBe(d.estate);
      expect(c.pricing === "metered").toBe(d.pricing.startsWith("$"));
      expect(c.label.length).toBeGreaterThan(0);
    }
    expect(catalog.get("prepare_agentic_purchasing")?.category).toBe("agentic_commerce");
    expect(catalog.get("analyze_repo")?.pricing).toBe("metered");
    expect(catalog.get("list_programs")?.pricing).toBe("not_metered");
  });
});

// ─── Periods ────────────────────────────────────────────────────

describe("agentic-commerce index — weeks", () => {
  it("a mid-week instant maps to the Monday-to-Monday week that closed before it", () => {
    expect(closedWeekAt(new Date("2026-10-14T12:00:00.000Z"))).toEqual({
      period_start: "2026-10-05T00:00:00.000Z",
      period_end: "2026-10-12T00:00:00.000Z",
      comparison_period_start: "2026-09-28T00:00:00.000Z",
      comparison_period_end: "2026-10-05T00:00:00.000Z",
    });
  });

  it("Monday 00:00 UTC closes the week that just ended; Sunday 23:59 still belongs to the one before", () => {
    expect(closedWeekAt(new Date("2026-10-12T00:00:00.000Z")).period_end).toBe("2026-10-12T00:00:00.000Z");
    expect(closedWeekAt(new Date("2026-10-11T23:59:59.999Z")).period_end).toBe("2026-10-05T00:00:00.000Z");
  });
});

// ─── Pure computation ───────────────────────────────────────────

const PERIOD = closedWeekAt(new Date("2026-10-14T12:00:00.000Z"));

function catalogOf(entries: Array<[string, IndexCatalogEntry["category"], IndexCatalogEntry["pricing"]]>): IndexCatalogEntry[] {
  return entries.map(([name, category, pricing]) => ({ name, label: name, category, pricing }));
}

function agg(tool: string, calls: number, agent_mode: string | null = "standard", budget_header: boolean | null = false): McpUsageAggregate {
  return { tool, calls, agent_mode, budget_header };
}

function compute(current: McpUsageAggregate[], previous: McpUsageAggregate[], catalog: IndexCatalogEntry[]) {
  return computeAgenticCommerceIndex({ ...PERIOD, generated_at: "2026-10-12T00:10:00.000Z", current, previous, catalog });
}

/** A small deterministic PRNG (mulberry32) so the property test is reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("agentic-commerce index — shares, ranks, suppression (pure)", () => {
  const k = INDEX_MIN_CALLS_PER_ROW;

  it("a week below the floor publishes the not-enough-calls message and no numbers", () => {
    const catalog = catalogOf([["a", "codebase_intelligence", "metered"]]);
    const doc = compute([agg("a", INDEX_MIN_CALLS_PER_PERIOD - 1)], [], catalog);
    expect(doc.status).toBe("insufficient_data");
    expect(doc.message).toBe(INDEX_NOT_ENOUGH_CALLS_MESSAGE);
    expect(breakdowns(doc)).toEqual([]);
    expect(doc.period_end).toBe(PERIOD.period_end);
    expectNoIdentifyingOrVolumeData(doc);
  });

  it("thirds round to 34/33/33 — every breakdown sums to exactly 100", () => {
    const catalog = catalogOf([
      ["a", "codebase_intelligence", "metered"],
      ["b", "codebase_intelligence", "metered"],
      ["c", "codebase_intelligence", "metered"],
    ]);
    const doc = compute([agg("a", 40), agg("b", 40), agg("c", 40)], [], catalog);
    expect(doc.tools?.rows.map((r) => r.share_pct)).toEqual([34, 33, 33]);
    expect(doc.tools?.rows.map((r) => r.rank)).toEqual([1, 1, 1]);
    for (const b of breakdowns(doc)) expect(sumOf(b)).toBe(100);
  });

  it("a row under k folds into other; when that leaves other under k, the smallest named row folds in too", () => {
    const catalog = catalogOf([
      ["big", "codebase_intelligence", "metered"],
      ["mid", "codebase_intelligence", "metered"],
      ["small", "codebase_intelligence", "metered"],
      ["tiny", "codebase_intelligence", "metered"],
    ]);
    const doc = compute([agg("big", 60), agg("mid", 30), agg("small", 25), agg("tiny", k - 1)], [], catalog);
    expect(doc.tools?.rows.map((r) => r.key)).toEqual(["big", "mid"]);
    // other = small 25 + tiny 19 = 44 of 134
    expect(doc.tools?.other_share_pct).toBe(33);
    expect(sumOf(doc.tools as IndexBreakdown)).toBe(100);
  });

  it("a category's remainder under k forces a named tool out, so the small tool cannot be recovered by subtraction", () => {
    const catalog = catalogOf([
      ["a1", "codebase_intelligence", "metered"],
      ["a2", "codebase_intelligence", "metered"],
      ["a_small", "codebase_intelligence", "metered"],
      ["b1", "agentic_commerce", "metered"],
    ]);
    const doc = compute([agg("a1", 100), agg("a2", 50), agg("a_small", 5), agg("b1", 60)], [], catalog);
    // Global other would be 5 (< k) and codebase's remainder would be 5 (< k):
    // a2 is folded in with a_small.
    expect(doc.tools?.rows.map((r) => r.key)).toEqual(["a1", "b1"]);
    const codebase = rowByKey(doc.categories, "codebase_intelligence");
    expect(codebase).toBeDefined();
  });

  it("ties share a rank and the next rank skips; a change is against the share last week's index showed", () => {
    const catalog = catalogOf([
      ["a", "codebase_intelligence", "metered"],
      ["b", "agentic_commerce", "not_metered"],
      ["c", "agentic_commerce", "not_metered"],
      ["d", "discovery", "not_metered"],
    ]);
    const doc = compute(
      [agg("a", 50), agg("b", 50), agg("c", 30), agg("d", 30)],
      [agg("a", 100), agg("b", 50), agg("c", k - 1), agg("d", 0)],
      catalog,
    );
    expect(doc.tools?.rows.map((r) => [r.key, r.rank, r.share_pct])).toEqual([["a", 1, 31], ["b", 1, 31], ["c", 3, 19], ["d", 3, 19]]);
    // The prior week, by the same rules, showed only a (59%): c was under k,
    // which left other at 19 < k, so b (50 calls) was folded in to protect it.
    expect(rowByKey(doc.tools, "a")?.change_pp).toBe(31 - 59);
    expect(rowByKey(doc.tools, "b")?.change_pp).toBeNull(); // folded into other last week
    expect(rowByKey(doc.tools, "c")?.change_pp).toBeNull(); // under k last week
    expect(rowByKey(doc.tools, "d")?.change_pp).toBeNull(); // no prior calls

    const thinPrior = compute([agg("a", 60), agg("b", 60)], [agg("a", 50), agg("b", 40)], catalog);
    // Prior week's base (90) is under the period floor → no comparisons at all.
    expect(thinPrior.tools?.rows.every((r) => r.change_pp === null)).toBe(true);
  });

  it("mode and budget shares count only calls that recorded them, and need their own floor", () => {
    const catalog = catalogOf([["a", "codebase_intelligence", "metered"]]);
    const doc = compute(
      [agg("a", 150, null, null), agg("a", 60, "standard", false), agg("a", 40, "lite", true)],
      [],
      catalog,
    );
    expect(doc.status).toBe("published");
    expect(rowByKey(doc.agent_modes, "standard")?.share_pct).toBe(60);
    expect(rowByKey(doc.agent_modes, "lite")?.share_pct).toBe(40);
    expect(rowByKey(doc.budget_headers, "sent")?.share_pct).toBe(40);

    const unrecorded = compute([agg("a", 150, null, null), agg("a", 30, "lite", true)], [], catalog);
    expect(unrecorded.agent_modes).toBeNull(); // 30 recorded calls < period floor
    expect(unrecorded.budget_headers).toBeNull();
  });

  it("names outside the catalog never reach the index", () => {
    const catalog = catalogOf([["a", "codebase_intelligence", "metered"]]);
    const doc = compute([agg("a", 120), agg("__verifymcp_auth_probe_1__", 5000)], [], catalog);
    expect(doc.tools?.rows.map((r) => r.key)).toEqual(["a"]);
    expect(doc.tools?.rows[0].share_pct).toBe(100);
    expect(JSON.stringify(doc)).not.toContain("verifymcp");
  });

  it("property: across random weeks, shares sum to 100 and nothing derivable rests on fewer than k calls", () => {
    const categories = ["codebase_intelligence", "agentic_commerce", "agent_infrastructure"] as const;
    const pricings = ["metered", "not_metered"] as const;
    const catalog = catalogOf(
      Array.from({ length: 14 }, (_, i) => [`t${i}`, categories[i % 3], pricings[(i >> 1) % 2]] as [string, IndexCatalogEntry["category"], IndexCatalogEntry["pricing"]]),
    );
    const cat = new Map(catalog.map((c) => [c.name, c]));
    const rand = rng(16);
    let published = 0;
    for (let trial = 0; trial < 300; trial++) {
      const counts = new Map<string, number>();
      const current: McpUsageAggregate[] = [];
      for (const c of catalog) {
        const r = rand();
        const n = r < 0.3 ? 0 : r < 0.6 ? Math.floor(rand() * k) : Math.floor(rand() * 200);
        counts.set(c.name, n);
        if (n > 0) current.push(agg(c.name, n));
      }
      const doc = compute(current, [], catalog);
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      if (total < INDEX_MIN_CALLS_PER_PERIOD) {
        expect(doc.status).toBe("insufficient_data");
        continue;
      }
      published++;
      for (const b of breakdowns(doc)) expect(sumOf(b)).toBe(100);

      const shown = new Set(doc.tools?.rows.map((r) => r.key));
      for (const key of shown) expect(counts.get(key)).toBeGreaterThanOrEqual(k);
      const shownSum = [...shown].reduce((a, key) => a + (counts.get(key) ?? 0), 0);
      const other = total - shownSum;
      expect(other === 0 || other >= k, `tool other = ${other}`).toBe(true);

      for (const [field, attr] of [["categories", "category"], ["pricing", "pricing"]] as const) {
        const groups = new Map<string, number>();
        for (const [name, n] of counts) {
          const g = cat.get(name)![attr];
          groups.set(g, (groups.get(g) ?? 0) + n);
        }
        const shownGroups = new Set(doc[field]?.rows.map((r) => r.key));
        for (const g of shownGroups) expect(groups.get(g)).toBeGreaterThanOrEqual(k);
        const groupOther = [...groups].filter(([g]) => !shownGroups.has(g)).reduce((a, [, n]) => a + n, 0);
        expect(groupOther === 0 || groupOther >= k, `${field} other = ${groupOther}`).toBe(true);
        // Every remainder a reader can derive by subtraction is 0 or ≥ k.
        const effective = (name: string) => (shownGroups.has(cat.get(name)![attr]) ? cat.get(name)![attr] : "__other");
        const remainders = new Map<string, number>();
        for (const [g, n] of groups) {
          const eg = shownGroups.has(g) ? g : "__other";
          remainders.set(eg, (remainders.get(eg) ?? 0) + n);
        }
        for (const key of shown) remainders.set(effective(key), (remainders.get(effective(key)) ?? 0) - (counts.get(key) ?? 0));
        for (const [eg, rem] of remainders) expect(rem === 0 || rem >= k, `${field}/${eg} remainder = ${rem}`).toBe(true);
      }
      expectNoIdentifyingOrVolumeData(doc);
    }
    expect(published).toBeGreaterThan(100); // the property was exercised, not skipped
  });
});

// ─── End to end: real Postgres, the scheduler's run, the HTTP route ──

const NOW = new Date("2026-10-14T12:00:00.000Z"); // Wednesday → closed week 2026-10-05..12
const IN_WEEK = "2026-10-08T15:30:00.000Z";
const IN_PRIOR_WEEK = "2026-10-01T09:00:00.000Z";
const SECRET_ACCOUNT = "acct_secret_customer_7f3a";
const SECRET_UA = "SecretAgent/4.2 (customer-xyz-private)";

async function seed(
  tool: string,
  n: number,
  at: string,
  opts: { mode?: string | null; budget?: boolean | null; probe?: string } = {},
): Promise<void> {
  await sql.run(
    `INSERT INTO mcp_usage (usage_id, account_id, tool, source, probe_class, user_agent, created_at, agent_mode, budget_header)
     SELECT gen_random_uuid()::text, ?, ?, 'claude', ?, ?, ?, ?, ? FROM generate_series(1, ?)`,
    [
      SECRET_ACCOUNT,
      tool,
      opts.probe ?? "dev-tool",
      SECRET_UA,
      at,
      opts.mode === undefined ? "standard" : opts.mode,
      opts.budget === undefined ? false : opts.budget,
      n,
    ],
  );
}

/**
 * The worked example the expectations below are computed from by hand
 * (345 qualifying calls this week, 210 the week before):
 *   this week:  analyze_repo 120 (60 standard, 40 lite + budget, 20 engineer) · list_programs 80 (50 standard + budget,
 *               30 pre-v48) · prepare_agentic_purchasing 80 · sca_exemption_decision 25 · get_artifact 21 ·
 *               get_snapshot 19 (under k)
 *   last week:  analyze_repo 100 · prepare_agentic_purchasing 80 · list_programs 30 — which published
 *               tools 48/38/14, categories 62/38, metered 86/14, standard mode 100, no budget header 100
 * plus traffic that must be ignored: a scanner's made-up tool names, a registry crawler, a quality agent.
 */
async function seedWorkedExample(): Promise<void> {
  await seed("analyze_repo", 60, IN_WEEK);
  await seed("analyze_repo", 40, IN_WEEK, { mode: "lite", budget: true });
  await seed("analyze_repo", 20, IN_WEEK, { mode: "engineer" });
  await seed("list_programs", 50, IN_WEEK, { budget: true });
  await seed("list_programs", 30, IN_WEEK, { mode: null, budget: null });
  await seed("prepare_agentic_purchasing", 80, IN_WEEK);
  await seed("sca_exemption_decision", 25, IN_WEEK);
  await seed("get_artifact", 21, IN_WEEK);
  await seed("get_snapshot", 19, IN_WEEK);
  await seed("__verifymcp_auth_probe_9__", 500, IN_WEEK);
  await seed("analyze_repo", 300, IN_WEEK, { probe: "registry-crawler" });
  await seed("prepare_agentic_purchasing", 40, IN_WEEK, { probe: "quality-agent" });
  // The week before.
  await seed("analyze_repo", 100, IN_PRIOR_WEEK);
  await seed("prepare_agentic_purchasing", 80, IN_PRIOR_WEEK);
  await seed("list_programs", 30, IN_PRIOR_WEEK);
}

let server: Server;
let baseUrl = "";

async function getIndex(): Promise<{ status: number; cache: string | null; doc: AgenticCommerceIndexDocument }> {
  const res = await fetch(`${baseUrl}/v1/agentic-commerce-index`);
  return { status: res.status, cache: res.headers.get("cache-control"), doc: (await res.json()) as AgenticCommerceIndexDocument };
}

describe("agentic-commerce index — end to end on the real database", () => {
  beforeAll(async () => {
    await resetTestDb();
    resetRateLimits();
    const router = new Router();
    router.get("/v1/agentic-commerce-index", handleGetAgenticCommerceIndex);
    router.post("/mcp", handleMcpPost);
    const t = await startTestServer(router);
    server = t.server;
    baseUrl = t.baseUrl;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  it("before anything is published the route answers 'pending' in the same schema", async () => {
    const { status, doc } = await getIndex();
    expect(status).toBe(200);
    expect(doc.status).toBe("pending");
    expect(doc.period_start).toBeNull();
    expect(doc.generated_at).toBeNull();
    expect(doc.method.length).toBeGreaterThan(100);
    expectNoIdentifyingOrVolumeData(doc);
  });

  it("publishes the worked example: shares, ranks, changes, suppression — and serves it", async () => {
    await seedWorkedExample();
    const outcome = await publishDueAgenticCommerceIndex({ now: NOW, instanceId: "test-a" });
    expect(outcome).toEqual({ outcome: "published", period_end: "2026-10-12T00:00:00.000Z", status: "published" });

    const { status, cache, doc } = await getIndex();
    expect(status).toBe(200);
    expect(cache).toContain("max-age");
    expect(doc.status).toBe("published");
    expect(doc.message).toBeNull();
    expect(doc.period_start).toBe("2026-10-05T00:00:00.000Z");
    expect(doc.period_end).toBe("2026-10-12T00:00:00.000Z");
    expect(doc.comparison_period_start).toBe("2026-09-28T00:00:00.000Z");
    expect(typeof doc.generated_at).toBe("string");

    // Tools: get_snapshot (19) is under k; get_artifact (21) is folded in with
    // it because codebase's remainder would otherwise be exactly get_snapshot's 19.
    expect(doc.tools?.rows.map((r) => [r.key, r.rank, r.share_pct, r.change_pp])).toEqual([
      ["analyze_repo", 1, 35, 35 - 48],
      ["list_programs", 2, 23, 23 - 14],
      ["prepare_agentic_purchasing", 2, 23, 23 - 38],
      ["sca_exemption_decision", 4, 7, null], // not in last week's index
    ]);
    expect(doc.tools?.other_share_pct).toBe(12);
    expect(rowByKey(doc.tools, "analyze_repo")).toMatchObject({ category: "codebase_intelligence", pricing: "metered" });

    expect(doc.categories?.rows.map((r) => [r.key, r.share_pct, r.change_pp])).toEqual([
      ["codebase_intelligence", 70, 70 - 62],
      ["agentic_commerce", 30, 30 - 38],
    ]);
    expect(doc.pricing?.rows.map((r) => [r.key, r.share_pct, r.change_pp])).toEqual([
      ["metered", 58, 58 - 86],
      ["not_metered", 42, 42 - 14],
    ]);
    // Modes/budget: the 30 pre-v48 calls are excluded from these two bases (315).
    expect(doc.agent_modes?.rows.map((r) => [r.key, r.share_pct, r.change_pp])).toEqual([
      ["standard", 81, 81 - 100],
      ["lite", 13, null],
      ["engineer", 6, null],
    ]);
    expect(doc.budget_headers?.rows.map((r) => [r.key, r.share_pct, r.change_pp])).toEqual([
      ["not_sent", 71, 71 - 100],
      ["sent", 29, null],
    ]);

    for (const b of breakdowns(doc)) expect(sumOf(b), "breakdown must sum to 100").toBe(100);
    expect(doc.tools?.rows.some((r) => r.key === "get_snapshot")).toBe(false);
    expectNoIdentifyingOrVolumeData(doc);
    const serialized = JSON.stringify(doc);
    for (const secret of [SECRET_ACCOUNT, SECRET_UA, "customer-xyz", "verifymcp", "dev-tool", "claude"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("a week with too few calls says so instead of publishing numbers; exactly the floor publishes", async () => {
    await seed("analyze_repo", INDEX_MIN_CALLS_PER_PERIOD - 1, IN_WEEK);
    await seed("analyze_repo", 1000, IN_WEEK, { probe: "registry-crawler" }); // crawlers do not count toward the floor
    expect(await publishDueAgenticCommerceIndex({ now: NOW, instanceId: "test-a" })).toMatchObject({ status: "insufficient_data" });
    const { doc } = await getIndex();
    expect(doc.status).toBe("insufficient_data");
    expect(doc.message).toBe(INDEX_NOT_ENOUGH_CALLS_MESSAGE);
    expect([doc.tools, doc.categories, doc.pricing, doc.agent_modes, doc.budget_headers]).toEqual([null, null, null, null, null]);
    expect(doc.period_end).toBe("2026-10-12T00:00:00.000Z");
    expectNoIdentifyingOrVolumeData(doc);

    await resetTestDb();
    await seed("analyze_repo", INDEX_MIN_CALLS_PER_PERIOD, IN_WEEK);
    expect(await publishDueAgenticCommerceIndex({ now: NOW, instanceId: "test-a" })).toMatchObject({ status: "published" });
    expect((await getIndex()).doc.tools?.rows).toEqual([
      expect.objectContaining({ key: "analyze_repo", rank: 1, share_pct: 100 }),
    ]);
  });

  it("single-instance claim: six instances racing on the same tick compute the week exactly once", async () => {
    await seedWorkedExample();
    const outcomes = await Promise.all(
      Array.from({ length: 6 }, (_, i) => publishDueAgenticCommerceIndex({ now: NOW, instanceId: `machine-${i}` })),
    );
    expect(outcomes.filter((o) => o.outcome === "published")).toHaveLength(1);
    for (const o of outcomes) expect(["published", "claimed_elsewhere", "already_published"]).toContain(o.outcome);
    const rows = await sql.many<{ status: string }>("SELECT status FROM agentic_commerce_index");
    expect(rows).toEqual([{ status: "published" }]);
    // The next hourly tick, on any instance, is a no-op.
    expect((await publishDueAgenticCommerceIndex({ now: new Date(NOW.getTime() + 3_600_000), instanceId: "machine-9" })).outcome).toBe(
      "already_published",
    );
  });

  it("a live claim held elsewhere is respected; an abandoned one is taken over", async () => {
    await seedWorkedExample();
    const period = closedWeekAt(NOW);
    const claimRow = (at: Date) =>
      sql.run(
        `INSERT INTO agentic_commerce_index (period_end, period_start, status, claimed_by, claimed_at) VALUES (?, ?, 'claimed', 'crashed-machine', ?)`,
        [period.period_end, period.period_start, at.toISOString()],
      );

    await claimRow(new Date(NOW.getTime() - 60_000)); // claimed a minute ago — still working
    expect((await publishDueAgenticCommerceIndex({ now: NOW, instanceId: "machine-b" })).outcome).toBe("claimed_elsewhere");
    expect((await getIndex()).doc.status).toBe("pending");

    await sql.run("DELETE FROM agentic_commerce_index");
    await claimRow(new Date(NOW.getTime() - INDEX_CLAIM_STALE_MS - 60_000)); // its machine died
    expect((await publishDueAgenticCommerceIndex({ now: NOW, instanceId: "machine-b" })).outcome).toBe("published");
    const owner = await sql.one<{ claimed_by: string; status: string }>("SELECT claimed_by, status FROM agentic_commerce_index");
    expect(owner).toEqual({ claimed_by: "machine-b", status: "published" });
  });

  it("the route serves the stored snapshot — later calls in the same week do not change it", async () => {
    await seedWorkedExample();
    await publishDueAgenticCommerceIndex({ now: NOW, instanceId: "test-a" });
    const first = (await getIndex()).doc;
    await seed("get_snapshot", 500, IN_WEEK); // would reshape the whole week if recomputed
    const second = (await getIndex()).doc;
    expect(second).toEqual(first);
  });

  it("a real tools/call records its X-Agent-Mode and X-Agent-Budget presence in the ledger", async () => {
    const call = (headers: Record<string, string>) =>
      fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_programs", arguments: {} } }),
      }).then((r) => r.text());
    await call({ "X-Agent-Mode": "lite", "X-Agent-Budget": JSON.stringify({ budget_per_run_cents: 25 }) });
    await call({});
    const rows = await sql.many<{ agent_mode: string | null; budget_header: boolean | null }>(
      "SELECT agent_mode, budget_header FROM mcp_usage WHERE tool = 'list_programs' ORDER BY agent_mode",
    );
    expect(rows).toEqual([
      { agent_mode: "lite", budget_header: true },
      { agent_mode: "standard", budget_header: false },
    ]);
  });
});
