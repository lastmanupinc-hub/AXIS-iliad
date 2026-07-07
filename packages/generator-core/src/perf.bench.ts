/**
 * WO-15: Compliance-engine performance benchmarks — pure in-memory code paths.
 * Run with: npx vitest bench packages/generator-core/src/perf.bench.ts
 * (or the root scripts: `pnpm bench` / `pnpm bench:compliance`)
 *
 * Mirrors packages/repo-parser/src/perf.bench.ts: vitest bench/describe,
 * pure-fn imports, inline fixtures. Reports a latency row for all seven
 * agentic-commerce engines so the doc perf claim cites a MEASURED number.
 */
import { bench, describe } from "vitest";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
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

// ─── Fixtures (same shape as generators-agentic-purchasing.test.ts) ─────────

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

// ─── Engines under test (all seven — pure, synchronous, in-memory) ──────────

describe("compliance engines (pure in-memory, zero network)", () => {
  bench("detectCommerceSignals", () => {
    detectCommerceSignals(files);
  });

  bench("computeComplianceGrade", () => {
    computeComplianceGrade(files);
  });

  bench("generateAgentPurchasingPlaybook", () => {
    generateAgentPurchasingPlaybook(ctx, profile, files);
  });

  bench("generateProductSchema", () => {
    generateProductSchema(ctx, profile, files);
  });

  bench("generateCheckoutFlow", () => {
    generateCheckoutFlow(ctx, profile, files);
  });

  bench("generateNegotiationRules", () => {
    generateNegotiationRules(ctx, profile, files);
  });

  bench("generateCommerceRegistry", () => {
    generateCommerceRegistry(ctx, profile, files);
  });
});
