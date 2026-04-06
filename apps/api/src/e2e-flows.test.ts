import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb, saveGenerationVersion } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import {
  handleCreateSnapshot,
  handleGetSnapshot,
  handleDeleteSnapshot,
  handleDeleteProject,
  handleGetContext,
  handleGetGeneratedFiles,
  handleGetGeneratedFile,
  handleHealthCheck,
  handleDbStats,
  handleDbMaintenance,
  handleSearchExport,
} from "./handlers.js";
import { handleExportZip } from "./export.js";
import { handleListVersions, handleGetVersion, handleDiffVersions } from "./versions.js";
import {
  handleCreateAccount,
  handleGetAccount,
  handleCreateApiKey as handleCreateApiKeyRoute,
  handleListApiKeys,
  handleRevokeApiKey,
  handleGetUsage,
  handleGetQuota,
} from "./billing.js";
import { handleCreateWebhook, handleListWebhooks, handleDeleteWebhook, handleToggleWebhook, handleWebhookDeliveries } from "./webhooks.js";
import { handleAdminStats, handleAdminAccounts, handleAdminActivity } from "./admin.js";
import { handleLiveness, handleReadiness, handleMetrics } from "./metrics.js";
import { resetRateLimits } from "./rate-limiter.js";

// ── Helper ──────────────────────────────────────────────────────
async function req(
  port: number,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; headers: Record<string, string>; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const hdrs: Record<string, string> = { "Content-Type": "application/json", ...headers };
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port, path, method, headers: hdrs },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          const rh: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) { rh[k] = String(v); }
          resolve({ status: res.statusCode ?? 0, headers: rh, data });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// ── Server setup ────────────────────────────────────────────────
const PORT = 44450;
let server: Server;

const testPayload = {
  input_method: "api_submission" as const,
  manifest: {
    project_name: "e2e-flow-project",
    project_type: "web_application",
    frameworks: ["next"],
    goals: ["Generate context"],
    requested_outputs: ["context-map.json", "AGENTS.md", "CLAUDE.md", ".cursorrules"],
  },
  files: [
    { path: "src/index.ts", content: 'import { db } from "./db";\nexport const app = db;', size: 48 },
    { path: "src/db.ts", content: "export const db = { query: () => [] };", size: 38 },
    { path: "next.config.mjs", content: "export default {}", size: 18 },
    { path: "package.json", content: '{"name":"e2e-flow","dependencies":{"next":"14.0.0","react":"18.0.0"}}', size: 70 },
    { path: "app/page.tsx", content: "export default function Home() { return <div /> }", size: 50 },
    { path: "tsconfig.json", content: '{"compilerOptions":{}}', size: 22 },
  ],
};

beforeAll(async () => {
  openMemoryDb();
  const router = new Router();

  // Health / metrics / db
  router.get("/v1/health", handleHealthCheck);
  router.get("/v1/health/live", handleLiveness);
  router.get("/v1/health/ready", handleReadiness);
  router.get("/v1/metrics", handleMetrics);
  router.get("/v1/db/stats", handleDbStats);
  router.post("/v1/db/maintenance", handleDbMaintenance);

  // Snapshots
  router.post("/v1/snapshots", handleCreateSnapshot);
  router.get("/v1/snapshots/:snapshot_id", handleGetSnapshot);
  router.delete("/v1/snapshots/:snapshot_id", handleDeleteSnapshot);

  // Versions & diff
  router.get("/v1/snapshots/:snapshot_id/versions", handleListVersions);
  router.get("/v1/snapshots/:snapshot_id/versions/:version_number", handleGetVersion);
  router.get("/v1/snapshots/:snapshot_id/diff", handleDiffVersions);

  // Projects
  router.get("/v1/projects/:project_id/context", handleGetContext);
  router.get("/v1/projects/:project_id/generated-files", handleGetGeneratedFiles);
  router.get("/v1/projects/:project_id/generated-files/:file_path", handleGetGeneratedFile);
  router.delete("/v1/projects/:project_id", handleDeleteProject);
  router.get("/v1/projects/:project_id/export", handleExportZip);

  // Programs
  router.post("/v1/search/export", handleSearchExport);

  // Billing & account
  router.post("/v1/accounts", handleCreateAccount);
  router.get("/v1/account", handleGetAccount);
  router.post("/v1/account/keys", handleCreateApiKeyRoute);
  router.get("/v1/account/keys", handleListApiKeys);
  router.post("/v1/account/keys/:key_id/revoke", handleRevokeApiKey);
  router.get("/v1/account/usage", handleGetUsage);
  router.get("/v1/account/quota", handleGetQuota);

  // Admin
  router.get("/v1/admin/stats", handleAdminStats);
  router.get("/v1/admin/accounts", handleAdminAccounts);
  router.get("/v1/admin/activity", handleAdminActivity);

  // Webhooks
  router.post("/v1/account/webhooks", handleCreateWebhook);
  router.get("/v1/account/webhooks", handleListWebhooks);
  router.delete("/v1/account/webhooks/:webhook_id", handleDeleteWebhook);
  router.post("/v1/account/webhooks/:webhook_id/toggle", handleToggleWebhook);
  router.get("/v1/account/webhooks/:webhook_id/deliveries", handleWebhookDeliveries);

  server = createApp(router, PORT);
  await new Promise<void>((r) => setTimeout(r, 100));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  closeDb();
});

beforeEach(() => {
  resetRateLimits();
});

// ═══════════════════════════════════════════════════════════════
// Flow 1: Upload → Generate → Export → Delete lifecycle
// ═══════════════════════════════════════════════════════════════
describe("Flow 1: snapshot lifecycle (upload → generate → export → delete)", () => {
  let snapshotId: string;
  let projectId: string;

  it("creates a snapshot", async () => {
    const r = await req(PORT, "POST", "/v1/snapshots", testPayload);
    expect(r.status).toBe(201);
    const d = r.data as Record<string, unknown>;
    expect(d.status).toBe("ready");
    snapshotId = d.snapshot_id as string;
    projectId = d.project_id as string;
  });

  it("retrieves snapshot detail", async () => {
    const r = await req(PORT, "GET", `/v1/snapshots/${snapshotId}`);
    expect(r.status).toBe(200);
    expect((r.data as Record<string, unknown>).snapshot_id).toBe(snapshotId);
  });

  it("retrieves project context", async () => {
    const r = await req(PORT, "GET", `/v1/projects/${projectId}/context`);
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect(d.context_map).toBeTruthy();
    expect(d.repo_profile).toBeTruthy();
  });

  it("lists generated files", async () => {
    const r = await req(PORT, "GET", `/v1/projects/${projectId}/generated-files`);
    expect(r.status).toBe(200);
    const files = (r.data as Record<string, unknown>).files as Array<{ path: string }>;
    expect(files.length).toBeGreaterThan(0);
  });

  it("exports ZIP archive", async () => {
    const r = await req(PORT, "GET", `/v1/projects/${projectId}/export`);
    expect(r.status).toBe(200);
    // ZIP response has content-type application/zip
    expect(r.headers["content-type"]).toContain("application/zip");
  });

  it("deletes the snapshot", async () => {
    const r = await req(PORT, "DELETE", `/v1/snapshots/${snapshotId}`);
    expect(r.status).toBe(200);
    expect((r.data as Record<string, unknown>).deleted).toBe(true);
  });

  it("snapshot is gone after deletion", async () => {
    const r = await req(PORT, "GET", `/v1/snapshots/${snapshotId}`);
    expect(r.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
// Flow 2: Version history & diff
// ═══════════════════════════════════════════════════════════════
describe("Flow 2: version history (generate → re-generate → list → diff)", () => {
  let snapshotId: string;

  it("creates snapshot with initial generation (version 1)", async () => {
    const r = await req(PORT, "POST", "/v1/snapshots", testPayload);
    expect(r.status).toBe(201);
    snapshotId = (r.data as Record<string, unknown>).snapshot_id as string;
  });

  it("seeds generation versions for testing", () => {
    saveGenerationVersion(snapshotId, [
      { path: "AGENTS.md", content: "# Agents v1" },
      { path: "CLAUDE.md", content: "# Claude v1" },
    ], "skills");
    saveGenerationVersion(snapshotId, [
      { path: "AGENTS.md", content: "# Agents v2 — updated" },
      { path: "CLAUDE.md", content: "# Claude v2 — updated" },
      { path: "NEW.md", content: "# New file" },
    ], "skills");
  });

  it("lists versions for the snapshot", async () => {
    const r = await req(PORT, "GET", `/v1/snapshots/${snapshotId}/versions`);
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect((d.versions as unknown[]).length).toBe(2);
    expect(d.count).toBe(2);
  });

  it("retrieves version 1 with files", async () => {
    const r = await req(PORT, "GET", `/v1/snapshots/${snapshotId}/versions/1`);
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    const v = d.version as Record<string, unknown>;
    expect(v.version_number).toBe(1);
    expect((v.files as unknown[]).length).toBe(2);
  });

  it("diffs version 1 vs 2", async () => {
    const r = await req(PORT, "GET", `/v1/snapshots/${snapshotId}/diff?old=1&new=2`);
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    const diff = d.diff as Record<string, unknown>;
    expect(diff.old_version).toBe(1);
    expect(diff.new_version).toBe(2);
    const summary = diff.summary as Record<string, number>;
    expect(summary.added).toBe(1);       // NEW.md
    expect(summary.modified).toBe(2);    // AGENTS.md, CLAUDE.md
  });

  it("returns 404 for non-existent version", async () => {
    const r = await req(PORT, "GET", `/v1/snapshots/${snapshotId}/versions/999`);
    expect(r.status).toBe(404);
  });

  it("returns 400 for diff with missing params", async () => {
    const r = await req(PORT, "GET", `/v1/snapshots/${snapshotId}/diff`);
    expect(r.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// Flow 3: Account → API key → authenticated requests → quota
// ═══════════════════════════════════════════════════════════════
describe("Flow 3: account lifecycle (create → key → auth → quota → usage)", () => {
  let rawKey: string;

  it("creates an account and receives API key", async () => {
    const r = await req(PORT, "POST", "/v1/accounts", { name: "E2E User", email: "e2e@example.com" });
    expect(r.status).toBe(201);
    const d = r.data as Record<string, unknown>;
    expect(d.account).toBeTruthy();
    expect(d.api_key).toBeTruthy();
    rawKey = (d.api_key as Record<string, unknown>).raw_key as string;
    expect(rawKey).toBeTruthy();
  });

  it("gets account details with API key", async () => {
    const r = await req(PORT, "GET", "/v1/account", undefined, { Authorization: `Bearer ${rawKey}` });
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    const acct = d.account as Record<string, unknown>;
    expect(acct.name).toBe("E2E User");
  });

  it("creates additional API key", async () => {
    const r = await req(PORT, "POST", "/v1/account/keys", { label: "e2e-extra" }, { Authorization: `Bearer ${rawKey}` });
    expect(r.status).toBe(201);
    expect((r.data as Record<string, unknown>).raw_key).toBeTruthy();
  });

  it("lists API keys", async () => {
    const r = await req(PORT, "GET", "/v1/account/keys", undefined, { Authorization: `Bearer ${rawKey}` });
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect((d.keys as unknown[]).length).toBeGreaterThanOrEqual(2);
  });

  it("gets quota info", async () => {
    const r = await req(PORT, "GET", "/v1/account/quota", undefined, { Authorization: `Bearer ${rawKey}` });
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect(d.rate_limit).toBeTruthy();
    expect(d.authenticated).toBe(true);
    expect(d.resource_quota).toBeTruthy();
  });

  it("gets usage summary", async () => {
    const r = await req(PORT, "GET", "/v1/account/usage", undefined, { Authorization: `Bearer ${rawKey}` });
    expect(r.status).toBe(200);
  });

  it("rejects requests with invalid key", async () => {
    const r = await req(PORT, "GET", "/v1/account", undefined, { Authorization: "Bearer invalid_key" });
    expect(r.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// Flow 4: Admin dashboard
// ═══════════════════════════════════════════════════════════════
describe("Flow 4: admin endpoints", () => {
  let adminKey: string;

  beforeAll(async () => {
    const r = await req(PORT, "POST", "/v1/accounts", { name: "Admin", email: "admin-e2e@example.com" });
    adminKey = ((r.data as Record<string, unknown>).api_key as Record<string, unknown>).raw_key as string;
  });

  it("returns platform stats", async () => {
    const r = await req(PORT, "GET", "/v1/admin/stats", undefined, { Authorization: `Bearer ${adminKey}` });
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect(typeof d.total_accounts).toBe("number");
    expect(typeof d.total_snapshots).toBe("number");
    expect(d.accounts_by_tier).toBeTruthy();
  });

  it("lists accounts with pagination", async () => {
    const r = await req(PORT, "GET", "/v1/admin/accounts?limit=10&offset=0", undefined, { Authorization: `Bearer ${adminKey}` });
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect(Array.isArray(d.accounts)).toBe(true);
    expect(typeof d.total).toBe("number");
  });

  it("returns activity feed", async () => {
    const r = await req(PORT, "GET", "/v1/admin/activity?limit=5", undefined, { Authorization: `Bearer ${adminKey}` });
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect(Array.isArray(d.events)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Flow 5: Health probes & infrastructure
// ═══════════════════════════════════════════════════════════════
describe("Flow 5: health probes & database endpoints", () => {
  it("liveness probe returns alive", async () => {
    const r = await req(PORT, "GET", "/v1/health/live");
    expect(r.status).toBe(200);
    expect((r.data as Record<string, unknown>).status).toBe("alive");
  });

  it("readiness probe returns ready with checks", async () => {
    const r = await req(PORT, "GET", "/v1/health/ready");
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect(d.status).toBe("ready");
    expect(d.checks).toBeTruthy();
  });

  it("metrics returns prometheus text", async () => {
    const r = await req(PORT, "GET", "/v1/metrics");
    expect(r.status).toBe(200);
    const text = r.data as string;
    expect(text).toContain("axis_uptime_seconds");
  });

  it("db stats returns table info", async () => {
    const r = await req(PORT, "GET", "/v1/db/stats");
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect(d.success).toBe(true);
    expect((d.details as Record<string, unknown>).tables).toBeTruthy();
  });

  it("db maintenance completes successfully", async () => {
    const r = await req(PORT, "POST", "/v1/db/maintenance");
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect(d.success).toBe(true);
    expect(Array.isArray(d.results)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Flow 6: Webhook lifecycle
// ═══════════════════════════════════════════════════════════════
describe("Flow 6: webhook lifecycle (create → list → toggle → deliveries → delete)", () => {
  let rawKey: string;
  let webhookId: string;

  beforeAll(async () => {
    const r = await req(PORT, "POST", "/v1/accounts", { name: "Webhook User", email: "webhook-e2e@example.com" });
    rawKey = ((r.data as Record<string, unknown>).api_key as Record<string, unknown>).raw_key as string;
  });

  it("creates a webhook", async () => {
    const r = await req(PORT, "POST", "/v1/account/webhooks", {
      url: "https://example.com/hook",
      events: ["snapshot.created"],
    }, { Authorization: `Bearer ${rawKey}` });
    expect(r.status).toBe(201);
    const d = r.data as Record<string, unknown>;
    const wh = d.webhook as Record<string, unknown>;
    expect(wh.url).toBe("https://example.com/hook");
    expect(wh.active).toBe(true);
    webhookId = wh.webhook_id as string;
  });

  it("lists webhooks", async () => {
    const r = await req(PORT, "GET", "/v1/account/webhooks", undefined, { Authorization: `Bearer ${rawKey}` });
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect((d.webhooks as unknown[]).length).toBe(1);
  });

  it("toggles webhook off", async () => {
    const r = await req(PORT, "POST", `/v1/account/webhooks/${webhookId}/toggle`, { active: false }, { Authorization: `Bearer ${rawKey}` });
    expect(r.status).toBe(200);
    expect((r.data as Record<string, unknown>).active).toBe(false);
  });

  it("toggles webhook back on", async () => {
    const r = await req(PORT, "POST", `/v1/account/webhooks/${webhookId}/toggle`, { active: true }, { Authorization: `Bearer ${rawKey}` });
    expect(r.status).toBe(200);
    expect((r.data as Record<string, unknown>).active).toBe(true);
  });

  it("lists deliveries (initially empty)", async () => {
    const r = await req(PORT, "GET", `/v1/account/webhooks/${webhookId}/deliveries`, undefined, { Authorization: `Bearer ${rawKey}` });
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect((d.deliveries as unknown[]).length).toBe(0);
  });

  it("deletes the webhook", async () => {
    const r = await req(PORT, "DELETE", `/v1/account/webhooks/${webhookId}`, undefined, { Authorization: `Bearer ${rawKey}` });
    expect(r.status).toBe(200);
    expect((r.data as Record<string, unknown>).deleted).toBe(true);
  });

  it("webhook is gone after deletion", async () => {
    const r = await req(PORT, "GET", "/v1/account/webhooks", undefined, { Authorization: `Bearer ${rawKey}` });
    expect(r.status).toBe(200);
    expect(((r.data as Record<string, unknown>).webhooks as unknown[]).length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Flow 7: Project deletion cascade
// ═══════════════════════════════════════════════════════════════
describe("Flow 7: project deletion cascade", () => {
  let snapshotId: string;
  let projectId: string;

  const uniquePayload = {
    ...testPayload,
    manifest: {
      ...testPayload.manifest,
      project_name: `delete-cascade-${Date.now()}`,
    },
  };

  it("creates a snapshot to set up project", async () => {
    const r = await req(PORT, "POST", "/v1/snapshots", uniquePayload);
    expect(r.status).toBe(201);
    const d = r.data as Record<string, unknown>;
    snapshotId = d.snapshot_id as string;
    projectId = d.project_id as string;
  });

  it("deletes the project", async () => {
    const r = await req(PORT, "DELETE", `/v1/projects/${projectId}`);
    expect(r.status).toBe(200);
    const d = r.data as Record<string, unknown>;
    expect(d.deleted).toBe(true);
    expect(d.project_id).toBe(projectId);
    expect(typeof d.deleted_snapshots).toBe("number");
  });

  it("snapshot belonging to deleted project is gone", async () => {
    const r = await req(PORT, "GET", `/v1/snapshots/${snapshotId}`);
    expect(r.status).toBe(404);
  });

  it("project context is gone", async () => {
    const r = await req(PORT, "GET", `/v1/projects/${projectId}/context`);
    expect(r.status).toBe(404);
  });
});
