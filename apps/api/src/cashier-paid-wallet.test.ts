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
  recordPaymentFunnelEvent: vi.fn(async () => undefined),
  recordCompensationOwed: vi.fn(async (input: Record<string, unknown>) => ({
    entry_id: "comp-test-1",
    status: "owed",
    attempts: 0,
    currency: "usd",
    receipt_ref: null,
    created_at: new Date().toISOString(),
    resolved_at: null,
    ...input,
  })),
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

// Every existing test in this suite exercises the wallet mechanism itself
// against account "acc-1" — the MTL structural guard (isOwnerEntityAccount,
// cashier.ts) now requires that account to be explicitly allowlisted as an
// owner-entity account, or the wallet rail refuses it regardless of mode.
// "acc-third-party-refusal" below is the one account deliberately left OFF
// this allowlist, to prove the refusal.
const PAID_ENV = {
  PAID_API_BASE_URL: "https://paid.test/v1",
  PAID_MERCHANT_ID: "merchant-1",
  PAID_API_KEY: "sk_test",
  PAID_WALLET_OWNER_ACCOUNT_IDS: "acc-1",
};

const PAID_ENV_KEYS = [
  "PAID_WALLET_MODE",
  "PAID_API_BASE_URL",
  "PAID_API_URL",
  "PAID_BASE_URL",
  "PAID_MERCHANT_ID",
  "PAID_ACCOUNT_ID",
  "PAID_API_KEY",
  "PAID_WALLET_OWNER_ACCOUNT_IDS",
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
    // x402 onboarding Phase 0: the insufficient-credits 402 is still a real
    // challenge written to the agent — it must count toward the funnel.
    expect(snapshots.recordPaymentFunnelEvent).toHaveBeenCalledWith({
      account_id: "acc-1",
      tool: "analyze_repo",
      kind: "challenge",
    });
  });
});

describe("enforce mode — ambiguous PAI'D errors (H0.2/H2.3): never fall through to a second rail", () => {
  it("a non-402 wallet error (e.g. a 500) does NOT call chargeMpp — it fails closed with one compensation row", async () => {
    Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "enforce" });
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" } as unknown as Response);

    const { res, getStatus, getBody } = makeRes();
    const result = await settleOverageCash(fakeReq(), res, "acc-1", 150, OPTS);

    // The old bug: this fell through to chargeMpp, so a wallet debit that may
    // have actually landed on PAI'D's side got charged a SECOND time via mppx.
    expect(mpp.chargeMpp).not.toHaveBeenCalled();
    expect(snapshots.recordPaidCall).not.toHaveBeenCalled();
    expect(snapshots.recordSettledPayment).not.toHaveBeenCalled();

    expect(snapshots.recordCompensationOwed).toHaveBeenCalledTimes(1);
    expect(snapshots.recordCompensationOwed).toHaveBeenCalledWith({
      account_id: "acc-1",
      tool: "analyze_repo",
      amount_cents: 150,
      reason: "wallet_rail_ambiguous",
    });

    expect(result).toEqual({ status: 402 });
    expect(getStatus()).toBe(402);
    const body = getBody();
    expect(body?.error).toBe("wallet_settlement_unconfirmed");
    expect(body?.compensation_entry_id).toBe("comp-test-1");
    expect(body?.topup_url).toBe("/v1/credits/topup");
    // x402 onboarding Phase 0: still a real 402 written to the agent.
    expect(snapshots.recordPaymentFunnelEvent).toHaveBeenCalledWith({
      account_id: "acc-1",
      tool: "analyze_repo",
      kind: "challenge",
    });
  });

  it("a timed-out debit (PaidError 504) is the same ambiguous case — zero mpp charges, one ledger row", async () => {
    Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "enforce" });
    fetchSpy.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));

    const { res } = makeRes();
    const result = await settleOverageCash(fakeReq(), res, "acc-1", 150, OPTS);

    expect(mpp.chargeMpp).not.toHaveBeenCalled();
    expect(snapshots.recordCompensationOwed).toHaveBeenCalledTimes(1);
    expect(snapshots.recordCompensationOwed).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "wallet_rail_ambiguous", amount_cents: 150 }),
    );
    expect(result).toEqual({ status: 402 });
  });

  it("falls back to chargeMpp when PAI'D is not configured at all (wallet mode enforce, no PAID_* env) — no debit was ever attempted, so nothing is ambiguous", async () => {
    process.env.PAID_WALLET_MODE = "enforce"; // no PAID_API_BASE_URL/MERCHANT_ID/API_KEY set
    const { res } = makeRes();
    await settleOverageCash(fakeReq(), res, "acc-1", 150, OPTS);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mpp.chargeMpp).toHaveBeenCalledTimes(1);
    expect(snapshots.recordCompensationOwed).not.toHaveBeenCalled();
  });
});

describe("enforce mode — DEFINITE non-debit rejections (H2.6, WAVE-0 finding #3): never mint free compensation credit", () => {
  it.each([400, 401, 403, 404, 422, 429])(
    "a real %i from PAI'D falls through to chargeMpp — no compensation row, because zero debit could have happened",
    async (status) => {
      Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "enforce" });
      fetchSpy.mockResolvedValueOnce({ ok: false, status, text: async () => "rejected" } as unknown as Response);

      const { res } = makeRes();
      await settleOverageCash(fakeReq(), res, "acc-1", 150, OPTS);

      // The bug this closes: treating this identically to a timeout minted a
      // real compensation credit for a call that provably never cost the
      // customer anything — free-credit farming via malformed requests.
      expect(snapshots.recordCompensationOwed).not.toHaveBeenCalled();
      expect(mpp.chargeMpp).toHaveBeenCalledTimes(1); // safe: nothing was debited
      expect(snapshots.recordPaidCall).not.toHaveBeenCalled();
    },
  );

  it("a real 5xx from PAI'D (distinct from a definite 4xx) stays genuinely ambiguous — still records compensation, still refuses to fall through", async () => {
    Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "enforce" });
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 503, text: async () => "PAI'D internal error" } as unknown as Response);

    const { res } = makeRes();
    const result = await settleOverageCash(fakeReq(), res, "acc-1", 150, OPTS);

    expect(mpp.chargeMpp).not.toHaveBeenCalled();
    expect(snapshots.recordCompensationOwed).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 402 });
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
    await expect(settleOverageViaPaidWallet(fakeReq(), res, "acc-1", 150, OPTS, "read")).resolves.toBeNull();
    await expect(settleOverageViaPaidWallet(fakeReq(), res, "acc-1", 150, OPTS, "shadow")).resolves.toBeNull();
  });
});

// ─── MTL structural guard: the FC stored-value rail is owner-entity-only ──
// (isOwnerEntityAccount, cashier.ts) — see [[paid-mtl-risk-finding]]. A
// PAID-held prepaid balance for a third-party account is exactly the custody
// pattern that makes this rail an MTL question; the guard must refuse it
// regardless of PAID_WALLET_MODE, with zero calls to debitPaidWallet (i.e.
// zero network calls at all — the guard fires before any fetch).

describe("MTL guard — non-owner-entity accounts never reach the FC wallet rail", () => {
  const NON_OWNER = "acc-third-party-refusal";

  it("enforce mode: refuses a non-allowlisted account with ZERO network calls, falls through to mppx", async () => {
    Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "enforce" });
    fetchSpy.mockResolvedValueOnce(debitOkResponse(58, 2)); // would succeed IF called — proves refusal isn't accidental
    const { res } = makeRes();

    const result = await settleOverageCash(fakeReq(), res, NON_OWNER, 150, OPTS);

    expect(fetchSpy).not.toHaveBeenCalled();
    // Fell through to mppx-direct, exactly as mode="off" would; chargeMpp is
    // mocked to resolve null ("MPP not configured"), which is settleOverageCash's
    // own documented "null" outcome — the important assertion is WHICH rail
    // was consulted (mppx, via the mock below), not this particular mock's value.
    expect(mpp.chargeMpp).toHaveBeenCalledOnce();
    expect(result).toBeNull();
  });

  it("read mode: also refuses (this rail's diagnostics never even look at a non-owner wallet)", async () => {
    Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "read" });
    fetchSpy.mockResolvedValueOnce(walletResponse());
    const { res } = makeRes();

    await expect(settleOverageViaPaidWallet(fakeReq(), res, NON_OWNER, 150, OPTS, "read")).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shadow mode: also refuses", async () => {
    Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "shadow" });
    const { res } = makeRes();

    await expect(settleOverageViaPaidWallet(fakeReq(), res, NON_OWNER, 150, OPTS, "shadow")).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("an empty/unset allowlist refuses EVERY account, including 'acc-1' — fail-closed default", async () => {
    Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "enforce", PAID_WALLET_OWNER_ACCOUNT_IDS: "" });
    const { res } = makeRes();

    const result = await settleOverageCash(fakeReq(), res, "acc-1", 150, OPTS);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mpp.chargeMpp).toHaveBeenCalledOnce();
    expect(result).toBeNull();
  });

  it("the allowlist supports multiple owner entities (comma-separated)", async () => {
    Object.assign(process.env, PAID_ENV, { PAID_WALLET_MODE: "enforce", PAID_WALLET_OWNER_ACCOUNT_IDS: "y-axis-acc, x-axis-acc ,z-axis-acc" });
    fetchSpy.mockResolvedValueOnce(debitOkResponse(58, 2));
    const { res } = makeRes();

    const result = await settleOverageCash(fakeReq(), res, "x-axis-acc", 150, OPTS);

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: 200 });
  });
});
