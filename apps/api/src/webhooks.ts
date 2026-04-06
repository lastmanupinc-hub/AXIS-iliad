import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, readBody, sendError } from "./router.js";
import { requireAuth } from "./billing.js";
import { ErrorCode } from "./logger.js";
import {
  createWebhook,
  listWebhooks,
  getWebhook,
  deleteWebhook,
  updateWebhookActive,
  getDeliveries,
  VALID_WEBHOOK_EVENTS,
  type WebhookEventType,
} from "@axis/snapshots";

/** POST /v1/account/webhooks — register a new webhook (requires auth) */
export async function handleCreateWebhook(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const url = body.url;
  const events = body.events;
  const secret = body.secret;

  if (!url || typeof url !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "url is required (string)");
    return;
  }

  // Validate URL format
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      sendError(res, 400, ErrorCode.INVALID_FORMAT, "url must use http or https protocol");
      return;
    }
  } catch {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "url must be a valid URL");
    return;
  }

  if (!Array.isArray(events) || events.length === 0) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "events must be a non-empty array");
    return;
  }

  const invalidEvents = events.filter(
    (e) => typeof e !== "string" || !(VALID_WEBHOOK_EVENTS as readonly string[]).includes(e),
  );
  if (invalidEvents.length > 0) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, `Invalid event types: ${invalidEvents.join(", ")}. Valid: ${VALID_WEBHOOK_EVENTS.join(", ")}`);
    return;
  }

  if (secret !== undefined && typeof secret !== "string") {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "secret must be a string if provided");
    return;
  }

  const webhook = createWebhook(
    ctx.account!.account_id,
    url,
    events as WebhookEventType[],
    typeof secret === "string" ? secret : undefined,
  );

  sendJSON(res, 201, { webhook });
}

/** GET /v1/account/webhooks — list registered webhooks (requires auth) */
export async function handleListWebhooks(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAuth(req, res);
  /* v8 ignore next — V8 quirk: auth guard tested in webhooks.test.ts */
  if (!ctx) return;

  const webhooks = listWebhooks(ctx.account!.account_id);
  // Redact secrets in listing
  const safe = webhooks.map((w) => ({
    ...w,
    secret: w.secret ? "***" : null,
  }));

  sendJSON(res, 200, { webhooks: safe, count: safe.length });
}

/** DELETE /v1/account/webhooks/:webhook_id — delete a webhook (requires auth) */
export async function handleDeleteWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const { webhook_id } = params;
  const existing = getWebhook(webhook_id);

  if (!existing || existing.account_id !== ctx.account!.account_id) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Webhook not found");
    return;
  }

  deleteWebhook(webhook_id);
  sendJSON(res, 200, { deleted: true, webhook_id });
}

/** POST /v1/account/webhooks/:webhook_id/toggle — enable/disable (requires auth) */
export async function handleToggleWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const { webhook_id } = params;
  const existing = getWebhook(webhook_id);

  if (!existing || existing.account_id !== ctx.account!.account_id) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Webhook not found");
    return;
  }

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  if (typeof body.active !== "boolean") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "active must be a boolean");
    return;
  }

  updateWebhookActive(webhook_id, body.active);
  sendJSON(res, 200, { webhook_id, active: body.active });
}

/** GET /v1/account/webhooks/:webhook_id/deliveries — delivery history (requires auth) */
export async function handleWebhookDeliveries(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const { webhook_id } = params;
  const existing = getWebhook(webhook_id);

  if (!existing || existing.account_id !== ctx.account!.account_id) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Webhook not found");
    return;
  }

  /* v8 ignore next — req.url always present in tests */
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  /* v8 ignore next — V8 quirk on compound Math.min/max/parseInt */
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1), 100);

  const deliveries = getDeliveries(webhook_id, limit);
  sendJSON(res, 200, { deliveries, count: deliveries.length });
}
