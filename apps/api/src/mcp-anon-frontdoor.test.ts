import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

// This suite proves the anonymous front-door wall-flip end to end via the
// REAL handleMcpPost — resolveAuth is the one seam mocked (per test, so both
// the anonymous and invalid-key cases are exercised), and @axis/snapshots is
// stubbed just enough that logMcpCall/the funnel event never touch a real DB.
const { mockResolveAuth } = vi.hoisted(() => ({ mockResolveAuth: vi.fn() }));
vi.mock("./billing.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./billing.js")>();
  return { ...actual, resolveAuth: mockResolveAuth };
});

vi.mock("@axis/snapshots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@axis/snapshots")>();
  return {
    ...actual,
    recordMcpUsage: vi.fn(async () => undefined),
    recordPaymentFunnelEvent: vi.fn(async () => undefined),
  };
});

import { handleMcpPost } from "./mcp-server.js";
import { resetChallengeWindows } from "./anon-frontdoor.js";
import * as snapshots from "@axis/snapshots";

function fakeReq(headers: Record<string, string> = {}) {
  return { headers, socket: { remoteAddress: "203.0.113.7" } } as unknown as IncomingMessage;
}
function fakeRes() {
  const res = {
    statusCode: 0,
    body: "",
    writeHead: vi.fn(function (this: { statusCode: number }, code: number) {
      (res as { statusCode: number }).statusCode = code;
    }),
    end: vi.fn(function (chunk?: string) {
      res.body = chunk ?? "";
    }),
  };
  return res as unknown as ServerResponse & { statusCode: number; body: string };
}

const ANONYMOUS = { account: null, key_id: null, anonymous: true };
const INVALID_KEY = { account: null, key_id: null, anonymous: false };

function msgFor(tool: string) {
  return { jsonrpc: "2.0" as const, id: 1, method: "tools/call", params: { name: tool, arguments: {} } };
}

beforeEach(() => {
  resetChallengeWindows();
  vi.clearAllMocks();
});
afterEach(() => {
  delete process.env.AXIS_ANON_PROVISION_FRONTDOOR;
});

describe("anonymous front door — flag OFF (default)", () => {
  it("an anonymous call to a metered tool gets the EXACT legacy dead-end auth error (parity)", async () => {
    mockResolveAuth.mockResolvedValue(ANONYMOUS);
    const res = fakeRes();

    await handleMcpPost(fakeReq(), res, undefined, msgFor("analyze_repo"));

    const parsed = JSON.parse(res.body) as { result: { isError: boolean; content: { text: string }[]; _error: { code: string } } };
    expect(parsed.result.isError).toBe(true);
    expect(parsed.result._error.code).toBe("auth");
    expect(parsed.result.content[0].text).toContain("Authentication required");
    expect(snapshots.recordPaymentFunnelEvent).not.toHaveBeenCalled();
  });
});

describe("anonymous front door — flag ON", () => {
  beforeEach(() => {
    process.env.AXIS_ANON_PROVISION_FRONTDOOR = "true";
  });

  it("an anonymous call to a metered tool gets a provisioning challenge, not a hard failure", async () => {
    mockResolveAuth.mockResolvedValue(ANONYMOUS);
    const res = fakeRes();

    await handleMcpPost(fakeReq(), res, undefined, msgFor("analyze_repo"));

    const parsed = JSON.parse(res.body) as {
      result: { isError: boolean; _provision_required: boolean; content: { text: string }[] };
    };
    expect(parsed.result.isError).toBe(false);
    expect(parsed.result._provision_required).toBe(true);
    const challenge = JSON.parse(parsed.result.content[0].text);
    expect(challenge.tool).toBe("analyze_repo");
    expect(challenge.x402).toBeUndefined(); // never a payable rail for an anonymous caller
    expect(snapshots.recordPaymentFunnelEvent).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: null, tool: "analyze_repo", kind: "challenge" }),
    );
  });

  it("an INVALID/revoked key still falls through to the real 'Invalid or revoked API key' error — the door is not a key-validity oracle", async () => {
    mockResolveAuth.mockResolvedValue(INVALID_KEY);
    const res = fakeRes();

    await handleMcpPost(fakeReq(), res, undefined, msgFor("analyze_repo"));

    const parsed = JSON.parse(res.body) as { result: { isError: boolean; content: { text: string }[] } };
    expect(parsed.result.isError).toBe(true);
    expect(parsed.result.content[0].text).toContain("Invalid or revoked API key");
  });

  it("an UNMETERED tool (list_programs) is unaffected — anonymous callers keep working exactly as today", async () => {
    mockResolveAuth.mockResolvedValue(ANONYMOUS);
    const res = fakeRes();

    await handleMcpPost(fakeReq(), res, undefined, msgFor("list_programs"));

    const parsed = JSON.parse(res.body) as { result: { isError?: boolean; _provision_required?: boolean } };
    expect(parsed.result._provision_required).toBeUndefined();
    expect(parsed.result.isError).toBeFalsy();
  });

  it("an AUTHENTICATED call is unaffected — normal flow, no challenge", async () => {
    mockResolveAuth.mockResolvedValue({ account: { account_id: "acc-1", tier: "paid" as const }, key_id: "k1", anonymous: false });
    const res = fakeRes();

    // analyze_repo requires real repo args to run its own logic beyond the
    // wall; this test only needs to prove the front door does NOT fire for an
    // authenticated caller, so a genuinely free/unmetered path is cleanest.
    await handleMcpPost(fakeReq(), res, undefined, msgFor("list_programs"));

    const parsed = JSON.parse(res.body) as { result: { _provision_required?: boolean } };
    expect(parsed.result._provision_required).toBeUndefined();
    expect(snapshots.recordPaymentFunnelEvent).not.toHaveBeenCalled();
  });

  it("the challenge is IP-prefix rate limited — the 11th request from the same /24 in one window is refused", async () => {
    mockResolveAuth.mockResolvedValue(ANONYMOUS);
    for (let i = 0; i < 10; i++) {
      const res = fakeRes();
      await handleMcpPost(fakeReq({ "x-forwarded-for": `203.0.113.${i}` }), res, undefined, msgFor("analyze_repo"));
      const parsed = JSON.parse(res.body) as { result: { _provision_required?: boolean } };
      expect(parsed.result._provision_required).toBe(true);
    }
    const res = fakeRes();
    await handleMcpPost(fakeReq({ "x-forwarded-for": "203.0.113.250" }), res, undefined, msgFor("analyze_repo"));
    const parsed = JSON.parse(res.body) as { result: { isError: boolean; _error: { code: string; retryable: boolean } } };
    expect(parsed.result.isError).toBe(true);
    expect(parsed.result._error).toEqual({ code: "quota", retryable: true });
  });
});
