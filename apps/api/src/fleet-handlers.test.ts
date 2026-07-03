import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server, IncomingMessage, ServerResponse } from "node:http";
import { resetTestDb, createSnapshot, createAccount, createApiKey, saveContextMap, addMemoryEntry, getEventsByType } from "@axis/snapshots";
import { FLEET_MAX_PROJECTS } from "@axis/generator-core";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleGetFleet, FLEET_SCAN_LIMIT } from "./fleet-handlers.js";

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

async function authHeaders(tier: "free" | "paid" | "suite", label: string): Promise<{ account_id: string; headers: Record<string, string> }> {
  const acct = await createAccount(`${label} User`, `${label}@fleet-test.com`, tier);
  const key = await createApiKey(acct.account_id, label);
  return { account_id: acct.account_id, headers: { Authorization: `Bearer ${key.rawKey}` } };
}

function makeCtx(snap: { snapshot_id: string; project_id: string }, name: string): Record<string, unknown> {
  return {
    version: "1.0.0",
    snapshot_id: snap.snapshot_id,
    project_id: snap.project_id,
    generated_at: new Date().toISOString(),
    project_identity: { name, type: "web", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 1, total_directories: 0, total_loc: 100, file_tree_summary: [], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [],
    routes: [],
    domain_models: [],
    sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
  };
}

async function analyzedProject(owner: { account_id: string }, name: string): Promise<{ project_id: string; snapshot_id: string }> {
  const snap = await createSnapshot(
    { input_method: "api_submission", manifest: { project_name: name, project_type: "web", frameworks: [], goals: [], requested_outputs: [] }, files: [{ path: "a.ts", content: "x", size: 1 }] },
    owner.account_id,
  );
  await saveContextMap(snap.snapshot_id, makeCtx(snap, name));
  return { project_id: snap.project_id, snapshot_id: snap.snapshot_id };
}

beforeAll(async () => {
  await resetTestDb();
  const router = new Router();
  router.get("/v1/account/fleet", handleGetFleet);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

describe("GET /v1/account/fleet", () => {
  it("401 unauthenticated", async () => {
    const res = await req("GET", "/v1/account/fleet");
    expect(res.status).toBe(401);
  });

  it("403 for free tier", async () => {
    const free = await authHeaders("free", "fleet-free");
    const res = await req("GET", "/v1/account/fleet", free.headers);
    expect(res.status).toBe(403);
    expect(res.data.error_code).toBe("TIER_REQUIRED");
  });

  it("200 ready:false for a paid account with fewer than 2 analyzed projects", async () => {
    const paid = await authHeaders("paid", "fleet-solo");
    await analyzedProject(paid, "fleet-solo-proj");

    const res = await req("GET", "/v1/account/fleet", paid.headers);
    expect(res.status).toBe(200);
    expect(res.data.ready).toBe(false);
    expect(res.data.eligible_projects).toBe(1);
    expect(res.data.project_count).toBe(1);
    expect(typeof res.data.reason).toBe("string");
  });

  it("200 ready:true with both files for 2 analyzed projects; a memory decision renders under the right project heading", async () => {
    const paid = await authHeaders("paid", "fleet-ready");
    const projA = await analyzedProject(paid, "fleet-ready-alpha");
    await analyzedProject(paid, "fleet-ready-beta");
    await addMemoryEntry(projA.project_id, paid.account_id, "decision", "Use Postgres, not SQLite");

    const res = await req("GET", "/v1/account/fleet", paid.headers);
    expect(res.status).toBe(200);
    expect(res.data.ready).toBe(true);
    expect(res.data.eligible_projects).toBe(2);

    const files = res.data.files as Array<{ path: string; content: string }>;
    expect(files.find((f) => f.path === "fleet-report.md")).toBeDefined();
    const claude = files.find((f) => f.path === "fleet-CLAUDE.md")!;
    expect(claude.content).toContain("### fleet-ready-alpha");
    expect(claude.content).toContain("Use Postgres, not SQLite");
    expect(claude.content).not.toContain("### fleet-ready-beta"); // beta has no decisions — omitted
  });

  it("another account's projects never leak into the caller's fleet", async () => {
    const paid = await authHeaders("paid", "fleet-isolated");
    await analyzedProject(paid, "fleet-isolated-a");
    await analyzedProject(paid, "fleet-isolated-b");

    const other = await authHeaders("paid", "fleet-other");
    await analyzedProject(other, "fleet-other-secret-project");

    const res = await req("GET", "/v1/account/fleet", paid.headers);
    expect(res.status).toBe(200);
    expect(res.data.ready).toBe(true);
    expect(res.data.eligible_projects).toBe(2);
    const projects = res.data.projects as string[];
    expect(projects).not.toContain("fleet-other-secret-project");
  });

  it("fires fleet_viewed only when ready:true", async () => {
    const soloAcct = await authHeaders("paid", "fleet-event-solo");
    await analyzedProject(soloAcct, "fleet-event-solo-proj");
    await req("GET", "/v1/account/fleet", soloAcct.headers);
    expect(await getEventsByType(soloAcct.account_id, "fleet_viewed")).toHaveLength(0);

    const readyAcct = await authHeaders("paid", "fleet-event-ready");
    await analyzedProject(readyAcct, "fleet-event-ready-a");
    await analyzedProject(readyAcct, "fleet-event-ready-b");
    await req("GET", "/v1/account/fleet", readyAcct.headers);
    expect(await getEventsByType(readyAcct.account_id, "fleet_viewed")).toHaveLength(1);
  });

  // ─── SPEC-10 Fix 5: bound the fleet scan ────────────────────────
  it("bounds the scan to FLEET_SCAN_LIMIT projects examined, not just eligible collected", async () => {
    const paid = await authHeaders("paid", "fleet-scan-bound");
    // Context-less projects (cheapest path — no saveContextMap), named to sort
    // BEFORE the two analyzed projects (listProjectsByAccount orders by name).
    for (let i = 0; i < FLEET_SCAN_LIMIT; i++) {
      await createSnapshot(
        {
          input_method: "api_submission",
          manifest: { project_name: `aaa-scan-${String(i).padStart(3, "0")}`, project_type: "web", frameworks: [], goals: [], requested_outputs: [] },
          files: [{ path: "a.ts", content: "x", size: 1 }],
        },
        paid.account_id,
      );
    }
    await analyzedProject(paid, "zzz-scan-alpha");
    await analyzedProject(paid, "zzz-scan-beta");

    const res = await req("GET", "/v1/account/fleet", paid.headers);
    expect(res.status).toBe(200);
    expect(res.data.ready).toBe(false);
    expect(res.data.eligible_projects).toBe(0);
    expect(res.data.project_count).toBe(FLEET_SCAN_LIMIT + 2);
  }, 30_000);

  it("aborts without writing a response when the response has already ended (dead-response abort)", async () => {
    const paid = await authHeaders("paid", "fleet-dead-response");
    await analyzedProject(paid, "fleet-dead-response-proj"); // >=1 project row so the loop body executes once

    // Node's real IncomingMessage always lowercases header names; since this fake
    // bypasses the HTTP layer entirely, normalize by hand or requireAuth's
    // `req.headers.authorization` lookup won't match.
    const fakeReq = { headers: { authorization: paid.headers.Authorization } } as unknown as IncomingMessage;
    let wrote = false;
    const fakeRes = {
      writableEnded: true, // simulates the router's 408 timeout having already fired
      writeHead: () => { wrote = true; },
      end: () => { wrote = true; },
      setHeader: () => {},
    } as unknown as ServerResponse;

    await expect(handleGetFleet(fakeReq, fakeRes)).resolves.toBeUndefined();
    expect(wrote).toBe(false);
  });

  it("bounds the per-project snapshot walk — a context map deeper than the newest 10 snapshots is not found", async () => {
    const paid = await authHeaders("paid", "fleet-snapshot-bound");
    await analyzedProject(paid, "fleet-snapshot-bound-companion"); // 1 eligible companion

    // Second project: 11 total snapshots; only the OLDEST has a saved context map,
    // 10 newer snapshots (context-less) sit in front of it.
    const deepName = "fleet-snapshot-bound-deep";
    const first = await createSnapshot(
      { input_method: "api_submission", manifest: { project_name: deepName, project_type: "web", frameworks: [], goals: [], requested_outputs: [] }, files: [{ path: "a.ts", content: "x", size: 1 }] },
      paid.account_id,
    );
    await saveContextMap(first.snapshot_id, makeCtx(first, deepName));
    for (let i = 0; i < 10; i++) {
      await createSnapshot(
        { input_method: "api_submission", manifest: { project_name: deepName, project_type: "web", frameworks: [], goals: [], requested_outputs: [] }, files: [{ path: "a.ts", content: "x", size: 1 }] },
        paid.account_id,
      );
    }

    const res = await req("GET", "/v1/account/fleet", paid.headers);
    expect(res.status).toBe(200);
    expect(res.data.ready).toBe(false); // only the companion is eligible — the deep project's context is out of reach
    expect(res.data.eligible_projects).toBe(1);
  });

  it("FLEET_SCAN_LIMIT is never tighter than FLEET_MAX_PROJECTS", () => {
    expect(FLEET_SCAN_LIMIT).toBeGreaterThanOrEqual(FLEET_MAX_PROJECTS);
  });
});
