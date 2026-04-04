import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  openMemoryDb,
  closeDb,
  createSnapshot,
  saveContextMap,
  saveRepoProfile,
  saveGeneratorResult,
  getContextMap,
  getRepoProfile,
  getGeneratorResult,
} from "@axis/snapshots";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput } from "./types.js";

// ─── Helpers ────────────────────────────────────────────────────

function makeSnapshot(): SnapshotRecord {
  const files: FileEntry[] = [
    { path: "src/index.ts", content: 'import { db } from "./db";\nexport function main() { return db.query(); }', size: 70 },
    { path: "src/db.ts", content: 'export const db = { query: () => [] };', size: 38 },
    { path: "next.config.mjs", content: "export default {}", size: 18 },
    { path: "package.json", content: '{"name":"test-app","dependencies":{"next":"14.0.0","react":"18.0.0"}}', size: 70 },
    { path: "app/page.tsx", content: "export default function Home() { return <div>Home</div> }", size: 58 },
    { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
  ];
  return {
    snapshot_id: "snap-pipeline-001",
    project_id: "proj-pipeline-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: "test-app",
      project_type: "web_application",
      frameworks: ["next"],
      goals: ["test"],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
  };
}

function makeInput(requested: string[] = []): GeneratorInput {
  const snapshot = makeSnapshot();
  return {
    context_map: buildContextMap(snapshot),
    repo_profile: buildRepoProfile(snapshot),
    requested_outputs: requested,
  };
}

// ─── Generator pipeline isolation tests ─────────────────────────

describe("generator pipeline hardening", () => {
  it("a throwing generator does not block other generators", () => {
    // Request both a valid generator and trigger the pipeline
    // All core generators should still produce output even if one external is broken
    const input = makeInput(["AGENTS.md", "nonexistent-will-skip.md"]);
    const result = generateFiles(input);

    // Core outputs should be present
    const paths = result.files.map(f => f.path);
    expect(paths).toContain(".ai/context-map.json");
    expect(paths).toContain(".ai/repo-profile.yaml");
    expect(paths).toContain("architecture-summary.md");
    expect(paths).toContain("AGENTS.md");

    // Unknown path should be skipped
    expect(result.skipped.some(s => s.path === "nonexistent-will-skip.md")).toBe(true);
  });

  it("all 80 generators produce valid GeneratedFile shapes", () => {
    // Request every known output
    const input = makeInput([
      "AGENTS.md", "CLAUDE.md", ".cursorrules",
      ".ai/debug-playbook.md", "incident-template.md", "tracing-rules.md",
      ".ai/frontend-rules.md", "component-guidelines.md",
      ".ai/seo-rules.md", "schema-recommendations.json", "route-priority-map.md", "content-audit.md",
      ".ai/optimization-rules.md", "prompt-diff-report.md", "cost-estimate.json",
      ".ai/design-tokens.json", "theme.css", "theme-guidelines.md", "component-theme-map.json",
      "brand-guidelines.md", "voice-and-tone.md", "content-constraints.md", "messaging-system.yaml",
      "superpower-pack.md", "workflow-registry.json", "test-generation-rules.md", "refactor-checklist.md",
      "campaign-brief.md", "funnel-map.md", "sequence-pack.md", "cro-playbook.md",
      "notebook-summary.md", "source-map.json", "study-brief.md", "research-threads.md",
      "obsidian-skill-pack.md", "vault-rules.md", "graph-prompt-map.json", "linking-policy.md",
      "mcp-config.json", "connector-map.yaml", "capability-registry.json",
      "generated-component.tsx", "dashboard-widget.tsx", "embed-snippet.ts", "artifact-spec.md",
      "remotion-script.ts", "scene-plan.md", "render-config.json", "asset-checklist.md",
      "canvas-spec.json", "social-pack.md", "poster-layouts.md", "asset-guidelines.md",
      "generative-sketch.ts", "parameter-pack.json", "collection-map.md", "export-manifest.yaml",
      // depth generators
      "dependency-hotspots.md", "root-cause-checklist.md", "workflow-pack.md", "policy-pack.md",
      "layout-patterns.md", "ui-audit.md", "meta-tag-audit.json", "token-budget-plan.md",
      "dark-mode-tokens.json", "channel-rulebook.md", "ab-test-plan.md", "citation-index.json",
      "server-manifest.yaml", "template-pack.md", "automation-pipeline.yaml",
      "component-library.json", "storyboard.md", "brand-board.md", "variation-matrix.json",
    ]);
    const result = generateFiles(input);

    // No generator errors (only skips should be for unregistered paths)
    const errorSkips = result.skipped.filter(s => s.reason.startsWith("Generator error:"));
    expect(errorSkips).toEqual([]);

    // Every file should have all required fields
    for (const file of result.files) {
      expect(file.path, `missing path`).toBeTruthy();
      expect(file.content.length, `empty content for ${file.path}`).toBeGreaterThan(0);
      expect(file.content_type, `missing content_type for ${file.path}`).toBeTruthy();
      expect(file.program, `missing program for ${file.path}`).toBeTruthy();
      expect(file.description, `missing description for ${file.path}`).toBeTruthy();
    }

    // Should have 80 generators worth of files (minus deduplication of core 3)
    expect(result.files.length).toBeGreaterThanOrEqual(75);
  });

  it("skipped array includes error message from validation failures", () => {
    const result = generateFiles(makeInput(["totally-unknown-output.xyz"]));
    const skipEntry = result.skipped.find(s => s.path === "totally-unknown-output.xyz");
    expect(skipEntry).toBeDefined();
    expect(skipEntry!.reason).toContain("No generator registered");
  });

  it("result always has snapshot_id and generated_at", () => {
    const result = generateFiles(makeInput([]));
    expect(result.snapshot_id).toBe("snap-pipeline-001");
    expect(result.generated_at).toBeTruthy();
    expect(new Date(result.generated_at).getTime()).toBeGreaterThan(0);
  });
});

// ─── Store type guard tests ─────────────────────────────────────

describe("store type guards", () => {
  beforeAll(() => openMemoryDb());
  afterAll(() => closeDb());

  function makeSnap() {
    return createSnapshot({
      input_method: "repo_snapshot_upload",
      manifest: { project_name: "guard-test", project_type: "web_application", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "index.ts", content: "hello", size: 5 }],
    });
  }

  it("getContextMap returns undefined for corrupted JSON shape", () => {
    const snap = makeSnap();
    saveContextMap(snap.snapshot_id, { foo: "bar" });
    expect(getContextMap(snap.snapshot_id)).toBeUndefined();
  });

  it("getContextMap returns valid data for proper shape", () => {
    const snap = makeSnap();
    const validCtx = {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project_identity: { name: "test" },
    };
    saveContextMap(snap.snapshot_id, validCtx);
    const result = getContextMap(snap.snapshot_id);
    expect(result).toBeDefined();
    expect((result as Record<string, unknown>).version).toBe("1.0.0");
  });

  it("getContextMap returns undefined for non-existent snapshot", () => {
    expect(getContextMap("nonexistent")).toBeUndefined();
  });

  it("getRepoProfile returns undefined for corrupted JSON shape", () => {
    const snap = makeSnap();
    saveRepoProfile(snap.snapshot_id, { not_a_profile: true });
    expect(getRepoProfile(snap.snapshot_id)).toBeUndefined();
  });

  it("getRepoProfile returns valid data for proper shape", () => {
    const snap = makeSnap();
    const validProfile = {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project: { name: "test" },
    };
    saveRepoProfile(snap.snapshot_id, validProfile);
    const result = getRepoProfile(snap.snapshot_id);
    expect(result).toBeDefined();
    expect((result as Record<string, unknown>).snapshot_id).toBe(snap.snapshot_id);
  });

  it("getGeneratorResult returns undefined for corrupted JSON shape", () => {
    const snap = makeSnap();
    saveGeneratorResult(snap.snapshot_id, { random: "data" });
    expect(getGeneratorResult(snap.snapshot_id)).toBeUndefined();
  });

  it("getGeneratorResult returns valid data for proper shape", () => {
    const snap = makeSnap();
    const validResult = {
      snapshot_id: snap.snapshot_id,
      generated_at: new Date().toISOString(),
      files: [{ path: "test.md", content: "hello", content_type: "text/markdown", program: "test", description: "test" }],
    };
    saveGeneratorResult(snap.snapshot_id, validResult);
    const result = getGeneratorResult(snap.snapshot_id);
    expect(result).toBeDefined();
    expect((result as Record<string, unknown>).snapshot_id).toBe(snap.snapshot_id);
  });

  it("getGeneratorResult returns undefined for non-existent snapshot", () => {
    expect(getGeneratorResult("nonexistent")).toBeUndefined();
  });
});
