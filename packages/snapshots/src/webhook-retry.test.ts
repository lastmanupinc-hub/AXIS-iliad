import { describe, it, expect, beforeEach } from "vitest";
import {
  openMemoryDb,
  closeDb,
  getDb,
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
} from "./index.js";

beforeEach(() => {
  openMemoryDb();
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
  it("sets next_retry_at for failed attempt under max", () => {
    const acct = createAccount("Test", "retry-test-1@test.com");
    const wh = createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    const d = recordDelivery(wh.webhook_id, "snapshot.created", '{"test":1}', 500, "error", false, 1);
    expect(d.attempt_number).toBe(1);
    expect(d.next_retry_at).not.toBeNull();
    expect(d.dead_lettered).toBe(false);
  });

  it("dead-letters at max attempts", () => {
    const acct = createAccount("Test", "retry-test-2@test.com");
    const wh = createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    const d = recordDelivery(wh.webhook_id, "snapshot.created", '{"test":1}', 500, "error", false, MAX_RETRY_ATTEMPTS);
    expect(d.attempt_number).toBe(MAX_RETRY_ATTEMPTS);
    expect(d.next_retry_at).toBeNull();
    expect(d.dead_lettered).toBe(true);
  });

  it("successful delivery has no retry schedule", () => {
    const acct = createAccount("Test", "retry-test-3@test.com");
    const wh = createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    const d = recordDelivery(wh.webhook_id, "snapshot.created", '{"test":1}', 200, "OK", true, 1);
    expect(d.next_retry_at).toBeNull();
    expect(d.dead_lettered).toBe(false);
  });

  it("returns attempt_number and dead_lettered in getDeliveries", () => {
    const acct = createAccount("Test", "retry-test-4@test.com");
    const wh = createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    recordDelivery(wh.webhook_id, "snapshot.created", '{"a":1}', 500, "err", false, 3);
    const deliveries = getDeliveries(wh.webhook_id);
    expect(deliveries[0]!.attempt_number).toBe(3);
    expect(deliveries[0]!.dead_lettered).toBe(false);
  });
});

// ─── getPendingRetries ──────────────────────────────────────────

describe("getPendingRetries", () => {
  it("returns deliveries with past next_retry_at", () => {
    const acct = createAccount("Test", "pending-1@test.com");
    const wh = createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    // Set next_retry_at to the past
    recordDelivery(wh.webhook_id, "snapshot.created", '{"r":1}', 500, "err", false, 1);
    // Manually set next_retry_at to now-1s so it's eligible
    const db = getDb();
    db.prepare("UPDATE webhook_deliveries SET next_retry_at = datetime('now', '-1 second') WHERE webhook_id = ?").run(wh.webhook_id);
    const pending = getPendingRetries();
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending[0]!.webhook_id).toBe(wh.webhook_id);
  });

  it("excludes dead-lettered deliveries", () => {
    const acct = createAccount("Test", "pending-2@test.com");
    const wh = createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    recordDelivery(wh.webhook_id, "snapshot.created", '{"r":1}', 500, "err", false, MAX_RETRY_ATTEMPTS);
    const pending = getPendingRetries();
    const found = pending.find((p) => p.webhook_id === wh.webhook_id);
    expect(found).toBeUndefined();
  });

  it("excludes successful deliveries", () => {
    const acct = createAccount("Test", "pending-3@test.com");
    const wh = createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    recordDelivery(wh.webhook_id, "snapshot.created", '{"r":1}', 200, "OK", true, 1);
    const pending = getPendingRetries();
    const found = pending.find((p) => p.webhook_id === wh.webhook_id);
    expect(found).toBeUndefined();
  });
});

// ─── clearRetrySchedule ─────────────────────────────────────────

describe("clearRetrySchedule", () => {
  it("sets next_retry_at to NULL", () => {
    const acct = createAccount("Test", "clear-1@test.com");
    const wh = createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    const d = recordDelivery(wh.webhook_id, "snapshot.created", '{"r":1}', 500, "err", false, 1);
    expect(d.next_retry_at).not.toBeNull();
    clearRetrySchedule(d.delivery_id);
    const deliveries = getDeliveries(wh.webhook_id);
    expect(deliveries[0]!.next_retry_at).toBeNull();
  });
});

// ─── getDeadLetters ─────────────────────────────────────────────

describe("getDeadLetters", () => {
  it("returns only dead-lettered deliveries", () => {
    const acct = createAccount("Test", "dead-1@test.com");
    const wh = createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    // Success
    recordDelivery(wh.webhook_id, "snapshot.created", '{"s":1}', 200, "OK", true, 1);
    // Failed but retryable
    recordDelivery(wh.webhook_id, "snapshot.created", '{"f":1}', 500, "err", false, 1);
    // Dead-lettered
    recordDelivery(wh.webhook_id, "snapshot.created", '{"d":1}', 500, "err", false, MAX_RETRY_ATTEMPTS);

    const dead = getDeadLetters(wh.webhook_id);
    expect(dead.length).toBe(1);
    expect(dead[0]!.dead_lettered).toBe(true);
    expect(dead[0]!.payload).toBe('{"d":1}');
  });

  it("returns empty for webhook with no dead letters", () => {
    const acct = createAccount("Test", "dead-2@test.com");
    const wh = createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    recordDelivery(wh.webhook_id, "snapshot.created", '{"s":1}', 200, "OK", true, 1);
    expect(getDeadLetters(wh.webhook_id)).toEqual([]);
  });
});

// ─── processRetryQueue ──────────────────────────────────────────

describe("processRetryQueue", () => {
  it("returns 0 when no retries pending", () => {
    expect(processRetryQueue()).toBe(0);
  });

  it("processes pending retries with sendFn", async () => {
    const acct = createAccount("Test", "process-1@test.com");
    const wh = createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"], "secret123");
    // Record a failed delivery
    recordDelivery(wh.webhook_id, "snapshot.created", '{"x":1}', 500, "err", false, 1);
    // Set next_retry_at to the past
    const db = getDb();
    db.prepare("UPDATE webhook_deliveries SET next_retry_at = datetime('now', '-1 second')").run();

    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const sendFn = async (_wh: { url: string }, _payload: string, headers: Record<string, string>) => {
      calls.push({ url: _wh.url, headers });
      return { status_code: 200, response_body: "OK", success: true };
    };

    const processed = processRetryQueue(sendFn as any);
    expect(processed).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe("https://example.com/hook");
    expect(calls[0]!.headers["X-Axis-Retry"]).toBe("2");
    expect(calls[0]!.headers["X-Axis-Signature"]).toMatch(/^sha256=/);

    // Wait for async sendFn to complete
    await new Promise((r) => setTimeout(r, 50));

    // New successful delivery should be recorded
    const deliveries = getDeliveries(wh.webhook_id);
    const retryDelivery = deliveries.find((d) => d.attempt_number === 2);
    expect(retryDelivery).toBeDefined();
    expect(retryDelivery!.success).toBe(true);
  });

  it("dead-letters when webhook is deleted", async () => {
    const acct = createAccount("Test", "process-2@test.com");
    const wh = createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    recordDelivery(wh.webhook_id, "snapshot.created", '{"x":1}', 500, "err", false, 1);
    const db = getDb();
    db.prepare("UPDATE webhook_deliveries SET next_retry_at = datetime('now', '-1 second') WHERE webhook_id = ?").run(wh.webhook_id);

    // Remove deliveries first (FK), then delete webhook, then re-insert orphan with FK off
    db.prepare("DELETE FROM webhook_deliveries WHERE webhook_id = ?").run(wh.webhook_id);
    deleteWebhook(wh.webhook_id);
    db.pragma("foreign_keys = OFF");
    db.prepare(
      "INSERT INTO webhook_deliveries (delivery_id, webhook_id, event_type, payload, status_code, response_body, success, attempted_at, attempt_number, next_retry_at, dead_lettered) VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'), 1, datetime('now', '-1 second'), 0)",
    ).run("retry-orphan-del", wh.webhook_id, "snapshot.created", '{"x":1}', 500, "err");
    db.pragma("foreign_keys = ON");

    const processed = processRetryQueue();
    expect(processed).toBe(1);

    // Original delivery should be marked dead-lettered in-place
    db.pragma("foreign_keys = OFF");
    const row = db.prepare("SELECT dead_lettered, response_body FROM webhook_deliveries WHERE delivery_id = ?").get("retry-orphan-del") as any;
    db.pragma("foreign_keys = ON");
    expect(row.dead_lettered).toBe(1);
    expect(row.response_body).toBe("webhook_disabled_or_deleted");
  });

  it("dead-letters when webhook is deactivated", async () => {
    const acct = createAccount("Test", "process-3@test.com");
    const wh = createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    const d = recordDelivery(wh.webhook_id, "snapshot.created", '{"x":1}', 500, "err", false, 1);
    const db = getDb();
    db.prepare("UPDATE webhook_deliveries SET next_retry_at = datetime('now', '-1 second') WHERE delivery_id = ?").run(d.delivery_id);

    updateWebhookActive(wh.webhook_id, false);

    const processed = processRetryQueue();
    expect(processed).toBe(1);

    // Original delivery should be dead-lettered in-place
    const deliveries = getDeliveries(wh.webhook_id);
    const deadLettered = deliveries.find((dl) => dl.delivery_id === d.delivery_id);
    expect(deadLettered).toBeDefined();
    expect(deadLettered!.dead_lettered).toBe(true);
    expect(deadLettered!.response_body).toBe("webhook_disabled_or_deleted");
  });

  it("schedules further retry on failed re-delivery", async () => {
    const acct = createAccount("Test", "process-4@test.com");
    const wh = createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    recordDelivery(wh.webhook_id, "snapshot.created", '{"x":1}', 500, "err", false, 1);
    const db = getDb();
    db.prepare("UPDATE webhook_deliveries SET next_retry_at = datetime('now', '-1 second')").run();

    const sendFn = async () => ({ status_code: 500, response_body: "still failing", success: false });
    processRetryQueue(sendFn as any);
    await new Promise((r) => setTimeout(r, 50));

    const deliveries = getDeliveries(wh.webhook_id);
    const retry2 = deliveries.find((d) => d.attempt_number === 2);
    expect(retry2).toBeDefined();
    expect(retry2!.success).toBe(false);
    expect(retry2!.next_retry_at).not.toBeNull(); // Scheduled for attempt 3
  });

  it("dead-letters after MAX_RETRY_ATTEMPTS exhausted", async () => {
    const acct = createAccount("Test", "process-5@test.com");
    const wh = createWebhook(acct.account_id, "https://example.com/hook", ["snapshot.created"]);
    // Record at attempt MAX-1 so next is the max
    recordDelivery(wh.webhook_id, "snapshot.created", '{"x":1}', 500, "err", false, MAX_RETRY_ATTEMPTS - 1);
    const db = getDb();
    db.prepare("UPDATE webhook_deliveries SET next_retry_at = datetime('now', '-1 second') WHERE attempt_number = ?").run(MAX_RETRY_ATTEMPTS - 1);

    const sendFn = async () => ({ status_code: 500, response_body: "still failing", success: false });
    processRetryQueue(sendFn as any);
    await new Promise((r) => setTimeout(r, 50));

    const dead = getDeadLetters(wh.webhook_id);
    expect(dead.length).toBe(1);
    expect(dead[0]!.attempt_number).toBe(MAX_RETRY_ATTEMPTS);
  });
});
