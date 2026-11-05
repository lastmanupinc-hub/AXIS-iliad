// The web's answer page "What does an Iliad analysis cost?" (apps/web/src/answers.ts, 2026-11-04, the estate's
// foundation check F09) states prices, credits and limits as facts. Every one of them is held equal here to the code
// that charges them, so a price change fails this test by name instead of leaving the page wrong.
import { describe, it, expect } from "vitest";
import { PRICING_TIERS } from "@axis/mpp";
import {
  MARKETED_TIERS,
  OVERAGE_USD_PER_CREDIT,
  PLAN_CATALOG,
  PERSISTENCE_CREDIT_PACKS,
  TIER_LIMITS,
  creditsFromUsdCents,
} from "@axis/snapshots";
import { PRICING, answerFor } from "../../web/src/answers.ts";

describe("the cost answer page states the pricing code's numbers", () => {
  it("prices a standard and an engineer analyze_repo as PRICING_TIERS does", () => {
    expect(PRICING.analyzeStandardCents).toBe(PRICING_TIERS.analyze_repo.standard_cents);
    expect(PRICING.analyzeEngineerCents).toBe(PRICING_TIERS.analyze_repo.engineer_cents);
    // Lite is retired: it returns the free files at no charge, as the page says.
    expect(PRICING_TIERS.analyze_repo.lite_cents).toBe(0);
  });

  it("converts them to credits as the metering does", () => {
    expect(PRICING.usdPerCredit).toBe(OVERAGE_USD_PER_CREDIT);
    expect(PRICING.standardCredits).toBe(creditsFromUsdCents(PRICING_TIERS.analyze_repo.standard_cents));
    expect(PRICING.engineerCredits).toBe(creditsFromUsdCents(PRICING_TIERS.analyze_repo.engineer_cents!));
  });

  it("names every marketed plan with its price and monthly credits", () => {
    expect(PRICING.plans.map((p) => ({ plan_id: p.id, price_monthly_cents: p.monthlyCents, monthly_credits: p.credits })))
      .toEqual(MARKETED_TIERS.map((t) => ({ plan_id: t.plan_id, price_monthly_cents: t.price_monthly_cents, monthly_credits: t.monthly_credits })));
  });

  it("gives the annual prices the plan catalog charges", () => {
    for (const p of PRICING.plans.filter((x) => x.monthlyCents > 0)) {
      const cat = PLAN_CATALOG.find((c) => c.id === p.id)!;
      expect(Math.round(p.monthlyCents * 12 * (1 - PRICING.annualDiscountPercent / 100)), p.id).toBe(cat.price_annual_cents);
    }
  });

  it("states the free and paid analysis limits TIER_LIMITS enforces", () => {
    expect(PRICING.freeSnapshotsPerMonth).toBe(TIER_LIMITS.free.max_snapshots_per_month);
    expect(PRICING.freeProjects).toBe(TIER_LIMITS.free.max_projects);
    expect(PRICING.paidSnapshotsPerMonth).toBe(TIER_LIMITS.paid.max_snapshots_per_month);
    expect(TIER_LIMITS.suite.max_snapshots_per_month).toBe(-1); // "Growth has no monthly cap"
  });

  it("lists the credit packs as sold", () => {
    expect(PRICING.packs.map((p) => [p.credits, p.priceCents])).toEqual(PERSISTENCE_CREDIT_PACKS.map((p) => [p.credits, p.price_cents]));
  });

  it("writes the numbers into the answer itself", () => {
    const a = answerFor("what-does-iliad-cost").answer;
    expect(a).toContain(`$${(PRICING_TIERS.analyze_repo.standard_cents / 100).toFixed(2)}`);
    expect(a).toContain(creditsFromUsdCents(PRICING_TIERS.analyze_repo.standard_cents).toLocaleString("en-US"));
    for (const t of MARKETED_TIERS.filter((x) => x.price_monthly_cents > 0)) {
      expect(a).toContain(`$${t.price_monthly_cents / 100}`);
      expect(a).toContain(t.monthly_credits.toLocaleString("en-US"));
    }
  });
});
