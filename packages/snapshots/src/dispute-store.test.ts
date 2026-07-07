import { describe, it, expect, beforeEach } from "vitest";
import { resetTestDb } from "./pg-test.js";
import {
  upsertDispute,
  getDispute,
  listDisputesByAccount,
  logDisputeTransition,
  listDisputeTransitions,
  type StoredDisputeRecord,
} from "./dispute-store.js";
import { createAccount } from "./billing-store.js";

function rec(overrides: Partial<StoredDisputeRecord> = {}): StoredDisputeRecord {
  const now = "2026-07-07T00:00:00.000Z";
  return {
    id: "dp_test_1",
    rail: "stripe",
    chargeId: "ch_1",
    accountId: null,
    reasonCode: "10.4",
    amountMinor: 5000,
    currency: "usd",
    state: "needs_response",
    dueBy: "2026-07-21T00:00:00.000Z",
    createdAt: now,
    updatedAt: now,
    representmentId: null,
    ...overrides,
  };
}

beforeEach(async () => {
  await resetTestDb();
});

describe("dispute-store CRUD", () => {
  it("upsertDispute + getDispute round-trips every field", async () => {
    await upsertDispute(rec());
    const got = await getDispute("dp_test_1");
    expect(got).toEqual(rec());
  });

  it("getDispute returns null for an unknown id", async () => {
    expect(await getDispute("dp_missing")).toBeNull();
  });

  it("upsert is idempotent and updates mutable fields on conflict", async () => {
    await upsertDispute(rec());
    await upsertDispute(rec({ state: "under_review", updatedAt: "2026-07-08T00:00:00.000Z" }));
    const got = await getDispute("dp_test_1");
    expect(got?.state).toBe("under_review");
    expect(got?.updatedAt).toBe("2026-07-08T00:00:00.000Z");
  });

  it("a later upsert with null account_id/due_by does NOT clobber earlier attribution", async () => {
    await upsertDispute(rec({ accountId: "acc_1", dueBy: "2026-07-21T00:00:00.000Z" }));
    await upsertDispute(rec({ accountId: null, dueBy: null, state: "under_review" }));
    const got = await getDispute("dp_test_1");
    expect(got?.accountId).toBe("acc_1");
    expect(got?.dueBy).toBe("2026-07-21T00:00:00.000Z");
    expect(got?.state).toBe("under_review");
  });

  it("listDisputesByAccount returns only that account's disputes, newest first", async () => {
    const acc = await createAccount("Dispute Owner", "dispute-owner@test.com", "free");
    await upsertDispute(rec({ id: "dp_a", accountId: acc.account_id, createdAt: "2026-07-01T00:00:00.000Z" }));
    await upsertDispute(rec({ id: "dp_b", accountId: acc.account_id, createdAt: "2026-07-05T00:00:00.000Z" }));
    await upsertDispute(rec({ id: "dp_other", accountId: null }));
    const list = await listDisputesByAccount(acc.account_id);
    expect(list.map((d) => d.id)).toEqual(["dp_b", "dp_a"]);
  });
});

describe("dispute transition ledger", () => {
  it("logDisputeTransition appends and listDisputeTransitions preserves order", async () => {
    await upsertDispute(rec());
    await logDisputeTransition("dp_test_1", { from: "needs_response", to: "evidence_assembling", event: "evidence_ready", at: "2026-07-07T01:00:00.000Z" });
    await logDisputeTransition("dp_test_1", { from: "evidence_assembling", to: "evidence_submitted", event: "evidence_submitted", at: "2026-07-07T02:00:00.000Z" });
    const ts = await listDisputeTransitions("dp_test_1");
    expect(ts).toEqual([
      { from: "needs_response", to: "evidence_assembling", event: "evidence_ready", at: "2026-07-07T01:00:00.000Z" },
      { from: "evidence_assembling", to: "evidence_submitted", event: "evidence_submitted", at: "2026-07-07T02:00:00.000Z" },
    ]);
  });

  it("transitions are scoped per dispute id", async () => {
    await logDisputeTransition("dp_x", { from: "needs_response", to: "accepted", event: "operator_accepted", at: "2026-07-07T01:00:00.000Z" });
    expect(await listDisputeTransitions("dp_y")).toEqual([]);
    expect(await listDisputeTransitions("dp_x")).toHaveLength(1);
  });
});
