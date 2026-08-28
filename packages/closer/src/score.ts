// Qualification + scoring.
//
// Two separate ideas, deliberately not merged:
//
//   qualify() is a GATE   — boolean, rule-based, explainable, and hard. It
//                           answers "should we ever spend a minute on this?"
//   score()   is a RANK   — 0-100, signal-weighted. It answers "of the ones
//                           worth working, who first?"
//
// Merging them (the usual "lead score > 70 == qualified") is what makes CRM
// scores untrustworthy: a high score from weak signals silently promotes junk
// past a gate that should have rejected it on a fact.
//
// Every output carries its reasons. An unexplainable score is one nobody
// trusts, and one nobody can debug when the queue looks wrong.

import type { CloserEvent, ProspectFacts, SignalKind, SignalPayload } from "./types.js";

export interface QualifyResult {
  readonly qualified: boolean;
  /** Reasons it passed, or the specific rules it failed. */
  readonly reasons: readonly string[];
  /** Set when a HARD disqualifier fired — caller should emit `disqualified`. */
  readonly disqualified: boolean;
}

/**
 * Verticals PAI'D is actually built for. This is the demand-side targeting
 * list, and it is NOT a routing input — see the neutrality note in types.ts.
 */
export const HIGH_RISK_VERTICALS: readonly string[] = [
  "cbd",
  "nutraceutical",
  "supplements",
  "firearms",
  "ammunition",
  "gaming",
  "igaming",
  "adult",
  "crypto",
  "digital_assets",
  "travel",
  "ticketing",
  "subscription_continuity",
  "debt_collection",
  "credit_repair",
  "msb",
  "money_transfer",
  "telemedicine",
  "vape",
  "kratom",
  "peptides",
  "high_ticket_coaching",
  "dropshipping",
] as const;

/**
 * Jurisdictions we will not sell into, regardless of fit. Kept separate from
 * sanctions screening on the money path — this is a sales-time filter so we do
 * not waste outreach, not a compliance control. The real control lives in
 * PAI'D's own screening engine and must never be replaced by this list.
 */
const EXCLUDED_COUNTRIES: readonly string[] = ["KP", "IR", "SY", "CU", "RU", "BY"] as const;

/** Below this, the economics never work regardless of fit. $10k/mo in cents. */
const MIN_MONTHLY_VOLUME_CENTS = 1_000_000;

/**
 * The gate. Hard rules only — anything probabilistic belongs in score().
 */
export function qualify(facts: ProspectFacts): QualifyResult {
  const reasons: string[] = [];

  // ── Hard disqualifiers ───────────────────────────────────────────────
  if (facts.country && EXCLUDED_COUNTRIES.includes(facts.country.toUpperCase())) {
    return {
      qualified: false,
      disqualified: true,
      reasons: [`Excluded jurisdiction: ${facts.country}`],
    };
  }

  // ── Missing facts are NOT a disqualification ─────────────────────────
  // They mean "not qualified yet" — the prospect stays in IDENTIFIED and the
  // next action becomes `enrich`. Conflating unknown with disqualified is how
  // a pipeline silently discards its own top of funnel.
  if (!facts.vertical) {
    return { qualified: false, disqualified: false, reasons: ["No vertical known yet — enrich first."] };
  }

  const vertical = facts.vertical.toLowerCase();
  const isHighRisk = facts.high_risk === true || HIGH_RISK_VERTICALS.includes(vertical);
  if (!isHighRisk) {
    // Not a disqualifier: low-risk merchants are simply not our wedge. They
    // stay in the DB so we never re-ingest and re-work them.
    return {
      qualified: false,
      disqualified: false,
      reasons: [`Vertical "${facts.vertical}" is not a high-risk wedge.`],
    };
  }
  reasons.push(`High-risk vertical: ${facts.vertical}`);

  if (facts.est_monthly_volume === undefined) {
    return {
      qualified: false,
      disqualified: false,
      reasons: [...reasons, "Volume unknown — enrich before qualifying."],
    };
  }
  if (facts.est_monthly_volume < MIN_MONTHLY_VOLUME_CENTS) {
    return {
      qualified: false,
      disqualified: false,
      reasons: [
        ...reasons,
        `Est. volume ${facts.est_monthly_volume} < floor ${MIN_MONTHLY_VOLUME_CENTS}.`,
      ],
    };
  }
  reasons.push(`Est. monthly volume clears the floor.`);

  return { qualified: true, disqualified: false, reasons };
}

/**
 * Signal weights, highest-intent first. A merchant who was just terminated by
 * their processor is the single best prospect this business can have, so it
 * dominates; ambient signals are worth little on their own but compound.
 */
const SIGNAL_WEIGHTS: Record<SignalKind, number> = {
  processor_terminated: 40,
  checkout_down: 30,
  payment_pain_public: 25,
  inbound_interest: 25,
  chargeback_exposure: 15,
  stack_change_detected: 12,
  hiring_payments_role: 10,
  geo_expansion: 8,
};

/** Signals older than this contribute nothing — intent decays fast. */
const SIGNAL_HALF_LIFE_DAYS = 30;

export interface ScoreResult {
  /** 0-100. */
  readonly score: number;
  readonly reasons: readonly string[];
  /** True when at least one high-intent signal is live. Drives "buying signals". */
  readonly hot: boolean;
}

/**
 * Rank a prospect. Score is signal-driven with time decay, plus a small
 * fit component. Capped at 100 so the number stays interpretable.
 *
 * @param now injected — decay must be deterministic in tests.
 */
export function score(
  facts: ProspectFacts,
  events: readonly CloserEvent[],
  now: Date,
): ScoreResult {
  const reasons: string[] = [];
  let total = 0;
  let hot = false;

  // ── Fit component (max 25) ───────────────────────────────────────────
  if (facts.vertical && HIGH_RISK_VERTICALS.includes(facts.vertical.toLowerCase())) {
    total += 15;
    reasons.push(`+15 high-risk vertical (${facts.vertical})`);
  }
  if (facts.est_monthly_volume !== undefined) {
    // $100k/mo and up earns the full band; scaled linearly below that.
    const band = Math.min(facts.est_monthly_volume / 10_000_000, 1);
    const pts = Math.round(band * 10);
    if (pts > 0) {
      total += pts;
      reasons.push(`+${pts} volume band`);
    }
  }

  // ── Signal component with decay ──────────────────────────────────────
  for (const e of events) {
    if (e.type !== "signal") continue;
    const p = e.payload as SignalPayload | undefined;
    if (!p?.kind) continue;
    const weight = SIGNAL_WEIGHTS[p.kind];
    if (weight === undefined) continue;

    const ageDays = (now.getTime() - new Date(e.at).getTime()) / 86_400_000;
    // Linear decay to zero at the half-life. Simple and legible beats
    // exponential here — a salesperson can predict it.
    const decay = Math.max(0, 1 - ageDays / SIGNAL_HALF_LIFE_DAYS);
    if (decay <= 0) continue;

    const pts = Math.round(weight * decay);
    if (pts <= 0) continue;
    total += pts;
    reasons.push(`+${pts} ${p.kind} (${Math.round(ageDays)}d old)`);
    if (weight >= 25) hot = true;
  }

  return { score: Math.max(0, Math.min(100, total)), reasons, hot };
}
