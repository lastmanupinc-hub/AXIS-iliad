// ─── Free-tier upsell block ─────────────────────────────────────
//
// Every program now ships some free artifacts and withholds the rest
// (packages/generator-core/src/program-manifest.ts FREE_GENERATORS). A caller
// who receives the free subset must be told WHAT was withheld and what it
// costs — "free to get this much, would you pay for more?" only converts if
// they can see what "more" is. Withholding silently is what the old
// program-level gate did, and the telemetry for it was 0 returning accounts.
//
// Shape follows runPreparePurchasingPreview (mcp-tool-impls.ts) — this repo's
// existing "what you'd get if you paid" precedent: withheld artifact list +
// unlock price + how to retry. Conventions follow trial-notice.ts: return
// `undefined` when there is nothing to upsell so JSON.stringify drops the key
// and an unaffected response stays byte-identical.
//
// Prices are DERIVED, never hardcoded — getPricingTier/formatCents for the
// per-call path, PRODUCT_REGISTRY for the one-time unlock. The `pro_unlock`
// string triplicated across handlers.ts and mcp-tool-impls.ts (byte-identical,
// with an already-stale "15 more programs") is the anti-pattern this module
// exists to avoid repeating a fourth time.
import {
  productIdForProgram,
  getProduct,
  isFreeGenerator,
  isPaidArtifact,
  GENERATOR_PROGRAMS,
  FREE_GENERATOR_COUNT,
  TOTAL_GENERATORS,
} from "@axis/generator-core";
import { getPricingTier, formatCents } from "@axis/mpp";

/**
 * The shared "what Pro unlocks" line. Previously this string was triplicated
 * byte-for-byte across handlers.ts and mcp-tool-impls.ts (×2) with a hardcoded
 * "15 more programs" that had already gone stale against the real program
 * count — the exact hand-duplicated-catalog family this repo keeps fixing.
 * Derived, so it cannot drift again.
 */
export const PRO_UNLOCK_NOTE =
  `Pro unlock: ${TOTAL_GENERATORS - FREE_GENERATOR_COUNT} more artifacts beyond the ${FREE_GENERATOR_COUNT} free ones ` +
  `($${formatCents(getPricingTier("analyze_repo").standard_cents)}/run, or $99 once for Pro — a one-time charge, not a recurring subscription).`;

/** One artifact the caller did not receive. Content is deliberately absent. */
export interface WithheldArtifact {
  path: string;
  program: string;
  description: string;
}

export interface FreeTierUpsell {
  /** Programs represented in the withheld set. */
  programs: string[];
  /** Artifact paths the caller DID receive, with content. */
  included: string[];
  /** Artifacts withheld — path/program/description only, never content. */
  withheld: WithheldArtifact[];
  withheld_count: number;
  unlock: {
    /** One-time unlock price for the single program involved, when unambiguous. */
    one_time_usd?: number;
    /** Per-call price for the tool/endpoint that produced this response. */
    per_call_usd: string;
    message: string;
  };
}

/** A generated file, narrowed to what this module reads. */
interface FileLike {
  path: string;
  program: string;
  description?: string;
}

/**
 * Build the `free_tier` block for a response that withheld paid artifacts.
 *
 * `allFiles` is everything generation produced (generation runs every
 * generator regardless of tier); this splits it and reports the paid half.
 * Returns `undefined` when nothing was withheld — a fully-paid caller, or a
 * program whose artifacts are all free — so the key simply does not appear.
 *
 * `priceTool` is the pricing key for the per-call path (e.g. "analyze_repo",
 * or the program slug for makeProgramHandler routes); getPricingTier falls
 * back to PRICING_TIERS.default for anything unrecognised.
 */
export function buildFreeTierUpsell(allFiles: readonly FileLike[], priceTool: string): FreeTierUpsell | undefined {
  const included: string[] = [];
  const withheld: WithheldArtifact[] = [];

  for (const f of allFiles) {
    // isPaidArtifact, not !isFreeGenerator: artifacts appended after
    // generation (package-quality report, program funnel, the begin.yaml /
    // continuation.yaml autonomy-loop files) are not registry entries and were
    // always delivered regardless of tier. Treating them as "withheld" would
    // both strip them from free callers and advertise artifacts with no price.
    if (!isPaidArtifact(f.path)) {
      included.push(f.path);
    } else {
      withheld.push({
        path: f.path,
        program: f.program,
        // Every generator authors its own description; fall back rather than
        // emitting an empty string, which would read as "no such artifact".
        description: f.description && f.description.trim() ? f.description : `${f.program} artifact`,
      });
    }
  }

  if (withheld.length === 0) return undefined;

  const programs = Array.from(new Set(withheld.map((w) => w.program))).sort();
  const perCall = formatCents(getPricingTier(priceTool).standard_cents);

  // One-time unlock is only quotable when a single program is involved —
  // a multi-program response (analyze_repo) has no single product price, and
  // inventing a total would be a fabricated number.
  const soleProgram = programs.length === 1 ? programs[0] : undefined;
  const product = soleProgram ? getProduct(productIdForProgram(soleProgram) ?? "") : undefined;
  const oneTime = product && typeof product.price_usd === "number" ? product.price_usd : undefined;

  const message =
    oneTime !== undefined
      ? `${withheld.length} more ${soleProgram} artifact${withheld.length === 1 ? "" : "s"} available: $${perCall} per call, or $${oneTime} once to unlock ${soleProgram} — a one-time charge, not a recurring subscription.`
      : `${withheld.length} more artifact${withheld.length === 1 ? "" : "s"} available across ${programs.length} program${programs.length === 1 ? "" : "s"}: $${perCall} per call.`;

  return {
    programs,
    included,
    withheld,
    withheld_count: withheld.length,
    unlock: {
      ...(oneTime !== undefined ? { one_time_usd: oneTime } : {}),
      per_call_usd: perCall,
      message,
    },
  };
}

/**
 * Upsell for a caller whose request was NARROWED before generation — the
 * anonymous /v1/analyze path, where the paid artifacts were never generated,
 * so no `description` exists for them.
 *
 * Deliberately reports paths and per-program counts only. Inventing summaries
 * for artifacts that were never produced would be fabricated content; naming
 * them honestly is enough to answer "what would I get?".
 */
export function buildNarrowedUpsell(programs?: readonly string[]): FreeTierUpsell | undefined {
  const withheld: WithheldArtifact[] = [];
  const included: string[] = [];
  for (const [path, program] of Object.entries(GENERATOR_PROGRAMS)) {
    if (programs && !programs.includes(program)) continue;
    if (isFreeGenerator(path)) included.push(path);
    else withheld.push({ path, program, description: `${program} artifact — generated on a paid run` });
  }
  if (withheld.length === 0) return undefined;

  const involved = Array.from(new Set(withheld.map((w) => w.program))).sort();
  const perCall = formatCents(getPricingTier("analyze_repo").standard_cents);
  const soleProgram = involved.length === 1 ? involved[0] : undefined;
  const product = soleProgram ? getProduct(productIdForProgram(soleProgram) ?? "") : undefined;
  const oneTime = product && typeof product.price_usd === "number" ? product.price_usd : undefined;

  return {
    programs: involved,
    included,
    withheld,
    withheld_count: withheld.length,
    unlock: {
      ...(oneTime !== undefined ? { one_time_usd: oneTime } : {}),
      per_call_usd: perCall,
      message:
        `${withheld.length} more artifact${withheld.length === 1 ? "" : "s"} available across ` +
        `${involved.length} program${involved.length === 1 ? "" : "s"}: $${perCall} per run. ` +
        `Sign in and re-run to receive them.`,
    },
  };
}
