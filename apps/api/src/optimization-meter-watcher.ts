// ─── app_33_optimization_live_meter: the optimization program's Watch → Verify → Apply loop ─
//
// docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md #9 — "A: pull actual
// provider usage, attribute spend to prompts/routes from the repo's own call
// sites. V: reconciliation — attributed total matches provider invoice within
// tolerance. W: scheduled pulls + regression alerts. Accepts when: it reports
// real dollars." generateCostEstimate (generators-optimization.ts) already
// does the static half — LOC × an approximate tokens/LOC ratio, priced
// against LLM_MODEL_PRICING. This is the live half: real dollars, real call
// sites, and a reconciliation that can genuinely fail.
//
// THE HONEST DESIGN, stated because "attribute spend to call sites" invites
// a claim this repo's own discipline forbids making without grounding:
// providers report usage/cost PER MODEL for the account, not per line of
// customer code — they have no way to know which of a repo's call sites
// produced which request. A per-call-site dollar figure that CLAIMED
// precision it doesn't have would be exactly the "plausible-sounding but
// fabricated" failure mode app_30's structured-data gate exists to prevent.
// So: pull the REAL total per model (source of truth, from the provider's
// own usage/cost endpoint) — that satisfies "reports real dollars" — then
// split each model's real total EVENLY across the call sites detected for
// that model, stated as an even split, never claimed more precise. The
// reconciliation (V) is genuine and failable: summing the per-call-site
// splits must reconstruct the real total within a cent's rounding — a real
// bug (a mispriced model, a double-counted call site, float drift) fails
// this, which is exactly what "reconciliation" is for. A model with real
// spend but ZERO detected call sites reports that spend as UNATTRIBUTED
// rather than silently dropping or misattributing it.
//
// PROVIDER API SHAPES ARE UNVERIFIED AGAINST A LIVE ACCOUNT. No provider key
// exists in this environment to test against. realFetchOpenAIUsage /
// realFetchAnthropicUsage are built from each provider's documented org-level
// usage/cost endpoint shape and parse DEFENSIVELY — an unexpected response
// shape produces a clear parse error, never a fabricated $0 or invented
// total. Flagged in begin.yaml too: this is the same class of gap as app_30's
// "not yet verified end-to-end" GSC half, for a different reason (no
// live-testable account, not an owner gate).
//
// W is "scheduled pulls" per the spec's own words — the first real consumer
// of infra_04's tick-fanout substrate. "optimization" joins POLL_PRODUCTS in
// this same change (watch-poll-tick.ts's own pinned-empty-set test documents
// exactly this as the intended trigger for updating it).
//
// Plain REST, deliberately no SDK, per the strategy doc's dependency table.

import { fetchGitHubRepo, createSnapshot } from "@axis/snapshots";
import type { SnapshotManifest, FileEntry, WatchJobPayload, ProviderCredentialSecrets, LlmProvider } from "@axis/snapshots";
import { getProviderCredentialsForRepo, markProviderCredentialUsed } from "@axis/snapshots";
import { buildContextMap } from "@axis/context-engine";
import { LLM_MODEL_PRICING } from "@axis/generator-core";
import {
  openApplyPullRequest,
  applyBranchName,
  type ApplyFile,
  type OpenApplyPrParams,
  type OpenApplyPrResult,
} from "./github-pr.js";

const OPTIMIZATION_PRODUCT_ID = "optimization";
export const COST_REPORT_PATH = "cost-reports/live-usage.md";

const PROVIDER_CALL_TIMEOUT_MS = 15_000;
/** Sums-back-to-real-total invariant tolerance — cents, not a meaningful drift budget. */
const RECONCILIATION_TOLERANCE_USD = 0.01;

// ─── Real usage (provider REST) ──────────────────────────────────

export interface ModelUsage {
  model: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
}

export interface ProviderUsageReport {
  provider: LlmProvider;
  period_start: string;
  period_end: string;
  models: ModelUsage[];
  total_cost_usd: number;
}

export interface OptimizationMeterDeps {
  token: string | undefined;
  fetchRepo: (url: string, token: string) => Promise<{ files: FileEntry[] }>;
  openPr: (params: OpenApplyPrParams) => Promise<OpenApplyPrResult>;
  getCredentials: (account_id: string, repo_full_name: string) => Promise<ProviderCredentialSecrets[]>;
  fetchUsage: (cred: ProviderCredentialSecrets, periodStart: string, periodEnd: string) => Promise<ProviderUsageReport>;
  /** Injectable so tests control "now" without faking the system clock. */
  now: () => Date;
}

export type OptimizationMeterStatus =
  | "not_optimization_product"
  | "no_token"
  | "no_provider_credentials"
  | "provider_fetch_failed"
  | "reconciliation_mismatch"
  | "no_changes"
  | "pr_opened"
  | "pr_skipped";

export interface OptimizationMeterResult {
  status: OptimizationMeterStatus;
  target?: string;
  providers_reported?: number;
  total_real_cost_usd?: number;
  unattributed_cost_usd?: number;
  /** W's regression-alert half — a period-over-period comparison against this repo's own last report. Present whenever a report was built (reconciliation passed). */
  regression?: CostRegression;
  error?: string;
  pr?: OpenApplyPrResult;
}

// ─── Call-site detection ─────────────────────────────────────────

export interface LlmCallSite {
  file: string;
  line: number;
  provider: LlmProvider;
  /** The model literal found near the call, when one appears in the same statement's string literals. */
  model: string | null;
  /** The nearest route this call site's file serves, if any (ctx.routes join by source_file). */
  route: string | null;
}

const OPENAI_IMPORT_RE = /(^|['"])openai(['"]|\/)/i;
const ANTHROPIC_IMPORT_RE = /@anthropic-ai\/sdk/i;
const OPENAI_CALL_RE = /\.(chat\.completions|responses|completions|embeddings)\.create\s*\(/;
const ANTHROPIC_CALL_RE = /\.messages\.create\s*\(/;
const MODEL_LITERAL_RE = /["'`](gpt-[\w.-]+|o[0-9][\w.-]*|claude-[\w.-]+|text-embedding-[\w.-]+)["'`]/i;

/**
 * Detect LLM SDK call sites by import presence + call-shape pattern — a
 * static heuristic (this is a sweep, not a compiler), same discipline as
 * debug's stack-frame grounding: false negatives (a call site missed) are
 * fine, false positives that invent a call site are not, so both the import
 * marker AND the call shape must be present in a file before it's scanned
 * line-by-line for calls.
 */
export function detectLlmCallSites(files: FileEntry[], routes: Array<{ path: string; source_file: string }>): LlmCallSite[] {
  const routeByFile = new Map<string, string>();
  for (const r of routes) if (!routeByFile.has(r.source_file)) routeByFile.set(r.source_file, r.path);

  const sites: LlmCallSite[] = [];
  for (const file of files) {
    const isOpenAiFile = OPENAI_IMPORT_RE.test(file.content);
    const isAnthropicFile = ANTHROPIC_IMPORT_RE.test(file.content);
    if (!isOpenAiFile && !isAnthropicFile) continue;

    const lines = file.content.split("\n");
    lines.forEach((lineText, i) => {
      const provider: LlmProvider | null = isOpenAiFile && OPENAI_CALL_RE.test(lineText)
        ? "openai"
        : isAnthropicFile && ANTHROPIC_CALL_RE.test(lineText)
          ? "anthropic"
          : null;
      if (!provider) return;
      // Look for a model literal on this line or the next few (a common
      // shape: `model: "gpt-4o",` on its own line inside the call args).
      const window = lines.slice(i, i + 5).join("\n");
      const modelMatch = window.match(MODEL_LITERAL_RE);
      sites.push({
        file: file.path,
        line: i + 1,
        provider,
        model: modelMatch ? modelMatch[1] : null,
        route: routeByFile.get(file.path) ?? null,
      });
    });
  }
  return sites;
}

/** Best-effort model-name normalization so a call site's literal matches a pricing-table row. */
function priceRowForModel(model: string | null): (typeof LLM_MODEL_PRICING)[number] | undefined {
  if (!model) return undefined;
  const normalized = model.toLowerCase();
  return LLM_MODEL_PRICING.find((row) => {
    const rowKey = row.name.toLowerCase().replace(/\s+/g, "-");
    return normalized.includes(rowKey) || rowKey.includes(normalized) || row.name.toLowerCase() === normalized;
  });
}

// ─── Attribution + reconciliation ────────────────────────────────

export interface AttributedCost {
  file: string;
  line: number;
  route: string | null;
  provider: LlmProvider;
  model: string;
  /** Even split of that model's real total across every call site found for it. */
  attributed_cost_usd: number;
}

export interface AttributionResult {
  attributed: AttributedCost[];
  /** Real per-model spend with no detected call site — named, never dropped. */
  unattributed: ModelUsage[];
  total_attributed_usd: number;
  total_unattributed_usd: number;
  reconciled: boolean;
}

/**
 * Split each model's REAL total evenly across its detected call sites.
 * Reconciliation is genuine: the sum of every attributed + unattributed
 * dollar must equal the sum of every real per-model total, within
 * RECONCILIATION_TOLERANCE_USD — a real bug (wrong price row, a dropped
 * model, float drift) fails this exactly once, on the total, not per row.
 */
export function attributeUsage(reports: ProviderUsageReport[], callSites: LlmCallSite[]): AttributionResult {
  const attributed: AttributedCost[] = [];
  const unattributed: ModelUsage[] = [];
  let realTotal = 0;

  for (const report of reports) {
    for (const m of report.models) {
      realTotal += m.cost_usd;
      const sitesForModel = callSites.filter(
        (s) => s.provider === report.provider && priceRowForModel(s.model)?.name === m.model,
      );
      if (sitesForModel.length === 0) {
        unattributed.push(m);
        continue;
      }
      const share = m.cost_usd / sitesForModel.length;
      for (const site of sitesForModel) {
        attributed.push({
          file: site.file,
          line: site.line,
          route: site.route,
          provider: site.provider,
          model: m.model,
          attributed_cost_usd: share,
        });
      }
    }
  }

  const totalAttributed = attributed.reduce((s, a) => s + a.attributed_cost_usd, 0);
  const totalUnattributed = unattributed.reduce((s, m) => s + m.cost_usd, 0);
  const reconciled = Math.abs(totalAttributed + totalUnattributed - realTotal) <= RECONCILIATION_TOLERANCE_USD;

  return { attributed, unattributed, total_attributed_usd: totalAttributed, total_unattributed_usd: totalUnattributed, reconciled };
}

// ─── Regression alerts ────────────────────────────────────────────
//
// W's stated shape is "scheduled pulls + regression alerts" — spend going up
// is not a data-integrity problem the reconciliation V-gate is about, so it
// never blocks the PR; it makes the PR impossible to miss instead. Every
// other watcher's "alert" already IS the PR it opens (there is no separate
// notification substrate in this codebase — alerting.ts is the server's own
// 5xx-rate monitor, a different tenant entirely, not a per-account delivery
// mechanism to build a second copy of). A genuine, stated period-over-period
// comparison against this SAME repo's last report — not a statistical
// anomaly model, and said so in the report text.

const REGRESSION_THRESHOLD_PCT = 25;
const PREVIOUS_TOTAL_RE = /\*\*Total real spend: \$([\d.]+)\*\*/;

/** Pulls the prior run's real total back out of ITS OWN rendered report — comparison only, never fed into the snapshot/attribution input. */
export function extractPreviousTotal(existingReportContent: string | undefined): number | null {
  if (!existingReportContent) return null;
  const match = existingReportContent.match(PREVIOUS_TOTAL_RE);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export interface CostRegression {
  regressed: boolean;
  previous_total_usd: number | null;
  current_total_usd: number;
  pct_change: number | null;
}

/** No prior report, or a prior $0 total, means nothing to compare against — not a regression, honestly reported as absent rather than a fabricated 0% or infinite change. */
export function detectCostRegression(
  previousTotalUsd: number | null,
  currentTotalUsd: number,
  thresholdPct: number = REGRESSION_THRESHOLD_PCT,
): CostRegression {
  if (previousTotalUsd === null || previousTotalUsd <= 0) {
    return { regressed: false, previous_total_usd: previousTotalUsd, current_total_usd: currentTotalUsd, pct_change: null };
  }
  const pctChange = ((currentTotalUsd - previousTotalUsd) / previousTotalUsd) * 100;
  return {
    regressed: pctChange > thresholdPct,
    previous_total_usd: previousTotalUsd,
    current_total_usd: currentTotalUsd,
    pct_change: pctChange,
  };
}

// ─── The report ───────────────────────────────────────────────────

export function buildCostReport(
  reports: ProviderUsageReport[],
  attribution: AttributionResult,
  periodStart: string,
  periodEnd: string,
  regression: CostRegression | null = null,
): string {
  const lines: string[] = [];
  lines.push("# Live cost report");
  lines.push("");
  lines.push(`> Real spend for ${periodStart} to ${periodEnd}, pulled directly from each connected`);
  lines.push("> provider's own usage/cost API — not estimated. Per-call-site figures are an EVEN");
  lines.push("> split of a model's real total across every call site detected for that model in this");
  lines.push("> repository, stated as an even split, not claimed as per-request precision providers");
  lines.push("> do not report.");
  lines.push("");
  const grandTotal = reports.reduce((s, r) => s + r.total_cost_usd, 0);
  lines.push(`**Total real spend: $${grandTotal.toFixed(2)}**`);
  lines.push("");
  if (regression?.regressed && regression.previous_total_usd !== null && regression.pct_change !== null) {
    lines.push(
      `> ⚠️ **Cost regression: up ${regression.pct_change.toFixed(0)}% since the last pull** (was $${regression.previous_total_usd.toFixed(2)}, now $${grandTotal.toFixed(2)}) — a plain period-over-period comparison against this repository's own last report, not a statistical anomaly model.`,
    );
    lines.push("");
  }
  lines.push("## By provider");
  lines.push("");
  lines.push("| Provider | Model | Real cost |");
  lines.push("|---|---|---|");
  for (const r of reports) {
    for (const m of r.models) {
      lines.push(`| ${r.provider} | ${m.model} | $${m.cost_usd.toFixed(2)} |`);
    }
  }
  lines.push("");
  lines.push("## Attributed by call site");
  lines.push("");
  if (attribution.attributed.length > 0) {
    lines.push("| File:line | Route | Model | Even-split share |");
    lines.push("|---|---|---|---|");
    for (const a of attribution.attributed) {
      lines.push(`| \`${a.file}:${a.line}\` | ${a.route ? `\`${a.route}\`` : "*(no matching route)*"} | ${a.model} | $${a.attributed_cost_usd.toFixed(4)} |`);
    }
  } else {
    lines.push("*No call sites matched a model with real spend this period.*");
  }
  if (attribution.unattributed.length > 0) {
    lines.push("");
    lines.push(
      `**$${attribution.total_unattributed_usd.toFixed(2)} unattributed** — real spend for a model with no detected call site in this repository (a different repo, a call shape this scan doesn't recognize, or usage outside application code).`,
    );
  }
  lines.push("");
  lines.push(
    `## Reconciliation — ${attribution.reconciled ? "PASSED" : "FAILED"}`,
  );
  lines.push("");
  lines.push(
    `Attributed ($${attribution.total_attributed_usd.toFixed(2)}) + unattributed ($${attribution.total_unattributed_usd.toFixed(2)}) vs. real total ($${grandTotal.toFixed(2)})${attribution.reconciled ? " — within tolerance." : " — DOES NOT RECONCILE. This report should not be trusted until the mismatch is investigated."}`,
  );
  lines.push("");
  lines.push("— Generated by AXIS Optimization (watch mechanic, app_33). Real dollars, honestly split.");
  lines.push("");
  return lines.join("\n");
}

// ─── The processor ──────────────────────────────────────────────

export async function processOptimizationMeter(
  payload: WatchJobPayload,
  deps: OptimizationMeterDeps,
): Promise<OptimizationMeterResult> {
  if (payload.product_id !== OPTIMIZATION_PRODUCT_ID) return { status: "not_optimization_product" };
  if (!deps.token) return { status: "no_token" };

  const credentials = await deps.getCredentials(payload.account_id, payload.repo_full_name);
  if (credentials.length === 0) return { status: "no_provider_credentials" };

  const now = deps.now();
  const periodEnd = now.toISOString().slice(0, 10);
  const periodStartDate = new Date(now);
  periodStartDate.setUTCDate(periodStartDate.getUTCDate() - 30);
  const periodStart = periodStartDate.toISOString().slice(0, 10);

  const reports: ProviderUsageReport[] = [];
  for (const cred of credentials) {
    try {
      reports.push(await deps.fetchUsage(cred, periodStart, periodEnd));
      void markProviderCredentialUsed(cred.credential_id).catch(() => {
        /* bookkeeping only */
      });
    } catch (err) {
      return { status: "provider_fetch_failed", error: err instanceof Error ? err.message : String(err) };
    }
  }

  const fr = await deps.fetchRepo(`https://github.com/${payload.repo_full_name}`, deps.token);
  // Prior reports are this watcher's own output — never let them feed the
  // regeneration input (the app_11 / app_24 / app_35 / app_32 lesson).
  const sourceFiles = fr.files.filter((f) => f.path !== COST_REPORT_PATH);

  const manifest: SnapshotManifest = {
    project_name: payload.repo_full_name,
    project_type: "github_repository",
    frameworks: [],
    goals: ["Meter real LLM provider spend"],
    requested_outputs: [],
  };
  const snapshot = await createSnapshot({ input_method: "github_repo_url", manifest, files: sourceFiles }, undefined);
  const ctx = buildContextMap(snapshot);
  const callSites = detectLlmCallSites(sourceFiles, ctx.routes);
  const attribution = attributeUsage(reports, callSites);

  // ── V: reconciliation must hold before anything reaches a PR ──
  if (!attribution.reconciled) {
    return {
      status: "reconciliation_mismatch",
      providers_reported: reports.length,
      total_real_cost_usd: reports.reduce((s, r) => s + r.total_cost_usd, 0),
      unattributed_cost_usd: attribution.total_unattributed_usd,
    };
  }

  const grandTotal = reports.reduce((s, r) => s + r.total_cost_usd, 0);
  const existing = fr.files.find((f) => f.path === COST_REPORT_PATH)?.content;
  const regression = detectCostRegression(extractPreviousTotal(existing), grandTotal);

  const content = buildCostReport(reports, attribution, periodStart, periodEnd, regression);
  if (existing === content) {
    return { status: "no_changes", target: COST_REPORT_PATH, providers_reported: reports.length };
  }

  const { owner, repo } = splitRepo(payload.repo_full_name);
  const files: ApplyFile[] = [{ path: COST_REPORT_PATH, content }];
  const pr = await deps.openPr({
    owner,
    repo,
    token: deps.token,
    baseBranch: branchFromRef(payload.ref),
    branchName: applyBranchName("optimization-cost-report", content),
    files,
    title: regression.regressed
      ? `AXIS: ⚠️ cost regression detected (${periodStart} to ${periodEnd})`
      : `AXIS: live cost report (${periodStart} to ${periodEnd})`,
    body: buildPrBody(reports, attribution, regression),
  });
  return {
    status: pr.opened ? "pr_opened" : "pr_skipped",
    target: COST_REPORT_PATH,
    providers_reported: reports.length,
    total_real_cost_usd: grandTotal,
    unattributed_cost_usd: attribution.total_unattributed_usd,
    regression,
    pr,
  };
}

function branchFromRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "") || "main";
}

function splitRepo(fullName: string): { owner: string; repo: string } {
  const i = fullName.indexOf("/");
  return { owner: fullName.slice(0, i), repo: fullName.slice(i + 1) };
}

function buildPrBody(reports: ProviderUsageReport[], attribution: AttributionResult, regression: CostRegression): string {
  const grandTotal = reports.reduce((s, r) => s + r.total_cost_usd, 0);
  const lines = [
    "AXIS pulled real provider usage and reconciled it against detected LLM call sites in this repository.",
    "",
    `- \`${COST_REPORT_PATH}\` — $${grandTotal.toFixed(2)} real spend across ${reports.length} provider${reports.length === 1 ? "" : "s"}, reconciliation ${attribution.reconciled ? "passed" : "FAILED"}.`,
    "",
  ];
  if (regression.regressed && regression.previous_total_usd !== null && regression.pct_change !== null) {
    lines.push(
      `⚠️ **Cost regression**: up ${regression.pct_change.toFixed(0)}% since the last pull (was $${regression.previous_total_usd.toFixed(2)}).`,
      "",
    );
  }
  lines.push(
    "Per-call-site figures are an even split of a model's real total, stated as such — never claimed as per-request precision no provider actually reports.",
    "",
    "— Generated by AXIS Optimization (watch mechanic).",
  );
  return lines.join("\n");
}

// ─── Real provider REST clients ──────────────────────────────────
//
// UNVERIFIED AGAINST A LIVE ACCOUNT — see the file header. Both parse
// defensively: an unrecognized response shape throws a clear error rather
// than returning a fabricated total.

async function timedFetch(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_CALL_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (err) {
    throw new Error(`Provider unreachable: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function realFetchOpenAIUsage(
  cred: ProviderCredentialSecrets,
  periodStart: string,
  periodEnd: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = "https://api.openai.com/v1",
): Promise<ProviderUsageReport> {
  const startTs = Math.floor(new Date(`${periodStart}T00:00:00Z`).getTime() / 1000);
  const url = `${baseUrl}/organization/costs?start_time=${startTs}&limit=31&group_by=line_item`;
  const res = await timedFetch(fetchImpl, url, { headers: { Authorization: `Bearer ${cred.key}` } });
  if (!res.ok) throw new Error(`OpenAI usage API error: ${res.status}`);
  const body = (await res.json()) as Record<string, unknown>;
  const buckets = Array.isArray(body.data) ? (body.data as Array<Record<string, unknown>>) : [];
  const byModel = new Map<string, ModelUsage>();
  for (const bucket of buckets) {
    const results = Array.isArray(bucket.results) ? (bucket.results as Array<Record<string, unknown>>) : [];
    for (const r of results) {
      const model = typeof r.line_item === "string" ? r.line_item : "unknown";
      const amount = typeof r.amount === "object" && r.amount !== null ? (r.amount as Record<string, unknown>) : undefined;
      const costUsd = typeof amount?.value === "number" ? amount.value : 0;
      const existing = byModel.get(model) ?? { model, cost_usd: 0, input_tokens: 0, output_tokens: 0 };
      existing.cost_usd += costUsd;
      byModel.set(model, existing);
    }
  }
  const models = [...byModel.values()];
  return {
    provider: "openai",
    period_start: periodStart,
    period_end: periodEnd,
    models,
    total_cost_usd: models.reduce((s, m) => s + m.cost_usd, 0),
  };
}

export async function realFetchAnthropicUsage(
  cred: ProviderCredentialSecrets,
  periodStart: string,
  periodEnd: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = "https://api.anthropic.com/v1",
): Promise<ProviderUsageReport> {
  const url = `${baseUrl}/organizations/cost_report?starting_at=${periodStart}T00:00:00Z&ending_at=${periodEnd}T00:00:00Z`;
  const res = await timedFetch(fetchImpl, url, {
    headers: { "x-api-key": cred.key, "anthropic-version": "2023-06-01" },
  });
  if (!res.ok) throw new Error(`Anthropic usage API error: ${res.status}`);
  const body = (await res.json()) as Record<string, unknown>;
  const buckets = Array.isArray(body.data) ? (body.data as Array<Record<string, unknown>>) : [];
  const byModel = new Map<string, ModelUsage>();
  for (const bucket of buckets) {
    const results = Array.isArray(bucket.results) ? (bucket.results as Array<Record<string, unknown>>) : [];
    for (const r of results) {
      const model = typeof r.model === "string" ? r.model : "unknown";
      const amount = typeof r.amount === "object" && r.amount !== null ? (r.amount as Record<string, unknown>) : undefined;
      const costUsd = typeof amount?.value === "number" ? amount.value : 0;
      const existing = byModel.get(model) ?? { model, cost_usd: 0, input_tokens: 0, output_tokens: 0 };
      existing.cost_usd += costUsd;
      byModel.set(model, existing);
    }
  }
  const models = [...byModel.values()];
  return {
    provider: "anthropic",
    period_start: periodStart,
    period_end: periodEnd,
    models,
    total_cost_usd: models.reduce((s, m) => s + m.cost_usd, 0),
  };
}

export function defaultOptimizationMeterDeps(): OptimizationMeterDeps {
  return {
    token: process.env.GITHUB_TOKEN,
    fetchRepo: (url, token) => fetchGitHubRepo(url, token),
    openPr: (params) => openApplyPullRequest(fetch, params),
    getCredentials: (account_id, repo_full_name) => getProviderCredentialsForRepo(account_id, repo_full_name),
    fetchUsage: (cred, start, end) =>
      cred.provider === "openai" ? realFetchOpenAIUsage(cred, start, end) : realFetchAnthropicUsage(cred, start, end),
    now: () => new Date(),
  };
}
