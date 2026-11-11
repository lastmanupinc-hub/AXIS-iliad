/**
 * Email verification (AXIS Launch taskgate T106; red-team I-02): a new account holds its key and its reads but
 * spends nothing until the address is confirmed through the mailed link. Real Postgres; Resend stood in by a fetch
 * stub that keeps what it was asked to send, so the link under test is the one a person would receive.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { Server } from "node:http";
import { resetTestDb, sql, createAccount, createApiKey, getAccountByEmail } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleCreateAccount, handleGetAccount } from "./billing.js";
import { handleCreateSnapshot } from "./handlers.js";
import { handleMcpPost } from "./mcp-server.js";
import {
  handleVerifyEmail,
  handleResendVerification,
  requireVerifiedEmail,
  buildVerificationToken,
  checkVerificationToken,
  resetVerificationThrottle,
  VERIFICATION_LINK_TTL_MS,
} from "./email-verification.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let port = 0;
const ADMIN_KEY = "test-admin-key-for-email-verification-0123456789";
const savedEnv: Record<string, string | undefined> = {};

interface Res { status: number; headers: Record<string, string | string[] | undefined>; data: Record<string, unknown>; raw: string }

async function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const h: Record<string, string> = { ...headers };
    if (payload !== undefined) h["Content-Type"] = "application/json";
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port, path, method, headers: h },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = {}; }
          resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string | string[] | undefined>, data: data as Record<string, unknown>, raw });
        });
      },
    );
    r.on("error", reject);
    if (payload !== undefined) r.write(payload);
    r.end();
  });
}
const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });

/** What the Resend stand-in was asked to send. */
const mails: Array<{ to: string[]; subject: string; text: string }> = [];
const realFetch = globalThis.fetch;
function stubResend(): void {
  vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url instanceof Request ? url.url : url);
    if (target.endsWith("/emails")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { to: string[]; subject: string; text: string };
      mails.push({ to: body.to, subject: body.subject, text: body.text });
      return new Response(JSON.stringify({ id: "re_test_message" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return realFetch(url, init);
  });
}
function lastToken(): string {
  const m = /token=([^\s"&]+)/.exec(mails[mails.length - 1]?.text ?? "");
  if (!m) throw new Error("no verification link in the last mail");
  return decodeURIComponent(m[1]);
}

async function mcp(key: string | null, name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const r = await req("POST", "/mcp", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, key ? bearer(key) : {});
  expect(r.status).toBe(200);
  return (r.data.result ?? {}) as Record<string, unknown>;
}

beforeAll(async () => {
  for (const k of ["ADMIN_API_KEY", "RESEND_API_KEY", "RESEND_FROM_ADDRESS", "AXIS_EMAIL_VERIFY_SECRET"]) savedEnv[k] = process.env[k];
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_ADDRESS = "iliad@example.com";
  delete process.env.AXIS_EMAIL_VERIFY_SECRET;
  stubResend();
  await resetTestDb();
  resetRateLimits();
  const router = new Router();
  router.post("/v1/accounts", handleCreateAccount);
  router.get("/v1/account", handleGetAccount);
  router.get("/v1/account/verify", handleVerifyEmail);
  router.post("/v1/account/verification", handleResendVerification);
  router.post("/v1/snapshots", requireVerifiedEmail(handleCreateSnapshot));
  router.post("/mcp", handleMcpPost);
  const ts = await startTestServer(router);
  server = ts.server;
  port = ts.port;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  mails.length = 0;
  resetVerificationThrottle();
  resetRateLimits();
});

describe("a new account", () => {
  it("is created unverified, gets its key, and receives one mail with the link", async () => {
    const r = await req("POST", "/v1/accounts", { name: "Ada", email: "ada-verify@example.com", tier: "free" });
    expect(r.status).toBe(201);
    const account = r.data.account as Record<string, unknown>;
    expect(account.email_verified_at).toBeNull();
    expect((r.data.api_key as Record<string, unknown>).raw_key).toBeTruthy();
    expect(r.data.email_verification).toEqual({
      required: true, verified: false, sent: true, email: "ada-verify@example.com", resend: "POST /v1/account/verification",
    });
    expect(String(r.data.message)).toContain("Confirm your email address");
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toEqual(["ada-verify@example.com"]);
    expect(mails[0].subject).toContain("Confirm your email address");
    expect(mails[0].text).toContain("/v1/account/verify?token=");
    const token = lastToken();
    expect((await checkVerificationToken(token)).ok).toBe(true);
  });

  it("reads its own account (verified: false) and runs free tools, but no metered REST route or MCP tool", async () => {
    const r = await req("POST", "/v1/accounts", { name: "Bea", email: "bea-verify@example.com", tier: "free" });
    const key = (r.data.api_key as Record<string, string>).raw_key;

    const me = await req("GET", "/v1/account", undefined, bearer(key));
    expect(me.status).toBe(200);
    expect(me.data.email_verification).toEqual({ verified: false, email: "bea-verify@example.com", resend: "POST /v1/account/verification" });

    const snap = await req("POST", "/v1/snapshots", { files: [{ path: "a.ts", content: "export const a = 1;" }] }, bearer(key));
    expect(snap.status).toBe(403);
    expect(snap.data.error_code).toBe("EMAIL_UNVERIFIED");
    expect((snap.data.email_verification as Record<string, unknown>).resend).toBe("POST /v1/account/verification");

    const metered = await mcp(key, "ping_payment");
    expect(metered.isError).toBe(true);
    expect(metered._email_verification_required).toEqual({ email: "bea-verify@example.com", resend: "POST /v1/account/verification" });
    expect((metered._error as Record<string, unknown>).code).toBe("auth");

    const free = await mcp(key, "list_programs");
    expect(free.isError).toBeFalsy();
    expect(free._email_verification_required).toBeUndefined();
  });

  it("anonymous and invalid-key callers are not told about verification; they get the route's own answer", async () => {
    const body = { files: [{ path: "a.ts", content: "export const a = 1;" }] };
    for (const headers of [{}, bearer("axis_not_a_real_key")]) {
      const r = await req("POST", "/v1/snapshots", body, headers);
      expect([400, 401]).toContain(r.status);
      expect(r.data.error_code).not.toBe("EMAIL_UNVERIFIED");
      expect(r.data.email_verification).toBeUndefined();
    }
  });
});

describe("the link", () => {
  it("verifies once, answers already_verified after, and opens every door", async () => {
    const r = await req("POST", "/v1/accounts", { name: "Cy", email: "cy-verify@example.com", tier: "free" });
    const key = (r.data.api_key as Record<string, string>).raw_key;
    const token = lastToken();

    const first = await req("GET", `/v1/account/verify?token=${encodeURIComponent(token)}`);
    expect(first.status).toBe(200);
    expect(first.data).toEqual({ status: "verified", email: "cy-verify@example.com" });
    const again = await req("GET", `/v1/account/verify?token=${encodeURIComponent(token)}`);
    expect(again.status).toBe(200);
    expect(again.data.status).toBe("already_verified");

    const stored = await getAccountByEmail("cy-verify@example.com");
    expect(stored?.email_verified_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const me = await req("GET", "/v1/account", undefined, bearer(key));
    expect((me.data.email_verification as Record<string, unknown>).verified).toBe(true);

    const snap = await req("POST", "/v1/snapshots", { files: [{ path: "a.ts", content: "export const a = 1;" }] }, bearer(key));
    expect(snap.status).not.toBe(403);
    expect(snap.data.error_code).not.toBe("EMAIL_UNVERIFIED");
    const metered = await mcp(key, "ping_payment");
    expect(metered._email_verification_required).toBeUndefined();
  });

  it("answers a browser with an HTML page", async () => {
    await req("POST", "/v1/accounts", { name: "Di", email: "di-verify@example.com", tier: "free" });
    const r = await req("GET", `/v1/account/verify?token=${encodeURIComponent(lastToken())}`, undefined, { Accept: "text/html,application/xhtml+xml" });
    expect(r.status).toBe(200);
    expect(String(r.headers["content-type"])).toContain("text/html");
    expect(r.raw).toContain("confirmed");
    expect(r.raw).toContain("di-verify@example.com");
  });

  it("refuses a malformed, a tampered, an expired, and a stale link, and verifies nothing", async () => {
    await req("POST", "/v1/accounts", { name: "Ed", email: "ed-verify@example.com", tier: "free" });
    const token = lastToken();
    const account = (await getAccountByEmail("ed-verify@example.com"))!;

    const malformed = await req("GET", "/v1/account/verify?token=nope");
    expect(malformed.status).toBe(400);
    expect(malformed.data.reason).toBe("malformed");
    expect((await req("GET", "/v1/account/verify")).status).toBe(400);

    const tampered = token.slice(0, -4) + (token.endsWith("0000") ? "1111" : "0000");
    const bad = await req("GET", `/v1/account/verify?token=${encodeURIComponent(tampered)}`);
    expect(bad.status).toBe(400);
    expect(bad.data.reason).toBe("invalid");

    const old = buildVerificationToken(account, Date.now() - VERIFICATION_LINK_TTL_MS - 60_000)!;
    const expired = await req("GET", `/v1/account/verify?token=${encodeURIComponent(old)}`);
    expect(expired.status).toBe(400);
    expect(expired.data.reason).toBe("expired");

    // The address changed after the mail went: the old link no longer names the stored address.
    await sql.run("UPDATE accounts SET email = ? WHERE account_id = ?", ["ed-moved@example.com", account.account_id]);
    const stale = await req("GET", `/v1/account/verify?token=${encodeURIComponent(token)}`);
    expect(stale.status).toBe(400);
    expect(stale.data.reason).toBe("invalid");

    expect((await getAccountByEmail("ed-moved@example.com"))?.email_verified_at).toBeNull();
  });
});

describe("POST /v1/account/verification", () => {
  it("sends the link again, once every five minutes, and says so once the address is verified", async () => {
    const r = await req("POST", "/v1/accounts", { name: "Fay", email: "fay-verify@example.com", tier: "free" });
    const key = (r.data.api_key as Record<string, string>).raw_key;
    expect(mails).toHaveLength(1);

    const resend = await req("POST", "/v1/account/verification", {}, bearer(key));
    expect(resend.status).toBe(202);
    expect(resend.data.status).toBe("sent");
    expect(mails).toHaveLength(2);
    expect((await checkVerificationToken(lastToken())).ok).toBe(true);

    const tooSoon = await req("POST", "/v1/account/verification", {}, bearer(key));
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.data.error_code).toBe("RATE_LIMITED");
    expect(Number(tooSoon.headers["retry-after"])).toBeGreaterThan(0);
    expect(mails).toHaveLength(2);

    await req("GET", `/v1/account/verify?token=${encodeURIComponent(lastToken())}`);
    const done = await req("POST", "/v1/account/verification", {}, bearer(key));
    expect(done.status).toBe(200);
    expect(done.data.status).toBe("already_verified");
    expect(mails).toHaveLength(2);

    expect((await req("POST", "/v1/account/verification", {})).status).toBe(401);
  });
});

describe("accounts that need no link", () => {
  it("an account the admin key creates is verified at creation", async () => {
    const r = await req("POST", "/v1/accounts", { name: "Owner made", email: "gil-verify@example.com", tier: "free" }, bearer(ADMIN_KEY));
    expect(r.status).toBe(201);
    expect(r.data.email_verification).toEqual({ required: false, verified: true });
    expect(mails).toHaveLength(0);
    const key = (r.data.api_key as Record<string, string>).raw_key;
    const snap = await req("POST", "/v1/snapshots", { files: [{ path: "a.ts", content: "export const a = 1;" }] }, bearer(key));
    expect(snap.status).not.toBe(403);
  });

  it("an account created verified in the store (a social sign-in, an older account) passes the gate", async () => {
    const account = await createAccount("Hal", "hal-verify@example.com", "free", { email_verified_at: new Date().toISOString() });
    const { rawKey } = await createApiKey(account.account_id, "test");
    const metered = await mcp(rawKey, "ping_payment");
    expect(metered._email_verification_required).toBeUndefined();
  });
});

describe("without a mailer", () => {
  it("signup still succeeds and says the mail did not go", async () => {
    const saved = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const r = await req("POST", "/v1/accounts", { name: "Ivy", email: "ivy-verify@example.com", tier: "free" });
      expect(r.status).toBe(201);
      expect((r.data.email_verification as Record<string, unknown>).sent).toBe(false);
      expect(mails).toHaveLength(0);
      const key = (r.data.api_key as Record<string, string>).raw_key;
      const resend = await req("POST", "/v1/account/verification", {}, bearer(key));
      expect(resend.status).toBe(503);
    } finally {
      process.env.RESEND_API_KEY = saved;
    }
  });
});
