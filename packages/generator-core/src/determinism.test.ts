/**
 * Determinism regression tests — same input must produce byte-identical output.
 *
 * Phase 0 guarantee: no generator may embed wall-clock timestamps (or any
 * other run-dependent value) in artifact content. Every timestamp in
 * generated output must derive from the snapshot analysis (ContextMap /
 * RepoProfile `generated_at`), so regenerating from the same input yields
 * byte-identical artifacts.
 */
import { describe, it, expect } from "vitest";
import { generateFiles, listAvailableGenerators } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput, GeneratorResult } from "./types.js";

const FIXED_ANALYSIS_TIMESTAMP = "2026-01-02T03:04:05.000Z";

function makeSnapshot(): SnapshotRecord {
  const files: FileEntry[] = [
    { path: "src/index.ts", content: 'import { db } from "./db";\nexport function main() { return db.query(); }', size: 70 },
    { path: "src/db.ts", content: 'export const db = { query: () => [] };', size: 38 },
    { path: "package.json", content: '{"name":"determinism-fixture","version":"1.0.0","dependencies":{"react":"18.0.0","stripe":"14.0.0"},"devDependencies":{"vitest":"1.0.0","typescript":"5.0.0"}}', size: 160 },
    { path: "app/page.tsx", content: "export default function Home() { return <div>Home</div> }", size: 58 },
    { path: "app/api/users/route.ts", content: 'export async function GET() { return Response.json([]) }', size: 56 },
    { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
    { path: ".github/workflows/ci.yml", content: "name: CI\non: [push]", size: 20 },
    { path: "Dockerfile", content: "FROM node:20-alpine\nCMD [\"node\", \"dist/index.js\"]", size: 50 },
    { path: "tests/index.test.ts", content: 'import { test } from "vitest";\ntest("works", () => expect(true).toBe(true));', size: 78 },
    { path: "components/Button.tsx", content: 'export function Button({ children }: { children: React.ReactNode }) { return <button>{children}</button> }', size: 104 },
  ];
  return {
    snapshot_id: "snap-det-001",
    project_id: "proj-det-001",
    created_at: "2026-01-01T00:00:00.000Z",
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: "determinism-fixture",
      project_type: "web_application",
      frameworks: ["react"],
      goals: ["Verify deterministic generation"],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
    account_id: null,
  };
}

/**
 * Builds a full GeneratorInput requesting EVERY registered generator output.
 * The snapshot-analysis timestamp is pinned so independently constructed
 * inputs are value-identical ("same input").
 */
function makeInput(): GeneratorInput {
  const snapshot = makeSnapshot();
  const context_map = buildContextMap(snapshot);
  const repo_profile = buildRepoProfile(snapshot);
  context_map.generated_at = FIXED_ANALYSIS_TIMESTAMP;
  repo_profile.generated_at = FIXED_ANALYSIS_TIMESTAMP;
  return {
    context_map,
    repo_profile,
    requested_outputs: listAvailableGenerators().map(g => g.path),
    source_files: snapshot.files,
  };
}

function expectByteIdentical(a: GeneratorResult, b: GeneratorResult): void {
  // Envelope must match too — generated_at is snapshot-derived, not wall-clock.
  expect(b.snapshot_id).toBe(a.snapshot_id);
  expect(b.project_id).toBe(a.project_id);
  expect(b.generated_at).toBe(a.generated_at);
  expect(b.skipped).toEqual(a.skipped);

  expect(a.files.length).toBeGreaterThan(0);
  expect(b.files.map(f => f.path)).toEqual(a.files.map(f => f.path));

  const second = new Map(b.files.map(f => [f.path, f]));
  const mismatched: string[] = [];
  for (const file of a.files) {
    const other = second.get(file.path);
    if (!other || other.content !== file.content || other.description !== file.description || other.content_type !== file.content_type || other.program !== file.program) {
      mismatched.push(file.path);
    }
  }
  expect(mismatched, "artifacts that differ between two runs with the same input").toEqual([]);
}

describe("generateFiles — determinism", () => {
  it("produces byte-identical artifacts across two runs with the same input object", () => {
    const input = makeInput();
    const first = generateFiles(input);
    const second = generateFiles(input);
    expectByteIdentical(first, second);
  });

  it("produces byte-identical artifacts across independently constructed equal inputs", () => {
    const first = generateFiles(makeInput());
    const second = generateFiles(makeInput());
    expectByteIdentical(first, second);
  });

  it("covers every registered generator (generated or deterministically skipped)", () => {
    const input = makeInput();
    const result = generateFiles(input);
    const total = listAvailableGenerators().length;
    expect(result.files.length + result.skipped.length).toBe(total);
  });
});
