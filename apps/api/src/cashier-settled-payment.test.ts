/**
 * cashier-settled-payment.test.ts — WO-19 (revenue-mrr-tracker).
 *
 * Proves the wiring the acceptance criteria calls out directly: a `settleOverageCash`
 * call that resolves to `chargeMpp` returning `{status: 200}` persists a
 * `payment_receipts` row via `recordSettledPayment`, decoded from the real mppx
 * `Payment-Receipt` header format (not a stand-in). Everything else (mppx itself,
 * `@axis/snapshots`) is mocked/offline — no live Stripe/Tempo, no DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Receipt } from "mppx";

vi.mock("@axis/snapshots", () => ({
  consumeFreeCall: vi.fn(async () => false),
  recordPaidCall: vi.fn(async () => undefined),
  recordSettledPayment: vi.fn(async () => undefined),
}));

vi.mock("./mpp.js", () => ({
  chargeMpp: vi.fn(async () => null),
}));

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

  it("chargeMpp 402 does NOT record a settled payment", async () => {
    const { res } = makeRes();
    vi.mocked(mpp.chargeMpp).mockResolvedValueOnce({ status: 402 });

    const result = await settleOverageCash(fakeReq(), res, "acc-5", 150, OPTS);

    expect(result).toEqual({ status: 402 });
    expect(snapshots.recordSettledPayment).not.toHaveBeenCalled();
    expect(snapshots.recordPaidCall).not.toHaveBeenCalled();
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
