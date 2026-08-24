import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { createAccount, updateAccountPaidPlanId } from "./billing-store.js";
import {
  creditsFromUsdCents,
  previewUsageCredits,
  consumeUsageCredits,
  getUsageCreditSummary,
  grantUsageCredits,
} from "./usage-credit-metering.js";
import { getReferralCredits, getReferralTokenUsageModifier } from "./referral-store.js";
import { upsertSubscription } from "./stripe-store.js";

// ─── H8.3 — mutation-lite kill: resolvePlanForAccount's price-derived branch ──
//
// resolvePlanForAccount reads the account's active Stripe subscription FIRST and,
// when its price maps to a known plan, that plan wins over the tier fallback (a
// "paid" tier account with a "pro" subscription must be metered as pro/300,000,
// not the tier default of starter/75,000). None of the OTHER tests in this file
// seed a subscription row, so without this test that branch (mcp-runtime H8.3
// mutant: `if (planFromPrice) return planFromPrice;` negated to
// `if (!planFromPrice) return planFromPrice;`) is never exercised by this suite.
describe("resolvePlanForAccount — active subscription price overrides the tier fallback", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("a 'paid'-tier account with an active 'pro'-priced subscription is metered as pro, not starter", async () => {
    const account = await createAccount("ProSub", "prosub@example.com", "paid");
    process.env.STRIPE_PRICE_ID_PRO = "price_pro_test_h83";
    try {
      await upsertSubscription({
        subscription_id: "sub_h83_1",
        customer_id: "cust_h83_1",
        account_id: account.account_id,
        price_id: "price_pro_test_h83",
        status: "active",
        current_period_start: null,
        current_period_end: null,
        card_brand: null,
        card_last_four: null,
        cancel_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_event_created_at: null,
      });

      const summary = await getUsageCreditSummary(account.account_id, "paid");
      // Tier "paid" alone (no subscription) resolves to "starter" (75,000 credits) —
      // the active price-mapped subscription must win with "pro" (300,000 credits).
      expect(summary.plan_id).toBe("pro");
      expect(summary.monthly_allowance).toBe(300_000);
    } finally {
      delete process.env.STRIPE_PRICE_ID_PRO;
    }
  });
});

// ─── H-Phase-A cycle 1 — PAI'D Pro subscribers were silently metered as Starter ──
//
// Starter and Pro both collapse into the coarse "paid" BillingTier, and (unlike
// the Stripe-direct path above) PAI'D never writes a stripe_subscriptions row —
// it's the only live checkout path, so before this fix EVERY real Pro subscriber
// got the 75,000-credit Starter allowance instead of Pro's 300,000. The account's
// persisted paid_plan_id (written by paid-handlers.ts's webhook) must be the
// tiebreaker when no Stripe-direct subscription row exists.
describe("resolvePlanForAccount — PAI'D paid_plan_id disambiguates Starter vs Pro", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("a 'paid'-tier account with paid_plan_id='pro' (PAI'D checkout) is metered as pro, not starter", async () => {
    const account = await createAccount("PaidPro", "paidpro@example.com", "paid");
    await updateAccountPaidPlanId(account.account_id, "pro");

    const summary = await getUsageCreditSummary(account.account_id, "paid");
    expect(summary.plan_id).toBe("pro");
    expect(summary.monthly_allowance).toBe(300_000);
  });

  it("a 'paid'-tier account with paid_plan_id='starter' is metered as starter (unchanged default)", async () => {
    const account = await createAccount("PaidStarter", "paidstarter@example.com", "paid");
    await updateAccountPaidPlanId(account.account_id, "starter");

    const summary = await getUsageCreditSummary(account.account_id, "paid");
    expect(summary.plan_id).toBe("starter");
    expect(summary.monthly_allowance).toBe(75_000);
  });

  it("a 'paid'-tier account with no paid_plan_id (pre-existing accounts) still defaults to starter", async () => {
    const account = await createAccount("PaidNoPlan", "paidnoplan@example.com", "paid");

    const summary = await getUsageCreditSummary(account.account_id, "paid");
    expect(summary.plan_id).toBe("starter");
    expect(summary.monthly_allowance).toBe(75_000);
  });
});

describe("usage credit metering + referral token rewards", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("reduces tokens consumed for paid tier when referral rewards exist", async () => {
    const account = await createAccount("Paid", "paid@example.com", "paid");
    await getReferralCredits(account.account_id);

    await sql.run(
      "UPDATE referral_credits SET earned_credits_millicents = 20, last_reset_at = ?, updated_at = ? WHERE account_id = ?",
      [new Date().toISOString(), new Date().toISOString(), account.account_id],
    );

    const baseCredits = creditsFromUsdCents(1000);
    const charged = await consumeUsageCredits(account.account_id, "paid", "analyze_repo", 1000);

    expect(baseCredits).toBe(5556);
    expect(charged.credits_required).toBe(5555);
    expect(charged.included_credits_applied).toBe(5555);
    expect(charged.effective_overage_cents).toBe(0);
  });

  it("does not apply referral token reduction for free tier", async () => {
    const account = await createAccount("Free", "free@example.com", "free");
    await getReferralCredits(account.account_id);

    await sql.run(
      "UPDATE referral_credits SET earned_credits_millicents = 20, last_reset_at = ?, updated_at = ? WHERE account_id = ?",
      [new Date().toISOString(), new Date().toISOString(), account.account_id],
    );

    const baseCredits = creditsFromUsdCents(1000);
    const charged = await consumeUsageCredits(account.account_id, "free", "analyze_repo", 1000);

    expect(charged.credits_required).toBe(baseCredits);
  });

  it("resets referral token rewards when billing cycle changes", async () => {
    const account = await createAccount("Cycle", "cycle@example.com", "paid");
    await getReferralCredits(account.account_id);

    await sql.run(
      "UPDATE referral_credits SET earned_credits_millicents = 20, last_reset_at = ?, updated_at = ? WHERE account_id = ?",
      ["2026-01-15T00:00:00.000Z", "2026-01-15T00:00:00.000Z", account.account_id],
    );

    const modifier = await getReferralTokenUsageModifier(account.account_id);
    expect(modifier.reduction_rate).toBe(0);

    const credits = await getReferralCredits(account.account_id);
    expect(credits.earned_credits_millicents).toBe(0);
  });
});

describe("previewUsageCredits — read-only authorization gate", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  async function ledgerCount(account_id: string): Promise<number> {
    const row = await sql.one<{ n: number | string }>(
      "SELECT COUNT(*) as n FROM usage_credit_ledger WHERE account_id = ?",
      [account_id],
    );
    return Number(row?.n ?? 0);
  }

  it("computes the charge WITHOUT writing (no ledger row, allowance untouched)", async () => {
    const account = await createAccount("Preview", "preview@example.com", "free");
    const before = await getUsageCreditSummary(account.account_id, "free");

    const preview = await previewUsageCredits(account.account_id, "free", "analyze_repo", 50);
    expect(preview.credits_required).toBeGreaterThan(0);
    expect(preview.effective_overage_cents).toBe(0);
    // The gate must not touch state.
    expect(await ledgerCount(account.account_id)).toBe(0);
    expect((await getUsageCreditSummary(account.account_id, "free")).included_credits_used).toBe(
      before.included_credits_used,
    );

    // Committing the same charge DOES write — and matches the preview exactly.
    const charged = await consumeUsageCredits(account.account_id, "free", "analyze_repo", 50);
    expect(await ledgerCount(account.account_id)).toBe(1);
    expect(charged.credits_required).toBe(preview.credits_required);
    expect(charged.included_credits_applied).toBe(preview.included_credits_applied);
  });

  it("over-allowance call previews overage but writes nothing (no partial charge before a 402)", async () => {
    const account = await createAccount("Overage", "overage@example.com", "free");
    // ~11,112 credits required > the 10,000 free monthly allowance → overage.
    const preview = await previewUsageCredits(account.account_id, "free", "analyze_repo", 2000);
    expect(preview.overage_credits).toBeGreaterThan(0);
    expect(preview.effective_overage_cents).toBeGreaterThan(0);
    // The OLD path wrote the debit (consuming included credits + recording the
    // overage) and only THEN threw 402. The gate must commit nothing.
    expect(await ledgerCount(account.account_id)).toBe(0);
    expect((await getUsageCreditSummary(account.account_id, "free")).included_credits_used).toBe(0);
  });

  it("preview matches what consume would charge (gate ≡ commit)", async () => {
    const account = await createAccount("Match", "match@example.com", "paid");
    const preview = await previewUsageCredits(account.account_id, "paid", "iliad_embeddings", 50);
    const charged = await consumeUsageCredits(account.account_id, "paid", "iliad_embeddings", 50);
    expect(preview.credits_required).toBe(charged.credits_required);
    expect(preview.included_credits_applied).toBe(charged.included_credits_applied);
    expect(preview.effective_overage_cents).toBe(charged.effective_overage_cents);
  });

  it("counts concurrent consumes exactly — no lost update on the monthly counter", async () => {
    const account = await createAccount("RaceUse", "raceuse@example.com", "paid");
    const N = 8;
    const results = await Promise.all(
      Array.from({ length: N }, () => consumeUsageCredits(account.account_id, "paid", "analyze_repo", 1)),
    );

    // The persisted monthly counter must equal the sum of what every call applied;
    // a lost update (read-modify-write race) would leave it strictly lower.
    const sumApplied = results.reduce((s, r) => s + r.included_credits_applied, 0);
    const summary = await getUsageCreditSummary(account.account_id, "paid");
    expect(summary.included_credits_used).toBe(sumApplied);
  });

  it("does not deadlock the pool: many concurrent DISTINCT-account consumes all complete", async () => {
    // Distinct accounts do NOT serialize on the advisory lock, so this drives more
    // concurrent in-flight transactions than the pool has connections (default max 10).
    // If any consume did a POOL read while holding its tx connection, the pool would
    // starve and this would hang (caught here by the connection/test timeout).
    const N = 24;
    const accounts = await Promise.all(
      Array.from({ length: N }, (_, i) => createAccount("Multi" + i, "multi" + i + "@example.com", "paid")),
    );
    const results = await Promise.all(
      accounts.map((a) => consumeUsageCredits(a.account_id, "paid", "analyze_repo", 5)),
    );
    expect(results).toHaveLength(N);
    expect(results.every((r) => r.credits_required > 0)).toBe(true);
  }, 45_000);
});

// ─── grantUsageCredits (H2.4 — the compensator's make-good primitive) ────

describe("grantUsageCredits", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("reduces included_credits_used, growing remaining by the same credit count", async () => {
    const account = await createAccount("Grant", "grant@example.com", "paid");
    const charge = await consumeUsageCredits(account.account_id, "paid", "analyze_repo", 1000);
    const before = await getUsageCreditSummary(account.account_id, "paid");
    expect(before.included_credits_used).toBe(charge.included_credits_applied);

    const granted = await grantUsageCredits(account.account_id, "paid", 500);
    expect(granted).toBe(creditsFromUsdCents(500));

    const after = await getUsageCreditSummary(account.account_id, "paid");
    expect(after.included_credits_used).toBe(before.included_credits_used - granted);
    expect(after.included_credits_remaining).toBe(before.included_credits_remaining + granted);
  });

  it("seeds a fresh month row when the account has no usage yet, banking negative headroom", async () => {
    const account = await createAccount("FreshGrant", "fresh-grant@example.com", "paid");
    const granted = await grantUsageCredits(account.account_id, "paid", 200);
    expect(granted).toBeGreaterThan(0);

    const summary = await getUsageCreditSummary(account.account_id, "paid");
    // Nothing was ever consumed, yet remaining exceeds the base allowance —
    // proof the grant banked as negative included_credits_used, not a no-op.
    expect(summary.included_credits_remaining).toBe(summary.monthly_allowance + granted);
  });

  it("amountCents <= 0 is a no-op — no row written, nothing granted", async () => {
    const account = await createAccount("NoGrant", "no-grant@example.com", "paid");
    expect(await grantUsageCredits(account.account_id, "paid", 0)).toBe(0);
    expect(await grantUsageCredits(account.account_id, "paid", -50)).toBe(0);

    const row = await sql.one<{ n: string | number }>(
      "SELECT COUNT(*) as n FROM usage_credit_monthly WHERE account_id = ?",
      [account.account_id],
    );
    expect(Number(row?.n ?? 0)).toBe(0);
  });

  it("a grant is real spendable headroom — a later consume draws it down before creating overage", async () => {
    const account = await createAccount("SpendGrant", "spend-grant@example.com", "paid");
    const granted = await grantUsageCredits(account.account_id, "paid", 1000); // banks `granted` credits of headroom

    // Consume exactly `granted` credits worth of cents — should land entirely
    // within the included allowance (the banked headroom), zero overage.
    const centsForGrantedCredits = Math.floor((granted * 18) / 100) || 1;
    const charge = await consumeUsageCredits(account.account_id, "paid", "analyze_repo", centsForGrantedCredits);
    expect(charge.overage_credits).toBe(0);
    expect(charge.effective_overage_cents).toBe(0);
  });
});

// ─── Free trial carve-out (splitFromUsed's isFreeTrialActive() branch) ──────
//
// Verifies the exact contract the trial's design depends on: every call is
// fully covered (effective_overage_cents 0) AND the real monthly-allowance
// counter is left untouched — a heavy trial week must not leave an account's
// included_credits_used exhausted for the rest of that calendar month once
// the trial ends (usage_credit_monthly is keyed by month, not by trial
// window). Still writes the usage_credit_ledger row (analytics survive).
describe("consumeUsageCredits / previewUsageCredits — free trial carve-out", () => {
  const ENV_KEY = "AXIS_FREE_TRIAL_STARTED_AT";
  const original = process.env[ENV_KEY];

  beforeEach(async () => {
    await resetTestDb();
    delete process.env[ENV_KEY];
  });

  function startTrial(hoursAgo = 1): void {
    process.env[ENV_KEY] = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  }
  function restoreEnv(): void {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  }

  it("previewUsageCredits reports zero cost during an active trial, for a free-tier account", async () => {
    const account = await createAccount("TrialPreviewFree", "trial-preview-free@example.com", "free");
    startTrial();
    try {
      const charge = await previewUsageCredits(account.account_id, "free", "analyze_repo", 50);
      expect(charge.effective_overage_cents).toBe(0);
      expect(charge.overage_credits).toBe(0);
      expect(charge.credits_required).toBe(0);
    } finally {
      restoreEnv();
    }
  });

  it("previewUsageCredits reports zero cost during an active trial even at the highest engineer-mode price ($250)", async () => {
    const account = await createAccount("TrialPreviewEngineer", "trial-preview-engineer@example.com", "free");
    startTrial();
    try {
      const charge = await previewUsageCredits(account.account_id, "free", "prepare_agentic_purchasing", 25000);
      expect(charge.effective_overage_cents).toBe(0);
    } finally {
      restoreEnv();
    }
  });

  it("consumeUsageCredits does not increment included_credits_used during an active trial", async () => {
    const account = await createAccount("TrialConsume", "trial-consume@example.com", "paid");
    startTrial();
    try {
      const before = await getUsageCreditSummary(account.account_id, "paid");
      expect(before.included_credits_used).toBe(0);

      const charge = await consumeUsageCredits(account.account_id, "paid", "analyze_repo", 50);
      expect(charge.effective_overage_cents).toBe(0);
      expect(charge.included_credits_used).toBe(0); // unchanged, not incremented

      const after = await getUsageCreditSummary(account.account_id, "paid");
      expect(after.included_credits_used).toBe(0);
      expect(after.included_credits_remaining).toBe(before.included_credits_remaining); // full allowance still there
    } finally {
      restoreEnv();
    }
  });

  it("consumeUsageCredits still writes a usage_credit_ledger row during the trial, at credits_required 0 — the signature that distinguishes a trial-covered call from a normal one", async () => {
    const account = await createAccount("TrialLedger", "trial-ledger@example.com", "paid");
    startTrial();
    try {
      await consumeUsageCredits(account.account_id, "paid", "analyze_repo", 50);
    } finally {
      restoreEnv();
    }
    const row = await sql.one<{ amount_cents: number; credits_required: number }>(
      "SELECT amount_cents, credits_required FROM usage_credit_ledger WHERE account_id = ? AND tool = ?",
      [account.account_id, "analyze_repo"],
    );
    expect(row).toBeTruthy();
    expect(Number(row!.amount_cents)).toBe(50); // the real nominal price, not zeroed
    expect(Number(row!.credits_required)).toBe(0); // but nothing was actually required/drawn down
  });

  it("a prior real (pre-trial) consume's included_credits_used is preserved untouched by a later trial-covered call", async () => {
    const account = await createAccount("TrialPreservesPrior", "trial-preserves-prior@example.com", "paid");
    // Real consume BEFORE the trial starts.
    const before = await consumeUsageCredits(account.account_id, "paid", "analyze_repo", 50);
    expect(before.included_credits_used).toBeGreaterThan(0);
    const usedBeforeTrial = before.included_credits_used;

    startTrial();
    try {
      await consumeUsageCredits(account.account_id, "paid", "iliad_llm_inference", 2);
      const summary = await getUsageCreditSummary(account.account_id, "paid");
      // Unchanged by the trial-covered call — still exactly what the real
      // pre-trial call left it at, not reset to 0 and not incremented further.
      expect(summary.included_credits_used).toBe(usedBeforeTrial);
    } finally {
      restoreEnv();
    }
  });

  it("reverts to real metering the instant the trial window closes — no lingering free access", async () => {
    const account = await createAccount("TrialReverts", "trial-reverts@example.com", "free");
    // A trial that started 8 days ago has already ended (7-day window).
    process.env[ENV_KEY] = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const charge = await consumeUsageCredits(account.account_id, "free", "analyze_repo", 50);
      // Free tier's normal real math: no included allowance consumed by "free"
      // plan credits for this path at this price is plausible, so just assert
      // this is REAL math (credits_required matches creditsFromUsdCents), not
      // the trial's forced-zero shortcut.
      expect(charge.credits_required).toBe(creditsFromUsdCents(50));
    } finally {
      restoreEnv();
    }
  });
});
