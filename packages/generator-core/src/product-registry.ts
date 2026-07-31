/**
 * The 9 standalone applications the hub's 20 generator programs consolidate
 * into — see docs/saas-strategy/CONSOLIDATION.md for the reasoning behind
 * each merge. One module, so pricing/subdomain/program-set drift the same way
 * hand-duplicated catalogs always have in this repo (a named recurring bug
 * family — see harden-polish loop notes) is structurally impossible: every
 * consumer (billing, landing pages, entitlement checks) reads THIS.
 *
 * Deliberately excludes the 4 parked programs (optimization, superpowers,
 * remotion, algorithmic) — CONSOLIDATION.md names why each is parked. A parked
 * program still ships inside the hub bundle; it just has no product entry
 * here, and PRODUCT_REGISTRY_COVERS_KNOWN_PROGRAMS below documents that gap
 * rather than silently omitting it.
 */
export interface Product {
  id: string;
  name: string;
  subdomain: string;
  programs: readonly string[];
  price_usd: number | "free";
  billing: "one_time" | "recurring" | "free";
  tier_min: "free" | "paid" | "suite";
}

export const PRODUCT_REGISTRY: Record<string, Product> = {
  onboard: {
    id: "onboard",
    name: "Onboard",
    subdomain: "onboard.trustfabric.ai",
    programs: ["skills", "notebook", "debug"],
    price_usd: 9,
    billing: "recurring",
    tier_min: "paid",
  },
  socket: {
    id: "socket",
    name: "Socket",
    subdomain: "socket.trustfabric.ai",
    programs: ["mcp"],
    price_usd: 29,
    billing: "recurring",
    tier_min: "paid",
  },
  runway: {
    id: "runway",
    name: "Runway",
    subdomain: "runway.trustfabric.ai",
    programs: ["deploy"],
    price_usd: 19,
    billing: "recurring",
    tier_min: "paid",
  },
  crate: {
    id: "crate",
    name: "Crate",
    subdomain: "crate.trustfabric.ai",
    programs: ["closer"],
    price_usd: 49,
    billing: "one_time",
    tier_min: "paid",
  },
  palette: {
    id: "palette",
    name: "Palette",
    subdomain: "palette.trustfabric.ai",
    programs: ["theme"],
    price_usd: 19,
    billing: "recurring",
    tier_min: "paid",
  },
  embed: {
    id: "embed",
    name: "Embed",
    subdomain: "embed.trustfabric.ai",
    // frontend (Grain) and seo (Crawl) absorbed per CONSOLIDATION.md #2 and #6 —
    // neither is sellable standalone (frontend emits prose against v0's code
    // generator; seo has 2/5 machine-readable outputs and mature incumbents).
    programs: ["artifacts", "frontend", "seo"],
    price_usd: 29,
    billing: "recurring",
    tier_min: "paid",
  },
  atlas: {
    id: "atlas",
    name: "Atlas",
    subdomain: "atlas.trustfabric.ai",
    // canvas (Poster) absorbed — visual output for the same architecture read.
    // Priced free deliberately: this is the funnel every other product depends
    // on, not a product to monetize on its own (CONSOLIDATION.md #4).
    programs: ["search", "canvas"],
    price_usd: "free",
    billing: "free",
    tier_min: "free",
  },
  checkout: {
    id: "checkout",
    name: "Checkout",
    subdomain: "checkout.trustfabric.ai",
    programs: ["agentic-purchasing"],
    price_usd: 99,
    billing: "recurring",
    tier_min: "suite",
  },
  reach: {
    id: "reach",
    name: "Reach",
    subdomain: "reach.trustfabric.ai",
    // brand (Voice) absorbed — one go-to-market pack, not two documents
    // neither of which is sellable alone (CONSOLIDATION.md #6).
    programs: ["marketing", "brand"],
    price_usd: 29,
    billing: "recurring",
    tier_min: "paid",
  },
};

export const PRODUCT_IDS = Object.keys(PRODUCT_REGISTRY);

/**
 * Programs intentionally absent from every product — see CONSOLIDATION.md's
 * "Parked" section for why each is parked and what un-parks it. Exported so a
 * guard test can assert PRODUCT_REGISTRY's coverage gap is exactly this set
 * and nothing else — an accidentally-dropped program should fail a test, not
 * silently vanish from what's sellable.
 *
 * `obsidian` was a real gap this file's own test caught: the per-program
 * guide (docs/saas-strategy/vault.md) graded it "free add-on, not revenue"
 * but CONSOLIDATION.md's final 9-product table never assigned it anywhere —
 * neither sold nor formally parked. Added here rather than merged into a
 * paid product, matching the grading: single-user, tool-specific, the least
 * willing-to-pay segment in the portfolio.
 */
export const PARKED_PROGRAMS = ["optimization", "superpowers", "remotion", "algorithmic", "obsidian"] as const;

function productForProgram(program: string): string | undefined {
  for (const [id, p] of Object.entries(PRODUCT_REGISTRY)) {
    if (p.programs.includes(program)) return id;
  }
  return undefined;
}

/** Which product (if any) sells access to a given generator program. */
export function productIdForProgram(program: string): string | undefined {
  return productForProgram(program);
}

export function getProduct(productId: string): Product | undefined {
  return PRODUCT_REGISTRY[productId];
}

