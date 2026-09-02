/**
 * paid-live-canary.e2e.test.ts — gated end-to-end proof against REAL, LIVE
 * PAI'D (H8.4).
 *
 * Answers the open question `@axis/paid-client`'s own code carries in two
 * places (index.ts:154-156, index.ts:209): does PAI'D's HTTP layer actually
 * honor a caller-supplied `Idempotency-Key`, or does a retried/duplicated
 * request execute twice? No fixture or mock can answer that by construction
 * — it can only be observed by making the same real request twice against
 * the real server and diffing the result.
 *
 * SAFETY — read before ever running this with real credentials:
 *   - `api.trustfabric.ai` is PAI'D's PRODUCTION endpoint. There is no
 *     PAI'D sandbox/test-mode in this client (grepped: no PAID_TEST_* var,
 *     no dry-run flag) — this canary is, by construction, a live write
 *     against real infrastructure using the real merchant credentials.
 *   - Test 1 (checkout-session idempotency) is ZERO financial risk by
 *     construction: creating a hosted-checkout SESSION never itself moves
 *     money — a human would have to separately open the returned URL and
 *     complete payment, which this test never does. Worst case: one or two
 *     abandoned "open" session rows on PAI'D's side.
 *   - Test 2 (wallet-debit idempotency) is LOW risk, not zero: per
 *     docs/MCP_PAID_ACCESS_DESIGN.md, a wallet debit does not itself select
 *     or move money across a payment rail (Stripe / Plaid / Circle), so no
 *     card is ever charged and "FC" here is not realized money. It DOES
 *     write one real, permanent transaction row into PAI'D's live
 *     production database — IF the wallet exists (see 2026-07-21 finding
 *     below; today it usually does not for a fresh id).
 *   - Gated exactly like live-settlement.e2e.test.ts: `describe.skip` unless
 *     PAI'D credentials are present, so it never runs in default `pnpm
 *     test` or CI, and never produces a false green.
 *
 * This file was written as part of H8.4 but had NOT been executed against
 * production by the harden-polish loop until 2026-07-21 (owner-directed,
 * explicit go-ahead given) — no PAI'D credentials were available in the
 * environment that wrote this test.
 *
 * **2026-07-21 run, real result — corrects this file's own prior assumption:**
 * Test 1 (checkout-session idempotency) PASSED against live production
 * (`api.trustfabric.ai`, merchant `acct_7ec95648-...`): the same
 * Idempotency-Key returned the identical session id on a retried request —
 * PAI'D's checkout-session endpoint genuinely honors it.
 * Test 2 (wallet-debit idempotency) did NOT run to completion — both the
 * vitest run and a standalone direct call to `debitPaidWallet` for a fresh,
 * never-seen `developerId` returned a real `404 resource_not_found` from
 * `POST /trust-fabric/billing/wallet/{id}/debit` itself (not just the
 * `GET` pre-check). **This disproves the "PAI'D auto-provisions a fresh
 * 60-FC free-tier wallet for any unseen developer_id" assumption this file
 * was originally written with** — as deployed today, debiting a wallet
 * that doesn't already exist is a 404, not an auto-create. The genuine
 * wallet-debit idempotency question (does a retried debit against an
 * EXISTING wallet double-charge) remains open and unanswered — it was
 * never reached. No financial or ledger side effect occurred from either
 * 404'd attempt (the request never got far enough to mutate anything).
 * Whoever revisits this: find the real developer/wallet-provisioning
 * mechanism (a separate PAI'D endpoint? does it require an actual signed-up
 * account?) before re-attempting test 2 — do not just retry with a
 * different synthetic id and expect a different result.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  isPaidConfigured,
  loadPaidConfig,
  createPaidCheckoutSession,
  getPaidWallet,
  debitPaidWallet,
} from "@axis/paid-client";

const CONFIGURED = isPaidConfigured();

(CONFIGURED ? describe : describe.skip)("PAI'D live contract canary — Idempotency-Key honoring (H8.4)", () => {
  // Deferred to beforeAll (not a describe-body top-level const): describe.skip
  // still INVOKES this callback to collect the child `it`s (it just marks
  // them skipped), so anything env-dependent must live inside a hook/it, or
  // it throws during collection regardless of the CONFIGURED gate above.
  let config: ReturnType<typeof loadPaidConfig>;
  beforeAll(() => {
    config = loadPaidConfig();
  });

  it("checkout-session: the SAME Idempotency-Key returns the SAME session id on a retried request (zero financial risk)", async () => {
    const idempotencyKey = `h84-checkout-canary-${randomUUID()}`;
    const input = {
      amountCents: 50, // $0.50 — the smallest AXIS list price; never charged (no checkout is completed)
      description: "H8.4 idempotency canary — do not complete this checkout",
      successUrl: "https://iliad.trustfabric.ai/h84-canary-success",
      cancelUrl: "https://iliad.trustfabric.ai/h84-canary-cancel",
      metadata: { source: "h84-idempotency-canary" },
      idempotencyKey,
    };

    const first = await createPaidCheckoutSession(input, config);
    const second = await createPaidCheckoutSession(input, config);

    // eslint-disable-next-line no-console
    console.log(`[H8.4] PAI'D checkout Idempotency-Key honored: ${first.id === second.id ? "YES" : "NO"} (first=${first.id} second=${second.id})`);

    expect(second.id).toBe(first.id);
  });

  it("wallet-debit: the SAME Idempotency-Key debits ONCE, not twice, on a retried request (low, non-zero side effect — see file header)", async () => {
    const developerId = `h84-idempotency-canary-${Date.now()}`;
    const idempotencyKey = `h84-debit-canary-${randomUUID()}`;
    const debitInput = {
      amountFc: 1,
      productCode: "h84_idempotency_canary",
      reason: "H8.4 live contract canary — verifies Idempotency-Key honoring, not a real charge",
      referenceType: "h84_canary",
      referenceId: idempotencyKey,
      idempotencyKey,
    };

    const before = await getPaidWallet(developerId, config);
    const first = await debitPaidWallet(developerId, debitInput, config);
    const second = await debitPaidWallet(developerId, debitInput, config);
    const after = await getPaidWallet(developerId, config);

    const honored = first.transaction.transaction_id === second.transaction.transaction_id && before.balance_fc - after.balance_fc === 1;

    // eslint-disable-next-line no-console
    console.log(
      `[H8.4] PAI'D wallet-debit Idempotency-Key honored: ${honored ? "YES" : "NO"} ` +
        `(before=${before.balance_fc} after=${after.balance_fc} first_txn=${first.transaction.transaction_id} second_txn=${second.transaction.transaction_id})`,
    );

    // Same transaction both times, and the balance moved by exactly one
    // debit's worth — a non-idempotent server would either mint a second
    // transaction_id or debit 2 FC total.
    expect(second.transaction.transaction_id).toBe(first.transaction.transaction_id);
    expect(before.balance_fc - after.balance_fc).toBe(1);
  });
});
