// ─── spoke_05: each product's storefront page, generated from the registry ────
//
// "We should be the first customer of the programs we sell; a landing page we
// could not generate with our own tools is an argument against buying them."
// Twenty pages written by hand would be twenty drift surfaces; these are derived
// from PRODUCT_REGISTRY and the real generator manifest, so a program that gains
// an artifact gains it on its page too, with no one remembering to update copy.
//
// THE LANDMINE THIS FEATURE IS BUILT AROUND. Scoping spoke_05 originally found a
// data-integrity defect in its own input: the registry marked 17 of 20 products
// `billing: "recurring"` at monthly prices while TERMS_OF_SERVICE.md says a
// purchase "is a single, one-time charge … does not automatically renew".
// Generating pages from that would have published 17 pricing claims contradicting
// our own Terms across 20 public URLs. The registry now separates `billing`
// (today's truth) from `billing_at_gate` (post-gate intent), and THIS FILE MUST
// RENDER `billing` — never `billing_at_gate`. priceLine() is the single place
// that decision is made, and storefront-honesty tests hold it there.
//
// Everything on the page is either read from the registry/manifest or omitted.
// There is no marketing copy here that asserts a number, because a number in
// prose is a number that drifts.
import type { GeneratedFile } from "./types.js";
import { htmlEscape } from "./md-sanitize.js";

/**
 * JSON.stringify for embedding inside a <script> tag.
 *
 * Plain JSON.stringify does not escape the less-than character, so a
 * product name that happens to contain a script-closing sequence would end
 * the tag early and inject whatever follows as live HTML/script — the exact
 * hostile-input case this file's other escaping tests already cover for the
 * rest of the page. Replacing every less-than with its < unicode escape
 * is valid inside any JSON string (JSON strings may contain \uXXXX escapes
 * for any character) and neutralizes that entirely, incidentally also
 * defusing an HTML comment opener for the same reason.
 */
function jsonLdStringify(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export interface StorefrontProduct {
  id: string;
  name: string;
  subdomain: string;
  programs: string[];
  price_usd: number | string;
  /** TODAY's truth. Never render billing_at_gate. */
  billing: string;
  tier_min: string;
  gate_note?: string;
}

export interface StorefrontInput {
  product: StorefrontProduct;
  /** Real output filenames for this product's programs, from the generator manifest. */
  artifacts: string[];
  /** Hex palette from the averionics token contract, used for the page's own theme. */
  palette: { primary: string; ink: string; surface: string; muted: string; accent: string };
}

/** The averionics defaults — HUD cyan on cockpit slate, matching design-tokens.json. */
export const AVERIONICS: StorefrontInput["palette"] = {
  primary: "#06b6d4",
  ink: "#f4f7fa",
  surface: "#0d141d",
  muted: "#7e8ea3",
  accent: "#0e7490",
};

/**
 * The one place billing language is decided.
 *
 * `free` is a STRING sentinel in the registry while paid prices are numbers —
 * a mixed type that makes arithmetic silently produce NaN. Handled explicitly
 * here rather than formatted blindly.
 */
export function priceLine(product: StorefrontProduct): string {
  // A gated product cannot be delivered yet, so it does not get a price. Putting
  // "$29" on a page for something we cannot ship would be the same class of
  // defect as the recurring-billing one: a public claim our own records
  // contradict. The REASON stays internal (see isPurchasable).
  if (!isPurchasable(product)) return "Not yet available";
  if (product.price_usd === "free" || product.tier_min === "free") return "Free";
  const n = typeof product.price_usd === "number" ? product.price_usd : Number(product.price_usd);
  if (!Number.isFinite(n)) return "Contact us";
  // one_time is today's truth and matches the Terms. Anything else is rendered
  // as a plain price with NO renewal language, because claiming a renewal the
  // Terms do not promise is the exact defect that blocked this feature.
  return `$${n} one-time`;
}

/**
 * gate_note marks a product we cannot deliver yet (remotion: an unpurchased
 * company licence).
 *
 * Its TEXT is an internal engineering note — "do not ship renders before the
 * license exists" is written for the ledger, not for a customer, and the first
 * draft of this generator published it verbatim on a public page. The gate is
 * honoured by withholding the price and the buy action; the note itself is never
 * rendered. Customers get the fact, not our internal reasoning.
 */
export function isPurchasable(product: StorefrontProduct): boolean {
  return !product.gate_note;
}

/** A per-product favicon that shares one frame so the set composes as a brand. */
export function generateStorefrontFavicon(input: StorefrontInput): GeneratedFile {
  const { product, palette } = input;
  // Deterministic hue offset per product id — same id, same mark, forever.
  let h = 0;
  for (const ch of product.id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const initial = htmlEscape(product.name.slice(0, 1).toUpperCase());
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="${htmlEscape(product.name)}">`,
    `<title>${initial}</title>`,
    // Shared frame: the constant across all 21 marks.
    `<rect width="32" height="32" rx="7" fill="${palette.surface}"/>`,
    `<rect x="2.5" y="2.5" width="27" height="27" rx="5.5" fill="none" stroke="${palette.primary}" stroke-width="1.5" opacity="0.85"/>`,
    // Per-product instrument arc: the variable.
    `<path d="M16 6 A10 10 0 0 1 26 16" fill="none" stroke="hsl(${h} 70% 55%)" stroke-width="2.5" stroke-linecap="round"/>`,
    `<text x="16" y="21" text-anchor="middle" font-family="ui-monospace,monospace" font-size="12" font-weight="700" fill="${palette.ink}">${initial}</text>`,
    `</svg>`,
  ].join("");
  return { path: `${product.id}-favicon.svg`, content: svg, content_type: "image/svg+xml" } as GeneratedFile;
}

/**
 * The page's meta description — and the only source for it. Composed purely
 * from real fields (count, programs, price) the page's own body already
 * renders, same discipline as priceLine(): a number in prose is a number
 * that drifts, so there is no separately hand-written marketing sentence to
 * fall out of sync with what the product actually ships.
 */
export function metaDescription(input: StorefrontInput): string {
  const { product, artifacts } = input;
  const count = artifacts.length;
  const unit = count === 1 ? "artifact" : "artifacts";
  const programList = product.programs.join(", ");
  const price = priceLine(product);
  const priceClause = isPurchasable(product) ? `${price}.` : "Not yet available for purchase.";
  return `${product.name}: ${count} ${unit} generated from your own repository (${programList}). ${priceClause}`;
}

/**
 * The page's JSON-LD payload, as a plain object — kept separate from the HTML
 * string so tests can assert on specific fields without re-parsing markup,
 * and so validateStructuredData (seo-structured-data.ts) can be run against
 * the ACTUAL emitted block in generateStorefrontPage below, not a rebuilt
 * copy that could silently diverge from it.
 *
 * @type SoftwareApplication, not Product: what's sold is a generator program,
 * not physical/shippable inventory, and Google's SoftwareApplication rich
 * result is the closer semantic match. `offers` is included only for a
 * purchasable, numerically-priced product — the same isPurchasable() gate
 * the page's own CTA already obeys, so structured data can never advertise a
 * price the visible page withholds.
 */
export function structuredData(input: StorefrontInput): Record<string, unknown> {
  const { product } = input;
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: product.name,
    applicationCategory: "DeveloperApplication",
    description: metaDescription(input),
    url: `https://${product.subdomain}/`,
  };
  if (isPurchasable(product) && product.price_usd !== "free" && typeof product.price_usd !== "undefined") {
    const n = typeof product.price_usd === "number" ? product.price_usd : Number(product.price_usd);
    if (Number.isFinite(n)) {
      node.offers = { "@type": "Offer", price: n, priceCurrency: "USD", availability: "https://schema.org/InStock" };
    }
  } else if (product.price_usd === "free" || product.tier_min === "free") {
    node.offers = { "@type": "Offer", price: 0, priceCurrency: "USD", availability: "https://schema.org/InStock" };
  }
  return node;
}

/**
 * The storefront page. Semantic and accessible by construction: one h1, real
 * <ul> for the artifact list, a real <a> for the call to action, and no
 * interactive div anywhere — the frontend program's own auditor is run against
 * this output in the tests.
 *
 * Typography and elevation match apps/web/src/theme.css byte-for-byte on the
 * tokens that matter for continuity (Inter/JetBrains Mono, --radius-lg,
 * --shadow-base/--shadow-lg) — read from that file's own values, not
 * eyeballed, so a storefront page and the app it sells look like the same
 * product rather than a generic landing-page template wearing the brand
 * colour. Colour tokens (palette) already matched before this change; font
 * and elevation did not.
 */
export function generateStorefrontPage(input: StorefrontInput): GeneratedFile {
  const { product, artifacts, palette } = input;
  const name = htmlEscape(product.name);
  const price = htmlEscape(priceLine(product));
  const count = artifacts.length;
  const programList = product.programs.map((p) => htmlEscape(p)).join(", ");
  const description = htmlEscape(metaDescription(input));
  const purchasable = isPurchasable(product);
  const canonical = `https://${htmlEscape(product.subdomain)}/`;
  const jsonLd = jsonLdStringify(structuredData(input));

  const css = [
    `:root{--p:${palette.primary};--ink:${palette.ink};--bg:${palette.surface};--muted:${palette.muted};--accent:${palette.accent};--radius:.5rem;--radius-lg:.75rem;--shadow:0 1px 3px 0 rgb(0 0 0 / .3),0 1px 2px -1px rgb(0 0 0 / .3);--shadow-lg:0 10px 18px rgba(0,0,0,.55)}`,
    `*{box-sizing:border-box}`,
    // Inter + JetBrains Mono, matching apps/web/src/theme.css's --font-sans/--font-mono
    // exactly (same fallback chain), loaded from Google Fonts since this static site
    // ships no local font files of its own.
    `body{margin:0;background:var(--bg);color:var(--ink);font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.6}`,
    `header{max-width:64rem;margin:0 auto;padding:1.5rem 1.5rem 0;display:flex;align-items:center;gap:.5rem}`,
    `header a{color:var(--muted);text-decoration:none;font-size:.875rem;font-family:"JetBrains Mono","Fira Code",Consolas,monospace}`,
    `header a:hover,header a:focus-visible{color:var(--p)}`,
    `main{max-width:64rem;margin:0 auto;padding:2.5rem 1.5rem 4rem}`,
    `h1{font-size:clamp(2rem,5vw,3rem);margin:0 0 .5rem;letter-spacing:-.02em}`,
    `.price{font-family:"JetBrains Mono","Fira Code",Consolas,monospace;color:var(--p);font-size:1.25rem}`,
    `.frame{border:1px solid color-mix(in srgb,var(--p) 35%,transparent);border-radius:var(--radius-lg);padding:1.5rem;margin:2rem 0;box-shadow:var(--shadow)}`,
    `ul{margin:0;padding-left:1.25rem}`,
    `li{font-family:"JetBrains Mono","Fira Code",Consolas,monospace;font-size:.875rem;color:var(--muted)}`,
    `a.cta{display:inline-block;margin-top:1rem;padding:.75rem 1.5rem;border-radius:var(--radius);background:var(--p);color:#062c36;font-weight:700;text-decoration:none;box-shadow:var(--shadow-lg)}`,
    `a.cta:focus-visible{outline:3px solid var(--ink);outline-offset:2px}`,
    `footer{color:var(--muted);font-size:.875rem;margin-top:3rem}`,
  ].join("");

  const body = [
    // A minimal brand strip, not a full nav — every page links back to the
    // hub it was generated by, so the 21 subdomains read as one family
    // rather than 21 disconnected landing pages. This is the "continuity
    // across pages" half of the owner's design direction; the favicons
    // (generateStorefrontFavicon) are the other half.
    `<header><a href="https://iliad.trustfabric.ai">AXIS' Iliad</a></header>`,
    `<main>`,
    `<h1>${name}</h1>`,
    `<p class="price">${price}</p>`,
    // The count is rendered FROM the list that follows it, so the two cannot
    // disagree — the counts-honesty failure mode this repo keeps finding.
    `<div class="frame">`,
    `<h2>What it generates</h2>`,
    `<p>${count} ${count === 1 ? "artifact" : "artifacts"} from program${product.programs.length === 1 ? "" : "s"}: ${programList}.</p>`,
    `<ul>${artifacts.map((a) => `<li>${htmlEscape(a)}</li>`).join("")}</ul>`,
    `</div>`,
    // Gated: state the fact, withhold the buy action, never expose the internal
    // reason. No CTA, because inviting a purchase we cannot fulfil is the lie.
    purchasable
      ? `<a class="cta" href="https://iliad.trustfabric.ai">Run it on your repository</a>`
      : `<p class="frame">This program is not available for purchase yet. Everything above is already generated and verified; it goes on sale once delivery is proven end to end.</p>`,
    `<footer>Part of AXIS' Iliad. Every artifact is derived from your repository — nothing is templated in.</footer>`,
    `</main>`,
  ].join("");

  const html = [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>${name} — AXIS' Iliad</title>`,
    `<meta name="description" content="${description}">`,
    // Gated products (no CTA on the page) are also told not to index — an
    // indexable page for something that cannot be bought yet is the same
    // "public claim our own records contradict" class of defect priceLine()
    // and the gate-note handling above already exist to prevent.
    `<meta name="robots" content="${purchasable ? "index,follow" : "noindex,follow"}">`,
    `<meta name="theme-color" content="${palette.surface}">`,
    `<link rel="icon" type="image/svg+xml" href="/${htmlEscape(product.id)}-favicon.svg">`,
    `<link rel="canonical" href="${canonical}">`,
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap">`,
    // Open Graph / Twitter Card — no og:image: this repo ships no image
    // pipeline (no new dependency for one — see CLAUDE.md's "no dependencies
    // without discussion" — and SVG is unreliable/unsupported as og:image on
    // the major consumers, Facebook explicitly requires jpg/png/gif). Omitting
    // the tag is the honest choice; a broken or non-rendering preview image
    // would be worse than none.
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="AXIS' Iliad">`,
    `<meta property="og:title" content="${name} — AXIS' Iliad">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${name} — AXIS' Iliad">`,
    `<meta name="twitter:description" content="${description}">`,
    `<script type="application/ld+json">${jsonLd}</script>`,
    `<style>${css}</style>`,
    `</head>`,
    `<body>${body}</body>`,
    `</html>`,
  ].join("\n");

  return { path: `${product.id}/index.html`, content: html, content_type: "text/html" } as GeneratedFile;
}

/**
 * sitemap.xml — root-level like robots.txt/llms.txt above, and for the same
 * reason (_worker.js only rewrites "/", so this resolves identically from
 * any of the 21 subdomains). robots.txt already REFERENCES this URL (see
 * generateStorefrontRobots's Sitemap: line); until this function, nothing
 * generated the file it points to — a real gap, not a hypothetical one,
 * found by checking what actually exists rather than trusting the earlier
 * receipt that called spoke_05 "complete".
 */
export function generateStorefrontSitemap(inputs: StorefrontInput[]): GeneratedFile {
  const urls = inputs
    .map(({ product }) => `  <url><loc>https://${htmlEscape(product.subdomain)}/</loc></url>`)
    .join("\n");
  const content = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    urls,
    `</urlset>`,
    ``,
  ].join("\n");
  return { path: "sitemap.xml", content, content_type: "application/xml" } as GeneratedFile;
}

// ─── ext_02: Cloudflare Agent Readiness — root-level, host-independent ────────
//
// _worker.js (built alongside these by scripts/build-storefront.mjs) rewrites
// ONLY the "/" path per Host header; every other path — these included — falls
// through to plain Pages asset routing and resolves identically no matter which
// of the 21 subdomains is hit. So robots.txt and llms.txt are written ONCE, at
// the dist root, not per product.

/**
 * robots.txt for every *.trustfabric.ai storefront subdomain. `Content-Signal`
 * is Cloudflare's directive for AI crawlers/trainers/assistants — this repo has
 * no prior convention for it (grepped repo-wide, zero matches before this),
 * chosen permissive here because the whole point of a storefront selling an
 * agent-discoverability product is to itself be agent-discoverable.
 *
 * FIXED 2026-08-20: the Sitemap: line previously pointed at
 * iliad.trustfabric.ai — a DIFFERENT Cloudflare Pages project (axis-web, the
 * main app) that has always served its own unrelated sitemap.xml (its own
 * app routes, not the storefront's 21 products). Verified live before fixing,
 * not assumed: iliad.trustfabric.ai/sitemap.xml returns 200 with axis-web's
 * own content, silently masking the fact that no sitemap for the storefront
 * itself existed anywhere. axis-storefront.pages.dev is THIS deploy's own
 * stable Cloudflare Pages alias (unlike the per-deploy hashed preview URL,
 * it always resolves to whichever build is currently live — the same
 * guarantee robots.txt/sitemap.xml already rely on being host-independent
 * across all 21 custom subdomains) and is the one host that actually,
 * verifiably serves this file.
 */
export function generateStorefrontRobots(): GeneratedFile {
  const content = [
    `User-agent: *`,
    `Allow: /`,
    ``,
    `# Machine-readable product catalog — the same registry every page here renders from.`,
    `# https://llmstxt.org`,
    `Sitemap: https://axis-storefront.pages.dev/sitemap.xml`,
    ``,
    `Content-Signal: search=yes, ai-train=yes, ai-input=yes`,
    ``,
  ].join("\n");
  return { path: "robots.txt", content, content_type: "text/plain" } as GeneratedFile;
}

/**
 * llms.txt for the storefront — one global file (not 21 per-product ones),
 * since it lives at the dist root and resolves identically on every subdomain
 * anyway. Reuses priceLine()/isPurchasable() so a gated product (remotion) is
 * never sold here either, and the artifact count matches each product's own
 * page because both read the same `artifacts` list.
 */
export function generateStorefrontLlmsTxt(inputs: StorefrontInput[]): GeneratedFile {
  const lines = inputs.map(({ product, artifacts }) => {
    const count = artifacts.length;
    const unit = count === 1 ? "artifact" : "artifacts";
    return `- [${htmlEscape(product.name)}](https://${htmlEscape(product.subdomain)}/) — ${htmlEscape(
      priceLine(product),
    )}. ${count} ${unit} from: ${product.programs.map((p) => htmlEscape(p)).join(", ")}.`;
  });

  const content = [
    `# AXIS' Iliad — Storefront`,
    ``,
    `> ${inputs.length} standalone products, one per generator program, each priced and`,
    `> described from the same registry its own page renders from — nothing here`,
    `> is hand-written, so it cannot drift from what the product actually ships.`,
    ``,
    `Products:`,
    ``,
    ...lines,
    ``,
    `Run any of these against your own repository: https://iliad.trustfabric.ai`,
    ``,
  ].join("\n");
  return { path: "llms.txt", content, content_type: "text/markdown" } as GeneratedFile;
}
