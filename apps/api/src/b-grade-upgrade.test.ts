import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import {
  handleCreateAccount,
  handleUpdateTier,
  handleSaveGitHubToken,
  handleListGitHubTokens,
  handleDeleteGitHubToken,
  handleBillingHistory,
  handleProrationPreview,
} from "./billing.js";
import { resetRateLimits } from "./rate-limiter.js";

const TEST_PORT = 44460;
let server: Server;

// ─── HTTP helper ────────────────────────────────────────────────

interface Res { status: number; data: Record<string, unknown> }

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
          resolve({ status: res.statusCode ?? 0, data: data as Record<string, unknown> });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// ─── Server setup ───────────────────────────────────────────────

beforeAll(async () => {
  openMemoryDb();
  resetRateLimits();
  const router = new Router();
  router.post("/v1/accounts", handleCreateAccount);
  router.post("/v1/account/tier", handleUpdateTier);
  router.post("/v1/account/github-token", handleSaveGitHubToken);
  router.get("/v1/account/github-token", handleListGitHubTokens);
  router.delete("/v1/account/github-token/:token_id", handleDeleteGitHubToken);
  router.get("/v1/billing/history", handleBillingHistory);
  router.get("/v1/billing/proration", handleProrationPreview);
  server = createApp(router, TEST_PORT);
  await new Promise<void>((r) => setTimeout(r, 100));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  closeDb();
});

beforeEach(() => {
  resetRateLimits();
});

// ─── Helper: create authenticated account ───────────────────────

async function createAuth(): Promise<string> {
  const res = await req("POST", "/v1/accounts", {
    name: `user-${Date.now()}`,
    email: `u${Date.now()}@test.com`,
  });
  return (res.data.api_key as Record<string, unknown>).raw_key as string;
}

// ─── GitHub Token Endpoints ─────────────────────────────────────

describe("POST /v1/account/github-token", () => {
  it("stores a GitHub token and returns metadata", async () => {
    const key = await createAuth();
    const res = await req("POST", "/v1/account/github-token", {
      token: "ghp_testabc123456789xyz",
      label: "my-token",
      scopes: ["repo", "read:org"],
    }, key);

    expect(res.status).toBe(201);
    expect(res.data.token_id).toBeTruthy();
    expect(res.data.token_prefix).toBe("ghp_test");
    expect(res.data.label).toBe("my-token");
    expect(res.data.scopes).toBe("repo,read:org");
  });

  it("rejects without auth", async () => {
    const res = await req("POST", "/v1/account/github-token", { token: "ghp_abc123" });
    expect(res.status).toBe(401);
  });

  it("rejects missing token", async () => {
    const key = await createAuth();
    const res = await req("POST", "/v1/account/github-token", { label: "no-token" }, key);
    expect(res.status).toBe(400);
  });

  it("rejects too-short token", async () => {
    const key = await createAuth();
    const res = await req("POST", "/v1/account/github-token", { token: "short" }, key);
    expect(res.status).toBe(400);
  });
});

describe("GET /v1/account/github-token", () => {
  it("lists stored tokens without exposing secrets", async () => {
    const key = await createAuth();
    await req("POST", "/v1/account/github-token", { token: "ghp_list_test_12345" }, key);
    await req("POST", "/v1/account/github-token", { token: "ghp_list_test_67890" }, key);

    const res = await req("GET", "/v1/account/github-token", undefined, key);
    expect(res.status).toBe(200);
    const tokens = res.data.tokens as Array<Record<string, unknown>>;
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    // Verify no raw token exposed
    for (const t of tokens) {
      expect(t).not.toHaveProperty("encrypted_token");
      expect(t.token_prefix).toBeTruthy();
      expect(typeof t.valid).toBe("boolean");
    }
  });
});

describe("DELETE /v1/account/github-token/:token_id", () => {
  it("deletes a stored token", async () => {
    const key = await createAuth();
    const saveRes = await req("POST", "/v1/account/github-token", { token: "ghp_delete_me_12345" }, key);
    const tokenId = saveRes.data.token_id as string;

    const delRes = await req("DELETE", `/v1/account/github-token/${tokenId}`, undefined, key);
    expect(delRes.status).toBe(200);
    expect(delRes.data.deleted).toBe(true);
  });

  it("returns 404 for non-existent token", async () => {
    const key = await createAuth();
    const res = await req("DELETE", "/v1/account/github-token/no-such-id", undefined, key);
    expect(res.status).toBe(404);
  });
});

// ─── Billing History + Proration ────────────────────────────────

describe("GET /v1/billing/history", () => {
  it("returns tier change audit trail after upgrade", async () => {
    const key = await createAuth();

    // Upgrade free → paid
    await req("POST", "/v1/account/tier", { tier: "paid" }, key);

    const res = await req("GET", "/v1/billing/history", undefined, key);
    expect(res.status).toBe(200);
    expect(res.data.current_tier).toBe("paid");
    const history = res.data.history as Array<Record<string, unknown>>;
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].from_tier).toBe("free");
    expect(history[0].to_tier).toBe("paid");
    expect(history[0].reason).toBe("user_request");
    expect(typeof history[0].proration_amount).toBe("number");
  });

  it("shows multiple tier transitions", async () => {
    const key = await createAuth();
    await req("POST", "/v1/account/tier", { tier: "paid" }, key);
    await req("POST", "/v1/account/tier", { tier: "suite" }, key);

    const res = await req("GET", "/v1/billing/history", undefined, key);
    const history = res.data.history as Array<Record<string, unknown>>;
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects without auth", async () => {
    const res = await req("GET", "/v1/billing/history");
    expect(res.status).toBe(401);
  });
});

describe("GET /v1/billing/proration", () => {
  it("returns proration preview for upgrade", async () => {
    const key = await createAuth();
    const res = await req("GET", "/v1/billing/proration?tier=paid", undefined, key);
    expect(res.status).toBe(200);
    expect(res.data.current_tier).toBe("free");
    expect(res.data.target_tier).toBe("paid");
    expect(res.data.direction).toBe("upgrade");
    expect(typeof res.data.proration_amount).toBe("number");
  });

  it("returns zero for same tier", async () => {
    const key = await createAuth();
    const res = await req("GET", "/v1/billing/proration?tier=free", undefined, key);
    expect(res.status).toBe(200);
    expect(res.data.direction).toBe("none");
    expect(res.data.proration_amount).toBe(0);
  });

  it("rejects invalid tier", async () => {
    const key = await createAuth();
    const res = await req("GET", "/v1/billing/proration?tier=platinum", undefined, key);
    expect(res.status).toBe(400);
  });

  it("rejects missing tier", async () => {
    const key = await createAuth();
    const res = await req("GET", "/v1/billing/proration", undefined, key);
    expect(res.status).toBe(400);
  });
});
