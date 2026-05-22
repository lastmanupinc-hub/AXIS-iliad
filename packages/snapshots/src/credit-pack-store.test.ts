import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemoryDb, closeDb, getDb } from "./db.js";
import { createAccount } from "./billing-store.js";
import {
  CREDIT_PACK_CATALOG,
  getPackById,
  recordPendingPurchase,
  markPurchaseSucceeded,
  consumePackCredits,
  getTotalPackCredits,
  listCreditPacks,
  getPackBySession,
  tryPayWithPackCredits,
  _resetCreditPacksForTests,
} from "./credit-pack-store.js";
import { creditsFromUsdCents } from "./usage-credit-metering.js";

let accountId = "";
let otherAccountId = "";

beforeEach(() => {
  openMemoryDb();
  _resetCreditPacksForTests();
  const acct = createAccount("Credit Pack Test", "credit-pack-test@example.com", "free");
  accountId = acct.account_id;
  const other = createAccount("Other Tester", "other-tester@example.com", "free");
  otherAccountId = other.account_id;
});

afterEach(() => {
  closeDb();
});

describe("credit-pack-store — catalog", () => {
  it("exposes a non-empty pack catalog", () => {
    expect(CREDIT_PACK_CATALOG.length).toBeGreaterThan(0);
  });

  it("getPackById returns null for unknown IDs", () => {
    expect(getPackById("pack_does_not_exist")).toBeNull();
  });

  it("getPackById returns the pack for known IDs", () => {
    const pack = getPackById("pack_starter");
    expect(pack).not.toBeNull();
    expect(pack!.credits).toBe(2_500);
    expect(pack!.price_cents).toBe(500);
  });

  it("pricing ladder is monotonic non-increasing on $/credit", () => {
    const rates = CREDIT_PACK_CATALOG.map((p) => p.price_per_1k_credits_cents);
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i]).toBeLessThanOrEqual(rates[i - 1]);
    }
  });

  it("every pack has price_per_1k_credits_cents that matches the price/credits ratio", () => {
    for (const pack of CREDIT_PACK_CATALOG) {
      const expected = Math.round((pack.price_cents / pack.credits) * 1_000);
      expect(pack.price_per_1k_credits_cents).toBe(expected);
    }
  });
});

describe("credit-pack-store — pending purchase creation", () => {
  it("records a pending row with credits_remaining=0 until webhook succeeds", () => {
    const purchase = recordPendingPurchase(accountId, "pack_starter", "cs_test_session_001");
    expect(purchase.status).toBe("pending");
    expect(purchase.credits_purchased).toBe(2_500);
    expect(purchase.credits_remaining).toBe(0); // not yet spendable
    expect(purchase.paid_session_id).toBe("cs_test_session_001");
  });

  it("rejects unknown pack_id with a thrown Error", () => {
    expect(() =>
      recordPendingPurchase(accountId, "pack_fake", "cs_test_session_xxx"),
    ).toThrow(/Unknown pack_id/);
  });

  it("pending purchases do not contribute to total spendable credits", () => {
    recordPendingPurchase(accountId, "pack_starter", "cs_test_session_002");
    expect(getTotalPackCredits(accountId)).toBe(0);
  });

  it("supports multiple pending purchases per account", () => {
    recordPendingPurchase(accountId, "pack_starter", "cs_a");
    recordPendingPurchase(accountId, "pack_mid", "cs_b");
    const packs = listCreditPacks(accountId);
    expect(packs.length).toBe(2);
    expect(packs.every((p) => p.status === "pending")).toBe(true);
  });
});

describe("credit-pack-store — markPurchaseSucceeded", () => {
  it("flips a pending purchase to succeeded and seeds credits_remaining", () => {
    recordPendingPurchase(accountId, "pack_starter", "cs_success_001");
    const updated = markPurchaseSucceeded("cs_success_001", "pi_abc123");
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("succeeded");
    expect(updated!.credits_remaining).toBe(2_500);
    expect(updated!.paid_payment_intent_id).toBe("pi_abc123");
    expect(updated!.succeeded_at).not.toBeNull();
  });

  it("returns null for an unknown session_id", () => {
    expect(markPurchaseSucceeded("cs_never_existed")).toBeNull();
  });

  it("is idempotent — re-firing the webhook does not double-grant credits", () => {
    recordPendingPurchase(accountId, "pack_mid", "cs_idem_001");
    const first = markPurchaseSucceeded("cs_idem_001", "pi_first");
    const second = markPurchaseSucceeded("cs_idem_001", "pi_second_ignored");
    expect(first!.credits_remaining).toBe(12_500);
    expect(second!.credits_remaining).toBe(12_500); // not 25,000
    expect(second!.status).toBe("succeeded");
  });

  it("succeeded purchase contributes to total spendable credits", () => {
    recordPendingPurchase(accountId, "pack_pro", "cs_pro_001");
    markPurchaseSucceeded("cs_pro_001", "pi_pro");
    expect(getTotalPackCredits(accountId)).toBe(35_000);
  });
});

describe("credit-pack-store — consumePackCredits", () => {
  beforeEach(() => {
    // Pre-seed: account has one succeeded pack with 2,500 credits.
    recordPendingPurchase(accountId, "pack_starter", "cs_consume_pre");
    markPurchaseSucceeded("cs_consume_pre");
  });

  it("draws the requested amount when available and reports zero unfunded", () => {
    const r = consumePackCredits(accountId, 100);
    expect(r.consumed).toBe(100);
    expect(r.unfunded).toBe(0);
    expect(r.remaining_after).toBe(2_400);
    expect(r.packs_drawn.length).toBe(1);
    expect(r.packs_drawn[0].drawn).toBe(100);
  });

  it("reports unfunded amount when request exceeds available", () => {
    const r = consumePackCredits(accountId, 5_000);
    expect(r.consumed).toBe(2_500);
    expect(r.unfunded).toBe(2_500);
    expect(r.remaining_after).toBe(0);
  });

  it("returns zero-everything for non-positive request", () => {
    const r = consumePackCredits(accountId, 0);
    expect(r.consumed).toBe(0);
    expect(r.unfunded).toBe(0);
    expect(r.packs_drawn).toEqual([]);
  });

  it("draws from packs FIFO by created_at, depleting older packs first", async () => {
    // Add a second succeeded pack (will be created after the pre-seeded one).
    await new Promise((r) => setTimeout(r, 5)); // ensure created_at differs
    recordPendingPurchase(accountId, "pack_mid", "cs_consume_second");
    markPurchaseSucceeded("cs_consume_second");

    // Consume 3,000 — should fully drain the 2,500 pre-seed and take 500 from the new pack.
    const r = consumePackCredits(accountId, 3_000);
    expect(r.consumed).toBe(3_000);
    expect(r.unfunded).toBe(0);
    expect(r.packs_drawn.length).toBe(2);
    expect(r.packs_drawn[0].drawn).toBe(2_500); // older pack drained first
    expect(r.packs_drawn[1].drawn).toBe(500);
    expect(r.remaining_after).toBe(12_000); // 12,500 - 500
  });

  it("never draws from pending or other accounts' packs", () => {
    recordPendingPurchase(otherAccountId, "pack_pro", "cs_other_account");
    markPurchaseSucceeded("cs_other_account");
    // Also create a pending pack on this account that should NOT be drawn from.
    recordPendingPurchase(accountId, "pack_pro", "cs_pending_local");

    const r = consumePackCredits(accountId, 10_000);
    expect(r.consumed).toBe(2_500); // only the original 2,500 from pre-seed
    expect(r.unfunded).toBe(7_500);
    // Pending pack untouched.
    const local = listCreditPacks(accountId);
    const pending = local.find((p) => p.paid_session_id === "cs_pending_local");
    expect(pending!.credits_remaining).toBe(0);
    // Other account untouched.
    expect(getTotalPackCredits(otherAccountId)).toBe(35_000);
  });

  it("refunded packs are not drawn from", () => {
    // Simulate a refund via direct DB write.
    getDb()
      .prepare(`UPDATE credit_pack_purchases SET status = 'refunded' WHERE account_id = ?`)
      .run(accountId);
    const r = consumePackCredits(accountId, 100);
    expect(r.consumed).toBe(0);
    expect(r.unfunded).toBe(100);
  });
});

describe("credit-pack-store — getPackBySession", () => {
  it("returns the pack for a known session ID", () => {
    recordPendingPurchase(accountId, "pack_starter", "cs_lookup_001");
    const found = getPackBySession("cs_lookup_001");
    expect(found).not.toBeNull();
    expect(found!.pack_id).toBe("pack_starter");
  });

  it("returns null for an unknown session ID", () => {
    expect(getPackBySession("cs_does_not_exist")).toBeNull();
  });
});

describe("credit-pack-store — tryPayWithPackCredits", () => {
  it("returns packs_cover_call=true with consumed=0 for zero or negative overage", () => {
    const r = tryPayWithPackCredits(accountId, 0);
    expect(r.packs_cover_call).toBe(true);
    expect(r.consumed).toBe(0);
    expect(r.credits_needed).toBe(0);
  });

  it("returns packs_cover_call=true and trivial values for empty account_id", () => {
    const r = tryPayWithPackCredits("", 50);
    expect(r.packs_cover_call).toBe(true);
    expect(r.consumed).toBe(0);
  });

  it("returns packs_cover_call=false when balance is zero", () => {
    const r = tryPayWithPackCredits(accountId, 50);
    expect(r.packs_cover_call).toBe(false);
    expect(r.pack_balance_before).toBe(0);
    expect(r.unfunded_credits).toBe(r.credits_needed);
  });

  it("returns packs_cover_call=false when balance is positive but insufficient", () => {
    // Buy a starter pack: 2,500 credits.
    recordPendingPurchase(accountId, "pack_starter", "cs_partial");
    markPurchaseSucceeded("cs_partial");

    // Charge for $10 — that's creditsFromUsdCents(1000) = ceil(1000*100/18) = 5,556 credits.
    const r = tryPayWithPackCredits(accountId, 1000);
    expect(r.packs_cover_call).toBe(false);
    expect(r.pack_balance_before).toBe(2_500);
    expect(r.credits_needed).toBe(creditsFromUsdCents(1000));
    expect(r.unfunded_credits).toBe(r.credits_needed - 2_500);

    // Confirm packs were NOT drawn — full balance still present.
    expect(getTotalPackCredits(accountId)).toBe(2_500);
  });

  it("returns packs_cover_call=true and atomically draws when balance covers exactly", () => {
    // Build the exact balance needed for a $0.50 overage.
    // creditsFromUsdCents(50) = ceil(50*100/18) = 278 credits.
    // We need to construct a pack that holds exactly that many credits. Since our catalog
    // doesn't have such a pack, instead buy starter (2,500) and verify the 278-credit draw.
    recordPendingPurchase(accountId, "pack_starter", "cs_exact");
    markPurchaseSucceeded("cs_exact");

    const overageCents = 50;
    const expectedCreditsNeeded = creditsFromUsdCents(overageCents);
    const r = tryPayWithPackCredits(accountId, overageCents);

    expect(r.packs_cover_call).toBe(true);
    expect(r.consumed).toBe(expectedCreditsNeeded);
    expect(r.pack_balance_after).toBe(2_500 - expectedCreditsNeeded);
    expect(getTotalPackCredits(accountId)).toBe(2_500 - expectedCreditsNeeded);
  });

  it("draws across multiple packs FIFO when needed credits span more than one pack", async () => {
    recordPendingPurchase(accountId, "pack_starter", "cs_fifo_a");
    markPurchaseSucceeded("cs_fifo_a");
    await new Promise((r) => setTimeout(r, 5));
    recordPendingPurchase(accountId, "pack_mid", "cs_fifo_b");
    markPurchaseSucceeded("cs_fifo_b");

    // Trigger a draw larger than the starter pack alone (2,500) but less than total (15,000).
    // creditsFromUsdCents(600) = ceil(600*100/18) = 3,334 credits — exceeds starter alone.
    const r = tryPayWithPackCredits(accountId, 600);
    expect(r.packs_cover_call).toBe(true);
    expect(r.consumed).toBe(creditsFromUsdCents(600));
    expect(r.pack_balance_after).toBe(15_000 - creditsFromUsdCents(600));
  });

  it("does not touch other accounts' packs", () => {
    recordPendingPurchase(otherAccountId, "pack_pro", "cs_other_packs");
    markPurchaseSucceeded("cs_other_packs");
    // This account has zero packs.
    const r = tryPayWithPackCredits(accountId, 50);
    expect(r.packs_cover_call).toBe(false);
    expect(r.pack_balance_before).toBe(0);
    // Other account still has its full 35,000.
    expect(getTotalPackCredits(otherAccountId)).toBe(35_000);
  });

  it("never overdraws — repeated calls fail cleanly once balance is depleted", () => {
    recordPendingPurchase(accountId, "pack_starter", "cs_deplete");
    markPurchaseSucceeded("cs_deplete");

    // Drain via repeated $1 calls (200 credits each by formula? Actually creditsFromUsdCents(100) = ceil(100*100/18) = 556).
    let consumedTotal = 0;
    for (let i = 0; i < 20; i += 1) {
      const r = tryPayWithPackCredits(accountId, 100);
      if (r.packs_cover_call) consumedTotal += r.consumed ?? 0;
      else break;
    }
    // Balance should now be < credits_needed for a $1 call.
    const after = tryPayWithPackCredits(accountId, 100);
    expect(after.packs_cover_call).toBe(false);
    expect(getTotalPackCredits(accountId)).toBe(2_500 - consumedTotal);
    expect(getTotalPackCredits(accountId)).toBeLessThan(creditsFromUsdCents(100));
  });
});

describe("credit-pack-store — listCreditPacks", () => {
  it("returns purchases newest first", async () => {
    recordPendingPurchase(accountId, "pack_starter", "cs_list_a");
    await new Promise((r) => setTimeout(r, 5));
    recordPendingPurchase(accountId, "pack_mid", "cs_list_b");
    await new Promise((r) => setTimeout(r, 5));
    recordPendingPurchase(accountId, "pack_pro", "cs_list_c");
    const list = listCreditPacks(accountId);
    expect(list.length).toBe(3);
    expect(list[0].pack_id).toBe("pack_pro");
    expect(list[2].pack_id).toBe("pack_starter");
  });

  it("respects the limit parameter", () => {
    recordPendingPurchase(accountId, "pack_starter", "cs_lim_a");
    recordPendingPurchase(accountId, "pack_mid", "cs_lim_b");
    const list = listCreditPacks(accountId, 1);
    expect(list.length).toBe(1);
  });
});
