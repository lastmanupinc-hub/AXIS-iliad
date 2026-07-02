import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  resetTestDb,
  sql,
  createSnapshot,
  getSnapshot,
  getProjectSnapshots,
  saveContextMap,
  saveRepoProfile,
  saveGeneratorResult,
  indexSnapshotContent,
  getSearchIndexStats,
  createAccount,
  createApiKey,
  addMemoryEntry,
  addPersistenceCredits,
  meterPersistenceOp,
  getPersistenceLedger,
} from "@axis/snapshots";
import { Router, sendJSON } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleGetSnapshot, handleDeleteSnapshot, handleDeleteProject } from "./handlers.js";

let server: Server;
let testPort = 0;

interface Res { status: number; headers: Record<string, string>; body: string }

function rawReq(method: string, path: string, headers?: Record<string, string>): Promise<Res> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method, headers },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf-8");
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === "string") h[k] = v;
          }
          resolve({ status: res.statusCode ?? 0, headers: h, body });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

beforeAll(async () => {
  await resetTestDb();
  const router = new Router();
  router.get("/v1/snapshots/:snapshot_id", handleGetSnapshot);
  router.delete("/v1/snapshots/:snapshot_id", handleDeleteSnapshot);
  router.delete("/v1/projects/:project_id", handleDeleteProject);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  server.close();
  await new Promise((r) => setTimeout(r, 100));
});

function createTestSnapshot(projectName: string) {
  return createSnapshot({
    input_method: "api_submission",
    manifest: { project_name: projectName, project_type: "web_app", frameworks: [], goals: [], requested_outputs: [] },
    files: [{ path: "index.ts", content: "export default 1;", size: 18 }],
  });
}

describe("DELETE /v1/snapshots/:snapshot_id", () => {
  it("deletes an existing snapshot", async () => {
    const snap = await createTestSnapshot("del-snap-test");
    await saveContextMap(snap.snapshot_id, { version: "1", snapshot_id: snap.snapshot_id, project_id: snap.project_id, project_identity: {} });
    await saveRepoProfile(snap.snapshot_id, { version: "1", snapshot_id: snap.snapshot_id, project_id: snap.project_id, project: {} });
    await saveGeneratorResult(snap.snapshot_id, { snapshot_id: snap.snapshot_id, generated_at: "2024-01-01", files: [] });
    await indexSnapshotContent(snap.snapshot_id, [{ path: "index.ts", content: "line one\nline two\n" }]);

    // Verify data exists
    expect(await getSnapshot(snap.snapshot_id)).toBeDefined();
    expect((await getSearchIndexStats(snap.snapshot_id)).line_count).toBe(2);

    const res = await rawReq("DELETE", `/v1/snapshots/${snap.snapshot_id}`);
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.deleted).toBe(true);
    expect(data.snapshot_id).toBe(snap.snapshot_id);

    // Verify data is gone
    expect(await getSnapshot(snap.snapshot_id)).toBeUndefined();
    expect((await getSearchIndexStats(snap.snapshot_id)).line_count).toBe(0);
  });

  it("returns 404 for non-existent snapshot", async () => {
    const res = await rawReq("DELETE", "/v1/snapshots/nonexistent-id");
    expect(res.status).toBe(404);
  });
});

describe("DELETE /v1/projects/:project_id", () => {
  it("deletes a project and all its snapshots", async () => {
    const snap1 = await createTestSnapshot("del-proj-test");
    const snap2 = await createSnapshot({
      input_method: "api_submission",
      manifest: { project_name: "del-proj-test", project_type: "web_app", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "b.ts", content: "b", size: 1 }],
    });

    expect(snap1.project_id).toBe(snap2.project_id);
    expect((await getProjectSnapshots(snap1.project_id)).length).toBe(2);

    const res = await rawReq("DELETE", `/v1/projects/${snap1.project_id}`);
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.deleted).toBe(true);
    expect(data.project_id).toBe(snap1.project_id);
    expect(data.deleted_snapshots).toBe(2);

    // Verify all gone
    expect((await getProjectSnapshots(snap1.project_id)).length).toBe(0);
    expect(await getSnapshot(snap1.snapshot_id)).toBeUndefined();
    expect(await getSnapshot(snap2.snapshot_id)).toBeUndefined();

    // Verify project row is deleted
    const proj = await sql.one("SELECT * FROM projects WHERE project_id = ?", [snap1.project_id]);
    expect(proj).toBeUndefined();
  });

  it("returns 404 for non-existent project", async () => {
    const res = await rawReq("DELETE", "/v1/projects/nonexistent-id");
    expect(res.status).toBe(404);
  });

  it("deletes project with zero snapshots", async () => {
    // Create a project directly
    await sql.run("INSERT INTO projects (project_id, project_name) VALUES (?, ?)", ["empty-proj", "Empty Project"]);

    const res = await rawReq("DELETE", "/v1/projects/empty-proj");
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.deleted_snapshots).toBe(0);

    const proj = await sql.one("SELECT * FROM projects WHERE project_id = ?", ["empty-proj"]);
    expect(proj).toBeUndefined();
  });
});

// ─── WO-08 fix 1: delete paths vs the project_memory / persistence_credits FKs ─

describe("DELETE /v1/projects/:project_id with project_memory rows", () => {
  it("deletes cleanly and removes the project's memory entries too", async () => {
    const acct = await createAccount("Delete Memory User", "delete-memory@test.com", "paid");
    const key = await createApiKey(acct.account_id, "test");
    const headers = { Authorization: `Bearer ${key.rawKey}` };
    const snap = await createSnapshot(
      { input_method: "api_submission", manifest: { project_name: "del-memory-proj", project_type: "web_app", frameworks: [], goals: [], requested_outputs: [] }, files: [{ path: "a.ts", content: "x", size: 1 }] },
      acct.account_id,
    );
    await addMemoryEntry(snap.project_id, acct.account_id, "decision", "Use Postgres, not SQLite");
    await addMemoryEntry(snap.project_id, acct.account_id, "convention", "snake_case for SQL columns");

    const before = await sql.many("SELECT * FROM project_memory WHERE project_id = ?", [snap.project_id]);
    expect(before).toHaveLength(2);

    const res = await rawReq("DELETE", `/v1/projects/${snap.project_id}`, headers);
    expect(res.status).toBe(200);

    const after = await sql.many("SELECT * FROM project_memory WHERE project_id = ?", [snap.project_id]);
    expect(after).toHaveLength(0);
    const proj = await sql.one("SELECT * FROM projects WHERE project_id = ?", [snap.project_id]);
    expect(proj).toBeUndefined();
  });
});

describe("Delete paths with a metered (persistence_credits-referenced) snapshot", () => {
  it("DELETE /v1/snapshots/:id deletes cleanly; the ledger row survives with snapshot_id nulled", async () => {
    const acct = await createAccount("Delete Ledger User", "delete-ledger@test.com", "paid");
    const key = await createApiKey(acct.account_id, "test");
    const headers = { Authorization: `Bearer ${key.rawKey}` };
    await addPersistenceCredits(acct.account_id, 5);
    const snap = await createSnapshot(
      { input_method: "api_submission", manifest: { project_name: "del-ledger-snap-proj", project_type: "web_app", frameworks: [], goals: [], requested_outputs: [] }, files: [{ path: "a.ts", content: "x", size: 1 }] },
      acct.account_id,
    );
    await meterPersistenceOp(acct.account_id, "paid", "diff_versions", snap.snapshot_id);

    const res = await rawReq("DELETE", `/v1/snapshots/${snap.snapshot_id}`, headers);
    expect(res.status).toBe(200);
    expect(await getSnapshot(snap.snapshot_id)).toBeUndefined();

    // addPersistenceCredits already wrote a "purchase" row (snapshot_id: null); the
    // debit is the "diff_versions" row — it must survive the delete, snapshot_id nulled.
    const ledger = await getPersistenceLedger(acct.account_id);
    const spend = ledger.find((e) => e.operation === "diff_versions");
    expect(spend).toBeDefined();
    expect(spend!.snapshot_id).toBeNull();
  });

  it("DELETE /v1/projects/:id deletes cleanly; the ledger row survives with snapshot_id nulled", async () => {
    const acct = await createAccount("Delete Ledger Proj User", "delete-ledger-proj@test.com", "paid");
    const key = await createApiKey(acct.account_id, "test");
    const headers = { Authorization: `Bearer ${key.rawKey}` };
    await addPersistenceCredits(acct.account_id, 5);
    const snap = await createSnapshot(
      { input_method: "api_submission", manifest: { project_name: "del-ledger-proj-proj", project_type: "web_app", frameworks: [], goals: [], requested_outputs: [] }, files: [{ path: "a.ts", content: "x", size: 1 }] },
      acct.account_id,
    );
    await meterPersistenceOp(acct.account_id, "paid", "diff_versions", snap.snapshot_id);

    const res = await rawReq("DELETE", `/v1/projects/${snap.project_id}`, headers);
    expect(res.status).toBe(200);

    const ledger = await getPersistenceLedger(acct.account_id);
    const spend = ledger.find((e) => e.operation === "diff_versions");
    expect(spend).toBeDefined();
    expect(spend!.snapshot_id).toBeNull();
  });
});
