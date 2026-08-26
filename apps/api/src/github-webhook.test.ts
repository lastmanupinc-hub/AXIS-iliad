import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleGitHubWebhook, verifyGitHubSignature, resetGitHubWebhookState } from "./github-webhook.js";
import { fetchGitHubRepo } from "./github.js";
import { enqueueWatchJob } from "@axis/snapshots";

// ─── Watchtower delta mocks (SPEC-04) ───────────────────────────
//
// dispatchWebhookSnapshot() is internal + fire-and-forget: the HTTP response returns
// before it settles, and it dynamically imports ./github.js + @axis/snapshots. Mocking
// both here (this file didn't mock either before) lets the new delta tests control
// snapshot IDs/context-map presence deterministically instead of racing a real DB.

const watchtowerState = vi.hoisted(() => ({
  snapshotsByProject: new Map<string, string[]>(),
  contextMaps: new Map<string, unknown>(),
  repoProfiles: new Map<string, unknown>(),
  generatorResults: new Map<string, unknown>(),
  nextId: 0,
  // Watch mechanic (app_01, docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md):
  // repo -> subscribers a test can seed, and every watch job the code under
  // test actually enqueued, so a test can assert on real call data instead of
  // just "it didn't throw".
  subscriptionsByRepo: new Map<string, Array<{ account_id: string; product_id: string }>>(),
  enqueuedWatchJobs: [] as Array<{ account_id: string; product_id: string; repo_full_name: string; event_type: string; ref: string; pr_number?: number }>,
}));

vi.mock("./github.js", () => ({
  fetchGitHubRepo: vi.fn(async () => ({
    files: [{ path: "a.ts", content: "x", size: 1 }],
    owner: "owner",
    repo: "repo",
    ref: "HEAD",
    skipped_count: 0,
    total_bytes: 1,
  })),
}));

vi.mock("@axis/snapshots", () => ({
  // Free trial: defensive-only — this suite's webhook/watch-queue paths don't
  // touch any charging function (verified: no reference anywhere in
  // webhook/watcher files to a real charge function), so isFreeTrialActive
  // should never actually be called here. Present so a future addition to
  // this mock's call graph can't crash on it being simply undefined.
  isFreeTrialActive: vi.fn(() => false),
  createSnapshot: vi.fn(async (input: { manifest: { project_name: string; project_type?: string }; files: Array<{ path: string; content: string; size: number }> }) => {
    const project_id = input.manifest.project_name;
    const list = watchtowerState.snapshotsByProject.get(project_id) ?? [];
    const snapshot_id = `wt-snap-${watchtowerState.nextId++}`;
    list.push(snapshot_id);
    watchtowerState.snapshotsByProject.set(project_id, list);
    // Fields beyond snapshot_id/project_id/created_at are needed for the REAL
    // buildContextMap/buildRepoProfile (analysis-on-push, SPEC-11) to run without
    // throwing on an incomplete SnapshotRecord.
    return {
      snapshot_id,
      project_id,
      created_at: new Date(list.length - 1).toISOString(),
      input_method: "github_repo_url",
      manifest: { project_type: "unknown", ...input.manifest },
      files: input.files,
      file_count: input.files.length,
      total_size_bytes: input.files.reduce((s, f) => s + f.size, 0),
      status: "processing",
      account_id: null,
      content_discarded_at: null,
    };
  }),
  getProjectSnapshots: vi.fn(async (project_id: string) => {
    const list = watchtowerState.snapshotsByProject.get(project_id) ?? [];
    return list.map((snapshot_id, i) => ({ snapshot_id, project_id, created_at: new Date(i).toISOString() }));
  }),
  getContextMap: vi.fn(async (snapshot_id: string) => watchtowerState.contextMaps.get(snapshot_id)),
  saveContextMap: vi.fn(async (snapshot_id: string, data: unknown) => {
    watchtowerState.contextMaps.set(snapshot_id, data);
  }),
  saveRepoProfile: vi.fn(async (snapshot_id: string, data: unknown) => {
    watchtowerState.repoProfiles.set(snapshot_id, data);
  }),
  getGeneratorResult: vi.fn(async (snapshot_id: string) => watchtowerState.generatorResults.get(snapshot_id)),
  saveGeneratorResult: vi.fn(async (snapshot_id: string, data: unknown) => {
    watchtowerState.generatorResults.set(snapshot_id, data);
  }),
  listSubscriptionsForRepo: vi.fn(async (repo_full_name: string) =>
    (watchtowerState.subscriptionsByRepo.get(repo_full_name) ?? []).map((s) => ({
      account_id: s.account_id,
      product_id: s.product_id,
      repo_full_name,
      created_at: new Date(0).toISOString(),
    })),
  ),
  enqueueWatchJob: vi.fn(async (payload: { account_id: string; product_id: string; repo_full_name: string; event_type: string; ref: string; pr_number?: number }) => {
    watchtowerState.enqueuedWatchJobs.push(payload);
    return `job-${watchtowerState.enqueuedWatchJobs.length}`;
  }),
}));

const WEBHOOK_SECRET = "test_github_webhook_secret_xyz";
let server: Server;
let testPort = 0;

interface Res { status: number; data: Record<string, unknown> | string }

async function req(
  method: string,
  path: string,
  body?: string,
  headers?: Record<string, string>,
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const http = require("node:http") as typeof import("node:http");
    const r = http.request(
      { hostname: "127.0.0.1", port: testPort, path, method, headers: { "Content-Type": "application/json", ...headers } },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (c: Buffer) => chunks.push(c));
        response.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: Record<string, unknown> | string;
          try { data = JSON.parse(raw) as Record<string, unknown>; } catch { data = raw; }
          resolve({ status: response.statusCode ?? 0, data });
        });
      },
    );
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

function sign(body: string, secret: string = WEBHOOK_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

beforeAll(async () => {
  process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const router = new Router();
  router.post("/v1/github/webhook", handleGitHubWebhook);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  delete process.env.GITHUB_WEBHOOK_SECRET;
});

beforeEach(() => {
  resetGitHubWebhookState();
});

// ─── Unit: verifyGitHubSignature ──────────────────────────────

describe("verifyGitHubSignature", () => {
  const body = '{"action":"opened","number":42}';
  const secret = "shh";

  it("accepts a valid sha256 signature", () => {
    const sig = "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(verifyGitHubSignature(body, sig, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(verifyGitHubSignature(body + " ", sig, secret)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const sig = "sha256=" + createHmac("sha256", "other").update(body, "utf8").digest("hex");
    expect(verifyGitHubSignature(body, sig, secret)).toBe(false);
  });

  it("rejects missing header", () => {
    expect(verifyGitHubSignature(body, undefined, secret)).toBe(false);
  });

  it("rejects header without sha256= prefix", () => {
    expect(verifyGitHubSignature(body, "abc123", secret)).toBe(false);
  });

  it("rejects empty digest after sha256=", () => {
    expect(verifyGitHubSignature(body, "sha256=", secret)).toBe(false);
  });

  it("rejects non-hex digest gracefully", () => {
    expect(verifyGitHubSignature(body, "sha256=not-hex-zzz", secret)).toBe(false);
  });

  it("rejects digest of wrong length", () => {
    expect(verifyGitHubSignature(body, "sha256=" + "a".repeat(32), secret)).toBe(false);
  });
});

// ─── HTTP: POST /v1/github/webhook ────────────────────────────

describe("POST /v1/github/webhook", () => {
  it("503 when GITHUB_WEBHOOK_SECRET is not configured", async () => {
    const saved = process.env.GITHUB_WEBHOOK_SECRET;
    delete process.env.GITHUB_WEBHOOK_SECRET;
    try {
      const r = await req("POST", "/v1/github/webhook", "{}", {
        "X-GitHub-Event": "ping",
        "X-Hub-Signature-256": "sha256=ignored",
      });
      expect(r.status).toBe(503);
      const data = r.data as Record<string, unknown>;
      expect(String(data.error)).toMatch(/not configured/i);
    } finally {
      process.env.GITHUB_WEBHOOK_SECRET = saved;
    }
  });

  it("401 on invalid signature", async () => {
    const body = JSON.stringify({ zen: "Practicality beats purity." });
    const r = await req("POST", "/v1/github/webhook", body, {
      "X-GitHub-Event": "ping",
      "X-Hub-Signature-256": "sha256=" + "0".repeat(64),
    });
    expect(r.status).toBe(401);
  });

  it("401 on missing signature header", async () => {
    const r = await req("POST", "/v1/github/webhook", "{}", {
      "X-GitHub-Event": "ping",
    });
    expect(r.status).toBe(401);
  });

  it("400 on missing X-GitHub-Event header", async () => {
    const body = "{}";
    const r = await req("POST", "/v1/github/webhook", body, {
      "X-Hub-Signature-256": sign(body),
    });
    expect(r.status).toBe(400);
  });

  it("400 on malformed JSON body with valid signature", async () => {
    const body = "{not json";
    const r = await req("POST", "/v1/github/webhook", body, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body),
    });
    expect(r.status).toBe(400);
  });

  it("200 ping event returns pong", async () => {
    const body = JSON.stringify({ zen: "Practicality beats purity.", hook_id: 1 });
    const r = await req("POST", "/v1/github/webhook", body, {
      "X-GitHub-Event": "ping",
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "delivery-ping-1",
    });
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.pong).toBe(true);
    expect(data.event).toBe("ping");
    expect(data.delivery_id).toBe("delivery-ping-1");
  });

  it("200 on unhandled event with handled=false", async () => {
    const body = JSON.stringify({ action: "labeled" });
    const r = await req("POST", "/v1/github/webhook", body, {
      "X-GitHub-Event": "label",
      "X-Hub-Signature-256": sign(body),
    });
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.handled).toBe(false);
    expect(data.event).toBe("label");
  });

  it("200 handled=false on pull_request action='labeled' (no code change)", async () => {
    const body = JSON.stringify({
      action: "labeled",
      pull_request: { head: { sha: "deadbeef", repo: { full_name: "owner/repo", html_url: "https://github.com/owner/repo" } } },
      repository: { full_name: "owner/repo", html_url: "https://github.com/owner/repo" },
    });
    const r = await req("POST", "/v1/github/webhook", body, {
      "X-GitHub-Event": "pull_request",
      "X-Hub-Signature-256": sign(body),
    });
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.handled).toBe(false);
    expect(data.reason).toBe("no_target");
  });

  it("200 handled=false on installation event (informational)", async () => {
    const body = JSON.stringify({
      action: "created",
      installation: { id: 999 },
      repositories: [{ full_name: "owner/repo" }],
    });
    const r = await req("POST", "/v1/github/webhook", body, {
      "X-GitHub-Event": "installation",
      "X-Hub-Signature-256": sign(body),
    });
    expect(r.status).toBe(200);
    const data = r.data as Record<string, unknown>;
    expect(data.handled).toBe(false);
  });

  it("202 on push event with resolvable target (fetch fire-and-forget)", async () => {
    const body = JSON.stringify({
      ref: "refs/heads/main",
      after: "abc123",
      repository: {
        full_name: "lastmanupinc-hub/AXIS-iliad",
        clone_url: "https://github.com/lastmanupinc-hub/AXIS-iliad.git",
        html_url: "https://github.com/lastmanupinc-hub/AXIS-iliad",
        default_branch: "main",
        private: false,
      },
      installation: { id: 12345 },
    });
    const r = await req("POST", "/v1/github/webhook", body, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "delivery-push-1",
    });
    expect(r.status).toBe(202);
    const data = r.data as Record<string, unknown>;
    expect(data.handled).toBe(true);
    expect(data.event).toBe("push");
    expect(data.repo).toBe("lastmanupinc-hub/AXIS-iliad");
    expect(data.ref).toBe("refs/heads/main");
    expect(data.delivery_id).toBe("delivery-push-1");
  });

  it("202 on pull_request opened with resolvable head", async () => {
    const body = JSON.stringify({
      action: "opened",
      number: 7,
      pull_request: {
        number: 7,
        head: {
          sha: "deadbeefcafe",
          ref: "feature/x",
          repo: { full_name: "fork/AXIS-iliad", html_url: "https://github.com/fork/AXIS-iliad" },
        },
        base: { ref: "main" },
      },
      repository: { full_name: "lastmanupinc-hub/AXIS-iliad", html_url: "https://github.com/lastmanupinc-hub/AXIS-iliad" },
    });
    const r = await req("POST", "/v1/github/webhook", body, {
      "X-GitHub-Event": "pull_request",
      "X-Hub-Signature-256": sign(body),
    });
    expect(r.status).toBe(202);
    const data = r.data as Record<string, unknown>;
    expect(data.handled).toBe(true);
    expect(data.repo).toBe("fork/AXIS-iliad");
    expect(data.ref).toBe("deadbeefcafe");
  });

  it("rejects when body bytes do not match signed bytes", async () => {
    // Sign one body but send a different one with the same length
    const signedBody = JSON.stringify({ ref: "refs/heads/main" });
    const sentBody = signedBody.replace("main", "evil");
    const r = await req("POST", "/v1/github/webhook", sentBody, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(signedBody),
    });
    expect(r.status).toBe(401);
  });
});

// ─── Watchtower delta (SPEC-04) ─────────────────────────────────

function pushBody(repoFullName: string): string {
  return JSON.stringify({
    ref: "refs/heads/main",
    after: "abc123",
    repository: {
      full_name: repoFullName,
      clone_url: `https://github.com/${repoFullName}.git`,
      html_url: `https://github.com/${repoFullName}`,
      default_branch: "main",
      private: false,
    },
    installation: { id: 1 },
  });
}

// app_41: pull_request-triggered watch jobs (unlike push) carry pr_number —
// the brand-voice-lint watcher's only way to know which PR to check files
// for and which SHA to post a commit status against.
function prBody(repoFullName: string, prNumber: number, sha: string): string {
  return JSON.stringify({
    action: "opened",
    number: prNumber,
    pull_request: {
      number: prNumber,
      head: { sha, ref: "feature/x", repo: { full_name: repoFullName, html_url: `https://github.com/${repoFullName}` } },
      base: { ref: "main" },
    },
    repository: { full_name: repoFullName, html_url: `https://github.com/${repoFullName}` },
  });
}

// A second, larger fetchGitHubRepo response — used to force a real total_loc
// change between two dispatches of the same repo (drives buildDeltaReport's
// size section without depending on framework-specific route parsing).
function biggerFetchResult() {
  return {
    files: [
      { path: "a.ts", content: "x", size: 1 },
      { path: "b.ts", content: Array.from({ length: 40 }, (_, i) => `const line${i} = ${i};`).join("\n"), size: 800 },
    ],
    owner: "owner",
    repo: "repo",
    ref: "HEAD",
    skipped_count: 0,
    total_bytes: 801,
  };
}

describe("Watchtower delta on webhook re-analysis (SPEC-04 + SPEC-11 analysis-on-push)", () => {
  beforeEach(() => {
    watchtowerState.snapshotsByProject.clear();
    watchtowerState.contextMaps.clear();
    watchtowerState.repoProfiles.clear();
    watchtowerState.generatorResults.clear();
    watchtowerState.subscriptionsByRepo.clear();
    watchtowerState.enqueuedWatchJobs.length = 0;
    watchtowerState.nextId = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("analysis-on-push populates a real context map and repo profile for the dispatched snapshot", async () => {
    const repo = "delta-org/watchtower-analysis-lands";
    const body = pushBody(repo);
    await req("POST", "/v1/github/webhook", body, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "wt-delivery-analysis-lands",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    const ctx = watchtowerState.contextMaps.get("wt-snap-0") as { project_identity?: { name?: string } } | undefined;
    expect(ctx).toBeDefined();
    expect(ctx!.project_identity?.name).toBe(repo);
    expect(watchtowerState.repoProfiles.get("wt-snap-0")).toBeDefined();
  });

  it("stores a real delta-report.md on the second snapshot when the analyzed content actually changed", async () => {
    const repo = "delta-org/watchtower-repo-1";

    const body1 = pushBody(repo);
    await req("POST", "/v1/github/webhook", body1, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body1),
      "X-GitHub-Delivery": "wt-delivery-1",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Second dispatch of the SAME repo returns a larger file set — the real
    // analysis-on-push pipeline (not a manual pre-seed) produces a genuinely
    // different context map, so buildDeltaReport has something real to diff.
    vi.mocked(fetchGitHubRepo).mockResolvedValueOnce(biggerFetchResult());
    const body2 = pushBody(repo);
    await req("POST", "/v1/github/webhook", body2, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body2),
      "X-GitHub-Delivery": "wt-delivery-2",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Both snapshots got REAL analysis — proves this isn't relying on manual pre-seeding.
    expect(watchtowerState.contextMaps.get("wt-snap-0")).toBeDefined();
    expect(watchtowerState.contextMaps.get("wt-snap-1")).toBeDefined();

    const result = watchtowerState.generatorResults.get("wt-snap-1") as { files: Array<{ path: string; content: string }> } | undefined;
    expect(result).toBeDefined();
    const delta = result!.files.find((f) => f.path === "delta-report.md");
    expect(delta).toBeDefined();
    expect(delta!.content).toContain("Since the last snapshot:");
    // Assert a REAL, quantified change is named — not just that the content is
    // non-empty. Every fragment carries a number (e.g. "2 files added", "total
    // LOC +40"), so the summary must contain a digit after the colon. (The old
    // `endsWith(": .")` check was tautological: buildDeltaReport returns null
    // when nothing changed, and the trailing footer means it never ends in ": .")
    const summaryLine = delta!.content.split("\n").find((l) => l.startsWith("Since the last snapshot:"))!;
    expect(summaryLine).toMatch(/Since the last snapshot: \S.*\d/);
  });

  it("skips the delta on the first-ever snapshot for a project — webhook response unchanged", async () => {
    const repo = "delta-org/watchtower-repo-first";
    vi.stubEnv("AXIS_ENABLE_TEST_LOGS", "1");
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const body = pushBody(repo);
    const r = await req("POST", "/v1/github/webhook", body, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "wt-delivery-first",
    });
    expect(r.status).toBe(202);
    const data = r.data as Record<string, unknown>;
    expect(data.handled).toBe(true);
    expect(data.repo).toBe(repo);

    await new Promise((resolve) => setTimeout(resolve, 250));
    const lines = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(lines).toContain("github-webhook.delta_skipped");
    expect(lines).toContain("first_snapshot");
    expect(watchtowerState.generatorResults.get("wt-snap-0")).toBeUndefined();
    stdoutSpy.mockRestore();
  });

  it("an identical re-push analyzes both snapshots for real but finds no difference (reason:no_change)", async () => {
    const repo = "delta-org/watchtower-repo-nochange";
    vi.stubEnv("AXIS_ENABLE_TEST_LOGS", "1");
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const body1 = pushBody(repo);
    await req("POST", "/v1/github/webhook", body1, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body1),
      "X-GitHub-Delivery": "wt-delivery-nochange-1",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Same (default) fetchGitHubRepo content both times — real analysis runs
    // twice but produces byte-identical context maps.
    const body2 = pushBody(repo);
    await req("POST", "/v1/github/webhook", body2, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body2),
      "X-GitHub-Delivery": "wt-delivery-nochange-2",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(watchtowerState.contextMaps.get("wt-snap-0")).toBeDefined();
    expect(watchtowerState.contextMaps.get("wt-snap-1")).toBeDefined();
    expect(watchtowerState.generatorResults.get("wt-snap-1")).toBeUndefined(); // no delta stored
    const lines = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(lines).toContain("github-webhook.delta_skipped");
    expect(lines).toContain("no_change");
    stdoutSpy.mockRestore();
  });

  it("fails open: an analysis failure (a corrupt fetched file) is caught and logged, the webhook still succeeds, and the delta degrades to no_ctx", async () => {
    const repo = "delta-org/watchtower-repo-analysis-throw";
    vi.stubEnv("AXIS_ENABLE_TEST_LOGS", "1");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const body1 = pushBody(repo);
    await req("POST", "/v1/github/webhook", body1, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body1),
      "X-GitHub-Delivery": "wt-delivery-throw-1",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    // A fetched "file" whose path getter throws — crashes buildContextMap deep inside
    // (buildProjectIdentity reads snapshot.files[].path first), exercising the
    // analysis-on-push try/catch rather than the delta-specific one.
    vi.mocked(fetchGitHubRepo).mockResolvedValueOnce({
      files: [{ get path(): never { throw new Error("boom"); }, content: "x", size: 1 }] as unknown as Array<{ path: string; content: string; size: number }>,
      owner: "owner",
      repo: "repo",
      ref: "HEAD",
      skipped_count: 0,
      total_bytes: 1,
    });
    const body2 = pushBody(repo);
    const r = await req("POST", "/v1/github/webhook", body2, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body2),
      "X-GitHub-Delivery": "wt-delivery-throw-2",
    });
    expect(r.status).toBe(202); // webhook still succeeds despite the internal throw

    await new Promise((resolve) => setTimeout(resolve, 250));
    const errLines = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(errLines).toContain("github-webhook.analysis_failed");
    expect(watchtowerState.contextMaps.get("wt-snap-1")).toBeUndefined(); // save never reached

    const outLines = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(outLines).toContain("github-webhook.delta_skipped");
    expect(outLines).toContain("no_ctx"); // no context map to diff against — degrades gracefully
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });
});

// ─── app_01: the Watch mechanic fires off a real push (docs/saas-strategy/
// APPLICATION_BUILD_STRATEGY.md substrate table) ──────────────────────────
//
// listSubscriptionsForRepo/enqueueWatchJob are mocked at the top of this file
// (the same vi.mock("@axis/snapshots") block dispatchWebhookSnapshot's other
// snapshot calls already use) — this proves the WIRING (push -> lookup ->
// enqueue, with the right fields), not pg-boss delivery itself, which
// watch-queue.test.ts already proves against a real queue.

describe("Watch mechanic — push events enqueue a watch job per subscription", () => {
  beforeEach(() => {
    watchtowerState.snapshotsByProject.clear();
    watchtowerState.contextMaps.clear();
    watchtowerState.repoProfiles.clear();
    watchtowerState.generatorResults.clear();
    watchtowerState.subscriptionsByRepo.clear();
    watchtowerState.enqueuedWatchJobs.length = 0;
    watchtowerState.nextId = 0;
  });

  it("a repo with no subscribers enqueues nothing", async () => {
    const repo = "watch-org/no-subscribers";
    const body = pushBody(repo);
    await req("POST", "/v1/github/webhook", body, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "watch-delivery-none",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(watchtowerState.enqueuedWatchJobs).toEqual([]);
  });

  it("a push to a subscribed repo enqueues one watch job per subscription, with the right fields", async () => {
    const repo = "watch-org/has-subscribers";
    watchtowerState.subscriptionsByRepo.set(repo, [
      { account_id: "acct_a", product_id: "skills" },
      { account_id: "acct_a", product_id: "deploy" },
    ]);

    const body = pushBody(repo);
    await req("POST", "/v1/github/webhook", body, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "watch-delivery-fires",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(watchtowerState.enqueuedWatchJobs.length).toBe(2);
    const productIds = watchtowerState.enqueuedWatchJobs.map((j) => j.product_id).sort();
    expect(productIds).toEqual(["deploy", "skills"]);
    for (const job of watchtowerState.enqueuedWatchJobs) {
      expect(job.account_id).toBe("acct_a");
      expect(job.repo_full_name).toBe(repo);
      expect(job.event_type).toBe("push");
      expect(job.ref).toBe("refs/heads/main");
    }
  });

  it("two accounts watching the same repo each get their own watch job", async () => {
    const repo = "watch-org/two-accounts";
    watchtowerState.subscriptionsByRepo.set(repo, [
      { account_id: "acct_a", product_id: "skills" },
      { account_id: "acct_b", product_id: "skills" },
    ]);

    const body = pushBody(repo);
    await req("POST", "/v1/github/webhook", body, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "watch-delivery-two-accounts",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    const accountIds = watchtowerState.enqueuedWatchJobs.map((j) => j.account_id).sort();
    expect(accountIds).toEqual(["acct_a", "acct_b"]);
  });

  it("app_41: a pull_request event's watch job carries pr_number; a push event's does not", async () => {
    const repo = "watch-org/brand-subscriber";
    watchtowerState.subscriptionsByRepo.set(repo, [{ account_id: "acct_a", product_id: "brand" }]);

    const body = prBody(repo, 42, "prsha1234");
    await req("POST", "/v1/github/webhook", body, {
      "X-GitHub-Event": "pull_request",
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "watch-delivery-pr-brand",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(watchtowerState.enqueuedWatchJobs.length).toBe(1);
    const job = watchtowerState.enqueuedWatchJobs[0];
    expect(job.product_id).toBe("brand");
    expect(job.event_type).toBe("pull_request");
    expect(job.ref).toBe("prsha1234");
    expect(job.pr_number).toBe(42);

    watchtowerState.enqueuedWatchJobs.length = 0;
    const pushJob = pushBody(repo);
    await req("POST", "/v1/github/webhook", pushJob, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(pushJob),
      "X-GitHub-Delivery": "watch-delivery-pr-brand-push",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(watchtowerState.enqueuedWatchJobs[0].pr_number).toBeUndefined();
  });

  it("a watch-enqueue failure does not break the existing anonymous snapshot/delta flow", async () => {
    const repo = "watch-org/enqueue-fails-open";
    watchtowerState.subscriptionsByRepo.set(repo, [{ account_id: "acct_a", product_id: "skills" }]);
    vi.mocked(enqueueWatchJob).mockRejectedValueOnce(new Error("simulated queue failure"));

    const body = pushBody(repo);
    await req("POST", "/v1/github/webhook", body, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "watch-delivery-fail-open",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    // The generic snapshot flow (pre-existing, unrelated to Watch) must still
    // have run, proving the try/catch around the new code is truly fail-open.
    expect(watchtowerState.contextMaps.get("wt-snap-0")).toBeDefined();
  });
});

// ─── H8.11b: replay protection — duplicate X-GitHub-Delivery is deduped ──
//
// GitHub's signature scheme carries no timestamp (structural — there is
// nothing to check a staleness tolerance against), so the delivery-ID cache
// in rememberDelivery() is this handler's ONLY defense against a captured-
// and-replayed valid payload. Until this unit, that path had zero test
// coverage — the audit's own acceptance bar ("verify... reject stale/
// replayed deliveries") requires proving it, not just reading the code.
describe("Replay protection — duplicate X-GitHub-Delivery (H8.11b)", () => {
  beforeEach(() => {
    watchtowerState.snapshotsByProject.clear();
    watchtowerState.contextMaps.clear();
    watchtowerState.repoProfiles.clear();
    watchtowerState.generatorResults.clear();
    watchtowerState.subscriptionsByRepo.clear();
    watchtowerState.enqueuedWatchJobs.length = 0;
    watchtowerState.nextId = 0;
    vi.mocked(fetchGitHubRepo).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("a second delivery with the SAME X-GitHub-Delivery id is deduped — no second snapshot is created", async () => {
    const repo = "replay-org/replay-repo-1";
    const body = pushBody(repo);
    const headers = {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "replay-delivery-same-id",
    };

    const r1 = await req("POST", "/v1/github/webhook", body, headers);
    expect(r1.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(fetchGitHubRepo).toHaveBeenCalledTimes(1);

    // Exact same delivery id, exact same body — a real GitHub retry/replay.
    const r2 = await req("POST", "/v1/github/webhook", body, headers);
    expect(r2.status).toBe(202); // still acks fast — GitHub doesn't need to know it was deduped
    await new Promise((resolve) => setTimeout(resolve, 250));

    // The real assertion: the expensive downstream work did NOT run twice.
    expect(fetchGitHubRepo).toHaveBeenCalledTimes(1);
    expect(watchtowerState.snapshotsByProject.get(repo)?.length ?? 0).toBe(1);
  });

  it("logs github-webhook.duplicate_delivery on the replayed request", async () => {
    vi.stubEnv("AXIS_ENABLE_TEST_LOGS", "1");
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const repo = "replay-org/replay-repo-logged";
    const body = pushBody(repo);
    const headers = {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "replay-delivery-logged",
    };
    await req("POST", "/v1/github/webhook", body, headers);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await req("POST", "/v1/github/webhook", body, headers);
    await new Promise((resolve) => setTimeout(resolve, 250));

    const lines = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(lines).toContain("github-webhook.duplicate_delivery");
    expect(lines).toContain("replay-delivery-logged");
    stdoutSpy.mockRestore();
  });

  it("a DIFFERENT X-GitHub-Delivery id for the same repo is NOT deduped — two real pushes both process", async () => {
    const repo = "replay-org/replay-repo-distinct";
    const body1 = pushBody(repo);
    await req("POST", "/v1/github/webhook", body1, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body1),
      "X-GitHub-Delivery": "replay-delivery-distinct-1",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    const body2 = pushBody(repo);
    await req("POST", "/v1/github/webhook", body2, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body2),
      "X-GitHub-Delivery": "replay-delivery-distinct-2",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(fetchGitHubRepo).toHaveBeenCalledTimes(2);
    expect(watchtowerState.snapshotsByProject.get(repo)?.length ?? 0).toBe(2);
  });

  it("resetGitHubWebhookState() actually clears the dedup cache (the beforeEach hook's own contract)", async () => {
    const repo = "replay-org/replay-repo-reset-check";
    const body = pushBody(repo);
    const headers = {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "replay-delivery-reset-check",
    };
    await req("POST", "/v1/github/webhook", body, headers);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(fetchGitHubRepo).toHaveBeenCalledTimes(1);

    resetGitHubWebhookState();

    // Same delivery id again, but the cache was just reset — treated as fresh.
    await req("POST", "/v1/github/webhook", body, headers);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(fetchGitHubRepo).toHaveBeenCalledTimes(2);
  });
});
