import { randomUUID, createHmac } from "node:crypto";
import * as https from "node:https";
import * as http from "node:http";
import { sql } from "./pg.js";

// ─── Types ──────────────────────────────────────────────────────

export type WebhookEventType =
  | "snapshot.created"
  | "snapshot.deleted"
  | "project.deleted"
  | "generation.completed";

export const VALID_WEBHOOK_EVENTS: readonly WebhookEventType[] = [
  "snapshot.created",
  "snapshot.deleted",
  "project.deleted",
  "generation.completed",
] as const;

export interface Webhook {
  webhook_id: string;
  account_id: string;
  url: string;
  events: WebhookEventType[];
  secret: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  delivery_id: string;
  webhook_id: string;
  event_type: string;
  payload: string;
  status_code: number | null;
  response_body: string | null;
  success: boolean;
  attempted_at: string;
  attempt_number: number;
  next_retry_at: string | null;
  dead_lettered: boolean;
}

// ─── Retry constants ────────────────────────────────────────────

export const MAX_RETRY_ATTEMPTS = 5;
export const RETRY_BACKOFF_BASE_MS = 2_000; // 2s, 8s, 32s, 128s, 512s

// ─── Webhook CRUD ───────────────────────────────────────────────

interface WebhookRow {
  webhook_id: string;
  account_id: string;
  url: string;
  events: string;
  secret: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

function rowToWebhook(row: WebhookRow): Webhook {
  return {
    ...row,
    events: JSON.parse(row.events) as WebhookEventType[],
    active: row.active === 1,
  };
}

export async function createWebhook(
  account_id: string,
  url: string,
  events: WebhookEventType[],
  secret?: string,
): Promise<Webhook> {
  const now = new Date().toISOString();
  const webhook_id = randomUUID();
  const eventsJson = JSON.stringify(events);

  await sql.run(
    "INSERT INTO webhooks (webhook_id, account_id, url, events, secret, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
    [webhook_id, account_id, url, eventsJson, secret ?? null, now, now],
  );

  return {
    webhook_id,
    account_id,
    url,
    events,
    secret: secret ?? null,
    active: true,
    created_at: now,
    updated_at: now,
  };
}

export async function listWebhooks(account_id: string): Promise<Webhook[]> {
  const rows = await sql.many<WebhookRow>(
    "SELECT * FROM webhooks WHERE account_id = ? ORDER BY created_at DESC",
    [account_id],
  );
  return rows.map(rowToWebhook);
}

export async function getWebhook(webhook_id: string): Promise<Webhook | undefined> {
  const row = await sql.one<WebhookRow>("SELECT * FROM webhooks WHERE webhook_id = ?", [webhook_id]);
  return row ? rowToWebhook(row) : undefined;
}

export async function deleteWebhook(webhook_id: string): Promise<boolean> {
  const result = await sql.run("DELETE FROM webhooks WHERE webhook_id = ?", [webhook_id]);
  return result.rowCount > 0;
}

export async function updateWebhookActive(webhook_id: string, active: boolean): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await sql.run(
    "UPDATE webhooks SET active = ?, updated_at = ? WHERE webhook_id = ?",
    [active ? 1 : 0, now, webhook_id],
  );
  return result.rowCount > 0;
}

// ─── Webhook delivery ───────────────────────────────────────────

export async function getActiveWebhooksForEvent(event_type: WebhookEventType): Promise<Webhook[]> {
  // SQLite JSON containment: events column is a JSON array, search for matching event
  const rows = await sql.many<WebhookRow>(
    "SELECT * FROM webhooks WHERE active = 1 AND events LIKE ?",
    [`%"${event_type}"%`],
  );
  return rows.map(rowToWebhook);
}

export function computeNextRetryAt(attempt_number: number): string {
  const delayMs = RETRY_BACKOFF_BASE_MS * Math.pow(4, attempt_number - 1);
  return new Date(Date.now() + delayMs).toISOString();
}

export async function recordDelivery(
  webhook_id: string,
  event_type: string,
  payload: string,
  status_code: number | null,
  response_body: string | null,
  success: boolean,
  attempt_number = 1,
): Promise<WebhookDelivery> {
  const delivery_id = randomUUID();
  const attempted_at = new Date().toISOString();

  // Schedule retry if failed and under max attempts
  let next_retry_at: string | null = null;
  let dead_lettered = false;
  if (!success) {
    if (attempt_number < MAX_RETRY_ATTEMPTS) {
      next_retry_at = computeNextRetryAt(attempt_number);
    } else {
      dead_lettered = true;
    }
  }

  await sql.run(
    "INSERT INTO webhook_deliveries (delivery_id, webhook_id, event_type, payload, status_code, response_body, success, attempted_at, attempt_number, next_retry_at, dead_lettered) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [delivery_id, webhook_id, event_type, payload, status_code, response_body, success ? 1 : 0, attempted_at, attempt_number, next_retry_at, dead_lettered ? 1 : 0],
  );

  return { delivery_id, webhook_id, event_type, payload, status_code, response_body, success, attempted_at, attempt_number, next_retry_at, dead_lettered };
}

export async function getDeliveries(webhook_id: string, limit = 20): Promise<WebhookDelivery[]> {
  const rows = await sql.many<Omit<WebhookDelivery, "success" | "dead_lettered"> & { success: number; dead_lettered: number }>(
    "SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY attempted_at DESC LIMIT ?",
    [webhook_id, limit],
  );
  return rows.map(({ success, dead_lettered, ...rest }) => ({ ...rest, success: success === 1, dead_lettered: dead_lettered === 1 }));
}

// ─── Retry queue ────────────────────────────────────────────────

export interface RetryCandidate {
  delivery_id: string;
  webhook_id: string;
  event_type: string;
  payload: string;
  attempt_number: number;
}

/** Get deliveries due for retry (next_retry_at ≤ now, not dead-lettered, not succeeded). */
export async function getPendingRetries(limit = 50): Promise<RetryCandidate[]> {
  const now = new Date().toISOString();
  return await sql.many<RetryCandidate>(
    `SELECT delivery_id, webhook_id, event_type, payload, attempt_number
     FROM webhook_deliveries
     WHERE next_retry_at IS NOT NULL
       AND next_retry_at <= ?
       AND dead_lettered = 0
       AND success = 0
     ORDER BY next_retry_at ASC
     LIMIT ?`,
    [now, limit],
  );
}

/** Mark a delivery as consumed (clear its retry schedule). */
export async function clearRetrySchedule(delivery_id: string): Promise<void> {
  await sql.run("UPDATE webhook_deliveries SET next_retry_at = NULL WHERE delivery_id = ?", [delivery_id]);
}

/** Get all dead-lettered deliveries for a webhook. */
export async function getDeadLetters(webhook_id: string, limit = 50): Promise<WebhookDelivery[]> {
  const rows = await sql.many<Omit<WebhookDelivery, "success" | "dead_lettered"> & { success: number; dead_lettered: number }>(
    "SELECT * FROM webhook_deliveries WHERE webhook_id = ? AND dead_lettered = 1 ORDER BY attempted_at DESC LIMIT ?",
    [webhook_id, limit],
  );
  return rows.map(({ success, dead_lettered, ...rest }) => ({ ...rest, success: success === 1, dead_lettered: dead_lettered === 1 }));
}

/** Process retry queue — fetch due retries and re-dispatch them. Returns count processed. */
export async function processRetryQueue(
  sendFn?: (wh: Webhook, payload: string, headers: Record<string, string>) => Promise<{ status_code: number | null; response_body: string | null; success: boolean }>,
): Promise<number> {
  const pending = await getPendingRetries();
  if (pending.length === 0) return 0;

  let processed = 0;
  for (const candidate of pending) {
    // Clear the old delivery's retry schedule
    await clearRetrySchedule(candidate.delivery_id);

    const wh = await getWebhook(candidate.webhook_id);
    if (!wh || !wh.active) {
      // Webhook was deleted or disabled — mark original delivery as dead-lettered in place
      await sql.run(
        "UPDATE webhook_deliveries SET dead_lettered = 1, next_retry_at = NULL, response_body = ? WHERE delivery_id = ?",
        ["webhook_disabled_or_deleted", candidate.delivery_id],
      );
      processed++;
      continue;
    }

    const nextAttempt = candidate.attempt_number + 1;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Axis-Event": candidate.event_type,
      "X-Axis-Delivery": randomUUID(),
      "X-Axis-Retry": String(nextAttempt),
    };
    if (wh.secret) {
      headers["X-Axis-Signature"] = `sha256=${signPayload(candidate.payload, wh.secret)}`;
    }

    if (sendFn) {
      // Synchronous path for testing
      sendFn(wh, candidate.payload, headers)
        .then((result) => {
          void recordDelivery(
            wh.webhook_id,
            candidate.event_type,
            candidate.payload,
            result.status_code,
            result.response_body,
            result.success,
            nextAttempt,
          );
        })
        .catch((err: Error) => {
          void recordDelivery(
            wh.webhook_id,
            candidate.event_type,
            candidate.payload,
            null,
            err.message,
            false,
            nextAttempt,
          );
        });
    } else {
      /* v8 ignore start — production HTTP path requires live external server */
      // Production path: fire-and-forget HTTP POST
      try {
        const url = new URL(wh.url);
        const mod = url.protocol === "https:" ? https : http;
        const req = mod.request(
          {
            hostname: url.hostname,
            port: url.port || (url.protocol === "https:" ? 443 : 80),
            path: url.pathname + url.search,
            method: "POST",
            headers,
            timeout: 10_000,
          },
          (res: { statusCode?: number; on: (event: string, cb: (data?: Buffer) => void) => void }) => {
            const chunks: Buffer[] = [];
            res.on("data", (d?: Buffer) => { if (d) chunks.push(d); });
            res.on("end", () => {
              const body = Buffer.concat(chunks).toString("utf-8").slice(0, 1000);
              void recordDelivery(wh.webhook_id, candidate.event_type, candidate.payload, res.statusCode ?? 0, body, (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300, nextAttempt);
            });
          },
        );
        req.on("error", (err: Error) => {
          void recordDelivery(wh.webhook_id, candidate.event_type, candidate.payload, null, err.message, false, nextAttempt);
        });
        /* v8 ignore start — timeout fires only on slow external HTTP targets */
        req.on("timeout", () => {
          req.destroy();
          void recordDelivery(wh.webhook_id, candidate.event_type, candidate.payload, null, "timeout", false, nextAttempt);
        });
        /* v8 ignore stop */
        req.write(candidate.payload);
        req.end();
      } catch (err) {
        void recordDelivery(wh.webhook_id, candidate.event_type, candidate.payload, null, String(err), false, nextAttempt);
      }
      /* v8 ignore stop */
    }
    processed++;
  }
  return processed;
}

// ─── Dispatch (fire-and-forget, non-blocking) ───────────────────

export function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function dispatchWebhookEvent(
  event_type: WebhookEventType,
  data: Record<string, unknown>,
): Promise<void> {
  const webhooks = await getActiveWebhooksForEvent(event_type);
  if (webhooks.length === 0) return;

  const payload = JSON.stringify({ event: event_type, data, timestamp: new Date().toISOString() });

  for (const wh of webhooks) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Axis-Event": event_type,
      "X-Axis-Delivery": randomUUID(),
    };

    if (wh.secret) {
      headers["X-Axis-Signature"] = `sha256=${signPayload(payload, wh.secret)}`;
    }

    // Fire-and-forget HTTP POST
    /* v8 ignore start — production HTTP path requires live external server */
    try {
      const url = new URL(wh.url);
      const mod = url.protocol === "https:" ? require("node:https") : require("node:http");
      const req = mod.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: url.pathname + url.search,
          method: "POST",
          headers,
          timeout: 10_000,
        },
        (res: { statusCode?: number; on: (event: string, cb: (data?: Buffer) => void) => void }) => {
          const chunks: Buffer[] = [];
          res.on("data", (d?: Buffer) => { if (d) chunks.push(d); });
          res.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf-8").slice(0, 1000);
            void recordDelivery(wh.webhook_id, event_type, payload, res.statusCode ?? 0, body, (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300, 1);
          });
        },
      );
      req.on("error", (err: Error) => {
        void recordDelivery(wh.webhook_id, event_type, payload, null, err.message, false, 1);
      });
      /* v8 ignore start — timeout fires only on slow external HTTP targets */
      req.on("timeout", () => {
        req.destroy();
        void recordDelivery(wh.webhook_id, event_type, payload, null, "timeout", false, 1);
      });
      /* v8 ignore stop */
      req.write(payload);
      req.end();
    } catch (err) {
      void recordDelivery(wh.webhook_id, event_type, payload, null, String(err), false, 1);
    }
    /* v8 ignore stop */
  }
}
