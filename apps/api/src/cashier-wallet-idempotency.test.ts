/**
 * H0.1 — wallet-rail idempotency keys are PER CALL, never time-bucketed.
 *
 * The enforce-mode FC debit previously derived its Idempotency-Key from
 * checkoutIdempotencyKey(accountId, "fc-debit:"+tool) — a 120-second bucket
 * designed for human checkout double-submits. On a metered per-call rail that
 * is wrong in both directions:
 *   - two DISTINCT billable calls to the same tool inside one bucket share a
 *     key -> a deduping payment rail silently drops the second debit (free
 *     calls);
 *   - a retry of the SAME logical call after the bucket rolls gets a NEW key
 *     -> double debit.
 * Correct semantics: mint a fresh key per debit invocation (distinct calls
 * are distinct charges); any client-internal retry of that one invocation
 * reuses the key it was handed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServerResponse } from "node:http";

vi.mock("./paid-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./paid-client.js")>();
  return {
    ...actual,
    debitPaidWallet: vi.fn(async () => ({ balance_fc: 100 })),
    getPaidWallet: vi.fn(async () => ({ balance_fc: 100 })),
  };
});

import { settleOverageViaPaidWallet } from "./cashier.js";
import { debitPaidWallet } from "./paid-client.js";

const res = { writeHead: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
const OPTS = { currency: "usd", decimals: 2, description: "test overage", meta: { tool: "analyze_repo" } };

beforeEach(() => {
  vi.mocked(debitPaidWallet).mockClear();
});

function sentKey(callIndex: number): string {
  const call = vi.mocked(debitPaidWallet).mock.calls[callIndex];
  return (call[1] as { idempotencyKey: string }).idempotencyKey;
}

describe("enforce-mode FC debit idempotency (H0.1)", () => {
  it("two distinct calls to the same tool+account carry DIFFERENT idempotency keys", async () => {
    const r1 = await settleOverageViaPaidWallet(res, "acc-1", 50, OPTS, "enforce");
    const r2 = await settleOverageViaPaidWallet(res, "acc-1", 50, OPTS, "enforce");
    expect(r1).toEqual({ status: 200 });
    expect(r2).toEqual({ status: 200 });
    expect(vi.mocked(debitPaidWallet)).toHaveBeenCalledTimes(2);

    const k1 = sentKey(0);
    const k2 = sentKey(1);
    expect(k1).toBeTruthy();
    expect(k2).toBeTruthy();
    // The old bucketed key made these EQUAL within a 120s window — a deduping
    // rail would have dropped the second call's debit entirely.
    expect(k1).not.toBe(k2);
  });

  it("keys are also distinct across accounts and tools (no cross-charge collision)", async () => {
    await settleOverageViaPaidWallet(res, "acc-1", 50, OPTS, "enforce");
    await settleOverageViaPaidWallet(res, "acc-2", 50, OPTS, "enforce");
    await settleOverageViaPaidWallet(res, "acc-1", 50, { ...OPTS, meta: { tool: "iliad_web_search" } }, "enforce");
    const keys = [sentKey(0), sentKey(1), sentKey(2)];
    expect(new Set(keys).size).toBe(3);
  });
});
