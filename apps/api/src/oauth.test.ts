import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { Server } from "node:http";
import { resetTestDb, createOAuthState, getAccountByGitHubId, getAccountByGoogleId, createAccount, createApiKey, createSnapshot, getSnapshot, saveGeneratorResult, getGeneratorResult } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleGitHubOAuthStart, handleGitHubOAuthCallback, handleGoogleOAuthStart, handleGoogleOAuthCallback, handleOAuthExchange, handleOAuthLogout, handleCreateSession } from "./oauth.js";
import { resolveAuth } from "./billing.js";
import { sendJSON } from "./router.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;

// ─── HTTP helper (follows redirects manually) ────────────────────

interface Res { status: number; headers: Record<string, string>; data: string }

async function req(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {
      ...(payload ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    };
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method, headers },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === "string") h[k] = v;
            else if (Array.isArray(v)) h[k] = v.join("; "); // e.g. set-cookie
          }
          resolve({ status: res.statusCode ?? 0, headers: h, data: Buffer.concat(chunks).toString("utf-8") });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

describe("OAuth API routes", () => {
  beforeAll(async () => {
    await resetTestDb();
    const router = new Router();
    router.get("/v1/auth/github", handleGitHubOAuthStart);
    router.get("/v1/auth/github/callback", handleGitHubOAuthCallback);
    router.get("/v1/auth/google", handleGoogleOAuthStart);
    router.get("/v1/auth/google/callback", handleGoogleOAuthCallback);
    router.post("/v1/auth/exchange", handleOAuthExchange);
    router.post("/v1/auth/session", handleCreateSession);
    router.post("/v1/auth/logout", handleOAuthLogout);
    // Minimal authed probe to exercise the cookie path through resolveAuth.
    router.get("/whoami", async (r, s) => {
      const auth = await resolveAuth(r);
      sendJSON(s, 200, { anonymous: auth.anonymous, account_id: auth.account?.account_id ?? null });
    });
    const ts = await startTestServer(router);
    server = ts.server;
    testPort = ts.port;
  });

  afterAll(() => {
    server.close();
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
    const state = await createOAuthState();

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
      expect(res.headers.location).toContain("code=");
      expect(res.headers.location).toContain("login=github");
      expect(res.headers.location).not.toContain("axis_"); // raw key never in the URL
      expect(res.headers["referrer-policy"]).toBe("no-referrer");

      // Verify account was created and linked
      const acct = await getAccountByGitHubId("12345");
      expect(acct).toBeDefined();
      expect(acct!.name).toBe("Test User");

      // The one-time code exchanges (exactly once) for the real API key.
      const handoff = new URL(res.headers.location).searchParams.get("code")!;
      const exch = await req("POST", "/v1/auth/exchange", { code: handoff });
      expect(exch.status).toBe(200);
      expect(JSON.parse(exch.data).api_key).toMatch(/^axis_/);

      // Exchange also establishes the first-party HttpOnly session cookie.
      const setCookie = exch.headers["set-cookie"];
      expect(setCookie).toContain("axis_session=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      expect(setCookie).toContain("Path=/");
      // The cookie alone authenticates a request — no Authorization header.
      const cookie = setCookie.split(";")[0];
      const who = await req("GET", "/whoami", undefined, { Cookie: cookie });
      expect(JSON.parse(who.data).anonymous).toBe(false);
      expect(JSON.parse(who.data).account_id).toBe(acct!.account_id);

      const again = await req("POST", "/v1/auth/exchange", { code: handoff });
      expect(again.status).toBe(400); // single-use
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
    const state = await createOAuthState();

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
    const state = await createOAuthState();

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

  // ─── /v1/auth/google ──────────────────────────────────────────

  it("returns 503 when GOOGLE_CLIENT_ID is not set", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const res = await req("GET", "/v1/auth/google");
    expect(res.status).toBe(503);
    expect(res.data).toContain("not configured");
  });

  it("redirects to Google when GOOGLE_CLIENT_ID is set", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-id";
    try {
      const res = await req("GET", "/v1/auth/google");
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(res.headers.location).toContain("client_id=test-google-id");
      expect(res.headers.location).toContain("response_type=code");
      expect(res.headers.location).toContain("scope=openid");
      expect(res.headers.location).toContain("state=");
    } finally {
      delete process.env.GOOGLE_CLIENT_ID;
    }
  });

  it("returns 400 for invalid/expired Google state", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    try {
      const res = await req("GET", "/v1/auth/google/callback?code=abc&state=bad-state");
      expect(res.status).toBe(400);
      expect(res.data).toContain("Invalid or expired OAuth state");
    } finally {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
    }
  });

  it("completes Google OAuth flow successfully with mocked Google API", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.AXIS_WEB_URL = "http://localhost:3000";
    const state = await createOAuthState();

    // Mock fetch: first call = token exchange, second call = OIDC userinfo
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "ya29.test_token", token_type: "Bearer", scope: "openid email profile" }),
    } as Response);
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sub: "google-sub-987", email: "gtest@example.com", email_verified: true, name: "G Test" }),
    } as Response);

    try {
      const res = await req("GET", `/v1/auth/google/callback?code=valid_code&state=${state}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("http://localhost:3000/account?");
      expect(res.headers.location).toContain("code=");
      expect(res.headers.location).toContain("login=google");
      expect(res.headers.location).not.toContain("axis_"); // raw key never in the URL
      expect(res.headers["referrer-policy"]).toBe("no-referrer");

      const acct = await getAccountByGoogleId("google-sub-987");
      expect(acct).toBeDefined();
      expect(acct!.name).toBe("G Test");

      // One-time code exchanges for the real key + sets the HttpOnly cookie.
      const handoff = new URL(res.headers.location).searchParams.get("code")!;
      const exch = await req("POST", "/v1/auth/exchange", { code: handoff });
      expect(exch.status).toBe(200);
      expect(JSON.parse(exch.data).api_key).toMatch(/^axis_/);
      expect(exch.headers["set-cookie"]).toContain("axis_session=");
    } finally {
      fetchSpy.mockRestore();
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.AXIS_WEB_URL;
    }
  });

  it("Google callback redirects with error when token exchange fails", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    const state = await createOAuthState();

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 400 } as Response);

    try {
      const res = await req("GET", `/v1/auth/google/callback?code=bad_code&state=${state}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("error=");
      expect(res.headers.location).toContain("token%20exchange%20failed");
    } finally {
      fetchSpy.mockRestore();
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
    }
  });

  // ─── /v1/auth/logout ──────────────────────────────────────────

  it("logout clears the session cookie server-side", async () => {
    const res = await req("POST", "/v1/auth/logout");
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toContain("axis_session=;");
    expect(res.headers["set-cookie"]).toContain("Max-Age=0");
    expect(res.headers["set-cookie"]).toContain("HttpOnly");
  });

  it("anonymous logout (no session cookie) is a harmless no-op — never crashes", async () => {
    const res = await req("POST", "/v1/auth/logout", undefined, { Cookie: "axis_session=not-a-real-key" });
    expect(res.status).toBe(200);
  });

  // ─── R5.7: logout discards uploaded source content ────────────────

  it("logging out discards the account's snapshot source content, but keeps generated deliverables", async () => {
    const account = await createAccount("Logout Discard User", "logout-discard@example.com");
    const { rawKey } = await createApiKey(account.account_id);
    const snap = await createSnapshot(
      {
        input_method: "api_submission",
        manifest: { project_name: "logout-discard-project", project_type: "saas_web_app", frameworks: [], goals: [], requested_outputs: [] },
        files: [{ path: "index.ts", content: "console.log('my secret ip')", size: 28 }],
      },
      account.account_id,
    );
    await saveGeneratorResult(snap.snapshot_id, { snapshot_id: snap.snapshot_id, generated_at: "2025-01-01T00:00:00Z", files: [{ path: "AGENTS.md", content: "# Agents", program: "skills" }], skipped: [] });

    // Establish the web session cookie for this account.
    const session = await req("POST", "/v1/auth/session", { api_key: rawKey });
    const cookie = session.headers["set-cookie"].split(";")[0];

    // Content is live before logout.
    expect((await getSnapshot(snap.snapshot_id))!.files[0].content).toBe("console.log('my secret ip')");

    const logout = await req("POST", "/v1/auth/logout", undefined, { Cookie: cookie });
    expect(logout.status).toBe(200);

    const after = await getSnapshot(snap.snapshot_id);
    expect(after!.files[0].content).toBe("");
    expect(after!.files[0].path).toBe("index.ts"); // path/size metadata survives
    expect(after!.content_discarded_at).toBeTruthy();

    // The paid, generated deliverable is untouched by source discard.
    expect(await getGeneratorResult(snap.snapshot_id)).toEqual({
      snapshot_id: snap.snapshot_id,
      generated_at: "2025-01-01T00:00:00Z",
      files: [{ path: "AGENTS.md", content: "# Agents", program: "skills" }],
      skipped: [],
    });
  });

  // ─── /v1/auth/session (api_key → HttpOnly cookie, H1 C2) ──────────

  it("exchanges a valid api_key for the HttpOnly session cookie (no bearer needed thereafter)", async () => {
    const account = await createAccount("Session User", "session@example.com");
    const { rawKey } = await createApiKey(account.account_id);

    const res = await req("POST", "/v1/auth/session", { api_key: rawKey });
    expect(res.status).toBe(200);
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toContain("axis_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");

    // The cookie alone authenticates a request — no Authorization header.
    const cookie = setCookie.split(";")[0];
    const who = await req("GET", "/whoami", undefined, { Cookie: cookie });
    expect(JSON.parse(who.data).anonymous).toBe(false);
    expect(JSON.parse(who.data).account_id).toBe(account.account_id);
  });

  it("rejects an invalid api_key with 401 and sets no cookie", async () => {
    const res = await req("POST", "/v1/auth/session", { api_key: "axis_not_a_real_key" });
    expect(res.status).toBe(401);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("requires the api_key field (400)", async () => {
    const res = await req("POST", "/v1/auth/session", {});
    expect(res.status).toBe(400);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});
