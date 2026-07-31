import { describe, it, expect, beforeEach } from "vitest";
import { createAccount } from "./billing-store.js";
import { resetTestDb } from "./pg-test.js";
import { subscribeRepo, unsubscribeRepo, listSubscriptionsForRepo, listSubscriptionsForAccount } from "./repo-subscriptions.js";

// The Watch mechanic every one of the 20 apps depends on
// (docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md). This is also the
// "installation -> account mapping" apps/api/src/github-webhook.ts's own
// comment names as missing — webhook-created snapshots were anonymous
// because nothing mapped a repo back to an account. Keyed on repo_full_name,
// not installation_id, since a repo can be watched before or independent of
// any GitHub App install.

describe("repo subscriptions", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("a repo has no subscribers until one is added", async () => {
    expect(await listSubscriptionsForRepo("acme/widgets")).toEqual([]);
  });

  it("subscribeRepo makes the repo show up for that account+product only", async () => {
    const account = await createAccount("watcher", "watcher@test.com", "paid");
    await subscribeRepo(account.account_id, "skills", "acme/widgets");

    const subs = await listSubscriptionsForRepo("acme/widgets");
    expect(subs.length).toBe(1);
    expect(subs[0].account_id).toBe(account.account_id);
    expect(subs[0].product_id).toBe("skills");
    expect(subs[0].repo_full_name).toBe("acme/widgets");

    expect(await listSubscriptionsForRepo("acme/other-repo")).toEqual([]);
  });

  it("is idempotent — subscribing the same repo+product twice does not duplicate", async () => {
    const account = await createAccount("twice", "twice@test.com", "paid");
    await subscribeRepo(account.account_id, "deploy", "acme/widgets");
    await subscribeRepo(account.account_id, "deploy", "acme/widgets");
    const subs = await listSubscriptionsForRepo("acme/widgets");
    expect(subs.filter((s) => s.product_id === "deploy").length).toBe(1);
  });

  it("one account can watch the same repo with two different products", async () => {
    const account = await createAccount("multi-product", "multi-product@test.com", "paid");
    await subscribeRepo(account.account_id, "skills", "acme/widgets");
    await subscribeRepo(account.account_id, "deploy", "acme/widgets");
    const subs = await listSubscriptionsForRepo("acme/widgets");
    expect(subs.map((s) => s.product_id).sort()).toEqual(["deploy", "skills"]);
  });

  it("two different accounts can watch the same repo independently", async () => {
    const a = await createAccount("watcher-a", "watcher-a@test.com", "paid");
    const b = await createAccount("watcher-b", "watcher-b@test.com", "paid");
    await subscribeRepo(a.account_id, "skills", "acme/widgets");
    await subscribeRepo(b.account_id, "skills", "acme/widgets");
    const subs = await listSubscriptionsForRepo("acme/widgets");
    expect(subs.map((s) => s.account_id).sort()).toEqual([a.account_id, b.account_id].sort());
  });

  it("unsubscribeRepo removes exactly that one subscription, nothing else", async () => {
    const account = await createAccount("unsub", "unsub@test.com", "paid");
    await subscribeRepo(account.account_id, "skills", "acme/widgets");
    await subscribeRepo(account.account_id, "deploy", "acme/widgets");
    await unsubscribeRepo(account.account_id, "skills", "acme/widgets");
    const subs = await listSubscriptionsForRepo("acme/widgets");
    expect(subs.map((s) => s.product_id)).toEqual(["deploy"]);
  });

  it("listSubscriptionsForAccount lists every repo+product an account watches", async () => {
    const account = await createAccount("lister", "lister@test.com", "paid");
    await subscribeRepo(account.account_id, "skills", "acme/widgets");
    await subscribeRepo(account.account_id, "deploy", "acme/other-repo");
    const subs = await listSubscriptionsForAccount(account.account_id);
    expect(subs.length).toBe(2);
    expect(subs.map((s) => s.repo_full_name).sort()).toEqual(["acme/other-repo", "acme/widgets"]);
  });

  it("records a real timestamp", async () => {
    const account = await createAccount("stamped", "stamped@test.com", "paid");
    await subscribeRepo(account.account_id, "skills", "acme/widgets");
    const [row] = await listSubscriptionsForRepo("acme/widgets");
    expect(new Date(row.created_at).toString()).not.toBe("Invalid Date");
  });
});
