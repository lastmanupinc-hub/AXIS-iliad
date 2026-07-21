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
 *
 * H2.6 (red-team fix, WAVE-0 findings #2+#5) — H0.1's "fresh key per
 * invocation" was ITSELF wrong for a genuine CLIENT retry: a bare
 * randomUUID() every time meant a client retry (after our own 15s abort, or
 * after the ambiguous-failure 402 that abort produces) minted a NEW key and
 * became a second real debit on this same rail. When the caller supplies
 * their own Idempotency-Key, the debit key is now derived STABLY from it —
 * same caller key -> same debit key, so a genuine retry can be deduped by
 * PAI'D. No caller key -> still falls back to the H0.1 per-invocation
 * randomUUID() (the residual risk is inherent to opting out of idempotency).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

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

function reqWithKey(idempotencyKey?: string): IncomingMessage {
  return { headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : {} } as unknown as IncomingMessage;
}
const noKeyReq = reqWithKey();

beforeEach(() => {
  vi.mocked(debitPaidWallet).mockClear();
  // MTL structural guard (isOwnerEntityAccount, cashier.ts): these tests exercise
  // the wallet mechanism itself, so the fixture accounts must be explicitly
  // allowlisted, or the guard refuses them before debitPaidWallet is ever called.
  process.env.PAID_WALLET_OWNER_ACCOUNT_IDS = "acc-1,acc-2";
});
afterEach(() => {
  delete process.env.PAID_WALLET_OWNER_ACCOUNT_IDS;
});

function sentKey(callIndex: number): string {
  const call = vi.mocked(debitPaidWallet).mock.calls[callIndex];
  return (call[1] as { idempotencyKey: string }).idempotencyKey;
}

describe("enforce-mode FC debit idempotency (H0.1) — no caller Idempotency-Key", () => {
  it("two distinct calls to the same tool+account carry DIFFERENT idempotency keys", async () => {
    const r1 = await settleOverageViaPaidWallet(noKeyReq, res, "acc-1", 50, OPTS, "enforce");
    const r2 = await settleOverageViaPaidWallet(noKeyReq, res, "acc-1", 50, OPTS, "enforce");
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
    await settleOverageViaPaidWallet(noKeyReq, res, "acc-1", 50, OPTS, "enforce");
    await settleOverageViaPaidWallet(noKeyReq, res, "acc-2", 50, OPTS, "enforce");
    await settleOverageViaPaidWallet(noKeyReq, res, "acc-1", 50, { ...OPTS, meta: { tool: "iliad_web_search" } }, "enforce");
    const keys = [sentKey(0), sentKey(1), sentKey(2)];
    expect(new Set(keys).size).toBe(3);
  });
});

describe("enforce-mode FC debit idempotency (H2.6) — caller supplies an Idempotency-Key", () => {
  it("a genuine client retry (same caller key, same account+tool) reuses the SAME debit key", async () => {
    const req = reqWithKey("client-retry-1");
    await settleOverageViaPaidWallet(req, res, "acc-1", 50, OPTS, "enforce");
    await settleOverageViaPaidWallet(req, res, "acc-1", 50, OPTS, "enforce"); // the client retrying after a timeout
    const k1 = sentKey(0);
    const k2 = sentKey(1);
    expect(k1).toBeTruthy();
    expect(k1).toBe(k2); // SAME key -> PAI'D can dedupe the retry instead of debiting twice
  });

  it("a DIFFERENT caller key for the same account+tool derives a DIFFERENT debit key (genuinely distinct calls stay distinct)", async () => {
    await settleOverageViaPaidWallet(reqWithKey("call-A"), res, "acc-1", 50, OPTS, "enforce");
    await settleOverageViaPaidWallet(reqWithKey("call-B"), res, "acc-1", 50, OPTS, "enforce");
    expect(sentKey(0)).not.toBe(sentKey(1));
  });

  it("the same caller key on a DIFFERENT tool or account derives a DIFFERENT debit key (no cross-scope collision)", async () => {
    const key = "shared-client-key";
    await settleOverageViaPaidWallet(reqWithKey(key), res, "acc-1", 50, OPTS, "enforce");
    await settleOverageViaPaidWallet(reqWithKey(key), res, "acc-1", 50, { ...OPTS, meta: { tool: "iliad_web_search" } }, "enforce");
    await settleOverageViaPaidWallet(reqWithKey(key), res, "acc-2", 50, OPTS, "enforce");
    const keys = [sentKey(0), sentKey(1), sentKey(2)];
    expect(new Set(keys).size).toBe(3);
  });

  it("the derived key never leaks the raw account id or caller key", async () => {
    const req = reqWithKey("super-secret-client-token");
    await settleOverageViaPaidWallet(req, res, "acc-1", 50, OPTS, "enforce");
    const key = sentKey(0);
    expect(key).not.toContain("acc-1");
    expect(key).not.toContain("super-secret-client-token");
    expect(key).toMatch(/^[0-9a-f]{32}$/); // stable HMAC-derived hex, same shape as checkoutIdempotencyKey
  });
});
