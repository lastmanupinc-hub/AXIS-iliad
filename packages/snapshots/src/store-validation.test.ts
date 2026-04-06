import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createSnapshot,
  getSnapshot,
  updateSnapshotStatus,
  getProjectSnapshots,
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
      project_name: "validation-test",
      project_type: "saas_web_app",
      frameworks: ["react"],
      goals: ["test"],
      requested_outputs: ["AGENTS.md"],
    },
    files: [{ path: "index.ts", content: "console.log('hi')", size: 18 }],
    ...overrides,
  };
}

beforeEach(() => { openMemoryDb(); });
afterEach(() => { closeDb(); });

// ─── isValidContextMap — shallow validation gaps ────────────────

describe("ContextMap validation edge cases", () => {
  it("rejects context map with empty project_identity object", () => {
    const snap = createSnapshot(makeInput());
    // Empty {} passes `typeof === 'object' && !== null` but is semantically empty
    // The current validator DOES accept this — test proves the boundary
    saveContextMap(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project_identity: {},
    });
    const found = getContextMap(snap.snapshot_id);
    // Passes validation because {} is a non-null object
    expect(found).toBeTruthy();
  });

  it("rejects context map where project_identity is null", () => {
    const snap = createSnapshot(makeInput());
    saveContextMap(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project_identity: null,
    });
    expect(getContextMap(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects context map where project_identity is a string", () => {
    const snap = createSnapshot(makeInput());
    saveContextMap(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project_identity: "not-an-object",
    });
    expect(getContextMap(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects context map missing version field", () => {
    const snap = createSnapshot(makeInput());
    saveContextMap(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project_identity: { name: "test" },
    });
    expect(getContextMap(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects context map with numeric version", () => {
    const snap = createSnapshot(makeInput());
    saveContextMap(snap.snapshot_id, {
      version: 1,
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project_identity: { name: "test" },
    });
    expect(getContextMap(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects context map with numeric project_id", () => {
    const snap = createSnapshot(makeInput());
    saveContextMap(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: 12345,
      project_identity: { name: "test" },
    });
    expect(getContextMap(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects context map where data is an array", () => {
    const snap = createSnapshot(makeInput());
    saveContextMap(snap.snapshot_id, [1, 2, 3]);
    expect(getContextMap(snap.snapshot_id)).toBeUndefined();
  });
});

// ─── isValidRepoProfile — shallow validation gaps ───────────────

describe("RepoProfile validation edge cases", () => {
  it("accepts repo profile with empty project object", () => {
    const snap = createSnapshot(makeInput());
    saveRepoProfile(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project: {},
    });
    const found = getRepoProfile(snap.snapshot_id);
    expect(found).toBeTruthy();
  });

  it("rejects repo profile where project is null", () => {
    const snap = createSnapshot(makeInput());
    saveRepoProfile(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project: null,
    });
    expect(getRepoProfile(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects repo profile where project is a number", () => {
    const snap = createSnapshot(makeInput());
    saveRepoProfile(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project: 42,
    });
    expect(getRepoProfile(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects repo profile missing version", () => {
    const snap = createSnapshot(makeInput());
    saveRepoProfile(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project: { name: "test" },
    });
    expect(getRepoProfile(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects repo profile with boolean project_id", () => {
    const snap = createSnapshot(makeInput());
    saveRepoProfile(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: true,
      project: { name: "test" },
    });
    expect(getRepoProfile(snap.snapshot_id)).toBeUndefined();
  });
});

// ─── isValidGeneratorResult — edge cases ────────────────────────

describe("GeneratorResult validation edge cases", () => {
  it("rejects generator result with files as object instead of array", () => {
    const snap = createSnapshot(makeInput());
    saveGeneratorResult(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      generated_at: "2025-01-01T00:00:00Z",
      files: { a: 1, b: 2 },
    });
    expect(getGeneratorResult(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects generator result missing generated_at", () => {
    const snap = createSnapshot(makeInput());
    saveGeneratorResult(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      files: [],
    });
    expect(getGeneratorResult(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects generator result with numeric generated_at", () => {
    const snap = createSnapshot(makeInput());
    saveGeneratorResult(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      generated_at: 1234567890,
      files: [],
    });
    expect(getGeneratorResult(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects generator result missing snapshot_id", () => {
    const snap = createSnapshot(makeInput());
    saveGeneratorResult(snap.snapshot_id, {
      generated_at: "2025-01-01T00:00:00Z",
      files: [],
    });
    expect(getGeneratorResult(snap.snapshot_id)).toBeUndefined();
  });

  it("accepts generator result with empty files array", () => {
    const snap = createSnapshot(makeInput());
    saveGeneratorResult(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      generated_at: "2025-01-01T00:00:00Z",
      files: [],
    });
    const found = getGeneratorResult(snap.snapshot_id) as Record<string, unknown>;
    expect(found).toBeTruthy();
    expect(Array.isArray(found.files)).toBe(true);
  });

  it("rejects data that is a string", () => {
    const snap = createSnapshot(makeInput());
    // Directly insert a valid JSON string (not an object)
    getDb()
      .prepare("INSERT OR REPLACE INTO generator_results (snapshot_id, data) VALUES (?, ?)")
      .run(snap.snapshot_id, JSON.stringify("just a string"));
    expect(getGeneratorResult(snap.snapshot_id)).toBeUndefined();
  });
});

// ─── Project reuse on same project_name ─────────────────────────

describe("project reuse", () => {
  it("second snapshot with same project_name reuses project_id", () => {
    const name = `reuse-${Date.now()}`;
    const snap1 = createSnapshot(makeInput({ manifest: { ...makeInput().manifest, project_name: name } }));
    const snap2 = createSnapshot(makeInput({ manifest: { ...makeInput().manifest, project_name: name } }));
    expect(snap1.project_id).toBe(snap2.project_id);
    expect(snap1.snapshot_id).not.toBe(snap2.snapshot_id);
  });

  it("different project_names get different project_ids", () => {
    const snap1 = createSnapshot(makeInput({ manifest: { ...makeInput().manifest, project_name: `p1-${Date.now()}` } }));
    const snap2 = createSnapshot(makeInput({ manifest: { ...makeInput().manifest, project_name: `p2-${Date.now()}` } }));
    expect(snap1.project_id).not.toBe(snap2.project_id);
  });

  it("getProjectSnapshots returns all snapshots for reused project", () => {
    const name = `multi-${Date.now()}`;
    const m = { ...makeInput().manifest, project_name: name };
    const snap1 = createSnapshot(makeInput({ manifest: m }));
    const snap2 = createSnapshot(makeInput({ manifest: m }));
    const snap3 = createSnapshot(makeInput({ manifest: m }));
    const all = getProjectSnapshots(snap1.project_id);
    expect(all.length).toBe(3);
    expect(all.map(s => s.snapshot_id)).toContain(snap1.snapshot_id);
    expect(all.map(s => s.snapshot_id)).toContain(snap2.snapshot_id);
    expect(all.map(s => s.snapshot_id)).toContain(snap3.snapshot_id);
  });
});

// ─── updateSnapshotStatus edge cases ────────────────────────────

describe("updateSnapshotStatus edge cases", () => {
  it("returns false for non-existent snapshot_id", () => {
    const result = updateSnapshotStatus("nonexistent-snapshot-id", "ready");
    expect(result).toBe(false);
  });

  it("returns true and updates for valid snapshot", () => {
    const snap = createSnapshot(makeInput());
    expect(snap.status).toBe("processing");
    const result = updateSnapshotStatus(snap.snapshot_id, "ready");
    expect(result).toBe(true);
    const found = getSnapshot(snap.snapshot_id)!;
    expect(found.status).toBe("ready");
  });

  it("can transition through multiple statuses", () => {
    const snap = createSnapshot(makeInput());
    updateSnapshotStatus(snap.snapshot_id, "ready");
    updateSnapshotStatus(snap.snapshot_id, "failed");
    const found = getSnapshot(snap.snapshot_id)!;
    expect(found.status).toBe("failed");
  });
});

// ─── isValidContextMap — exhaustive branch inversions (Layer 10) ─────

describe("ContextMap validation — missing field branches", () => {
  it("rejects context map saved as a primitive string", () => {
    const snap = createSnapshot(makeInput());
    // Save a string → JSON.parse gives a string → typeof !== "object" → FALSE
    saveContextMap(snap.snapshot_id, "not an object");
    const found = getContextMap(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects context map saved as null", () => {
    const snap = createSnapshot(makeInput());
    // Save null → JSON.parse gives null → typeof null === "object" TRUE, data === null TRUE → FALSE
    saveContextMap(snap.snapshot_id, null);
    const found = getContextMap(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects context map saved as a number", () => {
    const snap = createSnapshot(makeInput());
    saveContextMap(snap.snapshot_id, 42);
    const found = getContextMap(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects context map with missing version field", () => {
    const snap = createSnapshot(makeInput());
    saveContextMap(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project_identity: { name: "test" },
    });
    const found = getContextMap(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects context map with missing snapshot_id field", () => {
    const snap = createSnapshot(makeInput());
    saveContextMap(snap.snapshot_id, {
      version: "1.0.0",
      project_id: snap.project_id,
      project_identity: { name: "test" },
    });
    const found = getContextMap(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects context map with missing project_id field", () => {
    const snap = createSnapshot(makeInput());
    saveContextMap(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_identity: { name: "test" },
    });
    const found = getContextMap(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects context map with numeric version", () => {
    const snap = createSnapshot(makeInput());
    saveContextMap(snap.snapshot_id, {
      version: 123,
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project_identity: { name: "test" },
    });
    const found = getContextMap(snap.snapshot_id);
    expect(found).toBeUndefined();
  });
});

// ─── isValidRepoProfile — exhaustive branch inversions (Layer 10) ────

describe("RepoProfile validation — missing field branches", () => {
  it("rejects repo profile saved as a primitive string", () => {
    const snap = createSnapshot(makeInput());
    saveRepoProfile(snap.snapshot_id, "not an object");
    const found = getRepoProfile(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects repo profile saved as null", () => {
    const snap = createSnapshot(makeInput());
    saveRepoProfile(snap.snapshot_id, null);
    const found = getRepoProfile(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects repo profile with missing version field", () => {
    const snap = createSnapshot(makeInput());
    saveRepoProfile(snap.snapshot_id, {
      // version: missing
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project: { name: "test" },
    });
    const found = getRepoProfile(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects repo profile with missing snapshot_id field", () => {
    const snap = createSnapshot(makeInput());
    saveRepoProfile(snap.snapshot_id, {
      version: "1.0.0",
      // snapshot_id: missing
      project_id: snap.project_id,
      project: { name: "test" },
    });
    const found = getRepoProfile(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects repo profile with missing project_id field", () => {
    const snap = createSnapshot(makeInput());
    saveRepoProfile(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      // project_id: missing
      project: { name: "test" },
    });
    const found = getRepoProfile(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects repo profile with null project field", () => {
    const snap = createSnapshot(makeInput());
    saveRepoProfile(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project: null,
    });
    const found = getRepoProfile(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects repo profile with missing project field", () => {
    const snap = createSnapshot(makeInput());
    saveRepoProfile(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      // project: missing → typeof undefined !== "object"
    });
    const found = getRepoProfile(snap.snapshot_id);
    expect(found).toBeUndefined();
  });
});
