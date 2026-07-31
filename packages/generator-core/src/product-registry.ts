/**
 * The 20 generator programs, each its own standalone application — see
 * docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md. Owner directive
 * (2026-07-31): no mergers. CONSOLIDATION.md's 9-product bundle map (and this
 * file's earlier shape) is superseded; every program gets its own product
 * entry, one-to-one, growing via its own Apply/Verify/Watch mechanic rather
 * than being absorbed into a neighbor.
 *
 * One module, so pricing/subdomain/program drift the same way hand-duplicated
 * catalogs always have in this repo (a named recurring bug family — see
 * harden-polish loop notes) is structurally impossible: every consumer
 * (billing, landing pages, entitlement checks) reads THIS.
 *
 * Prices are drawn from this repo's own pre-merger per-program analysis
 * (docs/saas-strategy/<brand>.md, written before the rejected consolidation),
 * not invented fresh. Several of those files recommended "bundle with X" or
 * "not sellable alone" — under the no-mergers directive those became
 * standalone prices instead, set at the weakest real comparable in the set
 * ($15-19) rather than pulled from nowhere.
 */
export interface Product {
  id: string;
  name: string;
  subdomain: string;
  programs: readonly string[];
  price_usd: number | "free";
  billing: "one_time" | "recurring" | "free";
  tier_min: "free" | "paid" | "suite";
  /** Set only when something OTHER than the 2026-08-15 recurring-billing date
   * blocks this product from shipping — e.g. a paid third-party license. */
  gate_note?: string;
}

export const PRODUCT_REGISTRY: Record<string, Product> = {
  skills: {
    id: "skills", name: "Skills", subdomain: "skills.trustfabric.ai",
    programs: ["skills"], price_usd: 9, billing: "recurring", tier_min: "paid",
  },
  mcp: {
    id: "mcp", name: "MCP", subdomain: "mcp.trustfabric.ai",
    programs: ["mcp"], price_usd: 29, billing: "recurring", tier_min: "paid",
  },
  deploy: {
    id: "deploy", name: "Deploy", subdomain: "deploy.trustfabric.ai",
    programs: ["deploy"], price_usd: 19, billing: "recurring", tier_min: "paid",
  },
  closer: {
    id: "closer", name: "Closer", subdomain: "closer.trustfabric.ai",
    programs: ["closer"], price_usd: 49, billing: "one_time", tier_min: "paid",
  },
  theme: {
    id: "theme", name: "Theme", subdomain: "theme.trustfabric.ai",
    programs: ["theme"], price_usd: 19, billing: "recurring", tier_min: "paid",
  },
  frontend: {
    id: "frontend", name: "Frontend", subdomain: "frontend.trustfabric.ai",
    programs: ["frontend"], price_usd: 19, billing: "recurring", tier_min: "paid",
  },
  seo: {
    id: "seo", name: "SEO", subdomain: "seo.trustfabric.ai",
    programs: ["seo"], price_usd: 19, billing: "recurring", tier_min: "paid",
  },
  debug: {
    id: "debug", name: "Debug", subdomain: "debug.trustfabric.ai",
    programs: ["debug"], price_usd: 15, billing: "recurring", tier_min: "paid",
  },
  optimization: {
    id: "optimization", name: "Optimization", subdomain: "optimization.trustfabric.ai",
    programs: ["optimization"], price_usd: 29, billing: "recurring", tier_min: "paid",
  },
  search: {
    // Deliberately free — the architecture read every other product consumes,
    // and the funnel the whole hub depends on. Not a product to monetize.
    id: "search", name: "Search", subdomain: "search.trustfabric.ai",
    programs: ["search"], price_usd: "free", billing: "free", tier_min: "free",
  },
  artifacts: {
    id: "artifacts", name: "Artifacts", subdomain: "artifacts.trustfabric.ai",
    programs: ["artifacts"], price_usd: 29, billing: "recurring", tier_min: "paid",
  },
  superpowers: {
    id: "superpowers", name: "Superpowers", subdomain: "superpowers.trustfabric.ai",
    programs: ["superpowers"], price_usd: 19, billing: "recurring", tier_min: "paid",
  },
  "agentic-purchasing": {
    id: "agentic-purchasing", name: "Agentic Purchasing", subdomain: "commerce.trustfabric.ai",
    programs: ["agentic-purchasing"], price_usd: 99, billing: "recurring", tier_min: "suite",
  },
  brand: {
    id: "brand", name: "Brand", subdomain: "brand.trustfabric.ai",
    programs: ["brand"], price_usd: 15, billing: "recurring", tier_min: "paid",
  },
  marketing: {
    id: "marketing", name: "Marketing", subdomain: "marketing.trustfabric.ai",
    programs: ["marketing"], price_usd: 19, billing: "recurring", tier_min: "paid",
  },
  notebook: {
    id: "notebook", name: "Notebook", subdomain: "notebook.trustfabric.ai",
    programs: ["notebook"], price_usd: 15, billing: "recurring", tier_min: "paid",
  },
  obsidian: {
    // Kept free on its own merits, not as a merger artifact: single-user,
    // tool-specific, the least willing-to-pay segment graded in its own
    // pre-merger analysis (docs/saas-strategy/vault.md) — goodwill, not revenue.
    id: "obsidian", name: "Obsidian", subdomain: "obsidian.trustfabric.ai",
    programs: ["obsidian"], price_usd: "free", billing: "free", tier_min: "free",
  },
  canvas: {
    id: "canvas", name: "Canvas", subdomain: "canvas.trustfabric.ai",
    programs: ["canvas"], price_usd: 15, billing: "recurring", tier_min: "paid",
  },
  remotion: {
    id: "remotion", name: "Remotion", subdomain: "remotion.trustfabric.ai",
    programs: ["remotion"], price_usd: 29, billing: "recurring", tier_min: "paid",
    gate_note: "Blocked on an owner-purchased Remotion company license (@remotion/renderer at our scale) — do not ship renders before the license exists.",
  },
  algorithmic: {
    id: "algorithmic", name: "Algorithmic", subdomain: "algorithmic.trustfabric.ai",
    programs: ["algorithmic"], price_usd: 19, billing: "recurring", tier_min: "paid",
  },
};

export const PRODUCT_IDS = Object.keys(PRODUCT_REGISTRY);

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
