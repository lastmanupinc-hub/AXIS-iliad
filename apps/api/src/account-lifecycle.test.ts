/**
 * WO-A5 — PATCH /v1/account (name/email update) and DELETE /v1/account
 * (retention-policy cascade). See billing-store.ts's deleteAccount doc
 * comment for the full policy this enforces: access surfaces + generated
 * content are hard-deleted; financial/audit records are retained against
 * an anonymized account shell (never a row delete — every retained table
 * still carries a live FK to accounts.account_id).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { resetTestDb, sql, recordPendingSubscription } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleCreateAccount, handleGetAccount, handlePatchAccount, handleDeleteAccount } from "./billing.js";
import { handleCreateSnapshot } from "./handlers.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;

interface Res { status: number; data: Record<string, unknown> }

async function req(method: string, path: string, body?: unknown, authKey?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
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
    if (payload) r.write(payload);
    r.end();
  });
}

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();
  const router = new Router();
  router.post("/v1/accounts", handleCreateAccount);
  router.get("/v1/account", handleGetAccount);
  router.patch("/v1/account", handlePatchAccount);
  router.delete("/v1/account", handleDeleteAccount);
  router.post("/v1/snapshots", handleCreateSnapshot);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  resetRateLimits();
});

let acctCounter = 0;
async function createTestAccount() {
  acctCounter += 1;
  const n = `acct-lifecycle-${acctCounter}-${Math.random().toString(36).slice(2, 8)}`;
  const r = await req("POST", "/v1/accounts", { name: n, email: `${n}@test.com` });
  expect(r.status).toBe(201);
  return {
    account_id: (r.data.account as Record<string, unknown>).account_id as string,
    key: (r.data.api_key as Record<string, unknown>).raw_key as string,
    name: n,
    email: `${n}@test.com`,
  };
}

describe("PATCH /v1/account (WO-A5)", () => {
  it("requires auth", async () => {
    const r = await req("PATCH", "/v1/account", { name: "New Name" });
    expect(r.status).toBe(401);
  });

  it("updates name only", async () => {
    const { key, email } = await createTestAccount();
    const r = await req("PATCH", "/v1/account", { name: "Updated Name" }, key);
    expect(r.status).toBe(200);
    const account = r.data.account as Record<string, unknown>;
    expect(account.name).toBe("Updated Name");
    expect(account.email).toBe(email);
    expect(r.data.name_changed).toBe(true);
    expect(r.data.email_changed).toBe(false);
  });

  it("updates email only, normalized to lowercase, with a disclosure note (no verification flow exists)", async () => {
    const { key, name } = await createTestAccount();
    acctCounter += 1;
    const newEmail = `NewEmail-${acctCounter}@Test.com`;
    const r = await req("PATCH", "/v1/account", { email: newEmail }, key);
    expect(r.status).toBe(200);
    const account = r.data.account as Record<string, unknown>;
    expect(account.email).toBe(newEmail.toLowerCase());
    expect(account.name).toBe(name);
    expect(r.data.email_changed).toBe(true);
    expect(typeof r.data.note).toBe("string");
  });

  it("400s when neither field is provided", async () => {
    const { key } = await createTestAccount();
    const r = await req("PATCH", "/v1/account", {}, key);
    expect(r.status).toBe(400);
  });

  it("400s on an empty name", async () => {
    const { key } = await createTestAccount();
    const r = await req("PATCH", "/v1/account", { name: "" }, key);
    expect(r.status).toBe(400);
  });

  it("400s on a malformed email", async () => {
    const { key } = await createTestAccount();
    const r = await req("PATCH", "/v1/account", { email: "not-an-email" }, key);
    expect(r.status).toBe(400);
  });

  it("409s when another account already owns the target email", async () => {
    const first = await createTestAccount();
    const second = await createTestAccount();
    const r = await req("PATCH", "/v1/account", { email: first.email }, second.key);
    expect(r.status).toBe(409);
  });

  it("changing email to the account's OWN current email is a no-op, not a 409", async () => {
    const { key, email } = await createTestAccount();
    const r = await req("PATCH", "/v1/account", { email }, key);
    expect(r.status).toBe(200);
    expect(r.data.email_changed).toBe(false);
  });
});

describe("DELETE /v1/account (WO-A5) — retention policy", () => {
  it("requires auth", async () => {
    const r = await req("DELETE", "/v1/account");
    expect(r.status).toBe(401);
  });

  it("revokes the account's own API key — a second call with the same key is unauthenticated, not a repeat success", async () => {
    const { key } = await createTestAccount();
    const first = await req("DELETE", "/v1/account", undefined, key);
    expect(first.status).toBe(200);
    expect(first.data.deleted).toBe(true);

    const second = await req("DELETE", "/v1/account", undefined, key);
    expect(second.status).toBe(401);
  });

  it("hard-deletes the account's projects/snapshots and webhooks", async () => {
    const { account_id, key } = await createTestAccount();

    const snapRes = await req(
      "POST",
      "/v1/snapshots",
      {
        manifest: {
          project_name: "delete-me-project",
          project_type: "web_application",
          frameworks: [],
          goals: [],
          requested_outputs: ["AGENTS.md"],
        },
        files: [{ path: "a.ts", content: "export const x = 1;", size: 20 }],
      },
      key,
    );
    expect(snapRes.status).toBe(201);
    const projectId = (snapRes.data as Record<string, unknown>).project_id as string;

    const { createWebhook } = await import("@axis/snapshots");
    await createWebhook(account_id, "https://example.com/hook", ["snapshot.created"]);

    const before = await sql.many<{ project_id: string }>("SELECT project_id FROM projects WHERE account_id = ?", [account_id]);
    expect(before.length).toBeGreaterThan(0);

    const del = await req("DELETE", "/v1/account", undefined, key);
    expect(del.status).toBe(200);
    expect(del.data.projects_deleted).toBeGreaterThan(0);

    const projectsAfter = await sql.many<{ project_id: string }>("SELECT project_id FROM projects WHERE account_id = ?", [account_id]);
    expect(projectsAfter).toEqual([]);
    const specificProject = await sql.one<{ project_id: string }>("SELECT project_id FROM projects WHERE project_id = ?", [projectId]);
    expect(specificProject).toBeUndefined();
    const webhooksAfter = await sql.many<{ webhook_id: string }>("SELECT webhook_id FROM webhooks WHERE account_id = ?", [account_id]);
    expect(webhooksAfter).toEqual([]);
  });

  it("RETAINS financial/audit rows (tier_changes) and anonymizes — never deletes — the account row itself", async () => {
    const { account_id, key, name, email } = await createTestAccount();

    const { logTierChange } = await import("@axis/snapshots");
    await logTierChange(account_id, "free", "paid", "test_fixture");

    const del = await req("DELETE", "/v1/account", undefined, key);
    expect(del.status).toBe(200);

    // Financial audit trail survives — this is the whole point of the policy.
    const tierChanges = await sql.many<{ change_id: string }>("SELECT change_id FROM tier_changes WHERE account_id = ?", [account_id]);
    expect(tierChanges.length).toBe(1);

    // The account row itself still exists (anonymized, not deleted) — every
    // RETAINED table above still carries a live FK to it.
    const row = await sql.one<{ account_id: string; name: string; email: string }>(
      "SELECT account_id, name, email FROM accounts WHERE account_id = ?",
      [account_id],
    );
    expect(row).toBeDefined();
    expect(row!.name).not.toBe(name);
    expect(row!.email).not.toBe(email);
    expect(row!.email).toContain("deleted");
  });

  // money_01: subscription_purchases is a financial/audit table (same class
  // as credit_pack_purchases/payment_receipts) and was never added to
  // deleteAccount's DELETE FROM allowlist — this proves that by construction,
  // not just by reading the doc comment.
  it("RETAINS subscription_purchases rows on account deletion", async () => {
    const { account_id, key } = await createTestAccount();
    await recordPendingSubscription({
      account_id,
      target_tier: "paid",
      plan_id: "starter",
      amount_cents: 2900,
      paid_session_id: "cs_retention_test",
    });

    const del = await req("DELETE", "/v1/account", undefined, key);
    expect(del.status).toBe(200);

    const rows = await sql.many<{ purchase_id: string }>(
      "SELECT purchase_id FROM subscription_purchases WHERE account_id = ?",
      [account_id],
    );
    expect(rows.length).toBe(1);
  });
});
