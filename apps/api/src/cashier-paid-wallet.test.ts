/**
 * cashier-paid-wallet.test.ts — WO-04 (paid-rail-integration).
 *
 * Proves the PAI'D Fabric-Credit wallet branch inside the shared cash tail
 * (`settleOverageCash` / `settleOverageViaPaidWallet` in cashier.ts) entirely
 * offline: every PAI'D HTTP call is mocked via a `fetch` spy that rejects any
 * un-mocked call (network guard, same pattern as paid-client.test.ts), so this
 * suite proves the WIRING, not a live PAI'D endpoint. No STRIPE_SECRET_KEY, no
 * live PAI'D, no DB.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

// @axis/snapshots: only the two functions cashier.ts actually calls.
vi.mock("@axis/snapshots", () => ({
  consumeFreeCall: vi.fn(async () => false),
  recordPaidCall: vi.fn(async () => undefined),
  recordSettledPayment: vi.fn(async () => undefined),
}));

// ./mpp.js: stand in for the mppx-direct rail — asserted on directly (called /
// not called) by every scenario below.
vi.mock("./mpp.js", () => ({
  chargeMpp: vi.fn(async () => null),
}));

// ./logger.js: keep the real shouldEmitRuntimeLogs etc., replace `log` with a
// spy so shadow/read logging is observable without depending on stdout.
vi.mock("./logger.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./logger.js")>();
  return { ...actual, log: vi.fn() };
});

import { settleOverageCash, settleOverageViaPaidWallet, centsToFabricCredits, type SettleOptions } from "./cashier.js";
import * as snapshots from "@axis/snapshots";
import * as mpp from "./mpp.js";
import { log } from "./logger.js";

const PAID_ENV = {
  PAID_API_BASE_URL: "https://paid.test/v1",
  PAID_MERCHANT_ID: "merchant-1",
  PAID_API_KEY: "sk_test",
};

const PAID_ENV_KEYS = [
  "PAID_WALLET_MODE",
  "PAID_API_BASE_URL",
  "PAID_API_URL",
  "PAID_BASE_URL",
  "PAID_MERCHANT_ID",
  "PAID_ACCOUNT_ID",
  "PAID_API_KEY",
] as const;

function fakeReq(): IncomingMessage {
  return { headers: {} } as unknown as IncomingMessage;
}

/** A minimal ServerResponse double that records writeHead/end so 402 bodies can be asserted. */
function makeRes() {
  let status = 0;
  let headers: Record<string, unknown> = {};
  let body = "";
  const res = {
    writeHead(code: number, hdrs?: Record<string, unknown>) {
      status = code;
      if (hdrs) headers = { ...headers, ...hdrs };
      return res;
    },
    end(chunk?: string) {
      if (chunk) body = chunk;
      return res;
    },
  } as unknown as ServerResponse;
  return {
    res,
    getStatus: () => status,
    getHeaders: () => headers,
    getBody: () => (body ? (JSON.parse(body) as Record<string, unknown>) : undefined),
  };
}

function walletResponse(overrides: Partial<Record<string, unknown>> = {}): Response {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        wallet_id: "w1",
        developer_id: "acc-1",
        balance_fc: 60,
        lifetime_fc: 60,
        tier: "free",
        status: "active",
        ...overrides,
      }),
  } as unknown as Response;
}

function debitOkResponse(balanceFc: number, amountFc: number): Response {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        wallet_id: "w1",
        balance_fc: balanceFc,
        transaction: {
          transaction_id: "tx1",
          wallet_id: "w1",
          amount_fc: amountFc,
          direction: "debit",
          reason: "AXIS per-call overage",
          reference_type: "iliad_agentic",
          reference_id: "analyze_repo",
          balance_after: balanceFc,
          created_at: new Date().toISOString(),
        },
      }),
  } as unknown as Response;
}

function insufficientResponse(balanceFc: number, requiredFc: number): Response {
  return {
    ok: false,
    status: 402,
    text: async () =>
      JSON.stringify({
        error: "insufficient_credits",
        balance_fc: balanceFc,
        required_fc: requiredFc,
        shortfall_fc: requiredFc - balanceFc,
      }),
  } as unknown as Response;
}

const OPTS: SettleOptions = { currency: "usd", decimals: 2, meta: { tool: "analyze_repo" } };

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(snapshots.consumeFreeCall).mockResolvedValue(false);
  vi.mocked(snapshots.recordPaidCall).mockResolvedValue(undefined as never);
  vi.mocked(mpp.chargeMpp).mockResolvedValue(null);
  // Network guard: every fetch must be explicitly mocked per test.
  fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network call — fetch must be mocked in tests"));
});

afterEach(() => {
  fetchSpy.mockRestore();
  for (const k of PAID_ENV_KEYS) delete process.env[k];
});

// ─── centsToFabricCredits ────────────────────────────────────────

describe("centsToFabricCredits", () => {
  it("$1 = 1 FC; sub-dollar overages round UP to 1 FC; non-positive cents -> 0", () => {
    expect(centsToFabricCredits(50)).toBe(1);
    expect(centsToFabricCredits(100)).toBe(1);
    expect(centsToFabricCredits(150)).toBe(2);
    expect(centsToFabricCredits(0)).toBe(0);
    expect(centsToFabricCredits(-10)).toBe(0);
  });
});

// ─── FLAG-OFF INVARIANT ──────────────────────────────────────────

describe("flag-off invariant — settleOverageCash is byte-for-byte the pre-change mppx path", () => {
  it.each([undefined, "off", "bogus"])("PAID_WALLET_MODE=%s: no wallet fetch, chargeMpp called exactly as before", async (mode) => {
    Object.assign(process.env, PAID_ENV);
    if (mode === undefined) delete process.env.PAID_WALLET_MODE;
    else process.env.PAID_WALLET_MODE = mode;

    const { res } = makeRes();
    const result = await settleOverageCash(fakeReq(), res, "acc-1", 150, OPTS);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mpp.chargeMpp).toHaveBeenCalledTimes(1);
    expect(mpp.chargeMpp).toHaveBeenCalledWith(expect.anything(), res, { ...OPTS, amount: "150" });
    expect(result).toBeNull(); // chargeMpp mock resolves null (MPP not configured) — unchanged behaviour
  });

  it("also applies when PAI'D env is fully configured but the flag is off", async () => {
    Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "off" });
    const { res } = makeRes();
    await settleOverageCash(fakeReq(), res, "acc-1", 150, OPTS);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mpp.chargeMpp).toHaveBeenCalledTimes(1);
  });
});

// ─── READ ─────────────────────────────────────────────────────────

describe("read mode", () => {
  it("reads the wallet balance once, debits nothing, still settles via chargeMpp", async () => {
    Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "read" });
    fetchSpy.mockResolvedValueOnce(walletResponse({ balance_fc: 42 }));

    const { res } = makeRes();
    const result = await settleOverageCash(fakeReq(), res, "acc-1", 150, OPTS);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://paid.test/v1/trust-fabric/billing/wallet/acc-1");
    expect((init as RequestInit).method).toBe("GET");
    expect(mpp.chargeMpp).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });
});

// ─── SHADOW ───────────────────────────────────────────────────────

describe("shadow mode", () => {
  it("never debits, logs the would-be FC debit (overageCents + amountFc), and still calls chargeMpp", async () => {
    Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "shadow" });

    const { res } = makeRes();
    const result = await settleOverageCash(fakeReq(), res, "acc-1", 150, OPTS);

    expect(fetchSpy).not.toHaveBeenCalled(); // no debit, no wallet read
    expect(mpp.chargeMpp).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ overageCents: 150, amountFc: 2 }),
    );
    expect(result).toBeNull();
  });
});

// ─── ENFORCE ──────────────────────────────────────────────────────

describe("enforce mode — sufficient balance", () => {
  it("debits the wallet exactly once, skips chargeMpp, records the paid call, returns 200", async () => {
    Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "enforce" });
    fetchSpy.mockResolvedValueOnce(debitOkResponse(58, 2));

    const { res } = makeRes();
    const result = await settleOverageCash(fakeReq(), res, "acc-1", 150, OPTS);

    expect(result).toEqual({ status: 200 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://paid.test/v1/trust-fabric/billing/wallet/acc-1/debit");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.amount_fc).toBe(centsToFabricCredits(150));
    expect(body.product_code).toBe("iliad_agentic_call");
    expect(body.reference_type).toBe("iliad_agentic");
    expect(body.reference_id).toBe(OPTS.meta!.tool);
    expect((init as RequestInit).headers).toMatchObject({ "Idempotency-Key": expect.any(String) });

    expect(mpp.chargeMpp).not.toHaveBeenCalled();
    expect(snapshots.recordPaidCall).toHaveBeenCalledWith("acc-1");
    // H0.3: a wallet debit IS settled cash — the receipt lands on the paid_fc rail.
    expect(snapshots.recordSettledPayment).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: "acc-1", amount_cents: 150, provider: "paid_fc" }),
    );
  });
});

describe("enforce mode — insufficient balance", () => {
  it("writes a 402 top-up challenge to res, does NOT call chargeMpp, does NOT record a paid call", async () => {
    Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "enforce" });
    fetchSpy.mockResolvedValueOnce(insufficientResponse(1, 2));

    const { res, getStatus, getBody } = makeRes();
    const result = await settleOverageCash(fakeReq(), res, "acc-1", 150, OPTS);

    expect(result).toEqual({ status: 402 });
    expect(getStatus()).toBe(402);
    const body = getBody();
    expect(body?.error).toBe("insufficient_credits");
    expect(body?.topup_url).toBe("/v1/credits/topup");
    expect(body?.balance_fc).toBe(1);
    expect(body?.shortfall_fc).toBe(1);

    expect(mpp.chargeMpp).not.toHaveBeenCalled();
    expect(snapshots.recordPaidCall).not.toHaveBeenCalled();
    expect(snapshots.recordSettledPayment).not.toHaveBeenCalled();
  });
});

describe("enforce mode — PAI'D errors that are NOT an economic 402", () => {
  it("falls back to chargeMpp instead of failing the whole request", async () => {
    Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "enforce" });
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" } as unknown as Response);

    const { res } = makeRes();
    await settleOverageCash(fakeReq(), res, "acc-1", 150, OPTS);

    expect(mpp.chargeMpp).toHaveBeenCalledTimes(1);
    expect(snapshots.recordPaidCall).not.toHaveBeenCalled();
  });

  it("falls back to chargeMpp when PAI'D is not configured (wallet mode enforce, no PAID_* env)", async () => {
    process.env.PAID_WALLET_MODE = "enforce"; // no PAID_API_BASE_URL/MERCHANT_ID/API_KEY set
    const { res } = makeRes();
    await settleOverageCash(fakeReq(), res, "acc-1", 150, OPTS);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mpp.chargeMpp).toHaveBeenCalledTimes(1);
  });
});

// ─── Ordering: free-call / no-overage short-circuits precede the wallet branch ──

describe("existing short-circuits still run BEFORE the wallet branch, even in enforce mode", () => {
  it("overageCents <= 0 never touches the wallet", async () => {
    Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "enforce" });
    const { res } = makeRes();
    const result = await settleOverageCash(fakeReq(), res, "acc-1", 0, OPTS);
    expect(result).toEqual({ status: 200 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("5th-call-free consumed never touches the wallet", async () => {
    Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "enforce" });
    vi.mocked(snapshots.consumeFreeCall).mockResolvedValueOnce(true);
    const { res } = makeRes();
    const result = await settleOverageCash(fakeReq(), res, "acc-1", 150, OPTS);
    expect(result).toEqual({ status: 200 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ─── settleOverageViaPaidWallet (direct) ─────────────────────────

describe("settleOverageViaPaidWallet — direct", () => {
  it("read and shadow both return null (never write to res, caller falls through)", async () => {
    Object.assign(process.env, PAID_ENV);
    fetchSpy.mockResolvedValueOnce(walletResponse());
    const { res } = makeRes();
    await expect(settleOverageViaPaidWallet(res, "acc-1", 150, OPTS, "read")).resolves.toBeNull();
    await expect(settleOverageViaPaidWallet(res, "acc-1", 150, OPTS, "shadow")).resolves.toBeNull();
  });
});
