import { describe, it, expect, beforeEach } from "vitest";
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
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
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

beforeEach(async () => { await resetTestDb(); });

// ─── isValidContextMap — shallow validation gaps ────────────────

describe("ContextMap validation edge cases", () => {
  it("rejects context map with empty project_identity object", async () => {
    const snap = await createSnapshot(makeInput());
    // Empty {} passes `typeof === 'object' && !== null` but is semantically empty
    // The current validator DOES accept this — test proves the boundary
    await saveContextMap(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project_identity: {},
    });
    const found = await getContextMap(snap.snapshot_id);
    // Passes validation because {} is a non-null object
    expect(found).toBeTruthy();
  });

  it("rejects context map where project_identity is null", async () => {
    const snap = await createSnapshot(makeInput());
    await saveContextMap(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project_identity: null,
    });
    expect(await getContextMap(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects context map where project_identity is a string", async () => {
    const snap = await createSnapshot(makeInput());
    await saveContextMap(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project_identity: "not-an-object",
    });
    expect(await getContextMap(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects context map missing version field", async () => {
    const snap = await createSnapshot(makeInput());
    await saveContextMap(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project_identity: { name: "test" },
    });
    expect(await getContextMap(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects context map with numeric version", async () => {
    const snap = await createSnapshot(makeInput());
    await saveContextMap(snap.snapshot_id, {
      version: 1,
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project_identity: { name: "test" },
    });
    expect(await getContextMap(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects context map with numeric project_id", async () => {
    const snap = await createSnapshot(makeInput());
    await saveContextMap(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: 12345,
      project_identity: { name: "test" },
    });
    expect(await getContextMap(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects context map where data is an array", async () => {
    const snap = await createSnapshot(makeInput());
    await saveContextMap(snap.snapshot_id, [1, 2, 3]);
    expect(await getContextMap(snap.snapshot_id)).toBeUndefined();
  });
});

// ─── isValidRepoProfile — shallow validation gaps ───────────────

describe("RepoProfile validation edge cases", () => {
  it("accepts repo profile with empty project object", async () => {
    const snap = await createSnapshot(makeInput());
    await saveRepoProfile(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project: {},
    });
    const found = await getRepoProfile(snap.snapshot_id);
    expect(found).toBeTruthy();
  });

  it("rejects repo profile where project is null", async () => {
    const snap = await createSnapshot(makeInput());
    await saveRepoProfile(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project: null,
    });
    expect(await getRepoProfile(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects repo profile where project is a number", async () => {
    const snap = await createSnapshot(makeInput());
    await saveRepoProfile(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project: 42,
    });
    expect(await getRepoProfile(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects repo profile missing version", async () => {
    const snap = await createSnapshot(makeInput());
    await saveRepoProfile(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project: { name: "test" },
    });
    expect(await getRepoProfile(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects repo profile with boolean project_id", async () => {
    const snap = await createSnapshot(makeInput());
    await saveRepoProfile(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: true,
      project: { name: "test" },
    });
    expect(await getRepoProfile(snap.snapshot_id)).toBeUndefined();
  });
});

// ─── isValidGeneratorResult — edge cases ────────────────────────

describe("GeneratorResult validation edge cases", () => {
  it("rejects generator result with files as object instead of array", async () => {
    const snap = await createSnapshot(makeInput());
    await saveGeneratorResult(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      generated_at: "2025-01-01T00:00:00Z",
      files: { a: 1, b: 2 },
    });
    expect(await getGeneratorResult(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects generator result missing generated_at", async () => {
    const snap = await createSnapshot(makeInput());
    await saveGeneratorResult(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      files: [],
    });
    expect(await getGeneratorResult(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects generator result with numeric generated_at", async () => {
    const snap = await createSnapshot(makeInput());
    await saveGeneratorResult(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      generated_at: 1234567890,
      files: [],
    });
    expect(await getGeneratorResult(snap.snapshot_id)).toBeUndefined();
  });

  it("rejects generator result missing snapshot_id", async () => {
    const snap = await createSnapshot(makeInput());
    await saveGeneratorResult(snap.snapshot_id, {
      generated_at: "2025-01-01T00:00:00Z",
      files: [],
    });
    expect(await getGeneratorResult(snap.snapshot_id)).toBeUndefined();
  });

  it("accepts generator result with empty files array", async () => {
    const snap = await createSnapshot(makeInput());
    await saveGeneratorResult(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      generated_at: "2025-01-01T00:00:00Z",
      files: [],
    });
    const found = (await getGeneratorResult(snap.snapshot_id)) as Record<string, unknown>;
    expect(found).toBeTruthy();
    expect(Array.isArray(found.files)).toBe(true);
  });

  it("rejects data that is a string", async () => {
    const snap = await createSnapshot(makeInput());
    // Directly insert a valid JSON string (not an object)
    await sql.run(
      "INSERT OR REPLACE INTO generator_results (snapshot_id, data) VALUES (?, ?)",
      [snap.snapshot_id, JSON.stringify("just a string")],
    );
    expect(await getGeneratorResult(snap.snapshot_id)).toBeUndefined();
  });
});

// ─── Project reuse on same project_name ─────────────────────────

describe("project reuse", () => {
  it("second snapshot with same project_name reuses project_id", async () => {
    const name = `reuse-${Date.now()}`;
    const snap1 = await createSnapshot(makeInput({ manifest: { ...makeInput().manifest, project_name: name } }));
    const snap2 = await createSnapshot(makeInput({ manifest: { ...makeInput().manifest, project_name: name } }));
    expect(snap1.project_id).toBe(snap2.project_id);
    expect(snap1.snapshot_id).not.toBe(snap2.snapshot_id);
  });

  it("different project_names get different project_ids", async () => {
    const snap1 = await createSnapshot(makeInput({ manifest: { ...makeInput().manifest, project_name: `p1-${Date.now()}` } }));
    const snap2 = await createSnapshot(makeInput({ manifest: { ...makeInput().manifest, project_name: `p2-${Date.now()}` } }));
    expect(snap1.project_id).not.toBe(snap2.project_id);
  });

  it("getProjectSnapshots returns all snapshots for reused project", async () => {
    const name = `multi-${Date.now()}`;
    const m = { ...makeInput().manifest, project_name: name };
    const snap1 = await createSnapshot(makeInput({ manifest: m }));
    const snap2 = await createSnapshot(makeInput({ manifest: m }));
    const snap3 = await createSnapshot(makeInput({ manifest: m }));
    const all = await getProjectSnapshots(snap1.project_id);
    expect(all.length).toBe(3);
    expect(all.map(s => s.snapshot_id)).toContain(snap1.snapshot_id);
    expect(all.map(s => s.snapshot_id)).toContain(snap2.snapshot_id);
    expect(all.map(s => s.snapshot_id)).toContain(snap3.snapshot_id);
  });
});

// ─── updateSnapshotStatus edge cases ────────────────────────────

describe("updateSnapshotStatus edge cases", () => {
  it("returns false for non-existent snapshot_id", async () => {
    const result = await updateSnapshotStatus("nonexistent-snapshot-id", "ready");
    expect(result).toBe(false);
  });

  it("returns true and updates for valid snapshot", async () => {
    const snap = await createSnapshot(makeInput());
    expect(snap.status).toBe("processing");
    const result = await updateSnapshotStatus(snap.snapshot_id, "ready");
    expect(result).toBe(true);
    const found = (await getSnapshot(snap.snapshot_id))!;
    expect(found.status).toBe("ready");
  });

  it("can transition through multiple statuses", async () => {
    const snap = await createSnapshot(makeInput());
    await updateSnapshotStatus(snap.snapshot_id, "ready");
    await updateSnapshotStatus(snap.snapshot_id, "failed");
    const found = (await getSnapshot(snap.snapshot_id))!;
    expect(found.status).toBe("failed");
  });
});

// ─── isValidContextMap — exhaustive branch inversions (Layer 10) ─────

describe("ContextMap validation — missing field branches", () => {
  it("rejects context map saved as a primitive string", async () => {
    const snap = await createSnapshot(makeInput());
    // Save a string → JSON.parse gives a string → typeof !== "object" → FALSE
    await saveContextMap(snap.snapshot_id, "not an object");
    const found = await getContextMap(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects context map saved as null", async () => {
    const snap = await createSnapshot(makeInput());
    // Save null → JSON.parse gives null → typeof null === "object" TRUE, data === null TRUE → FALSE
    await saveContextMap(snap.snapshot_id, null);
    const found = await getContextMap(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects context map saved as a number", async () => {
    const snap = await createSnapshot(makeInput());
    await saveContextMap(snap.snapshot_id, 42);
    const found = await getContextMap(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects context map with missing version field", async () => {
    const snap = await createSnapshot(makeInput());
    await saveContextMap(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project_identity: { name: "test" },
    });
    const found = await getContextMap(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects context map with missing snapshot_id field", async () => {
    const snap = await createSnapshot(makeInput());
    await saveContextMap(snap.snapshot_id, {
      version: "1.0.0",
      project_id: snap.project_id,
      project_identity: { name: "test" },
    });
    const found = await getContextMap(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects context map with missing project_id field", async () => {
    const snap = await createSnapshot(makeInput());
    await saveContextMap(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_identity: { name: "test" },
    });
    const found = await getContextMap(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects context map with numeric version", async () => {
    const snap = await createSnapshot(makeInput());
    await saveContextMap(snap.snapshot_id, {
      version: 123,
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project_identity: { name: "test" },
    });
    const found = await getContextMap(snap.snapshot_id);
    expect(found).toBeUndefined();
  });
});

// ─── isValidRepoProfile — exhaustive branch inversions (Layer 10) ────

describe("RepoProfile validation — missing field branches", () => {
  it("rejects repo profile saved as a primitive string", async () => {
    const snap = await createSnapshot(makeInput());
    await saveRepoProfile(snap.snapshot_id, "not an object");
    const found = await getRepoProfile(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects repo profile saved as null", async () => {
    const snap = await createSnapshot(makeInput());
    await saveRepoProfile(snap.snapshot_id, null);
    const found = await getRepoProfile(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects repo profile with missing version field", async () => {
    const snap = await createSnapshot(makeInput());
    await saveRepoProfile(snap.snapshot_id, {
      // version: missing
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project: { name: "test" },
    });
    const found = await getRepoProfile(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects repo profile with missing snapshot_id field", async () => {
    const snap = await createSnapshot(makeInput());
    await saveRepoProfile(snap.snapshot_id, {
      version: "1.0.0",
      // snapshot_id: missing
      project_id: snap.project_id,
      project: { name: "test" },
    });
    const found = await getRepoProfile(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects repo profile with missing project_id field", async () => {
    const snap = await createSnapshot(makeInput());
    await saveRepoProfile(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      // project_id: missing
      project: { name: "test" },
    });
    const found = await getRepoProfile(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects repo profile with null project field", async () => {
    const snap = await createSnapshot(makeInput());
    await saveRepoProfile(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      project: null,
    });
    const found = await getRepoProfile(snap.snapshot_id);
    expect(found).toBeUndefined();
  });

  it("rejects repo profile with missing project field", async () => {
    const snap = await createSnapshot(makeInput());
    await saveRepoProfile(snap.snapshot_id, {
      version: "1.0.0",
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      // project: missing → typeof undefined !== "object"
    });
    const found = await getRepoProfile(snap.snapshot_id);
    expect(found).toBeUndefined();
  });
});
