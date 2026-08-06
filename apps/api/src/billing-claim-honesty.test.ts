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

  // The mismatch that exists TODAY, declared rather than silently tolerated.
  // Recurring billing is gated on the 2026-08-15 Terms change (see begin.yaml);
  // until then these entries describe the INTENDED model, not the live one.
  // Listing them here is not approval — it is a dated record so that (a) nothing
  // NEW joins them unnoticed, and (b) publishing any of them stays blocked.
  const KNOWN_PENDING_RECURRING_GATE = "2026-08-15";

  it("no NEW product advertises recurring billing while the Terms say one-time", () => {
    if (!termsSayOneTimeOnly()) return; // Terms updated — constraint retired

    const recurring = products()
      .filter((p) => String(p.billing).toLowerCase() === "recurring")
      .map((p) => p.id)
      .sort();

    // The exact set known and accepted as of 2026-08-06, pending the gate above.
    // Derived from the registry on 2026-08-06, not hand-typed — my first pass at
    // this list omitted `superpowers` and wrongly included `obsidian`, which is
    // the same hand-maintained-list defect Phase T found in ProgramsPage.
    const known = [
      "agentic-purchasing", "algorithmic", "artifacts", "brand", "canvas", "debug",
      "deploy", "frontend", "marketing", "mcp", "notebook", "optimization",
      "remotion", "seo", "skills", "superpowers", "theme",
    ];
    const unexpected = recurring.filter((id) => !known.includes(id));

    expect(
      unexpected,
      `TERMS_OF_SERVICE.md states a purchase is a single, one-time charge that does not auto-renew. ` +
        `These products newly advertise recurring billing and are not in the known set pending the ` +
        `${KNOWN_PENDING_RECURRING_GATE} Terms change. Do not publish them (e.g. as generated landing ` +
        `pages) while the Terms say otherwise.`,
    ).toEqual([]);
  });

  it("the known-pending set has not silently grown or shrunk", () => {
    if (!termsSayOneTimeOnly()) return;
    // If this fails, the registry changed: re-confirm against the Terms and the
    // gate date rather than editing the list to make it pass.
    const recurring = products().filter((p) => String(p.billing).toLowerCase() === "recurring");
    expect(recurring.length, "count of recurring-billing products changed").toBe(17);
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
