/**
 * eq_117: webhook-store.ts production HTTP coverage — targets uncovered lines
 * 271-314 (processRetryQueue production path) and 335-380 (dispatchWebhookEvent HTTP dispatch).
 * Uses a real localhost HTTP receiver to exercise fire-and-forget code paths.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import * as http from "node:http";
import type { Server } from "node:http";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import {
  createAccount,
  createWebhook,
  dispatchWebhookEvent,
  processRetryQueue,
  recordDelivery,
  getDeliveries,
  getActiveWebhooksForEvent,
  signPayload,
  type WebhookEventType,
} from "./index.js";

const RECEIVER_PORT = 44491;
let receiverServer: Server;

let receivedRequests: Array<{
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}> = [];
let nextReceiverStatus = 200;

// ─── Receiver setup ─────────────────────────────────────────────

beforeAll(async () => {
  receiverServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      receivedRequests.push({
        method: req.method ?? "GET",
        headers: req.headers as Record<string, string | string[] | undefined>,
        body: Buffer.concat(chunks).toString("utf-8"),
      });
      res.writeHead(nextReceiverStatus);
      res.end("ok");
    });
  });
  await new Promise<void>((r) => receiverServer.listen(RECEIVER_PORT, "127.0.0.1", r));
});

afterAll(async () => {
  await new Promise<void>((r, j) => receiverServer.close((e) => (e ? j(e) : r())));
});

beforeEach(async () => {
  await resetTestDb();
});

afterEach(() => {
  receivedRequests = [];
  nextReceiverStatus = 200;
});

// ─── signPayload ────────────────────────────────────────────────

describe("signPayload", () => {
  it("returns a 64-char hex HMAC-SHA256 digest", () => {
    const sig = signPayload('{"test":true}', "secret123");
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different signatures for different payloads", () => {
    const s1 = signPayload("payload-a", "secret");
    const s2 = signPayload("payload-b", "secret");
    expect(s1).not.toBe(s2);
  });

  it("produces different signatures for different secrets", () => {
    const s1 = signPayload("same", "secret-1");
    const s2 = signPayload("same", "secret-2");
    expect(s1).not.toBe(s2);
  });

  it("is deterministic", () => {
    const s1 = signPayload("data", "key");
    const s2 = signPayload("data", "key");
    expect(s1).toBe(s2);
  });
});

// ─── getActiveWebhooksForEvent ──────────────────────────────────

describe("getActiveWebhooksForEvent", () => {
  it("returns webhooks subscribed to the given event", async () => {
    const acct = await createAccount("Test", "active-wh@test.com");
    await createWebhook(acct.account_id, "http://example.com/hook", ["snapshot.created"]);
    const active = await getActiveWebhooksForEvent("snapshot.created");
    expect(active.length).toBe(1);
    expect(active[0].url).toBe("http://example.com/hook");
  });

  it("excludes inactive webhooks", async () => {
    const acct = await createAccount("Test", "inactive-wh@test.com");
    const wh = await createWebhook(acct.account_id, "http://example.com/hook2", ["snapshot.created"]);
    await sql.run("UPDATE webhooks SET active = 0 WHERE webhook_id = ?", [wh.webhook_id]);
    const active = await getActiveWebhooksForEvent("snapshot.created");
    expect(active.length).toBe(0);
  });

  it("excludes webhooks not subscribed to the event", async () => {
    const acct = await createAccount("Test", "wrong-evt@test.com");
    await createWebhook(acct.account_id, "http://example.com/hook3", ["snapshot.deleted"]);
    const active = await getActiveWebhooksForEvent("snapshot.created");
    expect(active.length).toBe(0);
  });

  it("returns empty array when no webhooks exist", async () => {
    const active = await getActiveWebhooksForEvent("snapshot.created");
    expect(active).toEqual([]);
  });
});

// ─── dispatchWebhookEvent — production HTTP path (lines 335-380) ─

describe("dispatchWebhookEvent — production HTTP dispatch", () => {
  it("sends HTTP POST to receiver and records successful delivery", async () => {
    const acct = await createAccount("Test", "dispatch-ok@test.com");
    const wh = await createWebhook(acct.account_id, `http://127.0.0.1:${RECEIVER_PORT}/dispatch`, ["snapshot.created"]);

    await dispatchWebhookEvent("snapshot.created", { dispatched: true });
    await new Promise((r) => setTimeout(r, 300));

    // Verify receiver got the request
    expect(receivedRequests.length).toBeGreaterThanOrEqual(1);
    const last = receivedRequests[receivedRequests.length - 1];
    expect(last.headers["x-axis-event"]).toBe("snapshot.created");
    expect(last.headers["content-type"]).toBe("application/json");
    expect(last.headers["x-axis-delivery"]).toBeTruthy();

    // Verify payload structure
    const parsed = JSON.parse(last.body);
    expect(parsed.event).toBe("snapshot.created");
    expect(parsed.data.dispatched).toBe(true);
    expect(parsed.timestamp).toBeTruthy();

    // Verify delivery recorded as success
    const deliveries = await getDeliveries(wh.webhook_id, 10);
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    const d = deliveries[0];
    expect(d.success).toBe(true);
    expect(d.status_code).toBe(200);
  });

  it("includes HMAC signature when secret is set", async () => {
    const acct = await createAccount("Test", "dispatch-sig@test.com");
    await createWebhook(acct.account_id, `http://127.0.0.1:${RECEIVER_PORT}/sig`, ["snapshot.created"], "my-secret-key");

    await dispatchWebhookEvent("snapshot.created", { signed: true });
    await new Promise((r) => setTimeout(r, 300));

    const last = receivedRequests[receivedRequests.length - 1];
    expect(last.headers["x-axis-signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);

    // Verify the signature matches our own computation
    const sig = signPayload(last.body, "my-secret-key");
    expect(last.headers["x-axis-signature"]).toBe(`sha256=${sig}`);
  });

  it("records failed delivery when receiver returns 500", async () => {
    const acct = await createAccount("Test", "dispatch-500@test.com");
    const wh = await createWebhook(acct.account_id, `http://127.0.0.1:${RECEIVER_PORT}/fail`, ["snapshot.deleted"]);
    nextReceiverStatus = 500;

    await dispatchWebhookEvent("snapshot.deleted", { fail: true });
    await new Promise((r) => setTimeout(r, 300));

    const deliveries = await getDeliveries(wh.webhook_id, 10);
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    expect(deliveries[0].success).toBe(false);
    expect(deliveries[0].status_code).toBe(500);
  });

  it("records error on connection refused", async () => {
    const acct = await createAccount("Test", "dispatch-refuse@test.com");
    const wh = await createWebhook(acct.account_id, "http://127.0.0.1:44499/dead", ["snapshot.created"]);

    await dispatchWebhookEvent("snapshot.created", { refuse: true });
    await new Promise((r) => setTimeout(r, 500));

    const deliveries = await getDeliveries(wh.webhook_id, 10);
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    expect(deliveries[0].success).toBe(false);
    expect(deliveries[0].status_code).toBeNull();
  });

  it("returns early when no webhooks match event", async () => {
    // No webhooks exist — should not throw
    await dispatchWebhookEvent("generation.completed", { empty: true });
  });

  it("catches URL parse error and records delivery", async () => {
    const acct = await createAccount("Test", "dispatch-badurl@test.com");
    const wh = await createWebhook(acct.account_id, `http://127.0.0.1:${RECEIVER_PORT}/valid`, ["snapshot.created"]);
    // Override URL to something unparseable
    await sql.run("UPDATE webhooks SET url = ? WHERE webhook_id = ?", ["://broken", wh.webhook_id]);

    await dispatchWebhookEvent("snapshot.created", { bad_url: true });
    await new Promise((r) => setTimeout(r, 300));

    const deliveries = await getDeliveries(wh.webhook_id, 10);
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    expect(deliveries[0].success).toBe(false);
  });
});

// ─── processRetryQueue — production HTTP path (lines 271-314) ───

describe("processRetryQueue — production HTTP dispatch (no sendFn)", () => {
  it("retries via real HTTP and records successful delivery", async () => {
    const acct = await createAccount("Test", "retry-http-ok@test.com");
    const wh = await createWebhook(acct.account_id, `http://127.0.0.1:${RECEIVER_PORT}/retry-ok`, ["snapshot.created"]);

    // Seed a failed delivery eligible for retry
    await recordDelivery(wh.webhook_id, "snapshot.created", '{"retry":true}', 500, "server error", false, 1);

    // Move next_retry_at to the past so it's eligible
    // FLAG(pg): datetime('now', '-1 second') is SQLite-only — Postgres needs e.g. (now() - interval '1 second')::text.
    await sql.run("UPDATE webhook_deliveries SET next_retry_at = datetime('now', '-1 second') WHERE webhook_id = ?", [wh.webhook_id]);

    const count = await processRetryQueue(); // no sendFn — production path
    expect(count).toBe(1);
    await new Promise((r) => setTimeout(r, 300));

    // Verify receiver got the retry request
    expect(receivedRequests.length).toBeGreaterThanOrEqual(1);
    const last = receivedRequests[receivedRequests.length - 1];
    expect(last.headers["x-axis-retry"]).toBe("2"); // attempt_number + 1
    expect(last.headers["x-axis-event"]).toBe("snapshot.created");

    // Verify delivery recorded
    const deliveries = await getDeliveries(wh.webhook_id, 10);
    const retry = deliveries.find(d => d.attempt_number === 2);
    expect(retry).toBeTruthy();
    expect(retry!.success).toBe(true);
    expect(retry!.status_code).toBe(200);
  });

  it("retries with HMAC signature when webhook has secret", async () => {
    const acct = await createAccount("Test", "retry-sig@test.com");
    const wh = await createWebhook(acct.account_id, `http://127.0.0.1:${RECEIVER_PORT}/retry-sig`, ["snapshot.created"], "retry-secret");

    await recordDelivery(wh.webhook_id, "snapshot.created", '{"signed_retry":true}', 500, "error", false, 1);
    // FLAG(pg): datetime('now', '-1 second') is SQLite-only — Postgres needs e.g. (now() - interval '1 second')::text.
    await sql.run("UPDATE webhook_deliveries SET next_retry_at = datetime('now', '-1 second') WHERE webhook_id = ?", [wh.webhook_id]);

    await processRetryQueue();
    await new Promise((r) => setTimeout(r, 300));

    const last = receivedRequests[receivedRequests.length - 1];
    expect(last.headers["x-axis-signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it("records failure when retry receiver returns 503", async () => {
    const acct = await createAccount("Test", "retry-503@test.com");
    const wh = await createWebhook(acct.account_id, `http://127.0.0.1:${RECEIVER_PORT}/retry-fail`, ["snapshot.created"]);

    await recordDelivery(wh.webhook_id, "snapshot.created", '{"will_fail":true}', 500, "error", false, 1);
    // FLAG(pg): datetime('now', '-1 second') is SQLite-only — Postgres needs e.g. (now() - interval '1 second')::text.
    await sql.run("UPDATE webhook_deliveries SET next_retry_at = datetime('now', '-1 second') WHERE webhook_id = ?", [wh.webhook_id]);

    nextReceiverStatus = 503;
    await processRetryQueue();
    await new Promise((r) => setTimeout(r, 300));

    const deliveries = await getDeliveries(wh.webhook_id, 10);
    const retry = deliveries.find(d => d.attempt_number === 2);
    expect(retry).toBeTruthy();
    expect(retry!.success).toBe(false);
    expect(retry!.status_code).toBe(503);
  });

  it("records error on connection refused during retry", async () => {
    const acct = await createAccount("Test", "retry-connref@test.com");
    const wh = await createWebhook(acct.account_id, "http://127.0.0.1:44499/dead", ["snapshot.created"]);

    await recordDelivery(wh.webhook_id, "snapshot.created", '{"conn_error":true}', null, "refused", false, 1);
    // FLAG(pg): datetime('now', '-1 second') is SQLite-only — Postgres needs e.g. (now() - interval '1 second')::text.
    await sql.run("UPDATE webhook_deliveries SET next_retry_at = datetime('now', '-1 second') WHERE webhook_id = ?", [wh.webhook_id]);

    await processRetryQueue();
    await new Promise((r) => setTimeout(r, 500));

    const deliveries = await getDeliveries(wh.webhook_id, 10);
    const retry = deliveries.find(d => d.attempt_number === 2);
    expect(retry).toBeTruthy();
    expect(retry!.success).toBe(false);
    expect(retry!.status_code).toBeNull();
  });

  it("catches URL parse failure during retry", async () => {
    const acct = await createAccount("Test", "retry-badurl@test.com");
    const wh = await createWebhook(acct.account_id, `http://127.0.0.1:${RECEIVER_PORT}/tmp`, ["snapshot.created"]);

    await recordDelivery(wh.webhook_id, "snapshot.created", '{"url_err":true}', 500, "error", false, 1);
    // FLAG(pg): datetime('now', '-1 second') is SQLite-only — Postgres needs e.g. (now() - interval '1 second')::text.
    await sql.run("UPDATE webhook_deliveries SET next_retry_at = datetime('now', '-1 second') WHERE webhook_id = ?", [wh.webhook_id]);
    // Break the URL after seeding
    await sql.run("UPDATE webhooks SET url = ? WHERE webhook_id = ?", ["://broken", wh.webhook_id]);

    const count = await processRetryQueue();
    expect(count).toBe(1);
    await new Promise((r) => setTimeout(r, 300));

    // Should have recorded an error delivery
    const deliveries = await getDeliveries(wh.webhook_id, 10);
    const retry = deliveries.find(d => d.attempt_number === 2);
    expect(retry).toBeTruthy();
    expect(retry!.success).toBe(false);
  });

  it("returns 0 when no retries are pending", async () => {
    const count = await processRetryQueue();
    expect(count).toBe(0);
  });
});
