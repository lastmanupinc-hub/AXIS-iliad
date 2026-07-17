import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import { processArchitectureDrift, handleArchitectureDriftWebhook, type DriftDeps } from "./architecture-drift-webhook.js";
import type { PushInfo } from "./architecture-drift.js";
import type { OpenDriftPrParams } from "./github-pr.js";
import type { FileEntry } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";

const push: PushInfo = {
  repo_full_name: "o/r",
  html_url: "https://github.com/o/r",
  ref: "refs/heads/main",
  branch: "main",
  default_branch: "main",
  is_default_branch: true,
  head_sha: "sha",
};

// A living-architecture doc shaped like the renderer's output (insights + footer).
function doc(insights: string[]): string {
  return ["# Living Architecture — r", "", "## Key symbols", ...insights.map((i) => `- some prose _(${i})_`), "", "## Verification", `- Verified (kept): ${insights.length}`].join("\n");
}

function makeDeps(opts: {
  token?: string;
  baselineDoc?: string;
  newDoc?: string;
  configured?: boolean;
  openPr?: DriftDeps["openPr"];
}): DriftDeps {
  const files = (
    opts.baselineDoc !== undefined
      ? [{ path: ".axis/living-architecture.md", content: opts.baselineDoc, size: 1 }]
      : [{ path: "src/x.ts", content: "x", size: 1 }]
  ) as unknown as FileEntry[];
  return {
    token: opts.token,
    fetchRepo: async () => ({ files }),
    analyze: async () => ({ content: opts.newDoc ?? doc(["A"]), configured: opts.configured ?? true }),
    openPr: opts.openPr ?? (async () => ({ opened: true, pr_url: "u", pr_number: 1 })),
  };
}

describe("processArchitectureDrift", () => {
  it("does nothing without a token", async () => {
    expect(await processArchitectureDrift(push, makeDeps({}))).toEqual({ status: "no_token" });
  });

  it("reports model_not_configured when the local model is absent", async () => {
    const out = await processArchitectureDrift(push, makeDeps({ token: "t", configured: false }));
    expect(out.status).toBe("model_not_configured");
  });

  it("reports no_drift when the verified doc is unchanged vs the committed baseline", async () => {
    const out = await processArchitectureDrift(push, makeDeps({ token: "t", baselineDoc: doc(["A"]), newDoc: doc(["A"]) }));
    expect(out.status).toBe("no_drift");
    expect(out.drift?.drifted).toBe(false);
  });

  it("opens a PR on drift with the new doc + correct path/branch", async () => {
    let captured: OpenDriftPrParams | null = null;
    const out = await processArchitectureDrift(
      push,
      makeDeps({
        token: "t",
        baselineDoc: doc(["A"]),
        newDoc: doc(["A", "B"]),
        openPr: async (p) => {
          captured = p;
          return { opened: true, pr_url: "https://github.com/o/r/pull/9", pr_number: 9 };
        },
      }),
    );
    expect(out.status).toBe("pr_opened");
    expect(out.drift?.added).toContain("B");
    expect(out.pr?.pr_number).toBe(9);
    expect(captured!.filePath).toBe(".axis/living-architecture.md");
    expect(captured!.content).toBe(doc(["A", "B"]));
    expect(captured!.baseBranch).toBe("main");
    expect(captured!.branchName).toMatch(/^axis\/arch-drift-/);
  });

  it("treats an absent committed doc as an empty baseline (first run → drift → PR)", async () => {
    const out = await processArchitectureDrift(push, makeDeps({ token: "t", newDoc: doc(["A"]) }));
    expect(out.status).toBe("pr_opened");
    expect(out.drift?.added).toContain("A");
  });

  it("reports pr_skipped when the PR opener declines (already in flight)", async () => {
    const out = await processArchitectureDrift(
      push,
      makeDeps({ token: "t", baselineDoc: doc(["A"]), newDoc: doc(["B"]), openPr: async () => ({ opened: false, reason: "branch already exists" }) }),
    );
    expect(out.status).toBe("pr_skipped");
    expect(out.pr?.reason).toMatch(/already exists/);
  });
});

// ─── H8.11b: handleArchitectureDriftWebhook — HTTP layer + replay protection ──
//
// Everything above tests processArchitectureDrift (pure orchestration, real
// deps injected). Until this unit, the HTTP handler itself — signature
// verification, the 503/401/400 guard paths, and BOTH replay-protection
// mechanisms (duplicate-delivery dedup, same-repo in-flight guard) — had
// ZERO test coverage. Every guard test below returns before
// processArchitectureDrift is ever reached, so no pipeline dependency needs
// mocking; the one "accepted" test relies on GITHUB_TOKEN being unset so the
// fire-and-forget call resolves harmlessly to {status: "no_token"} in the
// background without touching any real external service.
const WEBHOOK_SECRET = "test_arch_drift_webhook_secret";
let server: Server;
let testPort = 0;

interface Res { status: number; data: Record<string, unknown> | string }

async function req(body?: string, headers?: Record<string, string>): Promise<Res> {
  return new Promise((resolve, reject) => {
    const http = require("node:http") as typeof import("node:http");
    const r = http.request(
      { hostname: "127.0.0.1", port: testPort, path: "/v1/github/architecture-drift", method: "POST", headers: { "Content-Type": "application/json", ...headers } },
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

function pushBody(repoFullName: string): string {
  return JSON.stringify({
    ref: "refs/heads/main",
    after: "abc123",
    repository: { full_name: repoFullName, html_url: `https://github.com/${repoFullName}`, default_branch: "main" },
  });
}

describe("handleArchitectureDriftWebhook — HTTP layer", () => {
  beforeAll(async () => {
    process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
    delete process.env.GITHUB_TOKEN; // the "accepted" test relies on this short-circuiting the pipeline
    const router = new Router();
    router.post("/v1/github/architecture-drift", handleArchitectureDriftWebhook);
    const ts = await startTestServer(router);
    server = ts.server;
    testPort = ts.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    delete process.env.GITHUB_WEBHOOK_SECRET;
  });

  it("503s when GITHUB_WEBHOOK_SECRET is unset", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const body = pushBody("o/r");
    const r = await req(body, { "X-GitHub-Event": "push", "X-Hub-Signature-256": sign(body) });
    expect(r.status).toBe(503);
    process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  it("401s on an invalid signature", async () => {
    const body = pushBody("o/r");
    const r = await req(body, { "X-GitHub-Event": "push", "X-Hub-Signature-256": sign(body, "wrong-secret") });
    expect(r.status).toBe(401);
  });

  it("pongs a ping event", async () => {
    const body = JSON.stringify({ zen: "hi" });
    const r = await req(body, { "X-GitHub-Event": "ping", "X-Hub-Signature-256": sign(body) });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ ok: true, pong: true });
  });

  it("ignores a non-push event", async () => {
    const body = JSON.stringify({});
    const r = await req(body, { "X-GitHub-Event": "issues", "X-Hub-Signature-256": sign(body) });
    expect(r.status).toBe(202);
    expect((r.data as Record<string, unknown>).ignored).toMatch(/^event issues/);
  });

  it("400s on invalid JSON", async () => {
    const body = "not json";
    const r = await req(body, { "X-GitHub-Event": "push", "X-Hub-Signature-256": sign(body) });
    expect(r.status).toBe(400);
  });

  it("ignores an unparseable push payload", async () => {
    const body = JSON.stringify({ ref: "refs/heads/main" }); // no repository
    const r = await req(body, { "X-GitHub-Event": "push", "X-Hub-Signature-256": sign(body) });
    expect(r.status).toBe(202);
    expect((r.data as Record<string, unknown>).ignored).toBe("unparseable push event");
  });

  it("ignores a push to a non-default branch", async () => {
    const body = JSON.stringify({
      ref: "refs/heads/feature-x",
      repository: { full_name: "o/non-default-branch-repo", html_url: "https://github.com/o/r", default_branch: "main" },
    });
    const r = await req(body, { "X-GitHub-Event": "push", "X-Hub-Signature-256": sign(body) });
    expect(r.status).toBe(202);
    expect((r.data as Record<string, unknown>).ignored).toMatch(/^non-default branch/);
  });

  it("accepts a valid default-branch push", async () => {
    const body = pushBody("o/arch-drift-accept-repo");
    const r = await req(body, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "arch-drift-delivery-accept",
    });
    expect(r.status).toBe(202);
    expect(r.data).toMatchObject({ accepted: true, repo: "o/arch-drift-accept-repo" });
  });

  // ── Replay protection ──────────────────────────────────────────

  it("a second delivery with the SAME X-GitHub-Delivery id is deduped (202 ignored: duplicate delivery)", async () => {
    const body = pushBody("o/arch-drift-replay-repo");
    const headers = {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "arch-drift-delivery-replay-same",
    };
    const r1 = await req(body, headers);
    expect(r1.status).toBe(202);
    expect(r1.data).toMatchObject({ accepted: true });

    const r2 = await req(body, headers);
    expect(r2.status).toBe(202);
    expect(r2.data).toMatchObject({ ignored: "duplicate delivery" });
  });

  it("a DIFFERENT X-GitHub-Delivery id for the same repo is NOT deduped by the delivery cache", async () => {
    const body1 = pushBody("o/arch-drift-distinct-repo");
    const r1 = await req(body1, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body1),
      "X-GitHub-Delivery": "arch-drift-delivery-distinct-1",
    });
    expect(r1.data).toMatchObject({ accepted: true });

    // A second, genuinely distinct delivery for the same repo may still hit the
    // in-flight-concurrency guard if the first hasn't finished (both resolve near-
    // instantly here since GITHUB_TOKEN is unset), so only assert it's NOT the
    // duplicate-delivery reason specifically.
    const body2 = pushBody("o/arch-drift-distinct-repo");
    const r2 = await req(body2, {
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": sign(body2),
      "X-GitHub-Delivery": "arch-drift-delivery-distinct-2",
    });
    expect((r2.data as Record<string, unknown>).ignored).not.toBe("duplicate delivery");
  });
});
