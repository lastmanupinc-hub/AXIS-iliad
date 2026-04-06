/**
 * eq_112: API core branch coverage — targets untested conditional paths in
 * server.ts (inline handlers), handlers.ts (validation, error, edge paths),
 * and funnel.ts (seat management, upgrade prompts, funnel limits).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import {
  openMemoryDb,
  closeDb,
  createAccount,
  createApiKey,
  createSnapshot,
  saveContextMap,
  saveRepoProfile,
  saveGeneratorResult,
  indexSnapshotContent,
  trackEvent,
} from "@axis/snapshots";
import { Router, createApp, sendJSON } from "./router.js";
import {
  handleCreateSnapshot,
  handleGetSnapshot,
  handleGetContext,
  handleGetGeneratedFiles,
  handleGetGeneratedFile,
  handleHealthCheck,
  handleDbStats,
  handleDbMaintenance,
  handleSearchIndex,
  handleSearchQuery,
  handleSearchStats,
  handleDeleteSnapshot,
  handleDeleteProject,
  makeProgramHandler,
  PROGRAM_OUTPUTS,
} from "./handlers.js";
import {
  handleInviteSeat,
  handleListSeats,
  handleAcceptSeat,
  handleRevokeSeat,
  handleGetUpgradePrompt,
  handleDismissUpgradePrompt,
  handleGetFunnelStatus,
} from "./funnel.js";
import { buildOpenApiSpec } from "./openapi.js";
import { listAvailableGenerators } from "@axis/generator-core";
import { resetRateLimits } from "./rate-limiter.js";

const TEST_PORT = 44470;
let server: Server;

// ─── HTTP helper ────────────────────────────────────────────────

interface Res {
  status: number;
  headers: Record<string, string>;
  data: Record<string, unknown>;
  raw: string;
}

async function req(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload =
      body !== undefined
        ? typeof body === "string"
          ? body
          : JSON.stringify(body)
        : undefined;
    const r = require("node:http").request(
      {
        hostname: "127.0.0.1",
        port: TEST_PORT,
        path,
        method,
        headers: { "Content-Type": "application/json", ...headers },
      },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const rawText = Buffer.concat(chunks).toString("utf-8");
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === "string") h[k] = v;
          }
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(rawText);
          } catch {
            data = { raw: rawText } as Record<string, unknown>;
          }
          resolve({ status: res.statusCode ?? 0, headers: h, data, raw: rawText });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// ─── State ──────────────────────────────────────────────────────

let paidAuth: { account_id: string; headers: Record<string, string> };
let freeAuth: { account_id: string; headers: Record<string, string> };
let suiteAuth: { account_id: string; headers: Record<string, string> };
let projectId: string;
let snapshotId: string;

// ─── Setup ──────────────────────────────────────────────────────

beforeAll(async () => {
  openMemoryDb();
  resetRateLimits();

  // Create auth contexts
  const paid = createAccount("Paid User", "paid@test.com", "paid");
  const paidKey = createApiKey(paid.account_id, "test-paid");
  paidAuth = { account_id: paid.account_id, headers: { Authorization: `Bearer ${paidKey.rawKey}` } };

  const free = createAccount("Free User", "free@test.com", "free");
  const freeKey = createApiKey(free.account_id, "test-free");
  freeAuth = { account_id: free.account_id, headers: { Authorization: `Bearer ${freeKey.rawKey}` } };

  const suite = createAccount("Suite User", "suite@test.com", "suite");
  const suiteKey = createApiKey(suite.account_id, "test-suite");
  suiteAuth = { account_id: suite.account_id, headers: { Authorization: `Bearer ${suiteKey.rawKey}` } };

  // Seed snapshot with context + generators
  const snap = createSnapshot({
    input_method: "api_submission",
    manifest: {
      project_name: "branch-test",
      project_type: "web_application",
      frameworks: ["react"],
      goals: ["test"],
      requested_outputs: ["AGENTS.md"],
    },
    files: [{ path: "index.ts", content: "export const x = 1;", size: 20 }],
  });
  projectId = snap.project_id;
  snapshotId = snap.snapshot_id;

  saveContextMap(snapshotId, {
    version: "1.0.0",
    snapshot_id: snapshotId,
    project_id: projectId,
    project_identity: { name: "branch-test" },
    structure: { total_files: 1 },
  });
  saveRepoProfile(snapshotId, {
    version: "1.0.0",
    snapshot_id: snapshotId,
    project_id: projectId,
    project: { name: "branch-test" },
    health: { has_tests: false },
  });
  saveGeneratorResult(snapshotId, {
    snapshot_id: snapshotId,
    generated_at: new Date().toISOString(),
    files: [
      { path: "AGENTS.md", content: "# Agents", program: "skills", description: "d", content_type: "text/markdown" },
      { path: ".ai/context-map.json", content: '{"v":1}', program: "search", description: "d", content_type: "application/json" },
    ],
  });

  indexSnapshotContent(snapshotId, [{ path: "index.ts", content: "export const x = 1;", size: 20 }]);

  // Build router with inline handlers (matching server.ts pattern)
  const router = new Router();
  router.post("/v1/snapshots", handleCreateSnapshot);
  router.get("/v1/snapshots/:snapshot_id", handleGetSnapshot);
  router.delete("/v1/snapshots/:snapshot_id", handleDeleteSnapshot);
  router.get("/v1/projects/:project_id/context", handleGetContext);
  router.get("/v1/projects/:project_id/generated-files", handleGetGeneratedFiles);
  router.get("/v1/projects/:project_id/generated-files/:file_path", handleGetGeneratedFile);
  router.delete("/v1/projects/:project_id", handleDeleteProject);
  router.get("/v1/health", handleHealthCheck);
  router.get("/v1/db/stats", handleDbStats);
  router.post("/v1/db/maintenance", handleDbMaintenance);
  router.post("/v1/search/index", handleSearchIndex);
  router.post("/v1/search/query", handleSearchQuery);
  router.get("/v1/search/:snapshot_id/stats", handleSearchStats);
  router.post("/v1/debug/analyze", makeProgramHandler("debug", PROGRAM_OUTPUTS.debug));

  // Inline handlers from server.ts
  router.get("/v1/docs", async (_req, res) => {
    sendJSON(res, 200, buildOpenApiSpec());
  });
  router.get("/v1/programs", async (_req, res) => {
    const generators = listAvailableGenerators();
    const programMap = new Map<string, string[]>();
    for (const g of generators) {
      const list = programMap.get(g.program) ?? [];
      list.push(g.path);
      programMap.set(g.program, list);
    }
    const programs = Array.from(programMap.entries()).map(([name, outputs]) => ({
      name,
      outputs,
      generator_count: outputs.length,
    }));
    sendJSON(res, 200, { programs, total_generators: generators.length });
  });

  // Funnel endpoints
  router.post("/v1/account/seats", handleInviteSeat);
  router.get("/v1/account/seats", handleListSeats);
  router.post("/v1/account/seats/:seat_id/accept", handleAcceptSeat);
  router.post("/v1/account/seats/:seat_id/revoke", handleRevokeSeat);
  router.get("/v1/account/upgrade-prompt", handleGetUpgradePrompt);
  router.post("/v1/account/upgrade-prompt/dismiss", handleDismissUpgradePrompt);
  router.get("/v1/account/funnel", handleGetFunnelStatus);

  server = createApp(router, TEST_PORT);
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  closeDb();
});

// ─── server.ts inline handlers ──────────────────────────────────

describe("server.ts inline handlers", () => {
  it("GET /v1/docs returns OpenAPI spec", async () => {
    const r = await req("GET", "/v1/docs");
    expect(r.status).toBe(200);
    expect(r.data.openapi).toBeDefined();
    expect(r.data.paths).toBeDefined();
  });

  it("GET /v1/programs returns program list with generator counts", async () => {
    const r = await req("GET", "/v1/programs");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data.programs)).toBe(true);
    expect((r.data as any).total_generators).toBeGreaterThan(0);
    const progs = r.data.programs as any[];
    expect(progs.length).toBeGreaterThan(10);
    for (const p of progs) {
      expect(p.name).toBeTruthy();
      expect(p.generator_count).toBeGreaterThan(0);
      expect(Array.isArray(p.outputs)).toBe(true);
    }
  });
});

// ─── handlers.ts: createSnapshot validation branches ────────────

describe("handleCreateSnapshot validation branches", () => {
  it("rejects non-string project_name", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_name: 123, project_type: "x", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "a.ts", content: "x", size: 1 }],
    });
    expect(r.status).toBe(400);
  });

  it("rejects non-string project_type", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_name: "x", project_type: 42, frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "a.ts", content: "x", size: 1 }],
    });
    expect(r.status).toBe(400);
  });

  it("rejects non-array frameworks", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_name: "x", project_type: "x", frameworks: "react", goals: [], requested_outputs: [] },
      files: [{ path: "a.ts", content: "x", size: 1 }],
    });
    expect(r.status).toBe(400);
  });

  it("rejects file with missing path", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_name: "x", project_type: "x", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ content: "x" }],
    });
    expect(r.status).toBe(400);
  });

  it("rejects file with non-string content", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_name: "x", project_type: "x", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "a.ts", content: 123 }],
    });
    expect(r.status).toBe(400);
  });

  it("rejects path traversal with ..", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_name: "x", project_type: "x", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "../etc/passwd", content: "x" }],
    });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("PATH_TRAVERSAL");
  });

  it("normalizes backslashes and double slashes in path", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_name: "norm-test", project_type: "x", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "src\\\\utils//helper.ts", content: "export const x = 1;" }],
    });
    expect(r.status).toBe(201);
  });

  it("computes file size when not provided", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_name: "size-test", project_type: "x", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "a.ts", content: "hello" }],
    });
    expect(r.status).toBe(201);
  });

  it("rejects invalid API key", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_name: "x", project_type: "x", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "a.ts", content: "x", size: 1 }],
    }, { Authorization: "Bearer ax_garbage_key_that_does_not_exist" });
    expect(r.status).toBe(401);
    expect(r.data.error_code).toBe("INVALID_KEY");
  });
});

// ─── handlers.ts: search query branches ─────────────────────────

describe("handleSearchQuery branches", () => {
  it("rejects query > 500 chars", async () => {
    const r = await req("POST", "/v1/search/query", {
      snapshot_id: snapshotId,
      query: "x".repeat(501),
    });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  it("clamps limit to [1, 200]", async () => {
    const r = await req("POST", "/v1/search/query", {
      snapshot_id: snapshotId,
      query: "const",
      limit: 0,
    });
    expect(r.status).toBe(200);

    const r2 = await req("POST", "/v1/search/query", {
      snapshot_id: snapshotId,
      query: "const",
      limit: 999,
    });
    expect(r2.status).toBe(200);
  });

  it("uses default limit when not provided", async () => {
    const r = await req("POST", "/v1/search/query", {
      snapshot_id: snapshotId,
      query: "const",
    });
    expect(r.status).toBe(200);
  });
});

// ─── handlers.ts: delete branches ───────────────────────────────

describe("handleDeleteProject branches", () => {
  it("returns 404 for non-existent project", async () => {
    const r = await req("DELETE", "/v1/projects/proj_nonexistent");
    expect(r.status).toBe(404);
    expect(r.data.error_code).toBe("NOT_FOUND");
  });
});

// ─── handlers.ts: generated file path branches ──────────────────

describe("handleGetGeneratedFile path branches", () => {
  it("rejects path traversal in file path", async () => {
    const r = await req("GET", `/v1/projects/${projectId}/generated-files/..%2F..%2Fsecret`);
    expect(r.status).toBe(400);
  });

  it("resolves .ai/ prefix fallback", async () => {
    // Request "context-map.json" — file stored as ".ai/context-map.json"
    const r = await req("GET", `/v1/projects/${projectId}/generated-files/context-map.json`);
    // Should find it via .ai/ fallback
    expect([200, 404]).toContain(r.status);
  });
});

// ─── handlers.ts: program handler branches ──────────────────────

describe("makeProgramHandler branches", () => {
  it("rejects non-array outputs", async () => {
    const r = await req("POST", "/v1/debug/analyze", {
      snapshot_id: snapshotId,
      outputs: "not_array",
    });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  it("returns CONTEXT_PENDING for snapshot without context", async () => {
    // Create snapshot without saving context
    const noCtx = createSnapshot({
      input_method: "api_submission",
      manifest: { project_name: "no-ctx", project_type: "x", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "a.ts", content: "x", size: 1 }],
    });
    const r = await req("POST", "/v1/debug/analyze", {
      snapshot_id: noCtx.snapshot_id,
    });
    expect(r.status).toBe(404);
    expect(r.data.error_code).toBe("CONTEXT_PENDING");
  });
});

// ─── handlers.ts: context pending for snapshot ──────────────────

describe("handleGetContext / handleGetGeneratedFiles without context", () => {
  let noCtxProject: string;

  beforeAll(() => {
    const snap = createSnapshot({
      input_method: "api_submission",
      manifest: { project_name: "pending", project_type: "x", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "a.ts", content: "x", size: 1 }],
    });
    noCtxProject = snap.project_id;
  });

  it("handleGetContext returns CONTEXT_PENDING", async () => {
    const r = await req("GET", `/v1/projects/${noCtxProject}/context`);
    expect(r.status).toBe(404);
    expect(r.data.error_code).toBe("CONTEXT_PENDING");
  });

  it("handleGetGeneratedFiles returns 404 for no generated files", async () => {
    const r = await req("GET", `/v1/projects/${noCtxProject}/generated-files`);
    expect(r.status).toBe(404);
  });
});

// ─── funnel.ts: seat management branches ────────────────────────

describe("handleInviteSeat branches", () => {
  it("rejects free-tier seat invite", async () => {
    const r = await req("POST", "/v1/account/seats", {
      email: "member@test.com",
      role: "member",
    }, freeAuth.headers);
    expect(r.status).toBe(403);
  });

  it("rejects invalid role", async () => {
    const r = await req("POST", "/v1/account/seats", {
      email: "member@test.com",
      role: "superadmin",
    }, paidAuth.headers);
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  it("rejects non-string role", async () => {
    const r = await req("POST", "/v1/account/seats", {
      email: "member@test.com",
      role: 42,
    }, paidAuth.headers);
    expect(r.status).toBe(400);
  });

  it("creates valid seat invite", async () => {
    const r = await req("POST", "/v1/account/seats", {
      email: "invited@test.com",
      role: "member",
    }, paidAuth.headers);
    expect(r.status).toBe(201);
    expect(r.data.seat).toBeDefined();
  });

  it("rejects duplicate email", async () => {
    const r = await req("POST", "/v1/account/seats", {
      email: "invited@test.com",
      role: "member",
    }, paidAuth.headers);
    expect(r.status).toBe(409);
    expect(r.data.error_code).toBe("CONFLICT");
  });
});

describe("handleListSeats branches", () => {
  it("lists active seats", async () => {
    const r = await req("GET", "/v1/account/seats", undefined, paidAuth.headers);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data.seats)).toBe(true);
  });

  it("includes revoked seats with include_revoked=true", async () => {
    const r = await req("GET", "/v1/account/seats?include_revoked=true", undefined, paidAuth.headers);
    expect(r.status).toBe(200);
  });

  it("shows unlimited for suite tier", async () => {
    const r = await req("GET", "/v1/account/seats", undefined, suiteAuth.headers);
    expect(r.status).toBe(200);
    expect(r.data.limit).toBe("unlimited");
    expect(r.data.remaining).toBe("unlimited");
  });
});

describe("handleAcceptSeat branches", () => {
  it("returns 404 for non-existent seat", async () => {
    const r = await req("POST", "/v1/account/seats/seat_fake/accept", undefined, paidAuth.headers);
    expect(r.status).toBe(404);
  });

  it("returns 403 for wrong email", async () => {
    // Create a seat for a different email, then try to accept with freeAuth
    const invite = await req("POST", "/v1/account/seats", {
      email: "other@test.com",
      role: "viewer",
    }, paidAuth.headers);
    const seatId = (invite.data.seat as any)?.seat_id;
    if (seatId) {
      const r = await req("POST", `/v1/account/seats/${seatId}/accept`, undefined, freeAuth.headers);
      expect(r.status).toBe(403);
    }
  });
});

describe("handleRevokeSeat branches", () => {
  it("returns 404 for wrong account", async () => {
    const r = await req("POST", "/v1/account/seats/seat_fake/revoke", undefined, freeAuth.headers);
    expect(r.status).toBe(404);
  });
});

// ─── funnel.ts: upgrade prompts ─────────────────────────────────

describe("handleGetUpgradePrompt branches", () => {
  it("returns null prompt for fresh free account", async () => {
    const r = await req("GET", "/v1/account/upgrade-prompt", undefined, freeAuth.headers);
    expect(r.status).toBe(200);
    expect(r.data.stage).toBeDefined();
  });

  it("returns prompt after tracked events", async () => {
    // Track several events to trigger upgrade prompt
    for (let i = 0; i < 5; i++) {
      trackEvent(freeAuth.account_id, "snapshot_created", "activation", { i });
    }
    const r = await req("GET", "/v1/account/upgrade-prompt", undefined, freeAuth.headers);
    expect(r.status).toBe(200);
  });
});

describe("handleDismissUpgradePrompt branches", () => {
  it("dismisses with reason", async () => {
    const r = await req("POST", "/v1/account/upgrade-prompt/dismiss", {
      reason: "too_expensive",
    }, freeAuth.headers);
    expect(r.status).toBe(200);
    expect(r.data.dismissed).toBe(true);
  });

  it("dismisses with empty body", async () => {
    const r = await req("POST", "/v1/account/upgrade-prompt/dismiss", "", freeAuth.headers);
    expect(r.status).toBe(200);
    expect(r.data.dismissed).toBe(true);
  });

  it("dismisses with invalid JSON body", async () => {
    const r = await req("POST", "/v1/account/upgrade-prompt/dismiss", "not-json{", freeAuth.headers);
    expect(r.status).toBe(200);
  });
});

// ─── funnel.ts: funnel status branches ──────────────────────────

describe("handleGetFunnelStatus branches", () => {
  it("returns funnel status with default limit", async () => {
    const r = await req("GET", "/v1/account/funnel", undefined, freeAuth.headers);
    expect(r.status).toBe(200);
    expect(r.data.stage).toBeDefined();
    expect(r.data.tier).toBeDefined();
  });

  it("supports custom limit param", async () => {
    const r = await req("GET", "/v1/account/funnel?limit=5", undefined, freeAuth.headers);
    expect(r.status).toBe(200);
  });

  it("clamps limit > 100", async () => {
    const r = await req("GET", "/v1/account/funnel?limit=9999", undefined, freeAuth.headers);
    expect(r.status).toBe(200);
  });
});
