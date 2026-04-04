import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createSnapshot,
  getSnapshot,
  getProjectSnapshots,
  updateSnapshotStatus,
  saveContextMap,
  getContextMap,
  saveRepoProfile,
  getRepoProfile,
  saveGeneratorResult,
  getGeneratorResult,
} from "./store.js";
import { openMemoryDb, closeDb } from "./db.js";
import type { SnapshotInput } from "./types.js";

function makeInput(overrides?: Partial<SnapshotInput>): SnapshotInput {
  return {
    input_method: "api_submission",
    manifest: {
      project_name: "test-project",
      project_type: "saas_web_app",
      frameworks: ["react"],
      goals: ["test"],
      requested_outputs: ["AGENTS.md"],
    },
    files: [
      { path: "index.ts", content: "console.log('hello')", size: 20 },
    ],
    ...overrides,
  };
}

// Each test gets a fresh in-memory database
beforeEach(() => { openMemoryDb(); });
afterEach(() => { closeDb(); });

describe("SnapshotStore", () => {
  it("creates a snapshot with correct fields", () => {
    const snap = createSnapshot(makeInput());
    expect(snap.snapshot_id).toBeTruthy();
    expect(snap.project_id).toBeTruthy();
    expect(snap.status).toBe("processing");
    expect(snap.file_count).toBe(1);
    expect(snap.manifest.project_name).toBe("test-project");
  });

  it("retrieves a snapshot by ID", () => {
    const snap = createSnapshot(makeInput());
    const found = getSnapshot(snap.snapshot_id);
    expect(found).toBeTruthy();
    expect(found!.snapshot_id).toBe(snap.snapshot_id);
  });

  it("returns undefined for unknown snapshot ID", () => {
    expect(getSnapshot("nonexistent")).toBeUndefined();
  });

  it("updates snapshot status", () => {
    const snap = createSnapshot(makeInput());
    updateSnapshotStatus(snap.snapshot_id, "ready");
    const found = getSnapshot(snap.snapshot_id);
    expect(found!.status).toBe("ready");
  });

  it("indexes snapshots by project", () => {
    const snap1 = createSnapshot(makeInput());
    const snap2 = createSnapshot(makeInput());
    const all = getProjectSnapshots(snap1.project_id);
    expect(all.length).toBe(2);
    expect(all.some(s => s.snapshot_id === snap1.snapshot_id)).toBe(true);
    expect(all.some(s => s.snapshot_id === snap2.snapshot_id)).toBe(true);
  });

  it("computes total_size_bytes from files", () => {
    const snap = createSnapshot(makeInput({
      files: [
        { path: "a.ts", content: "abc", size: 100 },
        { path: "b.ts", content: "def", size: 200 },
      ],
    }));
    expect(snap.total_size_bytes).toBe(300);
    expect(snap.file_count).toBe(2);
  });

  it("persists data round-trip (manifest, files)", () => {
    const snap = createSnapshot(makeInput());
    const found = getSnapshot(snap.snapshot_id)!;
    expect(found.manifest.frameworks).toEqual(["react"]);
    expect(found.files[0].path).toBe("index.ts");
    expect(found.files[0].content).toBe("console.log('hello')");
  });
});

describe("ContextMap persistence", () => {
  it("saves and retrieves context map", () => {
    const snap = createSnapshot(makeInput());
    const ctx = { version: "1.0.0", snapshot_id: snap.snapshot_id, project_id: snap.project_id, project_identity: { name: "test" }, structure: { total_files: 1 } };
    saveContextMap(snap.snapshot_id, ctx);
    const found = getContextMap(snap.snapshot_id);
    expect(found).toEqual(ctx);
  });

  it("returns undefined for missing context map", () => {
    expect(getContextMap("nonexistent")).toBeUndefined();
  });
});

describe("RepoProfile persistence", () => {
  it("saves and retrieves repo profile", () => {
    const snap = createSnapshot(makeInput());
    const profile = { version: "1.0.0", snapshot_id: snap.snapshot_id, project_id: snap.project_id, project: { name: "test" }, health: { has_tests: true } };
    saveRepoProfile(snap.snapshot_id, profile);
    const found = getRepoProfile(snap.snapshot_id);
    expect(found).toEqual(profile);
  });

  it("returns undefined for missing repo profile", () => {
    expect(getRepoProfile("nonexistent")).toBeUndefined();
  });
});

describe("GeneratorResult persistence", () => {
  it("saves and retrieves generator result", () => {
    const snap = createSnapshot(makeInput());
    const result = {
      snapshot_id: snap.snapshot_id,
      generated_at: "2025-01-01T00:00:00Z",
      files: [{ path: "AGENTS.md", content: "# Agents", program: "skills" }],
      skipped: [],
    };
    saveGeneratorResult(snap.snapshot_id, result);
    const found = getGeneratorResult(snap.snapshot_id);
    expect(found).toEqual(result);
  });

  it("returns undefined for missing generator result", () => {
    expect(getGeneratorResult("nonexistent")).toBeUndefined();
  });

  it("overwrites on re-save", () => {
    const snap = createSnapshot(makeInput());
    saveGeneratorResult(snap.snapshot_id, { snapshot_id: snap.snapshot_id, generated_at: "2025-01-01", files: [], v: 1 });
    saveGeneratorResult(snap.snapshot_id, { snapshot_id: snap.snapshot_id, generated_at: "2025-01-02", files: [], v: 2 });
    const found = getGeneratorResult(snap.snapshot_id) as Record<string, unknown>;
    expect(found.v).toBe(2);
  });
});
