// ─── The Iliad agentic-commerce index ───────────────────────────
//
// A weekly, public index of how agents use Iliad's MCP tools, built from
// Iliad's own call ledger (mcp_usage) and published as SHARES ONLY.
//
// What is published: each tool's (and category's, and pricing class's) share
// of the week's calls in whole percent, its rank, and the week-over-week
// change in that share in percentage points; plus the share of calls made in
// each X-Agent-Mode and with an X-Agent-Budget header.
//
// What is never published: call counts, totals, caller counts, revenue,
// account ids, IP addresses, API keys, user agents, client names — nothing
// that states or hints at how many people use Iliad, and nothing that points
// at one caller. Every share shown by name rests on at least
// INDEX_MIN_CALLS_PER_ROW calls; smaller rows fold into "other", and "other"
// itself is held to the same floor (see disclose()). A week with fewer than
// INDEX_MIN_CALLS_PER_PERIOD qualifying calls publishes "not enough calls
// this period to publish" instead of numbers.
//
// How it runs: every instance checks hourly (startAgenticCommerceIndexScheduler)
// whether the most recently CLOSED week (Monday 00:00 UTC to Monday 00:00 UTC)
// is published. If not, it claims the week in the database — one INSERT on a
// PRIMARY KEY, so exactly one instance wins — computes, and stores the JSON.
// GET /v1/agentic-commerce-index serves the stored document; it never
// recomputes per request.

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import {
  aggregateMcpUsageForIndex,
  getAgenticCommerceIndexStatus,
  claimAgenticCommerceIndexPeriod,
  publishAgenticCommerceIndex,
  getLatestAgenticCommerceIndex,
  type McpUsageAggregate,
} from "@axis/snapshots";
import { MCP_TOOLS } from "./mcp-tools.js";
import { deriveMcpToolCatalog } from "./mcp-tool-impls.js";
import type { ProbeClass } from "./intent.js";
import { sendJSON, sendError } from "./router.js";
import { ErrorCode, log } from "./logger.js";

// ─── Thresholds ─────────────────────────────────────────────────

/** k: the fewest calls any share shown by name (or as "other") may rest on. */
export const INDEX_MIN_CALLS_PER_ROW = 20;
/** The fewest qualifying calls a week (or a breakdown's base) needs before any share is published. */
export const INDEX_MIN_CALLS_PER_PERIOD = 100;

/** Automated traffic that is not usage: registry crawlers and quality-scoring agents (classified by intent.ts). */
export const INDEX_EXCLUDED_PROBE_CLASSES: readonly ProbeClass[] = ["registry-crawler", "quality-agent"];

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** Wait this long after a week closes before computing it, so calls still being written land in it. */
export const INDEX_PUBLISH_GRACE_MS = 10 * 60_000;
/** A claim this old that never published is treated as abandoned (its instance died) and may be taken over. */
export const INDEX_CLAIM_STALE_MS = 15 * 60_000;
/** How often each instance checks whether a closed week still needs publishing. */
export const INDEX_CHECK_INTERVAL_MS = 60 * 60_000;
/** First check after boot — late enough that boot migrations have normally applied. */
export const INDEX_FIRST_CHECK_DELAY_MS = 60_000;

export const INDEX_PAGE_URL = "https://iliad.trustfabric.ai/agentic-commerce-index";
export const INDEX_JSON_PATH = "/v1/agentic-commerce-index";

// ─── Catalog classification ─────────────────────────────────────

export type IndexCategory =
  | "codebase_intelligence"
  | "agentic_commerce"
  | "agent_infrastructure"
  | "discovery"
  | "estate";

export const INDEX_CATEGORY_LABELS: Readonly<Record<IndexCategory, string>> = {
  codebase_intelligence: "Codebase intelligence",
  agentic_commerce: "Agentic commerce",
  agent_infrastructure: "Agent infrastructure",
  discovery: "Discovery and referrals",
  estate: "Estate relays",
};

/**
 * Category of every non-estate MCP tool. Estate relays (tools flagged
 * `_meta.estate`) are categorized from the flag, never listed here.
 * agentic-commerce-index.test.ts fails if a tool in MCP_TOOLS is missing from
 * this map or a name here is no longer in MCP_TOOLS, so the two cannot drift.
 */
export const INDEX_TOOL_CATEGORIES: Readonly<Record<string, Exclude<IndexCategory, "estate">>> = {
  analyze_repo: "codebase_intelligence",
  analyze_files: "codebase_intelligence",
  list_programs: "codebase_intelligence",
  get_snapshot: "codebase_intelligence",
  delete_snapshot: "codebase_intelligence",
  get_artifact: "codebase_intelligence",
  improve_my_agent_with_axis: "codebase_intelligence",
  iliad_hygiene: "codebase_intelligence",
  closer: "codebase_intelligence",
  deploy: "codebase_intelligence",

  prepare_agentic_purchasing_preview: "agentic_commerce",
  prepare_agentic_purchasing: "agentic_commerce",
  discover_agentic_purchasing_needs: "agentic_commerce",
  ping_payment: "agentic_commerce",
  sca_exemption_decision: "agentic_commerce",
  grade_compliance: "agentic_commerce",
  assemble_ce3_evidence: "agentic_commerce",
  build_ap2_mandate: "agentic_commerce",
  score_dispute_readiness: "agentic_commerce",
  assemble_representment: "agentic_commerce",
  iliad_network_tokenization: "agentic_commerce",

  iliad_web_research: "agent_infrastructure",
  iliad_web_research_crawl: "agent_infrastructure",
  iliad_object_storage: "agent_infrastructure",
  iliad_vector_database: "agent_infrastructure",
  iliad_embeddings: "agent_infrastructure",
  iliad_transactional_email: "agent_infrastructure",
  iliad_llm_inference: "agent_infrastructure",
  iliad_code_sandbox: "agent_infrastructure",
  iliad_document_parsing: "agent_infrastructure",
  iliad_web_search: "agent_infrastructure",
  iliad_text_to_speech: "agent_infrastructure",
  iliad_speech_to_text: "agent_infrastructure",
  iliad_analytics: "agent_infrastructure",

  search_and_discover_tools: "discovery",
  get_install_manifest: "discovery",
  discover_estate_tools: "discovery",
  get_referral_code: "discovery",
  get_referral_credits: "discovery",
};

/**
 * Two classes, not the catalog's three (free / metered / included in plan):
 * the index's question is "paid per call or not", and a rarely-called third
 * class would sit under the privacy floor most weeks and force its neighbours
 * into "other" with it.
 */
export type IndexPricingClass = "metered" | "not_metered";

export const INDEX_PRICING_LABELS: Readonly<Record<IndexPricingClass, string>> = {
  metered: "Metered tools (pay per call)",
  not_metered: "Free or plan-included tools",
};

export type IndexAgentMode = "standard" | "lite" | "engineer";

export const INDEX_AGENT_MODE_LABELS: Readonly<Record<IndexAgentMode, string>> = {
  standard: "Standard mode",
  lite: "Lite mode (X-Agent-Mode: lite)",
  engineer: "Engineer mode (X-Agent-Mode: engineer)",
};

export const INDEX_BUDGET_LABELS: Readonly<Record<"sent" | "not_sent", string>> = {
  sent: "Sent an X-Agent-Budget header",
  not_sent: "No budget header",
};

export interface IndexCatalogEntry {
  name: string;
  label: string;
  category: IndexCategory;
  pricing: IndexPricingClass;
}

/**
 * The published tool catalog, classified. Pricing comes from
 * deriveMcpToolCatalog() — the one door for "is this tool free, metered or
 * plan-included" — so the index can never disagree with tools/list.
 */
export function buildIndexCatalog(): IndexCatalogEntry[] {
  const derived = new Map(deriveMcpToolCatalog().map((t) => [t.name, t]));
  return MCP_TOOLS.map((t) => {
    const d = derived.get(t.name);
    const title = (t as { annotations?: { title?: string } }).annotations?.title;
    const category: IndexCategory = d?.estate ? "estate" : (INDEX_TOOL_CATEGORIES[t.name] ?? "codebase_intelligence");
    // deriveMcpToolCatalog prices a tool "$x.xx/call" only when it is metered at runtime.
    const pricing: IndexPricingClass = d?.pricing?.startsWith("$") ? "metered" : "not_metered";
    return { name: t.name, label: title ?? t.name, category, pricing };
  });
}

// ─── The published document ─────────────────────────────────────

export interface IndexRow {
  key: string;
  label: string;
  /** 1 = largest share. Equal call counts share a rank. */
  rank: number;
  /** Whole percent of the breakdown's base; every breakdown's rows + other sum to exactly 100. */
  share_pct: number;
  /** share_pct minus the share_pct this row had in the previous week's index (percentage points); null when that index did not show the row. */
  change_pp: number | null;
}

export interface ToolIndexRow extends IndexRow {
  category: IndexCategory;
  pricing: IndexPricingClass;
}

export interface IndexBreakdown<R extends IndexRow = IndexRow> {
  rows: R[];
  /** Share of the base not shown by name (rows below the privacy floor). */
  other_share_pct: number;
}

export type IndexStatus = "published" | "insufficient_data" | "pending";

export interface AgenticCommerceIndexDocument {
  index: "iliad-agentic-commerce-index";
  schema_version: 1;
  publisher: { name: string; url: string };
  page_url: string;
  status: IndexStatus;
  /** Human sentence for non-published states; null when published. */
  message: string | null;
  period_start: string | null;
  period_end: string | null;
  comparison_period_start: string | null;
  comparison_period_end: string | null;
  generated_at: string | null;
  method: string;
  /** Share of all qualifying calls, per tool. */
  tools: IndexBreakdown<ToolIndexRow> | null;
  /** Share of all qualifying calls, per tool category. */
  categories: IndexBreakdown | null;
  /** Share of all qualifying calls by the called tool's catalog pricing class. */
  pricing: IndexBreakdown | null;
  /** Share of calls recorded with an X-Agent-Mode, per mode. */
  agent_modes: IndexBreakdown | null;
  /** Share of calls recorded with budget information that sent an X-Agent-Budget header. */
  budget_headers: IndexBreakdown | null;
}

export const INDEX_NOT_ENOUGH_CALLS_MESSAGE = "Not enough calls this period to publish.";
export const INDEX_PENDING_MESSAGE = "The first index has not been published yet. It is computed after each week closes.";

export const INDEX_METHOD =
  "Built from Axis' Iliad's own record of MCP tools/call requests. Each week runs from Monday 00:00 UTC to the next " +
  "Monday 00:00 UTC and is published after it closes. For each tool, tool category, and metered or unmetered class, " +
  "the index shows its share of the week's calls in whole percent, its rank, and the change from the share it had in " +
  "the previous week's index, in percentage points (no change is given for a row last week's index did not show). " +
  "It also shows the share of calls made in each X-Agent-Mode and the share that " +
  "sent an X-Agent-Budget header, counting only calls recorded with that information. Calls to names that are not in " +
  "Iliad's published tool catalog, and calls from registry crawlers and quality-scoring agents, are left out. A tool " +
  "is metered (pay per call) or not as the catalog lists it, so a call to a metered tool counts as metered even when " +
  "that call was not charged. No call counts, caller counts, revenue, account identifiers, IP addresses, API keys or " +
  "user agents are published. A row appears by name only when enough calls stand behind it that no single caller can " +
  "be singled out. Smaller rows are folded into other, and any remainder a reader could work out by subtraction (other " +
  "itself, or a category minus its named tools) is held to the same floor, so a named row may also be folded in to " +
  "protect a smaller one. A week with too few calls says so instead of publishing numbers. Percentages are rounded " +
  "with the largest-remainder method, so each breakdown sums to exactly 100.";

const PUBLISHER = { name: "Axis' Iliad", url: "https://iliad.trustfabric.ai/" } as const;

function baseDocument(): Pick<AgenticCommerceIndexDocument, "index" | "schema_version" | "publisher" | "page_url" | "method"> {
  return {
    index: "iliad-agentic-commerce-index",
    schema_version: 1,
    publisher: { ...PUBLISHER },
    page_url: INDEX_PAGE_URL,
    method: INDEX_METHOD,
  };
}

/** What the route serves before the first week has ever been published. */
export function pendingAgenticCommerceIndex(): AgenticCommerceIndexDocument {
  return {
    ...baseDocument(),
    status: "pending",
    message: INDEX_PENDING_MESSAGE,
    period_start: null,
    period_end: null,
    comparison_period_start: null,
    comparison_period_end: null,
    generated_at: null,
    tools: null,
    categories: null,
    pricing: null,
    agent_modes: null,
    budget_headers: null,
  };
}

// ─── Periods ────────────────────────────────────────────────────

export interface IndexPeriod {
  period_start: string;
  period_end: string;
  comparison_period_start: string;
  comparison_period_end: string;
}

/** The most recent full Monday-to-Monday UTC week ending at or before `t`. */
export function closedWeekAt(t: Date): IndexPeriod {
  const midnight = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  const daysSinceMonday = (new Date(midnight).getUTCDay() + 6) % 7;
  const end = midnight - daysSinceMonday * DAY_MS;
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    period_start: iso(end - WEEK_MS),
    period_end: iso(end),
    comparison_period_start: iso(end - 2 * WEEK_MS),
    comparison_period_end: iso(end - WEEK_MS),
  };
}

// ─── Disclosure control ─────────────────────────────────────────

interface Partition {
  /** Which group of this partition a row key belongs to. */
  groupOf: (key: string) => string;
  /** Call count per group. */
  groupCounts: ReadonlyMap<string, number>;
  /** Groups this partition publishes by name. */
  shownGroups: ReadonlySet<string>;
}

const OTHER = "\u0000other";

/** Count-descending, then key-ascending: the publication order and the tie-break everywhere. */
function byCountThenKey(counts: ReadonlyMap<string, number>) {
  return (a: string, b: string): number => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * The row keys that may be shown by name.
 *
 * Primary suppression: a row with fewer than k calls is never shown.
 * Secondary suppression: whatever is NOT shown is publicly derivable as a
 * remainder, so every remainder must itself be 0 or at least k calls —
 *   - the breakdown's own "other" (base minus the shown rows), and
 *   - for a breakdown nested inside another published breakdown (tools inside
 *     categories and pricing classes), each group's remainder: the group's
 *     published share minus its shown tools, and likewise for the group-level
 *     "other" minus the shown tools whose group is folded away.
 * While a remainder sits in (0, k), the smallest shown row inside it is folded
 * away too. Folding only ever grows a remainder, so this terminates.
 */
function disclose(counts: ReadonlyMap<string, number>, k: number, partitions: readonly Partition[] = []): string[] {
  const order = byCountThenKey(counts);
  const shown = [...counts.keys()].filter((key) => (counts.get(key) ?? 0) >= k).sort(order);
  const base = [...counts.values()].reduce((a, b) => a + b, 0);
  const sumOf = (keys: readonly string[]) => keys.reduce((a, key) => a + (counts.get(key) ?? 0), 0);
  const dropSmallestOf = (keys: readonly string[]): void => {
    const smallest = [...keys].sort(order).at(-1);
    if (smallest !== undefined) shown.splice(shown.indexOf(smallest), 1);
  };

  for (;;) {
    let folded = false;
    for (const p of partitions) {
      const effectiveGroup = (key: string) => {
        const g = p.groupOf(key);
        return p.shownGroups.has(g) ? g : OTHER;
      };
      const effectiveCounts = new Map<string, number>();
      for (const [g, c] of p.groupCounts) {
        const eg = p.shownGroups.has(g) ? g : OTHER;
        effectiveCounts.set(eg, (effectiveCounts.get(eg) ?? 0) + c);
      }
      for (const [eg, groupCount] of effectiveCounts) {
        const members = shown.filter((key) => effectiveGroup(key) === eg);
        const remainder = groupCount - sumOf(members);
        if (remainder > 0 && remainder < k && members.length > 0) {
          dropSmallestOf(members);
          folded = true;
        }
      }
    }
    const other = base - sumOf(shown);
    if (other > 0 && other < k && shown.length > 0) {
      dropSmallestOf(shown);
      folded = true;
    }
    if (!folded) return shown;
  }
}

/** Whole-percent shares of `base` that sum to exactly 100 (Hamilton / largest-remainder). */
function largestRemainderPercents(parts: ReadonlyArray<{ id: string; count: number }>, base: number): Map<string, number> {
  const exact = parts.map((p, i) => ({ ...p, i, value: (100 * p.count) / base }));
  const out = new Map<string, number>();
  let assigned = 0;
  for (const e of exact) {
    const f = Math.floor(e.value);
    out.set(e.id, f);
    assigned += f;
  }
  const byRemainder = [...exact].sort(
    (a, b) => (b.value - Math.floor(b.value)) - (a.value - Math.floor(a.value)) || b.count - a.count || a.i - b.i,
  );
  for (let n = 0; n < 100 - assigned; n++) {
    const e = byRemainder[n % byRemainder.length];
    out.set(e.id, (out.get(e.id) ?? 0) + 1);
  }
  return out;
}

/** Competition ranking ("1, 2, 2, 4") by call count over the shown rows. */
function ranksFor(shown: readonly string[], counts: ReadonlyMap<string, number>): Map<string, number> {
  const ranks = new Map<string, number>();
  shown.forEach((key, i) => {
    const prev = shown[i - 1];
    ranks.set(key, prev !== undefined && counts.get(prev) === counts.get(key) ? (ranks.get(prev) as number) : i + 1);
  });
  return ranks;
}

interface BreakdownInput {
  counts: ReadonlyMap<string, number>;
  label: (key: string) => string;
  partitions?: readonly Partition[];
}

interface BuiltBreakdown {
  breakdown: IndexBreakdown;
  shown: ReadonlySet<string>;
}

/**
 * One week's breakdown: shown rows (ranked, with shares) plus other, with
 * change_pp still null (withChanges fills it). null when the base is below
 * the period floor — no share of a base that small is published.
 */
function buildBreakdown(input: BreakdownInput, k: number, minBase: number): BuiltBreakdown | null {
  const base = [...input.counts.values()].reduce((a, b) => a + b, 0);
  if (base < minBase) return null;

  const shown = disclose(input.counts, k, input.partitions);
  const otherCount = base - shown.reduce((a, key) => a + (input.counts.get(key) ?? 0), 0);
  const pct = largestRemainderPercents(
    [...shown.map((key) => ({ id: key, count: input.counts.get(key) ?? 0 })), { id: OTHER, count: otherCount }],
    base,
  );
  const ranks = ranksFor(shown, input.counts);
  const rows: IndexRow[] = shown.map((key) => ({
    key,
    label: input.label(key),
    rank: ranks.get(key) as number,
    share_pct: pct.get(key) as number,
    change_pp: null,
  }));
  return { breakdown: { rows, other_share_pct: pct.get(OTHER) as number }, shown: new Set(shown) };
}

function addTo(map: Map<string, number>, key: string, n: number): void {
  map.set(key, (map.get(key) ?? 0) + n);
}

interface WeekTally {
  tools: Map<string, number>;
  categories: Map<string, number>;
  pricing: Map<string, number>;
  modes: Map<string, number>;
  budget: Map<string, number>;
  total: number;
}

function tallyWeek(rows: readonly McpUsageAggregate[], byName: ReadonlyMap<string, IndexCatalogEntry>): WeekTally {
  const t: WeekTally = { tools: new Map(), categories: new Map(), pricing: new Map(), modes: new Map(), budget: new Map(), total: 0 };
  for (const r of rows) {
    const entry = byName.get(r.tool);
    if (!entry || r.calls <= 0) continue; // not in the published catalog → not in the index
    addTo(t.tools, entry.name, r.calls);
    addTo(t.categories, entry.category, r.calls);
    addTo(t.pricing, entry.pricing, r.calls);
    if (r.agent_mode === "standard" || r.agent_mode === "lite" || r.agent_mode === "engineer") {
      addTo(t.modes, r.agent_mode, r.calls);
    }
    if (r.budget_header !== null) addTo(t.budget, r.budget_header ? "sent" : "not_sent", r.calls);
    t.total += r.calls;
  }
  return t;
}

interface WeekBreakdowns {
  tools: IndexBreakdown | null;
  categories: IndexBreakdown | null;
  pricing: IndexBreakdown | null;
  agent_modes: IndexBreakdown | null;
  budget_headers: IndexBreakdown | null;
}

const NO_BREAKDOWNS: WeekBreakdowns = { tools: null, categories: null, pricing: null, agent_modes: null, budget_headers: null };

/** Everything one week publishes, by the same rules every week. */
function weekBreakdowns(t: WeekTally, byName: ReadonlyMap<string, IndexCatalogEntry>, k: number, minBase: number): WeekBreakdowns {
  const categories = buildBreakdown(
    { counts: t.categories, label: (key) => INDEX_CATEGORY_LABELS[key as IndexCategory] ?? key },
    k,
    minBase,
  );
  const pricing = buildBreakdown(
    { counts: t.pricing, label: (key) => INDEX_PRICING_LABELS[key as IndexPricingClass] ?? key },
    k,
    minBase,
  );
  // Tools sit inside categories and pricing classes, both published alongside
  // them — so each group's remainder is held to the same floor (disclose()).
  const partitions: Partition[] = [];
  if (categories) {
    partitions.push({ groupOf: (key) => byName.get(key)?.category ?? "", groupCounts: t.categories, shownGroups: categories.shown });
  }
  if (pricing) {
    partitions.push({ groupOf: (key) => byName.get(key)?.pricing ?? "", groupCounts: t.pricing, shownGroups: pricing.shown });
  }
  const tools = buildBreakdown({ counts: t.tools, label: (key) => byName.get(key)?.label ?? key, partitions }, k, minBase);
  const agentModes = buildBreakdown(
    { counts: t.modes, label: (key) => INDEX_AGENT_MODE_LABELS[key as IndexAgentMode] ?? key },
    k,
    minBase,
  );
  const budget = buildBreakdown(
    { counts: t.budget, label: (key) => INDEX_BUDGET_LABELS[key as "sent" | "not_sent"] ?? key },
    k,
    minBase,
  );
  return {
    tools: tools?.breakdown ?? null,
    categories: categories?.breakdown ?? null,
    pricing: pricing?.breakdown ?? null,
    agent_modes: agentModes?.breakdown ?? null,
    budget_headers: budget?.breakdown ?? null,
  };
}

/**
 * change_pp = this week's share_pct minus the share_pct the same row had in
 * the previous week's index, computed by the same rules. A row the previous
 * week did not show by name (or a previous week that published nothing) gets
 * null — so a change can never be used to back out a prior-week figure that
 * was itself under the privacy floor.
 */
function withChanges(current: IndexBreakdown | null, previous: IndexBreakdown | null): IndexBreakdown | null {
  if (!current) return null;
  const before = new Map((previous?.rows ?? []).map((r) => [r.key, r.share_pct]));
  return {
    rows: current.rows.map((r) => {
      const prior = before.get(r.key);
      return { ...r, change_pp: prior === undefined ? null : r.share_pct - prior };
    }),
    other_share_pct: current.other_share_pct,
  };
}

export interface ComputeIndexInput extends IndexPeriod {
  generated_at: string;
  current: readonly McpUsageAggregate[];
  previous: readonly McpUsageAggregate[];
  catalog: readonly IndexCatalogEntry[];
  /** Overridable for tests only; production always uses the exported constants. */
  minCallsPerRow?: number;
  minCallsPerPeriod?: number;
}

/**
 * Turn two weeks of aggregate call counts into the published document. Pure:
 * no I/O, no clock — every input is explicit, so the same counts always give
 * the same document.
 */
export function computeAgenticCommerceIndex(input: ComputeIndexInput): AgenticCommerceIndexDocument {
  const k = input.minCallsPerRow ?? INDEX_MIN_CALLS_PER_ROW;
  const minBase = input.minCallsPerPeriod ?? INDEX_MIN_CALLS_PER_PERIOD;
  const byName = new Map(input.catalog.map((t) => [t.name, t]));

  const cur = tallyWeek(input.current, byName);
  const head = {
    ...baseDocument(),
    period_start: input.period_start,
    period_end: input.period_end,
    comparison_period_start: input.comparison_period_start,
    comparison_period_end: input.comparison_period_end,
    generated_at: input.generated_at,
  };

  if (cur.total < minBase) {
    return {
      ...head,
      status: "insufficient_data",
      message: INDEX_NOT_ENOUGH_CALLS_MESSAGE,
      tools: null,
      categories: null,
      pricing: null,
      agent_modes: null,
      budget_headers: null,
    };
  }

  const now = weekBreakdowns(cur, byName, k, minBase);
  const prev = tallyWeek(input.previous, byName);
  const before = prev.total >= minBase ? weekBreakdowns(prev, byName, k, minBase) : NO_BREAKDOWNS;

  const tools = withChanges(now.tools, before.tools);
  return {
    ...head,
    status: "published",
    message: null,
    tools: tools
      ? {
          rows: tools.rows.map((r) => {
            const entry = byName.get(r.key) as IndexCatalogEntry;
            return { ...r, category: entry.category, pricing: entry.pricing };
          }),
          other_share_pct: tools.other_share_pct,
        }
      : null,
    categories: withChanges(now.categories, before.categories),
    pricing: withChanges(now.pricing, before.pricing),
    agent_modes: withChanges(now.agent_modes, before.agent_modes),
    budget_headers: withChanges(now.budget_headers, before.budget_headers),
  };
}

// ─── The weekly run ─────────────────────────────────────────────

/** This process's claim identity — internal to the claim row, never published. */
const INSTANCE_ID = process.env.FLY_MACHINE_ID || `iliad-${randomUUID()}`;

export type PublishOutcome =
  /** This call claimed the week, computed it and stored it. */
  | { outcome: "published"; period_end: string; status: Exclude<IndexStatus, "pending"> }
  /** The week was already published — nothing to do. */
  | { outcome: "already_published"; period_end: string }
  /** Another instance holds a live claim on the week. */
  | { outcome: "claimed_elsewhere"; period_end: string }
  /** This call computed the week but its claim was taken over as stale before it could store it. */
  | { outcome: "lost_claim"; period_end: string };

/**
 * Publish the most recently closed week if no instance has yet. Safe to call
 * from every instance on every tick: the database claim lets exactly one
 * caller compute a given week.
 */
export async function publishDueAgenticCommerceIndex(
  opts: { now?: Date; instanceId?: string } = {},
): Promise<PublishOutcome> {
  const now = opts.now ?? new Date();
  const instanceId = opts.instanceId ?? INSTANCE_ID;
  const period = closedWeekAt(new Date(now.getTime() - INDEX_PUBLISH_GRACE_MS));

  if ((await getAgenticCommerceIndexStatus(period.period_end)) === "published") {
    return { outcome: "already_published", period_end: period.period_end };
  }
  const claimed = await claimAgenticCommerceIndexPeriod({
    period_start: period.period_start,
    period_end: period.period_end,
    claimed_by: instanceId,
    now: now.toISOString(),
    stale_before: new Date(now.getTime() - INDEX_CLAIM_STALE_MS).toISOString(),
  });
  if (!claimed) {
    return (await getAgenticCommerceIndexStatus(period.period_end)) === "published"
      ? { outcome: "already_published", period_end: period.period_end }
      : { outcome: "claimed_elsewhere", period_end: period.period_end };
  }

  const catalog = buildIndexCatalog();
  const filter = { tools: catalog.map((t) => t.name), excludeProbeClasses: INDEX_EXCLUDED_PROBE_CLASSES };
  const [current, previous] = await Promise.all([
    aggregateMcpUsageForIndex(period.period_start, period.period_end, filter),
    aggregateMcpUsageForIndex(period.comparison_period_start, period.comparison_period_end, filter),
  ]);
  const document = computeAgenticCommerceIndex({
    ...period,
    generated_at: new Date().toISOString(),
    current,
    previous,
    catalog,
  });
  const stored = await publishAgenticCommerceIndex({
    period_end: period.period_end,
    claimed_by: instanceId,
    payload: JSON.stringify(document),
    published_at: new Date().toISOString(),
  });
  if (!stored) return { outcome: "lost_claim", period_end: period.period_end };
  return { outcome: "published", period_end: period.period_end, status: document.status as Exclude<IndexStatus, "pending"> };
}

let schedulerTimers: { first: ReturnType<typeof setTimeout>; every: ReturnType<typeof setInterval> } | null = null;
let tickInFlight = false;

async function schedulerTick(): Promise<void> {
  if (tickInFlight) return; // a slow tick never overlaps the next one in this process
  tickInFlight = true;
  try {
    const result = await publishDueAgenticCommerceIndex();
    // Outcome and period only — never counts.
    if (result.outcome === "published") {
      log("info", "agentic_commerce_index.published", { period_end: result.period_end, status: result.status });
    }
  } catch (err) {
    log("error", "agentic_commerce_index.tick_failed", { error: err instanceof Error ? err.message : String(err) });
  } finally {
    tickInFlight = false;
  }
}

/**
 * Start this instance's hourly check. Call once at server startup. Every
 * instance runs it; the claim in publishDueAgenticCommerceIndex keeps the
 * weekly computation to one instance. Timers are unref'd so they never hold
 * the process open.
 */
export function startAgenticCommerceIndexScheduler(): void {
  if (schedulerTimers) return;
  const first = setTimeout(() => void schedulerTick(), INDEX_FIRST_CHECK_DELAY_MS);
  const every = setInterval(() => void schedulerTick(), INDEX_CHECK_INTERVAL_MS);
  first.unref?.();
  every.unref?.();
  schedulerTimers = { first, every };
}

/** Test/shutdown helper: stop this instance's timers. */
export function stopAgenticCommerceIndexScheduler(): void {
  if (!schedulerTimers) return;
  clearTimeout(schedulerTimers.first);
  clearInterval(schedulerTimers.every);
  schedulerTimers = null;
}

// ─── GET /v1/agentic-commerce-index ─────────────────────────────

/** Serves the latest stored week as published. Never recomputes. */
export async function handleGetAgenticCommerceIndex(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  let stored: Awaited<ReturnType<typeof getLatestAgenticCommerceIndex>>;
  try {
    stored = await getLatestAgenticCommerceIndex();
  } catch (err) {
    log("error", "agentic_commerce_index.read_failed", { error: err instanceof Error ? err.message : String(err) });
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "The agentic-commerce index could not be read right now.");
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=900");
  sendJSON(res, 200, stored ? (JSON.parse(stored.payload) as AgenticCommerceIndexDocument) : pendingAgenticCommerceIndex());
}
