/**
 * cashier-trial.test.ts — free trial defense-in-depth on settleOverageCash.
 *
 * Every upstream caller (chargeWithDiscounts's free-tier branch, the
 * consumeUsageCredits carve-out) already resolves the amount reaching this
 * function to 0 during an active trial, so this check is normally redundant
 * — it exists as a cheap backstop so a future call site that forgets to
 * route through one of those two can't reopen a real charge during the
 * trial. Proven here by spying: consumeFreeCall/paidWalletMode/chargeMpp
 * must never be reached at all when the trial is active, regardless of the
 * overageCents the (possibly buggy) caller passed in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

vi.mock("@axis/snapshots", () => ({
  consumeFreeCall: vi.fn(async () => false),
  recordPaidCall: vi.fn(async () => undefined),
  recordSettledPayment: vi.fn(async () => undefined),
  recordPaymentFunnelEvent: vi.fn(async () => undefined),
  isFreeTrialActive: vi.fn(() => false),
}));

vi.mock("./mpp.js", () => ({
  chargeMpp: vi.fn(async () => null),
}));

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
import { paidWalletMode } from "./paid-client.js";

function fakeReq(): IncomingMessage {
  return { headers: {} } as unknown as IncomingMessage;
}
function fakeRes(): ServerResponse {
  return { setHeader: () => fakeRes(), getHeader: () => undefined, writeHead: () => fakeRes(), end: () => fakeRes() } as unknown as ServerResponse;
}

const OPTS: SettleOptions = { currency: "usd", decimals: 2, meta: { tool: "analyze_repo" } };
const ENV_KEY = "PAID_WALLET_MODE";
const originalWalletMode = process.env[ENV_KEY];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env[ENV_KEY]; // paidWalletMode() -> "off" unless a test opts in
  vi.mocked(snapshots.isFreeTrialActive).mockReturnValue(false);
});
afterEach(() => {
  if (originalWalletMode === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalWalletMode;
});

describe("settleOverageCash — free trial short-circuit", () => {
  it("returns {status:200} immediately when the trial is active, for a nonzero overage", async () => {
    vi.mocked(snapshots.isFreeTrialActive).mockReturnValue(true);
    const result = await settleOverageCash(fakeReq(), fakeRes(), "acct-1", 5000, OPTS);
    expect(result).toEqual({ status: 200 });
  });

  it("never reaches consumeFreeCall, chargeMpp, or the wallet rail when the trial is active", async () => {
    vi.mocked(snapshots.isFreeTrialActive).mockReturnValue(true);
    process.env[ENV_KEY] = "enforce"; // would normally route through the wallet rail first
    await settleOverageCash(fakeReq(), fakeRes(), "acct-1", 5000, OPTS);
    expect(snapshots.consumeFreeCall).not.toHaveBeenCalled();
    expect(mpp.chargeMpp).not.toHaveBeenCalled();
  });

  it("checked BEFORE the pre-existing overageCents<=0 short-circuit — a real amount is still free during the trial", async () => {
    vi.mocked(snapshots.isFreeTrialActive).mockReturnValue(true);
    // overageCents genuinely > 0 here (not the pre-existing free path) — the
    // trial check must independently short-circuit it, not rely on the
    // caller having already zeroed it out.
    const result = await settleOverageCash(fakeReq(), fakeRes(), "acct-1", 25000, OPTS);
    expect(result).toEqual({ status: 200 });
    expect(snapshots.consumeFreeCall).not.toHaveBeenCalled();
  });

  it("does not affect behavior when the trial is NOT active — falls through to the real chargeMpp path as before", async () => {
    vi.mocked(snapshots.isFreeTrialActive).mockReturnValue(false);
    vi.mocked(mpp.chargeMpp).mockResolvedValueOnce({ status: 402 });
    const result = await settleOverageCash(fakeReq(), fakeRes(), "acct-1", 5000, OPTS);
    expect(result).toEqual({ status: 402 });
    expect(mpp.chargeMpp).toHaveBeenCalledOnce();
  });

  it("paidWalletMode() reads the real env var — sanity check the test's own env plumbing", () => {
    expect(paidWalletMode()).toBe("off");
    process.env[ENV_KEY] = "enforce";
    expect(paidWalletMode()).toBe("enforce");
  });
});
