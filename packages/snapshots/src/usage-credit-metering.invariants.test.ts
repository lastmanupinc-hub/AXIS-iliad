// ─── H8.2 — money-math invariants (property-style, seeded PRNG) ─────────────
//
// ~1,000 seeded (allowance, used, amountCents) tuples driven through the REAL
// exported surface of usage-credit-metering.ts (the pure split — splitFromUsed —
// is module-private, so the invariants are asserted via previewUsageCredits,
// which is read-only, and consumeUsageCredits for accumulation):
//
//   (1) conservation      included_credits_applied + overage_credits === credits_required
//   (2) non-negativity    included_credits_applied ≥ 0 ∧ overage_credits ≥ 0
//   (3) allowance cap     included_credits_applied ≤ max(0, allowance − used)
//   (4) accumulation      sequential consumes accumulate exactly (no lost updates,
//                         single-threaded), and N small consumes ≡ one big consume
//
// The PRNG is a hand-rolled mulberry32 — deterministic, zero dependencies.
// Math.random is deliberately avoided: a failure must replay byte-for-byte, so
// every assertion message embeds SEED + the exact tuple that produced it.
// Dep-gated upgrade path: fast-check (HARDEN_POLISH_LOOP.md H8.2).
import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { createAccount } from "./billing-store.js";
import type { BillingTier } from "./billing-types.js";
import { MARKETED_TIERS } from "./pricing-constants.js";
import {
  creditsFromUsdCents,
  previewUsageCredits,
  consumeUsageCredits,
  getUsageCreditSummary,
} from "./usage-credit-metering.js";

// "H8.2" in ASCII (0x48 0x38 0x2E 0x32). Fixed forever — the suite is only
// reproducible if this never drifts casually.
const SEED = 0x48382e32;

/** mulberry32 — tiny deterministic PRNG, uniform in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in [lo, hi], inclusive. */
function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// usage_credit_monthly.included_credits_used is Postgres INTEGER (int4), so any
// `used` we seed into the DB must respect it. amountCents in the PREVIEW tuples
// is never written anywhere, so it may roam far higher — capped at 2^45 cents
// (≈ $351B → ~1.9e14 credits) to stay comfortably inside float-safe integers.
const INT4_MAX = 2_147_483_647;
const HUGE_CENTS_MAX = 2 ** 45;

// The three plans reachable through the tier → plan mapping WITHOUT seeding
// Stripe subscription rows (free→free, paid→starter, suite→growth). `pro` and
// the 0-allowance `enterprise` plan need a subscription row; allowance==used
// and used>allowance edges cover the small-allowance geometry regardless.
const marketed = Object.fromEntries(MARKETED_TIERS.map((t) => [t.plan_id, t.monthly_credits]));
const PLANS: ReadonlyArray<{ tier: BillingTier; plan_id: string; allowance: number }> = [
  { tier: "free", plan_id: "free", allowance: marketed.free },
  { tier: "paid", plan_id: "starter", allowance: marketed.starter },
  { tier: "suite", plan_id: "growth", allowance: marketed.growth },
];

function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Force the month counter to an exact value — the `used` leg of each tuple. */
async function seedIncludedUsed(
  account_id: string,
  plan_id: string,
  allowance: number,
  used: number,
): Promise<void> {
  const now = new Date().toISOString();
  await sql.run(
    `INSERT INTO usage_credit_monthly
       (account_id, month_key, plan_id, monthly_allowance, included_credits_used, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, month_key) DO UPDATE SET
       included_credits_used = excluded.included_credits_used,
       updated_at = excluded.updated_at`,
    [account_id, monthKey(), plan_id, allowance, used, now],
  );
}

describe("H8.2 — money-math invariants (seed 0x48382e32)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("creditsFromUsdCents: integer, 0 iff non-positive, ≥1 for positive, monotone (1,000 seeded cases)", () => {
    const rng = mulberry32(SEED);

    // Non-finite and non-positive specials are all "no charge".
    for (const cents of [0, -1, -1_000_000_000, NaN, Infinity, -Infinity]) {
      expect(creditsFromUsdCents(cents), `special cents=${cents}`).toBe(0);
    }

    const seen: Array<{ cents: number; credits: number }> = [];
    for (let i = 0; i < 1_000; i++) {
      const band = randInt(rng, 0, 4);
      const cents =
        band === 0
          ? -randInt(rng, 0, 10_000) // non-positive → 0 credits
          : band === 1
            ? randInt(rng, 1, 200) // tiny — exercises the 1-credit floor region
            : band === 2
              ? randInt(rng, 1, 100_000)
              : band === 3
                ? randInt(rng, 1, 10_000_000)
                : randInt(rng, 1_000_000_000, HUGE_CENTS_MAX);
      const credits = creditsFromUsdCents(cents);
      const ctx = `seed=0x${SEED.toString(16)} case=${i} cents=${cents}`;
      expect(Number.isInteger(credits), `integer credits: ${ctx}`).toBe(true);
      if (cents <= 0) {
        expect(credits, `non-positive cents charge nothing: ${ctx}`).toBe(0);
      } else {
        expect(credits, `positive cents charge ≥ 1 credit: ${ctx}`).toBeGreaterThanOrEqual(1);
      }
      seen.push({ cents, credits });
    }

    // Monotone: more cents never costs fewer credits.
    seen.sort((a, b) => a.cents - b.cents);
    for (let i = 1; i < seen.length; i++) {
      expect(
        seen[i].credits,
        `monotonicity: seed=0x${SEED.toString(16)} cents ${seen[i - 1].cents}→${seen[i].cents}`,
      ).toBeGreaterThanOrEqual(seen[i - 1].credits);
    }

    // Multiples of 18 cents are credit-exact (18k cents = 100k credits) — the
    // float quotient 18k/0.18 never crosses a ceil boundary (probed dense to
    // k=20M with zero wobbles; these draws are deterministic, so green here is
    // a permanent proof for the drawn values).
    for (let i = 0; i < 200; i++) {
      const k = randInt(rng, 1, 20_000_000);
      expect(
        creditsFromUsdCents(18 * k),
        `credit-exact multiple: seed=0x${SEED.toString(16)} k=${k}`,
      ).toBe(100 * k);
    }
  });

  it("split invariants hold for ~1,000 seeded (allowance, used, amountCents) tuples", async () => {
    const rng = mulberry32(SEED);
    const CASES_PER_PLAN = 334; // 3 plans × 334 = 1,002 tuples

    for (const plan of PLANS) {
      const account = await createAccount(
        `Inv-${plan.plan_id}`,
        `invariants-${plan.plan_id}@example.com`,
        plan.tier,
      );

      for (let i = 0; i < CASES_PER_PLAN; i++) {
        const { allowance } = plan;

        // `used` bands: exact boundaries, banked-negative headroom (reachable in
        // production via grantUsageCredits), mid-range, and the int4 ceiling
        // (reachable via a mid-month plan downgrade leaving used > allowance).
        const usedBand = randInt(rng, 0, 7);
        const used =
          usedBand === 0
            ? 0
            : usedBand === 1
              ? 1
              : usedBand === 2
                ? allowance - 1
                : usedBand === 3
                  ? allowance
                  : usedBand === 4
                    ? allowance + 1
                    : usedBand === 5
                      ? -randInt(rng, 1, 200_000)
                      : usedBand === 6
                        ? randInt(rng, 0, Math.min(2 * allowance, INT4_MAX))
                        : INT4_MAX - randInt(rng, 0, 1);

        // amountCents bands: 0 and negative (the deliberate 1-credit minimum
        // floor), 1 cent, small, large, and huge (preview-only, never written).
        const amtBand = randInt(rng, 0, 5);
        const amountCents =
          amtBand === 0
            ? 0
            : amtBand === 1
              ? -randInt(rng, 1, 1_000)
              : amtBand === 2
                ? 1
                : amtBand === 3
                  ? randInt(rng, 1, 5_000)
                  : amtBand === 4
                    ? randInt(rng, 1, 10_000_000)
                    : randInt(rng, 1_000_000_000_000, HUGE_CENTS_MAX);

        await seedIncludedUsed(account.account_id, plan.plan_id, allowance, used);
        const r = await previewUsageCredits(account.account_id, plan.tier, "invariant_probe", amountCents);

        const ctx =
          `seed=0x${SEED.toString(16)} plan=${plan.plan_id} case=${i} ` +
          `(allowance=${allowance}, used=${used}, amountCents=${amountCents})`;

        // Plan resolution drift guard — every later assertion assumes this allowance.
        expect(r.monthly_allowance, `allowance resolution: ${ctx}`).toBe(allowance);

        // (1) conservation — every required credit is either included or overage.
        expect(
          r.included_credits_applied + r.overage_credits,
          `conservation (included + overage === required): ${ctx}`,
        ).toBe(r.credits_required);

        // (2) non-negativity — neither leg of the split may go negative.
        expect(r.included_credits_applied, `non-negative applied: ${ctx}`).toBeGreaterThanOrEqual(0);
        expect(r.overage_credits, `non-negative overage: ${ctx}`).toBeGreaterThanOrEqual(0);

        // (3) cap — never apply more included credits than the remaining allowance.
        const remainingBefore = Math.max(0, allowance - used);
        expect(
          r.included_credits_applied,
          `cap (applied ≤ remaining allowance ${remainingBefore}): ${ctx}`,
        ).toBeLessThanOrEqual(remainingBefore);

        // (4) bookkeeping — the post-charge counters are exactly pre + applied.
        expect(r.included_credits_used, `post-charge used bookkeeping: ${ctx}`).toBe(
          used + r.included_credits_applied,
        );
        expect(r.included_credits_remaining, `post-charge remaining bookkeeping: ${ctx}`).toBe(
          Math.max(0, allowance - (used + r.included_credits_applied)),
        );
        // Ledger is empty in this test, so this month's overage is just this call's.
        expect(r.overage_credits_this_month, `month-overage bookkeeping: ${ctx}`).toBe(
          r.overage_credits,
        );

        // DB path ≡ pure exported path (no referral rewards seeded → modifier 0),
        // including the deliberate ≥1-credit floor for non-positive amounts.
        expect(r.credits_required, `credits_required vs creditsFromUsdCents: ${ctx}`).toBe(
          Math.max(1, creditsFromUsdCents(amountCents)),
        );

        // Money fields are integers — no float dust in any persisted-shape field.
        expect(
          Number.isInteger(r.credits_required) &&
            Number.isInteger(r.included_credits_applied) &&
            Number.isInteger(r.overage_credits) &&
            Number.isInteger(r.included_credits_used) &&
            Number.isInteger(r.included_credits_remaining) &&
            Number.isInteger(r.effective_overage_cents),
          `integer money fields: ${ctx}`,
        ).toBe(true);
      }
    }
  }, 240_000);

  it("sequential consumes accumulate exactly — no lost updates single-threaded (60 seeded consumes)", async () => {
    const rng = mulberry32(SEED);
    const plan = PLANS[1]; // starter: 75,000 — the seeded amounts cross the boundary early,
    const account = await createAccount("Inv-seq", "invariants-seq@example.com", plan.tier);

    const K = 60;
    let prevUsed = 0;
    let prevOverage = 0;
    let sumRequired = 0;
    let sumApplied = 0;
    let sumOverage = 0;

    for (let i = 0; i < K; i++) {
      const amountCents = randInt(rng, 1, 40_000);
      const r = await consumeUsageCredits(account.account_id, plan.tier, "invariant_seq", amountCents);
      const ctx =
        `seed=0x${SEED.toString(16)} step=${i} ` +
        `(allowance=${plan.allowance}, usedBefore=${prevUsed}, amountCents=${amountCents})`;

      // The four invariants hold on the consume (write) path too.
      expect(
        r.included_credits_applied + r.overage_credits,
        `conservation: ${ctx}`,
      ).toBe(r.credits_required);
      expect(r.included_credits_applied, `non-negative applied: ${ctx}`).toBeGreaterThanOrEqual(0);
      expect(r.overage_credits, `non-negative overage: ${ctx}`).toBeGreaterThanOrEqual(0);
      expect(
        r.included_credits_applied,
        `cap (applied ≤ remaining): ${ctx}`,
      ).toBeLessThanOrEqual(Math.max(0, plan.allowance - prevUsed));

      // Exact running accumulation — a lost update would break one of these.
      expect(r.included_credits_used, `running used accumulates exactly: ${ctx}`).toBe(
        prevUsed + r.included_credits_applied,
      );
      expect(r.overage_credits_this_month, `running overage accumulates exactly: ${ctx}`).toBe(
        prevOverage + r.overage_credits,
      );

      prevUsed = r.included_credits_used;
      prevOverage = r.overage_credits_this_month;
      sumRequired += r.credits_required;
      sumApplied += r.included_credits_applied;
      sumOverage += r.overage_credits;
    }

    // Terminal state: persisted counters equal the sums of every per-call result.
    const summary = await getUsageCreditSummary(account.account_id, plan.tier);
    const ctx = `seed=0x${SEED.toString(16)} terminal (allowance=${plan.allowance}, K=${K})`;
    expect(summary.included_credits_used, `persisted used === Σ applied: ${ctx}`).toBe(sumApplied);
    expect(summary.overage_credits_this_month, `persisted overage === Σ overage: ${ctx}`).toBe(
      sumOverage,
    );
    expect(summary.included_credits_remaining, `persisted remaining: ${ctx}`).toBe(
      Math.max(0, plan.allowance - sumApplied),
    );

    // And the ledger agrees row-for-row — nothing double-counted, nothing dropped.
    const ledger = await sql.one<{
      n: string | number;
      req: string | number;
      inc: string | number;
      ovr: string | number;
    }>(
      `SELECT COUNT(*) as n,
              COALESCE(SUM(credits_required), 0) as req,
              COALESCE(SUM(included_credits_applied), 0) as inc,
              COALESCE(SUM(overage_credits), 0) as ovr
         FROM usage_credit_ledger
        WHERE account_id = ?`,
      [account.account_id],
    );
    expect(Number(ledger?.n ?? 0), `ledger row count: ${ctx}`).toBe(K);
    expect(Number(ledger?.req ?? 0), `ledger Σ credits_required: ${ctx}`).toBe(sumRequired);
    expect(Number(ledger?.inc ?? 0), `ledger Σ included_credits_applied: ${ctx}`).toBe(sumApplied);
    expect(Number(ledger?.ovr ?? 0), `ledger Σ overage_credits: ${ctx}`).toBe(sumOverage);
  }, 120_000);

  it("N small consumes ≡ one big consume (credit-exact amounts, greedy split is path-independent)", async () => {
    const rng = mulberry32(SEED);
    const plan = PLANS[1]; // starter: 75,000
    const many = await createAccount("Inv-many", "invariants-many@example.com", plan.tier);
    const once = await createAccount("Inv-once", "invariants-once@example.com", plan.tier);

    // Multiples of 18 cents are credit-exact AND ceil-additive (see the pure
    // test above), so the N-vs-1 totals are comparable with zero float slack.
    // k ∈ [200, 4000] → 20,000..400,000 credits per call: the 75,000 allowance
    // is crossed mid-sequence, exercising the included→overage transition.
    const N = 25;
    const amounts = Array.from({ length: N }, () => 18 * randInt(rng, 200, 4000));
    const total = amounts.reduce((s, a) => s + a, 0);

    let sumRequired = 0;
    let sumApplied = 0;
    let sumOverage = 0;
    for (const amountCents of amounts) {
      const r = await consumeUsageCredits(many.account_id, plan.tier, "invariant_many", amountCents);
      sumRequired += r.credits_required;
      sumApplied += r.included_credits_applied;
      sumOverage += r.overage_credits;
    }
    const big = await consumeUsageCredits(once.account_id, plan.tier, "invariant_once", total);

    const ctx =
      `seed=0x${SEED.toString(16)} N=${N} totalCents=${total} ` +
      `(allowance=${plan.allowance}, amounts=[${amounts.join(",")}])`;
    expect(sumRequired, `Σ credits_required ≡ one-shot required: ${ctx}`).toBe(big.credits_required);
    expect(sumApplied, `Σ applied ≡ one-shot applied: ${ctx}`).toBe(big.included_credits_applied);
    expect(sumOverage, `Σ overage ≡ one-shot overage: ${ctx}`).toBe(big.overage_credits);

    // Greedy fill of a single allowance bucket: total applied is exactly
    // min(allowance, total required) — nothing withheld, nothing over-applied.
    expect(sumApplied, `greedy fill: ${ctx}`).toBe(Math.min(plan.allowance, sumRequired));

    // Both accounts land on identical persisted state.
    const manySummary = await getUsageCreditSummary(many.account_id, plan.tier);
    const onceSummary = await getUsageCreditSummary(once.account_id, plan.tier);
    expect(manySummary.included_credits_used, `persisted used ≡: ${ctx}`).toBe(
      onceSummary.included_credits_used,
    );
    expect(manySummary.overage_credits_this_month, `persisted overage ≡: ${ctx}`).toBe(
      onceSummary.overage_credits_this_month,
    );
    expect(manySummary.included_credits_remaining, `persisted remaining ≡: ${ctx}`).toBe(
      onceSummary.included_credits_remaining,
    );
  }, 120_000);
});
