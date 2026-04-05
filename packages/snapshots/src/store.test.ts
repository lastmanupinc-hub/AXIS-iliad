import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createSnapshot,
  getSnapshot,
  getProjectSnapshots,
  updateSnapshotStatus,
  deleteSnapshot,
  deleteProject,
  saveContextMap,
  getContextMap,
  saveRepoProfile,
  getRepoProfile,
  saveGeneratorResult,
  getGeneratorResult,
} from "./store.js";
import { openMemoryDb, closeDb, getDb } from "./db.js";
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

// ─── Corruption resilience ──────────────────────────────────────

describe("snapshot corruption resilience", () => {
  it("getSnapshot returns undefined for corrupted manifest JSON", () => {
    const snap = createSnapshot(makeInput());
    // Directly corrupt the manifest column in the database
    getDb().prepare("UPDATE snapshots SET manifest = ? WHERE snapshot_id = ?").run("not-json{{{", snap.snapshot_id);
    expect(getSnapshot(snap.snapshot_id)).toBeUndefined();
  });

  it("getSnapshot returns undefined for corrupted files JSON", () => {
    const snap = createSnapshot(makeInput());
    getDb().prepare("UPDATE snapshots SET files = ? WHERE snapshot_id = ?").run("broken", snap.snapshot_id);
    expect(getSnapshot(snap.snapshot_id)).toBeUndefined();
  });

  it("getProjectSnapshots filters out corrupted rows", () => {
    const snap1 = createSnapshot(makeInput());
    const snap2 = createSnapshot(makeInput());
    // Corrupt snap2
    getDb().prepare("UPDATE snapshots SET manifest = ? WHERE snapshot_id = ?").run("{invalid", snap2.snapshot_id);
    const results = getProjectSnapshots(snap1.project_id);
    expect(results).toHaveLength(1);
    expect(results[0].snapshot_id).toBe(snap1.snapshot_id);
  });

  it("getContextMap returns undefined for corrupted data", () => {
    const snap = createSnapshot(makeInput());
    getDb().prepare("INSERT OR REPLACE INTO context_maps (snapshot_id, data) VALUES (?, ?)").run(snap.snapshot_id, "not-json");
    expect(getContextMap(snap.snapshot_id)).toBeUndefined();
  });

  it("getRepoProfile returns undefined for corrupted data", () => {
    const snap = createSnapshot(makeInput());
    getDb().prepare("INSERT OR REPLACE INTO repo_profiles (snapshot_id, data) VALUES (?, ?)").run(snap.snapshot_id, "{broken");
    expect(getRepoProfile(snap.snapshot_id)).toBeUndefined();
  });

  it("getGeneratorResult returns undefined for corrupted data", () => {
    const snap = createSnapshot(makeInput());
    getDb().prepare("INSERT OR REPLACE INTO generator_results (snapshot_id, data) VALUES (?, ?)").run(snap.snapshot_id, "nope");
    expect(getGeneratorResult(snap.snapshot_id)).toBeUndefined();
  });

  // ─── Deletion ───────────────────────────────────────────────

  it("deleteSnapshot removes snapshot and all associated data", () => {
    const snap = createSnapshot(makeInput());
    saveContextMap(snap.snapshot_id, { version: "1", snapshot_id: snap.snapshot_id, project_id: snap.project_id, project_identity: {} });
    saveRepoProfile(snap.snapshot_id, { version: "1", snapshot_id: snap.snapshot_id, project_id: snap.project_id, project: {} });
    saveGeneratorResult(snap.snapshot_id, { snapshot_id: snap.snapshot_id, generated_at: "2024-01-01", files: [] });

    expect(getSnapshot(snap.snapshot_id)).toBeDefined();
    expect(getContextMap(snap.snapshot_id)).toBeDefined();
    expect(getRepoProfile(snap.snapshot_id)).toBeDefined();
    expect(getGeneratorResult(snap.snapshot_id)).toBeDefined();

    const deleted = deleteSnapshot(snap.snapshot_id);
    expect(deleted).toBe(true);

    expect(getSnapshot(snap.snapshot_id)).toBeUndefined();
    expect(getContextMap(snap.snapshot_id)).toBeUndefined();
    expect(getRepoProfile(snap.snapshot_id)).toBeUndefined();
    expect(getGeneratorResult(snap.snapshot_id)).toBeUndefined();
  });

  it("deleteSnapshot returns false for non-existent snapshot", () => {
    expect(deleteSnapshot("nonexistent")).toBe(false);
  });

  it("deleteProject removes project and all snapshots", () => {
    const snap1 = createSnapshot(makeInput());
    const snap2 = createSnapshot(makeInput()); // same project_name → same project_id
    expect(snap1.project_id).toBe(snap2.project_id);

    const result = deleteProject(snap1.project_id);
    expect(result.deleted_snapshots).toBe(2);

    expect(getSnapshot(snap1.snapshot_id)).toBeUndefined();
    expect(getSnapshot(snap2.snapshot_id)).toBeUndefined();
    expect(getProjectSnapshots(snap1.project_id)).toEqual([]);

    const proj = getDb().prepare("SELECT * FROM projects WHERE project_id = ?").get(snap1.project_id);
    expect(proj).toBeUndefined();
  });

  it("deleteProject handles project with no snapshots", () => {
    const db = getDb();
    db.prepare("INSERT INTO projects (project_id, project_name) VALUES (?, ?)").run("orphan", "Orphan");
    const result = deleteProject("orphan");
    expect(result.deleted_snapshots).toBe(0);
    const proj = db.prepare("SELECT * FROM projects WHERE project_id = ?").get("orphan");
    expect(proj).toBeUndefined();
  });
});
