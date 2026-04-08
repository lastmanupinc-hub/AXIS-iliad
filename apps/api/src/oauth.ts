import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, sendError } from "./router.js";
import { ErrorCode } from "./logger.js";
import {
  createOAuthState,
  consumeOAuthState,
  getGitHubAuthUrl,
  exchangeGitHubCode,
  getGitHubUser,
  upsertAccountByGitHub,
  saveGitHubToken,
} from "@axis/snapshots";

function getOAuthConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const callbackUrl = process.env.GITHUB_CALLBACK_URL ?? "http://localhost:4000/v1/auth/github/callback";
  const webAppUrl = process.env.AXIS_WEB_URL ?? "http://localhost:3000";
  return { clientId, clientSecret, callbackUrl, webAppUrl };
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

  const state = createOAuthState();
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
  if (!consumeOAuthState(state)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "Invalid or expired OAuth state");
    return;
  }

  try {
    // Exchange code for access token
    const tokenResponse = await exchangeGitHubCode(clientId, clientSecret, code);

    // Get GitHub user profile
    const ghUser = await getGitHubUser(tokenResponse.access_token);

    // Find or create account, get API key
    const { account, rawKey } = upsertAccountByGitHub(
      ghUser.id,
      ghUser.name,
      ghUser.email,
    );

    // Store the GitHub access token (encrypted) for later API use
    saveGitHubToken(account.account_id, tokenResponse.access_token, "oauth");

    // Redirect to web app with the API key
    const redirectUrl = new URL("/account", webAppUrl);
    redirectUrl.searchParams.set("key", rawKey);
    redirectUrl.searchParams.set("login", "github");
    res.writeHead(302, { Location: redirectUrl.toString() });
    res.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OAuth exchange failed";
    res.writeHead(302, { Location: `${webAppUrl}/account?error=${encodeURIComponent(msg)}` });
    res.end();
  }
}
