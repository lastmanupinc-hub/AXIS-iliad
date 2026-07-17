/**
 * H-Phase-A cycle 3 — GET /v1/credits/purchases called
 * listPurchasesByAccount (async, returns Promise<CreditPackPurchase[]>)
 * without awaiting it. sendJSON's payload param is typed `unknown`, so the
 * bare Promise serialized to `{}` via JSON.stringify — every call to this
 * endpoint returned an empty object instead of the caller's purchase
 * history, and no test exercised it (confirmed no other test file
 * references this endpoint or handleListMyPurchases).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { resetTestDb, recordPendingPurchase, markPurchaseSucceeded } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleCreateAccount } from "./billing.js";
import { handleListMyPurchases } from "./credit-pack-handlers.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;

interface Res { status: number; data: Record<string, unknown> }

async function req(method: string, path: string, authKey?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authKey) headers["Authorization"] = `Bearer ${authKey}`;
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method, headers },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          resolve({ status: res.statusCode ?? 0, data: data as Record<string, unknown> });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();
  const router = new Router();
  router.post("/v1/accounts", handleCreateAccount);
  router.get("/v1/credits/purchases", handleListMyPurchases);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await (server as unknown as { shutdown: () => Promise<void> }).shutdown();
});

async function createAccount(email: string): Promise<{ account_id: string; api_key: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ name: "Test User", email });
    const r = require("node:http").request(
      {
        hostname: "127.0.0.1",
        port: testPort,
        path: "/v1/accounts",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const data = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as {
            account: { account_id: string };
            api_key: { raw_key: string };
          };
          resolve({ account_id: data.account.account_id, api_key: data.api_key.raw_key });
        });
      },
    );
    r.on("error", reject);
    r.write(payload);
    r.end();
  });
}

describe("GET /v1/credits/purchases", () => {
  it("returns 401 without auth", async () => {
    const r = await req("GET", "/v1/credits/purchases");
    expect(r.status).toBe(401);
  });

  it("returns an empty array for an account with no purchases (not an empty object)", async () => {
    const { api_key } = await createAccount("no-purchases@test.local");
    const r = await req("GET", "/v1/credits/purchases", api_key);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data.purchases)).toBe(true);
    expect((r.data.purchases as unknown[]).length).toBe(0);
  });

  it("returns the caller's actual purchase history, not {} (the missing-await bug)", async () => {
    const { account_id, api_key } = await createAccount("has-purchases@test.local");
    const pending = await recordPendingPurchase({
      account_id,
      pack_id: "pack_100",
      credits: 100,
      price_cents: 500,
      paid_session_id: `sess_${account_id}`,
    });
    await markPurchaseSucceeded(pending.paid_session_id!);

    const r = await req("GET", "/v1/credits/purchases", api_key);
    expect(r.status).toBe(200);
    // The bug: purchases was a raw unresolved Promise, which JSON.stringify
    // serializes to {} — Array.isArray({}) is false, and (r.data.purchases as
    // any[]).length would be undefined, not 1. Both assertions below fail
    // under the bug and pass once the await is restored.
    expect(Array.isArray(r.data.purchases)).toBe(true);
    const purchases = r.data.purchases as Array<Record<string, unknown>>;
    expect(purchases.length).toBe(1);
    expect(purchases[0].pack_id).toBe("pack_100");
    expect(purchases[0].credits).toBe(100);
    expect(purchases[0].status).toBe("succeeded");
  });
});
