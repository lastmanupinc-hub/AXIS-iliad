import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { createAccount, updateAccountTier, getAccount } from "./billing-store.js";
import {
  upsertSubscription,
  getSubscription,
  getSubscriptionByAccount,
  getActiveSubscriptionByAccount,
  updateSubscriptionStatus,
  listSubscriptionsByAccount,
  deleteSubscription,
  getActiveSubscriptionTier,
  priceToTier,
} from "./stripe-store.js";

beforeEach(async () => {
  await resetTestDb();
  process.env.STRIPE_PRICE_ID_PAID = "price_paid_123";
  process.env.STRIPE_PRICE_ID_SUITE = "price_suite_456";
});

afterEach(() => {
  delete process.env.STRIPE_PRICE_ID_PAID;
  delete process.env.STRIPE_PRICE_ID_SUITE;
});

function makeSub(accountId: string, overrides: Record<string, unknown> = {}) {
  return {
    subscription_id: "sub_001",
    customer_id: "cust_001",
    account_id: accountId,
    price_id: "price_paid_123",
    status: "active" as const,
    current_period_start: "2025-01-01T00:00:00Z",
    current_period_end: "2025-02-01T00:00:00Z",
    card_brand: "visa",
    card_last_four: "4242",
    cancel_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── priceToTier ────────────────────────────────────────────────

describe("priceToTier", () => {
  it("maps paid price to paid tier", () => {
    expect(priceToTier("price_paid_123")).toBe("paid");
  });

  it("maps suite price to suite tier", () => {
    expect(priceToTier("price_suite_456")).toBe("suite");
  });

  it("returns null for unknown price", () => {
    expect(priceToTier("price_unknown")).toBeNull();
  });
});

// ─── Subscription CRUD ─────────────────────────────────────────

describe("Subscription CRUD", () => {
  it("creates and retrieves a subscription", async () => {
    const acct = await createAccount("Alice", "alice@test.com", "free");
    const sub = makeSub(acct.account_id);
    await upsertSubscription(sub);

    const found = await getSubscription("sub_001");
    expect(found).toBeTruthy();
    expect(found!.subscription_id).toBe("sub_001");
    expect(found!.account_id).toBe(acct.account_id);
    expect(found!.status).toBe("active");
    expect(found!.card_brand).toBe("visa");
    expect(found!.price_id).toBe("price_paid_123");
  });

  it("upserts (updates) an existing subscription", async () => {
    const acct = await createAccount("Bob", "bob@test.com", "free");
    await upsertSubscription(makeSub(acct.account_id));

    await upsertSubscription(makeSub(acct.account_id, {
      status: "past_due" as const,
      updated_at: "2025-01-15T00:00:00Z",
    }));

    const found = await getSubscription("sub_001");
    expect(found!.status).toBe("past_due");
    expect(found!.updated_at).toBe("2025-01-15T00:00:00Z");
  });

  it("retrieves subscription by account", async () => {
    const acct = await createAccount("Charlie", "charlie@test.com", "free");
    await upsertSubscription(makeSub(acct.account_id));

    const found = await getSubscriptionByAccount(acct.account_id);
    expect(found).toBeTruthy();
    expect(found!.account_id).toBe(acct.account_id);
  });

  it("returns null for nonexistent subscription", async () => {
    expect(await getSubscription("nope")).toBeNull();
  });

  it("returns null for account with no subscription", async () => {
    const acct = await createAccount("Dan", "dan@test.com", "free");
    expect(await getSubscriptionByAccount(acct.account_id)).toBeNull();
  });
});

// ─── Active subscription filtering ─────────────────────────────

describe("Active subscription filtering", () => {
  it("returns active subscription", async () => {
    const acct = await createAccount("Eve", "eve@test.com", "free");
    await upsertSubscription(makeSub(acct.account_id));

    const active = await getActiveSubscriptionByAccount(acct.account_id);
    expect(active).toBeTruthy();
    expect(active!.status).toBe("active");
  });

  it("returns trialing as active", async () => {
    const acct = await createAccount("Frank", "frank@test.com", "free");
    await upsertSubscription(makeSub(acct.account_id, { status: "trialing" as const }));

    const active = await getActiveSubscriptionByAccount(acct.account_id);
    expect(active).toBeTruthy();
    expect(active!.status).toBe("trialing");
  });

  it("does not return canceled subscription as active", async () => {
    const acct = await createAccount("Grace", "grace@test.com", "free");
    await upsertSubscription(makeSub(acct.account_id, { status: "canceled" as const }));

    const active = await getActiveSubscriptionByAccount(acct.account_id);
    expect(active).toBeNull();
  });

  it("does not return past_due subscription as active", async () => {
    const acct = await createAccount("Heidi", "heidi@test.com", "free");
    await upsertSubscription(makeSub(acct.account_id, { status: "past_due" as const }));

    expect(await getActiveSubscriptionByAccount(acct.account_id)).toBeNull();
  });

  it("does not return unpaid subscription as active", async () => {
    const acct = await createAccount("Ivan2", "ivan2@test.com", "free");
    await upsertSubscription(makeSub(acct.account_id, { status: "unpaid" as const }));

    expect(await getActiveSubscriptionByAccount(acct.account_id)).toBeNull();
  });
});

// ─── Status update ──────────────────────────────────────────────

describe("updateSubscriptionStatus", () => {
  it("updates subscription status", async () => {
    const acct = await createAccount("Ivan", "ivan@test.com", "free");
    await upsertSubscription(makeSub(acct.account_id));

    const updated = await updateSubscriptionStatus("sub_001", "canceled");
    expect(updated).toBe(true);

    const found = await getSubscription("sub_001");
    expect(found!.status).toBe("canceled");
  });

  it("returns false for nonexistent subscription", async () => {
    expect(await updateSubscriptionStatus("nope", "canceled")).toBe(false);
  });
});

// ─── List & Delete ──────────────────────────────────────────────

describe("listSubscriptionsByAccount", () => {
  it("lists all subscriptions for an account", async () => {
    const acct = await createAccount("Judy", "judy@test.com", "free");
    await upsertSubscription(makeSub(acct.account_id, { subscription_id: "sub_a" }));
    await upsertSubscription(makeSub(acct.account_id, {
      subscription_id: "sub_b",
      status: "canceled" as const,
      created_at: "2025-02-01T00:00:00Z",
    }));

    const list = await listSubscriptionsByAccount(acct.account_id);
    expect(list.length).toBe(2);
  });
});

describe("deleteSubscription", () => {
  it("deletes a subscription", async () => {
    const acct = await createAccount("Ken", "ken@test.com", "free");
    await upsertSubscription(makeSub(acct.account_id));

    expect(await deleteSubscription("sub_001")).toBe(true);
    expect(await getSubscription("sub_001")).toBeNull();
  });

  it("returns false for nonexistent subscription", async () => {
    expect(await deleteSubscription("nope")).toBe(false);
  });
});

// ─── getActiveSubscriptionTier ──────────────────────────────────

describe("getActiveSubscriptionTier", () => {
  it("returns paid for active paid subscription", async () => {
    const acct = await createAccount("Liam", "liam@test.com", "free");
    await upsertSubscription(makeSub(acct.account_id, { price_id: "price_paid_123" }));

    expect(await getActiveSubscriptionTier(acct.account_id)).toBe("paid");
  });

  it("returns suite for active suite subscription", async () => {
    const acct = await createAccount("Mia", "mia@test.com", "free");
    await upsertSubscription(makeSub(acct.account_id, { price_id: "price_suite_456" }));

    expect(await getActiveSubscriptionTier(acct.account_id)).toBe("suite");
  });

  it("returns null when no active subscription", async () => {
    const acct = await createAccount("Noah", "noah@test.com", "free");
    expect(await getActiveSubscriptionTier(acct.account_id)).toBeNull();
  });

  it("returns null when subscription is canceled", async () => {
    const acct = await createAccount("Olivia", "olivia@test.com", "free");
    await upsertSubscription(makeSub(acct.account_id, { status: "canceled" as const }));

    expect(await getActiveSubscriptionTier(acct.account_id)).toBeNull();
  });
});
