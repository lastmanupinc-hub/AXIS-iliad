import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { createAccount } from "./billing-store.js";
import { PLAN_CATALOG, PLAN_FEATURES } from "./funnel-types.js";
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

// H-Phase-A cycle 13: a plain `text.toContain("$29")` false-positives on
// "$299" (Growth's real, correct price) being present anywhere on the same
// page — "$299".includes("$29") is true — silently satisfying Starter's
// price check regardless of whether Starter's own mention is right. Anchor
// on a non-digit boundary so "$29" can never match inside "$299"/"$290"/etc.
function containsPrice(text: string, priceMonthlyCents: number): boolean {
  const dollars = priceMonthlyCents / 100;
  return new RegExp(`\\$${dollars}(?!\\d)`).test(text);
}

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

  // H-Phase-A cycle 10: price_annual_cents used to be a hand-typed literal
  // per tier with no cross-check against price_monthly_cents — a 4th
  // recurrence of the hand-duplicated-price-table shape. "Annual billing
  // saves 20%" is stated in every paid tier's own highlights, so the
  // relationship is exact: 12 months at 20% off.
  it("PLAN_CATALOG's annual price is always exactly 12 months at the stated 20% discount off the monthly price", () => {
    for (const plan of PLAN_CATALOG) {
      if (plan.id === "enterprise") continue; // custom/negotiated pricing — -1 is a real sentinel
      expect(plan.price_annual_cents, `${plan.id}'s annual price`).toBe(Math.round(plan.price_monthly_cents * 12 * 0.8));
    }
  });

  // PLAN_FEATURES' "Monthly credits" row is pure marketing copy (nothing
  // programmatic reads it — unlike its "Team seats" row, which
  // resolveSeatLimit genuinely treats as the source of truth) — it used to
  // duplicate MARKETED_TIERS.monthly_credits by hand with no cross-check.
  it("PLAN_FEATURES' Monthly credits row agrees with MARKETED_TIERS for every marketed tier", () => {
    const row = PLAN_FEATURES.find((f) => f.name === "Monthly credits")!;
    expect(row).toBeDefined();
    const planIdToFeatureKey: Record<MarketedPlanId, "free" | "starter" | "pro" | "growth"> = {
      free: "free", starter: "starter", pro: "pro", growth: "growth",
    };
    for (const t of MARKETED_TIERS) {
      expect(row[planIdToFeatureKey[t.plan_id]], `Monthly credits.${t.plan_id}`).toBe(t.monthly_credits);
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
    // getReferralCredits -> resetCreditsIfCalendarMonthChanged sees a stale
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
        expect(containsPrice(page, t.price_monthly_cents), `ForAgentsPage.tsx missing "$${t.price_monthly_cents / 100}"`).toBe(true);
      }
      const creditsLabel = t.monthly_credits.toLocaleString("en-US");
      expect(page, `ForAgentsPage.tsx missing "${creditsLabel}"`).toContain(creditsLabel);
    }

    expect(page).toContain(`$${OVERAGE_USD_PER_CREDIT} per credit`);
    expect(page).toContain(`${(REFERRAL_MAX_REDUCTION_RATE * 100).toFixed(2)}% per call`);
  });
});

// H-Phase-A cycle 13: the SAME "$29/75,000, $99/300,000, $299/1,200,000"
// prose is hand-typed in 4 more web pages, flagged (not fixed) as a drift
// risk by both cycle 12's and cycle 13's audits — currently correct, but
// with zero guard against the next price change landing in some but not
// all of these. Same idiom as the ForAgentsPage guard above, applied to
// every file that repeats the marketed price+credits as prose.
describe("Other marketed-price mentions drift guard vs MARKETED_TIERS (no DB)", () => {
  // Each file mentions a different subset of tiers (UsagePage.tsx, for
  // instance, only ever upsells the two tiers above the reader's current
  // one) — check only the plan_ids each file actually names, not every tier.
  const FILES: Array<{ file: string; plan_ids: MarketedPlanId[] }> = [
    { file: "HelpPage.tsx", plan_ids: ["free", "starter", "pro", "growth"] },
    { file: "QAPage.tsx", plan_ids: ["free", "starter", "pro", "growth"] },
    { file: "TermsPage.tsx", plan_ids: ["starter", "pro", "growth"] },
    { file: "UsagePage.tsx", plan_ids: ["starter", "growth"] },
  ];

  it.each(FILES)("every marketed price+credits number on $file matches the live constants", ({ file, plan_ids }) => {
    const page = readFileSync(join(ROOT, "apps", "web", "src", "pages", file), "utf8");
    for (const id of plan_ids) {
      const t = byId(id);
      if (t.price_monthly_cents > 0) {
        expect(containsPrice(page, t.price_monthly_cents), `${file} missing "$${t.price_monthly_cents / 100}"`).toBe(true);
      }
      const creditsLabel = t.monthly_credits.toLocaleString("en-US");
      expect(page, `${file} missing "${creditsLabel}"`).toContain(creditsLabel);
    }
  });

  // PlansPage.tsx's fallback tier data stores price_monthly_cents as a number
  // (not a "$X" string), so it's checked numerically instead of by substring.
  it("PlansPage.tsx's fallback pricing data matches the live constants", () => {
    const page = readFileSync(join(ROOT, "apps", "web", "src", "pages", "PlansPage.tsx"), "utf8");
    for (const t of MARKETED_TIERS) {
      if (t.price_monthly_cents > 0) {
        // Boundary-anchored: "9900" (Pro) is a raw substring of "29900" (Growth),
        // so a plain .toContain would false-pass Pro's cents check off Growth's.
        const found = new RegExp(`(?<!\\d)${t.price_monthly_cents}(?!\\d)`).test(page);
        expect(found, `PlansPage.tsx missing price_monthly_cents: ${t.price_monthly_cents}`).toBe(true);
      }
      const creditsLabel = t.monthly_credits.toLocaleString("en-US");
      expect(page, `PlansPage.tsx missing "${creditsLabel}"`).toContain(creditsLabel);
    }
  });
});
