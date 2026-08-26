// ─── app_32: Sentry connect flow — REST surface ─────────────────
//
// "Build the flow, don't fake the data" (APPLICATION_BUILD_STRATEGY.md:186).
// Mirrors the GitHub token endpoints in billing.ts exactly (same auth wall,
// same validation ladder, same never-echo-the-secret posture) — a second
// pattern for the same problem is how one of them rots. Unlike app_30's GSC
// half, nothing here is owner-gated: a Sentry connection is a user-supplied
// token, no OAuth app, no owner property.

import type { IncomingMessage, ServerResponse } from "node:http";
import { readBody, sendJSON, sendError } from "./router.js";
import { ErrorCode } from "./logger.js";
import { requireAuth } from "./billing.js";
import {
  saveSentryConnection,
  getSentryConnections,
  deleteSentryConnection,
} from "@axis/snapshots";

const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,98}$/i;
const REPO_RE = /^[^/\s]+\/[^/\s]+$/;

/** POST /v1/account/sentry-token — store a Sentry connection (requires auth) */
export async function handleSaveSentryConnection(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const token = body.token;
  if (!token || typeof token !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "token is required (Sentry auth token with event:read scope)");
    return;
  }
  if (token.length < 10 || token.length > 500) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "token must be between 10 and 500 characters");
    return;
  }

  for (const field of ["org_slug", "project_slug"] as const) {
    const v = body[field];
    if (!v || typeof v !== "string") {
      sendError(res, 400, ErrorCode.MISSING_FIELD, `${field} is required (the Sentry ${field === "org_slug" ? "organization" : "project"} this token reads)`);
      return;
    }
    if (!SLUG_RE.test(v)) {
      sendError(res, 400, ErrorCode.INVALID_FORMAT, `${field} must be a valid Sentry slug`);
      return;
    }
  }

  const repo = body.repo_full_name;
  if (!repo || typeof repo !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "repo_full_name is required (owner/repo — the watched repository this Sentry project's incidents belong to)");
    return;
  }
  if (!REPO_RE.test(repo)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "repo_full_name must be owner/repo");
    return;
  }

  const webhook_secret = typeof body.webhook_secret === "string" && body.webhook_secret.length > 0 ? body.webhook_secret : undefined;
  if (webhook_secret !== undefined && (webhook_secret.length < 8 || webhook_secret.length > 500)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "webhook_secret must be between 8 and 500 characters");
    return;
  }
  const label = typeof body.label === "string" ? body.label : "default";

  const saved = await saveSentryConnection(
    ctx.account!.account_id,
    token,
    String(body.org_slug),
    String(body.project_slug),
    repo,
    { label, webhook_secret },
  );

  sendJSON(res, 201, {
    token_id: saved.token_id,
    label: saved.label,
    token_prefix: saved.token_prefix,
    org_slug: saved.org_slug,
    project_slug: saved.project_slug,
    repo_full_name: saved.repo_full_name,
    has_webhook_secret: saved.has_webhook_secret,
    created_at: saved.created_at,
    message: saved.has_webhook_secret
      ? "Sentry connection stored securely. Point your Sentry integration's webhook at POST /v1/sentry/webhook to trigger postmortem drafts."
      : "Sentry connection stored securely. No webhook_secret was provided, so incidents cannot trigger the webhook — the token is usable for outbound reads only.",
  });
}

/** GET /v1/account/sentry-token — list stored Sentry connections (requires auth) */
export async function handleListSentryConnections(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ctx = await requireAuth(req, res);
  /* v8 ignore next */
  if (!ctx) return;

  const connections = await getSentryConnections(ctx.account!.account_id);
  sendJSON(res, 200, {
    connections: connections.map((c) => ({
      token_id: c.token_id,
      label: c.label,
      token_prefix: c.token_prefix,
      org_slug: c.org_slug,
      project_slug: c.project_slug,
      repo_full_name: c.repo_full_name,
      has_webhook_secret: c.has_webhook_secret,
      created_at: c.created_at,
      last_used_at: c.last_used_at,
      valid: c.valid === 1,
    })),
  });
}

/** DELETE /v1/account/sentry-token/:token_id — remove a stored Sentry connection (requires auth) */
export async function handleDeleteSentryConnection(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  /* v8 ignore next */
  if (!ctx) return;

  const { token_id } = params;
  const deleted = await deleteSentryConnection(ctx.account!.account_id, token_id);
  if (!deleted) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Sentry connection not found");
    return;
  }

  sendJSON(res, 200, { token_id, deleted: true });
}
