import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb, createAccount, createApiKey, recordUsage } from "@axis/snapshots";
import { Router, createApp, sendJSON } from "./router.js";
import { listAvailableGenerators } from "@axis/generator-core";
import { handleGetAccount, handleCreateAccount, handleCreateApiKey, handleGetUsage, handleUpdateTier, handleUpdatePrograms } from "./billing.js";
import { resetRateLimits } from "./rate-limiter.js";

const TEST_PORT = 44416;
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

// ─── Helper ─────────────────────────────────────────────────────

function makeAuth(name: string, email: string, tier: "free" | "paid" | "suite" = "free") {
  const account = createAccount(name, email, tier);
  const { rawKey } = createApiKey(account.account_id, "test");
  return { account_id: account.account_id, rawKey };
}

// ─── Server setup ───────────────────────────────────────────────

beforeAll(async () => {
  openMemoryDb();
  resetRateLimits();

  const router = new Router();

  // Programs listing (inline handler from server.ts — never tested before)
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

  // Billing routes
  router.post("/v1/accounts", handleCreateAccount);
  router.get("/v1/account", handleGetAccount);
  router.post("/v1/account/keys", handleCreateApiKey);
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

// ─── GET /v1/programs ───────────────────────────────────────────

describe("GET /v1/programs", () => {
  it("returns programs grouped by name", async () => {
    const res = await req("GET", "/v1/programs");
    expect(res.status).toBe(200);
    const programs = res.data.programs as { name: string; outputs: string[]; generator_count: number }[];
    expect(Array.isArray(programs)).toBe(true);
    expect(programs.length).toBeGreaterThan(0);
    for (const p of programs) {
      expect(p.name).toBeTruthy();
      expect(Array.isArray(p.outputs)).toBe(true);
      expect(p.generator_count).toBe(p.outputs.length);
    }
  });

  it("includes total_generators count", async () => {
    const res = await req("GET", "/v1/programs");
    const total = res.data.total_generators as number;
    expect(total).toBeGreaterThan(0);
    // total should equal sum of all program generator_counts
    const programs = res.data.programs as { generator_count: number }[];
    const sum = programs.reduce((s, p) => s + p.generator_count, 0);
    expect(total).toBe(sum);
  });

  it("contains the search program", async () => {
    const res = await req("GET", "/v1/programs");
    const programs = res.data.programs as { name: string }[];
    const names = programs.map((p) => p.name);
    expect(names).toContain("search");
  });

  it("contains all 18 programs", async () => {
    const res = await req("GET", "/v1/programs");
    const programs = res.data.programs as { name: string }[];
    expect(programs.length).toBe(18);
  });

  it("does not require authentication", async () => {
    // No auth header — should still work
    const res = await req("GET", "/v1/programs");
    expect(res.status).toBe(200);
  });

  it("each program output path is a non-empty string", async () => {
    const res = await req("GET", "/v1/programs");
    const programs = res.data.programs as { outputs: string[] }[];
    for (const p of programs) {
      for (const out of p.outputs) {
        expect(typeof out).toBe("string");
        expect(out.length).toBeGreaterThan(0);
      }
    }
  });
});

// ─── GET /v1/account (deeper coverage) ──────────────────────────

describe("GET /v1/account — quota and entitlements", () => {
  it("returns quota breakdown for free account", async () => {
    const { rawKey } = makeAuth("quota-free", "quota-free@test.com", "free");
    const res = await req("GET", "/v1/account", undefined, rawKey);
    expect(res.status).toBe(200);
    const quota = res.data.quota as Record<string, unknown>;
    expect(quota.tier).toBe("free");
    expect(quota.snapshots_this_month).toBe(0);
    expect(typeof quota.max_snapshots_per_month).toBe("number");
    expect(typeof quota.max_projects).toBe("number");
    expect(typeof quota.max_files_per_snapshot).toBe("number");
  });

  it("returns entitlements as array", async () => {
    const { rawKey } = makeAuth("ent-user", "ent-user@test.com", "free");
    const res = await req("GET", "/v1/account", undefined, rawKey);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.entitlements)).toBe(true);
  });

  it("paid account has higher quota limits", async () => {
    const { rawKey: freeKey } = makeAuth("free-lim", "free-lim@test.com", "free");
    const { rawKey: paidKey } = makeAuth("paid-lim", "paid-lim@test.com", "paid");
    const freeRes = await req("GET", "/v1/account", undefined, freeKey);
    const paidRes = await req("GET", "/v1/account", undefined, paidKey);
    const freeQuota = freeRes.data.quota as Record<string, number>;
    const paidQuota = paidRes.data.quota as Record<string, number>;
    expect(paidQuota.max_snapshots_per_month).toBeGreaterThan(freeQuota.max_snapshots_per_month);
  });
});

// ─── GET /v1/account/usage edge cases ───────────────────────────

describe("GET /v1/account/usage", () => {
  it("returns empty usage for new account", async () => {
    const { rawKey } = makeAuth("usage-new", "usage-new@test.com");
    const res = await req("GET", "/v1/account/usage", undefined, rawKey);
    expect(res.status).toBe(200);
    expect(res.data.since).toBe("all_time");
    const totals = res.data.totals as Record<string, number>;
    expect(totals.runs).toBe(0);
    expect(totals.generators).toBe(0);
  });

  it("reflects usage after recording", async () => {
    const { account_id, rawKey } = makeAuth("usage-rec", "usage-rec@test.com");
    recordUsage(account_id, "search", "proj-1", 5, 3, 1024);
    const res = await req("GET", "/v1/account/usage", undefined, rawKey);
    const totals = res.data.totals as Record<string, number>;
    expect(totals.runs).toBe(1);
    expect(totals.generators).toBe(5);
    expect(totals.input_files).toBe(3);
    expect(totals.input_bytes).toBe(1024);
  });

  it("supports ?since= parameter", async () => {
    const { account_id, rawKey } = makeAuth("usage-since", "usage-since@test.com");
    recordUsage(account_id, "debug", "proj-2", 2, 1, 512);
    const future = new Date(Date.now() + 86400000).toISOString();
    const res = await req("GET", `/v1/account/usage?since=${future}`, undefined, rawKey);
    expect(res.status).toBe(200);
    // Since is in the future, should get no usage
    const totals = res.data.totals as Record<string, number>;
    expect(totals.runs).toBe(0);
  });

  it("returns 401 without auth", async () => {
    const res = await req("GET", "/v1/account/usage");
    expect(res.status).toBe(401);
  });
});

// ─── POST /v1/accounts edge cases ──────────────────────────────

describe("POST /v1/accounts — edge cases", () => {
  it("rejects empty body", async () => {
    const res = await req("POST", "/v1/accounts", {});
    expect(res.status).toBe(400);
  });

  it("rejects missing email", async () => {
    const res = await req("POST", "/v1/accounts", { name: "test" });
    expect(res.status).toBe(400);
  });

  it("rejects overly long name", async () => {
    const res = await req("POST", "/v1/accounts", { name: "x".repeat(201), email: "long@test.com" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid email format", async () => {
    const res = await req("POST", "/v1/accounts", { name: "bad", email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid tier value", async () => {
    const res = await req("POST", "/v1/accounts", { name: "test", email: "tier-bad@test.com", tier: "enterprise" });
    expect(res.status).toBe(400);
  });

  it("returns raw_key on success", async () => {
    const res = await req("POST", "/v1/accounts", { name: "key-check", email: "key-check@test.com" });
    expect(res.status).toBe(201);
    expect(res.data.api_key).toBeTruthy();
    const apiKey = res.data.api_key as Record<string, unknown>;
    expect(typeof apiKey.raw_key).toBe("string");
    expect(typeof apiKey.key_id).toBe("string");
  });
});

// ─── POST /v1/account/programs — deeper edge cases ─────────────

describe("POST /v1/account/programs — edge cases", () => {
  it("enabling a program appears in entitlements", async () => {
    const { rawKey } = makeAuth("prog-en", "prog-en@test.com", "paid");
    await req("POST", "/v1/account/programs", { enable: ["search"] }, rawKey);
    const acct = await req("GET", "/v1/account", undefined, rawKey);
    const entitlements = acct.data.entitlements as string[];
    expect(entitlements).toContain("search");
  });

  it("disabling a program removes it from entitlements", async () => {
    const { rawKey } = makeAuth("prog-dis", "prog-dis@test.com", "paid");
    await req("POST", "/v1/account/programs", { enable: ["search", "debug"] }, rawKey);
    await req("POST", "/v1/account/programs", { disable: ["search"] }, rawKey);
    const acct = await req("GET", "/v1/account", undefined, rawKey);
    const entitlements = acct.data.entitlements as string[];
    expect(entitlements).not.toContain("search");
    expect(entitlements).toContain("debug");
  });

  it("suite tier can manage programs", async () => {
    const { rawKey } = makeAuth("prog-suite", "prog-suite@test.com", "suite");
    const res = await req("POST", "/v1/account/programs", { enable: ["frontend"] }, rawKey);
    expect(res.status).toBe(200);
  });

  it("rejects non-existent program name", async () => {
    const { rawKey } = makeAuth("prog-bad", "prog-bad@test.com", "paid");
    const res = await req("POST", "/v1/account/programs", { enable: ["nonexistent_program"] }, rawKey);
    expect(res.status).toBe(400);
  });
});
