/**
 * cashier-settled-payment.test.ts — WO-19 (revenue-mrr-tracker).
 *
 * Proves the wiring the acceptance criteria calls out directly: a `settleOverageCash`
 * call that resolves to `chargeMpp` returning `{status: 200}` persists a
 * `payment_receipts` row via `recordSettledPayment`, decoded from the real mppx
 * `Payment-Receipt` header format (not a stand-in). Everything else (mppx itself,
 * `@axis/snapshots`) is mocked/offline — no live Stripe/Tempo, no DB.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Receipt } from "mppx";

vi.mock("@axis/snapshots", () => ({
  consumeFreeCall: vi.fn(async () => false),
  recordPaidCall: vi.fn(async () => undefined),
  recordSettledPayment: vi.fn(async () => undefined),
  recordPaymentFunnelEvent: vi.fn(async () => undefined),
}));

vi.mock("./mpp.js", () => ({
  chargeMpp: vi.fn(async () => null),
}));

// H0.3: the wallet-rail tests below drive the enforce path — mock only the two
// paid-client functions that would read live config / hit the network.
// paidWalletMode stays REAL (env-driven), so the pre-existing mppx-path tests
// (no PAID_WALLET_MODE set -> "off") are untouched.
vi.mock("./paid-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./paid-client.js")>();
  return {
    ...actual,
    isPaidConfigured: vi.fn(() => true),
    debitPaidWallet: vi.fn(async () => ({ balance_fc: 100 })),
  };
});

import { settleOverageCash, type SettleOptions } from "./cashier.js";
import * as snapshots from "@axis/snapshots";
import * as mpp from "./mpp.js";

function fakeReq(): IncomingMessage {
  return { headers: {} } as unknown as IncomingMessage;
}

/** A `ServerResponse` double that actually stores headers (setHeader/getHeader/writeHead). */
function makeRes() {
  const headers: Record<string, unknown> = {};
  let status = 0;
  let body = "";
  const res = {
    setHeader(name: string, value: unknown) {
      headers[name.toLowerCase()] = value;
      return res;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    writeHead(code: number, hdrsOrMsg?: unknown, maybeHdrs?: Record<string, unknown>) {
      status = code;
      const hdrs = (typeof hdrsOrMsg === "object" ? hdrsOrMsg : maybeHdrs) as Record<string, unknown> | undefined;
      if (hdrs) for (const [k, v] of Object.entries(hdrs)) headers[k.toLowerCase()] = v;
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

/** Simulates what mppx's real chargeMpp does on a 200: sets the Payment-Receipt header on res. */
function mockChargeMppSuccess(res: ServerResponse, method: "stripe" | "tempo", reference: string) {
  vi.mocked(mpp.chargeMpp).mockImplementationOnce(async (_req, r) => {
    const receipt = Receipt.serialize(
      Receipt.from({ method, reference, status: "success", timestamp: new Date().toISOString() }),
    );
    r.setHeader("Payment-Receipt", receipt);
    return { status: 200 };
  });
}

const OPTS: SettleOptions = { currency: "usd", decimals: 2, meta: { tool: "analyze_repo" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(snapshots.consumeFreeCall).mockResolvedValue(false);
  vi.mocked(snapshots.recordPaidCall).mockResolvedValue(undefined as never);
  vi.mocked(snapshots.recordSettledPayment).mockResolvedValue(undefined as never);
  vi.mocked(snapshots.recordPaymentFunnelEvent).mockResolvedValue(undefined as never);
});

describe("settleOverageCash -> recordSettledPayment (H1 cash settlement persistence)", () => {
  it("chargeMpp 200 with a Stripe Payment-Receipt persists a settled payment with the decoded provider + reference", async () => {
    const { res } = makeRes();
    mockChargeMppSuccess(res, "stripe", "ch_test_123");

    const result = await settleOverageCash(fakeReq(), res, "acc-1", 150, OPTS);

    expect(result).toEqual({ status: 200 });
    expect(snapshots.recordPaidCall).toHaveBeenCalledWith("acc-1");
    expect(snapshots.recordSettledPayment).toHaveBeenCalledTimes(1);
    expect(snapshots.recordSettledPayment).toHaveBeenCalledWith({
      account_id: "acc-1",
      tool: "analyze_repo",
      amount_cents: 150,
      currency: "usd",
      provider: "stripe",
      external_receipt: "ch_test_123",
    });
  });

  it("chargeMpp 200 with a Tempo Payment-Receipt records provider 'tempo'", async () => {
    const { res } = makeRes();
    mockChargeMppSuccess(res, "tempo", "0xdeadbeef");

    await settleOverageCash(fakeReq(), res, "acc-2", 75, OPTS);

    expect(snapshots.recordSettledPayment).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: "acc-2", provider: "tempo", external_receipt: "0xdeadbeef" }),
    );
  });

  it("defaults tool to 'default' when opts.meta.tool is absent", async () => {
    const { res } = makeRes();
    mockChargeMppSuccess(res, "stripe", "ch_notool");

    await settleOverageCash(fakeReq(), res, "acc-3", 10, { currency: "usd", decimals: 2 });

    expect(snapshots.recordSettledPayment).toHaveBeenCalledWith(expect.objectContaining({ tool: "default" }));
  });

  it("a missing/malformed Payment-Receipt header still records a settled payment (defaults to stripe, no external_receipt)", async () => {
    const { res } = makeRes();
    vi.mocked(mpp.chargeMpp).mockResolvedValueOnce({ status: 200 }); // no header set at all

    await settleOverageCash(fakeReq(), res, "acc-4", 20, OPTS);

    expect(snapshots.recordSettledPayment).toHaveBeenCalledWith({
      account_id: "acc-4",
      tool: "analyze_repo",
      amount_cents: 20,
      currency: "usd",
      provider: "stripe",
      external_receipt: undefined,
    });
  });

  it("chargeMpp 402 does NOT record a settled payment, but DOES record an x402 challenge event (x402 onboarding Phase 0)", async () => {
    const { res } = makeRes();
    vi.mocked(mpp.chargeMpp).mockResolvedValueOnce({ status: 402 });

    const result = await settleOverageCash(fakeReq(), res, "acc-5", 150, OPTS);

    expect(result).toEqual({ status: 402 });
    expect(snapshots.recordSettledPayment).not.toHaveBeenCalled();
    expect(snapshots.recordPaidCall).not.toHaveBeenCalled();
    expect(snapshots.recordPaymentFunnelEvent).toHaveBeenCalledWith({
      account_id: "acc-5",
      tool: "analyze_repo",
      kind: "challenge",
    });
  });

  it("a funnel-event recording failure never breaks the 402 response (best-effort telemetry)", async () => {
    const { res } = makeRes();
    vi.mocked(mpp.chargeMpp).mockResolvedValueOnce({ status: 402 });
    vi.mocked(snapshots.recordPaymentFunnelEvent).mockRejectedValueOnce(new Error("db down"));

    const result = await settleOverageCash(fakeReq(), res, "acc-5b", 150, OPTS);

    expect(result).toEqual({ status: 402 });
  });

  it("chargeMpp null (MPP not configured) does NOT record a settled payment", async () => {
    const { res } = makeRes();
    vi.mocked(mpp.chargeMpp).mockResolvedValueOnce(null);

    const result = await settleOverageCash(fakeReq(), res, "acc-6", 150, OPTS);

    expect(result).toBeNull();
    expect(snapshots.recordSettledPayment).not.toHaveBeenCalled();
  });

  it("overageCents <= 0 never touches recordSettledPayment", async () => {
    const { res } = makeRes();
    const result = await settleOverageCash(fakeReq(), res, "acc-7", 0, OPTS);
    expect(result).toEqual({ status: 200 });
    expect(mpp.chargeMpp).not.toHaveBeenCalled();
    expect(snapshots.recordSettledPayment).not.toHaveBeenCalled();
  });

  it("a 5th-call-free consumption never touches recordSettledPayment", async () => {
    vi.mocked(snapshots.consumeFreeCall).mockResolvedValueOnce(true);
    const { res } = makeRes();
    const result = await settleOverageCash(fakeReq(), res, "acc-8", 150, OPTS);
    expect(result).toEqual({ status: 200 });
    expect(mpp.chargeMpp).not.toHaveBeenCalled();
    expect(snapshots.recordSettledPayment).not.toHaveBeenCalled();
  });
});

// ─── H0.3: enforce-mode wallet revenue must reach payment_receipts ──────────────
//
// A successful FC-wallet debit IS settled cash (PAI'D -> its Stripe -> founder
// settlement), but the enforce branch previously recorded only recordPaidCall —
// WO-19's settled-revenue tracker was blind to the entire wallet rail.
describe("settleOverageCash: enforce-mode wallet success records a paid_fc receipt (H0.3)", () => {
  beforeEach(() => {
    process.env.PAID_WALLET_MODE = "enforce";
  });
  afterEach(() => {
    delete process.env.PAID_WALLET_MODE;
  });

  it("wallet debit success persists a settled payment with provider 'paid_fc'", async () => {
    const { res } = makeRes();

    const result = await settleOverageCash(fakeReq(), res, "acc-9", 150, OPTS);

    expect(result).toEqual({ status: 200 });
    expect(mpp.chargeMpp).not.toHaveBeenCalled(); // wallet settled it — mppx never ran
    expect(snapshots.recordPaidCall).toHaveBeenCalledWith("acc-9");
    expect(snapshots.recordSettledPayment).toHaveBeenCalledTimes(1);
    expect(snapshots.recordSettledPayment).toHaveBeenCalledWith({
      account_id: "acc-9",
      tool: "analyze_repo",
      amount_cents: 150,
      currency: "usd",
      provider: "paid_fc",
      external_receipt: undefined,
    });
  });

  it("wallet 402 (insufficient credits) does NOT record a settled payment", async () => {
    const paidClient = await import("./paid-client.js");
    vi.mocked(paidClient.debitPaidWallet).mockRejectedValueOnce(
      new paidClient.PaidError(
        "insufficient credits",
        402,
        JSON.stringify({ error: "insufficient_credits", balance_fc: 0, required_fc: 2, shortfall_fc: 2 }),
      ),
    );
    const { res } = makeRes();

    const result = await settleOverageCash(fakeReq(), res, "acc-10", 150, OPTS);

    expect(result).toEqual({ status: 402 });
    expect(snapshots.recordSettledPayment).not.toHaveBeenCalled();
    expect(snapshots.recordPaidCall).not.toHaveBeenCalled();
    expect(snapshots.recordPaymentFunnelEvent).toHaveBeenCalledWith({
      account_id: "acc-10",
      tool: "analyze_repo",
      kind: "challenge",
    });
  });
});
