// ─── Billing-claim honesty (found while scoping spoke_05) ──────────────────
//
// PRODUCT_REGISTRY marks 17 of 20 products `billing: "recurring"`, at monthly
// prices ($9 skills, $29 mcp, $19 theme/frontend/seo/deploy, …).
//
// TERMS_OF_SERVICE.md says the opposite, in the legal document that governs:
//   "Payment for a paid tier is a single, one-time charge for the plan and
//    billing cycle you select … a purchase does not automatically renew"
//
// Today that contradiction is LATENT: nothing serves the registry's `billing`
// or `price_usd` to a user (admin.ts reads only `name`). It becomes a published
// falsehood the moment anything renders the registry — which is exactly what
// spoke_05 (generate a landing page per product from PRODUCT_REGISTRY) would
// have done, across 20 public pages, contradicting our own Terms.
//
// So this guard exists to make that impossible rather than to be remembered.
// It is deliberately two-directional: it fails if the registry advertises
// recurring while the Terms say one-time, AND it fails if the Terms are updated
// to recurring while the registry still says otherwise. When recurring billing
// genuinely goes live the Terms change, and this test starts requiring the
// registry to match — no one has to remember to come back and flip it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PRODUCT_REGISTRY } from "@axis/generator-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function termsSayOneTimeOnly(): boolean {
  const tos = readFileSync(join(ROOT, "TERMS_OF_SERVICE.md"), "utf8");
  // The operative sentence. Kept as a phrase match rather than a loose keyword
  // so a passing mention of "one-time" elsewhere cannot flip the verdict.
  return /single,\s*one-time charge/i.test(tos) || /does not automatically renew/i.test(tos);
}

function products(): Array<{ id: string; billing: string; price_usd: unknown }> {
  const r = PRODUCT_REGISTRY as unknown;
  return (Array.isArray(r) ? r : Object.values(r as Record<string, unknown>)) as Array<{
    id: string;
    billing: string;
    price_usd: unknown;
  }>;
}

describe("billing claims — the registry may not contradict the Terms", () => {
  it("reads a non-trivial registry (guards against the check passing vacuously)", () => {
    expect(products().length).toBeGreaterThan(10);
  });

  it("no product advertises recurring billing while the Terms say one-time", () => {
    if (!termsSayOneTimeOnly()) return; // Terms updated — constraint retired

    // FIXED 2026-08-06: this previously needed a 17-product exception list.
    // The registry now states today's truth in `billing` and keeps the intent
    // in `billing_at_gate`, so the honest answer is simply zero.
    const recurring = products()
      .filter((p) => String(p.billing).toLowerCase() === "recurring")
      .map((p) => p.id);

    expect(
      recurring,
      "TERMS_OF_SERVICE.md states a purchase is a single, one-time charge that does not auto-renew. " +
        "A product whose `billing` says recurring contradicts it. Use `billing_at_gate` to record what " +
        "it becomes after the 2026-08-15 change; `billing` must describe what happens TODAY.",
    ).toEqual([]);
  });

  it("the products intended to become recurring still say so", () => {
    // The intent must survive the fix, or nobody can tell which products flip
    // on the gate date — which is the failure mode that made overwriting the
    // field unattractive in the first place.
    const flip = products().filter((p) => (p as { billing_at_gate?: string }).billing_at_gate === "recurring");
    expect(flip.length, "expected the 18 paid products to carry billing_at_gate").toBe(18); // +pitch (2026-08-13)
  });

  it("once the Terms describe recurring billing, the registry must not still claim one_time", () => {
    if (termsSayOneTimeOnly()) return; // constraint not yet active
    const stale = products()
      .filter((p) => String(p.billing).toLowerCase() === "one_time")
      .map((p) => p.id);
    expect(stale, "Terms now describe recurring billing; these registry entries are stale").toEqual([]);
  });

  it("every price is a number — a string price silently breaks arithmetic on any pricing surface", () => {
    // Found alongside the above: price_usd is mixed number|string, so
    // Math.min(...prices) returns NaN. Harmless while nothing renders it,
    // and a real defect the moment something does.
    // "free" is a deliberate sentinel for the always-free products; anything
    // else non-numeric is a defect. Math.min over this field currently yields
    // NaN, which is harmless only because nothing renders it yet.
    const bad = products()
      .filter((p) => typeof p.price_usd !== "number" && p.price_usd !== "free")
      .map((p) => `${p.id}: ${typeof p.price_usd} (${JSON.stringify(p.price_usd)})`);
    expect(bad, 'price_usd must be a number, or the literal "free"').toEqual([]);
  });
});
