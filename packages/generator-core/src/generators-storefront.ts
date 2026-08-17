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
 * The storefront page. Semantic and accessible by construction: one h1, real
 * <ul> for the artifact list, a real <a> for the call to action, and no
 * interactive div anywhere — the frontend program's own auditor is run against
 * this output in the tests.
 */
export function generateStorefrontPage(input: StorefrontInput): GeneratedFile {
  const { product, artifacts, palette } = input;
  const name = htmlEscape(product.name);
  const price = htmlEscape(priceLine(product));
  const count = artifacts.length;
  const programList = product.programs.map((p) => htmlEscape(p)).join(", ");

  const css = [
    `:root{--p:${palette.primary};--ink:${palette.ink};--bg:${palette.surface};--muted:${palette.muted};--accent:${palette.accent}}`,
    `*{box-sizing:border-box}`,
    `body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.6}`,
    `main{max-width:64rem;margin:0 auto;padding:4rem 1.5rem}`,
    `h1{font-size:clamp(2rem,5vw,3rem);margin:0 0 .5rem;letter-spacing:-.02em}`,
    `.price{font-family:ui-monospace,monospace;color:var(--p);font-size:1.25rem}`,
    `.frame{border:1px solid color-mix(in srgb,var(--p) 35%,transparent);border-radius:.75rem;padding:1.5rem;margin:2rem 0}`,
    `ul{margin:0;padding-left:1.25rem}`,
    `li{font-family:ui-monospace,monospace;font-size:.875rem;color:var(--muted)}`,
    `a.cta{display:inline-block;margin-top:1rem;padding:.75rem 1.5rem;border-radius:.5rem;background:var(--p);color:#062c36;font-weight:700;text-decoration:none}`,
    `a.cta:focus-visible{outline:3px solid var(--ink);outline-offset:2px}`,
    `footer{color:var(--muted);font-size:.875rem;margin-top:3rem}`,
  ].join("");

  const body = [
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
    isPurchasable(product)
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
    `<link rel="icon" type="image/svg+xml" href="/${htmlEscape(product.id)}-favicon.svg">`,
    `<link rel="canonical" href="https://${htmlEscape(product.subdomain)}/">`,
    `<style>${css}</style>`,
    `</head>`,
    `<body>${body}</body>`,
    `</html>`,
  ].join("\n");

  return { path: `${product.id}/index.html`, content: html, content_type: "text/html" } as GeneratedFile;
}
