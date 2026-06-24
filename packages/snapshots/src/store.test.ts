import { describe, it, expect, beforeEach } from "vitest";
import {
  createSnapshot,
  getSnapshot,
  getProjectSnapshots,
  getProjectOwner,
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
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { createAccount } from "./billing-store.js";
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
beforeEach(async () => { await resetTestDb(); });

describe("SnapshotStore", () => {
  it("creates a snapshot with correct fields", async () => {
    const snap = await createSnapshot(makeInput());
    expect(snap.snapshot_id).toBeTruthy();
    expect(snap.project_id).toBeTruthy();
    expect(snap.status).toBe("processing");
    expect(snap.file_count).toBe(1);
    expect(snap.manifest.project_name).toBe("test-project");
  });

  it("retrieves a snapshot by ID", async () => {
    const snap = await createSnapshot(makeInput());
    const found = await getSnapshot(snap.snapshot_id);
    expect(found).toBeTruthy();
    expect(found!.snapshot_id).toBe(snap.snapshot_id);
  });

  it("returns undefined for unknown snapshot ID", async () => {
    expect(await getSnapshot("nonexistent")).toBeUndefined();
  });

  it("updates snapshot status", async () => {
    const snap = await createSnapshot(makeInput());
    await updateSnapshotStatus(snap.snapshot_id, "ready");
    const found = await getSnapshot(snap.snapshot_id);
    expect(found!.status).toBe("ready");
  });

  it("indexes snapshots by project", async () => {
    const snap1 = await createSnapshot(makeInput());
    const snap2 = await createSnapshot(makeInput());
    const all = await getProjectSnapshots(snap1.project_id);
    expect(all.length).toBe(2);
    expect(all.some(s => s.snapshot_id === snap1.snapshot_id)).toBe(true);
    expect(all.some(s => s.snapshot_id === snap2.snapshot_id)).toBe(true);
  });

  it("computes total_size_bytes from files", async () => {
    const snap = await createSnapshot(makeInput({
      files: [
        { path: "a.ts", content: "abc", size: 100 },
        { path: "b.ts", content: "def", size: 200 },
      ],
    }));
    expect(snap.total_size_bytes).toBe(300);
    expect(snap.file_count).toBe(2);
  });

  it("persists data round-trip (manifest, files)", async () => {
    const snap = await createSnapshot(makeInput());
    const found = (await getSnapshot(snap.snapshot_id))!;
    expect(found.manifest.frameworks).toEqual(["react"]);
    expect(found.files[0].path).toBe("index.ts");
    expect(found.files[0].content).toBe("console.log('hello')");
  });
});

describe("ContextMap persistence", () => {
  it("saves and retrieves context map", async () => {
    const snap = await createSnapshot(makeInput());
    const ctx = { version: "1.0.0", snapshot_id: snap.snapshot_id, project_id: snap.project_id, project_identity: { name: "test" }, structure: { total_files: 1 } };
    await saveContextMap(snap.snapshot_id, ctx);
    const found = await getContextMap(snap.snapshot_id);
    expect(found).toEqual(ctx);
  });

  it("returns undefined for missing context map", async () => {
    expect(await getContextMap("nonexistent")).toBeUndefined();
  });
});

describe("RepoProfile persistence", () => {
  it("saves and retrieves repo profile", async () => {
    const snap = await createSnapshot(makeInput());
    const profile = { version: "1.0.0", snapshot_id: snap.snapshot_id, project_id: snap.project_id, project: { name: "test" }, health: { has_tests: true } };
    await saveRepoProfile(snap.snapshot_id, profile);
    const found = await getRepoProfile(snap.snapshot_id);
    expect(found).toEqual(profile);
  });

  it("returns undefined for missing repo profile", async () => {
    expect(await getRepoProfile("nonexistent")).toBeUndefined();
  });
});

describe("GeneratorResult persistence", () => {
  it("saves and retrieves generator result", async () => {
    const snap = await createSnapshot(makeInput());
    const result = {
      snapshot_id: snap.snapshot_id,
      generated_at: "2025-01-01T00:00:00Z",
      files: [{ path: "AGENTS.md", content: "# Agents", program: "skills" }],
      skipped: [],
    };
    await saveGeneratorResult(snap.snapshot_id, result);
    const found = await getGeneratorResult(snap.snapshot_id);
    expect(found).toEqual(result);
  });

  it("returns undefined for missing generator result", async () => {
    expect(await getGeneratorResult("nonexistent")).toBeUndefined();
  });

  it("overwrites on re-save", async () => {
    const snap = await createSnapshot(makeInput());
    await saveGeneratorResult(snap.snapshot_id, { snapshot_id: snap.snapshot_id, generated_at: "2025-01-01", files: [], v: 1 });
    await saveGeneratorResult(snap.snapshot_id, { snapshot_id: snap.snapshot_id, generated_at: "2025-01-02", files: [], v: 2 });
    const found = (await getGeneratorResult(snap.snapshot_id)) as Record<string, unknown>;
    expect(found.v).toBe(2);
  });
});

// ─── Corruption resilience ──────────────────────────────────────

describe("snapshot corruption resilience", () => {
  it("getSnapshot returns undefined for corrupted manifest JSON", async () => {
    const snap = await createSnapshot(makeInput());
    // Directly corrupt the manifest column in the database
    await sql.run("UPDATE snapshots SET manifest = ? WHERE snapshot_id = ?", ["not-json{{{", snap.snapshot_id]);
    expect(await getSnapshot(snap.snapshot_id)).toBeUndefined();
  });

  it("getSnapshot returns undefined for corrupted files JSON", async () => {
    const snap = await createSnapshot(makeInput());
    await sql.run("UPDATE snapshots SET files = ? WHERE snapshot_id = ?", ["broken", snap.snapshot_id]);
    expect(await getSnapshot(snap.snapshot_id)).toBeUndefined();
  });

  it("getProjectSnapshots filters out corrupted rows", async () => {
    const snap1 = await createSnapshot(makeInput());
    const snap2 = await createSnapshot(makeInput());
    // Corrupt snap2
    await sql.run("UPDATE snapshots SET manifest = ? WHERE snapshot_id = ?", ["{invalid", snap2.snapshot_id]);
    const results = await getProjectSnapshots(snap1.project_id);
    expect(results).toHaveLength(1);
    expect(results[0].snapshot_id).toBe(snap1.snapshot_id);
  });

  it("getContextMap returns undefined for corrupted data", async () => {
    const snap = await createSnapshot(makeInput());
    await sql.run("INSERT INTO context_maps (snapshot_id, data) VALUES (?, ?) ON CONFLICT (snapshot_id) DO UPDATE SET data = EXCLUDED.data", [snap.snapshot_id, "not-json"]);
    expect(await getContextMap(snap.snapshot_id)).toBeUndefined();
  });

  it("getRepoProfile returns undefined for corrupted data", async () => {
    const snap = await createSnapshot(makeInput());
    await sql.run("INSERT INTO repo_profiles (snapshot_id, data) VALUES (?, ?) ON CONFLICT (snapshot_id) DO UPDATE SET data = EXCLUDED.data", [snap.snapshot_id, "{broken"]);
    expect(await getRepoProfile(snap.snapshot_id)).toBeUndefined();
  });

  it("getGeneratorResult returns undefined for corrupted data", async () => {
    const snap = await createSnapshot(makeInput());
    await sql.run("INSERT INTO generator_results (snapshot_id, data) VALUES (?, ?) ON CONFLICT (snapshot_id) DO UPDATE SET data = EXCLUDED.data", [snap.snapshot_id, "nope"]);
    expect(await getGeneratorResult(snap.snapshot_id)).toBeUndefined();
  });

  // ─── Deletion ───────────────────────────────────────────────

  it("deleteSnapshot removes snapshot and all associated data", async () => {
    const snap = await createSnapshot(makeInput());
    await saveContextMap(snap.snapshot_id, { version: "1", snapshot_id: snap.snapshot_id, project_id: snap.project_id, project_identity: {} });
    await saveRepoProfile(snap.snapshot_id, { version: "1", snapshot_id: snap.snapshot_id, project_id: snap.project_id, project: {} });
    await saveGeneratorResult(snap.snapshot_id, { snapshot_id: snap.snapshot_id, generated_at: "2024-01-01", files: [] });

    expect(await getSnapshot(snap.snapshot_id)).toBeDefined();
    expect(await getContextMap(snap.snapshot_id)).toBeDefined();
    expect(await getRepoProfile(snap.snapshot_id)).toBeDefined();
    expect(await getGeneratorResult(snap.snapshot_id)).toBeDefined();

    const deleted = await deleteSnapshot(snap.snapshot_id);
    expect(deleted).toBe(true);

    expect(await getSnapshot(snap.snapshot_id)).toBeUndefined();
    expect(await getContextMap(snap.snapshot_id)).toBeUndefined();
    expect(await getRepoProfile(snap.snapshot_id)).toBeUndefined();
    expect(await getGeneratorResult(snap.snapshot_id)).toBeUndefined();
  });

  it("deleteSnapshot returns false for non-existent snapshot", async () => {
    expect(await deleteSnapshot("nonexistent")).toBe(false);
  });

  it("deleteProject removes project and all snapshots", async () => {
    const snap1 = await createSnapshot(makeInput());
    const snap2 = await createSnapshot(makeInput()); // same project_name → same project_id
    expect(snap1.project_id).toBe(snap2.project_id);

    const result = await deleteProject(snap1.project_id);
    expect(result.deleted_snapshots).toBe(2);

    expect(await getSnapshot(snap1.snapshot_id)).toBeUndefined();
    expect(await getSnapshot(snap2.snapshot_id)).toBeUndefined();
    expect(await getProjectSnapshots(snap1.project_id)).toEqual([]);

    const proj = await sql.one("SELECT * FROM projects WHERE project_id = ?", [snap1.project_id]);
    expect(proj).toBeUndefined();
  });

  it("deleteProject handles project with no snapshots", async () => {
    await sql.run("INSERT INTO projects (project_id, project_name) VALUES (?, ?)", ["orphan", "Orphan"]);
    const result = await deleteProject("orphan");
    expect(result.deleted_snapshots).toBe(0);
    const proj = await sql.one("SELECT * FROM projects WHERE project_id = ?", ["orphan"]);
    expect(proj).toBeUndefined();
  });

  // ─── getProjectOwner ──────────────────────────────────────────

  it("getProjectOwner returns account_id for existing project", async () => {
    const acct = await createAccount("Owner", "owner@example.com");
    const snap = await createSnapshot(makeInput(), acct.account_id);
    expect(await getProjectOwner(snap.project_id)).toBe(acct.account_id);
  });

  it("getProjectOwner returns null for nonexistent project", async () => {
    expect(await getProjectOwner("nonexistent-project-id")).toBeNull();
  });

  it("getProjectOwner returns null when account_id is NULL", async () => {
    const snap = await createSnapshot(makeInput());
    // account_id defaults to NULL in the projects table
    expect(await getProjectOwner(snap.project_id)).toBeNull();
  });
});
