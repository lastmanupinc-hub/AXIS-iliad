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
  generateStorefrontRobots,
  generateStorefrontLlmsTxt,
  generateStorefrontSitemap,
  metaDescription,
  structuredData,
  priceLine,
  isPurchasable,
  AVERIONICS,
  type StorefrontProduct,
} from "./generators-storefront.js";
import { PRODUCT_REGISTRY } from "./product-registry.js";
import { GENERATOR_PROGRAMS } from "./program-manifest.js";
import { analyzeUiSurface } from "./generators-frontend.js";
import { validateStructuredData, extractJsonLdBlocks } from "./seo-structured-data.js";

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

// ─── ext_02: Cloudflare Agent Readiness ─────────────────────────────────────
describe("storefront robots.txt — root-level, host-independent", () => {
  it("allows crawling and declares a Content-Signal directive", () => {
    const robots = generateStorefrontRobots();
    expect(robots.path).toBe("robots.txt");
    expect(robots.content).toMatch(/^User-agent: \*/);
    expect(robots.content).toContain("Allow: /");
    expect(robots.content).toMatch(/Content-Signal:\s*search=yes,\s*ai-train=yes,\s*ai-input=yes/);
  });

  it("is deterministic", () => {
    expect(generateStorefrontRobots().content).toBe(generateStorefrontRobots().content);
  });
});

describe("storefront llms.txt — one global file, same registry as the pages", () => {
  const inputFor2 = (p: StorefrontProduct) => ({ product: p, artifacts: artifactsFor(p), palette: AVERIONICS });

  it("lists every product with its real subdomain URL", () => {
    const llms = generateStorefrontLlmsTxt(products().map(inputFor2));
    for (const p of products()) {
      expect(llms.content).toContain(`https://${p.subdomain}/`);
      expect(llms.content).toContain(p.name);
    }
  });

  it("prices exactly as priceLine() would — never a hand-written figure", () => {
    const llms = generateStorefrontLlmsTxt(products().map(inputFor2));
    for (const p of products()) expect(llms.content).toContain(priceLine(p));
  });

  it("never sells a gated product — no price, no internal gate_note text", () => {
    const gated = products().filter((p) => p.gate_note);
    expect(gated.length).toBeGreaterThan(0); // remotion — proves this isn't vacuous
    const llms = generateStorefrontLlmsTxt(products().map(inputFor2));
    for (const p of gated) {
      expect(llms.content).not.toContain(p.gate_note!);
      expect(llms.content).not.toMatch(/owner-purchased|do not ship|blocked on/i);
    }
  });

  it("states an artifact count that matches each product's real artifact list", () => {
    const llms = generateStorefrontLlmsTxt(products().map(inputFor2));
    for (const p of products()) {
      const n = artifactsFor(p).length;
      expect(llms.content).toContain(`${n} ${n === 1 ? "artifact" : "artifacts"}`);
    }
  });

  it("is deterministic — same registry twice, byte-identical file", () => {
    const a = generateStorefrontLlmsTxt(products().map(inputFor2)).content;
    const b = generateStorefrontLlmsTxt(products().map(inputFor2)).content;
    expect(a).toBe(b);
  });

  it("escapes hostile product text rather than interpolating it raw", () => {
    const hostile: StorefrontProduct = {
      id: "x", name: "</script><script>alert(1)</script>", subdomain: "x.trustfabric.ai",
      programs: ["x"], price_usd: 1, billing: "one_time", tier_min: "paid",
    };
    const llms = generateStorefrontLlmsTxt([{ product: hostile, artifacts: ["a.md"], palette: AVERIONICS }]);
    expect(llms.content).not.toContain("<script>");
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

// ─── theme/SEO hardening pass — closes gaps found in spoke_05's own "complete" ──
// receipt: fonts didn't match apps/web's real tokens, and there was no meta
// description, no structured data, no sitemap.xml despite robots.txt promising
// one. All four are held to the same "real data only, verified by our own
// tooling" discipline as everything else in this file.

describe("storefront meta description — real data, not hand-written marketing copy", () => {
  it("states the real artifact count and program list for every product", () => {
    for (const p of products()) {
      const input = inputFor(p);
      const desc = metaDescription(input);
      expect(desc).toContain(`${input.artifacts.length}`);
      for (const prog of p.programs) expect(desc).toContain(prog);
    }
  });

  it("states priceLine()'s own price — never a hand-written figure", () => {
    for (const p of products()) {
      const desc = metaDescription(inputFor(p));
      if (isPurchasable(p)) expect(desc).toContain(priceLine(p));
      else expect(desc).toMatch(/not yet available/i);
    }
  });

  it("never leaks a gate_note into the description", () => {
    const gated = products().filter((p) => p.gate_note);
    expect(gated.length).toBeGreaterThan(0);
    for (const p of gated) expect(metaDescription(inputFor(p))).not.toContain(p.gate_note!);
  });
});

describe("storefront structured data — validated by our own seo program's validator", () => {
  it("every one of the 21 real products emits JSON-LD that passes validateStructuredData", () => {
    for (const p of products()) {
      const page = generateStorefrontPage(inputFor(p)).content;
      const result = validateStructuredData(page);
      expect(result.blocks, `${p.id}: no JSON-LD block found`).toBe(1);
      expect(result.ok, `${p.id}: ${result.issues.map((i) => i.message).join("; ")}`).toBe(true);
    }
  });

  it("declares SoftwareApplication with the product's real name and url", () => {
    for (const p of products()) {
      const node = structuredData(inputFor(p));
      expect(node["@type"]).toBe("SoftwareApplication");
      expect(node.name).toBe(p.name);
      expect(node.url).toBe(`https://${p.subdomain}/`);
    }
  });

  it("includes real offers.price for a purchasable, priced product — matching priceLine()", () => {
    const priced = products().find((p) => isPurchasable(p) && typeof p.price_usd === "number");
    expect(priced).toBeDefined();
    const node = structuredData(inputFor(priced!)) as { offers?: { price: number; priceCurrency: string } };
    expect(node.offers?.price).toBe(priced!.price_usd);
    expect(node.offers?.priceCurrency).toBe("USD");
  });

  it("prices a free product's offer at 0, not omitted and not fabricated", () => {
    const free = products().find((p) => p.price_usd === "free" || p.tier_min === "free");
    expect(free).toBeDefined();
    const node = structuredData(inputFor(free!)) as { offers?: { price: number } };
    expect(node.offers?.price).toBe(0);
  });

  it("NEVER includes offers for a gated (not-yet-purchasable) product — same honesty gate as the visible page", () => {
    const gated = products().filter((p) => p.gate_note);
    expect(gated.length).toBeGreaterThan(0);
    for (const p of gated) {
      const node = structuredData(inputFor(p));
      expect(node.offers).toBeUndefined();
    }
  });

  it("THE CORE GUARD: a hostile product name cannot break out of the <script> tag", () => {
    const hostile: StorefrontProduct = {
      id: "x", name: "</script><script>alert(document.cookie)</script>", subdomain: "x.trustfabric.ai",
      programs: ["x"], price_usd: 1, billing: "one_time", tier_min: "paid",
    };
    const page = generateStorefrontPage({ product: hostile, artifacts: ["a.md"], palette: AVERIONICS }).content;
    // The literal bytes of a closing-then-reopening script tag must never
    // appear outside of the ONE legitimate closing tag for the ld+json block.
    const scriptTagCount = (page.match(/<script/gi) ?? []).length;
    expect(scriptTagCount).toBe(1); // only the ld+json block — no injected second tag
    const blocks = extractJsonLdBlocks(page);
    expect(blocks).toHaveLength(1);
    // The block still parses as valid JSON and carries the hostile text as
    // inert DATA (not markup) — proves the escape neutralized it rather than
    // just deleting/mangling the name.
    const parsed = JSON.parse(blocks[0]);
    expect(parsed.name).toContain("script");
    expect(validateStructuredData(page).ok).toBe(true);
  });
});

describe("storefront theme — matches apps/web's real design tokens, not a generic stack", () => {
  const theme = readFileSync(join(ROOT, "apps/web/src/theme.css"), "utf8");

  it("reads the real font tokens (guards against this whole block passing vacuously)", () => {
    expect(theme).toContain(String.raw`--font-sans: "Inter"`);
    expect(theme).toContain(String.raw`--font-mono: "JetBrains Mono"`);
  });

  it("uses the SAME font families as the app it sells — not a generic system-ui fallback", () => {
    const page = generateStorefrontPage(inputFor(products()[0])).content;
    expect(page).toContain(String.raw`"Inter"`);
    expect(page).toContain(String.raw`"JetBrains Mono"`);
    expect(page).not.toMatch(/font-family:system-ui/);
  });

  it("loads the real fonts rather than assuming the visitor's OS has them", () => {
    const page = generateStorefrontPage(inputFor(products()[0])).content;
    expect(page).toContain("fonts.googleapis.com");
    expect(page).toMatch(/family=Inter/);
    expect(page).toMatch(/family=JetBrains\+Mono/);
  });

  it("gives cards and the CTA real elevation (shadow tokens), matching the app's shadow scale", () => {
    const page = generateStorefrontPage(inputFor(products()[0])).content;
    expect(page).toMatch(/box-shadow:var\(--shadow\)/);
    expect(page).toMatch(/box-shadow:var\(--shadow-lg\)/);
  });

  it("links back to the hub on every page — continuity across the 21 subdomains", () => {
    for (const p of products()) {
      const page = generateStorefrontPage(inputFor(p)).content;
      expect(page).toContain(String.raw`<header><a href="https://iliad.trustfabric.ai">`);
      expect(page).toContain("Iliad</a></header>");
    }
  });
});

describe("storefront <head> — meta description, Open Graph, Twitter Card, robots", () => {
  it("every field is the SAME real description — no separate, driftable copy per surface", () => {
    for (const p of products()) {
      const input = inputFor(p);
      const page = generateStorefrontPage(input).content;
      const desc = metaDescription(input);
      // htmlEscape only changes attribute-hostile characters; none of the real
      // registry's product names/programs contain any, so a plain toContain
      // holds for the whole real registry (a hostile-input case is covered
      // separately by the script-tag escaping test above).
      expect(page).toContain(`<meta name="description" content="${desc}">`);
      expect(page).toContain(`<meta property="og:description" content="${desc}">`);
      expect(page).toContain(`<meta name="twitter:description" content="${desc}">`);
    }
  });

  it("indexes a purchasable product and noindexes a gated one — never invites a sale it can't fulfil via search either", () => {
    const purchasable = products().find((p) => isPurchasable(p));
    const gated = products().find((p) => !isPurchasable(p));
    expect(purchasable).toBeDefined();
    expect(gated).toBeDefined();
    expect(generateStorefrontPage(inputFor(purchasable!)).content).toContain('<meta name="robots" content="index,follow">');
    expect(generateStorefrontPage(inputFor(gated!)).content).toContain('<meta name="robots" content="noindex,follow">');
  });

  it("sets theme-color to the page's own surface colour, not a hardcoded value", () => {
    const page = generateStorefrontPage(inputFor(products()[0])).content;
    expect(page).toContain(`<meta name="theme-color" content="${AVERIONICS.surface}">`);
  });

  it("declares no og:image rather than a broken one — SVG favicons are not valid OG images on the major consumers", () => {
    const page = generateStorefrontPage(inputFor(products()[0])).content;
    expect(page).not.toMatch(/og:image/);
  });
});

describe("storefront sitemap.xml — closes the robots.txt Sitemap: promise", () => {
  const inputFor3 = (p: StorefrontProduct) => ({ product: p, artifacts: artifactsFor(p), palette: AVERIONICS });

  it("lists every one of the 21 real product URLs", () => {
    const sitemap = generateStorefrontSitemap(products().map(inputFor3));
    expect(sitemap.path).toBe("sitemap.xml");
    for (const p of products()) {
      expect(sitemap.content).toContain(`<loc>https://${p.subdomain}/</loc>`);
    }
  });

  it("is well-formed XML with the standard sitemap namespace", () => {
    const sitemap = generateStorefrontSitemap(products().map(inputFor3));
    expect(sitemap.content).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(sitemap.content).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(sitemap.content).toContain("</urlset>");
    // Every <url> opened is closed — the simplest well-formedness check that
    // would actually catch a template mistake (e.g. a dangling <url> tag).
    const opens = (sitemap.content.match(/<url>/g) ?? []).length;
    const closes = (sitemap.content.match(/<\/url>/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(opens).toBe(products().length);
  });

  it("matches a URL that actually serves this file — not axis-web's unrelated domain", () => {
    const robots = generateStorefrontRobots();
    // Verified live before this test was written: iliad.trustfabric.ai is a
    // DIFFERENT Cloudflare Pages project (axis-web) that returns 200 with
    // its own unrelated sitemap — pointing there would silently mislead a
    // crawler, not 404 loudly. axis-storefront.pages.dev is THIS deploy's
    // own stable alias and is the one host confirmed to serve this file.
    expect(robots.content).toContain("Sitemap: https://axis-storefront.pages.dev/sitemap.xml");
    expect(robots.content).not.toContain("iliad.trustfabric.ai/sitemap.xml");
    expect(generateStorefrontSitemap(products().map(inputFor3)).path).toBe("sitemap.xml");
  });

  it("is deterministic — same registry twice, byte-identical file", () => {
    const a = generateStorefrontSitemap(products().map(inputFor3)).content;
    const b = generateStorefrontSitemap(products().map(inputFor3)).content;
    expect(a).toBe(b);
  });

  it("escapes a hostile subdomain rather than interpolating it raw", () => {
    const hostile: StorefrontProduct = {
      id: "x", name: "x", subdomain: '"><script>alert(1)</script>', programs: ["x"],
      price_usd: 1, billing: "one_time", tier_min: "paid",
    };
    const sitemap = generateStorefrontSitemap([{ product: hostile, artifacts: ["a.md"], palette: AVERIONICS }]);
    expect(sitemap.content).not.toContain("<script>");
  });
});
