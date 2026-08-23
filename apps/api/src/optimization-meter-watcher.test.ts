import { describe, it, expect } from "vitest";
import type { WatchJobPayload, FileEntry, ProviderCredentialSecrets } from "@axis/snapshots";
import {
  processOptimizationMeter,
  detectLlmCallSites,
  attributeUsage,
  buildCostReport,
  detectCostRegression,
  extractPreviousTotal,
  COST_REPORT_PATH,
  type OptimizationMeterDeps,
  type ProviderUsageReport,
  type LlmCallSite,
} from "./optimization-meter-watcher.js";
import type { OpenApplyPrParams } from "./github-pr.js";

// app_33's V gate is the defensible claim — "reconciliation: attributed total
// matches provider invoice within tolerance" — so the reconciliation tests
// here are RED-PROOF style: a mismatch must block the PR outright, and a
// model with real spend but no detected call site must be named as
// unattributed, never silently dropped or fabricated onto a call site.

function payload(over: Partial<WatchJobPayload> = {}): WatchJobPayload {
  return {
    account_id: "acc-1",
    product_id: "optimization",
    repo_full_name: "octo/app",
    event_type: "scheduled_pull",
    ref: "",
    ...over,
  };
}

const OPENAI_CRED: ProviderCredentialSecrets = {
  credential_id: "cred-1",
  account_id: "acc-1",
  provider: "openai",
  repo_full_name: "octo/app",
  key: "sk-secret",
  metadata: {},
};

const REPO_FILES: FileEntry[] = [
  {
    path: "src/chat.ts",
    content: [
      'import OpenAI from "openai";',
      "const client = new OpenAI();",
      "async function ask() {",
      "  return client.chat.completions.create({",
      '    model: "gpt-4o",',
      "    messages: [],",
      "  });",
      "}",
    ].join("\n"),
    size: 200,
  },
  { path: "src/no-llm.ts", content: "export const x = 1;\n", size: 20 },
];

const ROUTES = [{ path: "/v1/ask", method: "POST", source_file: "src/chat.ts" }];

function usageReport(over: Partial<ProviderUsageReport> = {}): ProviderUsageReport {
  return {
    provider: "openai",
    period_start: "2026-07-24",
    period_end: "2026-08-23",
    models: [{ model: "GPT-4o", cost_usd: 10, input_tokens: 1000, output_tokens: 500 }],
    total_cost_usd: 10,
    ...over,
  };
}

function makeDeps(opts: {
  files?: FileEntry[];
  token?: string | undefined;
  credentials?: ProviderCredentialSecrets[];
  reports?: ProviderUsageReport[];
  fetchShouldThrow?: boolean;
} = {}) {
  const token = "token" in opts ? opts.token : "gh-token";
  const credentials = "credentials" in opts ? opts.credentials! : [OPENAI_CRED];
  const reports = opts.reports ?? [usageReport()];
  const openPrCalls: OpenApplyPrParams[] = [];
  let fetched = false;
  let reportIndex = 0;
  const deps: OptimizationMeterDeps = {
    token,
    fetchRepo: async () => {
      fetched = true;
      return { files: opts.files ?? REPO_FILES };
    },
    openPr: async (params) => {
      openPrCalls.push(params);
      return { opened: true, url: "https://github.com/octo/app/pull/1" };
    },
    getCredentials: async () => credentials,
    fetchUsage: async () => {
      if (opts.fetchShouldThrow) throw new Error("Provider unreachable: boom");
      const r = reports[reportIndex] ?? reports[reports.length - 1];
      reportIndex++;
      return r;
    },
    now: () => new Date("2026-08-23T00:00:00Z"),
  };
  return { deps, openPrCalls, wasFetched: () => fetched };
}

describe("processOptimizationMeter — canonical watcher cases", () => {
  it("declines other products without fetching anything", async () => {
    const { deps, wasFetched } = makeDeps();
    const result = await processOptimizationMeter(payload({ product_id: "seo" }), deps);
    expect(result.status).toBe("not_optimization_product");
    expect(wasFetched()).toBe(false);
  });

  it("declines without a GitHub token", async () => {
    const { deps } = makeDeps({ token: undefined });
    expect((await processOptimizationMeter(payload(), deps)).status).toBe("no_token");
  });

  it("declines when the account has no provider credentials for this repo", async () => {
    const { deps } = makeDeps({ credentials: [] });
    expect((await processOptimizationMeter(payload(), deps)).status).toBe("no_provider_credentials");
  });

  it("reports provider_fetch_failed with the normalized error, never a PR", async () => {
    const { deps, openPrCalls } = makeDeps({ fetchShouldThrow: true });
    const result = await processOptimizationMeter(payload(), deps);
    expect(result.status).toBe("provider_fetch_failed");
    expect(result.error).toContain("Provider unreachable");
    expect(openPrCalls).toHaveLength(0);
  });

  it("opens a PR with the live cost report when reconciliation passes", async () => {
    const { deps, openPrCalls } = makeDeps();
    const result = await processOptimizationMeter(payload(), deps);
    expect(result.status).toBe("pr_opened");
    expect(result.total_real_cost_usd).toBe(10);
    expect(result.unattributed_cost_usd).toBe(0);
    expect(openPrCalls).toHaveLength(1);
    const pr = openPrCalls[0];
    expect(pr.owner).toBe("octo");
    expect(pr.repo).toBe("app");
    expect(pr.files[0].path).toBe(COST_REPORT_PATH);
    expect(pr.branchName).toMatch(/^axis\/optimization-cost-report-[0-9a-f]{12}$/);
    expect(pr.files[0].content).toContain("src/chat.ts:4");
    expect(pr.files[0].content).toContain("Reconciliation — PASSED");
  });

  it("blocks the PR when real spend has NO detected call site (unattributed) but still names it honestly", async () => {
    const { deps, openPrCalls } = makeDeps({
      files: [{ path: "src/no-llm.ts", content: "export const x = 1;\n", size: 20 }],
    });
    const result = await processOptimizationMeter(payload(), deps);
    // Reconciliation still holds (unattributed + attributed = real total) — this
    // is not a mismatch, it's an honest "we found the spend, not the call site."
    expect(result.status).toBe("pr_opened");
    expect(result.unattributed_cost_usd).toBe(10);
    expect(openPrCalls[0].files[0].content).toContain("unattributed");
  });

  it("is idempotent — an identical existing report produces no_changes, no PR", async () => {
    const first = makeDeps();
    await processOptimizationMeter(payload(), first.deps);
    const report = first.openPrCalls[0].files[0].content;

    const second = makeDeps({
      files: [...REPO_FILES, { path: COST_REPORT_PATH, content: report, size: report.length }],
    });
    const result = await processOptimizationMeter(payload(), second.deps);
    expect(result.status).toBe("no_changes");
    expect(second.openPrCalls).toHaveLength(0);
  });

  it("never feeds its own prior report back into the snapshot (the app_11/24/35/32 lesson)", async () => {
    const poisoned: FileEntry = {
      path: COST_REPORT_PATH,
      content: 'import OpenAI from "openai"; client.chat.completions.create({model: "gpt-4o"});\n',
      size: 80,
    };
    const { deps, openPrCalls } = makeDeps({ files: [...REPO_FILES, poisoned] });
    await processOptimizationMeter(payload(), deps);
    // Only ONE real call site (src/chat.ts) should ever be attributed to —
    // if the poisoned report leaked in, this would double up.
    const content = openPrCalls[0].files[0].content;
    const rows = content.split("\n").filter((l) => l.includes("src/chat.ts:4"));
    expect(rows).toHaveLength(1);
  });
});

describe("detectLlmCallSites — static call-shape detection", () => {
  it("finds an OpenAI call site and its nearby model literal, joined to a route by source_file", () => {
    const sites = detectLlmCallSites(REPO_FILES, ROUTES);
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({ file: "src/chat.ts", line: 4, provider: "openai", model: "gpt-4o", route: "/v1/ask" });
  });

  it("never invents a call site in a file with no SDK import", () => {
    const sites = detectLlmCallSites(
      [{ path: "src/fake.ts", content: 'client.chat.completions.create({model: "gpt-4o"});\n', size: 60 }],
      ROUTES,
    );
    expect(sites).toHaveLength(0);
  });

  it("detects an Anthropic call site independently of OpenAI", () => {
    const files: FileEntry[] = [
      {
        path: "src/claude.ts",
        content: [
          'import Anthropic from "@anthropic-ai/sdk";',
          "const c = new Anthropic();",
          "c.messages.create({",
          '  model: "claude-sonnet-4",',
          "});",
        ].join("\n"),
        size: 150,
      },
    ];
    const sites = detectLlmCallSites(files, []);
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({ provider: "anthropic", model: "claude-sonnet-4", route: null });
  });
});

describe("attributeUsage — the V gate, red-proven", () => {
  const site: LlmCallSite = { file: "src/chat.ts", line: 4, provider: "openai", model: "gpt-4o", route: "/v1/ask" };

  it("splits a model's real total evenly across every detected call site for it", () => {
    const twoSites: LlmCallSite[] = [site, { ...site, line: 40 }];
    const result = attributeUsage([usageReport()], twoSites);
    expect(result.attributed).toHaveLength(2);
    expect(result.attributed[0].attributed_cost_usd).toBeCloseTo(5);
    expect(result.attributed[1].attributed_cost_usd).toBeCloseTo(5);
    expect(result.reconciled).toBe(true);
  });

  it("never misattributes a more-specific model's call site to a shorter model's price row (gpt-4o-mini vs GPT-4o)", () => {
    const miniSite: LlmCallSite = { file: "src/mini.ts", line: 1, provider: "openai", model: "gpt-4o-mini", route: null };
    const miniReport = usageReport({
      models: [{ model: "GPT-4o-mini", cost_usd: 3, input_tokens: 0, output_tokens: 0 }],
      total_cost_usd: 3,
    });
    // BOTH the base and the -mini call site are present — the base model's
    // own report row must not steal the mini site (and vice versa).
    const result = attributeUsage([usageReport(), miniReport], [site, miniSite]);
    expect(result.attributed).toHaveLength(2);
    const gptRow = result.attributed.find((a) => a.file === "src/chat.ts");
    const miniRow = result.attributed.find((a) => a.file === "src/mini.ts");
    expect(gptRow?.model).toBe("GPT-4o");
    expect(miniRow?.model).toBe("GPT-4o-mini");
    expect(result.reconciled).toBe(true);
  });

  it("never correlates a report model AXIS doesn't recognize with a call site that has no model literal (two different unknowns must not match each other)", () => {
    const unknownReport = usageReport({
      models: [{ model: "some-future-model-not-in-our-table", cost_usd: 7, input_tokens: 0, output_tokens: 0 }],
      total_cost_usd: 7,
    });
    const siteWithNoModelLiteral: LlmCallSite = { file: "src/unknown.ts", line: 1, provider: "openai", model: null, route: null };
    const result = attributeUsage([unknownReport], [siteWithNoModelLiteral]);
    expect(result.attributed).toHaveLength(0);
    expect(result.unattributed).toHaveLength(1);
    expect(result.total_unattributed_usd).toBe(7);
    expect(result.reconciled).toBe(true);
  });

  it("reports a model with real spend and zero call sites as unattributed, never dropped", () => {
    const result = attributeUsage([usageReport()], []);
    expect(result.attributed).toHaveLength(0);
    expect(result.unattributed).toEqual([{ model: "GPT-4o", cost_usd: 10, input_tokens: 1000, output_tokens: 500 }]);
    expect(result.total_unattributed_usd).toBe(10);
    expect(result.reconciled).toBe(true);
  });

  it("reconciliation holds across multiple models and providers summed together", () => {
    const reports = [
      usageReport({ models: [{ model: "GPT-4o", cost_usd: 4, input_tokens: 0, output_tokens: 0 }], total_cost_usd: 4 }),
      usageReport({
        provider: "anthropic",
        models: [{ model: "Claude Sonnet 4", cost_usd: 6, input_tokens: 0, output_tokens: 0 }],
        total_cost_usd: 6,
      }),
    ];
    const result = attributeUsage(reports, [site]);
    expect(result.total_attributed_usd).toBeCloseTo(4);
    expect(result.total_unattributed_usd).toBeCloseTo(6);
    expect(result.reconciled).toBe(true);
  });
});

describe("detectCostRegression / extractPreviousTotal — W's regression-alert half", () => {
  it("reports no regression when there is no prior report to compare against", () => {
    expect(extractPreviousTotal(undefined)).toBeNull();
    const result = detectCostRegression(null, 100);
    expect(result).toEqual({ regressed: false, previous_total_usd: null, current_total_usd: 100, pct_change: null });
  });

  it("pulls the prior total back out of its own rendered report, comparison only", () => {
    const priorReport = buildCostReport([usageReport()], attributeUsage([usageReport()], []), "2026-06-24", "2026-07-24");
    expect(extractPreviousTotal(priorReport)).toBe(10);
  });

  it("flags a regression when spend jumps more than the threshold since the last pull", () => {
    const result = detectCostRegression(10, 20); // +100%
    expect(result.regressed).toBe(true);
    expect(result.pct_change).toBeCloseTo(100);
  });

  it("does not flag a small, sub-threshold increase", () => {
    const result = detectCostRegression(10, 11); // +10%, under the 25% default
    expect(result.regressed).toBe(false);
  });

  it("does not flag a decrease", () => {
    const result = detectCostRegression(20, 10);
    expect(result.regressed).toBe(false);
    expect(result.pct_change).toBeCloseTo(-50);
  });

  it("treats a zero prior total as nothing to compare against, never a fabricated infinite jump", () => {
    const result = detectCostRegression(0, 50);
    expect(result.regressed).toBe(false);
    expect(result.pct_change).toBeNull();
  });
});

describe("processOptimizationMeter — regression alert integration", () => {
  it("titles the PR as a regression alert and never blocks it — a data problem the V gate would reject, a spend jump is informational", async () => {
    const priorReport = buildCostReport(
      [usageReport({ models: [{ model: "GPT-4o", cost_usd: 4, input_tokens: 0, output_tokens: 0 }], total_cost_usd: 4 })],
      attributeUsage([usageReport({ total_cost_usd: 4 })], []),
      "2026-06-24",
      "2026-07-24",
    );
    const { deps, openPrCalls } = makeDeps({
      files: [...REPO_FILES, { path: COST_REPORT_PATH, content: priorReport, size: priorReport.length }],
      reports: [usageReport()], // total 10 vs prior 4 — well over the 25% threshold
    });
    const result = await processOptimizationMeter(payload(), deps);
    expect(result.status).toBe("pr_opened");
    expect(result.regression?.regressed).toBe(true);
    expect(openPrCalls[0].title).toContain("cost regression detected");
    expect(openPrCalls[0].files[0].content).toContain("Cost regression: up");
  });
});

describe("buildCostReport — honesty of the rendered report", () => {
  it("states the even-split methodology explicitly, never implying per-request precision", () => {
    const result = attributeUsage([usageReport()], [
      { file: "src/chat.ts", line: 4, provider: "openai", model: "gpt-4o", route: "/v1/ask" },
    ]);
    const report = buildCostReport([usageReport()], result, "2026-07-24", "2026-08-23");
    expect(report).toContain("even split");
    expect(report).toContain("not claimed as per-request precision");
    expect(report).toContain("Reconciliation — PASSED");
  });

  it("surfaces a FAILED reconciliation as untrustworthy rather than presenting it cleanly", () => {
    const fakeResult = {
      attributed: [],
      unattributed: [],
      total_attributed_usd: 0,
      total_unattributed_usd: 0,
      reconciled: false,
    };
    const report = buildCostReport([usageReport()], fakeResult, "2026-07-24", "2026-08-23");
    expect(report).toContain("Reconciliation — FAILED");
    expect(report).toContain("should not be trusted");
  });
});
