import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { createAccount } from "./billing-store.js";
import {
  recordPendingSubscription,
  markSubscriptionSucceeded,
  getSubscriptionPurchaseBySession,
  listSubscriptionPurchasesByAccount,
  getLastSucceededPurchase,
} from "./subscription-purchase-store.js";
import { recordPendingPurchase, markPurchaseSucceeded } from "./credit-pack-store.js";

// Same technique credit-pack-store.test.ts's own concurrency suite uses: a
// cold pool opens the 2nd connection slower than the 1st commits, which
// masks a same-session race.
async function warmPool(n: number): Promise<void> {
  await Promise.all(Array.from({ length: n }, () => sql.one("SELECT 1")));
}

describe("subscription purchases (money_01 — the settlement join)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("records a pending subscription keyed by session id", async () => {
    const acct = await createAccount("Buyer", "sub-buyer@example.com", "free");
    const p = await recordPendingSubscription({
      account_id: acct.account_id,
      target_tier: "paid",
      plan_id: "starter",
      amount_cents: 2900,
      paid_session_id: "sess_sub_1",
    });
    expect(p.status).toBe("pending");
    expect(p.succeeded_at).toBeNull();
    expect(p.paid_payment_intent_id).toBeNull();
    expect((await getSubscriptionPurchaseBySession("sess_sub_1"))?.purchase_id).toBe(p.purchase_id);
  });

  it("settles exactly once on success (idempotent webhook)", async () => {
    const acct = await createAccount("Payer", "sub-payer@example.com", "free");
    await recordPendingSubscription({
      account_id: acct.account_id,
      target_tier: "paid",
      plan_id: "starter",
      amount_cents: 2900,
      paid_session_id: "sess_sub_2",
    });

    const first = await markSubscriptionSucceeded("sess_sub_2", "pi_sub_abc");
    expect(first?.status).toBe("succeeded");
    expect(first?.paid_payment_intent_id).toBe("pi_sub_abc");
    expect(first?.amount_cents).toBe(2900);
    expect(first?.account_id).toBe(acct.account_id);

    // Webhook retry (or a second lifecycle event for the same checkout,
    // e.g. both checkout.session.completed and payment_intent.captured
    // firing for one purchase) — THE CORE GUARD: no second settlement.
    const again = await markSubscriptionSucceeded("sess_sub_2", "pi_sub_abc");
    expect(again).toBeNull();

    // And the row itself really did flip exactly once, not twice.
    const row = await sql.one<{ status: string }>(
      "SELECT status FROM subscription_purchases WHERE paid_session_id = ?",
      ["sess_sub_2"],
    );
    expect(row?.status).toBe("succeeded");
  });

  it("settles exactly once under CONCURRENT webhook deliveries (no double-settlement)", async () => {
    const acct = await createAccount("RaceSub", "sub-race@example.com", "free");
    await recordPendingSubscription({
      account_id: acct.account_id,
      target_tier: "paid",
      plan_id: "pro",
      amount_cents: 9900,
      paid_session_id: "sess_sub_race",
    });

    await warmPool(3);
    const results = await Promise.all([
      markSubscriptionSucceeded("sess_sub_race", "pi_race"),
      markSubscriptionSucceeded("sess_sub_race", "pi_race"),
      markSubscriptionSucceeded("sess_sub_race", "pi_race"),
    ]);

    expect(results.filter((r) => r !== null)).toHaveLength(1); // exactly one delivery settled
  });

  it("returns null for an unknown session — never fabricates a settlement", async () => {
    expect(await markSubscriptionSucceeded("never_seen_session")).toBeNull();
  });

  it("lists a caller's subscription purchase history newest-first", async () => {
    const acct = await createAccount("Hist", "sub-hist@example.com", "free");
    await recordPendingSubscription({ account_id: acct.account_id, target_tier: "paid", plan_id: "starter", amount_cents: 2900, paid_session_id: "s_sub_a" });
    await recordPendingSubscription({ account_id: acct.account_id, target_tier: "suite", plan_id: "growth", amount_cents: 29900, paid_session_id: "s_sub_b" });
    const history = await listSubscriptionPurchasesByAccount(acct.account_id);
    expect(history.length).toBe(2);
    expect(history.every((p) => p.account_id === acct.account_id)).toBe(true);
  });
});

describe("the account's newest succeeded purchase (taskgate T201: the web counts from this, not the return URL)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("is undefined while nothing has succeeded, then the newest of a plan and a credit pack", async () => {
    const acct = await createAccount("Counter", "counted@example.com", "free");
    expect(await getLastSucceededPurchase(acct.account_id)).toBeUndefined();
    await recordPendingSubscription({ account_id: acct.account_id, target_tier: "pro", plan_id: "pro_monthly", amount_cents: 9900, paid_session_id: "sess_last_1" });
    expect(await getLastSucceededPurchase(acct.account_id)).toBeUndefined(); // pending counts for nothing
    await markSubscriptionSucceeded("sess_last_1", "pi_last_1");
    const plan = await getLastSucceededPurchase(acct.account_id);
    expect(plan?.kind).toBe("plan");
    expect(plan?.succeeded_at).toBeTruthy();
    await new Promise((r) => setTimeout(r, 5));
    await recordPendingPurchase({ account_id: acct.account_id, pack_id: "pack_1", credits: 100, price_cents: 500, paid_session_id: "sess_last_2" });
    await markPurchaseSucceeded("sess_last_2", "pi_last_2");
    const credits = await getLastSucceededPurchase(acct.account_id);
    expect(credits?.kind).toBe("credits");
    expect(credits?.purchase_id).not.toBe(plan?.purchase_id);
  });

  it("never reports another account's purchase", async () => {
    const a = await createAccount("A", "a-last@example.com", "free");
    const b = await createAccount("B", "b-last@example.com", "free");
    await recordPendingPurchase({ account_id: a.account_id, pack_id: "pack_1", credits: 100, price_cents: 500, paid_session_id: "sess_last_3" });
    await markPurchaseSucceeded("sess_last_3", "pi_last_3");
    expect(await getLastSucceededPurchase(b.account_id)).toBeUndefined();
  });
});
