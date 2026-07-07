/**
 * WO-15: runtime proof + doc honesty for the visa_compliance_kit perf claim.
 *
 * Proves at runtime that the seven agentic-commerce engines make ZERO external
 * API calls (throwing fetch stub never fires), are synchronous (no Promise
 * returns), and have real measured sub-50ms latency — NOT the literal "0ms"
 * the docs used to claim. Writes the machine-readable perf-results.json that
 * docs must cite, and (mirroring the count-honesty regime) guards both
 * CLAUDE.md files against the unsourced originals: `latency_ms:0` and
 * "0ms vs 200-800ms" are banned unless sourced from perf-results.json and the
 * Visa IC range is labelled a published industry range.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { SourceFile } from "./types.js";
import { runComplianceBench, type ComplianceBenchReport } from "./perf-compliance.js";

// ─── Paths ───────────────────────────────────────────────────────────────────

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_PATH = join(PKG_DIR, "perf-results.json");
const REPO_ROOT = join(PKG_DIR, "..", "..");
// The estate-root CLAUDE.md (axis-odyssey) lives OUTSIDE this git repo; it is
// only checkable on a machine that has it (guarded by existsSync — CI checkouts
// won't, so the in-repo CLAUDE.md is the always-enforced one).
const CLAUDE_MD_CANDIDATES = [
  join(REPO_ROOT, "CLAUDE.md"),
  join(REPO_ROOT, "..", "CLAUDE.md"),
];

const ENGINE_NAMES = [
  "detectCommerceSignals",
  "computeComplianceGrade",
  "generateAgentPurchasingPlaybook",
  "generateProductSchema",
  "generateCheckoutFlow",
  "generateNegotiationRules",
  "generateCommerceRegistry",
];

// ─── Fixtures (same shape as generators-agentic-purchasing.test.ts:13-42) ────

function makeSnapshot(overrides: Partial<SnapshotRecord> = {}): SnapshotRecord {
  const files: FileEntry[] = [
    { path: "src/index.ts", content: 'import { db } from "./db";\nexport function main() { return db.query(); }', size: 70 },
    { path: "src/db.ts", content: 'export const db = { query: () => [] };', size: 38 },
    { path: "next.config.mjs", content: "export default {}", size: 18 },
    { path: "package.json", content: '{"name":"axis-test","dependencies":{"next":"14.0.0","react":"18.0.0"}}', size: 72 },
    { path: "app/page.tsx", content: "export default function Home() { return <div>Home</div> }", size: 58 },
    { path: ".github/workflows/ci.yml", content: "name: CI\non: [push]", size: 20 },
    { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
  ];
  return {
    snapshot_id: "snap-perf-001",
    project_id: "proj-perf-001",
    created_at: new Date().toISOString(),
    input_method: "api_submission",
    manifest: {
      project_name: "axis-test",
      project_type: "web_application",
      frameworks: ["next", "react"],
      goals: ["Generate AI context files"],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
    account_id: null,
    ...overrides,
  };
}

const snapshot = makeSnapshot();
const ctx = buildContextMap(snapshot);
const profile = buildRepoProfile(snapshot);
const files: SourceFile[] = snapshot.files;

// Memoized 50-iteration run — the engines are deterministic aside from timing,
// so one measured report serves every assertion below.
let cached: ComplianceBenchReport | null = null;
function report(): ComplianceBenchReport {
  if (!cached) cached = runComplianceBench(ctx, profile, files, 50);
  return cached;
}

describe("runComplianceBench — runtime proof of the visa_compliance_kit perf claim", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Belt-and-braces: even OUTSIDE the bench's own stub window, any network
    // attempt from this suite must explode.
    globalThis.fetch = (() => {
      throw new Error("external call");
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("proves ZERO external API calls across all 7 engines (throwing fetch spy never fires)", () => {
    const r = report();
    expect(r.external_api_calls_total).toBe(0);
    expect(r.results).toHaveLength(7);
    expect(r.results.map((x) => x.fn)).toEqual(ENGINE_NAMES);
    for (const engine of r.results) {
      expect(engine.external_api_calls, `${engine.fn} made an external call`).toBe(0);
    }
  });

  it("proves every engine is synchronous — no Promise returns (no deferred network)", () => {
    for (const engine of report().results) {
      expect(engine.returns_promise, `${engine.fn} returned a Promise`).toBe(false);
    }
  });

  it("measures real low-ms latency — NOT the literal 0 the doc claimed", () => {
    const r = report();
    expect(r.measured_p50_ms).toBeGreaterThanOrEqual(0);
    expect(r.measured_p50_ms).toBeLessThan(50);
    for (const engine of r.results) {
      expect(engine.iterations).toBe(50);
      expect(engine.p50_ms).toBeGreaterThanOrEqual(0);
      expect(engine.p99_ms).toBeGreaterThanOrEqual(engine.p50_ms);
      expect(engine.max_ms).toBeGreaterThanOrEqual(engine.p99_ms);
    }
  });

  it("restores globalThis.fetch on exit (try/finally)", () => {
    const marker = globalThis.fetch; // the throwing stub installed by beforeEach
    runComplianceBench(ctx, profile, files, 2);
    expect(globalThis.fetch).toBe(marker);
  });

  it("writes/reads machine-readable perf-results.json (a valid ComplianceBenchReport)", () => {
    const r = report();
    writeFileSync(RESULTS_PATH, `${JSON.stringify(r, null, 2)}\n`, "utf8");

    const parsed = JSON.parse(readFileSync(RESULTS_PATH, "utf8")) as ComplianceBenchReport;
    expect(parsed.external_api_calls_total).toBe(0);
    expect(parsed.external_comparison_note.length).toBeGreaterThan(0);
    expect(parsed.external_comparison_note).toMatch(/published industry range/i);
    expect(parsed.node_version).toBe(process.version);
    expect(typeof parsed.generated_at).toBe("string");
    expect(parsed.iterations).toBe(50);
    expect(parsed.measured_p50_ms).toBeGreaterThanOrEqual(0);
    expect(parsed.results.map((x) => x.fn)).toEqual(ENGINE_NAMES);
    expect(typeof parsed.methodology).toBe("string");
  });
});

// ─── Doc honesty (mirrors the count-honesty regime) ──────────────────────────
//
// The unsourced originals — the literal `latency_ms:0` (also `"latency_ms":0`)
// and the standalone "0ms vs 200-800ms" — are banned from both CLAUDE.md files
// UNLESS a sibling perf-results.json exists AND the offending perf line contains
// that JSON's measured_p50_ms value AND the phrase "published industry range"
// (i.e. the number is sourced and the Visa IC figure attributed). Removing the
// comparator entirely also passes.

const BANNED_LATENCY_ZERO = /latency_ms"?\s*:\s*0(?![.\d])/;
const BANNED_ZERO_VS_RANGE = /0\s*ms\s+vs\.?\s+200[-–]800\s*ms/i;

describe("doc honesty — CLAUDE.md perf claim is sourced or removed", () => {
  it("no unsourced latency_ms:0 / '0ms vs 200-800ms' remains in any reachable CLAUDE.md", () => {
    const violations: string[] = [];

    for (const docPath of CLAUDE_MD_CANDIDATES) {
      if (!existsSync(docPath)) continue; // estate-root doc is absent in CI checkouts
      const text = readFileSync(docPath, "utf8");

      const offendingLines = text
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => BANNED_LATENCY_ZERO.test(line) || BANNED_ZERO_VS_RANGE.test(line));

      if (offendingLines.length === 0) continue; // comparator removed/replaced — honest

      // Banned literal present: only allowed when sourced from perf-results.json
      // and explicitly attributed as a published industry range.
      if (!existsSync(RESULTS_PATH)) {
        violations.push(`${docPath}: carries the perf claim but no perf-results.json exists to source it`);
        continue;
      }
      const measured = (JSON.parse(readFileSync(RESULTS_PATH, "utf8")) as ComplianceBenchReport).measured_p50_ms;
      for (const { line, n } of offendingLines) {
        const sourced = line.includes(String(measured)) && /published industry range/i.test(line);
        if (!sourced) {
          violations.push(
            `${docPath}:${n}: unsourced perf claim — must cite measured_p50_ms (${measured}) from perf-results.json and label the 200-800ms Visa IC figure a "published industry range", or drop the comparator`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
