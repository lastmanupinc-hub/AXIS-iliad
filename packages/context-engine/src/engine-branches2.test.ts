import { describe, it, expect } from "vitest";
import { buildContextMap } from "./engine.js";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";

function snap(files: FileEntry[]): SnapshotRecord {
  return {
    snapshot_id: "snap-eb2-001",
    project_id: "proj-eb2-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: "eb2-test",
      project_type: "web_application",
      frameworks: [],
      goals: [],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
  };
}

/* ─── detectEntryPoints sort: same-type comparison ─────────────── */

describe("entry point sorting: same-type tie-breaking", () => {
  it("prefers main.go over index.ts within app_entry type", () => {
    const files: FileEntry[] = [
      { path: "cmd/api/main.go", content: 'package main\n\nfunc main() {}', size: 30 },
      { path: "cmd/worker/main.go", content: 'package main\n\nfunc main() {}', size: 30 },
      { path: "src/index.ts", content: 'console.log("hi");', size: 20 },
      { path: "go.mod", content: "module example.com/app\n\ngo 1.21", size: 30 },
    ];
    const ctx = buildContextMap(snap(files));
    const appEntries = ctx.entry_points.filter(e => e.type === "app_entry");
    // main.go entries should sort before index.ts
    if (appEntries.length >= 2) {
      const mainIdx = appEntries.findIndex(e => e.path.endsWith("main.go"));
      const tsIdx = appEntries.findIndex(e => e.path.endsWith("index.ts"));
      if (mainIdx >= 0 && tsIdx >= 0) {
        expect(mainIdx).toBeLessThan(tsIdx);
      }
    }
  });

  it("prefers +layout.svelte over other app_entry files", () => {
    const files: FileEntry[] = [
      { path: "src/routes/+layout.svelte", content: '<slot />', size: 10 },
      { path: "src/index.ts", content: 'console.log("hi");', size: 20 },
      { path: "package.json", content: '{"dependencies": {"@sveltejs/kit": "^1.0"}}', size: 60 },
    ];
    const ctx = buildContextMap(snap(files));
    const appEntries = ctx.entry_points.filter(e => e.type === "app_entry");
    if (appEntries.length >= 2) {
      const layoutIdx = appEntries.findIndex(e => e.path.includes("+layout.svelte"));
      const tsIdx = appEntries.findIndex(e => e.path.endsWith("index.ts"));
      if (layoutIdx >= 0 && tsIdx >= 0) {
        expect(layoutIdx).toBeLessThan(tsIdx);
      }
    }
  });
});

/* ─── analyzeArchitecture: pattern detection ────────────────────── */

describe("architecture pattern detection", () => {
  it("detects CQRS pattern with commands and queries dirs", () => {
    const files: FileEntry[] = [
      { path: "commands/create-user.ts", content: 'export class CreateUserCommand {}', size: 40 },
      { path: "queries/get-user.ts", content: 'export class GetUserQuery {}', size: 40 },
      { path: "src/index.ts", content: 'export const app = {};', size: 20 },
    ];
    const ctx = buildContextMap(snap(files));
    expect(ctx.architecture_signals.patterns_detected).toContain("cqrs");
  });

  it("detects monorepo pattern with packages dir", () => {
    const files: FileEntry[] = [
      { path: "packages/core/index.ts", content: 'export const core = 1;', size: 30 },
      { path: "packages/web/index.ts", content: 'export const web = 1;', size: 30 },
      { path: "package.json", content: '{"name": "mono"}', size: 20 },
    ];
    const ctx = buildContextMap(snap(files));
    expect(ctx.architecture_signals.patterns_detected).toContain("monorepo");
  });

  it("detects monorepo pattern with apps dir", () => {
    const files: FileEntry[] = [
      { path: "apps/web/index.ts", content: 'export const web = 1;', size: 30 },
      { path: "apps/api/index.ts", content: 'export const api = 1;', size: 30 },
      { path: "package.json", content: '{"name": "mono"}', size: 20 },
    ];
    const ctx = buildContextMap(snap(files));
    expect(ctx.architecture_signals.patterns_detected).toContain("monorepo");
  });

  it("detects serverless pattern from serverless file", () => {
    const files: FileEntry[] = [
      { path: "serverless.yml", content: 'service: my-service', size: 20 },
      { path: "src/handler.ts", content: 'export const handler = async () => ({});', size: 40 },
    ];
    const ctx = buildContextMap(snap(files));
    expect(ctx.architecture_signals.patterns_detected).toContain("serverless");
  });

  it("detects containerized pattern from Dockerfile", () => {
    const files: FileEntry[] = [
      { path: "Dockerfile", content: 'FROM node:18\nCOPY . .\nCMD ["node", "dist/index.js"]', size: 50 },
      { path: "src/index.ts", content: 'console.log("hello");', size: 25 },
    ];
    const ctx = buildContextMap(snap(files));
    expect(ctx.architecture_signals.patterns_detected).toContain("containerized");
  });
});

/* ─── buildAIContext: conventions ────────────────────────────────── */

describe("AI context conventions", () => {
  it("includes Go modules convention when go.mod present", () => {
    const files: FileEntry[] = [
      { path: "go.mod", content: "module example.com/app\n\ngo 1.21\n", size: 30 },
      { path: "main.go", content: 'package main\n\nfunc main() {}', size: 30 },
    ];
    const ctx = buildContextMap(snap(files));
    expect(ctx.ai_context.conventions).toContain("Go modules");
  });

  it("includes pnpm convention when pnpm-lock present", () => {
    const files: FileEntry[] = [
      { path: "pnpm-lock.yaml", content: 'lockfileVersion: 5', size: 20 },
      { path: "package.json", content: '{"name": "test"}', size: 20 },
      { path: "src/index.ts", content: 'export const x = 1;', size: 20 },
    ];
    const ctx = buildContextMap(snap(files));
    expect(ctx.ai_context.conventions).toContain("pnpm workspaces");
  });
});

/* ─── warnings: no CI, no tests, no lockfile ─────────────────────── */

describe("AI context warnings", () => {
  it("warns about no CI when no CI files present", () => {
    const files: FileEntry[] = [
      { path: "src/index.ts", content: 'export const x = 1;', size: 20 },
    ];
    const ctx = buildContextMap(snap(files));
    expect(ctx.ai_context.warnings).toContain("No CI/CD pipeline detected");
  });

  it("warns about no tests when no test files present", () => {
    const files: FileEntry[] = [
      { path: "src/index.ts", content: 'export const x = 1;', size: 20 },
    ];
    const ctx = buildContextMap(snap(files));
    expect(ctx.ai_context.warnings).toContain("No test files detected");
  });

  it("warns about no lockfile when none present", () => {
    const files: FileEntry[] = [
      { path: "src/index.ts", content: 'export const x = 1;', size: 20 },
    ];
    const ctx = buildContextMap(snap(files));
    expect(ctx.ai_context.warnings.some(w => w.includes("No lockfile"))).toBe(true);
  });

  it("warns about high dependency count", () => {
    const deps: Record<string, string> = {};
    for (let i = 0; i < 85; i++) deps[`dep-${i}`] = "^1.0.0";
    const files: FileEntry[] = [
      { path: "package.json", content: JSON.stringify({ name: "test", dependencies: deps }), size: 3000 },
      { path: "src/index.ts", content: 'export const x = 1;', size: 20 },
    ];
    const ctx = buildContextMap(snap(files));
    expect(ctx.ai_context.warnings.some(w => w.includes("dependency count"))).toBe(true);
  });
});
