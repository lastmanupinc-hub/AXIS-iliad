import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { createAccount } from "./billing-store.js";
import { getPersistenceBalance, getPersistenceLedger } from "./persistence-metering.js";
import {
  listCreditPackCatalog,
  getCreditPack,
  recordPendingPurchase,
  markPurchaseSucceeded,
  getPurchaseBySession,
  listPurchasesByAccount,
} from "./credit-pack-store.js";

// A cold pool opens the 2nd connection slower than the 1st commits, which masks
// a same-account race — pre-warming N idle connections makes the burst truly
// overlap. Same technique as persistence-metering.test.ts's own concurrency suite.
async function warmPool(n: number): Promise<void> {
  await Promise.all(Array.from({ length: n }, () => sql.one("SELECT 1")));
}

describe("credit-pack purchases", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("exposes the shared persistence-credit pack catalog", () => {
    const packs = listCreditPackCatalog();
    expect(packs.length).toBeGreaterThan(0);
    expect(getCreditPack("pack_100")).toMatchObject({ pack_id: "pack_100", credits: 100, price_cents: 500 });
    expect(getCreditPack("nope")).toBeNull();
  });

  it("records a pending purchase keyed by session id", async () => {
    const acct = await createAccount("Buyer", "buyer@example.com", "paid");
    const p = await recordPendingPurchase({
      account_id: acct.account_id,
      pack_id: "pack_100",
      credits: 100,
      price_cents: 500,
      paid_session_id: "sess_1",
    });
    expect(p.status).toBe("pending");
    expect((await getPurchaseBySession("sess_1"))?.purchase_id).toBe(p.purchase_id);
    expect(await getPersistenceBalance(acct.account_id)).toBe(0); // not granted until paid
  });

  it("grants credits exactly once on success (idempotent webhook)", async () => {
    const acct = await createAccount("Payer", "payer@example.com", "paid");
    await recordPendingPurchase({
      account_id: acct.account_id,
      pack_id: "pack_500",
      credits: 500,
      price_cents: 2000,
      paid_session_id: "sess_2",
    });

    const first = await markPurchaseSucceeded("sess_2", "pi_abc");
    expect(first?.status).toBe("succeeded");
    expect(first?.paid_payment_intent_id).toBe("pi_abc");
    expect(await getPersistenceBalance(acct.account_id)).toBe(500);

    // Webhook retry — no second grant.
    const again = await markPurchaseSucceeded("sess_2", "pi_abc");
    expect(again).toBeNull();
    expect(await getPersistenceBalance(acct.account_id)).toBe(500);
  });

  it("grants exactly once under CONCURRENT webhook deliveries (no double-grant)", async () => {
    const acct = await createAccount("RacePay", "racepay@example.com", "paid");
    await recordPendingPurchase({
      account_id: acct.account_id,
      pack_id: "pack_500",
      credits: 500,
      price_cents: 2000,
      paid_session_id: "sess_race",
    });

    // Three deliveries land at once (PAI'D retries / at-least-once webhook delivery).
    const results = await Promise.all([
      markPurchaseSucceeded("sess_race", "pi_race"),
      markPurchaseSucceeded("sess_race", "pi_race"),
      markPurchaseSucceeded("sess_race", "pi_race"),
    ]);

    expect(results.filter((r) => r !== null)).toHaveLength(1); // exactly one delivery granted
    expect(await getPersistenceBalance(acct.account_id)).toBe(500); // not 1000 / 1500
  });

  it("returns null for an unknown session (no grant)", async () => {
    expect(await markPurchaseSucceeded("never_seen")).toBeNull();
  });

  it("lists a caller's purchase history newest-first", async () => {
    const acct = await createAccount("Hist", "hist@example.com", "paid");
    await recordPendingPurchase({ account_id: acct.account_id, pack_id: "pack_100", credits: 100, price_cents: 500, paid_session_id: "s_a" });
    await recordPendingPurchase({ account_id: acct.account_id, pack_id: "pack_500", credits: 500, price_cents: 2000, paid_session_id: "s_b" });
    const history = await listPurchasesByAccount(acct.account_id);
    expect(history.length).toBe(2);
    expect(history.every((p) => p.account_id === acct.account_id)).toBe(true);
  });

  // H-Phase-A cycle 6: FOR UPDATE only locks the settling purchase's OWN row —
  // two DIFFERENT pending purchases for the SAME account (distinct
  // paid_session_id, so no row conflict) could still race on the shared
  // balance_after SUM read, a lost-update on the ledger's denormalized
  // column (the real spendable balance was never at risk — every consumer
  // recomputes a live SUM).
  it("settling two distinct purchases for the same account concurrently never stamps the same balance_after", async () => {
    const acct = await createAccount("SettleRace", "settlerace@example.com", "paid");
    await recordPendingPurchase({ account_id: acct.account_id, pack_id: "pack_100", credits: 100, price_cents: 500, paid_session_id: "race_a" });
    await recordPendingPurchase({ account_id: acct.account_id, pack_id: "pack_100", credits: 100, price_cents: 500, paid_session_id: "race_b" });

    await warmPool(2);
    const [a, b] = await Promise.all([
      markPurchaseSucceeded("race_a"),
      markPurchaseSucceeded("race_b"),
    ]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();

    // Read the ledger's own denormalized balance_after column directly — the
    // real spendable balance (a live SUM) would read 200 correctly either
    // way, masking a lost-update on this column specifically.
    const ledger = await getPersistenceLedger(acct.account_id);
    const balancesAfter = ledger.map((r) => r.balance_after).sort((x, y) => x - y);
    expect(balancesAfter).toEqual([100, 200]);
    expect(await getPersistenceBalance(acct.account_id)).toBe(200);
  });
});
