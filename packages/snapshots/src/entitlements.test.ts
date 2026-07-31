import { describe, it, expect, beforeEach } from "vitest";
import { createAccount } from "./billing-store.js";
import { resetTestDb } from "./pg-test.js";
import { grantEntitlement, hasEntitlement, listEntitlements } from "./entitlements.js";

// Hub-and-spoke product entitlements (docs/saas-strategy/CONSOLIDATION.md).
// Deliberately separate from accounts.tier, which stays exactly what it is
// today (quota/rate-limit tier, read at 43 call sites) — these tests never
// touch tier, only the new account_entitlements table.

describe("entitlements", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("an account has no entitlements until granted one", async () => {
    const account = await createAccount("no-ent", "no-ent@test.com", "paid");
    expect(await hasEntitlement(account.account_id, "socket")).toBe(false);
    expect(await listEntitlements(account.account_id)).toEqual([]);
  });

  it("grantEntitlement makes hasEntitlement true for that product only", async () => {
    const account = await createAccount("granted", "granted@test.com", "paid");
    await grantEntitlement(account.account_id, "socket");
    expect(await hasEntitlement(account.account_id, "socket")).toBe(true);
    expect(await hasEntitlement(account.account_id, "palette")).toBe(false);
  });

  it("is idempotent — granting the same product twice does not duplicate or error", async () => {
    const account = await createAccount("twice", "twice@test.com", "paid");
    await grantEntitlement(account.account_id, "runway");
    await grantEntitlement(account.account_id, "runway");
    const rows = await listEntitlements(account.account_id);
    expect(rows.filter((r) => r.product_id === "runway").length).toBe(1);
  });

  it("scopes entitlement to the account it was granted to, not every account", async () => {
    const a = await createAccount("scope-a", "scope-a@test.com", "paid");
    const b = await createAccount("scope-b", "scope-b@test.com", "paid");
    await grantEntitlement(a.account_id, "embed");
    expect(await hasEntitlement(a.account_id, "embed")).toBe(true);
    expect(await hasEntitlement(b.account_id, "embed")).toBe(false);
  });

  it("records the granting source and a real timestamp", async () => {
    const account = await createAccount("source", "source@test.com", "paid");
    await grantEntitlement(account.account_id, "crate", "manual");
    const [row] = await listEntitlements(account.account_id);
    expect(row.source).toBe("manual");
    expect(new Date(row.granted_at).toString()).not.toBe("Invalid Date");
  });

  it("defaults source to 'purchase' when not specified", async () => {
    const account = await createAccount("default-source", "default-source@test.com", "paid");
    await grantEntitlement(account.account_id, "reach");
    const [row] = await listEntitlements(account.account_id);
    expect(row.source).toBe("purchase");
  });

  it("lists multiple entitlements ordered oldest-granted first", async () => {
    const account = await createAccount("multi", "multi@test.com", "suite");
    await grantEntitlement(account.account_id, "socket");
    await grantEntitlement(account.account_id, "palette");
    const rows = await listEntitlements(account.account_id);
    expect(rows.map((r) => r.product_id)).toEqual(["socket", "palette"]);
  });
});
