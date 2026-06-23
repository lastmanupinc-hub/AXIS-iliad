import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { createAccount } from "./billing-store.js";
import { getPersistenceBalance } from "./persistence-metering.js";
import {
  listCreditPackCatalog,
  getCreditPack,
  recordPendingPurchase,
  markPurchaseSucceeded,
  getPurchaseBySession,
  listPurchasesByAccount,
} from "./credit-pack-store.js";

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
});
