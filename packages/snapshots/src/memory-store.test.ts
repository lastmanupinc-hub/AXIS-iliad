import { describe, it, expect, beforeEach } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { runPgMigrations } from "./pg-schema.js";
import { createAccount } from "./billing-store.js";
import { createSnapshot } from "./store.js";
import {
  addMemoryEntry,
  listMemoryEntries,
  countMemoryEntries,
  getMemoryProject,
  MEMORY_KINDS,
} from "./memory-store.js";

beforeEach(async () => {
  await resetTestDb();
});

describe("project_memory migration", () => {
  it("creates the table (fresh path) and rejects an invalid kind via the CHECK constraint", async () => {
    const acct = await createAccount("Mem User", "mem-migration@test.com", "paid");
    const snap = await createSnapshot(
      { input_method: "api_submission", manifest: { project_name: "mem-migration-proj", project_type: "web", frameworks: [], goals: [], requested_outputs: [] }, files: [{ path: "a.ts", content: "x", size: 1 }] },
      acct.account_id,
    );

    await expect(
      sql.run(
        "INSERT INTO project_memory (id, project_id, account_id, kind, content, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ["bad-1", snap.project_id, acct.account_id, "banana", "x", "", new Date().toISOString()],
      ),
    ).rejects.toThrow();
  });

  it("running the migration a second time is idempotent (applied: 0)", async () => {
    const result = await runPgMigrations();
    expect(result).toEqual({ current_version: 30, applied: 0 });
  });
});

describe("addMemoryEntry / listMemoryEntries", () => {
  it("round-trips entries newest-first (created_at DESC, id DESC tiebreak)", async () => {
    const acct = await createAccount("Mem User", "mem-roundtrip@test.com", "paid");
    const snap = await createSnapshot(
      { input_method: "api_submission", manifest: { project_name: "mem-roundtrip-proj", project_type: "web", frameworks: [], goals: [], requested_outputs: [] }, files: [{ path: "a.ts", content: "x", size: 1 }] },
      acct.account_id,
    );

    const e1 = await addMemoryEntry(snap.project_id, acct.account_id, "decision", "Use Postgres, not SQLite");
    const e2 = await addMemoryEntry(snap.project_id, acct.account_id, "convention", "snake_case for SQL columns");

    const entries = await listMemoryEntries(snap.project_id);
    expect(entries.map((e) => e.id)).toEqual([e2.id, e1.id]); // newest first
    expect(entries[0].kind).toBe("convention");
    expect(entries[0].content).toBe("snake_case for SQL columns");
  });

  it("filters by kind and honors the limit", async () => {
    const acct = await createAccount("Mem User", "mem-filter@test.com", "paid");
    const snap = await createSnapshot(
      { input_method: "api_submission", manifest: { project_name: "mem-filter-proj", project_type: "web", frameworks: [], goals: [], requested_outputs: [] }, files: [{ path: "a.ts", content: "x", size: 1 }] },
      acct.account_id,
    );

    for (const kind of MEMORY_KINDS) await addMemoryEntry(snap.project_id, acct.account_id, kind, `entry for ${kind}`);
    await addMemoryEntry(snap.project_id, acct.account_id, "decision", "second decision");

    const decisions = await listMemoryEntries(snap.project_id, { kind: "decision" });
    expect(decisions).toHaveLength(2);
    expect(decisions.every((e) => e.kind === "decision")).toBe(true);

    const limited = await listMemoryEntries(snap.project_id, { limit: 1 });
    expect(limited).toHaveLength(1);
  });

  it("countMemoryEntries counts only that project", async () => {
    const acct = await createAccount("Mem User", "mem-count@test.com", "paid");
    const snapA = await createSnapshot(
      { input_method: "api_submission", manifest: { project_name: "mem-count-proj-a", project_type: "web", frameworks: [], goals: [], requested_outputs: [] }, files: [{ path: "a.ts", content: "x", size: 1 }] },
      acct.account_id,
    );
    const snapB = await createSnapshot(
      { input_method: "api_submission", manifest: { project_name: "mem-count-proj-b", project_type: "web", frameworks: [], goals: [], requested_outputs: [] }, files: [{ path: "a.ts", content: "x", size: 1 }] },
      acct.account_id,
    );

    await addMemoryEntry(snapA.project_id, acct.account_id, "decision", "a1");
    await addMemoryEntry(snapA.project_id, acct.account_id, "decision", "a2");
    await addMemoryEntry(snapB.project_id, acct.account_id, "decision", "b1");

    expect(await countMemoryEntries(snapA.project_id)).toBe(2);
    expect(await countMemoryEntries(snapB.project_id)).toBe(1);
  });
});

describe("getMemoryProject", () => {
  it("returns undefined for a missing project", async () => {
    expect(await getMemoryProject("nonexistent")).toBeUndefined();
  });

  it("returns account_id: null for an anonymous project", async () => {
    const snap = await createSnapshot({
      input_method: "api_submission",
      manifest: { project_name: "mem-anon-proj", project_type: "web", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "a.ts", content: "x", size: 1 }],
    });
    const project = await getMemoryProject(snap.project_id);
    expect(project).toEqual({ project_id: snap.project_id, account_id: null });
  });

  it("returns the owning account_id for an owned project", async () => {
    const acct = await createAccount("Mem User", "mem-owned@test.com", "paid");
    const snap = await createSnapshot(
      { input_method: "api_submission", manifest: { project_name: "mem-owned-proj", project_type: "web", frameworks: [], goals: [], requested_outputs: [] }, files: [{ path: "a.ts", content: "x", size: 1 }] },
      acct.account_id,
    );
    const project = await getMemoryProject(snap.project_id);
    expect(project).toEqual({ project_id: snap.project_id, account_id: acct.account_id });
  });
});
