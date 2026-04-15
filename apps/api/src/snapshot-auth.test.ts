import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb, getDb, recordUsage } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import { handleCreateSnapshot, handleGetSnapshot } from "./handlers.js";
import { handleCreateAccount, handleUpdateTier } from "./billing.js";
import { resetRateLimits } from "./rate-limiter.js";

const TEST_PORT = 44419;
let server: Server;

// ─── HTTP helper ────────────────────────────────────────────────

interface Res {
  status: number;
  data: Record<string, unknown>;
}

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
          let data: Record<string, unknown> = {};
          try { data = JSON.parse(raw); } catch { data = { raw } as Record<string, unknown>; }
          resolve({ status: res.statusCode ?? 0, data });
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
  router.post("/v1/snapshots", handleCreateSnapshot);
  router.get("/v1/snapshots/:snapshot_id", handleGetSnapshot);
  router.post("/v1/accounts", handleCreateAccount);
  router.post("/v1/account/tier", handleUpdateTier);

  server = createApp(router, TEST_PORT);
  await new Promise<void>((r) => setTimeout(r, 100));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  closeDb();
});

beforeEach(() => {
  resetRateLimits();
});

// ─── Helpers ────────────────────────────────────────────────────

function validSnapshot(projectName?: string) {
  return {
    manifest: {
      project_name: projectName ?? `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      project_type: "saas_web_app",
      frameworks: ["react"],
      goals: ["test"],
      requested_outputs: ["AGENTS.md"],
    },
    files: [{ path: "index.ts", content: "export const x = 1;", size: 20 }],
  };
}

/** Snapshot requesting a pro-tier output so quota limits actually trigger */
function proSnapshot(projectName?: string) {
  return {
    manifest: {
      project_name: projectName ?? `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      project_type: "saas_web_app",
      frameworks: ["react"],
      goals: ["test"],
      requested_outputs: [".ai/frontend-rules.md"],
    },
    files: [{ path: "index.ts", content: "export const x = 1;", size: 20 }],
  };
}

async function createTestAccount(name?: string, email?: string) {
  const n = name ?? `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const e = email ?? `${n}@test.com`;
  const r = await req("POST", "/v1/accounts", { name: n, email: e });
  return {
    key: (r.data.api_key as Record<string, unknown>).raw_key as string,
    accountId: (r.data.account as Record<string, unknown>).account_id as string,
  };
}

// ─── Invalid / revoked key ──────────────────────────────────────

describe("auth — invalid key", () => {
  it("returns 401 INVALID_KEY for bogus key", async () => {
    const r = await req("POST", "/v1/snapshots", validSnapshot(), "sk_bogus_totally_fake");
    expect(r.status).toBe(401);
    expect(r.data.error_code).toBe("INVALID_KEY");
  });

  it("returns 401 INVALID_KEY for revoked key", async () => {
    const { key, accountId } = await createTestAccount("revoked", "revoked@test.com");
    // Revoke the key directly in DB
    getDb().prepare("UPDATE api_keys SET revoked_at = ? WHERE account_id = ?").run(new Date().toISOString(), accountId);

    const r = await req("POST", "/v1/snapshots", validSnapshot("revoked-proj"), key);
    expect(r.status).toBe(401);
    expect(r.data.error_code).toBe("INVALID_KEY");
  });
});

// ─── Quota exceeded ─────────────────────────────────────────────

describe("auth — quota exceeded", () => {
  it("returns 429 QUOTA_EXCEEDED when free tier exhausts monthly snapshots with pro outputs", async () => {
    const { key, accountId } = await createTestAccount("quota", "quota@test.com");
    // Seed 9 usage records with fake snapshot_ids (won't create real projects)
    for (let i = 0; i < 9; i++) {
      recordUsage(accountId, "search", `fake-snap-${i}`, 1, 1, 100);
    }
    // 10th snapshot via real HTTP — should succeed (monthly count = 9 < 10)
    const ok = await req("POST", "/v1/snapshots", validSnapshot("quota-project"), key);
    expect(ok.status).toBe(201);
    // 11th snapshot with pro outputs — should be blocked (monthly count = 10 >= 10)
    const r = await req("POST", "/v1/snapshots", proSnapshot("quota-project"), key);
    expect(r.status).toBe(429);
    expect(r.data.error_code).toBe("QUOTA_EXCEEDED");
    expect(r.data.tier).toBe("free");
    expect(r.data.usage).toBeTruthy();
  });

  it("allows free-program-only requests even when quota exceeded", async () => {
    const { key, accountId } = await createTestAccount("freequota", "freequota@test.com");
    // Exhaust quota
    for (let i = 0; i < 10; i++) {
      recordUsage(accountId, "search", `fake-snap-${i}`, 1, 1, 100);
    }
    // Free-only request should still succeed
    const r = await req("POST", "/v1/snapshots", validSnapshot("free-project"), key);
    expect(r.status).toBe(201);
  });

  it("returns 429 when free tier exceeds project limit with pro outputs", async () => {
    const { key, accountId } = await createTestAccount("projlimit", "projlimit@test.com");
    // Free tier allows 1 project — first snapshot creates a project
    const r1 = await req("POST", "/v1/snapshots", validSnapshot("first-project"), key);
    expect(r1.status).toBe(201);

    // Second snapshot with DIFFERENT project name + pro output should fail (2nd project)
    const r2 = await req("POST", "/v1/snapshots", proSnapshot("second-project"), key);
    expect(r2.status).toBe(429);
    expect(r2.data.error_code).toBe("QUOTA_EXCEEDED");
  });
});

// ─── File count limits ──────────────────────────────────────────

describe("auth — file count limits", () => {
  it("returns 413 FILE_COUNT_EXCEEDED when free tier exceeds 1000 files", async () => {
    const { key } = await createTestAccount("filecount", "filecount@test.com");
    const files = Array.from({ length: 1001 }, (_, i) => ({
      path: `file-${i}.ts`,
      content: "x",
      size: 1,
    }));
    const r = await req("POST", "/v1/snapshots", {
      manifest: {
        project_name: "many-files",
        project_type: "web",
        frameworks: ["react"],
        goals: ["test"],
        requested_outputs: ["AGENTS.md"],
      },
      files,
    }, key);
    expect(r.status).toBe(413);
    expect(r.data.error_code).toBe("FILE_COUNT_EXCEEDED");
    expect((r.data.error as string)).toContain("1001");
    expect((r.data.error as string)).toContain("1000");
  });

  it("allows exactly 1000 files for free tier", async () => {
    const { key } = await createTestAccount("exact1000", "exact1000@test.com");
    const files = Array.from({ length: 1000 }, (_, i) => ({
      path: `file-${i}.ts`,
      content: "x",
      size: 1,
    }));
    const r = await req("POST", "/v1/snapshots", {
      manifest: {
        project_name: "one-thousand",
        project_type: "web",
        frameworks: ["react"],
        goals: ["test"],
        requested_outputs: ["AGENTS.md"],
      },
      files,
    }, key);
    expect(r.status).toBe(201);
  });
});

// ─── File size limits ───────────────────────────────────────────

describe("auth — file size limits", () => {
  it("returns 413 FILE_TOO_LARGE when file exceeds free tier 5MB", async () => {
    const { key } = await createTestAccount("bigfile", "bigfile@test.com");
    const r = await req("POST", "/v1/snapshots", {
      manifest: {
        project_name: "big-file-test",
        project_type: "web",
        frameworks: ["react"],
        goals: ["test"],
        requested_outputs: ["AGENTS.md"],
      },
      files: [{
        path: "huge.dat",
        content: "x",
        size: 5 * 1024 * 1024 + 1, // 5MB + 1 byte
      }],
    }, key);
    expect(r.status).toBe(413);
    expect(r.data.error_code).toBe("FILE_TOO_LARGE");
    expect((r.data.error as string)).toContain("huge.dat");
  });

  it("allows exactly 5MB file for free tier", async () => {
    const { key } = await createTestAccount("exact5mb", "exact5mb@test.com");
    const r = await req("POST", "/v1/snapshots", {
      manifest: {
        project_name: "exact-5mb",
        project_type: "web",
        frameworks: ["react"],
        goals: ["test"],
        requested_outputs: ["AGENTS.md"],
      },
      files: [{
        path: "exact.dat",
        content: "x",
        size: 5 * 1024 * 1024, // exactly 5MB
      }],
    }, key);
    expect(r.status).toBe(201);
  });
});

// ─── Tier upgrade unlocks higher limits ─────────────────────────

describe("tier upgrade unlocks limits", () => {
  it("paid tier allows more files than free", async () => {
    const { key } = await createTestAccount("paid-files", "paidfiles@test.com");
    // Upgrade to paid
    await req("POST", "/v1/account/tier", { tier: "paid" }, key);

    const files = Array.from({ length: 201 }, (_, i) => ({
      path: `f-${i}.ts`,
      content: "x",
      size: 1,
    }));
    const r = await req("POST", "/v1/snapshots", {
      manifest: {
        project_name: "paid-many",
        project_type: "web",
        frameworks: ["react"],
        goals: ["test"],
        requested_outputs: ["AGENTS.md"],
      },
      files,
    }, key);
    // 201 files is under paid limit of 2000
    expect(r.status).toBe(201);
  });

  it("paid tier allows larger files than free", async () => {
    const { key } = await createTestAccount("paid-big", "paidbig@test.com");
    await req("POST", "/v1/account/tier", { tier: "paid" }, key);

    const r = await req("POST", "/v1/snapshots", {
      manifest: {
        project_name: "paid-big-file",
        project_type: "web",
        frameworks: ["react"],
        goals: ["test"],
        requested_outputs: ["AGENTS.md"],
      },
      files: [{
        path: "large.dat",
        content: "x",
        size: 10 * 1024 * 1024, // 10MB — over free limit, under paid 50MB
      }],
    }, key);
    expect(r.status).toBe(201);
  });
});

// ─── Anonymous requests bypass tier limits ──────────────────────

describe("anonymous requests", () => {
  it("anonymous snapshot succeeds without auth", async () => {
    const r = await req("POST", "/v1/snapshots", validSnapshot());
    expect(r.status).toBe(201);
    expect(r.data.status).toBe("ready");
  });

  it("anonymous snapshot has no usage recorded", async () => {
    const r = await req("POST", "/v1/snapshots", validSnapshot());
    expect(r.status).toBe(201);
    const snap = await req("GET", `/v1/snapshots/${r.data.snapshot_id}`);
    expect(snap.status).toBe(200);
    expect(snap.data.status).toBe("ready");
  });
});

// ─── Snapshot retrieval ─────────────────────────────────────────

describe("snapshot retrieval", () => {
  it("GET /v1/snapshots/:id returns 404 for non-existent", async () => {
    const r = await req("GET", "/v1/snapshots/nonexistent-id");
    expect(r.status).toBe(404);
    expect(r.data.error_code).toBe("NOT_FOUND");
  });

  it("GET /v1/snapshots/:id returns snapshot details", async () => {
    const create = await req("POST", "/v1/snapshots", validSnapshot());
    expect(create.status).toBe(201);

    const r = await req("GET", `/v1/snapshots/${create.data.snapshot_id}`);
    expect(r.status).toBe(200);
    expect(r.data.snapshot_id).toBe(create.data.snapshot_id);
    expect(r.data.status).toBe("ready");
    expect(r.data.file_count).toBe(1);
    expect(r.data.manifest).toBeTruthy();
  });
});
