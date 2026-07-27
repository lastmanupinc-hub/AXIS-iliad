import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, sendError, readBody } from "./router.js";
import { ErrorCode, log } from "./logger.js";
import { SESSION_COOKIE, readSessionCookie } from "./billing.js";
import {
  createOAuthState,
  consumeOAuthState,
  createAuthCode,
  consumeAuthCode,
  getGitHubAuthUrl,
  exchangeGitHubCode,
  getGitHubUser,
  upsertAccountByGitHub,
  saveGitHubToken,
  getGoogleAuthUrl,
  exchangeGoogleCode,
  getGoogleUser,
  upsertAccountByGoogle,
  resolveApiKey,
  discardAccountSnapshotContent,
} from "@axis/snapshots";

function getOAuthConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const callbackUrl = process.env.GITHUB_CALLBACK_URL ?? "http://localhost:4000/v1/auth/github/callback";
  const webAppUrl = process.env.AXIS_WEB_URL ?? "http://localhost:3000";
  return { clientId, clientSecret, callbackUrl, webAppUrl };
}

function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL ?? "http://localhost:4000/v1/auth/google/callback";
  const webAppUrl = process.env.AXIS_WEB_URL ?? "http://localhost:3000";
  return { clientId, clientSecret, callbackUrl, webAppUrl };
}

/** ~30-day session lifetime for the first-party cookie. */
const SESSION_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

/**
 * Build a Set-Cookie value for the first-party session. HttpOnly keeps the key
 * out of reach of any XSS; SameSite=Lax blocks cross-site POST/XHR (CSRF) while
 * surviving top-level navigations; Secure is set when the web app is served over
 * HTTPS. The cookie rides only on same-site requests, so it's a harmless no-op
 * until the API is served same-site with the web app — the response body still
 * carries the key during the cutover. Pass maxAgeSeconds=0 to clear it.
 */
function sessionCookie(value: string, maxAgeSeconds: number, webAppUrl: string): string {
  const secure = webAppUrl.startsWith("https://");
  return [
    `${SESSION_COOKIE}=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

/** GET /v1/auth/github — initiate GitHub OAuth flow */
export async function handleGitHubOAuthStart(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const { clientId, callbackUrl } = getOAuthConfig();
  if (!clientId) {
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "GitHub OAuth is not configured");
    return;
  }

  const state = await createOAuthState();
  const url = getGitHubAuthUrl(clientId, callbackUrl, state);
  res.writeHead(302, { Location: url });
  res.end();
}

/** GET /v1/auth/github/callback — handle GitHub OAuth callback */
export async function handleGitHubOAuthCallback(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const { clientId, clientSecret, callbackUrl, webAppUrl } = getOAuthConfig();
  if (!clientId || !clientSecret) {
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "GitHub OAuth is not configured");
    return;
  }

  /* v8 ignore next */
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    const desc = url.searchParams.get("error_description") ?? error;
    res.writeHead(302, { Location: `${webAppUrl}/account?error=${encodeURIComponent(desc)}` });
    res.end();
    return;
  }

  if (!code || !state) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "Missing code or state parameter");
    return;
  }

  // Validate CSRF state
  if (!(await consumeOAuthState(state))) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "Invalid or expired OAuth state");
    return;
  }

  try {
    // Exchange code for access token. redirect_uri must byte-match the one
    // used to authorize — GitHub only enforces this when the OAuth App has
    // more than one registered callback URL, which silently broke this
    // exchange the moment a second callback URL (the custom api.iliad domain,
    // alongside the original raw Render one) was added on GitHub's side
    // without this call ever being updated to match Google's (which always
    // sent it — see oauth-store.ts's exchangeGoogleCode).
    const tokenResponse = await exchangeGitHubCode(clientId, clientSecret, code, callbackUrl);

    // Get GitHub user profile
    const ghUser = await getGitHubUser(tokenResponse.access_token);

    // Find or create account, get API key
    const { account, rawKey } = await upsertAccountByGitHub(
      ghUser.id,
      ghUser.name,
      ghUser.email,
    );

    // Store the GitHub access token (encrypted) for later API use — BEST
    // EFFORT. This is a convenience for later private-repo calls, not part of
    // signing in, and it must never be able to fail the login itself: it
    // encrypts with AXIS_TOKEN_KEY, which fails CLOSED (throws) in production
    // when unset, and render.yaml declares that var `sync: false` so a fresh
    // environment has it unset until someone sets it by hand. That threw here,
    // inside the try, AFTER the account and API key already existed — so every
    // GitHub login died at the very last step and bounced back to the sign-in
    // screen, while Google's callback (which never stores a token) kept
    // working. Mirrors recordUsageBestEffort's convention elsewhere.
    try {
      await saveGitHubToken(account.account_id, tokenResponse.access_token, "oauth");
    } catch (err) {
      log("error", "github_token_store_failed", {
        account_id: account.account_id,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    // Hand the key to the web app via a one-time code, NOT the URL — so the raw
    // key never appears in the address bar, browser history, Referer, or logs.
    const handoffCode = createAuthCode(rawKey);
    const redirectUrl = new URL("/account", webAppUrl);
    redirectUrl.searchParams.set("code", handoffCode);
    redirectUrl.searchParams.set("login", "github");
    res.writeHead(302, {
      Location: redirectUrl.toString(),
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    });
    res.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OAuth exchange failed";
    res.writeHead(302, { Location: `${webAppUrl}/account?error=${encodeURIComponent(msg)}` });
    res.end();
  }
}

/** GET /v1/auth/google — initiate Google OAuth flow */
export async function handleGoogleOAuthStart(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const { clientId, callbackUrl } = getGoogleOAuthConfig();
  if (!clientId) {
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "Google OAuth is not configured");
    return;
  }

  const state = await createOAuthState();
  const url = getGoogleAuthUrl(clientId, callbackUrl, state);
  res.writeHead(302, { Location: url });
  res.end();
}

/** GET /v1/auth/google/callback — handle Google OAuth callback */
export async function handleGoogleOAuthCallback(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const { clientId, clientSecret, callbackUrl, webAppUrl } = getGoogleOAuthConfig();
  if (!clientId || !clientSecret) {
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "Google OAuth is not configured");
    return;
  }

  /* v8 ignore next */
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    const desc = url.searchParams.get("error_description") ?? error;
    res.writeHead(302, { Location: `${webAppUrl}/account?error=${encodeURIComponent(desc)}` });
    res.end();
    return;
  }

  if (!code || !state) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "Missing code or state parameter");
    return;
  }

  // Validate CSRF state
  if (!(await consumeOAuthState(state))) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "Invalid or expired OAuth state");
    return;
  }

  try {
    // Exchange code for access token (Google requires the redirect_uri to match).
    const tokenResponse = await exchangeGoogleCode(clientId, clientSecret, code, callbackUrl);

    // Get Google user profile (OIDC userinfo: sub, email, name).
    const gUser = await getGoogleUser(tokenResponse.access_token);

    // Find or create account, get API key (email-merge mirrors GitHub).
    const { rawKey } = await upsertAccountByGoogle(gUser.sub, gUser.name, gUser.email);

    // Hand the key to the web app via a one-time code, NOT the URL — so the raw
    // key never appears in the address bar, browser history, Referer, or logs.
    const handoffCode = createAuthCode(rawKey);
    const redirectUrl = new URL("/account", webAppUrl);
    redirectUrl.searchParams.set("code", handoffCode);
    redirectUrl.searchParams.set("login", "google");
    res.writeHead(302, {
      Location: redirectUrl.toString(),
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    });
    res.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OAuth exchange failed";
    res.writeHead(302, { Location: `${webAppUrl}/account?error=${encodeURIComponent(msg)}` });
    res.end();
  }
}

/** POST /v1/auth/exchange — trade a one-time OAuth code for the API key (body: { code }). */
export async function handleOAuthExchange(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: { code?: unknown };
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }
  const code = body.code;
  if (typeof code !== "string" || !code) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "code is required");
    return;
  }
  const rawKey = consumeAuthCode(code);
  if (!rawKey) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "Invalid or expired code");
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  // Establish a first-party HttpOnly session cookie. Effective once the API is
  // served same-site with the web app; until then it's simply not sent and the
  // body key is used (kept for backward compatibility during the cutover).
  res.setHeader("Set-Cookie", sessionCookie(encodeURIComponent(rawKey), SESSION_COOKIE_MAX_AGE_S, getOAuthConfig().webAppUrl));
  sendJSON(res, 200, { api_key: rawKey });
}

/** POST /v1/auth/session — exchange a raw api_key for the first-party HttpOnly session cookie,
 *  so the web (create-account / paste-key flows) never has to persist the bearer in localStorage.
 *  The key is validated first; the cookie value is the key (read back by resolveAuth). */
export async function handleCreateSession(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: { api_key?: unknown };
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }
  const apiKey = body.api_key;
  if (typeof apiKey !== "string" || !apiKey) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "api_key is required");
    return;
  }
  const resolved = await resolveApiKey(apiKey);
  if (!resolved) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Invalid api_key");
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Set-Cookie", sessionCookie(encodeURIComponent(apiKey), SESSION_COOKIE_MAX_AGE_S, getOAuthConfig().webAppUrl));
  sendJSON(res, 200, { ok: true });
}

/**
 * POST /v1/auth/logout — clear the first-party session cookie (HttpOnly, so it
 * must be cleared server-side) and discard the account's uploaded source
 * content (R5.7: "we don't keep your source" is a real guarantee only for the
 * web dashboard, whose login/logout gives us a discard trigger — API/CLI/MCP
 * callers have no session concept and are unaffected; see TermsPage.tsx).
 *
 * Cycle 28 audit finding: resolving via the general resolveAuth (which also
 * accepts Bearer/X-Axis-Key) would discard for ANY caller presenting a valid
 * API key to this route, not just a real web session — silently breaking the
 * "API/CLI/MCP callers are unaffected" claim for the edge case of an API
 * caller that happens to hit this web-specific endpoint. Resolving SPECIFICALLY
 * from the session cookie (ignoring any Bearer/X-Axis-Key header entirely for
 * this decision) makes that claim structurally true, not just conventionally
 * true. Account is resolved BEFORE the cookie is cleared. The discard is
 * best-effort: a failure here must never block logout itself.
 */
export async function handleOAuthLogout(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const sessionKey = readSessionCookie(req);
  if (sessionKey) {
    const resolved = await resolveApiKey(sessionKey);
    if (resolved) {
      try {
        const discarded = await discardAccountSnapshotContent(resolved.account.account_id);
        if (discarded > 0) {
          log("info", "logout_content_discarded", { account_id: resolved.account.account_id, snapshots: discarded });
        }
      } catch (err) {
        log("error", "logout_discard_failed", {
          account_id: resolved.account.account_id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Set-Cookie", sessionCookie("", 0, getOAuthConfig().webAppUrl));
  sendJSON(res, 200, { ok: true });
}
