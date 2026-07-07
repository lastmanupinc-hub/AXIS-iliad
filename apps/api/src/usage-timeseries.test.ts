import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { resetTestDb, createAccount, createApiKey, recordUsage, sql } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleGetUsageTimeseries } from "./billing.js";

let server: Server;
let testPort = 0;

interface Res { status: number; data: Record<string, unknown> }

async function req(method: string, path: string, headers?: Record<string, string>): Promise<Res> {
  return new Promise((resolve, reject) => {
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

async function authHeaders(label: string): Promise<{ account_id: string; headers: Record<string, string> }> {
  const acct = await createAccount(`${label} User`, `${label}@usage-timeseries-test.com`, "paid");
  const key = await createApiKey(acct.account_id, label);
  return { account_id: acct.account_id, headers: { Authorization: `Bearer ${key.rawKey}` } };
}

function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

/** Directly insert a persistence_credits row (bypasses the metering/balance
 *  flow — this suite only needs a dated debit/grant row, not a real balance). */
async function insertCredit(account_id: string, credits_delta: number, created_at: string): Promise<void> {
  await sql.run(
    `INSERT INTO persistence_credits (credit_id, account_id, credits_delta, operation, snapshot_id, balance_after, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    [randomUUID(), account_id, credits_delta, credits_delta < 0 ? "diff_view" : "purchase", 0, created_at],
  );
}

beforeAll(async () => {
  await resetTestDb();
  const router = new Router();
  router.get("/v1/account/usage/timeseries", handleGetUsageTimeseries);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe("GET /v1/account/usage/timeseries (WO-A3)", () => {
  it("401 unauthenticated", async () => {
    const res = await req("GET", "/v1/account/usage/timeseries");
    expect(res.status).toBe(401);
  });

  it("400 for an unsupported bucket granularity", async () => {
    const owner = await authHeaders("ts-bad-bucket");
    const res = await req("GET", "/v1/account/usage/timeseries?bucket=hour", owner.headers);
    expect(res.status).toBe(400);
  });

  it("defaults to a 30-day zero-filled window with today's runs bucketed correctly", async () => {
    const owner = await authHeaders("ts-default");
    await recordUsage(owner.account_id, "skills", "snap-1", 3, 1, 100);
    await recordUsage(owner.account_id, "debug", "snap-1", 2, 1, 100);

    const res = await req("GET", "/v1/account/usage/timeseries", owner.headers);
    expect(res.status).toBe(200);
    const buckets = res.data.buckets as Array<{ date: string; runs: number; by_program: Record<string, number>; credits_spent: number }>;
    expect(buckets).toHaveLength(30);

    const today = new Date().toISOString().slice(0, 10);
    const todayBucket = buckets.find((b) => b.date === today)!;
    expect(todayBucket.runs).toBe(2);
    expect(todayBucket.by_program).toEqual({ skills: 1, debug: 1 });
    expect(todayBucket.credits_spent).toBe(0);

    // every other bucket is zero-filled
    const zeroBuckets = buckets.filter((b) => b.date !== today);
    expect(zeroBuckets).toHaveLength(29);
    for (const b of zeroBuckets) {
      expect(b.runs).toBe(0);
      expect(b.by_program).toEqual({});
    }

    // ascending date order
    const dates = buckets.map((b) => b.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("respects a custom since_days window", async () => {
    const owner = await authHeaders("ts-since-days");
    const res = await req("GET", "/v1/account/usage/timeseries?since_days=3", owner.headers);
    expect(res.status).toBe(200);
    expect((res.data.buckets as unknown[]).length).toBe(3);
  });

  it("clamps since_days into [1, 365]", async () => {
    const owner = await authHeaders("ts-clamp");
    const tooBig = await req("GET", "/v1/account/usage/timeseries?since_days=99999", owner.headers);
    expect((tooBig.data.buckets as unknown[]).length).toBe(365);

    const tooSmall = await req("GET", "/v1/account/usage/timeseries?since_days=0", owner.headers);
    expect((tooSmall.data.buckets as unknown[]).length).toBe(1);
  });

  it("buckets a backdated usage row into its own historical day, not today", async () => {
    const owner = await authHeaders("ts-backdated");
    const record = await recordUsage(owner.account_id, "theme", "snap-2", 1, 1, 100);
    const fiveDaysAgo = daysAgoIso(5);
    await sql.run("UPDATE usage_records SET created_at = ? WHERE usage_id = ?", [fiveDaysAgo, record.usage_id]);

    const res = await req("GET", "/v1/account/usage/timeseries?since_days=10", owner.headers);
    const buckets = res.data.buckets as Array<{ date: string; runs: number; by_program: Record<string, number> }>;
    const targetDate = fiveDaysAgo.slice(0, 10);
    const bucket = buckets.find((b) => b.date === targetDate)!;
    expect(bucket.runs).toBe(1);
    expect(bucket.by_program).toEqual({ theme: 1 });

    const today = new Date().toISOString().slice(0, 10);
    const todayBucket = buckets.find((b) => b.date === today)!;
    expect(todayBucket.runs).toBe(0);
  });

  it("credits_spent reflects debit rows only — grants (positive delta) are excluded", async () => {
    const owner = await authHeaders("ts-credits");
    await insertCredit(owner.account_id, 10, daysAgoIso(0)); // grant/purchase — not "spend"
    await insertCredit(owner.account_id, -1, daysAgoIso(0)); // debit — spend
    await insertCredit(owner.account_id, -2, daysAgoIso(2)); // debit on an earlier day

    const res = await req("GET", "/v1/account/usage/timeseries?since_days=5", owner.headers);
    const buckets = res.data.buckets as Array<{ date: string; credits_spent: number }>;
    const today = new Date().toISOString().slice(0, 10);
    const twoDaysAgo = daysAgoIso(2).slice(0, 10);

    expect(buckets.find((b) => b.date === today)!.credits_spent).toBe(1);
    expect(buckets.find((b) => b.date === twoDaysAgo)!.credits_spent).toBe(2);
  });

  it("another account's usage never leaks into the caller's buckets", async () => {
    const owner = await authHeaders("ts-isolated");
    const other = await authHeaders("ts-isolated-other");
    await recordUsage(other.account_id, "brand", "snap-3", 1, 1, 100);

    const res = await req("GET", "/v1/account/usage/timeseries", owner.headers);
    const buckets = res.data.buckets as Array<{ runs: number }>;
    expect(buckets.every((b) => b.runs === 0)).toBe(true);
  });
});
