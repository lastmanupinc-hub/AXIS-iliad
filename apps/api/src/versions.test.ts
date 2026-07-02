import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  resetTestDb,
  createSnapshot,
  saveGenerationVersion,
  listGenerationVersions,
  getGenerationVersion,
  diffGenerationVersions,
  createAccount,
  createApiKey,
  addPersistenceCredits,
  getPersistenceLedger,
  getEventsByType,
  PERSISTENCE_CREDIT_COSTS,
} from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleHealthCheck } from "./handlers.js";
import { handleListVersions, handleGetVersion, handleDiffVersions } from "./versions.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;
let snapshotId: string;

interface Res { status: number; headers: Record<string, string>; data: Record<string, unknown> }

async function req(method: string, path: string, headers?: Record<string, string>): Promise<Res> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method, headers: { "Content-Type": "application/json", ...headers } },
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
    r.end();
  });
}

async function authHeaders(tier: "free" | "paid" | "suite", label: string): Promise<{ account_id: string; headers: Record<string, string> }> {
  const acct = await createAccount(`${label} User`, `${label}@persistence-test.com`, tier);
  const key = await createApiKey(acct.account_id, label);
  return { account_id: acct.account_id, headers: { Authorization: `Bearer ${key.rawKey}` } };
}

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();

  const snap = await createSnapshot({
    input_method: "api_submission",
    manifest: { project_name: "version-test", project_type: "web_app", frameworks: [], goals: [], requested_outputs: [] },
    files: [{ path: "index.ts", content: "export default 1;", size: 18 }],
  });
  snapshotId = snap.snapshot_id;

  // Create version history
  await saveGenerationVersion(snapshotId, [
    { path: "AGENTS.md", content: "# Agents v1\nInitial" },
    { path: "CLAUDE.md", content: "# Claude v1" },
  ], "skills");

  await saveGenerationVersion(snapshotId, [
    { path: "AGENTS.md", content: "# Agents v2\nUpdated with new rules" },
    { path: "CLAUDE.md", content: "# Claude v1" },
    { path: "CURSOR.md", content: "# Cursor rules" },
  ], "skills");

  await saveGenerationVersion(snapshotId, [
    { path: "AGENTS.md", content: "# Agents v3\nFinal" },
  ], "skills");

  const router = new Router();
  router.get("/v1/health", handleHealthCheck);
  router.get("/v1/snapshots/:snapshot_id/versions", handleListVersions);
  router.get("/v1/snapshots/:snapshot_id/versions/:version_number", handleGetVersion);
  router.get("/v1/snapshots/:snapshot_id/diff", handleDiffVersions);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

// ─── Unit tests ─────────────────────────────────────────────────

describe("version-store unit tests", () => {
  it("saveGenerationVersion auto-increments version number", async () => {
    const versions = await listGenerationVersions(snapshotId);
    expect(versions.length).toBe(3);
    expect(versions[0]!.version_number).toBe(3); // newest first
    expect(versions[1]!.version_number).toBe(2);
    expect(versions[2]!.version_number).toBe(1);
  });

  it("getGenerationVersion retrieves full file content", async () => {
    const v1 = await getGenerationVersion(snapshotId, 1);
    expect(v1).toBeDefined();
    expect(v1!.files.length).toBe(2);
    expect(v1!.files[0]!.path).toBe("AGENTS.md");
    expect(v1!.files[0]!.content).toContain("v1");
  });

  it("getGenerationVersion returns undefined for nonexistent version", async () => {
    expect(await getGenerationVersion(snapshotId, 99)).toBeUndefined();
  });

  it("diffGenerationVersions detects added files", async () => {
    const diff = (await diffGenerationVersions(snapshotId, 1, 2))!;
    expect(diff).toBeDefined();
    const added = diff.files.filter((f) => f.status === "added");
    expect(added.length).toBe(1);
    expect(added[0]!.path).toBe("CURSOR.md");
  });

  it("diffGenerationVersions detects modified files", async () => {
    const diff = (await diffGenerationVersions(snapshotId, 1, 2))!;
    const modified = diff.files.filter((f) => f.status === "modified");
    expect(modified.length).toBe(1);
    expect(modified[0]!.path).toBe("AGENTS.md");
  });

  it("diffGenerationVersions detects unchanged files", async () => {
    const diff = (await diffGenerationVersions(snapshotId, 1, 2))!;
    const unchanged = diff.files.filter((f) => f.status === "unchanged");
    expect(unchanged.length).toBe(1);
    expect(unchanged[0]!.path).toBe("CLAUDE.md");
  });

  it("diffGenerationVersions detects removed files", async () => {
    const diff = (await diffGenerationVersions(snapshotId, 2, 3))!;
    const removed = diff.files.filter((f) => f.status === "removed");
    expect(removed.length).toBe(2); // CLAUDE.md and CURSOR.md removed
  });

  it("diffGenerationVersions summary is correct", async () => {
    const diff = (await diffGenerationVersions(snapshotId, 1, 2))!;
    expect(diff.summary).toEqual({ added: 1, removed: 0, modified: 1, unchanged: 1 });
  });

  it("diffGenerationVersions returns undefined for missing versions", async () => {
    expect(await diffGenerationVersions(snapshotId, 1, 99)).toBeUndefined();
  });
});

// ─── HTTP tests ─────────────────────────────────────────────────

describe("GET /v1/snapshots/:snapshot_id/versions", () => {
  it("lists all versions for a snapshot", async () => {
    const r = await req("GET", `/v1/snapshots/${snapshotId}/versions`);
    expect(r.status).toBe(200);
    const versions = (r.data as any).versions;
    expect(versions.length).toBe(3);
    expect(versions[0].version_number).toBe(3);
  });

  it("returns 404 for unknown snapshot (no existence leak)", async () => {
    const r = await req("GET", "/v1/snapshots/nonexistent/versions");
    expect(r.status).toBe(404);
  });
});

describe("GET /v1/snapshots/:snapshot_id/versions/:version_number", () => {
  it("returns specific version with file content", async () => {
    const r = await req("GET", `/v1/snapshots/${snapshotId}/versions/1`);
    expect(r.status).toBe(200);
    const version = (r.data as any).version;
    expect(version.version_number).toBe(1);
    expect(version.files.length).toBe(2);
  });

  it("returns 404 for nonexistent version", async () => {
    const r = await req("GET", `/v1/snapshots/${snapshotId}/versions/99`);
    expect(r.status).toBe(404);
  });

  it("returns 400 for invalid version number", async () => {
    const r = await req("GET", `/v1/snapshots/${snapshotId}/versions/abc`);
    expect(r.status).toBe(400);
  });
});

describe("GET /v1/snapshots/:snapshot_id/diff", () => {
  it("returns diff between two versions", async () => {
    const r = await req("GET", `/v1/snapshots/${snapshotId}/diff?old=1&new=2`);
    expect(r.status).toBe(200);
    const diff = (r.data as any).diff;
    expect(diff.summary.added).toBe(1);
    expect(diff.summary.modified).toBe(1);
    expect(diff.summary.unchanged).toBe(1);
  });

  it("returns 400 when missing params", async () => {
    const r = await req("GET", `/v1/snapshots/${snapshotId}/diff?old=1`);
    expect(r.status).toBe(400);
  });

  it("returns 400 when same version", async () => {
    const r = await req("GET", `/v1/snapshots/${snapshotId}/diff?old=1&new=1`);
    expect(r.status).toBe(400);
  });

  it("returns 404 for nonexistent versions", async () => {
    const r = await req("GET", `/v1/snapshots/${snapshotId}/diff?old=1&new=99`);
    expect(r.status).toBe(404);
  });
});

// ─── Persistence metering (SPEC-02) ────────────────────────────

describe("GET /v1/snapshots/:snapshot_id/diff — persistence metering", () => {
  it("free-tier account gets 402 persistence_credits_required with the upgrade reason", async () => {
    const free = await authHeaders("free", "diff-free");
    const r = await req("GET", `/v1/snapshots/${snapshotId}/diff?old=1&new=2`, free.headers);
    expect(r.status).toBe(402);
    expect(r.data.error).toBe("persistence_credits_required");
    expect(r.data.reason).toContain("paid plan");
  });

  it("paid account with credits succeeds and debits the persistence ledger", async () => {
    const paid = await authHeaders("paid", "diff-paid");
    await addPersistenceCredits(paid.account_id, 5);

    const r = await req("GET", `/v1/snapshots/${snapshotId}/diff?old=1&new=2`, paid.headers);
    expect(r.status).toBe(200);

    const ledger = await getPersistenceLedger(paid.account_id);
    const spend = ledger.find((e) => e.operation === "diff_versions");
    expect(spend).toBeDefined();
    expect(spend!.credits_delta).toBe(-PERSISTENCE_CREDIT_COSTS.diff_versions);
    expect(spend!.snapshot_id).toBe(snapshotId);

    // SPEC-06: a successful metered op fires persistence_metered.
    const events = await getEventsByType(paid.account_id, "persistence_metered");
    expect(events).toHaveLength(1);
    expect(events[0].metadata.op).toBe("diff_versions");
    expect(events[0].metadata.snapshot_id).toBe(snapshotId);
  });

  it("paid account with zero credits gets 402 and does NOT fire persistence_metered", async () => {
    const paid = await authHeaders("paid", "diff-broke");
    const r = await req("GET", `/v1/snapshots/${snapshotId}/diff?old=1&new=2`, paid.headers);
    expect(r.status).toBe(402);
    expect(r.data.error).toBe("persistence_credits_required");

    const events = await getEventsByType(paid.account_id, "persistence_metered");
    expect(events).toHaveLength(0);
  });

  it("list/get remain un-metered for the same free account (200 semantics unchanged)", async () => {
    const free = await authHeaders("free", "reads-free");
    const list = await req("GET", `/v1/snapshots/${snapshotId}/versions`, free.headers);
    expect(list.status).toBe(200);
    const get = await req("GET", `/v1/snapshots/${snapshotId}/versions/1`, free.headers);
    expect(get.status).toBe(200);
    const ledger = await getPersistenceLedger(free.account_id);
    expect(ledger).toHaveLength(0); // reads never touch the persistence ledger
  });
});

// ─── Ownership guard regression (WO-08 fix 2) ──────────────────

describe("Owned snapshot version endpoints — ownership guard", () => {
  let ownerAcct: { account_id: string; headers: Record<string, string> };
  let otherAcct: { account_id: string; headers: Record<string, string> };
  let ownedSnapshotId: string;

  beforeAll(async () => {
    ownerAcct = await authHeaders("paid", "owner-guard");
    otherAcct = await authHeaders("paid", "other-guard");
    const snap = await createSnapshot(
      {
        input_method: "api_submission",
        manifest: { project_name: "owned-guard-test", project_type: "web_app", frameworks: [], goals: [], requested_outputs: [] },
        files: [{ path: "index.ts", content: "export default 1;", size: 18 }],
      },
      ownerAcct.account_id,
    );
    ownedSnapshotId = snap.snapshot_id;
    await saveGenerationVersion(ownedSnapshotId, [{ path: "AGENTS.md", content: "v1" }], "skills");
    await saveGenerationVersion(ownedSnapshotId, [{ path: "AGENTS.md", content: "v2" }], "skills");
  });

  it("an unauthenticated caller gets 401 from all three endpoints", async () => {
    expect((await req("GET", `/v1/snapshots/${ownedSnapshotId}/versions`)).status).toBe(401);
    expect((await req("GET", `/v1/snapshots/${ownedSnapshotId}/versions/1`)).status).toBe(401);
    expect((await req("GET", `/v1/snapshots/${ownedSnapshotId}/diff?old=1&new=2`)).status).toBe(401);
  });

  it("a different authenticated account gets 404 from all three (no-leak)", async () => {
    expect((await req("GET", `/v1/snapshots/${ownedSnapshotId}/versions`, otherAcct.headers)).status).toBe(404);
    expect((await req("GET", `/v1/snapshots/${ownedSnapshotId}/versions/1`, otherAcct.headers)).status).toBe(404);
    expect((await req("GET", `/v1/snapshots/${ownedSnapshotId}/diff?old=1&new=2`, otherAcct.headers)).status).toBe(404);
  });

  it("neither the unauthenticated nor the non-owner caller produced a persistence debit or a persistence_metered event", async () => {
    await addPersistenceCredits(otherAcct.account_id, 5); // credits present so a leaked diff would actually charge
    await req("GET", `/v1/snapshots/${ownedSnapshotId}/diff?old=1&new=2`, otherAcct.headers);

    const ledger = await getPersistenceLedger(otherAcct.account_id);
    expect(ledger.filter((e) => e.operation === "diff_versions")).toHaveLength(0);
    const events = await getEventsByType(otherAcct.account_id, "persistence_metered");
    expect(events).toHaveLength(0);
  });

  it("the owner still gets 200s from all three endpoints", async () => {
    expect((await req("GET", `/v1/snapshots/${ownedSnapshotId}/versions`, ownerAcct.headers)).status).toBe(200);
    expect((await req("GET", `/v1/snapshots/${ownedSnapshotId}/versions/1`, ownerAcct.headers)).status).toBe(200);
    await addPersistenceCredits(ownerAcct.account_id, 5);
    expect((await req("GET", `/v1/snapshots/${ownedSnapshotId}/diff?old=1&new=2`, ownerAcct.headers)).status).toBe(200);
  });
});
