import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import { Router, createApp } from "./router.js";
import { handleGitHubWebhook, verifyGitHubSignature, resetGitHubWebhookState } from "./github-webhook.js";

const TEST_PORT = 44540;
const WEBHOOK_SECRET = "test_github_webhook_secret_xyz";
let server: Server;

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
      { hostname: "127.0.0.1", port: TEST_PORT, path, method, headers: { "Content-Type": "application/json", ...headers } },
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
  server = createApp(router, TEST_PORT);
  await new Promise<void>((r) => setTimeout(r, 100));
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
