import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, sendError, readBody } from "./router.js";
import { ErrorCode } from "./logger.js";
import { SESSION_COOKIE } from "./billing.js";
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
  resolveApiKey,
} from "@axis/snapshots";

function getOAuthConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const callbackUrl = process.env.GITHUB_CALLBACK_URL ?? "http://localhost:4000/v1/auth/github/callback";
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
    // Exchange code for access token
    const tokenResponse = await exchangeGitHubCode(clientId, clientSecret, code);

    // Get GitHub user profile
    const ghUser = await getGitHubUser(tokenResponse.access_token);

    // Find or create account, get API key
    const { account, rawKey } = await upsertAccountByGitHub(
      ghUser.id,
      ghUser.name,
      ghUser.email,
    );

    // Store the GitHub access token (encrypted) for later API use
    await saveGitHubToken(account.account_id, tokenResponse.access_token, "oauth");

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

/** POST /v1/auth/logout — clear the first-party session cookie (HttpOnly, so it must be cleared server-side). */
export async function handleOAuthLogout(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Set-Cookie", sessionCookie("", 0, getOAuthConfig().webAppUrl));
  sendJSON(res, 200, { ok: true });
}
