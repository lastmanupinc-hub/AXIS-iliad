import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  openMemoryDb,
  closeDb,
  createSnapshot,
  getSnapshot,
  getProjectSnapshots,
  saveContextMap,
  saveRepoProfile,
  saveGeneratorResult,
  indexSnapshotContent,
  getSearchIndexStats,
  getDb,
} from "@axis/snapshots";
import { Router, createApp, sendJSON } from "./router.js";
import { handleGetSnapshot, handleDeleteSnapshot, handleDeleteProject } from "./handlers.js";

const TEST_PORT = 44427;
let server: Server;

interface Res { status: number; headers: Record<string, string>; body: string }

function rawReq(method: string, path: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: TEST_PORT, path, method },
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
  openMemoryDb();
  const router = new Router();
  router.get("/v1/snapshots/:snapshot_id", handleGetSnapshot);
  router.delete("/v1/snapshots/:snapshot_id", handleDeleteSnapshot);
  router.delete("/v1/projects/:project_id", handleDeleteProject);
  server = createApp(router, TEST_PORT);
  await new Promise((r) => setTimeout(r, 200));
});

afterAll(async () => {
  server.close();
  closeDb();
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
    const snap = createTestSnapshot("del-snap-test");
    saveContextMap(snap.snapshot_id, { version: "1", snapshot_id: snap.snapshot_id, project_id: snap.project_id, project_identity: {} });
    saveRepoProfile(snap.snapshot_id, { version: "1", snapshot_id: snap.snapshot_id, project_id: snap.project_id, project: {} });
    saveGeneratorResult(snap.snapshot_id, { snapshot_id: snap.snapshot_id, generated_at: "2024-01-01", files: [] });
    indexSnapshotContent(snap.snapshot_id, [{ path: "index.ts", content: "line one\nline two\n" }]);

    // Verify data exists
    expect(getSnapshot(snap.snapshot_id)).toBeDefined();
    expect(getSearchIndexStats(snap.snapshot_id).line_count).toBe(2);

    const res = await rawReq("DELETE", `/v1/snapshots/${snap.snapshot_id}`);
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.deleted).toBe(true);
    expect(data.snapshot_id).toBe(snap.snapshot_id);

    // Verify data is gone
    expect(getSnapshot(snap.snapshot_id)).toBeUndefined();
    expect(getSearchIndexStats(snap.snapshot_id).line_count).toBe(0);
  });

  it("returns 404 for non-existent snapshot", async () => {
    const res = await rawReq("DELETE", "/v1/snapshots/nonexistent-id");
    expect(res.status).toBe(404);
  });
});

describe("DELETE /v1/projects/:project_id", () => {
  it("deletes a project and all its snapshots", async () => {
    const snap1 = createTestSnapshot("del-proj-test");
    const snap2 = createSnapshot({
      input_method: "api_submission",
      manifest: { project_name: "del-proj-test", project_type: "web_app", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "b.ts", content: "b", size: 1 }],
    });

    expect(snap1.project_id).toBe(snap2.project_id);
    expect(getProjectSnapshots(snap1.project_id).length).toBe(2);

    const res = await rawReq("DELETE", `/v1/projects/${snap1.project_id}`);
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.deleted).toBe(true);
    expect(data.project_id).toBe(snap1.project_id);
    expect(data.deleted_snapshots).toBe(2);

    // Verify all gone
    expect(getProjectSnapshots(snap1.project_id).length).toBe(0);
    expect(getSnapshot(snap1.snapshot_id)).toBeUndefined();
    expect(getSnapshot(snap2.snapshot_id)).toBeUndefined();

    // Verify project row is deleted
    const db = getDb();
    const proj = db.prepare("SELECT * FROM projects WHERE project_id = ?").get(snap1.project_id);
    expect(proj).toBeUndefined();
  });

  it("returns 404 for non-existent project", async () => {
    const res = await rawReq("DELETE", "/v1/projects/nonexistent-id");
    expect(res.status).toBe(404);
  });

  it("deletes project with zero snapshots", async () => {
    // Create a project directly
    const db = getDb();
    db.prepare("INSERT INTO projects (project_id, project_name) VALUES (?, ?)").run("empty-proj", "Empty Project");

    const res = await rawReq("DELETE", "/v1/projects/empty-proj");
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.deleted_snapshots).toBe(0);

    const proj = db.prepare("SELECT * FROM projects WHERE project_id = ?").get("empty-proj");
    expect(proj).toBeUndefined();
  });
});
