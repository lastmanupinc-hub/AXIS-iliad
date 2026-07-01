import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import {
  resetTestDb,
  createSnapshot,
  createAccount,
  createApiKey,
  getEventsByType,
  sql,
} from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleListMemory, handleAddMemory } from "./memory-handlers.js";

let server: Server;
let testPort = 0;

interface Res { status: number; data: Record<string, unknown> }

async function req(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined;
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method, headers: { "Content-Type": "application/json", ...headers } },
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
    if (payload) r.write(payload);
    r.end();
  });
}

async function authHeaders(label: string): Promise<{ account_id: string; headers: Record<string, string> }> {
  const acct = await createAccount(`${label} User`, `${label}@memory-test.com`, "paid");
  const key = await createApiKey(acct.account_id, label);
  return { account_id: acct.account_id, headers: { Authorization: `Bearer ${key.rawKey}` } };
}

async function ownedProject(owner: { account_id: string }, name: string): Promise<string> {
  const snap = await createSnapshot(
    { input_method: "api_submission", manifest: { project_name: name, project_type: "web", frameworks: [], goals: [], requested_outputs: [] }, files: [{ path: "a.ts", content: "x", size: 1 }] },
    owner.account_id,
  );
  return snap.project_id;
}

async function anonymousProject(name: string): Promise<string> {
  const snap = await createSnapshot({
    input_method: "api_submission",
    manifest: { project_name: name, project_type: "web", frameworks: [], goals: [], requested_outputs: [] },
    files: [{ path: "a.ts", content: "x", size: 1 }],
  });
  return snap.project_id;
}

beforeAll(async () => {
  await resetTestDb();
  const router = new Router();
  router.get("/v1/projects/:project_id/memory", handleListMemory);
  router.post("/v1/projects/:project_id/memory", handleAddMemory);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

describe("Project memory auth ladder", () => {
  it("401 unauthenticated on both routes", async () => {
    const listRes = await req("GET", "/v1/projects/any/memory");
    expect(listRes.status).toBe(401);
    const postRes = await req("POST", "/v1/projects/any/memory", { kind: "decision", content: "x" });
    expect(postRes.status).toBe(401);
  });

  it("404 for an unknown project", async () => {
    const auth = await authHeaders("ladder-unknown");
    const res = await req("GET", "/v1/projects/nonexistent-project/memory", undefined, auth.headers);
    expect(res.status).toBe(404);
  });

  it("403 for an anonymous (ownerless) project", async () => {
    const auth = await authHeaders("ladder-anon");
    const projectId = await anonymousProject("ladder-anon-proj");
    const res = await req("GET", `/v1/projects/${projectId}/memory`, undefined, auth.headers);
    expect(res.status).toBe(403);
  });

  it("404 for a non-owner (no-leak)", async () => {
    const owner = await authHeaders("ladder-owner");
    const other = await authHeaders("ladder-other");
    const projectId = await ownedProject(owner, "ladder-owned-proj");
    const res = await req("GET", `/v1/projects/${projectId}/memory`, undefined, other.headers);
    expect(res.status).toBe(404);
  });
});

describe("POST /v1/projects/:project_id/memory", () => {
  it("happy path: 201, entry echoes fields, then GET returns it with total: 1", async () => {
    const auth = await authHeaders("post-happy");
    const projectId = await ownedProject(auth, "post-happy-proj");

    const postRes = await req("POST", `/v1/projects/${projectId}/memory`, { kind: "decision", content: "Use Postgres", source: "onboarding" }, auth.headers);
    expect(postRes.status).toBe(201);
    const entry = postRes.data.entry as Record<string, unknown>;
    expect(entry.kind).toBe("decision");
    expect(entry.content).toBe("Use Postgres");
    expect(entry.source).toBe("onboarding");
    expect(entry.project_id).toBe(projectId);
    expect(entry.account_id).toBe(auth.account_id);
    expect(() => new Date(entry.created_at as string).toISOString()).not.toThrow();
    expect(postRes.data.total).toBe(1);

    const getRes = await req("GET", `/v1/projects/${projectId}/memory`, undefined, auth.headers);
    expect(getRes.status).toBe(200);
    expect(getRes.data.total).toBe(1);
    expect(getRes.data.count).toBe(1);
    const entries = getRes.data.entries as Array<Record<string, unknown>>;
    expect(entries[0].content).toBe("Use Postgres");
  });

  it("400 on an invalid kind", async () => {
    const auth = await authHeaders("post-bad-kind");
    const projectId = await ownedProject(auth, "post-bad-kind-proj");
    const res = await req("POST", `/v1/projects/${projectId}/memory`, { kind: "banana", content: "x" }, auth.headers);
    expect(res.status).toBe(400);
  });

  it("400 on empty content", async () => {
    const auth = await authHeaders("post-empty");
    const projectId = await ownedProject(auth, "post-empty-proj");
    const res = await req("POST", `/v1/projects/${projectId}/memory`, { kind: "decision", content: "" }, auth.headers);
    expect(res.status).toBe(400);
  });

  it("400 on content over the 4000-char cap", async () => {
    const auth = await authHeaders("post-content-cap");
    const projectId = await ownedProject(auth, "post-content-cap-proj");
    const res = await req("POST", `/v1/projects/${projectId}/memory`, { kind: "decision", content: "x".repeat(4001) }, auth.headers);
    expect(res.status).toBe(400);
  });

  it("400 on source over the 500-char cap", async () => {
    const auth = await authHeaders("post-source-cap");
    const projectId = await ownedProject(auth, "post-source-cap-proj");
    const res = await req("POST", `/v1/projects/${projectId}/memory`, { kind: "decision", content: "x", source: "s".repeat(501) }, auth.headers);
    expect(res.status).toBe(400);
  });

  it("400 on malformed JSON body", async () => {
    const auth = await authHeaders("post-malformed");
    const projectId = await ownedProject(auth, "post-malformed-proj");
    const res = await req("POST", `/v1/projects/${projectId}/memory`, "{not json", auth.headers);
    expect(res.status).toBe(400);
  });

  it("409 when the project is at the 500-entry cap", async () => {
    const auth = await authHeaders("post-cap");
    const projectId = await ownedProject(auth, "post-cap-proj");

    const now = new Date().toISOString();
    await sql.run(
      `INSERT INTO project_memory (id, project_id, account_id, kind, content, source, created_at)
       SELECT gen_random_uuid()::text, ?, ?, 'decision', 'seed ' || gs, '', ?
       FROM generate_series(1, 500) AS gs`,
      [projectId, auth.account_id, now],
    );

    const res = await req("POST", `/v1/projects/${projectId}/memory`, { kind: "decision", content: "one too many" }, auth.headers);
    expect(res.status).toBe(409);
  });

  it("writes a memory_written funnel event on success", async () => {
    const auth = await authHeaders("post-kpi");
    const projectId = await ownedProject(auth, "post-kpi-proj");
    await req("POST", `/v1/projects/${projectId}/memory`, { kind: "goal", content: "Ship WO-05" }, auth.headers);

    const events = await getEventsByType(auth.account_id, "memory_written");
    expect(events).toHaveLength(1);
    expect(events[0].metadata.project_id).toBe(projectId);
    expect(events[0].metadata.kind).toBe("goal");
  });
});

describe("GET /v1/projects/:project_id/memory", () => {
  it("filters by ?kind= and 400s on an invalid kind", async () => {
    const auth = await authHeaders("get-kind");
    const projectId = await ownedProject(auth, "get-kind-proj");
    await req("POST", `/v1/projects/${projectId}/memory`, { kind: "decision", content: "d1" }, auth.headers);
    await req("POST", `/v1/projects/${projectId}/memory`, { kind: "convention", content: "c1" }, auth.headers);

    const filtered = await req("GET", `/v1/projects/${projectId}/memory?kind=convention`, undefined, auth.headers);
    expect(filtered.status).toBe(200);
    const entries = filtered.data.entries as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("convention");

    const invalid = await req("GET", `/v1/projects/${projectId}/memory?kind=banana`, undefined, auth.headers);
    expect(invalid.status).toBe(400);
  });

  it("400 on ?limit=0, silently caps ?limit=999 at 200", async () => {
    const auth = await authHeaders("get-limit");
    const projectId = await ownedProject(auth, "get-limit-proj");
    await req("POST", `/v1/projects/${projectId}/memory`, { kind: "decision", content: "d1" }, auth.headers);

    const zero = await req("GET", `/v1/projects/${projectId}/memory?limit=0`, undefined, auth.headers);
    expect(zero.status).toBe(400);

    const huge = await req("GET", `/v1/projects/${projectId}/memory?limit=999`, undefined, auth.headers);
    expect(huge.status).toBe(200); // silently capped, not rejected
  });
});
