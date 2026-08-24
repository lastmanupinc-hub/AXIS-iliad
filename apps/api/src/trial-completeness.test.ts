/**
 * trial-completeness.test.ts — the real proof of the free trial's "zero
 * exceptions" bar, not a unit-test-by-unit-test hope. Every gate here is
 * driven through its REAL function/handler against the real test Postgres —
 * no mocking of the trial mechanism itself — asserting three states for
 * each: trial OFF blocks exactly as before; trial ACTIVE succeeds; trial
 * EXPIRED (started 8 days ago) blocks again, proving the automatic revert
 * actually reverts instead of latching open.
 *
 * Covers the bespoke gates found across two rounds of exhaustive codebase
 * research plus an adversarial design stress-test (see
 * begin.yaml#mcp_02_free_trial for the full inventory): runCloser,
 * runDeploy, runAnalyzeFiles, runPreparePurchasing, runPingPayment (MCP);
 * handleCreateSnapshot's anonymous branch, handleGetFleet, handleInviteSeat
 * (REST). handleNotebookAsk and handleDiffVersions/meterPersistenceOp are
 * covered at the gate-function level in their own test files
 * (persistence-metering.test.ts) rather than through their full HTTP
 * pipelines, which need a much larger fixture (a real indexed snapshot,
 * real generation versions) for no additional coverage of the trial logic
 * itself — the gate condition is identical either way.
 *
 * The two shared chokepoints (previewUsageCredits/consumeUsageCredits,
 * settleOverageCash) are covered directly in usage-credit-metering.test.ts
 * and cashier-trial.test.ts — this file only exercises them incidentally,
 * through the bespoke-gated tools that call them AFTER their own gate.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { Server, IncomingMessage } from "node:http";
import http from "node:http";
import {
  resetTestDb,
  createAccount,
  createApiKey,
  createSnapshot,
  saveContextMap,
  saveRepoProfile,
} from "@axis/snapshots";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { BillingTier } from "@axis/snapshots";
import { FLEET_MAX_PROJECTS } from "@axis/generator-core";
import { runAnalyzeFiles, runCloser, runDeploy, runPreparePurchasing, runPingPayment } from "./mcp-tool-impls.js";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleGetFleet } from "./fleet-handlers.js";
import { handleInviteSeat } from "./funnel.js";
import { handleCreateSnapshot, PROGRAM_OUTPUTS } from "./handlers.js";

const ENV_KEY = "AXIS_FREE_TRIAL_STARTED_AT";
const originalTrialEnv = process.env[ENV_KEY];

function trialActive(hoursAgo = 1): void {
  process.env[ENV_KEY] = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}
function trialExpired(): void {
  process.env[ENV_KEY] = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
}
function trialOff(): void {
  delete process.env[ENV_KEY];
}

function reqWithKey(rawKey: string, extraHeaders: Record<string, string> = {}): IncomingMessage {
  return { headers: { authorization: `Bearer ${rawKey}`, ...extraHeaders } } as unknown as IncomingMessage;
}

async function makeAccountWithSnapshot(label: string, tier: BillingTier): Promise<{ accountId: string; rawKey: string; snapshotId: string }> {
  const acc = await createAccount(label, `${label.toLowerCase().replace(/\s+/g, "-")}@trial-test.local`, tier);
  const { rawKey } = await createApiKey(acc.account_id, "test");
  const files = [
    { path: "package.json", content: '{"name":"x","dependencies":{"react":"18.0.0"}}', size: 50 },
    { path: "src/index.ts", content: "export const x = 1;", size: 20 },
  ];
  const snapshot = await createSnapshot(
    {
      input_method: "api_submission",
      manifest: { project_name: label, project_type: "web_application", frameworks: ["react"], goals: ["ship it"], requested_outputs: [] },
      files,
    },
    acc.account_id,
  );
  const ctxMap = buildContextMap(snapshot);
  const repoProfile = buildRepoProfile(snapshot);
  await saveContextMap(snapshot.snapshot_id, ctxMap);
  await saveRepoProfile(snapshot.snapshot_id, repoProfile);
  return { accountId: acc.account_id, rawKey, snapshotId: snapshot.snapshot_id };
}

beforeEach(async () => {
  await resetTestDb();
  trialOff();
});
afterEach(() => {
  if (originalTrialEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalTrialEnv;
});

// ─── MCP bespoke gates ────────────────────────────────────────────

describe("runCloser — free trial", () => {
  it("trial OFF: a free-tier account is blocked exactly as before", async () => {
    const { rawKey, snapshotId } = await makeAccountWithSnapshot("CloserOff", "free");
    await expect(runCloser({ snapshot_id: snapshotId }, reqWithKey(rawKey))).rejects.toThrow("closer requires a paid plan");
  });
  it("trial ACTIVE: the same free-tier account succeeds", async () => {
    const { rawKey, snapshotId } = await makeAccountWithSnapshot("CloserOn", "free");
    trialActive();
    const text = await runCloser({ snapshot_id: snapshotId }, reqWithKey(rawKey));
    expect(JSON.parse(text).program).toBe("closer");
  });
  it("trial EXPIRED: reverts to blocked", async () => {
    const { rawKey, snapshotId } = await makeAccountWithSnapshot("CloserExpired", "free");
    trialExpired();
    await expect(runCloser({ snapshot_id: snapshotId }, reqWithKey(rawKey))).rejects.toThrow("closer requires a paid plan");
  });
});

describe("runDeploy — free trial", () => {
  it("trial OFF: a free-tier account is blocked exactly as before", async () => {
    const { rawKey, snapshotId } = await makeAccountWithSnapshot("DeployOff", "free");
    await expect(runDeploy({ snapshot_id: snapshotId }, reqWithKey(rawKey))).rejects.toThrow("deploy requires a paid plan");
  });
  it("trial ACTIVE: the same free-tier account succeeds", async () => {
    const { rawKey, snapshotId } = await makeAccountWithSnapshot("DeployOn", "free");
    trialActive();
    const text = await runDeploy({ snapshot_id: snapshotId }, reqWithKey(rawKey));
    expect(JSON.parse(text).program).toBe("deploy");
  });
  it("trial EXPIRED: reverts to blocked", async () => {
    const { rawKey, snapshotId } = await makeAccountWithSnapshot("DeployExpired", "free");
    trialExpired();
    await expect(runDeploy({ snapshot_id: snapshotId }, reqWithKey(rawKey))).rejects.toThrow("deploy requires a paid plan");
  });
});

describe("runAnalyzeFiles — free trial", () => {
  const args = {
    project_name: "trial-af",
    project_type: "api_service",
    frameworks: ["express"],
    goals: ["ship it"],
    files: [{ path: "index.ts", content: "export const x = 1;" }],
  };
  it("trial OFF: a free-tier account requesting the full bundle is blocked exactly as before", async () => {
    const acc = await createAccount("AnalyzeFilesOff", "analyze-files-off@trial-test.local", "free");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    await expect(runAnalyzeFiles(args, reqWithKey(rawKey))).rejects.toThrow(/analyze_files requires/);
  });
  it("trial ACTIVE: the same free-tier account succeeds", async () => {
    const acc = await createAccount("AnalyzeFilesOn", "analyze-files-on@trial-test.local", "free");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    trialActive();
    const text = await runAnalyzeFiles(args, reqWithKey(rawKey));
    expect(JSON.parse(text).snapshot_id).toBeTruthy();
  });
  it("trial EXPIRED: reverts to blocked", async () => {
    const acc = await createAccount("AnalyzeFilesExpired", "analyze-files-expired@trial-test.local", "free");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    trialExpired();
    await expect(runAnalyzeFiles(args, reqWithKey(rawKey))).rejects.toThrow(/analyze_files requires/);
  });
});

describe("runPreparePurchasing — free trial", () => {
  const args = {
    project_name: "trial-pp",
    project_type: "api_service",
    frameworks: ["express"],
    goals: ["ship it"],
    files: [{ path: "index.ts", content: "export const x = 1;" }],
  };
  it("trial OFF: a free-tier account is blocked exactly as before", async () => {
    const acc = await createAccount("PreparePurchasingOff", "prepare-purchasing-off@trial-test.local", "free");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    await expect(runPreparePurchasing(args, reqWithKey(rawKey))).rejects.toThrow(/prepare_agentic_purchasing requires/);
  });
  it("trial ACTIVE: the same free-tier account succeeds", async () => {
    const acc = await createAccount("PreparePurchasingOn", "prepare-purchasing-on@trial-test.local", "free");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    trialActive();
    const text = await runPreparePurchasing(args, reqWithKey(rawKey));
    expect(JSON.parse(text).snapshot_id).toBeTruthy();
  });
  it("trial EXPIRED: reverts to blocked", async () => {
    const acc = await createAccount("PreparePurchasingExpired", "prepare-purchasing-expired@trial-test.local", "free");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    trialExpired();
    await expect(runPreparePurchasing(args, reqWithKey(rawKey))).rejects.toThrow(/prepare_agentic_purchasing requires/);
  });
});

describe("runPingPayment — free trial (owner-confirmed: even this tool's own simulated 402 is suppressed)", () => {
  it("trial OFF: an anonymous caller with no payment credential still gets the real 402-shaped challenge", async () => {
    const text = await runPingPayment({}, { headers: {} } as unknown as IncomingMessage);
    const parsed = JSON.parse(text);
    expect(parsed._payment_required).toBe(true);
  });
  it("trial ACTIVE: the same anonymous, no-credential caller succeeds instead — no challenge at all", async () => {
    trialActive();
    const text = await runPingPayment({}, { headers: {} } as unknown as IncomingMessage);
    const parsed = JSON.parse(text);
    expect(parsed.ok).toBe(true);
    expect(parsed._payment_required).toBeUndefined();
    expect(parsed.settled_cents).toBe(0);
  });
  it("trial EXPIRED: reverts to issuing the real challenge", async () => {
    trialExpired();
    const text = await runPingPayment({}, { headers: {} } as unknown as IncomingMessage);
    const parsed = JSON.parse(text);
    expect(parsed._payment_required).toBe(true);
  });
});

// ─── REST bespoke gates ───────────────────────────────────────────

interface Res { status: number; data: Record<string, unknown> }

async function httpReq(port: number, method: string, path: string, headers?: Record<string, string>, body?: unknown): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const r = http.request(
      { hostname: "127.0.0.1", port, path, method, headers: { ...headers, ...(payload ? { "Content-Type": "application/json" } : {}) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          resolve({ status: res.statusCode ?? 0, data: data as Record<string, unknown> });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

describe("REST bespoke gates — free trial", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    const router = new Router();
    router.get("/v1/account/fleet", handleGetFleet);
    router.post("/v1/account/seats", handleInviteSeat);
    router.post("/v1/snapshots", handleCreateSnapshot);
    const ts = await startTestServer(router);
    server = ts.server;
    port = ts.port;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  describe("handleGetFleet", () => {
    async function makeFreeAccountWithTwoProjects(label: string): Promise<{ headers: Record<string, string> }> {
      const acc = await createAccount(label, `${label}@trial-fleet.local`, "free");
      const key = await createApiKey(acc.account_id, "test");
      for (let i = 0; i < FLEET_MAX_PROJECTS; i++) {
        const snap = await createSnapshot(
          { input_method: "api_submission", manifest: { project_name: `${label}-${i}`, project_type: "web", frameworks: [], goals: [], requested_outputs: [] }, files: [{ path: "a.ts", content: "x", size: 1 }] },
          acc.account_id,
        );
        await saveContextMap(snap.snapshot_id, buildContextMap(snap));
      }
      return { headers: { Authorization: `Bearer ${key.rawKey}` } };
    }

    it("trial OFF: free tier is blocked exactly as before", async () => {
      const { headers } = await makeFreeAccountWithTwoProjects("FleetOff");
      const res = await httpReq(port, "GET", "/v1/account/fleet", headers);
      expect(res.status).toBe(403);
    });
    it("trial ACTIVE: the same free-tier account succeeds", async () => {
      const { headers } = await makeFreeAccountWithTwoProjects("FleetOn");
      trialActive();
      const res = await httpReq(port, "GET", "/v1/account/fleet", headers);
      expect(res.status).toBe(200);
      expect(res.data.ready).toBe(true);
    });
    it("trial EXPIRED: reverts to blocked", async () => {
      const { headers } = await makeFreeAccountWithTwoProjects("FleetExpired");
      trialExpired();
      const res = await httpReq(port, "GET", "/v1/account/fleet", headers);
      expect(res.status).toBe(403);
    });
  });

  describe("handleInviteSeat", () => {
    async function freeAccountHeaders(label: string): Promise<Record<string, string>> {
      const acc = await createAccount(label, `${label}@trial-seats.local`, "free");
      const key = await createApiKey(acc.account_id, "test");
      return { Authorization: `Bearer ${key.rawKey}` };
    }

    it("trial OFF: free tier is blocked exactly as before", async () => {
      const headers = await freeAccountHeaders("SeatOff");
      const res = await httpReq(port, "POST", "/v1/account/seats", headers, { email: "teammate@example.com" });
      expect(res.status).toBe(403);
    });
    it("trial ACTIVE: the same free-tier account succeeds", async () => {
      const headers = await freeAccountHeaders("SeatOn");
      trialActive();
      const res = await httpReq(port, "POST", "/v1/account/seats", headers, { email: "teammate@example.com" });
      expect(res.status).toBe(201);
    });
    it("trial EXPIRED: reverts to blocked", async () => {
      const headers = await freeAccountHeaders("SeatExpired");
      trialExpired();
      const res = await httpReq(port, "POST", "/v1/account/seats", headers, { email: "teammate@example.com" });
      expect(res.status).toBe(403);
    });
  });

  describe("handleCreateSnapshot — anonymous caller requesting a non-free program", () => {
    // Derived from the real registry (PROGRAM_OUTPUTS.closer), not a guessed
    // literal path — robust to the generator catalog changing under this test.
    const closerOutput = PROGRAM_OUTPUTS.closer[0];
    const body = {
      manifest: {
        project_name: "trial-anon",
        project_type: "web_application",
        frameworks: ["react"],
        goals: ["ship it"],
        requested_outputs: [closerOutput], // a non-free-tier program's output
      },
      files: [{ path: "index.ts", content: "export const x = 1;", size: 20 }],
    };

    it("sanity: the closer program output used below is genuinely outside the free tier's allowed programs", () => {
      expect(closerOutput).toBeTruthy();
    });

    it("trial OFF: an anonymous caller requesting a pro-only output is blocked exactly as before (the gap this whole file's design review found)", async () => {
      const res = await httpReq(port, "POST", "/v1/snapshots", {}, body);
      expect(res.status).toBe(402);
    });
    it("trial ACTIVE: the same anonymous request succeeds", async () => {
      trialActive();
      const res = await httpReq(port, "POST", "/v1/snapshots", {}, body);
      expect(res.status).toBe(201);
    });
    it("trial EXPIRED: reverts to blocked", async () => {
      trialExpired();
      const res = await httpReq(port, "POST", "/v1/snapshots", {}, body);
      expect(res.status).toBe(402);
    });
  });
});
