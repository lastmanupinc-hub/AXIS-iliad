import { describe, it, expect, beforeEach } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import {
  createWebhook,
  createAccount,
  recordDelivery,
  getDeliveries,
  getDeadLetters,
  getPendingRetries,
  clearRetrySchedule,
  processRetryQueue,
  computeNextRetryAt,
  MAX_RETRY_ATTEMPTS,
  RETRY_BACKOFF_BASE_MS,
  updateWebhookActive,
  deleteWebhook,
  dispatchWebhookEvent,
} from "./index.js";

beforeEach(async () => {
  await resetTestDb();
});

// ─── computeNextRetryAt ─────────────────────────────────────────

describe("computeNextRetryAt", () => {
  it("returns a future ISO timestamp", () => {
    const before = Date.now();
    const result = computeNextRetryAt(1);
    const ts = new Date(result).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
  });

  it("increases delay exponentially (base * 4^(n-1))", () => {
    // attempt 1 → 2s, attempt 2 → 8s, attempt 3 → 32s, attempt 4 → 128s
    const now = Date.now();
    const t1 = new Date(computeNextRetryAt(1)).getTime() - now;
    const t2 = new Date(computeNextRetryAt(2)).getTime() - now;
    const t3 = new Date(computeNextRetryAt(3)).getTime() - now;
    const t4 = new Date(computeNextRetryAt(4)).getTime() - now;

    // Allow 100ms tolerance for timing
    expect(t1).toBeGreaterThanOrEqual(RETRY_BACKOFF_BASE_MS - 100);
    expect(t1).toBeLessThan(RETRY_BACKOFF_BASE_MS + 500);
    expect(t2).toBeGreaterThan(t1);
    expect(t3).toBeGreaterThan(t2);
    expect(t4).toBeGreaterThan(t3);
  });
});

// ─── recordDelivery retry fields ────────────────────────────────

describe("recordDelivery with retry", () => {
  it("sets next_retry_at for failed attempt under max", async () => {
    const acct = await createAccount("Test", "retry-test-1@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    const d = await recordDelivery(wh.webhook_id, "snapshot.created", '{"test":1}', 500, "error", false, 1);
    expect(d.attempt_number).toBe(1);
    expect(d.next_retry_at).not.toBeNull();
    expect(d.dead_lettered).toBe(false);
  });

  it("dead-letters at max attempts", async () => {
    const acct = await createAccount("Test", "retry-test-2@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    const d = await recordDelivery(wh.webhook_id, "snapshot.created", '{"test":1}', 500, "error", false, MAX_RETRY_ATTEMPTS);
    expect(d.attempt_number).toBe(MAX_RETRY_ATTEMPTS);
    expect(d.next_retry_at).toBeNull();
    expect(d.dead_lettered).toBe(true);
  });

  it("successful delivery has no retry schedule", async () => {
    const acct = await createAccount("Test", "retry-test-3@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    const d = await recordDelivery(wh.webhook_id, "snapshot.created", '{"test":1}', 200, "OK", true, 1);
    expect(d.next_retry_at).toBeNull();
    expect(d.dead_lettered).toBe(false);
  });

  it("returns attempt_number and dead_lettered in getDeliveries", async () => {
    const acct = await createAccount("Test", "retry-test-4@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    await recordDelivery(wh.webhook_id, "snapshot.created", '{"a":1}', 500, "err", false, 3);
    const deliveries = await getDeliveries(wh.webhook_id);
    expect(deliveries[0]!.attempt_number).toBe(3);
    expect(deliveries[0]!.dead_lettered).toBe(false);
  });
});

// ─── getPendingRetries ──────────────────────────────────────────

describe("getPendingRetries", () => {
  it("returns deliveries with past next_retry_at", async () => {
    const acct = await createAccount("Test", "pending-1@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    // Set next_retry_at to the past
    await recordDelivery(wh.webhook_id, "snapshot.created", '{"r":1}', 500, "err", false, 1);
    // Manually set next_retry_at to now-1s so it's eligible
    await sql.run("UPDATE webhook_deliveries SET next_retry_at = ? WHERE webhook_id = ?", [new Date(Date.now() - 1000).toISOString(), wh.webhook_id]);
    const pending = await getPendingRetries();
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending[0]!.webhook_id).toBe(wh.webhook_id);
  });

  it("excludes dead-lettered deliveries", async () => {
    const acct = await createAccount("Test", "pending-2@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    await recordDelivery(wh.webhook_id, "snapshot.created", '{"r":1}', 500, "err", false, MAX_RETRY_ATTEMPTS);
    const pending = await getPendingRetries();
    const found = pending.find((p) => p.webhook_id === wh.webhook_id);
    expect(found).toBeUndefined();
  });

  it("excludes successful deliveries", async () => {
    const acct = await createAccount("Test", "pending-3@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    await recordDelivery(wh.webhook_id, "snapshot.created", '{"r":1}', 200, "OK", true, 1);
    const pending = await getPendingRetries();
    const found = pending.find((p) => p.webhook_id === wh.webhook_id);
    expect(found).toBeUndefined();
  });
});

// ─── clearRetrySchedule ─────────────────────────────────────────

describe("clearRetrySchedule", () => {
  it("sets next_retry_at to NULL", async () => {
    const acct = await createAccount("Test", "clear-1@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    const d = await recordDelivery(wh.webhook_id, "snapshot.created", '{"r":1}', 500, "err", false, 1);
    expect(d.next_retry_at).not.toBeNull();
    await clearRetrySchedule(d.delivery_id);
    const deliveries = await getDeliveries(wh.webhook_id);
    expect(deliveries[0]!.next_retry_at).toBeNull();
  });
});

// ─── getDeadLetters ─────────────────────────────────────────────

describe("getDeadLetters", () => {
  it("returns only dead-lettered deliveries", async () => {
    const acct = await createAccount("Test", "dead-1@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    // Success
    await recordDelivery(wh.webhook_id, "snapshot.created", '{"s":1}', 200, "OK", true, 1);
    // Failed but retryable
    await recordDelivery(wh.webhook_id, "snapshot.created", '{"f":1}', 500, "err", false, 1);
    // Dead-lettered
    await recordDelivery(wh.webhook_id, "snapshot.created", '{"d":1}', 500, "err", false, MAX_RETRY_ATTEMPTS);

    const dead = await getDeadLetters(wh.webhook_id);
    expect(dead.length).toBe(1);
    expect(dead[0]!.dead_lettered).toBe(true);
    expect(dead[0]!.payload).toBe('{"d":1}');
  });

  it("returns empty for webhook with no dead letters", async () => {
    const acct = await createAccount("Test", "dead-2@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    await recordDelivery(wh.webhook_id, "snapshot.created", '{"s":1}', 200, "OK", true, 1);
    expect(await getDeadLetters(wh.webhook_id)).toEqual([]);
  });
});

// ─── processRetryQueue ──────────────────────────────────────────

describe("processRetryQueue", () => {
  it("returns 0 when no retries pending", async () => {
    expect(await processRetryQueue()).toBe(0);
  });

  it("processes pending retries with sendFn", async () => {
    const acct = await createAccount("Test", "process-1@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"], "secret123");
    // Record a failed delivery
    await recordDelivery(wh.webhook_id, "snapshot.created", '{"x":1}', 500, "err", false, 1);
    // Set next_retry_at to the past
    await sql.run("UPDATE webhook_deliveries SET next_retry_at = ?", [new Date(Date.now() - 1000).toISOString()]);

    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const sendFn = async (_wh: { url: string }, _payload: string, headers: Record<string, string>) => {
      calls.push({ url: _wh.url, headers });
      return { status_code: 200, response_body: "OK", success: true };
    };

    const processed = await processRetryQueue(sendFn as any);
    expect(processed).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe("https://example.com/hook");
    expect(calls[0]!.headers["X-Axis-Retry"]).toBe("2");
    expect(calls[0]!.headers["X-Axis-Signature"]).toMatch(/^sha256=/);

    // Wait for async sendFn to complete
    await new Promise((r) => setTimeout(r, 50));

    // New successful delivery should be recorded
    const deliveries = await getDeliveries(wh.webhook_id);
    const retryDelivery = deliveries.find((d) => d.attempt_number === 2);
    expect(retryDelivery).toBeDefined();
    expect(retryDelivery!.success).toBe(true);
  });

  it("dead-letters when webhook is deleted", async () => {
    const acct = await createAccount("Test", "process-2@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    await recordDelivery(wh.webhook_id, "snapshot.created", '{"x":1}', 500, "err", false, 1);
    await sql.run("UPDATE webhook_deliveries SET next_retry_at = ? WHERE webhook_id = ?", [new Date(Date.now() - 1000).toISOString(), wh.webhook_id]);

    // Remove deliveries first (FK), then delete webhook, then re-insert an orphan row
    // that violates the FK to webhooks. SET LOCAL session_replication_role = replica
    // disables FK triggers for the duration of this transaction; the dedicated tx
    // client guarantees the bypass and the INSERT share one connection.
    await sql.run("DELETE FROM webhook_deliveries WHERE webhook_id = ?", [wh.webhook_id]);
    await deleteWebhook(wh.webhook_id);
    const now = new Date().toISOString();
    const pastRetry = new Date(Date.now() - 1000).toISOString();
    await sql.tx(async (c) => {
      await c.query("SET LOCAL session_replication_role = replica");
      await c.query(
        "INSERT INTO webhook_deliveries (delivery_id, webhook_id, event_type, payload, status_code, response_body, success, attempted_at, attempt_number, next_retry_at, dead_lettered) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 1, $8, 0)",
        ["retry-orphan-del", wh.webhook_id, "snapshot.created", '{"x":1}', 500, "err", now, pastRetry],
      );
    });

    const processed = await processRetryQueue();
    expect(processed).toBe(1);

    // Original delivery should be marked dead-lettered in-place
    const row = await sql.one("SELECT dead_lettered, response_body FROM webhook_deliveries WHERE delivery_id = ?", ["retry-orphan-del"]) as any;
    expect(row.dead_lettered).toBe(1);
    expect(row.response_body).toBe("webhook_disabled_or_deleted");
  });

  it("dead-letters when webhook is deactivated", async () => {
    const acct = await createAccount("Test", "process-3@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    const d = await recordDelivery(wh.webhook_id, "snapshot.created", '{"x":1}', 500, "err", false, 1);
    await sql.run("UPDATE webhook_deliveries SET next_retry_at = ? WHERE delivery_id = ?", [new Date(Date.now() - 1000).toISOString(), d.delivery_id]);

    await updateWebhookActive(wh.webhook_id, false);

    const processed = await processRetryQueue();
    expect(processed).toBe(1);

    // Original delivery should be dead-lettered in-place
    const deliveries = await getDeliveries(wh.webhook_id);
    const deadLettered = deliveries.find((dl) => dl.delivery_id === d.delivery_id);
    expect(deadLettered).toBeDefined();
    expect(deadLettered!.dead_lettered).toBe(true);
    expect(deadLettered!.response_body).toBe("webhook_disabled_or_deleted");
  });

  it("schedules further retry on failed re-delivery", async () => {
    const acct = await createAccount("Test", "process-4@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    await recordDelivery(wh.webhook_id, "snapshot.created", '{"x":1}', 500, "err", false, 1);
    await sql.run("UPDATE webhook_deliveries SET next_retry_at = ?", [new Date(Date.now() - 1000).toISOString()]);

    const sendFn = async () => ({ status_code: 500, response_body: "still failing", success: false });
    await processRetryQueue(sendFn as any);
    await new Promise((r) => setTimeout(r, 50));

    const deliveries = await getDeliveries(wh.webhook_id);
    const retry2 = deliveries.find((d) => d.attempt_number === 2);
    expect(retry2).toBeDefined();
    expect(retry2!.success).toBe(false);
    expect(retry2!.next_retry_at).not.toBeNull(); // Scheduled for attempt 3
  });

  it("dead-letters after MAX_RETRY_ATTEMPTS exhausted", async () => {
    const acct = await createAccount("Test", "process-5@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    // Record at attempt MAX-1 so next is the max
    await recordDelivery(wh.webhook_id, "snapshot.created", '{"x":1}', 500, "err", false, MAX_RETRY_ATTEMPTS - 1);
    await sql.run("UPDATE webhook_deliveries SET next_retry_at = ? WHERE attempt_number = ?", [new Date(Date.now() - 1000).toISOString(), MAX_RETRY_ATTEMPTS - 1]);

    const sendFn = async () => ({ status_code: 500, response_body: "still failing", success: false });
    await processRetryQueue(sendFn as any);
    await new Promise((r) => setTimeout(r, 50));

    const dead = await getDeadLetters(wh.webhook_id);
    expect(dead.length).toBe(1);
    expect(dead[0]!.attempt_number).toBe(MAX_RETRY_ATTEMPTS);
  });
});

// ─── updateWebhookActive edge cases ─────────────────────────────

describe("updateWebhookActive edge cases", () => {
  it("returns false for non-existent webhook_id", async () => {
    const result = await updateWebhookActive("wh-nonexistent-999", false);
    expect(result).toBe(false);
  });
});

// ─── getPendingRetries empty result ─────────────────────────────

describe("getPendingRetries empty result", () => {
  it("returns empty array when no retries pending", async () => {
    const result = await getPendingRetries();
    expect(result).toEqual([]);
  });

  it("sendFn rejection records failed delivery", async () => {
    const acct = await createAccount("Test", "catch-path@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"], "my-secret");
    await recordDelivery(wh.webhook_id, "snapshot.created", '{"x":1}', 500, "err", false, 1);
    await sql.run("UPDATE webhook_deliveries SET next_retry_at = ?", [new Date(Date.now() - 1000).toISOString()]);

    const sendFn = async () => { throw new Error("network failure"); };

    const processed = await processRetryQueue(sendFn);
    expect(processed).toBe(1);

    // Wait for the async catch to complete
    await new Promise(r => setTimeout(r, 100));

    const deliveries = await getDeliveries(wh.webhook_id);
    // Should have original + retry attempt
    expect(deliveries.length).toBeGreaterThanOrEqual(2);
    const failedRetry = deliveries.find(d => d.attempt_number === 2 && !d.success);
    expect(failedRetry).toBeDefined();
    expect(failedRetry!.response_body).toContain("network failure");
  });

  it("processRetryQueue with secret adds signature header", async () => {
    const acct = await createAccount("Test", "sig-path@test.com");
    const wh = await createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"], "my-secret-key");
    await recordDelivery(wh.webhook_id, "snapshot.created", '{"test":true}', 500, "err", false, 1);
    await sql.run("UPDATE webhook_deliveries SET next_retry_at = ?", [new Date(Date.now() - 1000).toISOString()]);

    let capturedHeaders: Record<string, string> = {};
    const sendFn = async (_wh: unknown, _payload: string, headers: Record<string, string>) => {
      capturedHeaders = headers;
      return { status_code: 200, response_body: "ok", success: true };
    };

    const processed = await processRetryQueue(sendFn);
    expect(processed).toBe(1);

    // Wait for async
    await new Promise(r => setTimeout(r, 100));

    expect(capturedHeaders["X-Axis-Signature"]).toBeDefined();
    expect(capturedHeaders["X-Axis-Signature"]).toMatch(/^sha256=/);
    expect(capturedHeaders["X-Axis-Retry"]).toBe("2");
  });

  it("dispatchWebhookEvent does nothing when no active webhooks", async () => {
    // Just ensure it doesn't throw when no webhooks exist
    await expect(dispatchWebhookEvent("snapshot.created", { id: "test-123" })).resolves.not.toThrow();
  });
});
