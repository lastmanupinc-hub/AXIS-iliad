/**
 * E2E Referral Integration Test
 *
 * Exercises the full referral lifecycle as a single flow:
 *   Agent A creates account → gets referral code → Agent B signs up →
 *   conversion recorded → credits accumulate across multiple referees →
 *   free-call grant consumed → discount applied → summary reflects state.
 *
 * This validates that all referral-store functions compose correctly
 * end-to-end, not just in isolation.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemoryDb, closeDb, getDb } from "./db.js";
import { createAccount } from "./billing-store.js";
import {
  createReferralCode,
  lookupReferralCode,
  recordReferralConversion,
  getReferralCredits,
  initFreeCallGrant,
  consumeFreeCall,
  applyReferralDiscount,
  buildIncentivesSummary,
  REWARD_MILLICENTS,
} from "./referral-store.js";

beforeEach(() => { openMemoryDb(); });
afterEach(() => { closeDb(); });

describe("E2E Referral Lifecycle", () => {
  it("full flow: code → conversions → credits → free call → discount → summary", () => {
    // ── Step 1: Agent A creates account and referral code ────────
    const agentA = createAccount("Agent-A", "a@agents.io");
    const code = createReferralCode(agentA.account_id);
    expect(code.code).toHaveLength(12);

    // Verify code is discoverable
    const found = lookupReferralCode(code.code);
    expect(found).toBeDefined();
    expect(found!.account_id).toBe(agentA.account_id);

    // ── Step 2: Multiple agents sign up using A's code ──────────
    const referees = Array.from({ length: 5 }, (_, i) =>
      createAccount(`Referee-${i}`, `ref${i}@agents.io`),
    );

    for (const referee of referees) {
      const ok = recordReferralConversion(agentA.account_id, referee.account_id);
      expect(ok).toBe(true);
    }

    // ── Step 3: Verify credits accumulated correctly ────────────
    const credits = getReferralCredits(agentA.account_id);
    expect(credits.earned_credits_millicents).toBe(REWARD_MILLICENTS * 5);
    expect(credits.lifetime_referrals).toBe(5);

    // ── Step 4: Free-call grant (one-time onboarding) ────────────
    // Agent A has never had a free call grant yet — should succeed even with referrals
    initFreeCallGrant(agentA.account_id);
    const afterGrant = getReferralCredits(agentA.account_id);
    expect(afterGrant.free_calls_remaining).toBe(1);

    // Consume it — one time only
    expect(consumeFreeCall(agentA.account_id)).toBe(true);
    expect(getReferralCredits(agentA.account_id).free_calls_remaining).toBe(0);

    // Re-calling initFreeCallGrant must NOT re-grant (initial_grant_given = 1)
    initFreeCallGrant(agentA.account_id);
    expect(getReferralCredits(agentA.account_id).free_calls_remaining).toBe(0);

    // ── Step 5: A brand-new agent gets the free call ────────────
    const newAgent = createAccount("Brand-New", "new@agents.io");
    initFreeCallGrant(newAgent.account_id);
    expect(getReferralCredits(newAgent.account_id).free_calls_remaining).toBe(1);

    // Consume the free call
    expect(consumeFreeCall(newAgent.account_id)).toBe(true);
    expect(getReferralCredits(newAgent.account_id).free_calls_remaining).toBe(0);
    // Second attempt fails
    expect(consumeFreeCall(newAgent.account_id)).toBe(false);

    // ── Step 6: Agent A applies referral discount ───────────────
    // A has 5 millicents earned. 1000 millicents = 1 cent, so 5 < 1000 → no discount
    const discount1 = applyReferralDiscount(agentA.account_id, 50);
    expect(discount1.discount_cents).toBe(0);
    expect(discount1.final_cents).toBe(50);

    // ── Step 7: Accumulate enough credits for a real discount ───
    // Seed 200 more referees to reach 205 total → 205 millicents (still < 1000)
    // Instead, directly seed credits for realistic testing
    const db = getDb();
    db.prepare(
      "UPDATE referral_credits SET earned_credits_millicents = 5000 WHERE account_id = ?",
    ).run(agentA.account_id);

    const discount2 = applyReferralDiscount(agentA.account_id, 50);
    expect(discount2.discount_cents).toBe(5); // 5000 millicents = 5 cents
    expect(discount2.final_cents).toBe(45);
    expect(discount2.credits_used_millicents).toBe(5000);

    // Credits should be consumed
    const afterDiscount = getReferralCredits(agentA.account_id);
    expect(afterDiscount.earned_credits_millicents).toBe(0);

    // ── Step 8: Incentives summary reflects full state ───────────
    const summary = buildIncentivesSummary(agentA.account_id);
    expect(summary.share_to_earn).toBeDefined();
    expect(summary.free_call).toBeDefined();

    const status = summary.your_status as Record<string, unknown>;
    expect(status.referral_code).toBe(code.code);
    expect(status.earned_credits_millicents).toBe(0); // consumed above
    expect(status.lifetime_referrals).toBe(5); // only organic conversions count
  });

  it("expired credits reset on discount application", () => {
    const agent = createAccount("Expiry-Test", "exp@agents.io");
    getReferralCredits(agent.account_id);

    // Seed credits and backdate last_reset_at beyond 30 days
    const db = getDb();
    const expired = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      "UPDATE referral_credits SET earned_credits_millicents = 10000, last_reset_at = ? WHERE account_id = ?",
    ).run(expired, agent.account_id);

    // Discount should reset credits and return 0 discount
    const result = applyReferralDiscount(agent.account_id, 50);
    expect(result.discount_cents).toBe(0);
    expect(result.final_cents).toBe(50);

    // Credits should be wiped
    const credits = getReferralCredits(agent.account_id);
    expect(credits.earned_credits_millicents).toBe(0);
  });

  it("duplicate referee blocked across different referrers", () => {
    const referrerA = createAccount("Ref-A", "refa@agents.io");
    const referrerB = createAccount("Ref-B", "refb@agents.io");
    const referee = createAccount("Shared-Ref", "shared@agents.io");

    // First referrer claims the referee
    expect(recordReferralConversion(referrerA.account_id, referee.account_id)).toBe(true);
    // Second referrer cannot claim same referee
    expect(recordReferralConversion(referrerB.account_id, referee.account_id)).toBe(false);

    // Only referrerA got credits
    expect(getReferralCredits(referrerA.account_id).earned_credits_millicents).toBe(REWARD_MILLICENTS);
    expect(getReferralCredits(referrerB.account_id).earned_credits_millicents).toBe(0);
  });

  it("discount cannot exceed base price", () => {
    const agent = createAccount("Cheap-Call", "cheap@agents.io");
    getReferralCredits(agent.account_id);

    // Seed 10 cents worth of credits
    const db = getDb();
    db.prepare(
      "UPDATE referral_credits SET earned_credits_millicents = 10000 WHERE account_id = ?",
    ).run(agent.account_id);

    // Base price is only 3 cents — discount capped at 3
    const result = applyReferralDiscount(agent.account_id, 3);
    expect(result.discount_cents).toBe(3);
    expect(result.final_cents).toBe(0);
    expect(result.credits_used_millicents).toBe(3000);

    // Remaining credits = 10000 - 3000 = 7000
    const credits = getReferralCredits(agent.account_id);
    expect(credits.earned_credits_millicents).toBe(7000);
  });

  it("free call takes priority — no discount consumed", () => {
    const agent = createAccount("Free-First", "free@agents.io");

    // Grant free call
    initFreeCallGrant(agent.account_id);
    expect(getReferralCredits(agent.account_id).free_calls_remaining).toBe(1);

    // Also seed discount credits
    const db = getDb();
    db.prepare(
      "UPDATE referral_credits SET earned_credits_millicents = 5000 WHERE account_id = ?",
    ).run(agent.account_id);

    // Simulate chargeWithDiscounts logic: free call first
    const freeConsumed = consumeFreeCall(agent.account_id);
    expect(freeConsumed).toBe(true);

    // If free call worked, discount credits should be untouched
    const credits = getReferralCredits(agent.account_id);
    expect(credits.earned_credits_millicents).toBe(5000);
    expect(credits.free_calls_remaining).toBe(0);
  });

  it("chargeWithDiscounts chain: free call → discount → charge", () => {
    // This test simulates the exact chain in handlers.ts chargeWithDiscounts()
    // without the HTTP layer (chargeMpp).
    const agent = createAccount("Chain-Test", "chain@agents.io");
    const baseCents = 50;

    // ── Call 1: No free calls, no credits → full charge ─────────
    const free1 = consumeFreeCall(agent.account_id);
    expect(free1).toBe(false);
    const disc1 = applyReferralDiscount(agent.account_id, baseCents);
    expect(disc1.final_cents).toBe(50); // would go to chargeMpp

    // ── Grant free call (simulating one-time onboarding trigger) ──────
    initFreeCallGrant(agent.account_id);

    // ── Call 2: Free call consumed → no charge at all ───────────
    const free2 = consumeFreeCall(agent.account_id);
    expect(free2).toBe(true);
    // chargeWithDiscounts returns {status: 200} here, skips discount and chargeMpp

    // ── Seed referral credits ───────────────────────────────────
    const db = getDb();
    db.prepare(
      "UPDATE referral_credits SET earned_credits_millicents = 3000 WHERE account_id = ?",
    ).run(agent.account_id);

    // ── Call 3: No free calls left, discount applies ────────────
    const free3 = consumeFreeCall(agent.account_id);
    expect(free3).toBe(false);
    const disc3 = applyReferralDiscount(agent.account_id, baseCents);
    expect(disc3.discount_cents).toBe(3); // 3000 millicents = 3 cents
    expect(disc3.final_cents).toBe(47); // would charge 47 via chargeMpp

    // ── Call 4: Credits consumed, full charge ───────────────────
    const free4 = consumeFreeCall(agent.account_id);
    expect(free4).toBe(false);
    const disc4 = applyReferralDiscount(agent.account_id, baseCents);
    expect(disc4.discount_cents).toBe(0);
    expect(disc4.final_cents).toBe(50); // full charge
  });
});
