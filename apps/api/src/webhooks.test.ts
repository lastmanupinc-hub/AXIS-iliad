import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb, createWebhook, listWebhooks, getWebhook, deleteWebhook, updateWebhookActive, getActiveWebhooksForEvent, recordDelivery, getDeliveries, signPayload, dispatchWebhookEvent } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import { handleCreateAccount } from "./billing.js";
import { handleCreateWebhook, handleListWebhooks, handleDeleteWebhook, handleToggleWebhook, handleWebhookDeliveries } from "./webhooks.js";
import { handleHealthCheck } from "./handlers.js";
import { resetRateLimits } from "./rate-limiter.js";

const TEST_PORT = 44430;
let server: Server;

interface Res { status: number; headers: Record<string, string>; data: Record<string, unknown> }

async function req(
  method: string,
  path: string,
  body?: unknown,
  authKey?: string,
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authKey) headers["Authorization"] = `Bearer ${authKey}`;
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: TEST_PORT, path, method, headers },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === "string") h[k] = v;
          }
          resolve({ status: res.statusCode ?? 0, headers: h, data: data as Record<string, unknown> });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

let apiKey: string;
let accountId: string;

beforeAll(async () => {
  openMemoryDb();
  resetRateLimits();
  const router = new Router();
  router.get("/v1/health", handleHealthCheck);
  router.post("/v1/accounts", handleCreateAccount);
  router.post("/v1/account/webhooks", handleCreateWebhook);
  router.get("/v1/account/webhooks", handleListWebhooks);
  router.delete("/v1/account/webhooks/:webhook_id", handleDeleteWebhook);
  router.post("/v1/account/webhooks/:webhook_id/toggle", handleToggleWebhook);
  router.get("/v1/account/webhooks/:webhook_id/deliveries", handleWebhookDeliveries);
  server = createApp(router, TEST_PORT);
  await new Promise<void>((r) => setTimeout(r, 100));

  const acct = await req("POST", "/v1/accounts", { name: "Webhook Tester", email: "webhook@test.com" });
  apiKey = (acct.data as any).api_key.raw_key;
  accountId = (acct.data as any).account.account_id;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  closeDb();
});

beforeEach(() => {
  resetRateLimits();
});

// ─── Store unit tests ───────────────────────────────────────────

describe("webhook store", () => {
  it("creates and retrieves a webhook", () => {
    const wh = createWebhook(accountId, "https://example.com/hook", ["snapshot.created"]);
    expect(wh.webhook_id).toBeDefined();
    expect(wh.url).toBe("https://example.com/hook");
    expect(wh.events).toEqual(["snapshot.created"]);
    expect(wh.active).toBe(true);

    const found = getWebhook(wh.webhook_id);
    expect(found).toBeDefined();
    expect(found!.url).toBe("https://example.com/hook");
  });

  it("lists webhooks for account", () => {
    const list = listWebhooks(accountId);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it("toggles active state", () => {
    const wh = createWebhook(accountId, "https://example.com/toggle", ["snapshot.deleted"]);
    expect(wh.active).toBe(true);
    updateWebhookActive(wh.webhook_id, false);
    expect(getWebhook(wh.webhook_id)!.active).toBe(false);
    updateWebhookActive(wh.webhook_id, true);
    expect(getWebhook(wh.webhook_id)!.active).toBe(true);
  });

  it("deletes a webhook", () => {
    const wh = createWebhook(accountId, "https://example.com/delete", ["project.deleted"]);
    expect(deleteWebhook(wh.webhook_id)).toBe(true);
    expect(getWebhook(wh.webhook_id)).toBeUndefined();
    expect(deleteWebhook(wh.webhook_id)).toBe(false);
  });

  it("finds active webhooks for event type", () => {
    const wh = createWebhook(accountId, "https://example.com/event-match", ["generation.completed", "snapshot.created"]);
    const matches = getActiveWebhooksForEvent("generation.completed");
    expect(matches.some((m) => m.webhook_id === wh.webhook_id)).toBe(true);
  });

  it("records and retrieves deliveries", () => {
    const wh = createWebhook(accountId, "https://example.com/delivery", ["snapshot.created"]);
    const d = recordDelivery(wh.webhook_id, "snapshot.created", '{"test":true}', 200, "OK", true);
    expect(d.delivery_id).toBeDefined();
    expect(d.success).toBe(true);

    const deliveries = getDeliveries(wh.webhook_id);
    expect(deliveries.length).toBe(1);
    expect(deliveries[0].status_code).toBe(200);
    expect(deliveries[0].success).toBe(true);
  });

  it("signs payloads with HMAC-SHA256", () => {
    const sig = signPayload('{"test":true}', "mysecret");
    expect(typeof sig).toBe("string");
    expect(sig.length).toBe(64); // hex-encoded SHA256
    // Same input = same output
    expect(signPayload('{"test":true}', "mysecret")).toBe(sig);
    // Different secret = different output
    expect(signPayload('{"test":true}', "other")).not.toBe(sig);
  });
});

// ─── HTTP endpoint tests ────────────────────────────────────────

describe("POST /v1/account/webhooks", () => {
  it("requires authentication", async () => {
    const r = await req("POST", "/v1/account/webhooks", { url: "https://a.com", events: ["snapshot.created"] });
    expect(r.status).toBe(401);
  });

  it("creates a webhook", async () => {
    const r = await req("POST", "/v1/account/webhooks", {
      url: "https://example.com/api-hook",
      events: ["snapshot.created", "generation.completed"],
      secret: "my-secret",
    }, apiKey);
    expect(r.status).toBe(201);
    const wh = (r.data as any).webhook;
    expect(wh.webhook_id).toBeDefined();
    expect(wh.url).toBe("https://example.com/api-hook");
    expect(wh.events).toEqual(["snapshot.created", "generation.completed"]);
    expect(wh.active).toBe(true);
  });

  it("rejects invalid URL", async () => {
    const r = await req("POST", "/v1/account/webhooks", {
      url: "not-a-url",
      events: ["snapshot.created"],
    }, apiKey);
    expect(r.status).toBe(400);
  });

  it("rejects invalid event type", async () => {
    const r = await req("POST", "/v1/account/webhooks", {
      url: "https://example.com/hook",
      events: ["invalid.event"],
    }, apiKey);
    expect(r.status).toBe(400);
  });

  it("rejects empty events array", async () => {
    const r = await req("POST", "/v1/account/webhooks", {
      url: "https://example.com/hook",
      events: [],
    }, apiKey);
    expect(r.status).toBe(400);
  });
});

describe("GET /v1/account/webhooks", () => {
  it("lists webhooks with redacted secrets", async () => {
    const r = await req("GET", "/v1/account/webhooks", undefined, apiKey);
    expect(r.status).toBe(200);
    const webhooks = (r.data as any).webhooks;
    expect(Array.isArray(webhooks)).toBe(true);
    // Secrets should be redacted
    const withSecret = webhooks.find((w: any) => w.secret === "***");
    expect(withSecret).toBeDefined(); // at least one webhook has a secret
  });
});

describe("DELETE /v1/account/webhooks/:webhook_id", () => {
  it("deletes own webhook", async () => {
    // Create one to delete
    const create = await req("POST", "/v1/account/webhooks", {
      url: "https://example.com/to-delete",
      events: ["snapshot.deleted"],
    }, apiKey);
    const webhookId = (create.data as any).webhook.webhook_id;

    const r = await req("DELETE", `/v1/account/webhooks/${webhookId}`, undefined, apiKey);
    expect(r.status).toBe(200);
    expect((r.data as any).deleted).toBe(true);
  });

  it("returns 404 for nonexistent webhook", async () => {
    const r = await req("DELETE", "/v1/account/webhooks/nonexistent-id", undefined, apiKey);
    expect(r.status).toBe(404);
  });
});

describe("POST /v1/account/webhooks/:webhook_id/toggle", () => {
  it("toggles webhook active state", async () => {
    const create = await req("POST", "/v1/account/webhooks", {
      url: "https://example.com/toggleable",
      events: ["snapshot.created"],
    }, apiKey);
    const webhookId = (create.data as any).webhook.webhook_id;

    const r1 = await req("POST", `/v1/account/webhooks/${webhookId}/toggle`, { active: false }, apiKey);
    expect(r1.status).toBe(200);
    expect((r1.data as any).active).toBe(false);

    const r2 = await req("POST", `/v1/account/webhooks/${webhookId}/toggle`, { active: true }, apiKey);
    expect(r2.status).toBe(200);
    expect((r2.data as any).active).toBe(true);
  });
});

describe("GET /v1/account/webhooks/:webhook_id/deliveries", () => {
  it("returns delivery history", async () => {
    const create = await req("POST", "/v1/account/webhooks", {
      url: "https://example.com/deliveries",
      events: ["snapshot.created"],
    }, apiKey);
    const webhookId = (create.data as any).webhook.webhook_id;

    // Record a delivery directly
    recordDelivery(webhookId, "snapshot.created", '{"test":1}', 200, "OK", true);

    const r = await req("GET", `/v1/account/webhooks/${webhookId}/deliveries`, undefined, apiKey);
    expect(r.status).toBe(200);
    const deliveries = (r.data as any).deliveries;
    expect(Array.isArray(deliveries)).toBe(true);
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    expect(deliveries[0].success).toBe(true);
  });
});

// ─── Layer 12: toggle branch coverage ───────────────────────────

describe("POST /v1/account/webhooks/:webhook_id/toggle — branch coverage", () => {
  let webhookId: string;

  beforeAll(async () => {
    const create = await req("POST", "/v1/account/webhooks", {
      url: "https://example.com/toggle-branch",
      events: ["snapshot.created"],
    }, apiKey);
    webhookId = (create.data as any).webhook.webhook_id;
  });

  it("returns 400 for invalid JSON body", async () => {
    // Send raw non-JSON to toggle endpoint
    const r = await new Promise<Res>((resolve, reject) => {
      const raw = "<<<not json>>>";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(raw)),
        "Authorization": `Bearer ${apiKey}`,
      };
      const r = require("node:http").request(
        { hostname: "127.0.0.1", port: TEST_PORT, path: `/v1/account/webhooks/${webhookId}/toggle`, method: "POST", headers },
        (res: import("node:http").IncomingMessage) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf-8");
            let data: unknown;
            try { data = JSON.parse(text); } catch { data = text; }
            resolve({ status: res.statusCode ?? 0, headers: {}, data: data as Record<string, unknown> });
          });
        },
      );
      r.on("error", reject);
      r.write(raw);
      r.end();
    });
    expect(r.status).toBe(400);
    expect(r.data).toHaveProperty("error_code", "INVALID_JSON");
  });

  it("returns 400 when active is not a boolean", async () => {
    const r = await req("POST", `/v1/account/webhooks/${webhookId}/toggle`, { active: "yes" }, apiKey);
    expect(r.status).toBe(400);
    expect(r.data).toHaveProperty("error_code", "MISSING_FIELD");
  });

  it("returns 404 for webhook owned by different account", async () => {
    // Create a second account
    const acct2 = await req("POST", "/v1/accounts", { name: "Other Owner", email: "other-wh@test.com" });
    const otherKey = (acct2.data as any).api_key.raw_key;
    // Try to toggle first account's webhook with second account's key
    const r = await req("POST", `/v1/account/webhooks/${webhookId}/toggle`, { active: false }, otherKey);
    expect(r.status).toBe(404);
    expect(r.data).toHaveProperty("error_code", "NOT_FOUND");
  });
});

// ─── Layer 13: auth guard coverage per handler ──────────────────

describe("auth guard per-handler (webhooks.ts lines 107,128,163)", () => {
  it("DELETE /v1/account/webhooks/:id returns 401 without auth", async () => {
    const r = await req("DELETE", "/v1/account/webhooks/wh_nonexistent");
    expect(r.status).toBe(401);
  });

  it("POST /v1/account/webhooks/:id/toggle returns 401 without auth", async () => {
    const r = await req("POST", "/v1/account/webhooks/wh_nonexistent/toggle", { active: true });
    expect(r.status).toBe(401);
  });

  it("GET /v1/account/webhooks/:id/deliveries returns 401 without auth", async () => {
    const r = await req("GET", "/v1/account/webhooks/wh_nonexistent/deliveries");
    expect(r.status).toBe(401);
  });
});
