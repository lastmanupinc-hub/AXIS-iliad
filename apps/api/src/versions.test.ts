import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  resetTestDb,
  createSnapshot,
  saveGenerationVersion,
  listGenerationVersions,
  getGenerationVersion,
  diffGenerationVersions,
} from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleHealthCheck } from "./handlers.js";
import { handleListVersions, handleGetVersion, handleDiffVersions } from "./versions.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;
let snapshotId: string;

interface Res { status: number; headers: Record<string, string>; data: Record<string, unknown> }

async function req(method: string, path: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method, headers: { "Content-Type": "application/json" } },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === "string") h[k] = v;
          }
          resolve({ status: res.statusCode ?? 0, headers: h, data: data as Record<string, unknown> });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();

  const snap = await createSnapshot({
    input_method: "api_submission",
    manifest: { project_name: "version-test", project_type: "web_app", frameworks: [], goals: [], requested_outputs: [] },
    files: [{ path: "index.ts", content: "export default 1;", size: 18 }],
  });
  snapshotId = snap.snapshot_id;

  // Create version history
  await saveGenerationVersion(snapshotId, [
    { path: "AGENTS.md", content: "# Agents v1\nInitial" },
    { path: "CLAUDE.md", content: "# Claude v1" },
  ], "skills");

  await saveGenerationVersion(snapshotId, [
    { path: "AGENTS.md", content: "# Agents v2\nUpdated with new rules" },
    { path: "CLAUDE.md", content: "# Claude v1" },
    { path: "CURSOR.md", content: "# Cursor rules" },
  ], "skills");

  await saveGenerationVersion(snapshotId, [
    { path: "AGENTS.md", content: "# Agents v3\nFinal" },
  ], "skills");

  const router = new Router();
  router.get("/v1/health", handleHealthCheck);
  router.get("/v1/snapshots/:snapshot_id/versions", handleListVersions);
  router.get("/v1/snapshots/:snapshot_id/versions/:version_number", handleGetVersion);
  router.get("/v1/snapshots/:snapshot_id/diff", handleDiffVersions);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

// ─── Unit tests ─────────────────────────────────────────────────

describe("version-store unit tests", () => {
  it("saveGenerationVersion auto-increments version number", async () => {
    const versions = await listGenerationVersions(snapshotId);
    expect(versions.length).toBe(3);
    expect(versions[0]!.version_number).toBe(3); // newest first
    expect(versions[1]!.version_number).toBe(2);
    expect(versions[2]!.version_number).toBe(1);
  });

  it("getGenerationVersion retrieves full file content", async () => {
    const v1 = await getGenerationVersion(snapshotId, 1);
    expect(v1).toBeDefined();
    expect(v1!.files.length).toBe(2);
    expect(v1!.files[0]!.path).toBe("AGENTS.md");
    expect(v1!.files[0]!.content).toContain("v1");
  });

  it("getGenerationVersion returns undefined for nonexistent version", async () => {
    expect(await getGenerationVersion(snapshotId, 99)).toBeUndefined();
  });

  it("diffGenerationVersions detects added files", async () => {
    const diff = (await diffGenerationVersions(snapshotId, 1, 2))!;
    expect(diff).toBeDefined();
    const added = diff.files.filter((f) => f.status === "added");
    expect(added.length).toBe(1);
    expect(added[0]!.path).toBe("CURSOR.md");
  });

  it("diffGenerationVersions detects modified files", async () => {
    const diff = (await diffGenerationVersions(snapshotId, 1, 2))!;
    const modified = diff.files.filter((f) => f.status === "modified");
    expect(modified.length).toBe(1);
    expect(modified[0]!.path).toBe("AGENTS.md");
  });

  it("diffGenerationVersions detects unchanged files", async () => {
    const diff = (await diffGenerationVersions(snapshotId, 1, 2))!;
    const unchanged = diff.files.filter((f) => f.status === "unchanged");
    expect(unchanged.length).toBe(1);
    expect(unchanged[0]!.path).toBe("CLAUDE.md");
  });

  it("diffGenerationVersions detects removed files", async () => {
    const diff = (await diffGenerationVersions(snapshotId, 2, 3))!;
    const removed = diff.files.filter((f) => f.status === "removed");
    expect(removed.length).toBe(2); // CLAUDE.md and CURSOR.md removed
  });

  it("diffGenerationVersions summary is correct", async () => {
    const diff = (await diffGenerationVersions(snapshotId, 1, 2))!;
    expect(diff.summary).toEqual({ added: 1, removed: 0, modified: 1, unchanged: 1 });
  });

  it("diffGenerationVersions returns undefined for missing versions", async () => {
    expect(await diffGenerationVersions(snapshotId, 1, 99)).toBeUndefined();
  });
});

// ─── HTTP tests ─────────────────────────────────────────────────

describe("GET /v1/snapshots/:snapshot_id/versions", () => {
  it("lists all versions for a snapshot", async () => {
    const r = await req("GET", `/v1/snapshots/${snapshotId}/versions`);
    expect(r.status).toBe(200);
    const versions = (r.data as any).versions;
    expect(versions.length).toBe(3);
    expect(versions[0].version_number).toBe(3);
  });

  it("returns 404 for unknown snapshot (no existence leak)", async () => {
    const r = await req("GET", "/v1/snapshots/nonexistent/versions");
    expect(r.status).toBe(404);
  });
});

describe("GET /v1/snapshots/:snapshot_id/versions/:version_number", () => {
  it("returns specific version with file content", async () => {
    const r = await req("GET", `/v1/snapshots/${snapshotId}/versions/1`);
    expect(r.status).toBe(200);
    const version = (r.data as any).version;
    expect(version.version_number).toBe(1);
    expect(version.files.length).toBe(2);
  });

  it("returns 404 for nonexistent version", async () => {
    const r = await req("GET", `/v1/snapshots/${snapshotId}/versions/99`);
    expect(r.status).toBe(404);
  });

  it("returns 400 for invalid version number", async () => {
    const r = await req("GET", `/v1/snapshots/${snapshotId}/versions/abc`);
    expect(r.status).toBe(400);
  });
});

describe("GET /v1/snapshots/:snapshot_id/diff", () => {
  it("returns diff between two versions", async () => {
    const r = await req("GET", `/v1/snapshots/${snapshotId}/diff?old=1&new=2`);
    expect(r.status).toBe(200);
    const diff = (r.data as any).diff;
    expect(diff.summary.added).toBe(1);
    expect(diff.summary.modified).toBe(1);
    expect(diff.summary.unchanged).toBe(1);
  });

  it("returns 400 when missing params", async () => {
    const r = await req("GET", `/v1/snapshots/${snapshotId}/diff?old=1`);
    expect(r.status).toBe(400);
  });

  it("returns 400 when same version", async () => {
    const r = await req("GET", `/v1/snapshots/${snapshotId}/diff?old=1&new=1`);
    expect(r.status).toBe(400);
  });

  it("returns 404 for nonexistent versions", async () => {
    const r = await req("GET", `/v1/snapshots/${snapshotId}/diff?old=1&new=99`);
    expect(r.status).toBe(404);
  });
});
