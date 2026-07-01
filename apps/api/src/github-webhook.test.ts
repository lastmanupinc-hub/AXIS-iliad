import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleGitHubWebhook, verifyGitHubSignature, resetGitHubWebhookState } from "./github-webhook.js";

// ─── Watchtower delta mocks (SPEC-04) ───────────────────────────
//
// dispatchWebhookSnapshot() is internal + fire-and-forget: the HTTP response returns
// before it settles, and it dynamically imports ./github.js + @axis/snapshots. Mocking
// both here (this file didn't mock either before) lets the new delta tests control
// snapshot IDs/context-map presence deterministically instead of racing a real DB.

const watchtowerState = vi.hoisted(() => ({
  snapshotsByProject: new Map<string, string[]>(),
  contextMaps: new Map<string, unknown>(),
  generatorResults: new Map<string, unknown>(),
  nextId: 0,
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
  createSnapshot: vi.fn(async (input: { manifest: { project_name: string } }) => {
    const project_id = input.manifest.project_name;
    const list = watchtowerState.snapshotsByProject.get(project_id) ?? [];
    const snapshot_id = `wt-snap-${watchtowerState.nextId++}`;
    list.push(snapshot_id);
    watchtowerState.snapshotsByProject.set(project_id, list);
    return { snapshot_id, project_id, created_at: new Date(list.length - 1).toISOString() };
  }),
  getProjectSnapshots: vi.fn(async (project_id: string) => {
    const list = watchtowerState.snapshotsByProject.get(project_id) ?? [];
    return list.map((snapshot_id, i) => ({ snapshot_id, project_id, created_at: new Date(i).toISOString() }));
  }),
  getContextMap: vi.fn(async (snapshot_id: string) => watchtowerState.contextMaps.get(snapshot_id)),
  getGeneratorResult: vi.fn(async (snapshot_id: string) => watchtowerState.generatorResults.get(snapshot_id)),
  saveGeneratorResult: vi.fn(async (snapshot_id: string, data: unknown) => {
    watchtowerState.generatorResults.set(snapshot_id, data);
  }),
}));

function watchtowerCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    project_identity: { name: "watchtower-repo" },
    detection: { frameworks: [] },
    routes: [],
    domain_models: [],
    dependency_graph: { hotspots: [] },
    ai_context: { warnings: [] },
    entry_points: [],
    structure: { total_loc: 0, file_tree_summary: [] },
    ...overrides,
  };
}

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

describe("Watchtower delta on webhook re-analysis", () => {
  beforeEach(() => {
    watchtowerState.snapshotsByProject.clear();
    watchtowerState.contextMaps.clear();
    watchtowerState.generatorResults.clear();
    watchtowerState.nextId = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stores delta-report.md on the new snapshot when both context maps exist and differ", async () => {
    const repo = "delta-org/watchtower-repo-1";
    // Pre-seed both context maps before either snapshot exists — getContextMap is a pure
    // map lookup in this mock, so this sidesteps the fire-and-forget timing problem of not
    // knowing the new snapshot's id until the dispatch has already run past it.
    watchtowerState.contextMaps.set("wt-snap-0", watchtowerCtx({ routes: [] }));
    watchtowerState.contextMaps.set("wt-snap-1", watchtowerCtx({ routes: [{ path: "/new", method: "GET", source_file: "a.ts" }] }));

    const body1 = pushBody(repo);
    await req("POST", "/v1/github/webhook", body1, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body1),
      "X-GitHub-Delivery": "wt-delivery-1",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    const body2 = pushBody(repo);
    await req("POST", "/v1/github/webhook", body2, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body2),
      "X-GitHub-Delivery": "wt-delivery-2",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    const result = watchtowerState.generatorResults.get("wt-snap-1") as { files: Array<{ path: string; content: string }> } | undefined;
    expect(result).toBeDefined();
    const delta = result!.files.find((f) => f.path === "delta-report.md");
    expect(delta).toBeDefined();
    expect(delta!.content).toContain("/new");
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

  it("fails open: buildDeltaReport throwing logs delta_failed but the webhook still succeeds", async () => {
    const repo = "delta-org/watchtower-repo-throw";
    watchtowerState.contextMaps.set("wt-snap-0", watchtowerCtx());
    // A context map whose routes getter throws — forces buildDeltaReport to throw mid-diff.
    watchtowerState.contextMaps.set("wt-snap-1", {
      ...watchtowerCtx(),
      get routes(): never { throw new Error("boom"); },
    });

    vi.stubEnv("AXIS_ENABLE_TEST_LOGS", "1");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const body1 = pushBody(repo);
    await req("POST", "/v1/github/webhook", body1, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body1),
      "X-GitHub-Delivery": "wt-delivery-throw-1",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    const body2 = pushBody(repo);
    const r = await req("POST", "/v1/github/webhook", body2, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body2),
      "X-GitHub-Delivery": "wt-delivery-throw-2",
    });
    expect(r.status).toBe(202); // webhook still succeeds despite the internal throw

    await new Promise((resolve) => setTimeout(resolve, 250));
    const lines = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(lines).toContain("github-webhook.delta_failed");
    stderrSpy.mockRestore();
  });
});
