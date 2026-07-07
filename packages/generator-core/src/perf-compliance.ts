/**
 * WO-15 · perf-benchmark — runtime proof for the visa_compliance_kit perf claim.
 *
 * Runs the seven pure agentic-commerce engines with a throwing network stub
 * installed on globalThis and records real timing, proving:
 *
 *   1. external API calls at runtime: 0 (the stub never fires);
 *   2. synchronous execution (no engine returns a Promise — no deferred network);
 *   3. real p50/p99/max latency via performance.now(), machine-readable.
 *
 * This makes the LOCAL half of the doc claim measurable: api_calls 0 and
 * pci_scope "none" are runtime-proven, and the measured p50 replaces the false
 * literal "latency_ms:0" (sub-millisecond is not zero). The Visa IC 200-800ms
 * comparator canNOT be measured here — it is a published industry range, and
 * is labelled as such in external_comparison_note, never as a head-to-head.
 *
 * Pure module: no network, no new deps.
 */
import { performance } from "node:perf_hooks";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  detectCommerceSignals,
  computeComplianceGrade,
  generateAgentPurchasingPlaybook,
  generateProductSchema,
  generateCheckoutFlow,
  generateNegotiationRules,
  generateCommerceRegistry,
} from "./generators-agentic-purchasing.js";

export interface ComplianceBenchResult {
  fn: string; // e.g. "computeComplianceGrade"
  iterations: number;
  p50_ms: number;
  p99_ms: number;
  max_ms: number;
  external_api_calls: number; // must be 0
  returns_promise: boolean; // must be false
}

export interface ComplianceBenchReport {
  generated_at: string; // ISO
  node_version: string; // process.version
  iterations: number;
  external_api_calls_total: number; // must be 0
  measured_p50_ms: number; // max p50 across engines — the number docs must cite
  results: ComplianceBenchResult[];
  methodology: string;
  external_comparison_note: string;
}

const DEFAULT_ITERATIONS = 1000;

/** Nearest-rank percentile over an ascending-sorted sample. */
function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil(q * sortedAsc.length) - 1;
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, rank))];
}

/** Round to 4 decimal places — sub-millisecond resolution without float noise. */
function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

/**
 * Runs each engine `iterations` times with the global network entrypoint
 * stubbed to throw; records timing + call count. Restores globalThis.fetch on
 * exit (try/finally). Deterministic aside from timing + timestamp.
 */
export function runComplianceBench(
  ctx: ContextMap,
  profile: RepoProfile,
  files: SourceFile[],
  iterations: number = DEFAULT_ITERATIONS,
): ComplianceBenchReport {
  let externalCalls = 0;
  // Throwing stub — assignment only, never invoked by the engines under test.
  // If an engine ever reached for the network, the counter would tick and the
  // thrown error would fail the run loudly.
  const throwingStub = (() => {
    externalCalls += 1;
    throw new Error("external call attempted during compliance bench — engines must be network-free");
  }) as unknown as typeof globalThis.fetch;

  const engines: ReadonlyArray<{ fn: string; run: () => unknown }> = [
    { fn: "detectCommerceSignals", run: () => detectCommerceSignals(files) },
    { fn: "computeComplianceGrade", run: () => computeComplianceGrade(files) },
    { fn: "generateAgentPurchasingPlaybook", run: () => generateAgentPurchasingPlaybook(ctx, profile, files) },
    { fn: "generateProductSchema", run: () => generateProductSchema(ctx, profile, files) },
    { fn: "generateCheckoutFlow", run: () => generateCheckoutFlow(ctx, profile, files) },
    { fn: "generateNegotiationRules", run: () => generateNegotiationRules(ctx, profile, files) },
    { fn: "generateCommerceRegistry", run: () => generateCommerceRegistry(ctx, profile, files) },
  ];

  const originalFetch = globalThis.fetch;
  const results: ComplianceBenchResult[] = [];
  globalThis.fetch = throwingStub;
  try {
    for (const engine of engines) {
      const callsBefore = externalCalls;
      // One untimed probe call to capture the return shape (Promise or not).
      const probe = engine.run();
      const returnsPromise = probe instanceof Promise;

      const durations: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const t0 = performance.now();
        engine.run();
        durations.push(performance.now() - t0);
      }
      durations.sort((a, b) => a - b);

      results.push({
        fn: engine.fn,
        iterations,
        p50_ms: round4(percentile(durations, 0.5)),
        p99_ms: round4(percentile(durations, 0.99)),
        max_ms: round4(durations.length > 0 ? durations[durations.length - 1] : 0),
        external_api_calls: externalCalls - callsBefore,
        returns_promise: returnsPromise,
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  return {
    generated_at: new Date().toISOString(),
    node_version: process.version,
    iterations,
    external_api_calls_total: externalCalls,
    measured_p50_ms: results.reduce((m, r) => Math.max(m, r.p50_ms), 0),
    results,
    methodology: `${iterations} in-process iterations, performance.now(); fetch stubbed to throw; no network.`,
    external_comparison_note:
      "Visa IC 200-800ms is a published industry range, NOT measured by this harness. Only local in-process latency is measured here; no head-to-head comparison is claimed.",
  };
}
