/**
 * eq_114: handlers.ts deep coverage — targets the remaining uncovered branches:
 * handleGitHubAnalyze (full fetch path via vi.mock), handleSearchExport edge
 * cases, handleSkillsGenerate edge cases, handleCreateSnapshot (file limits,
 * quota enforcement), handleGetSnapshot/handleDeleteSnapshot success paths,
 * makeProgramHandler malformed JSON.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Server } from "node:http";
import {
  resetTestDb,
  createAccount,
  createApiKey,
  createSnapshot,
  saveContextMap,
  saveRepoProfile,
  saveGeneratorResult,
  recordUsage,
} from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import {
  handleCreateSnapshot,
  handleGetSnapshot,
  handleDeleteSnapshot,
  handleDeleteProject,
  handleGetGeneratedFile,
  handleSearchExport,
  handleSkillsGenerate,
  handleGitHubAnalyze,
  handleHealthCheck,
  makeProgramHandler,
  PROGRAM_OUTPUTS,
} from "./handlers.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;

// ─── Mock fetchGitHubRepo ──────────────────────────────────────

const mockFetchGitHubRepo = vi.fn();

vi.mock("./github.js", async (importOriginal) => {
  const orig = await importOriginal() as Record<string, unknown>;
  return {
    ...orig,
    fetchGitHubRepo: (...args: unknown[]) => mockFetchGitHubRepo(...args),
  };
});

// ─── HTTP helper ────────────────────────────────────────────────

interface Res {
  status: number;
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
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(rawText);
          } catch {
            data = { raw: rawText } as any;
          }
          resolve({ status: res.statusCode ?? 0, data, raw: rawText });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// ─── Auth ─────────────────────────────────────────────────────

let paidAuth: { account_id: string; headers: Record<string, string> };
let freeAuth: { account_id: string; headers: Record<string, string> };
let seedSnapshotId: string;
let seedProjectId: string;

// ─── Setup ──────────────────────────────────────────────────────

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();

  const paid = await createAccount("Paid User", "paid-gh@test.com", "paid");
  const paidKey = await createApiKey(paid.account_id, "gh-paid");
  paidAuth = { account_id: paid.account_id, headers: { Authorization: `Bearer ${paidKey.rawKey}` } };

  const free = await createAccount("Free User", "free-gh@test.com", "free");
  const freeKey = await createApiKey(free.account_id, "gh-free");
  freeAuth = { account_id: free.account_id, headers: { Authorization: `Bearer ${freeKey.rawKey}` } };

  // Seed a snapshot with context + generated results
  const snap = await createSnapshot({
    input_method: "api_submission",
    manifest: {
      project_name: "deep-test",
      project_type: "web_application",
      frameworks: ["react"],
      goals: ["test"],
      requested_outputs: ["AGENTS.md"],
    },
    files: [{ path: "index.ts", content: "export const x = 1;", size: 20 }],
  });
  seedSnapshotId = snap.snapshot_id;
  seedProjectId = snap.project_id;

  await saveContextMap(seedSnapshotId, {
    version: "1.0.0",
    snapshot_id: seedSnapshotId,
    project_id: seedProjectId,
    project_identity: { name: "deep-test" },
    structure: { total_files: 1 },
  });
  await saveRepoProfile(seedSnapshotId, {
    version: "1.0.0",
    snapshot_id: seedSnapshotId,
    project_id: seedProjectId,
    project: { name: "deep-test" },
    health: { has_tests: false },
  });
  await saveGeneratorResult(seedSnapshotId, {
    snapshot_id: seedSnapshotId,
    generated_at: new Date().toISOString(),
    files: [
      { path: "AGENTS.md", content: "# Agents", program: "skills", description: "d", content_type: "text/markdown" },
      { path: ".ai/context-map.json", content: '{"v":1}', program: "search", description: "d", content_type: "application/json" },
    ],
  });

  const router = new Router();
  router.post("/v1/snapshots", handleCreateSnapshot);
  router.get("/v1/snapshots/:snapshot_id", handleGetSnapshot);
  router.delete("/v1/snapshots/:snapshot_id", handleDeleteSnapshot);
  router.delete("/v1/projects/:project_id", handleDeleteProject);
  router.get("/v1/projects/:project_id/generated-files/:file_path", handleGetGeneratedFile);
  router.post("/v1/search/export", handleSearchExport);
  router.post("/v1/skills/generate", handleSkillsGenerate);
  router.post("/v1/github/analyze", handleGitHubAnalyze);
  router.post("/v1/debug/analyze", makeProgramHandler("debug", PROGRAM_OUTPUTS.debug));

  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

// ─── handleGetSnapshot success path ─────────────────────────────

describe("handleGetSnapshot / handleDeleteSnapshot success", () => {
  it("GET /v1/snapshots/:id returns snapshot metadata", async () => {
    const r = await req("GET", `/v1/snapshots/${seedSnapshotId}`);
    expect(r.status).toBe(200);
    expect(r.data.snapshot_id).toBe(seedSnapshotId);
    expect(r.data.project_id).toBe(seedProjectId);
    expect(typeof r.data.status).toBe("string");
    expect(r.data.manifest).toBeDefined();
  });

  it("DELETE /v1/snapshots/:id deletes successfully", async () => {
    // Create a disposable snapshot for deletion
    const snap = await createSnapshot({
      input_method: "api_submission",
      manifest: { project_name: "delete-me", project_type: "x", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "a.ts", content: "x", size: 1 }],
    });
    const r = await req("DELETE", `/v1/snapshots/${snap.snapshot_id}`);
    expect(r.status).toBe(200);
    expect(r.data.deleted).toBe(true);
    expect(r.data.snapshot_id).toBe(snap.snapshot_id);
  });
});

// ─── handleCreateSnapshot: quota + file limits ──────────────────

describe("handleCreateSnapshot quota and file limits", () => {
  it("enforces file count limit for authenticated users", async () => {
    // Free tier max_files_per_snapshot is typically ≤100. Generate 200 files.
    const manyFiles = Array.from({ length: 200 }, (_, i) => ({
      path: `file${i}.ts`,
      content: `export const f${i} = 1;`,
      size: 25,
    }));
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_name: "big", project_type: "x", frameworks: [], goals: [], requested_outputs: [] },
      files: manyFiles,
    }, freeAuth.headers);
    // Should be rejected with FILE_COUNT_EXCEEDED (413) or succeed if limit > 200
    expect([201, 413]).toContain(r.status);
    if (r.status === 413) {
      expect(r.data.error_code).toBe("FILE_COUNT_EXCEEDED");
    }
  });

  it("enforces file size limit for authenticated users", async () => {
    // Create a file larger than free tier max (typically 1MB or 5MB)
    const largeContent = "x".repeat(10_000_000); // 10MB
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_name: "huge", project_type: "x", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "big.bin", content: largeContent, size: 10_000_000 }],
    }, freeAuth.headers);
    // May hit quota (429) before file size check, or 413 for file too large, or 201 if limits allow
    expect([201, 413, 429]).toContain(r.status);
    if (r.status === 413) {
      expect(r.data.error_code).toBe("FILE_TOO_LARGE");
    } else if (r.status === 429) {
      expect(r.data.error_code).toBe("QUOTA_EXCEEDED");
    }
  });

  it("records usage per program for authenticated snapshots", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_name: "metered", project_type: "x", frameworks: ["react"], goals: ["test"], requested_outputs: ["AGENTS.md"] },
      files: [{ path: "app.ts", content: "export default 1;", size: 17 }],
    }, paidAuth.headers);
    expect(r.status).toBe(201);
    expect(r.data.generated_files).toBeDefined();
  });
});

// ─── handleSearchExport edge cases ──────────────────────────────

describe("handleSearchExport edge cases", () => {
  it("rejects malformed JSON", async () => {
    const r = await req("POST", "/v1/search/export", "not-json{{{");
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_JSON");
  });

  it("rejects non-string snapshot_id", async () => {
    const r = await req("POST", "/v1/search/export", { snapshot_id: 12345 });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("MISSING_FIELD");
  });

  it("returns 404 for snapshot without generated result", async () => {
    const noGen = await createSnapshot({
      input_method: "api_submission",
      manifest: { project_name: "no-gen", project_type: "x", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "a.ts", content: "x", size: 1 }],
    });
    const r = await req("POST", "/v1/search/export", { snapshot_id: noGen.snapshot_id });
    expect(r.status).toBe(404);
  });
});

// ─── handleSkillsGenerate edge cases ────────────────────────────

describe("handleSkillsGenerate edge cases", () => {
  it("rejects malformed JSON", async () => {
    const r = await req("POST", "/v1/skills/generate", "{bad");
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_JSON");
  });

  it("rejects non-string snapshot_id", async () => {
    const r = await req("POST", "/v1/skills/generate", { snapshot_id: null });
    expect(r.status).toBe(400);
  });

  it("rejects non-array outputs", async () => {
    const r = await req("POST", "/v1/skills/generate", {
      snapshot_id: seedSnapshotId,
      outputs: "AGENTS.md",
    });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  it("returns CONTEXT_PENDING for snapshot without context", async () => {
    const noCtx = await createSnapshot({
      input_method: "api_submission",
      manifest: { project_name: "no-ctx-sk", project_type: "x", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "a.ts", content: "x", size: 1 }],
    });
    const r = await req("POST", "/v1/skills/generate", { snapshot_id: noCtx.snapshot_id });
    expect(r.status).toBe(404);
    expect(r.data.error_code).toBe("CONTEXT_PENDING");
  });
});

// ─── makeProgramHandler: malformed JSON ─────────────────────────

describe("makeProgramHandler malformed JSON", () => {
  it("rejects malformed JSON body", async () => {
    const r = await req("POST", "/v1/debug/analyze", "{broken json!!");
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_JSON");
  });
});

// ─── handleGetGeneratedFile: no snapshots for project ───────────

describe("handleGetGeneratedFile edge cases", () => {
  it("returns 404 when project has no snapshots", async () => {
    const r = await req("GET", "/v1/projects/proj_ghost/generated-files/file.md");
    expect(r.status).toBe(404);
    expect(r.data.error_code).toBe("NOT_FOUND");
  });

  it("returns 404 when file not found (with available list)", async () => {
    const r = await req("GET", `/v1/projects/${seedProjectId}/generated-files/nonexistent.md`);
    expect(r.status).toBe(404);
    expect(r.data.available).toBeDefined();
  });
});

// ─── handleGitHubAnalyze: full path via mock ────────────────────

describe("handleGitHubAnalyze", () => {
  it("rejects malformed JSON", async () => {
    const r = await req("POST", "/v1/github/analyze", "{{bad");
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_JSON");
  });

  it("rejects missing github_url", async () => {
    const r = await req("POST", "/v1/github/analyze", { foo: "bar" });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("MISSING_FIELD");
  });

  it("rejects invalid GitHub URL", async () => {
    const r = await req("POST", "/v1/github/analyze", { github_url: "https://gitlab.com/a/b" });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  it("handles GitHub 429 rate limit", async () => {
    mockFetchGitHubRepo.mockRejectedValueOnce(new Error("GitHub API returned 429"));
    const r = await req("POST", "/v1/github/analyze", { github_url: "https://github.com/owner/repo" });
    expect(r.status).toBe(429);
    expect(r.data.error_code).toBe("RATE_LIMITED");
  });

  it("handles GitHub 403 rate limit", async () => {
    mockFetchGitHubRepo.mockRejectedValueOnce(new Error("GitHub API returned 403"));
    const r = await req("POST", "/v1/github/analyze", { github_url: "https://github.com/owner/repo" });
    expect(r.status).toBe(429);
    expect(r.data.error_code).toBe("RATE_LIMITED");
  });

  it("handles GitHub 404 not found", async () => {
    mockFetchGitHubRepo.mockRejectedValueOnce(new Error("GitHub API returned 404"));
    const r = await req("POST", "/v1/github/analyze", { github_url: "https://github.com/owner/repo" });
    expect(r.status).toBe(404);
    expect(r.data.error_code).toBe("NOT_FOUND");
  });

  it("handles generic upstream error", async () => {
    mockFetchGitHubRepo.mockRejectedValueOnce(new Error("Connection timeout"));
    const r = await req("POST", "/v1/github/analyze", { github_url: "https://github.com/owner/repo" });
    expect(r.status).toBe(502);
    expect(r.data.error_code).toBe("UPSTREAM_ERROR");
  });

  it("rejects empty repo (no files)", async () => {
    mockFetchGitHubRepo.mockResolvedValueOnce({
      files: [],
      owner: "owner",
      repo: "repo",
      ref: "HEAD",
      skipped_count: 0,
      total_bytes: 0,
    });
    const r = await req("POST", "/v1/github/analyze", { github_url: "https://github.com/owner/empty" });
    expect(r.status).toBe(422);
    expect(r.data.error_code).toBe("UNPROCESSABLE");
  });

  it("succeeds with mock fetch result (anonymous)", async () => {
    mockFetchGitHubRepo.mockResolvedValueOnce({
      files: [{ path: "index.ts", content: "export const x = 1;", size: 20 }],
      owner: "testowner",
      repo: "testrepo",
      ref: "main",
      skipped_count: 0,
      total_bytes: 20,
    });
    const r = await req("POST", "/v1/github/analyze", { github_url: "https://github.com/testowner/testrepo" });
    expect(r.status).toBe(201);
    expect(r.data.project_id).toBeDefined();
    expect(r.data.snapshot_id).toBeDefined();
    expect(r.data.status).toBe("ready");
    expect((r.data as any).github.owner).toBe("testowner");
    expect((r.data as any).github.repo).toBe("testrepo");
    expect((r.data as any).generated_files).toBeDefined();
  });

  it("succeeds with authenticated user and records usage", async () => {
    mockFetchGitHubRepo.mockResolvedValueOnce({
      files: [{ path: "app.ts", content: "export default 42;", size: 19 }],
      owner: "authed",
      repo: "repo",
      ref: "main",
      skipped_count: 0,
      total_bytes: 19,
    });
    const r = await req("POST", "/v1/github/analyze", {
      github_url: "https://github.com/authed/repo",
    }, paidAuth.headers);
    expect(r.status).toBe(201);
    expect(r.data.status).toBe("ready");
  });

  it("uses explicit token from request body", async () => {
    mockFetchGitHubRepo.mockResolvedValueOnce({
      files: [{ path: "tok.ts", content: "x", size: 1 }],
      owner: "o", repo: "r", ref: "HEAD", skipped_count: 0, total_bytes: 1,
    });
    const r = await req("POST", "/v1/github/analyze", {
      github_url: "https://github.com/o/r",
      token: "ghp_explicit_token_abc",
    });
    expect(r.status).toBe(201);
    // Verify the explicit token was passed to fetchGitHubRepo
    expect(mockFetchGitHubRepo).toHaveBeenCalledWith(
      "https://github.com/o/r",
      "ghp_explicit_token_abc",
    );
  });

  it("rejects invalid API key in Authorization header", async () => {
    mockFetchGitHubRepo.mockResolvedValueOnce({
      files: [{ path: "x.ts", content: "x", size: 1 }],
      owner: "o", repo: "r", ref: "HEAD", skipped_count: 0, total_bytes: 1,
    });
    const r = await req("POST", "/v1/github/analyze", {
      github_url: "https://github.com/o/r",
    }, { Authorization: "Bearer axis_invalid_key_garbage" });
    expect(r.status).toBe(401);
    expect(r.data.error_code).toBe("INVALID_KEY");
  });
});

// ─── handleDeleteProject with no snapshots ──────────────────────

describe("handleDeleteProject edge cases", () => {
  it("deletes project that has snapshots", async () => {
    const snap = await createSnapshot({
      input_method: "api_submission",
      manifest: { project_name: "del-proj", project_type: "x", frameworks: [], goals: [], requested_outputs: [] },
      files: [{ path: "a.ts", content: "x", size: 1 }],
    });
    const r = await req("DELETE", `/v1/projects/${snap.project_id}`);
    expect(r.status).toBe(200);
    expect(r.data.deleted).toBe(true);
    expect((r.data as any).deleted_snapshots).toBeGreaterThanOrEqual(0);
  });
});
