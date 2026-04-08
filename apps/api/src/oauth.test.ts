import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb, createOAuthState, getAccountByGitHubId } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import { handleGitHubOAuthStart, handleGitHubOAuthCallback } from "./oauth.js";
import { resetRateLimits } from "./rate-limiter.js";

const TEST_PORT = 44410;
let server: Server;

// ─── HTTP helper (follows redirects manually) ────────────────────

interface Res { status: number; headers: Record<string, string>; data: string }

async function req(method: string, path: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: TEST_PORT, path, method },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === "string") h[k] = v;
          }
          resolve({ status: res.statusCode ?? 0, headers: h, data: Buffer.concat(chunks).toString("utf-8") });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

describe("OAuth API routes", () => {
  beforeAll(() => {
    openMemoryDb();
    const router = new Router();
    router.get("/v1/auth/github", handleGitHubOAuthStart);
    router.get("/v1/auth/github/callback", handleGitHubOAuthCallback);
    server = createApp(router, TEST_PORT);
  });

  afterAll(() => {
    server.close();
    closeDb();
  });

  beforeEach(() => {
    resetRateLimits();
  });

  // ─── /v1/auth/github ──────────────────────────────────────────

  it("returns 503 when GITHUB_CLIENT_ID is not set", async () => {
    delete process.env.GITHUB_CLIENT_ID;
    const res = await req("GET", "/v1/auth/github");
    expect(res.status).toBe(503);
    expect(res.data).toContain("not configured");
  });

  it("redirects to GitHub when GITHUB_CLIENT_ID is set", async () => {
    process.env.GITHUB_CLIENT_ID = "test-client-id";
    try {
      const res = await req("GET", "/v1/auth/github");
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("https://github.com/login/oauth/authorize");
      expect(res.headers.location).toContain("client_id=test-client-id");
      expect(res.headers.location).toContain("state=");
    } finally {
      delete process.env.GITHUB_CLIENT_ID;
    }
  });

  // ─── /v1/auth/github/callback ─────────────────────────────────

  it("returns 503 when client ID/secret not configured", async () => {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    const res = await req("GET", "/v1/auth/github/callback?code=abc&state=xyz");
    expect(res.status).toBe(503);
  });

  it("returns 400 when code or state is missing", async () => {
    process.env.GITHUB_CLIENT_ID = "test-id";
    process.env.GITHUB_CLIENT_SECRET = "test-secret";
    try {
      const res = await req("GET", "/v1/auth/github/callback");
      expect(res.status).toBe(400);
      expect(res.data).toContain("Missing code or state");
    } finally {
      delete process.env.GITHUB_CLIENT_ID;
      delete process.env.GITHUB_CLIENT_SECRET;
    }
  });

  it("returns 400 for invalid/expired state", async () => {
    process.env.GITHUB_CLIENT_ID = "test-id";
    process.env.GITHUB_CLIENT_SECRET = "test-secret";
    try {
      const res = await req("GET", "/v1/auth/github/callback?code=abc&state=bad-state");
      expect(res.status).toBe(400);
      expect(res.data).toContain("Invalid or expired OAuth state");
    } finally {
      delete process.env.GITHUB_CLIENT_ID;
      delete process.env.GITHUB_CLIENT_SECRET;
    }
  });

  it("redirects with error when GitHub returns error param", async () => {
    process.env.GITHUB_CLIENT_ID = "test-id";
    process.env.GITHUB_CLIENT_SECRET = "test-secret";
    try {
      const res = await req("GET", "/v1/auth/github/callback?error=access_denied&error_description=User+denied");
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("error=User%20denied");
    } finally {
      delete process.env.GITHUB_CLIENT_ID;
      delete process.env.GITHUB_CLIENT_SECRET;
    }
  });

  it("redirects with error when GitHub returns error without description", async () => {
    process.env.GITHUB_CLIENT_ID = "test-id";
    process.env.GITHUB_CLIENT_SECRET = "test-secret";
    try {
      const res = await req("GET", "/v1/auth/github/callback?error=access_denied");
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("error=access_denied");
    } finally {
      delete process.env.GITHUB_CLIENT_ID;
      delete process.env.GITHUB_CLIENT_SECRET;
    }
  });

  it("completes OAuth flow successfully with mocked GitHub API", async () => {
    process.env.GITHUB_CLIENT_ID = "test-id";
    process.env.GITHUB_CLIENT_SECRET = "test-secret";
    process.env.AXIS_WEB_URL = "http://localhost:3000";
    const state = createOAuthState();

    // Mock fetch: first call = token exchange, second call = user profile
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "gho_test_token", token_type: "bearer", scope: "read:user" }),
    } as Response);
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 12345, login: "testuser", name: "Test User", email: "test@example.com" }),
    } as Response);

    try {
      const res = await req("GET", `/v1/auth/github/callback?code=valid_code&state=${state}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("http://localhost:3000/account?");
      expect(res.headers.location).toContain("key=axis_");
      expect(res.headers.location).toContain("login=github");

      // Verify account was created and linked
      const acct = getAccountByGitHubId("12345");
      expect(acct).toBeDefined();
      expect(acct!.name).toBe("Test User");
    } finally {
      fetchSpy.mockRestore();
      delete process.env.GITHUB_CLIENT_ID;
      delete process.env.GITHUB_CLIENT_SECRET;
      delete process.env.AXIS_WEB_URL;
    }
  });

  it("redirects with error when GitHub token exchange fails", async () => {
    process.env.GITHUB_CLIENT_ID = "test-id";
    process.env.GITHUB_CLIENT_SECRET = "test-secret";
    const state = createOAuthState();

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    try {
      const res = await req("GET", `/v1/auth/github/callback?code=bad_code&state=${state}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("error=");
      expect(res.headers.location).toContain("token%20exchange%20failed");
    } finally {
      fetchSpy.mockRestore();
      delete process.env.GITHUB_CLIENT_ID;
      delete process.env.GITHUB_CLIENT_SECRET;
    }
  });

  it("redirects with error on non-Error throw", async () => {
    process.env.GITHUB_CLIENT_ID = "test-id";
    process.env.GITHUB_CLIENT_SECRET = "test-secret";
    const state = createOAuthState();

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockRejectedValueOnce("string-error");

    try {
      const res = await req("GET", `/v1/auth/github/callback?code=x&state=${state}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("error=OAuth%20exchange%20failed");
    } finally {
      fetchSpy.mockRestore();
      delete process.env.GITHUB_CLIENT_ID;
      delete process.env.GITHUB_CLIENT_SECRET;
    }
  });
});
