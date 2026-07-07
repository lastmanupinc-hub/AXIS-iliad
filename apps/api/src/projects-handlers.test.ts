import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { resetTestDb, createSnapshot, createAccount, createApiKey, updateSnapshotStatus } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleListProjects, handleListProjectSnapshots } from "./projects-handlers.js";

let server: Server;
let testPort = 0;

interface Res { status: number; data: Record<string, unknown> }

async function req(method: string, path: string, headers?: Record<string, string>): Promise<Res> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method, headers },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          resolve({ status: res.statusCode ?? 0, data: data as Record<string, unknown> });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

async function authHeaders(label: string): Promise<{ account_id: string; headers: Record<string, string> }> {
  const acct = await createAccount(`${label} User`, `${label}@projects-list-test.com`, "paid");
  const key = await createApiKey(acct.account_id, label);
  return { account_id: acct.account_id, headers: { Authorization: `Bearer ${key.rawKey}` } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeSnapshot(
  owner: { account_id: string },
  opts: { project_name: string; input_method?: "github_repo_url" | "api_submission"; files?: Array<{ path: string; content: string; size: number }> },
): Promise<{ project_id: string; snapshot_id: string }> {
  const snap = await createSnapshot(
    {
      input_method: opts.input_method ?? "api_submission",
      manifest: { project_name: opts.project_name, project_type: "web", frameworks: [], goals: [], requested_outputs: [] },
      files: opts.files ?? [{ path: "a.ts", content: "export const x = 1;", size: 20 }],
    },
    owner.account_id,
  );
  return { project_id: snap.project_id, snapshot_id: snap.snapshot_id };
}

beforeAll(async () => {
  await resetTestDb();
  const router = new Router();
  router.get("/v1/projects", handleListProjects);
  router.get("/v1/projects/:project_id/snapshots", handleListProjectSnapshots);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe("GET /v1/projects (WO-A1)", () => {
  it("401 unauthenticated", async () => {
    const res = await req("GET", "/v1/projects");
    expect(res.status).toBe(401);
  });

  it("200 empty list + total 0 for a fresh account", async () => {
    const owner = await authHeaders("proj-empty");
    const res = await req("GET", "/v1/projects", owner.headers);
    expect(res.status).toBe(200);
    expect(res.data.projects).toEqual([]);
    expect(res.data.total).toBe(0);
  });

  it("200 with one project: full shape incl. compliance_grade and snapshot_count", async () => {
    const owner = await authHeaders("proj-shape");
    const { project_id, snapshot_id } = await makeSnapshot(owner, { project_name: "shape-proj" });

    const res = await req("GET", "/v1/projects", owner.headers);
    expect(res.status).toBe(200);
    expect(res.data.total).toBe(1);
    const projects = res.data.projects as Array<Record<string, unknown>>;
    expect(projects).toHaveLength(1);
    const p = projects[0];
    expect(p.project_id).toBe(project_id);
    expect(p.name).toBe("shape-proj");
    expect(p.github_url).toBeNull(); // api_submission has no derivable URL
    expect(typeof p.created_at).toBe("string");
    expect(p.snapshot_count).toBe(1);

    const latest = p.latest_snapshot as Record<string, unknown>;
    expect(latest.snapshot_id).toBe(snapshot_id);
    expect(latest.status).toBe("processing"); // createSnapshot's default status
    expect(typeof latest.created_at).toBe("string");
    expect(latest.file_count).toBe(1);
    const grade = latest.compliance_grade as Record<string, unknown>;
    expect(typeof grade.grade).toBe("string");
    expect(typeof grade.checks_passed).toBe("number");
    expect(grade.checks_total).toBe(8);
  });

  it("reflects an updated snapshot status", async () => {
    const owner = await authHeaders("proj-status");
    const { snapshot_id } = await makeSnapshot(owner, { project_name: "status-proj" });
    await updateSnapshotStatus(snapshot_id, "ready");

    const res = await req("GET", "/v1/projects", owner.headers);
    const projects = res.data.projects as Array<Record<string, unknown>>;
    const latest = projects[0].latest_snapshot as Record<string, unknown>;
    expect(latest.status).toBe("ready");
  });

  it("derives github_url only for github_repo_url-sourced projects (owner/repo project_name)", async () => {
    const owner = await authHeaders("proj-gh");
    await makeSnapshot(owner, { project_name: "octocat/hello-world", input_method: "github_repo_url" });
    await makeSnapshot(owner, { project_name: "manual-upload-proj", input_method: "api_submission" });

    const res = await req("GET", "/v1/projects", owner.headers);
    const projects = res.data.projects as Array<Record<string, unknown>>;
    const gh = projects.find((p) => p.name === "octocat/hello-world")!;
    const manual = projects.find((p) => p.name === "manual-upload-proj")!;
    expect(gh.github_url).toBe("https://github.com/octocat/hello-world");
    expect(manual.github_url).toBeNull();
  });

  it("snapshot_count counts all snapshots; latest_snapshot + created_at reflect newest/oldest respectively", async () => {
    const owner = await authHeaders("proj-multi-snap");
    const first = await makeSnapshot(owner, { project_name: "multi-snap-proj", files: [{ path: "a.ts", content: "x", size: 1 }] });
    await sleep(10);
    const second = await makeSnapshot(owner, { project_name: "multi-snap-proj", files: [{ path: "a.ts", content: "x", size: 1 }, { path: "b.ts", content: "y", size: 1 }] });

    expect(second.project_id).toBe(first.project_id); // same project_name + account → reused project

    const res = await req("GET", "/v1/projects", owner.headers);
    const projects = res.data.projects as Array<Record<string, unknown>>;
    expect(projects).toHaveLength(1);
    const p = projects[0];
    expect(p.snapshot_count).toBe(2);
    const latest = p.latest_snapshot as Record<string, unknown>;
    expect(latest.snapshot_id).toBe(second.snapshot_id); // newest wins
    expect(latest.file_count).toBe(2);
    expect(p.created_at < (latest.created_at as string)).toBe(true); // project created_at = EARLIEST snapshot
  });

  it("orders projects newest-analyzed-first", async () => {
    const owner = await authHeaders("proj-order");
    await makeSnapshot(owner, { project_name: "order-alpha" });
    await sleep(10);
    await makeSnapshot(owner, { project_name: "order-beta" });
    await sleep(10);
    await makeSnapshot(owner, { project_name: "order-gamma" });

    const res = await req("GET", "/v1/projects", owner.headers);
    const projects = res.data.projects as Array<Record<string, unknown>>;
    expect(projects.map((p) => p.name)).toEqual(["order-gamma", "order-beta", "order-alpha"]);
  });

  it("paginates with limit/offset, total reflects the full count", async () => {
    const owner = await authHeaders("proj-page");
    for (let i = 0; i < 5; i++) {
      await makeSnapshot(owner, { project_name: `page-proj-${i}` });
      await sleep(5);
    }

    const page1 = await req("GET", "/v1/projects?limit=2&offset=0", owner.headers);
    const page2 = await req("GET", "/v1/projects?limit=2&offset=2", owner.headers);
    expect(page1.status).toBe(200);
    expect(page1.data.total).toBe(5);
    expect((page1.data.projects as unknown[]).length).toBe(2);
    expect(page2.data.total).toBe(5);
    expect((page2.data.projects as unknown[]).length).toBe(2);

    const names1 = (page1.data.projects as Array<{ name: string }>).map((p) => p.name);
    const names2 = (page2.data.projects as Array<{ name: string }>).map((p) => p.name);
    expect(names1.some((n) => names2.includes(n))).toBe(false); // no overlap between pages
  });

  it("clamps an out-of-range limit instead of erroring", async () => {
    const owner = await authHeaders("proj-clamp");
    await makeSnapshot(owner, { project_name: "clamp-proj" });

    const res = await req("GET", "/v1/projects?limit=99999", owner.headers);
    expect(res.status).toBe(200);
    expect((res.data.projects as unknown[]).length).toBe(1);
  });

  it("another account's projects never leak into the caller's list", async () => {
    const owner = await authHeaders("proj-isolated");
    await makeSnapshot(owner, { project_name: "isolated-mine" });

    const other = await authHeaders("proj-other");
    await makeSnapshot(other, { project_name: "isolated-other-secret" });

    const res = await req("GET", "/v1/projects", owner.headers);
    const names = (res.data.projects as Array<{ name: string }>).map((p) => p.name);
    expect(names).toEqual(["isolated-mine"]);
  });
});

describe("GET /v1/projects/:project_id/snapshots (WO-A2)", () => {
  it("404 for a project id that was never created", async () => {
    const res = await req("GET", "/v1/projects/00000000-0000-0000-0000-000000000000/snapshots");
    expect(res.status).toBe(404);
  });

  it("200 with full shape for a single-snapshot project (owner authenticated)", async () => {
    const owner = await authHeaders("snaps-shape");
    const { project_id, snapshot_id } = await makeSnapshot(owner, { project_name: "snaps-shape-proj" });

    const res = await req("GET", `/v1/projects/${project_id}/snapshots`, owner.headers);
    expect(res.status).toBe(200);
    expect(res.data.project_id).toBe(project_id);
    expect(res.data.count).toBe(1);
    const snapshots = res.data.snapshots as Array<Record<string, unknown>>;
    expect(snapshots).toHaveLength(1);
    const s = snapshots[0];
    expect(s.snapshot_id).toBe(snapshot_id);
    expect(s.status).toBe("processing"); // createSnapshot's default status
    expect(typeof s.created_at).toBe("string");
    expect(s.file_count).toBe(1);
    const grade = s.compliance_grade as Record<string, unknown>;
    expect(typeof grade.grade).toBe("string");
    expect(grade.checks_total).toBe(8);
  });

  it("reflects an updated snapshot status", async () => {
    const owner = await authHeaders("snaps-status");
    const { project_id, snapshot_id } = await makeSnapshot(owner, { project_name: "snaps-status-proj" });
    await updateSnapshotStatus(snapshot_id, "ready");

    const res = await req("GET", `/v1/projects/${project_id}/snapshots`, owner.headers);
    const snapshots = res.data.snapshots as Array<Record<string, unknown>>;
    expect(snapshots[0].status).toBe("ready");
  });

  it("orders snapshots newest-first (opposite of the store's ASC order)", async () => {
    const owner = await authHeaders("snaps-order");
    const first = await makeSnapshot(owner, { project_name: "snaps-order-proj", files: [{ path: "a.ts", content: "x", size: 1 }] });
    await sleep(10);
    const second = await makeSnapshot(owner, { project_name: "snaps-order-proj", files: [{ path: "a.ts", content: "x", size: 1 }, { path: "b.ts", content: "y", size: 1 }] });
    await sleep(10);
    const third = await makeSnapshot(owner, { project_name: "snaps-order-proj", files: [{ path: "a.ts", content: "x", size: 1 }] });

    const res = await req("GET", `/v1/projects/${first.project_id}/snapshots`, owner.headers);
    expect(res.data.count).toBe(3);
    const ids = (res.data.snapshots as Array<{ snapshot_id: string }>).map((s) => s.snapshot_id);
    expect(ids).toEqual([third.snapshot_id, second.snapshot_id, first.snapshot_id]);
  });

  it("401 unauthenticated for an owned project", async () => {
    const owner = await authHeaders("snaps-401");
    const { project_id } = await makeSnapshot(owner, { project_name: "snaps-401-proj" });

    const res = await req("GET", `/v1/projects/${project_id}/snapshots`);
    expect(res.status).toBe(401);
  });

  it("404 (not 403 — no existence leak) when a different account requests it", async () => {
    const owner = await authHeaders("snaps-owner");
    const { project_id } = await makeSnapshot(owner, { project_name: "snaps-owner-proj" });

    const stranger = await authHeaders("snaps-stranger");
    const res = await req("GET", `/v1/projects/${project_id}/snapshots`, stranger.headers);
    expect(res.status).toBe(404);
  });

  it("200 for an anonymous (no-owner) project without any auth", async () => {
    const snap = await createSnapshot({
      input_method: "api_submission",
      manifest: { project_name: "snaps-anon-proj", project_type: "web", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "a.ts", content: "x", size: 1 }],
    }); // no account_id — anonymous

    const res = await req("GET", `/v1/projects/${snap.project_id}/snapshots`);
    expect(res.status).toBe(200);
    expect(res.data.count).toBe(1);
    const snapshots = res.data.snapshots as Array<{ snapshot_id: string }>;
    expect(snapshots[0].snapshot_id).toBe(snap.snapshot_id);
  });
});
