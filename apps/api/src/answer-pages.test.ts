// The web's answer page "What does an Iliad analysis cost?" (apps/web/src/answers.ts, 2026-11-04, the estate's
// foundation check F09) states prices, credits and limits as facts. Every one of them is held equal here to the code
// that charges them, so a price change fails this test by name instead of leaving the page wrong. apps/api never
// imports apps/web (monorepo-boundaries.test.ts), so PRICING is read from answers.ts as text, the way
// count-honesty.test.ts reads the web copy; apps/web/src/answers.test.tsx holds the page's sentences to PRICING.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRICING_TIERS } from "@axis/mpp";
import {
  MARKETED_TIERS,
  OVERAGE_USD_PER_CREDIT,
  PLAN_CATALOG,
  PERSISTENCE_CREDIT_PACKS,
  TIER_LIMITS,
  creditsFromUsdCents,
} from "@axis/snapshots";

const ANSWERS_TS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "src", "answers.ts");

interface Pricing {
  analyzeStandardCents: number;
  analyzeEngineerCents: number;
  usdPerCredit: number;
  standardCredits: number;
  engineerCredits: number;
  plans: { id: string; name: string; monthlyCents: number; credits: number }[];
  annualDiscountPercent: number;
  freeSnapshotsPerMonth: number;
  freeProjects: number;
  paidSnapshotsPerMonth: number;
  packs: { credits: number; priceCents: number }[];
}

/** The PRICING object literal in answers.ts: plain numbers and strings, evaluated on its own. */
function readPricing(): Pricing {
  const src = readFileSync(ANSWERS_TS, "utf8").replace(/\r\n/g, "\n");
  const m = /export const PRICING = (\{[\s\S]*?\n\}) as const;/.exec(src);
  if (!m) throw new Error("PRICING not found in apps/web/src/answers.ts");
  if (/[`$()]|=>|\bfunction\b/.test(m[1])) throw new Error("PRICING must stay a literal of numbers and strings");
  return new Function(`return (${m[1]});`)() as Pricing;
}

const PRICING = readPricing();

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
});
