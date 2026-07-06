import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { createAccount } from "./billing-store.js";
import { PLAN_CATALOG } from "./funnel-types.js";
import { creditsFromUsdCents, getUsageCreditSummary, consumeUsageCredits } from "./usage-credit-metering.js";
import { getReferralCredits, getReferralTokenUsageModifier } from "./referral-store.js";
import {
  MARKETED_TIERS,
  OVERAGE_USD_PER_CREDIT,
  OVERAGE_CENTS_PER_CREDIT,
  REFERRAL_MAX_REDUCTION_RATE,
  type MarketedPlanId,
} from "./pricing-constants.js";

// packages/snapshots/src -> repo root
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const byId = (id: MarketedPlanId) => MARKETED_TIERS.find((t) => t.plan_id === id)!;

// ─── Pure constant shape (no DB) ─────────────────────────────────

describe("MARKETED_TIERS — monthly credit grants", () => {
  it("free/starter/pro/growth grant the marketed credits", () => {
    expect(byId("free").monthly_credits).toBe(10_000);
    expect(byId("starter").monthly_credits).toBe(75_000);
    expect(byId("pro").monthly_credits).toBe(300_000);
    expect(byId("growth").monthly_credits).toBe(1_200_000);
  });
});

describe("MARKETED_TIERS — monthly prices", () => {
  it("free/starter/pro/growth price at the marketed cents", () => {
    expect(byId("free").price_monthly_cents).toBe(0);
    expect(byId("starter").price_monthly_cents).toBe(2900);
    expect(byId("pro").price_monthly_cents).toBe(9900);
    expect(byId("growth").price_monthly_cents).toBe(29900);
  });
});

describe("rate constants", () => {
  it("overage and referral cap rates match the marketed values", () => {
    expect(OVERAGE_USD_PER_CREDIT).toBe(0.0018);
    expect(OVERAGE_CENTS_PER_CREDIT).toBe(0.18);
    expect(REFERRAL_MAX_REDUCTION_RATE).toBe(0.0002);
  });
});

// ─── Catalog plane consistency (no DB) ───────────────────────────

describe("PLAN_CATALOG plane consistency", () => {
  it("PLAN_CATALOG prices and highlights agree with MARKETED_TIERS for every marketed tier", () => {
    for (const t of MARKETED_TIERS) {
      const plan = PLAN_CATALOG.find((p) => p.id === t.plan_id);
      expect(plan, `PLAN_CATALOG is missing plan_id "${t.plan_id}"`).toBeTruthy();
      expect(plan!.price_monthly_cents).toBe(t.price_monthly_cents);
      const creditsLabel = `${t.monthly_credits.toLocaleString("en-US")} monthly credits`;
      expect(plan!.highlights, `${t.plan_id} highlights missing "${creditsLabel}"`).toContain(creditsLabel);
    }
  });
});

// ─── Metering plane consistency (DB-gated) ───────────────────────

describe("usage-credit-metering plane consistency", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("free tier resolves to the free grant (10,000)", async () => {
    const account = await createAccount("Free", "free-plane@example.com", "free");
    const summary = await getUsageCreditSummary(account.account_id, "free");
    expect(summary.plan_id).toBe("free");
    expect(summary.monthly_allowance).toBe(byId("free").monthly_credits);
    expect(summary.monthly_allowance).toBe(10_000);
  });

  it("paid tier resolves to the starter grant (75,000)", async () => {
    const account = await createAccount("Paid", "paid-plane@example.com", "paid");
    const summary = await getUsageCreditSummary(account.account_id, "paid");
    expect(summary.plan_id).toBe("starter");
    expect(summary.monthly_allowance).toBe(byId("starter").monthly_credits);
    expect(summary.monthly_allowance).toBe(75_000);
  });

  it("suite tier resolves to the growth grant (1,200,000)", async () => {
    const account = await createAccount("Suite", "suite-plane@example.com", "suite");
    const summary = await getUsageCreditSummary(account.account_id, "suite");
    expect(summary.plan_id).toBe("growth");
    expect(summary.monthly_allowance).toBe(byId("growth").monthly_credits);
    expect(summary.monthly_allowance).toBe(1_200_000);
  });
});

// ─── Behavioral overage + round-trip (DB-gated) ──────────────────

describe("overage math — $0.0018/credit ($0.18/credit in cents)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("exceeding a free account's 10,000 allowance by exactly 10,000 credits charges Math.ceil(10_000 * OVERAGE_CENTS_PER_CREDIT) = 1800 cents", async () => {
    const account = await createAccount("Overage", "overage-plane@example.com", "free");
    // $36.00 -> creditsFromUsdCents(3600) === 20_000 credits required, exactly
    // 10_000 over the free account's 10_000 monthly allowance.
    const amountCents = 3600;
    expect(creditsFromUsdCents(amountCents)).toBe(20_000);

    const charged = await consumeUsageCredits(account.account_id, "free", "analyze_repo", amountCents);
    expect(charged.included_credits_applied).toBe(10_000);
    expect(charged.overage_credits).toBe(10_000);
    expect(charged.effective_overage_cents).toBe(Math.ceil(10_000 * OVERAGE_CENTS_PER_CREDIT));
    expect(charged.effective_overage_cents).toBe(1800);
  });

  it("round-trip: creditsFromUsdCents(1800) === 10,000 (the $0.0018 rate is symmetric)", () => {
    expect(creditsFromUsdCents(1800)).toBe(10_000);
  });
});

// ─── Behavioral referral cap (DB-gated) ──────────────────────────

describe("referral reduction rate cap — 0.02% (0.0002) per call", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("caps reduction_rate at REFERRAL_MAX_REDUCTION_RATE even with a huge earned balance", async () => {
    const account = await createAccount("Referral", "referral-plane@example.com", "paid");
    // Seed the row first so it exists, then overwrite the balance directly.
    await getReferralCredits(account.account_id);

    // Must also seed last_reset_at to the CURRENT month — otherwise
    // getReferralCredits -> resetCreditsIfBillingCycleChanged sees a stale
    // month and zeroes earned_credits_millicents before the modifier is read.
    const now = new Date().toISOString();
    await sql.run(
      "UPDATE referral_credits SET earned_credits_millicents = ?, last_reset_at = ?, updated_at = ? WHERE account_id = ?",
      [10_000_000, now, now, account.account_id],
    );

    const modifier = await getReferralTokenUsageModifier(account.account_id);
    expect(modifier.reduction_rate).toBe(REFERRAL_MAX_REDUCTION_RATE);
    expect(modifier.reduction_rate).toBe(0.0002);
  });
});

// ─── ForAgents page drift-guard (no DB) ──────────────────────────

describe("ForAgentsPage.tsx drift guard vs MARKETED_TIERS", () => {
  it("every marketed number on the ForAgents page matches the live constants", () => {
    const page = readFileSync(join(ROOT, "apps", "web", "src", "pages", "ForAgentsPage.tsx"), "utf8");

    for (const t of MARKETED_TIERS) {
      if (t.price_monthly_cents > 0) {
        const priceLabel = `$${t.price_monthly_cents / 100}`;
        expect(page, `ForAgentsPage.tsx missing "${priceLabel}"`).toContain(priceLabel);
      }
      const creditsLabel = t.monthly_credits.toLocaleString("en-US");
      expect(page, `ForAgentsPage.tsx missing "${creditsLabel}"`).toContain(creditsLabel);
    }

    expect(page).toContain("$29");
    expect(page).toContain("75,000");
    expect(page).toContain("$99");
    expect(page).toContain("300,000");
    expect(page).toContain("$299");
    expect(page).toContain("1,200,000");
    expect(page).toContain(`$${OVERAGE_USD_PER_CREDIT} per credit`);
    expect(page).toContain(`${(REFERRAL_MAX_REDUCTION_RATE * 100).toFixed(2)}% per call`);
  });
});
