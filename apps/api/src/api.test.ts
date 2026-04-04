import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router, createApp, sendJSON } from "./router.js";
import {
  handleCreateSnapshot,
  handleGetSnapshot,
  handleGetContext,
  handleGetGeneratedFiles,
  handleGetGeneratedFile,
  handleSearchExport,
  handleSkillsGenerate,
  handleDebugAnalyze,
  handleFrontendAudit,
  handleSeoAnalyze,
  handleOptimizationAnalyze,
  handleThemeGenerate,
  handleBrandGenerate,
  handleSuperpowersGenerate,
  handleMarketingGenerate,
  handleNotebookGenerate,
  handleHealthCheck,
} from "./handlers.js";

// Helper to make HTTP requests to the test server
async function request(
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = require("node:http").request(
      { hostname: "127.0.0.1", port, path, method, headers: { "Content-Type": "application/json" } },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const TEST_PORT = 44321;
let server: Server;

const testPayload = {
  input_method: "api_submission",
  manifest: {
    project_name: "vitest-project",
    project_type: "web_application",
    frameworks: ["next"],
    goals: ["Generate context"],
    requested_outputs: ["context-map.json", "AGENTS.md", "CLAUDE.md", ".cursorrules"],
  },
  files: [
    { path: "src/index.ts", content: 'import { db } from "./db";\nexport const app = db;', size: 48 },
    { path: "src/db.ts", content: 'export const db = { query: () => [] };', size: 38 },
    { path: "next.config.mjs", content: "export default {}", size: 18 },
    { path: "package.json", content: '{"name":"vitest-project","dependencies":{"next":"14.0.0","react":"18.0.0"}}', size: 75 },
    { path: "app/page.tsx", content: "export default function Home() { return <div /> }", size: 50 },
    { path: "tsconfig.json", content: '{"compilerOptions":{}}', size: 22 },
  ],
};

beforeAll(async () => {
  openMemoryDb();

  const router = new Router();
  router.get("/health", handleHealthCheck);
  router.post("/v1/snapshots", handleCreateSnapshot);
  router.get("/v1/snapshots/:snapshot_id", handleGetSnapshot);
  router.get("/v1/projects/:project_id/context", handleGetContext);
  router.get("/v1/projects/:project_id/generated-files", handleGetGeneratedFiles);
  router.get("/v1/projects/:project_id/generated-files/:file_path", handleGetGeneratedFile);
  router.post("/v1/search/export", handleSearchExport);
  router.post("/v1/skills/generate", handleSkillsGenerate);
  router.post("/v1/debug/analyze", handleDebugAnalyze);
  router.post("/v1/frontend/audit", handleFrontendAudit);
  router.post("/v1/seo/analyze", handleSeoAnalyze);
  router.post("/v1/optimization/analyze", handleOptimizationAnalyze);
  router.post("/v1/theme/generate", handleThemeGenerate);
  router.post("/v1/brand/generate", handleBrandGenerate);
  router.post("/v1/superpowers/generate", handleSuperpowersGenerate);
  router.post("/v1/marketing/generate", handleMarketingGenerate);
  router.post("/v1/notebook/generate", handleNotebookGenerate);

  server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    router.handle(req, res);
  });

  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  closeDb();
});

describe("API integration", () => {
  let snapshotId: string;
  let projectId: string;

  it("GET /health returns ok", async () => {
    const r = await request(TEST_PORT, "GET", "/health");
    expect(r.status).toBe(200);
    expect((r.data as Record<string, unknown>).status).toBe("ok");
  });

  it("POST /v1/snapshots creates snapshot and generates files", async () => {
    const r = await request(TEST_PORT, "POST", "/v1/snapshots", testPayload);
    expect(r.status).toBe(201);
    const data = r.data as Record<string, unknown>;
    expect(data.status).toBe("ready");
    expect(data.snapshot_id).toBeTruthy();
    expect(data.project_id).toBeTruthy();
    expect(data.context_map).toBeTruthy();
    expect(data.repo_profile).toBeTruthy();
    expect(Array.isArray(data.generated_files)).toBe(true);
    expect((data.generated_files as unknown[]).length).toBeGreaterThanOrEqual(3);

    snapshotId = data.snapshot_id as string;
    projectId = data.project_id as string;
  });

  it("POST /v1/snapshots rejects missing manifest", async () => {
    const r = await request(TEST_PORT, "POST", "/v1/snapshots", { files: [{ path: "a.ts", content: "" }] });
    expect(r.status).toBe(400);
  });

  it("POST /v1/snapshots rejects empty files", async () => {
    const r = await request(TEST_PORT, "POST", "/v1/snapshots", { ...testPayload, files: [] });
    expect(r.status).toBe(400);
  });

  it("GET /v1/snapshots/:id returns snapshot", async () => {
    const r = await request(TEST_PORT, "GET", `/v1/snapshots/${snapshotId}`);
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.snapshot_id).toBe(snapshotId);
    expect(data.status).toBe("ready");
  });

  it("GET /v1/snapshots/:id returns 404 for unknown", async () => {
    const r = await request(TEST_PORT, "GET", "/v1/snapshots/nonexistent");
    expect(r.status).toBe(404);
  });

  it("GET /v1/projects/:id/context returns context", async () => {
    const r = await request(TEST_PORT, "GET", `/v1/projects/${projectId}/context`);
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.context_map).toBeTruthy();
    expect(data.repo_profile).toBeTruthy();
  });

  it("GET /v1/projects/:id/generated-files returns file list", async () => {
    const r = await request(TEST_PORT, "GET", `/v1/projects/${projectId}/generated-files`);
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    const files = data.files as Array<{ path: string }>;
    expect(files.length).toBeGreaterThanOrEqual(3);
    const paths = files.map(f => f.path);
    expect(paths).toContain(".ai/context-map.json");
    expect(paths).toContain(".ai/repo-profile.yaml");
    expect(paths).toContain("architecture-summary.md");
  });

  it("GET /v1/projects/:id/generated-files/:path returns individual file", async () => {
    const r = await request(TEST_PORT, "GET", `/v1/projects/${projectId}/generated-files/AGENTS.md`);
    expect(r.status).toBe(200);
    expect(typeof r.data).toBe("string");
    expect((r.data as string).length).toBeGreaterThan(100);
  });

  it("POST /v1/search/export returns search files", async () => {
    const r = await request(TEST_PORT, "POST", "/v1/search/export", { snapshot_id: snapshotId });
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.program).toBe("search");
    const files = data.files as Array<{ path: string; program: string }>;
    expect(files.every(f => f.program === "search")).toBe(true);
  });

  it("POST /v1/skills/generate returns skills files", async () => {
    const r = await request(TEST_PORT, "POST", "/v1/skills/generate", { snapshot_id: snapshotId });
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.program).toBe("skills");
    const files = data.files as Array<{ path: string; program: string }>;
    expect(files.every(f => f.program === "skills")).toBe(true);
    expect(files.length).toBe(3);
  });

  it("POST /v1/debug/analyze returns debug files", async () => {
    const r = await request(TEST_PORT, "POST", "/v1/debug/analyze", { snapshot_id: snapshotId });
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.program).toBe("debug");
    const files = data.files as Array<{ path: string; program: string }>;
    expect(files.every(f => f.program === "debug")).toBe(true);
    expect(files.length).toBe(3);
  });

  it("POST /v1/frontend/audit returns frontend files", async () => {
    const r = await request(TEST_PORT, "POST", "/v1/frontend/audit", { snapshot_id: snapshotId });
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.program).toBe("frontend");
    const files = data.files as Array<{ path: string; program: string }>;
    expect(files.every(f => f.program === "frontend")).toBe(true);
    expect(files.length).toBe(2);
  });

  it("POST /v1/seo/analyze returns seo files", async () => {
    const r = await request(TEST_PORT, "POST", "/v1/seo/analyze", { snapshot_id: snapshotId });
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.program).toBe("seo");
    const files = data.files as Array<{ path: string; program: string }>;
    expect(files.every(f => f.program === "seo")).toBe(true);
    expect(files.length).toBe(4);
  });

  it("POST /v1/optimization/analyze returns optimization files", async () => {
    const r = await request(TEST_PORT, "POST", "/v1/optimization/analyze", { snapshot_id: snapshotId });
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.program).toBe("optimization");
    const files = data.files as Array<{ path: string; program: string }>;
    expect(files.every(f => f.program === "optimization")).toBe(true);
    expect(files.length).toBe(3);
  });

  it("POST /v1/theme/generate returns theme files", async () => {
    const r = await request(TEST_PORT, "POST", "/v1/theme/generate", { snapshot_id: snapshotId });
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.program).toBe("theme");
    const files = data.files as Array<{ path: string; program: string }>;
    expect(files.every(f => f.program === "theme")).toBe(true);
    expect(files.length).toBe(4);
  });

  it("POST /v1/brand/generate returns brand files", async () => {
    const r = await request(TEST_PORT, "POST", "/v1/brand/generate", { snapshot_id: snapshotId });
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.program).toBe("brand");
    const files = data.files as Array<{ path: string; program: string }>;
    expect(files.every(f => f.program === "brand")).toBe(true);
    expect(files.length).toBe(4);
  });

  it("POST /v1/superpowers/generate returns superpowers files", async () => {
    const r = await request(TEST_PORT, "POST", "/v1/superpowers/generate", { snapshot_id: snapshotId });
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.program).toBe("superpowers");
    const files = data.files as Array<{ path: string; program: string }>;
    expect(files.every(f => f.program === "superpowers")).toBe(true);
    expect(files.length).toBe(4);
  });

  it("POST /v1/marketing/generate returns marketing files", async () => {
    const r = await request(TEST_PORT, "POST", "/v1/marketing/generate", { snapshot_id: snapshotId });
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.program).toBe("marketing");
    const files = data.files as Array<{ path: string; program: string }>;
    expect(files.every(f => f.program === "marketing")).toBe(true);
    expect(files.length).toBe(4);
  });

  it("POST /v1/notebook/generate returns notebook files", async () => {
    const r = await request(TEST_PORT, "POST", "/v1/notebook/generate", { snapshot_id: snapshotId });
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.program).toBe("notebook");
    const files = data.files as Array<{ path: string; program: string }>;
    expect(files.every(f => f.program === "notebook")).toBe(true);
    expect(files.length).toBe(4);
  });

  it("returns 404 for unknown route", async () => {
    const r = await request(TEST_PORT, "GET", "/v1/nonexistent");
    expect(r.status).toBe(404);
  });

  it("program endpoints reject missing snapshot_id", async () => {
    const r1 = await request(TEST_PORT, "POST", "/v1/search/export", {});
    expect(r1.status).toBe(400);
    const r2 = await request(TEST_PORT, "POST", "/v1/skills/generate", {});
    expect(r2.status).toBe(400);
    const r3 = await request(TEST_PORT, "POST", "/v1/debug/analyze", {});
    expect(r3.status).toBe(400);
    const r4 = await request(TEST_PORT, "POST", "/v1/frontend/audit", {});
    expect(r4.status).toBe(400);
    const r5 = await request(TEST_PORT, "POST", "/v1/seo/analyze", {});
    expect(r5.status).toBe(400);
    const r6 = await request(TEST_PORT, "POST", "/v1/optimization/analyze", {});
    expect(r6.status).toBe(400);
    const r7 = await request(TEST_PORT, "POST", "/v1/theme/generate", {});
    expect(r7.status).toBe(400);
    const r8 = await request(TEST_PORT, "POST", "/v1/brand/generate", {});
    expect(r8.status).toBe(400);
    const r9 = await request(TEST_PORT, "POST", "/v1/superpowers/generate", {});
    expect(r9.status).toBe(400);
    const r10 = await request(TEST_PORT, "POST", "/v1/marketing/generate", {});
    expect(r10.status).toBe(400);
    const r11 = await request(TEST_PORT, "POST", "/v1/notebook/generate", {});
    expect(r11.status).toBe(400);
  });
});
