// spoke_05 storefront pages, tested against the REAL registry and the REAL
// manifest — not fixtures — because the whole point of generating these pages is
// that they cannot drift from the products they describe.
//
// The centrepiece is the billing guard. Scoping this feature originally found
// that generating pages from the registry would have published 17 pricing claims
// contradicting TERMS_OF_SERVICE.md across 20 public URLs. That defect is the
// reason this feature exists in the shape it does, so it gets a test that fails
// if anyone ever renders billing_at_gate.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateStorefrontPage,
  generateStorefrontFavicon,
  priceLine,
  isPurchasable,
  AVERIONICS,
  type StorefrontProduct,
} from "./generators-storefront.js";
import { PRODUCT_REGISTRY } from "./product-registry.js";
import { GENERATOR_PROGRAMS } from "./program-manifest.js";
import { analyzeUiSurface } from "./generators-frontend.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function products(): StorefrontProduct[] {
  const r = PRODUCT_REGISTRY as unknown;
  return (Array.isArray(r) ? r : Object.values(r as Record<string, unknown>)) as StorefrontProduct[];
}

/** Real artifact filenames for a product's programs, straight from the manifest. */
function artifactsFor(p: StorefrontProduct): string[] {
  const out: string[] = [];
  for (const [generator, program] of Object.entries(GENERATOR_PROGRAMS)) {
    if (p.programs.includes(program as string)) out.push(generator);
  }
  return out.sort();
}

const inputFor = (p: StorefrontProduct) => ({ product: p, artifacts: artifactsFor(p), palette: AVERIONICS });

describe("storefront — generated from the real registry", () => {
  it("covers every product, and the registry is non-trivial", () => {
    // Guards against the whole suite passing vacuously on an empty registry.
    expect(products().length).toBeGreaterThanOrEqual(20);
  });

  it("lists each product's REAL artifacts, so a page cannot drift from its program", () => {
    const theme = products().find((p) => p.id === "theme")!;
    const page = generateStorefrontPage(inputFor(theme)).content;
    for (const artifact of artifactsFor(theme)) expect(page).toContain(artifact);
    expect(artifactsFor(theme).length).toBeGreaterThan(0);
  });

  it("states a count that matches the list it renders — the two cannot disagree", () => {
    for (const p of products()) {
      const arts = artifactsFor(p);
      const page = generateStorefrontPage(inputFor(p)).content;
      expect(page).toContain(`${arts.length} ${arts.length === 1 ? "artifact" : "artifacts"}`);
    }
  });

  it("is deterministic — same product twice, byte-identical page", () => {
    const p = products()[0];
    expect(generateStorefrontPage(inputFor(p)).content).toBe(generateStorefrontPage(inputFor(p)).content);
  });
});

// ─── the guard this feature was blocked on ──────────────────────────
describe("storefront billing honesty — the page may not contradict the Terms", () => {
  function termsSayOneTimeOnly(): boolean {
    const tos = readFileSync(join(ROOT, "TERMS_OF_SERVICE.md"), "utf8");
    return /single,\s*one-time charge/i.test(tos) || /does not automatically renew/i.test(tos);
  }

  it("reads the Terms (guards against this whole block passing vacuously)", () => {
    expect(termsSayOneTimeOnly()).toBe(true);
  });

  it("NO generated page promises a renewal while the Terms say one-time", () => {
    if (!termsSayOneTimeOnly()) return;
    const offenders: string[] = [];
    for (const p of products()) {
      const page = generateStorefrontPage(inputFor(p)).content;
      if (/\b(per month|\/mo\b|monthly|recurring|auto-renew|renews)\b/i.test(page)) offenders.push(p.id);
    }
    expect(
      offenders,
      "A storefront page advertised recurring billing while TERMS_OF_SERVICE.md says a purchase is a " +
        "single, one-time charge. Render `billing`, never `billing_at_gate`.",
    ).toEqual([]);
  });

  it("renders billing_at_gate's intent NOWHERE, even though every paid product carries it", () => {
    // Proves the guard above is not passing merely because no product has the field.
    const withGate = products().filter((p) => (p as { billing_at_gate?: string }).billing_at_gate === "recurring");
    expect(withGate.length).toBeGreaterThan(0);
    for (const p of withGate) {
      expect(generateStorefrontPage(inputFor(p)).content).not.toMatch(/recurring/i);
    }
  });

  it("prices free products as Free, never as $NaN", () => {
    const free = products().filter((p) => p.price_usd === "free" || p.tier_min === "free");
    expect(free.length).toBeGreaterThan(0); // search + obsidian
    for (const p of free) {
      expect(priceLine(p)).toBe("Free");
      expect(generateStorefrontPage(inputFor(p)).content).not.toContain("NaN");
    }
  });

  it("prices every DELIVERABLE paid product as a one-time charge", () => {
    // Gated products are excluded deliberately — they are priced "Not yet
    // available" by isPurchasable, which the two tests below cover.
    const paid = products().filter((p) => typeof p.price_usd === "number" && isPurchasable(p));
    expect(paid.length).toBeGreaterThan(0);
    for (const p of paid) expect(priceLine(p)).toBe(`$${p.price_usd} one-time`);
  });

  // Caught by reading the real generated output: the first draft published
  // remotion's ledger note — "do not ship renders before the license exists" —
  // on a public page, AND advertised $29 for something we cannot deliver.
  it("never publishes a gate_note: it is an internal engineering note, not customer copy", () => {
    const gated = products().filter((p) => p.gate_note);
    expect(gated.length).toBeGreaterThan(0); // remotion — proves this isn't vacuous
    for (const p of gated) {
      const page = generateStorefrontPage(inputFor(p)).content;
      expect(page).not.toContain(p.gate_note!);
      // The internal vocabulary must not leak in any form.
      expect(page).not.toMatch(/owner-purchased|do not ship|blocked on/i);
    }
  });

  it("withholds the price AND the buy action for a product we cannot deliver yet", () => {
    for (const p of products().filter((x) => x.gate_note)) {
      const page = generateStorefrontPage(inputFor(p)).content;
      expect(priceLine(p)).toBe("Not yet available");
      expect(page).not.toContain(`$${p.price_usd}`);
      expect(page).not.toContain('class="cta"'); // inviting a purchase we cannot fulfil is the lie
      expect(page).toContain("not available for purchase yet");
    }
  });

  it("still shows a purchasable product its price and its buy action", () => {
    const sellable = products().filter((p) => !p.gate_note && typeof p.price_usd === "number");
    expect(sellable.length).toBeGreaterThan(0);
    const page = generateStorefrontPage(inputFor(sellable[0])).content;
    expect(page).toContain('class="cta"');
    expect(page).toContain(`$${sellable[0].price_usd} one-time`);
  });
});

describe("storefront accessibility — judged by our own frontend auditor", () => {
  it("every page passes analyzeUiSurface with zero findings", () => {
    for (const p of products()) {
      const page = generateStorefrontPage(inputFor(p)).content;
      // .tsx path so the auditor scans it; the rules (interactive elements, alt
      // text, innerHTML) apply to markup regardless of file extension.
      const findings = analyzeUiSurface([
        { path: `storefront/${p.id}.tsx`, content: page, content_type: "text/plain" } as never,
      ]);
      expect(findings, `${p.id} page: ${findings.map((f) => f.category).join(", ")}`).toEqual([]);
    }
  });

  it("uses a real anchor for the call to action, not a clickable div", () => {
    const page = generateStorefrontPage(inputFor(products()[0])).content;
    expect(page).toMatch(/<a class="cta"/);
    expect(page).not.toMatch(/<div[^>]*onClick/i);
  });

  it("declares a language and a single h1", () => {
    const page = generateStorefrontPage(inputFor(products()[0])).content;
    expect(page).toContain('<html lang="en">');
    expect(page.match(/<h1>/g)).toHaveLength(1);
  });

  it("escapes product text rather than interpolating it raw", () => {
    const hostile: StorefrontProduct = {
      id: "x", name: '</title><script>alert(1)</script>', subdomain: "x.trustfabric.ai",
      programs: ["x"], price_usd: 1, billing: "one_time", tier_min: "paid",
    };
    const page = generateStorefrontPage({ product: hostile, artifacts: ["a.md"], palette: AVERIONICS }).content;
    expect(page).not.toContain("<script>");
    expect(page).toContain("&lt;script&gt;");
  });
});

describe("storefront favicons — individual marks that compose as one brand", () => {
  it("gives every product a distinct mark", () => {
    const svgs = products().map((p) => generateStorefrontFavicon(inputFor(p)).content);
    expect(new Set(svgs).size).toBe(products().length);
  });

  it("shares the same frame across all of them, so the set reads as a family", () => {
    for (const p of products()) {
      const svg = generateStorefrontFavicon(inputFor(p)).content;
      expect(svg).toContain(`fill="${AVERIONICS.surface}"`);
      expect(svg).toContain(`stroke="${AVERIONICS.primary}"`);
    }
  });

  it("is deterministic — the same product always gets the same mark", () => {
    const p = products()[0];
    expect(generateStorefrontFavicon(inputFor(p)).content).toBe(generateStorefrontFavicon(inputFor(p)).content);
  });

  it("carries an accessible label", () => {
    const svg = generateStorefrontFavicon(inputFor(products()[0])).content;
    expect(svg).toMatch(/role="img"/);
    expect(svg).toMatch(/aria-label="/);
  });
});
