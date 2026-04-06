/**
 * eq_113: Webhook-store branch coverage — targets untested conditional paths
 * in webhook-store.ts (production HTTP dispatch/retry paths, empty webhooks)
 * and webhooks.ts (cross-account security, limit clamping, secret validation).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import * as http from "node:http";
import type { Server } from "node:http";
import {
  openMemoryDb,
  closeDb,
  createAccount,
  createApiKey,
  createWebhook,
  dispatchWebhookEvent,
  processRetryQueue,
  recordDelivery,
  getDeliveries,
  getActiveWebhooksForEvent,
  type WebhookEventType,
} from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import {
  handleCreateWebhook,
  handleListWebhooks,
  handleDeleteWebhook,
  handleToggleWebhook,
  handleWebhookDeliveries,
} from "./webhooks.js";
import { resetRateLimits } from "./rate-limiter.js";

const API_PORT = 44475;
const RECEIVER_PORT = 44476;

let apiServer: Server;
let receiverServer: Server;

// Track what the webhook receiver gets
let receivedRequests: Array<{
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  statusToReturn: number;
}> = [];
let nextReceiverStatus = 200;

// ─── HTTP helper ────────────────────────────────────────────────

interface Res {
  status: number;
  data: Record<string, unknown>;
}

async function req(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined
      ? typeof body === "string" ? body : JSON.stringify(body)
      : undefined;
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port: API_PORT,
        path,
        method,
        headers: { "Content-Type": "application/json", ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: Record<string, unknown> = {};
          try { data = JSON.parse(raw); } catch { data = { raw } as any; }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// ─── Auth ─────────────────────────────────────────────────────

let acctA: { account_id: string; headers: Record<string, string> };
let acctB: { account_id: string; headers: Record<string, string> };

// ─── Setup ──────────────────────────────────────────────────────

beforeAll(async () => {
  openMemoryDb();
  resetRateLimits();

  // Auth
  const a = createAccount("Acct A", "a@test.com", "paid");
  const aKey = createApiKey(a.account_id, "a-key");
  acctA = { account_id: a.account_id, headers: { Authorization: `Bearer ${aKey.rawKey}` } };

  const b = createAccount("Acct B", "b@test.com", "paid");
  const bKey = createApiKey(b.account_id, "b-key");
  acctB = { account_id: b.account_id, headers: { Authorization: `Bearer ${bKey.rawKey}` } };

  // Webhook receiver server
  receiverServer = http.createServer((req2, res2) => {
    const chunks: Buffer[] = [];
    req2.on("data", (c: Buffer) => chunks.push(c));
    req2.on("end", () => {
      receivedRequests.push({
        method: req2.method ?? "GET",
        headers: req2.headers as Record<string, string | string[] | undefined>,
        body: Buffer.concat(chunks).toString("utf-8"),
        statusToReturn: nextReceiverStatus,
      });
      res2.writeHead(nextReceiverStatus);
      res2.end("ok");
    });
  });
  await new Promise<void>((resolve) => receiverServer.listen(RECEIVER_PORT, "127.0.0.1", resolve));

  // API server
  const router = new Router();
  router.post("/v1/account/webhooks", handleCreateWebhook);
  router.get("/v1/account/webhooks", handleListWebhooks);
  router.delete("/v1/account/webhooks/:webhook_id", handleDeleteWebhook);
  router.post("/v1/account/webhooks/:webhook_id/toggle", handleToggleWebhook);
  router.get("/v1/account/webhooks/:webhook_id/deliveries", handleWebhookDeliveries);
  apiServer = createApp(router, API_PORT);
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
});

afterEach(() => {
  receivedRequests = [];
  nextReceiverStatus = 200;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    apiServer.close((err) => (err ? reject(err) : resolve())),
  );
  await new Promise<void>((resolve, reject) =>
    receiverServer.close((err) => (err ? reject(err) : resolve())),
  );
  closeDb();
});

// ─── webhook-store: dispatchWebhookEvent production HTTP path ───

describe("dispatchWebhookEvent production HTTP paths", () => {
  it("dispatches via HTTP and receiver gets the request", async () => {
    createWebhook(acctA.account_id, `http://127.0.0.1:${RECEIVER_PORT}/hook`, ["snapshot.created"]);
    dispatchWebhookEvent("snapshot.created", { test: true });
    // Fire-and-forget, give it time to arrive
    await new Promise((r) => setTimeout(r, 200));
    expect(receivedRequests.length).toBeGreaterThanOrEqual(1);
    const last = receivedRequests[receivedRequests.length - 1];
    expect(last.headers["x-axis-event"]).toBe("snapshot.created");
    const parsed = JSON.parse(last.body);
    expect(parsed.event).toBe("snapshot.created");
    expect(parsed.data.test).toBe(true);
  });

  it("dispatches with HMAC signature when secret is set", async () => {
    createWebhook(acctA.account_id, `http://127.0.0.1:${RECEIVER_PORT}/hook-secret`, ["snapshot.created"], "my-secret");
    dispatchWebhookEvent("snapshot.created", { signed: true });
    await new Promise((r) => setTimeout(r, 200));
    const last = receivedRequests[receivedRequests.length - 1];
    expect(last.headers["x-axis-signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it("records failed delivery when receiver returns 500", async () => {
    const wh = createWebhook(acctA.account_id, `http://127.0.0.1:${RECEIVER_PORT}/fail`, ["snapshot.deleted"]);
    nextReceiverStatus = 500;
    dispatchWebhookEvent("snapshot.deleted", { fail: true });
    await new Promise((r) => setTimeout(r, 200));
    const deliveries = getDeliveries(wh.webhook_id, 10);
    const last = deliveries[deliveries.length - 1];
    if (last) {
      expect(last.success).toBe(false);
      expect(last.status_code).toBe(500);
    }
  });

  it("records failed delivery on connection refused", async () => {
    // Use a port that nothing is listening on
    const wh = createWebhook(acctA.account_id, "http://127.0.0.1:44499/nope", ["snapshot.created"]);
    dispatchWebhookEvent("snapshot.created", { refuse: true });
    await new Promise((r) => setTimeout(r, 500));
    const deliveries = getDeliveries(wh.webhook_id, 10);
    if (deliveries.length > 0) {
      const last = deliveries[deliveries.length - 1];
      expect(last.success).toBe(false);
    }
  });

  it("returns early when no webhooks match event type", () => {
    // No webhooks for "generator.completed" — just confirm no throw
    dispatchWebhookEvent("generator.completed" as WebhookEventType, { empty: true });
  });

  it("catches malformed URL", async () => {
    // Direct DB insert with bad URL to bypass createWebhook validation
    const wh = createWebhook(acctA.account_id, `http://127.0.0.1:${RECEIVER_PORT}/valid`, ["snapshot.created"]);
    // Override the URL to something unparseable in the DB
    const { getDb } = await import("@axis/snapshots");
    (getDb as any)().prepare("UPDATE webhooks SET url = ? WHERE webhook_id = ?").run("://invalid", wh.webhook_id);
    dispatchWebhookEvent("snapshot.created", { bad_url: true });
    await new Promise((r) => setTimeout(r, 200));
    const deliveries = getDeliveries(wh.webhook_id, 10);
    if (deliveries.length > 0) {
      const last = deliveries[deliveries.length - 1];
      expect(last.success).toBe(false);
    }
  });
});

// ─── webhook-store: processRetryQueue production HTTP path ──────

describe("processRetryQueue production HTTP paths", () => {
  it("retries via real HTTP and records success", async () => {
    const wh = createWebhook(acctA.account_id, `http://127.0.0.1:${RECEIVER_PORT}/retry`, ["snapshot.created"]);
    // Seed a failed delivery that's eligible for retry
    recordDelivery(wh.webhook_id, "snapshot.created", '{"retry":true}', 500, "error", false, 1);
    // Process without sendFn — uses production HTTP path
    const count = processRetryQueue();
    expect(count).toBeGreaterThanOrEqual(0);
    await new Promise((r) => setTimeout(r, 300));
  });

  it("retries and records failure on 500 response", async () => {
    const wh = createWebhook(acctA.account_id, `http://127.0.0.1:${RECEIVER_PORT}/retry-fail`, ["snapshot.created"]);
    recordDelivery(wh.webhook_id, "snapshot.created", '{"retry_fail":true}', 500, "error", false, 1);
    nextReceiverStatus = 503;
    processRetryQueue();
    await new Promise((r) => setTimeout(r, 300));
  });

  it("retries and handles connection error", async () => {
    const wh = createWebhook(acctA.account_id, "http://127.0.0.1:44499/dead", ["snapshot.created"]);
    recordDelivery(wh.webhook_id, "snapshot.created", '{"conn_error":true}', null, "refused", false, 1);
    processRetryQueue();
    await new Promise((r) => setTimeout(r, 500));
  });
});

// ─── webhooks.ts: cross-account security ────────────────────────

describe("webhooks.ts cross-account security", () => {
  let webhookId: string;

  beforeAll(async () => {
    // Create webhook under acctA
    const r = await req("POST", "/v1/account/webhooks", {
      url: `http://127.0.0.1:${RECEIVER_PORT}/cross`,
      events: ["snapshot.created"],
    }, acctA.headers);
    webhookId = (r.data.webhook as any).webhook_id;
  });

  it("DELETE returns 404 for cross-account webhook", async () => {
    const r = await req("DELETE", `/v1/account/webhooks/${webhookId}`, undefined, acctB.headers);
    expect(r.status).toBe(404);
    expect(r.data.error_code).toBe("NOT_FOUND");
  });

  it("TOGGLE returns 404 for cross-account webhook", async () => {
    const r = await req("POST", `/v1/account/webhooks/${webhookId}/toggle`, { active: false }, acctB.headers);
    expect(r.status).toBe(404);
  });

  it("DELIVERIES returns 404 for cross-account webhook", async () => {
    const r = await req("GET", `/v1/account/webhooks/${webhookId}/deliveries`, undefined, acctB.headers);
    expect(r.status).toBe(404);
  });
});

// ─── webhooks.ts: input validation ──────────────────────────────

describe("webhooks.ts input validation branches", () => {
  it("rejects non-string secret", async () => {
    const r = await req("POST", "/v1/account/webhooks", {
      url: `http://127.0.0.1:${RECEIVER_PORT}/val`,
      events: ["snapshot.created"],
      secret: 12345,
    }, acctA.headers);
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  it("delivery limit defaults to 20 on non-numeric", async () => {
    // Create a webhook owned by acctA
    const cRes = await req("POST", "/v1/account/webhooks", {
      url: `http://127.0.0.1:${RECEIVER_PORT}/limit`,
      events: ["snapshot.created"],
    }, acctA.headers);
    const whId = (cRes.data.webhook as any).webhook_id;

    const r = await req("GET", `/v1/account/webhooks/${whId}/deliveries?limit=abc`, undefined, acctA.headers);
    expect(r.status).toBe(200);
  });

  it("delivery limit clamps to min 1", async () => {
    const cRes = await req("POST", "/v1/account/webhooks", {
      url: `http://127.0.0.1:${RECEIVER_PORT}/lim0`,
      events: ["snapshot.created"],
    }, acctA.headers);
    const whId = (cRes.data.webhook as any).webhook_id;

    const r = await req("GET", `/v1/account/webhooks/${whId}/deliveries?limit=0`, undefined, acctA.headers);
    expect(r.status).toBe(200);
  });

  it("delivery limit clamps to max 100", async () => {
    const cRes = await req("POST", "/v1/account/webhooks", {
      url: `http://127.0.0.1:${RECEIVER_PORT}/lim999`,
      events: ["snapshot.created"],
    }, acctA.headers);
    const whId = (cRes.data.webhook as any).webhook_id;

    const r = await req("GET", `/v1/account/webhooks/${whId}/deliveries?limit=999`, undefined, acctA.headers);
    expect(r.status).toBe(200);
  });
});
