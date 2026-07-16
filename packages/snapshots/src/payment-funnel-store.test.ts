import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { createAccount } from "./billing-store.js";
import { recordPaymentFunnelEvent, getPaymentFunnelStats } from "./payment-funnel-store.js";

describe("payment-funnel-store (x402 onboarding program, Phase 0)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("reads zero on an empty database", async () => {
    const stats = await getPaymentFunnelStats();
    expect(stats).toEqual({ x402_challenges_issued: 0, probe_settlements: 0 });
  });

  it("counts a recorded challenge event", async () => {
    const acct = await createAccount("Challenged", "challenged@x.com", "free");
    await recordPaymentFunnelEvent({ account_id: acct.account_id, tool: "analyze_repo", kind: "challenge" });

    const stats = await getPaymentFunnelStats();
    expect(stats.x402_challenges_issued).toBe(1);
    expect(stats.probe_settlements).toBe(0);
  });

  it("counts a recorded settlement event separately from challenges", async () => {
    await recordPaymentFunnelEvent({ account_id: null, tool: "ping_payment", kind: "settlement", amount_cents: 0 });

    const stats = await getPaymentFunnelStats();
    expect(stats.x402_challenges_issued).toBe(0);
    expect(stats.probe_settlements).toBe(1);
  });

  it("supports a null account_id (anonymous caller) — never bounces on referential timing", async () => {
    await expect(
      recordPaymentFunnelEvent({ account_id: null, tool: "ping_payment", kind: "challenge" }),
    ).resolves.toBeUndefined();
    const stats = await getPaymentFunnelStats();
    expect(stats.x402_challenges_issued).toBe(1);
  });

  it("defaults amount_cents to 0 when omitted", async () => {
    await recordPaymentFunnelEvent({ account_id: null, tool: "ping_payment", kind: "settlement" });
    const stats = await getPaymentFunnelStats();
    expect(stats.probe_settlements).toBe(1);
  });

  it("accumulates multiple events of each kind independently", async () => {
    const acct = await createAccount("Multi", "multi@x.com", "free");
    await recordPaymentFunnelEvent({ account_id: acct.account_id, tool: "analyze_repo", kind: "challenge" });
    await recordPaymentFunnelEvent({ account_id: acct.account_id, tool: "analyze_repo", kind: "challenge" });
    await recordPaymentFunnelEvent({ account_id: acct.account_id, tool: "ping_payment", kind: "settlement" });

    const stats = await getPaymentFunnelStats();
    expect(stats.x402_challenges_issued).toBe(2);
    expect(stats.probe_settlements).toBe(1);
  });
});
