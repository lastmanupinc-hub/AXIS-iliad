import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { createAccount } from "./billing-store.js";
import {
  creditsFromUsdCents,
  previewUsageCredits,
  consumeUsageCredits,
  getUsageCreditSummary,
} from "./usage-credit-metering.js";
import { getReferralCredits, getReferralTokenUsageModifier } from "./referral-store.js";

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
