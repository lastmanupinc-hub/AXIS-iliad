import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { Server } from "node:http";
import { resetTestDb, createOAuthState, getAccountByGitHubId, getAccountByGoogleId, createAccount, createApiKey, createSnapshot, getSnapshot, saveGeneratorResult, getGeneratorResult } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleGitHubOAuthStart, handleGitHubOAuthCallback, handleGoogleOAuthStart, handleGoogleOAuthCallback, handleOAuthExchange, handleOAuthLogout, handleCreateSession, handleAdminSessionLogin, handleAdminSessionLogout } from "./oauth.js";
import { handleAdminStats } from "./admin.js";
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
    router.post("/v1/admin/session", handleAdminSessionLogin);
    router.delete("/v1/admin/session", handleAdminSessionLogout);
    // A real admin-gated route (not a bespoke probe) — proves the admin
    // cookie actually unlocks isAdminCaller() in production code, not just
    // a test double.
    router.get("/v1/admin/stats", handleAdminStats);
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

  it("still completes login when storing the GitHub token throws (live bug: AXIS_TOKEN_KEY unset in production killed every GitHub login at the last step)", async () => {
    process.env.GITHUB_CLIENT_ID = "test-id";
    process.env.GITHUB_CLIENT_SECRET = "test-secret";
    process.env.AXIS_WEB_URL = "http://localhost:3000";
    // Reproduce production exactly: github-token-store's getEncryptionKey()
    // fails CLOSED (throws) when NODE_ENV=production and AXIS_TOKEN_KEY is
    // unset — and render.yaml declares that var `sync: false`, so it is unset
    // until set by hand. Google's callback never stores a token, which is why
    // only GitHub login broke.
    const priorNodeEnv = process.env.NODE_ENV;
    const priorTokenKey = process.env.AXIS_TOKEN_KEY;
    process.env.NODE_ENV = "production";
    delete process.env.AXIS_TOKEN_KEY;
    const state = await createOAuthState();

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "gho_test_token", token_type: "bearer", scope: "read:user" }),
    } as Response);
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 987654, login: "tokenfail", name: "Token Fail", email: "tokenfail@example.com" }),
    } as Response);

    try {
      const res = await req("GET", `/v1/auth/github/callback?code=valid_code&state=${state}`);

      // The whole point: a failed token store must NOT become a failed login.
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("login=github");
      expect(res.headers.location).not.toContain("error=");

      // And the account is real + usable, not half-created.
      const acct = await getAccountByGitHubId("987654");
      expect(acct).toBeDefined();
      const handoff = new URL(res.headers.location).searchParams.get("code")!;
      const exch = await req("POST", "/v1/auth/exchange", { code: handoff });
      expect(exch.status).toBe(200);
      expect(JSON.parse(exch.data).api_key).toMatch(/^axis_/);
    } finally {
      fetchSpy.mockRestore();
      if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = priorNodeEnv;
      if (priorTokenKey !== undefined) process.env.AXIS_TOKEN_KEY = priorTokenKey;
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

  it("cycle 28 audit finding: calling logout with only a Bearer API key (no session cookie) does NOT discard content — this endpoint's discard is scoped to real web sessions only", async () => {
    const account = await createAccount("Logout Bearer Only User", "logout-bearer-only@example.com");
    const { rawKey } = await createApiKey(account.account_id);
    const snap = await createSnapshot(
      {
        input_method: "api_submission",
        manifest: { project_name: "logout-bearer-only-project", project_type: "saas_web_app", frameworks: [], goals: [], requested_outputs: [] },
        files: [{ path: "index.ts", content: "console.log('should survive')", size: 30 }],
      },
      account.account_id,
    );

    // No /v1/auth/session call — this account never established a cookie.
    const logout = await req("POST", "/v1/auth/logout", undefined, { Authorization: `Bearer ${rawKey}` });
    expect(logout.status).toBe(200);

    const after = await getSnapshot(snap.snapshot_id);
    expect(after!.files[0].content).toBe("console.log('should survive')");
    expect(after!.content_discarded_at).toBeNull();
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

  // ─── /v1/admin/session (ADMIN_API_KEY → HttpOnly admin-elevation cookie) ──
  describe("admin session cookie (owner admin-key login)", () => {
    const ADMIN_KEY = "test-admin-key-9f3c2a";
    let savedAdminKey: string | undefined;

    beforeAll(() => {
      savedAdminKey = process.env.ADMIN_API_KEY;
      process.env.ADMIN_API_KEY = ADMIN_KEY;
    });

    afterAll(() => {
      if (savedAdminKey === undefined) delete process.env.ADMIN_API_KEY;
      else process.env.ADMIN_API_KEY = savedAdminKey;
    });

    // /v1/admin/* routes require BOTH a valid account (requireAuth) and the
    // admin key (isAdminCaller) — the real owner's browser carries both as
    // separate cookies (axis_session + axis_admin), with no Authorization
    // header at all once migrated off the legacy bearer fallback. This
    // mirrors that exactly, rather than a Bearer header, so the tests below
    // exercise the actual production shape.
    async function realAccountSessionCookie(email: string): Promise<string> {
      const account = await createAccount("Admin Page Tester", email);
      const { rawKey } = await createApiKey(account.account_id);
      const session = await req("POST", "/v1/auth/session", { api_key: rawKey });
      return session.headers["set-cookie"].split(";")[0];
    }

    it("exchanges the correct admin key for an HttpOnly axis_admin cookie that unlocks a real admin route", async () => {
      const res = await req("POST", "/v1/admin/session", { admin_key: ADMIN_KEY });
      expect(res.status).toBe(200);
      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toContain("axis_admin=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      expect(setCookie).toContain("Path=/");

      // No Authorization/X-Axis-Key header — the session + admin cookies
      // together must satisfy requireAuth + isAdminCaller on a real route.
      const adminCookie = setCookie.split(";")[0];
      const sessionCookie = await realAccountSessionCookie("admin-cookie-unlock@example.com");
      const stats = await req("GET", "/v1/admin/stats", undefined, { Cookie: `${sessionCookie}; ${adminCookie}` });
      expect(stats.status).toBe(200);
    });

    it("rejects a wrong admin key with 403 and sets no cookie", async () => {
      const res = await req("POST", "/v1/admin/session", { admin_key: "not-the-real-key" });
      expect(res.status).toBe(403);
      expect(res.headers["set-cookie"]).toBeUndefined();
    });

    it("requires the admin_key field (400)", async () => {
      const res = await req("POST", "/v1/admin/session", {});
      expect(res.status).toBe(400);
      expect(res.headers["set-cookie"]).toBeUndefined();
    });

    it("a logged-in but non-admin session still 403s without the admin cookie (no accidental blanket unlock)", async () => {
      const sessionCookie = await realAccountSessionCookie("admin-cookie-locked@example.com");
      const stats = await req("GET", "/v1/admin/stats", undefined, { Cookie: sessionCookie });
      expect(stats.status).toBe(403);
    });

    it("with no session at all, a real admin route 401s before the admin check ever runs", async () => {
      const stats = await req("GET", "/v1/admin/stats");
      expect(stats.status).toBe(401);
    });

    it("DELETE clears the cookie so the previously-unlocked route 403s again", async () => {
      const sessionCookie = await realAccountSessionCookie("admin-cookie-logout@example.com");
      const login = await req("POST", "/v1/admin/session", { admin_key: ADMIN_KEY });
      const adminCookie = login.headers["set-cookie"].split(";")[0];
      expect((await req("GET", "/v1/admin/stats", undefined, { Cookie: `${sessionCookie}; ${adminCookie}` })).status).toBe(200);

      const logout = await req("DELETE", "/v1/admin/session");
      expect(logout.status).toBe(200);
      const clearedCookie = logout.headers["set-cookie"];
      expect(clearedCookie).toContain("axis_admin=;");
      expect(clearedCookie).toContain("Max-Age=0");

      // The old cookie value itself is still technically valid if replayed —
      // logout clears the browser's copy server-side, it doesn't revoke the
      // secret (no server-side revocation list exists for either cookie,
      // same as SESSION_COOKIE/logout). Confirm the ORIGINAL admin cookie
      // still authenticates, then confirm a client that actually drops it
      // (as a real browser does on Set-Cookie Max-Age=0) is locked out again.
      expect((await req("GET", "/v1/admin/stats", undefined, { Cookie: `${sessionCookie}; ${adminCookie}` })).status).toBe(200);
      expect((await req("GET", "/v1/admin/stats", undefined, { Cookie: sessionCookie })).status).toBe(403);
    });

    it("returns 503 when ADMIN_API_KEY is not configured", async () => {
      delete process.env.ADMIN_API_KEY;
      try {
        const res = await req("POST", "/v1/admin/session", { admin_key: ADMIN_KEY });
        expect(res.status).toBe(503);
      } finally {
        process.env.ADMIN_API_KEY = ADMIN_KEY;
      }
    });
  });
});
