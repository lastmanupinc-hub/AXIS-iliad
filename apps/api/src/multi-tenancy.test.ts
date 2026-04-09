import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import {
  handleCreateSnapshot,
  handleGetSnapshot,
  handleDeleteSnapshot,
  handleDeleteProject,
  handleGetContext,
  handleGetGeneratedFiles,
  handleGetGeneratedFile,
  handleSearchIndex,
  handleSearchQuery,
  handleSearchStats,
  handleHealthCheck,
} from "./handlers.js";
import {
  handleCreateAccount,
  handleGetAccount,
  handleCreateApiKey,
  handleListApiKeys,
  handleRevokeApiKey,
  handleGetUsage,
  handleUpdateTier,
  handleUpdatePrograms,
} from "./billing.js";
import { handleExportZip } from "./export.js";
import { resetRateLimits } from "./rate-limiter.js";

const TEST_PORT = 44502;
let server: Server;

// ─── HTTP helper ────────────────────────────────────────────────

interface Res { status: number; headers: Record<string, string>; data: Record<string, unknown> }

async function req(
  method: string,
  path: string,
  body?: unknown,
  authKey?: string,
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authKey) headers["Authorization"] = `Bearer ${authKey}`;
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: TEST_PORT, path, method, headers },
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
    if (payload) r.write(payload);
    r.end();
  });
}

// ─── Server setup ───────────────────────────────────────────────

beforeAll(async () => {
  openMemoryDb();
  resetRateLimits();
  const router = new Router();
  router.get("/v1/health", handleHealthCheck);
  router.post("/v1/snapshots", handleCreateSnapshot);
  router.get("/v1/snapshots/:snapshot_id", handleGetSnapshot);
  router.delete("/v1/snapshots/:snapshot_id", handleDeleteSnapshot);
  router.delete("/v1/projects/:project_id", handleDeleteProject);
  router.get("/v1/projects/:project_id/context", handleGetContext);
  router.get("/v1/projects/:project_id/generated-files", handleGetGeneratedFiles);
  router.get("/v1/projects/:project_id/generated-files/:file_path*", handleGetGeneratedFile);
  router.get("/v1/projects/:project_id/export", handleExportZip);
  router.post("/v1/search/index", handleSearchIndex);
  router.post("/v1/search/query", handleSearchQuery);
  router.get("/v1/search/:snapshot_id/stats", handleSearchStats);
  router.post("/v1/accounts", handleCreateAccount);
  router.get("/v1/account", handleGetAccount);
  router.post("/v1/account/keys", handleCreateApiKey);
  router.get("/v1/account/keys", handleListApiKeys);
  router.post("/v1/account/keys/:key_id/revoke", handleRevokeApiKey);
  router.get("/v1/account/usage", handleGetUsage);
  router.post("/v1/account/tier", handleUpdateTier);
  router.post("/v1/account/programs", handleUpdatePrograms);
  server = createApp(router, TEST_PORT);
  await new Promise<void>((r) => setTimeout(r, 100));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  closeDb();
});

beforeEach(() => {
  resetRateLimits();
});

// ─── Helpers ────────────────────────────────────────────────────

async function createTestAccount(name?: string, email?: string) {
  const n = name ?? `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const e = email ?? `${n}@test.com`;
  const r = await req("POST", "/v1/accounts", { name: n, email: e });
  return {
    account: r.data.account as Record<string, unknown>,
    rawKey: r.data.api_key as Record<string, unknown>,
    key: (r.data.api_key as Record<string, unknown>).raw_key as string,
  };
}

function snapshotBody(projectName: string) {
  return {
    manifest: {
      project_name: projectName,
      project_type: "web_application",
      frameworks: ["react"],
      goals: ["test"],
      requested_outputs: ["AGENTS.md"],
    },
    files: [
      { path: "src/index.ts", content: "export const x = 1;", size: 20 },
      { path: "package.json", content: '{"name":"test","dependencies":{"react":"19.0.0"}}', size: 50 },
    ],
  };
}

// ─── 1. Cross-account snapshot isolation ────────────────────────

describe("cross-account snapshot isolation", () => {
  let alice: { key: string; account: Record<string, unknown> };
  let bob: { key: string; account: Record<string, unknown> };
  let aliceSnapshot: string;
  let aliceProject: string;

  beforeAll(async () => {
    alice = await createTestAccount("alice-iso", "alice-iso@test.com");
    bob = await createTestAccount("bob-iso", "bob-iso@test.com");

    const r = await req("POST", "/v1/snapshots", snapshotBody("alice-private-repo"), alice.key);
    expect(r.status).toBe(201);
    aliceSnapshot = r.data.snapshot_id as string;
    aliceProject = r.data.project_id as string;
  });

  it("owner can GET their own snapshot", async () => {
    const r = await req("GET", `/v1/snapshots/${aliceSnapshot}`, undefined, alice.key);
    expect(r.status).toBe(200);
    expect(r.data.snapshot_id).toBe(aliceSnapshot);
  });

  it("other account cannot GET a snapshot they don't own", async () => {
    const r = await req("GET", `/v1/snapshots/${aliceSnapshot}`, undefined, bob.key);
    expect(r.status).toBe(404);
  });

  it("unauthenticated user cannot GET an owned snapshot", async () => {
    const r = await req("GET", `/v1/snapshots/${aliceSnapshot}`);
    expect(r.status).toBe(401);
  });

  it("other account cannot DELETE a snapshot they don't own", async () => {
    const r = await req("DELETE", `/v1/snapshots/${aliceSnapshot}`, undefined, bob.key);
    expect(r.status).toBe(404);
  });

  it("unauthenticated user cannot DELETE an owned snapshot", async () => {
    const r = await req("DELETE", `/v1/snapshots/${aliceSnapshot}`);
    expect(r.status).toBe(401);
  });

  it("other account cannot GET project context", async () => {
    const r = await req("GET", `/v1/projects/${aliceProject}/context`, undefined, bob.key);
    expect(r.status).toBe(404);
  });

  it("other account cannot GET project generated-files", async () => {
    const r = await req("GET", `/v1/projects/${aliceProject}/generated-files`, undefined, bob.key);
    expect(r.status).toBe(404);
  });

  it("other account cannot GET individual generated file", async () => {
    const r = await req("GET", `/v1/projects/${aliceProject}/generated-files/AGENTS.md`, undefined, bob.key);
    expect(r.status).toBe(404);
  });

  it("other account cannot DELETE project", async () => {
    const r = await req("DELETE", `/v1/projects/${aliceProject}`, undefined, bob.key);
    expect(r.status).toBe(404);
  });

  it("unauthenticated user cannot DELETE owned project", async () => {
    const r = await req("DELETE", `/v1/projects/${aliceProject}`);
    expect(r.status).toBe(401);
  });

  it("other account cannot export project ZIP", async () => {
    const r = await req("GET", `/v1/projects/${aliceProject}/export`, undefined, bob.key);
    expect(r.status).toBe(404);
  });

  it("unauthenticated user cannot export owned project", async () => {
    const r = await req("GET", `/v1/projects/${aliceProject}/export`);
    expect(r.status).toBe(401);
  });

  it("owner can still access all their resources", async () => {
    const snap = await req("GET", `/v1/snapshots/${aliceSnapshot}`, undefined, alice.key);
    expect(snap.status).toBe(200);

    const ctx = await req("GET", `/v1/projects/${aliceProject}/context`, undefined, alice.key);
    expect(ctx.status).toBe(200);

    const files = await req("GET", `/v1/projects/${aliceProject}/generated-files`, undefined, alice.key);
    expect(files.status).toBe(200);
  });
});

// ─── 2. Cross-account search isolation ──────────────────────────

describe("cross-account search isolation", () => {
  let alice: { key: string; account: Record<string, unknown> };
  let bob: { key: string; account: Record<string, unknown> };
  let aliceSnapshot: string;

  beforeAll(async () => {
    alice = await createTestAccount("alice-search", "alice-search@test.com");
    bob = await createTestAccount("bob-search", "bob-search@test.com");

    const r = await req("POST", "/v1/snapshots", snapshotBody("alice-search-repo"), alice.key);
    expect(r.status).toBe(201);
    aliceSnapshot = r.data.snapshot_id as string;

    // Index Alice's snapshot
    const idx = await req("POST", "/v1/search/index", { snapshot_id: aliceSnapshot }, alice.key);
    expect(idx.status).toBe(200);
  });

  it("owner can search their own snapshot", async () => {
    const r = await req("POST", "/v1/search/query", { snapshot_id: aliceSnapshot, query: "export" }, alice.key);
    expect(r.status).toBe(200);
  });

  it("other account cannot index a snapshot they don't own", async () => {
    const r = await req("POST", "/v1/search/index", { snapshot_id: aliceSnapshot }, bob.key);
    expect(r.status).toBe(404);
  });

  it("other account cannot query a snapshot they don't own", async () => {
    const r = await req("POST", "/v1/search/query", { snapshot_id: aliceSnapshot, query: "export" }, bob.key);
    expect(r.status).toBe(404);
  });

  it("other account cannot get search stats for a snapshot they don't own", async () => {
    const r = await req("GET", `/v1/search/${aliceSnapshot}/stats`, undefined, bob.key);
    expect(r.status).toBe(404);
  });

  it("unauthenticated user cannot search an owned snapshot", async () => {
    const r = await req("POST", "/v1/search/query", { snapshot_id: aliceSnapshot, query: "export" });
    expect(r.status).toBe(401);
  });

  it("owner can view search stats", async () => {
    const r = await req("GET", `/v1/search/${aliceSnapshot}/stats`, undefined, alice.key);
    expect(r.status).toBe(200);
    expect(r.data.file_count).toBeGreaterThan(0);
  });
});

// ─── 3. Anonymous snapshot accessibility ────────────────────────

describe("anonymous snapshots remain accessible", () => {
  let anonSnapshot: string;
  let anonProject: string;
  let alice: { key: string; account: Record<string, unknown> };

  beforeAll(async () => {
    alice = await createTestAccount("alice-anon-test", "alice-anon-test@test.com");

    // Create snapshot without auth — anonymous
    const r = await req("POST", "/v1/snapshots", snapshotBody("anon-public-repo"));
    expect(r.status).toBe(201);
    anonSnapshot = r.data.snapshot_id as string;
    anonProject = r.data.project_id as string;
  });

  it("anyone can GET an anonymous snapshot by ID", async () => {
    const r = await req("GET", `/v1/snapshots/${anonSnapshot}`);
    expect(r.status).toBe(200);
    expect(r.data.snapshot_id).toBe(anonSnapshot);
  });

  it("authenticated users can also GET anonymous snapshots", async () => {
    const r = await req("GET", `/v1/snapshots/${anonSnapshot}`, undefined, alice.key);
    expect(r.status).toBe(200);
  });

  it("anyone can GET context for anonymous project", async () => {
    const r = await req("GET", `/v1/projects/${anonProject}/context`);
    expect(r.status).toBe(200);
  });

  it("anyone can GET generated files for anonymous project", async () => {
    const r = await req("GET", `/v1/projects/${anonProject}/generated-files`);
    expect(r.status).toBe(200);
  });

  it("anyone can DELETE anonymous snapshot", async () => {
    // Create a second anonymous snapshot so we can delete it without affecting other tests
    const r2 = await req("POST", "/v1/snapshots", snapshotBody("anon-deletable-repo"));
    expect(r2.status).toBe(201);
    const delId = r2.data.snapshot_id as string;

    const d = await req("DELETE", `/v1/snapshots/${delId}`);
    expect(d.status).toBe(200);
    expect(d.data.deleted).toBe(true);
  });

  it("anyone can search index an anonymous snapshot", async () => {
    const r = await req("POST", "/v1/search/index", { snapshot_id: anonSnapshot });
    expect(r.status).toBe(200);
  });

  it("anyone can search query an anonymous snapshot", async () => {
    const r = await req("POST", "/v1/search/query", { snapshot_id: anonSnapshot, query: "export" });
    expect(r.status).toBe(200);
  });
});

// ─── 4. Project namespace isolation ─────────────────────────────

describe("project namespace isolation", () => {
  let alice: { key: string; account: Record<string, unknown> };
  let bob: { key: string; account: Record<string, unknown> };
  let aliceProject: string;
  let bobProject: string;

  beforeAll(async () => {
    alice = await createTestAccount("alice-ns", "alice-ns@test.com");
    bob = await createTestAccount("bob-ns", "bob-ns@test.com");
    // Upgrade to paid so quota doesn't block re-upload test
    await req("POST", "/v1/account/tier", { tier: "paid" }, alice.key);
    await req("POST", "/v1/account/tier", { tier: "paid" }, bob.key);
  });

  it("different accounts can use the same project name", async () => {
    const a = await req("POST", "/v1/snapshots", snapshotBody("shared-name-repo"), alice.key);
    expect(a.status).toBe(201);
    aliceProject = a.data.project_id as string;

    const b = await req("POST", "/v1/snapshots", snapshotBody("shared-name-repo"), bob.key);
    expect(b.status).toBe(201);
    bobProject = b.data.project_id as string;

    // Different accounts get different project_ids even with same name
    expect(aliceProject).not.toBe(bobProject);
  });

  it("Alice cannot see Bob's same-name project", async () => {
    const r = await req("GET", `/v1/projects/${bobProject}/context`, undefined, alice.key);
    expect(r.status).toBe(404);
  });

  it("Bob cannot see Alice's same-name project", async () => {
    const r = await req("GET", `/v1/projects/${aliceProject}/context`, undefined, bob.key);
    expect(r.status).toBe(404);
  });

  it("same account reuses project on re-upload", async () => {
    const a2 = await req("POST", "/v1/snapshots", snapshotBody("shared-name-repo"), alice.key);
    expect(a2.status).toBe(201);
    // Same account, same project name → same project_id (new snapshot version)
    expect(a2.data.project_id).toBe(aliceProject);
  });
});

// ─── 5. Ownership tagging on create ─────────────────────────────

describe("ownership tagging", () => {
  it("authenticated snapshot has account_id set", async () => {
    const acct = await createTestAccount("owner-tag", "owner-tag@test.com");
    const r = await req("POST", "/v1/snapshots", snapshotBody("owned-repo"), acct.key);
    expect(r.status).toBe(201);

    const snap = await req("GET", `/v1/snapshots/${r.data.snapshot_id}`, undefined, acct.key);
    expect(snap.status).toBe(200);
    // The snapshot should be owned and only accessible to the owner
    const bobAcct = await createTestAccount("not-owner", "not-owner@test.com");
    const deny = await req("GET", `/v1/snapshots/${r.data.snapshot_id}`, undefined, bobAcct.key);
    expect(deny.status).toBe(404);
  });

  it("anonymous snapshot has no account_id restriction", async () => {
    const r = await req("POST", "/v1/snapshots", snapshotBody("no-owner-repo"));
    expect(r.status).toBe(201);

    // Accessible without auth
    const snap = await req("GET", `/v1/snapshots/${r.data.snapshot_id}`);
    expect(snap.status).toBe(200);

    // Also accessible with any auth
    const randomAcct = await createTestAccount("random-viewer", "random-viewer@test.com");
    const snap2 = await req("GET", `/v1/snapshots/${r.data.snapshot_id}`, undefined, randomAcct.key);
    expect(snap2.status).toBe(200);
  });
});
