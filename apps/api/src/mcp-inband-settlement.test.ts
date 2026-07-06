import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

// H1 — in-band settlement on the MCP tool-call surface. These tests prove the seam
// without a live server or Stripe: the flag gates it, the per-request "settled" marker
// threads through authorize/capture (so a paid call is neither rejected nor double-
// charged), and the shared cash tail (settleOverageCash) behaves like the REST cashier.

// The two dependency modules are mocked so we can drive overage/payment outcomes.
vi.mock("@axis/snapshots", () => ({
  previewUsageCredits: vi.fn(async () => ({ effective_overage_cents: 0 })),
  consumeUsageCredits: vi.fn(async () => ({ effective_overage_cents: 0 })),
  consumeFreeCall: vi.fn(async () => false),
  recordPaidCall: vi.fn(async () => undefined),
  createReferralCode: vi.fn(async () => ({ code: "ref-test" })),
}));
vi.mock("./mpp.js", () => ({
  chargeMpp: vi.fn(async () => null),
  getPricingTier: vi.fn(() => ({ standard_cents: 50, lite_cents: 15 })),
  priceForMode: vi.fn(() => 50),
  resolveAgentMode: vi.fn(() => "standard"),
  build402NegotiationBody: vi.fn(() => ({ error: "payment_required" })),
  parseAgentBudget: vi.fn(() => undefined),
}));

import {
  inbandSettlementEnabled,
  markInbandSettled,
  isInbandSettled,
  authorizeMcpToolCredits,
  captureMcpToolCredits,
} from "./mcp-runtime.js";
import { settleOverageCash } from "./cashier.js";
import * as snapshots from "@axis/snapshots";
import * as mpp from "./mpp.js";

const account = { account_id: "acc-1", tier: "paid" as const };
const fakeReq = () => ({ headers: {} }) as unknown as IncomingMessage;
const res = {} as ServerResponse;

// A preview object that reports an overage (the "would be rejected" case).
const overagePreview = {
  effective_overage_cents: 50,
  credits_required: 1,
  included_credits_applied: 0,
  overage_credits: 1,
  plan_id: "pro",
  monthly_allowance: 100,
  included_credits_used: 100,
  included_credits_remaining: 0,
  overage_credits_this_month: 1,
};

beforeEach(() => {
  vi.clearAllMocks(); // reset call history…
  // …then re-establish default implementations (clearAllMocks does NOT reset these).
  vi.mocked(snapshots.previewUsageCredits).mockResolvedValue({ effective_overage_cents: 0 } as never);
  vi.mocked(snapshots.consumeUsageCredits).mockResolvedValue({ effective_overage_cents: 0 } as never);
  vi.mocked(snapshots.consumeFreeCall).mockResolvedValue(false);
  vi.mocked(snapshots.recordPaidCall).mockResolvedValue(undefined as never);
  vi.mocked(snapshots.createReferralCode).mockResolvedValue({ code: "ref-test" } as never);
  vi.mocked(mpp.chargeMpp).mockResolvedValue(null);
});
afterEach(() => {
  delete process.env.AXIS_MCP_INBAND_SETTLEMENT;
});

describe("H1 feature flag", () => {
  it("defaults OFF when the env var is unset", () => {
    expect(inbandSettlementEnabled()).toBe(false);
  });
  it("enables on 'true' or '1', stays off otherwise", () => {
    process.env.AXIS_MCP_INBAND_SETTLEMENT = "true";
    expect(inbandSettlementEnabled()).toBe(true);
    process.env.AXIS_MCP_INBAND_SETTLEMENT = "1";
    expect(inbandSettlementEnabled()).toBe(true);
    process.env.AXIS_MCP_INBAND_SETTLEMENT = "false";
    expect(inbandSettlementEnabled()).toBe(false);
  });
});

describe("H1 settled marker (per-request, no signature threading)", () => {
  it("is scoped to the exact request object", () => {
    const a = fakeReq();
    const b = fakeReq();
    expect(isInbandSettled(a)).toBe(false);
    markInbandSettled(a);
    expect(isInbandSettled(a)).toBe(true);
    expect(isInbandSettled(b)).toBe(false); // a different request is untouched
  });
});

describe("authorizeMcpToolCredits honors the in-band marker", () => {
  beforeEach(() => {
    vi.mocked(snapshots.previewUsageCredits).mockResolvedValue(overagePreview as never);
  });

  it("overage + settled request -> returns a settled charge, does NOT throw", async () => {
    const req = fakeReq();
    markInbandSettled(req); // gate already collected the cash
    const charge = await authorizeMcpToolCredits(req, account, "analyze_repo");
    expect(charge.tool).toBe("analyze_repo");
    expect(charge.settled).toBe(true);
  });

  it("overage + un-settled request -> still throws 402 (unchanged behavior)", async () => {
    const req = fakeReq();
    await expect(
      authorizeMcpToolCredits(req, account, "analyze_repo"),
    ).rejects.toThrow();
  });
});

describe("captureMcpToolCredits never double-charges a settled call", () => {
  it("settled charge -> plan credits are NOT debited", async () => {
    await captureMcpToolCredits(account, { tool: "analyze_repo", amountCents: 50, settled: true });
    expect(snapshots.consumeUsageCredits).not.toHaveBeenCalled();
  });
  it("normal charge -> plan credits ARE debited", async () => {
    await captureMcpToolCredits(account, { tool: "analyze_repo", amountCents: 50 });
    expect(snapshots.consumeUsageCredits).toHaveBeenCalledOnce();
  });
});

describe("settleOverageCash — the shared cash tail", () => {
  const opts = { currency: "usd", decimals: 2 };

  it("nothing owed (overage <= 0) -> 200, never touches the rail", async () => {
    const r = await settleOverageCash(fakeReq(), res, "acc-1", 0, opts);
    expect(r).toEqual({ status: 200 });
    expect(mpp.chargeMpp).not.toHaveBeenCalled();
  });

  it("5th-call-free consumed -> 200, never touches the rail", async () => {
    vi.mocked(snapshots.consumeFreeCall).mockResolvedValue(true);
    const r = await settleOverageCash(fakeReq(), res, "acc-1", 50, opts);
    expect(r).toEqual({ status: 200 });
    expect(mpp.chargeMpp).not.toHaveBeenCalled();
  });

  it("cash paid (chargeMpp 200) -> 200 and the paid call is recorded", async () => {
    vi.mocked(mpp.chargeMpp).mockResolvedValue({ status: 200 } as never);
    const r = await settleOverageCash(fakeReq(), res, "acc-1", 50, opts);
    expect(r).toEqual({ status: 200 });
    expect(snapshots.recordPaidCall).toHaveBeenCalledWith("acc-1");
  });

  it("challenge issued (chargeMpp 402) -> 402 and NO paid-call record", async () => {
    vi.mocked(mpp.chargeMpp).mockResolvedValue({ status: 402 } as never);
    const r = await settleOverageCash(fakeReq(), res, "acc-1", 50, opts);
    expect(r).toEqual({ status: 402 });
    expect(snapshots.recordPaidCall).not.toHaveBeenCalled();
  });

  it("MPP not configured (chargeMpp null) -> null (caller falls back)", async () => {
    vi.mocked(mpp.chargeMpp).mockResolvedValue(null);
    const r = await settleOverageCash(fakeReq(), res, "acc-1", 50, opts);
    expect(r).toBeNull();
    expect(snapshots.recordPaidCall).not.toHaveBeenCalled();
  });
});
