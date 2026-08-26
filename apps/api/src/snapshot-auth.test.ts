import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { resetTestDb, sql, recordUsage, discardAccountSnapshotContent } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleCreateSnapshot, handleGetSnapshot, makeProgramHandler, handleSkillsGenerate, handleSearchExport } from "./handlers.js";
import { handleCreateAccount, handleUpdateTier } from "./billing.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;

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
      { hostname: "127.0.0.1", port: testPort, path, method, headers },
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
  await resetTestDb();
  resetRateLimits();

  const router = new Router();
  router.post("/v1/snapshots", handleCreateSnapshot);
  router.get("/v1/snapshots/:snapshot_id", handleGetSnapshot);
  router.post("/v1/accounts", handleCreateAccount);
  router.post("/v1/account/tier", handleUpdateTier);
  // Endpoints from the security audit's IDOR cluster (debug is a FREE program, so
  // makeProgramHandler reaches the ownership check without a billing gate masking it).
  router.post("/v1/debug/analyze", makeProgramHandler("debug", ["debug-playbook.md"]));
  router.post("/v1/skills/generate", handleSkillsGenerate);
  router.post("/v1/search/export", handleSearchExport);

  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
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
      // ui-audit.md, not frontend-rules.md: the latter is now one of the
      // FREE artifacts every program ships, so it no longer exercises a paid
      // path at all. This helper exists to trip the PAID gate.
      requested_outputs: ["ui-audit.md"],
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
    await sql.run("UPDATE api_keys SET revoked_at = ? WHERE account_id = ?", [new Date().toISOString(), accountId]);

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
      await recordUsage(accountId, "search", `fake-snap-${i}`, 1, 1, 100);
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
      await recordUsage(accountId, "search", `fake-snap-${i}`, 1, 1, 100);
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
  it("returns 413 FILE_COUNT_EXCEEDED when free tier exceeds 2000 files", async () => {
    const { key } = await createTestAccount("filecount", "filecount@test.com");
    const files = Array.from({ length: 2001 }, (_, i) => ({
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
    expect((r.data.error as string)).toContain("2001");
    expect((r.data.error as string)).toContain("2000");
  });

  it("allows exactly 2000 files for free tier", async () => {
    const { key } = await createTestAccount("exact2000", "exact2000@test.com");
    const files = Array.from({ length: 2000 }, (_, i) => ({
      path: `file-${i}.ts`,
      content: "x",
      size: 1,
    }));
    const r = await req("POST", "/v1/snapshots", {
      manifest: {
        project_name: "two-thousand",
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
  it("returns 413 FILE_TOO_LARGE when file exceeds free tier 50MB", async () => {
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
        size: 50 * 1024 * 1024 + 1, // 50MB + 1 byte
      }],
    }, key);
    expect(r.status).toBe(413);
    expect(r.data.error_code).toBe("FILE_TOO_LARGE");
    expect((r.data.error as string)).toContain("huge.dat");
  });

  it("allows exactly 50MB file for free tier", async () => {
    const { key } = await createTestAccount("exact50mb", "exact50mb@test.com");
    const r = await req("POST", "/v1/snapshots", {
      manifest: {
        project_name: "exact-50mb",
        project_type: "web",
        frameworks: ["react"],
        goals: ["test"],
        requested_outputs: ["AGENTS.md"],
      },
      files: [{
        path: "exact.dat",
        content: "x",
        size: 50 * 1024 * 1024, // exactly 50MB
      }],
    }, key);
    expect(r.status).toBe(201);
  });
});

// ─── Tier upgrade unlocks unlimited caps ────────────────────────
// Paid/suite have NO file-count or file-size cap (docs/saas-strategy —
// the tier differentiator moved to max_snapshots_per_month, not upload
// size). These prove UNLIMITED specifically: every file count/size below
// used a value that would ALSO fail free's own (now-raised) 2000-file /
// 50MB cap, so passing only works if paid truly has no ceiling — not just
// "a higher one than free".

describe("tier upgrade unlocks unlimited caps", () => {
  it("paid tier accepts a file count well over free's 2000-file cap", async () => {
    const { key } = await createTestAccount("paid-files", "paidfiles@test.com");
    await req("POST", "/v1/account/tier", { tier: "paid" }, key);

    const files = Array.from({ length: 2500 }, (_, i) => ({
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
    expect(r.status).toBe(201);
  });

  it("paid tier accepts a file well over free's 50MB cap", async () => {
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
        size: 200 * 1024 * 1024, // 200MB — well over free's 50MB cap
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

// ─── R5.7: discarded source content (web-logout) ─────────────────
// discardAccountSnapshotContent is exercised end-to-end via the cookie-based
// /v1/auth/logout flow in oauth.test.ts; here we simulate "already discarded"
// directly (this file's router uses Bearer-key auth, not cookies) to prove
// every source-reading endpoint degrades to a clear 410, never a silent
// empty-content generation or a misleading compliance grade.

describe("discarded snapshot content (post-logout)", () => {
  it("GET /v1/snapshots/:id reports content_discarded_at and a null compliance_grade", async () => {
    const { key, accountId } = await createTestAccount();
    const created = await req("POST", "/v1/snapshots", validSnapshot(), key);
    await discardAccountSnapshotContent(accountId);

    const r = await req("GET", `/v1/snapshots/${created.data.snapshot_id}`, undefined, key);
    expect(r.status).toBe(200);
    expect(r.data.content_discarded_at).toBeTruthy();
    expect(r.data.compliance_grade).toBeNull();
  });

  it("POST /v1/debug/analyze returns 410 CONTENT_DISCARDED instead of generating from empty source", async () => {
    const { key, accountId } = await createTestAccount();
    const created = await req("POST", "/v1/snapshots", validSnapshot(), key);
    await discardAccountSnapshotContent(accountId);

    const r = await req("POST", "/v1/debug/analyze", { snapshot_id: created.data.snapshot_id }, key);
    expect(r.status).toBe(410);
    expect(r.data.error_code).toBe("CONTENT_DISCARDED");
  });

  it("POST /v1/skills/generate returns 410 CONTENT_DISCARDED instead of generating from empty source", async () => {
    const { key, accountId } = await createTestAccount();
    const created = await req("POST", "/v1/snapshots", validSnapshot(), key);
    await discardAccountSnapshotContent(accountId);

    const r = await req("POST", "/v1/skills/generate", { snapshot_id: created.data.snapshot_id }, key);
    expect(r.status).toBe(410);
    expect(r.data.error_code).toBe("CONTENT_DISCARDED");
  });

  it("an anonymous (unowned) snapshot can never be discarded, so it keeps generating normally", async () => {
    const created = await req("POST", "/v1/snapshots", validSnapshot());
    const r = await req("POST", "/v1/debug/analyze", { snapshot_id: created.data.snapshot_id });
    expect(r.status).toBe(200);
  });
});

// ─── Cross-tenant IDOR (security audit remediation) ─────────────
// Generation/export endpoints take a user-supplied snapshot_id; an OWNED snapshot must
// only be readable by its owner, or a caller could harvest artifacts that embed the
// victim's source. Anonymous (unowned) snapshots stay shareable by ID, by design.

describe("tenancy — owned snapshots resist cross-tenant reads", () => {
  let ownerKey = "";
  let attackerKey = "";
  let ownedId = "";
  let anonId = "";

  beforeAll(async () => {
    ownerKey = (await createTestAccount("idor-owner", "idor-owner@test.com")).key;
    attackerKey = (await createTestAccount("idor-attacker", "idor-attacker@test.com")).key;
    ownedId = (await req("POST", "/v1/snapshots", validSnapshot("idor-owned"), ownerKey)).data.snapshot_id as string;
    anonId = (await req("POST", "/v1/snapshots", validSnapshot("idor-anon"))).data.snapshot_id as string;
  });

  const ENDPOINTS = ["/v1/debug/analyze", "/v1/skills/generate", "/v1/search/export"];

  for (const path of ENDPOINTS) {
    it(`${path} — 401 for an anonymous caller against an owned snapshot`, async () => {
      const r = await req("POST", path, { snapshot_id: ownedId });
      expect(r.status).toBe(401);
    });
    it(`${path} — 404 for a different account against an owned snapshot`, async () => {
      const r = await req("POST", path, { snapshot_id: ownedId }, attackerKey);
      expect(r.status).toBe(404);
    });
    it(`${path} — 200 for the owner`, async () => {
      const r = await req("POST", path, { snapshot_id: ownedId }, ownerKey);
      expect(r.status).toBe(200);
    });
    it(`${path} — 200 serving an anonymous (unowned) snapshot to anyone (unchanged)`, async () => {
      const r = await req("POST", path, { snapshot_id: anonId }, attackerKey);
      expect(r.status).toBe(200);
    });
  }
});

// ─── Oversized-upload 413s carry a way forward ──────────────────
//
// `handleAnalyze` returned accommodating_tier / upgrade_url / upgrade_note on
// its 413s; its `handleCreateSnapshot` twin returned a bare "limit exceeded"
// with no remedy — the same REST-twin divergence this codebase keeps finding.
// A caller who hit the cap on POST /v1/snapshots was told they failed and
// nothing else.
//
// Note what these deliberately do NOT assert: that the response points at the
// sibling endpoint. Both gate anonymous callers on the identical
// TIER_LIMITS.free caps, so "try /v1/snapshots instead" would be a false
// promise costing the caller a guaranteed-failing retry.

describe("oversized-upload 413s include upgrade guidance", () => {
  const oversized = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ path: `file-${i}.ts`, content: "x", size: 1 }));

  const manifest = {
    project_name: "oversized",
    project_type: "web",
    frameworks: ["react"],
    goals: ["test"],
    requested_outputs: ["AGENTS.md"],
  };

  it("POST /v1/snapshots file-count 413 names a tier that would actually fit", async () => {
    const { key } = await createTestAccount("guidance413", "guidance413@test.com");
    const r = await req("POST", "/v1/snapshots", { manifest, files: oversized(2001) }, key);

    expect(r.status).toBe(413);
    expect(r.data.error_code).toBe("FILE_COUNT_EXCEEDED");
    // The remedy half — absent before this fix. Paid has no cap at all now, so
    // the note says so in words rather than interpolating -1.
    expect(r.data.accommodating_tier).toBe("paid");
    expect(r.data.upgrade_url).toContain("iliad.trustfabric.ai");
    expect(String(r.data.upgrade_note)).toContain("no file-count or file-size limit");
  });

  it("never tells a 413'd caller to retry against the sibling endpoint (identical caps)", async () => {
    const { key } = await createTestAccount("nosibling413", "nosibling413@test.com");
    const r = await req("POST", "/v1/snapshots", { manifest, files: oversized(2001) }, key);

    expect(r.status).toBe(413);
    const body = JSON.stringify(r.data);
    expect(body).not.toContain("/v1/analyze");
  });

  // "No tier could fit" no longer has a reachable scenario: paid and suite both
  // have no file-count/file-size cap (docs/saas-strategy — the differentiator
  // moved to max_snapshots_per_month), so no file count can ever fail to find
  // an accommodating tier from a free-tier caller. Removed rather than left
  // pinning a case that can no longer occur.
  it("suite tier itself never hits a file-count 413 — no cap exists to exceed", async () => {
    const { key } = await createTestAccount("nocap413", "nocap413@test.com");
    await req("POST", "/v1/account/tier", { tier: "suite" }, key);
    const r = await req("POST", "/v1/snapshots", { manifest, files: oversized(5001) }, key);
    expect(r.status).toBe(201);
  });
});
