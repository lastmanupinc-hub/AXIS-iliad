// ─── app_33: LLM provider-key connect flow — REST surface ────────
//
// Mirrors sentry.ts's connect flow exactly (same auth wall, same validation
// ladder, same never-echo-the-secret posture) — generalized over `provider`
// instead of being Sentry-specific, matching the store it sits on top of
// (provider-credential-store.ts / pg-schema.ts v46). A user-supplied API
// key, no OAuth app, nothing owner-gated.

import type { IncomingMessage, ServerResponse } from "node:http";
import { readBody, sendJSON, sendError } from "./router.js";
import { ErrorCode } from "./logger.js";
import { requireAuth } from "./billing.js";
import {
  saveProviderCredential,
  getProviderCredentials,
  deleteProviderCredential,
  type LlmProvider,
} from "@axis/snapshots";

const REPO_RE = /^[^/\s]+\/[^/\s]+$/;
const PROVIDERS: readonly LlmProvider[] = ["openai", "anthropic"];

/** POST /v1/account/provider-key — store an LLM provider API key (requires auth) */
export async function handleSaveProviderCredential(req: IncomingMessage, res: ServerResponse): Promise<void> {
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

  const provider = body.provider;
  if (!provider || typeof provider !== "string" || !PROVIDERS.includes(provider as LlmProvider)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, `provider must be one of: ${PROVIDERS.join(", ")}`);
    return;
  }

  const key = body.key;
  if (!key || typeof key !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "key is required (a usage/cost-read-capable API key for the given provider)");
    return;
  }
  if (key.length < 10 || key.length > 500) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "key must be between 10 and 500 characters");
    return;
  }

  const repo = body.repo_full_name;
  if (!repo || typeof repo !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "repo_full_name is required (owner/repo — the watched repository this key's usage will be attributed to)");
    return;
  }
  if (!REPO_RE.test(repo)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "repo_full_name must be owner/repo");
    return;
  }

  const label = typeof body.label === "string" ? body.label : "default";
  const metadata = typeof body.metadata === "object" && body.metadata !== null ? (body.metadata as Record<string, unknown>) : undefined;

  const saved = await saveProviderCredential(ctx.account!.account_id, provider as LlmProvider, key, repo, { label, metadata });

  sendJSON(res, 201, {
    credential_id: saved.credential_id,
    provider: saved.provider,
    label: saved.label,
    key_prefix: saved.key_prefix,
    repo_full_name: saved.repo_full_name,
    created_at: saved.created_at,
    message: "Provider key stored securely. AXIS Optimization will pull real usage on the next scheduled poll and reconcile it against detected call sites in this repository.",
  });
}

/** GET /v1/account/provider-key — list stored provider credentials (requires auth) */
export async function handleListProviderCredentials(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ctx = await requireAuth(req, res);
  /* v8 ignore next */
  if (!ctx) return;

  const credentials = await getProviderCredentials(ctx.account!.account_id);
  sendJSON(res, 200, {
    credentials: credentials.map((c) => ({
      credential_id: c.credential_id,
      provider: c.provider,
      label: c.label,
      key_prefix: c.key_prefix,
      repo_full_name: c.repo_full_name,
      created_at: c.created_at,
      last_used_at: c.last_used_at,
      valid: c.valid === 1,
    })),
  });
}

/** DELETE /v1/account/provider-key/:credential_id — remove a stored provider credential (requires auth) */
export async function handleDeleteProviderCredential(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  /* v8 ignore next */
  if (!ctx) return;

  const { credential_id } = params;
  const deleted = await deleteProviderCredential(ctx.account!.account_id, credential_id);
  if (!deleted) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Provider credential not found");
    return;
  }

  sendJSON(res, 200, { credential_id, deleted: true });
}
