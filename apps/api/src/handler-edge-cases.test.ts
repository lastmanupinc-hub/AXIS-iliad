import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import {
  openMemoryDb,
  closeDb,
  createSnapshot,
  saveContextMap,
  saveRepoProfile,
  saveGeneratorResult,
} from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import {
  handleCreateSnapshot,
  handleGetGeneratedFile,
  handleGetGeneratedFiles,
  handleGetContext,
  handleHealthCheck,
  makeProgramHandler,
  PROGRAM_OUTPUTS,
} from "./handlers.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;
let projectId: string;
let snapshotId: string;

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
        port: testPort,
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

// ─── Server setup ───────────────────────────────────────────────

beforeAll(async () => {
  openMemoryDb();
  resetRateLimits();

  // Seed a valid snapshot with context + profile + generated files
  const snap = createSnapshot({
    input_method: "api_submission",
    manifest: {
      project_name: "edge-case-project",
      project_type: "saas_web_app",
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
    project_identity: { name: "edge-case-project" },
    structure: { total_files: 1 },
  });
  saveRepoProfile(snapshotId, {
    version: "1.0.0",
    snapshot_id: snapshotId,
    project_id: projectId,
    project: { name: "edge-case-project" },
    health: { has_tests: false },
  });
  saveGeneratorResult(snapshotId, {
    snapshot_id: snapshotId,
    generated_at: new Date().toISOString(),
    files: [
      { path: "AGENTS.md", content: "# Agents", program: "skills", description: "Agent rules", content_type: "text/markdown" },
      { path: ".ai/context-map.json", content: '{"v":1}', program: "search", description: "Context", content_type: "application/json" },
    ],
  });

  const router = new Router();
  router.post("/v1/snapshots", handleCreateSnapshot);
  router.get("/health", handleHealthCheck);
  router.get("/v1/projects/:project_id/context", handleGetContext);
  router.get("/v1/projects/:project_id/generated-files", handleGetGeneratedFiles);
  router.get("/v1/projects/:project_id/generated-files/:file_path", handleGetGeneratedFile);
  router.post("/v1/debug/analyze", makeProgramHandler("debug", PROGRAM_OUTPUTS.debug));

  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  closeDb();
});

// ─── Manifest field type validation ─────────────────────────────

describe("manifest field type validation", () => {
  function snap(manifestOverrides: Record<string, unknown>) {
    return {
      manifest: {
        project_name: "type-test",
        project_type: "web",
        frameworks: ["react"],
        goals: ["test"],
        requested_outputs: ["AGENTS.md"],
        ...manifestOverrides,
      },
      files: [{ path: "a.ts", content: "x" }],
    };
  }

  it("rejects project_name as number", async () => {
    const r = await req("POST", "/v1/snapshots", snap({ project_name: 42 }));
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  it("rejects project_type as number", async () => {
    const r = await req("POST", "/v1/snapshots", snap({ project_type: 99 }));
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  it("rejects frameworks as string instead of array", async () => {
    const r = await req("POST", "/v1/snapshots", snap({ frameworks: "react" }));
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  it("rejects goals as object instead of array", async () => {
    const r = await req("POST", "/v1/snapshots", snap({ goals: { a: 1 } }));
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  it("rejects requested_outputs as null", async () => {
    const r = await req("POST", "/v1/snapshots", snap({ requested_outputs: null }));
    expect(r.status).toBe(400);
    // null fails the Array.isArray check — caught by either MISSING_FIELD or INVALID_FORMAT
    expect([400]).toContain(r.status);
  });

  it("accepts empty arrays for frameworks, goals, requested_outputs", async () => {
    const r = await req(
      "POST",
      "/v1/snapshots",
      snap({
        project_name: `empty-arr-${Date.now()}`,
        frameworks: [],
        goals: [],
        requested_outputs: [],
      }),
    );
    expect(r.status).toBe(201);
  });
});

// ─── handleGetGeneratedFile edge cases ──────────────────────────

describe("handleGetGeneratedFile", () => {
  it("rejects encoded path traversal (%2e%2e)", async () => {
    const r = await req("GET", `/v1/projects/${projectId}/generated-files/%2e%2e%2f%2e%2e%2fetc%2fpasswd`);
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("PATH_TRAVERSAL");
  });

  it("rejects path starting with /", async () => {
    const r = await req("GET", `/v1/projects/${projectId}/generated-files/%2fetc%2fpasswd`);
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("PATH_TRAVERSAL");
  });

  it("finds file with .ai/ prefix fallback", async () => {
    // context-map.json should match .ai/context-map.json via fallback
    const r = await req("GET", `/v1/projects/${projectId}/generated-files/context-map.json`);
    expect(r.status).toBe(200);
    expect(r.raw).toBe('{"v":1}');
  });

  it("finds file by exact path", async () => {
    const r = await req("GET", `/v1/projects/${projectId}/generated-files/AGENTS.md`);
    expect(r.status).toBe(200);
    expect(r.raw).toBe("# Agents");
  });

  it("returns 404 for non-existent file with available list", async () => {
    const r = await req("GET", `/v1/projects/${projectId}/generated-files/nope.txt`);
    expect(r.status).toBe(404);
    expect(r.data.error_code).toBe("NOT_FOUND");
    expect(Array.isArray(r.data.available)).toBe(true);
  });

  it("returns 404 for non-existent project", async () => {
    const r = await req("GET", "/v1/projects/no-such-project/generated-files/a.txt");
    expect(r.status).toBe(404);
  });
});

// ─── makeProgramHandler — successful flow ───────────────────────

describe("makeProgramHandler successful flow", () => {
  it("generates files when context exists", async () => {
    const r = await req("POST", "/v1/debug/analyze", { snapshot_id: snapshotId });
    expect(r.status).toBe(200);
    expect(r.data.snapshot_id).toBe(snapshotId);
    expect(r.data.program).toBe("debug");
    expect(Array.isArray(r.data.files)).toBe(true);
  });

  it("accepts custom outputs array", async () => {
    const r = await req("POST", "/v1/debug/analyze", {
      snapshot_id: snapshotId,
      outputs: ["custom-output.md"],
    });
    expect(r.status).toBe(200);
    expect(r.data.program).toBe("debug");
  });

  it("accepts outputs as empty array (uses defaults fallback)", async () => {
    const r = await req("POST", "/v1/debug/analyze", {
      snapshot_id: snapshotId,
      outputs: [],
    });
    expect(r.status).toBe(200);
  });
});

// ─── handleHealthCheck ──────────────────────────────────────────

describe("handleHealthCheck", () => {
  it("returns 200 and ok status during normal operation", async () => {
    const r = await req("GET", "/health");
    expect(r.status).toBe(200);
    expect(r.data.status).toBe("ok");
    expect(r.data.service).toBe("axis-api");
    expect(r.data.version).toBeTruthy();
    expect(r.data.timestamp).toBeTruthy();
  });
});

// ─── handleGetContext / handleGetGeneratedFiles edge cases ───────

describe("context and generated-files edge cases", () => {
  it("handleGetContext returns 404 for non-existent project", async () => {
    const r = await req("GET", "/v1/projects/no-such-project/context");
    expect(r.status).toBe(404);
    expect(r.data.error_code).toBe("NOT_FOUND");
  });

  it("handleGetGeneratedFiles returns 404 for non-existent project", async () => {
    const r = await req("GET", "/v1/projects/no-such-project/generated-files");
    expect(r.status).toBe(404);
    expect(r.data.error_code).toBe("NOT_FOUND");
  });

  it("handleGetContext returns data for valid project", async () => {
    const r = await req("GET", `/v1/projects/${projectId}/context`);
    expect(r.status).toBe(200);
    expect(r.data.snapshot_id).toBe(snapshotId);
    expect(r.data.context_map).toBeTruthy();
    expect(r.data.repo_profile).toBeTruthy();
  });

  it("handleGetGeneratedFiles returns data for valid project", async () => {
    const r = await req("GET", `/v1/projects/${projectId}/generated-files`);
    expect(r.status).toBe(200);
    expect(r.data.snapshot_id).toBe(snapshotId);
    expect(Array.isArray(r.data.files)).toBe(true);
  });

  it("handleGetContext returns CONTEXT_PENDING when profile missing", async () => {
    // Create a project with snapshot but no context/profile saved
    const snap2 = createSnapshot({
      input_method: "api_submission",
      manifest: {
        project_name: "no-context-project",
        project_type: "web",
        frameworks: [],
        goals: [],
        requested_outputs: [],
      },
      files: [{ path: "x.ts", content: "x", size: 1 }],
    });

    const r = await req("GET", `/v1/projects/${snap2.project_id}/context`);
    expect(r.status).toBe(404);
    expect(r.data.error_code).toBe("CONTEXT_PENDING");
  });
});
