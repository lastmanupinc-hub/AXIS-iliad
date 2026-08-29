// Payment-stack fingerprinting — PURE. No I/O, no fetch, no network.
//
// Given the bytes of a public page (plus its response status/headers), work out
// which payment processors a merchant uses, whether their checkout looks
// broken, and what vertical they are in. The fetching half lives in
// apps/api/src/revops-ingest.ts; keeping this pure is what makes the
// intelligence testable against fixtures instead of against the live internet.
//
// SCOPE BOUNDARY, deliberate: this detects TECHNOLOGY AND BUSINESS FACTS, never
// people. There is no email harvesting, no name extraction, no contact scraping
// anywhere in this module, and there should not be. Decision-maker discovery
// stays a human step — it is the legally fraught part, and hand-researched
// contacts convert better than scraped ones anyway. `decision_maker` on a
// prospect is only ever set by an operator.

import type { SignalKind } from "./types.js";

/** What the fetcher hands us. Deliberately minimal so tests need no HTTP. */
export interface PageSnapshot {
  /** Final URL after redirects. */
  readonly url: string;
  readonly status: number;
  /** Lowercased header names. */
  readonly headers: Readonly<Record<string, string>>;
  /** Response body. May be truncated by the fetcher's size cap. */
  readonly html: string;
}

export interface FingerprintResult {
  /** Processor ids detected, most confident first. */
  readonly processors: readonly string[];
  /** Signals worth recording as `signal` events. */
  readonly signals: readonly SignalKind[];
  /** Best-guess vertical, when the content is unambiguous. */
  readonly vertical?: string;
  /** True when the page itself says payments are unavailable. */
  readonly checkout_impaired: boolean;
  /** Human-readable evidence for every conclusion above. */
  readonly evidence: readonly string[];
}

/**
 * Processor fingerprints. Each is a distinctive host or SDK marker that only
 * appears when the merchant has actually integrated that processor — NOT a bare
 * brand mention, which would fire on any "we accept Visa" footer.
 */
const PROCESSOR_MARKERS: ReadonlyArray<{ id: string; markers: readonly string[] }> = [
  { id: "stripe", markers: ["js.stripe.com", "checkout.stripe.com", "api.stripe.com"] },
  { id: "paypal", markers: ["paypal.com/sdk/js", "paypalobjects.com", "paypal.com/checkoutnow"] },
  { id: "square", markers: ["squareup.com", "web.squarecdn.com", "squarecdn.com"] },
  { id: "braintree", markers: ["braintreegateway.com", "js.braintreegateway.com"] },
  { id: "adyen", markers: ["checkoutshopper-live.adyen.com", "adyen.com/checkoutshopper"] },
  { id: "authorize_net", markers: ["authorize.net", "accept.authorize.net"] },
  { id: "nmi", markers: ["secure.networkmerchants.com", "secure.nmi.com"] },
  { id: "checkout_com", markers: ["cdn.checkout.com", "api.checkout.com"] },
  { id: "shopify_payments", markers: ["cdn.shopify.com", "shopify-features", "shopifycloud"] },
  { id: "woocommerce", markers: ["woocommerce", "wc-ajax="] },
  { id: "bigcommerce", markers: ["bigcommerce.com", "checkout-sdk"] },
  { id: "klarna", markers: ["klarna.com", "x.klarnacdn.net"] },
  { id: "afterpay", markers: ["afterpay.com", "static.afterpay.com"] },
  { id: "affirm", markers: ["affirm.com", "cdn1.affirm.com"] },
  { id: "recurly", markers: ["js.recurly.com", "recurly.com"] },
  { id: "chargebee", markers: ["js.chargebee.com", "chargebee.com"] },
  { id: "coinbase_commerce", markers: ["commerce.coinbase.com"] },
  { id: "bitpay", markers: ["bitpay.com"] },
];

/**
 * Phrases that mean "we cannot take money right now". This is the single
 * highest-intent signal a public page can carry for PAI'D: a merchant whose
 * checkout is down is actively losing revenue today.
 */
const CHECKOUT_DOWN_PHRASES: readonly string[] = [
  "payments temporarily unavailable",
  "unable to process payments",
  "checkout is currently disabled",
  "checkout temporarily unavailable",
  "we are not accepting orders",
  "ordering is temporarily disabled",
  "payment processing is currently down",
  "cannot accept credit cards at this time",
  "credit card payments are temporarily",
];

/**
 * A merchant asking for bank transfer / crypto / cheque ONLY is almost always
 * one that lost card acceptance. Weaker than an explicit outage message, so it
 * maps to payment_pain_public rather than checkout_down.
 */
const CARD_LOSS_PHRASES: readonly string[] = [
  "we no longer accept credit cards",
  "cash or check only",
  "bank transfer only",
  "crypto only",
  "zelle only",
  "we accept only cryptocurrency",
];

/**
 * Vertical keyword sets. Intentionally conservative — a single stray word is
 * not a vertical. Requires TWO distinct hits before claiming one, because a
 * wrong vertical silently mis-qualifies a prospect (score.ts gates on it).
 */
const VERTICAL_KEYWORDS: ReadonlyArray<{ vertical: string; words: readonly string[] }> = [
  { vertical: "cbd", words: ["cbd", "cannabidiol", "hemp-derived", "delta-8", "delta 8"] },
  { vertical: "vape", words: ["vape", "e-liquid", "vaporizer", "nicotine pouches", "e-cigarette"] },
  { vertical: "kratom", words: ["kratom", "mitragyna"] },
  { vertical: "nutraceutical", words: ["nutraceutical", "dietary supplement", "supplement stack", "sarms"] },
  { vertical: "peptides", words: ["peptide", "research peptides", "bpc-157"] },
  { vertical: "firearms", words: ["firearm", "ammunition", "ar-15", "gun parts", "ffl transfer"] },
  { vertical: "adult", words: ["adult content", "18+ only", "xxx", "camgirl"] },
  { vertical: "igaming", words: ["online casino", "sportsbook", "betting odds", "poker room"] },
  { vertical: "crypto", words: ["crypto exchange", "buy bitcoin", "web3 wallet", "defi"] },
  { vertical: "travel", words: ["book your trip", "travel packages", "tour operator", "charter flights"] },
  { vertical: "debt_collection", words: ["debt relief", "debt settlement", "credit repair"] },
  { vertical: "high_ticket_coaching", words: ["coaching program", "mastermind", "1:1 coaching"] },
];

/** Age gates are a strong high-risk tell independent of vertical keywords. */
const AGE_GATE_PHRASES: readonly string[] = [
  "are you 21 or older",
  "must be 21+",
  "verify your age",
  "age verification required",
  "are you over 18",
];

function normalize(html: string): string {
  return html.toLowerCase();
}

/**
 * Fingerprint one page.
 *
 * Every conclusion carries evidence. A prospect scored off this must be able to
 * answer "why?" — an unexplained enrichment is one nobody can audit or correct.
 */
export function fingerprintPage(page: PageSnapshot): FingerprintResult {
  const body = normalize(page.html);
  const evidence: string[] = [];
  const processors: string[] = [];
  const signals = new Set<SignalKind>();

  // ── Processors ───────────────────────────────────────────────────────
  for (const { id, markers } of PROCESSOR_MARKERS) {
    const hit = markers.find((m) => body.includes(m));
    if (hit) {
      processors.push(id);
      evidence.push(`processor:${id} (marker "${hit}")`);
    }
  }

  // ── Checkout health ──────────────────────────────────────────────────
  let checkout_impaired = false;

  // A 5xx on the merchant's own storefront is itself the signal.
  if (page.status >= 500) {
    checkout_impaired = true;
    signals.add("checkout_down");
    evidence.push(`checkout_down (HTTP ${page.status})`);
  }

  const downPhrase = CHECKOUT_DOWN_PHRASES.find((p) => body.includes(p));
  if (downPhrase) {
    checkout_impaired = true;
    signals.add("checkout_down");
    evidence.push(`checkout_down (page says "${downPhrase}")`);
  }

  const lossPhrase = CARD_LOSS_PHRASES.find((p) => body.includes(p));
  if (lossPhrase) {
    signals.add("payment_pain_public");
    evidence.push(`payment_pain_public (page says "${lossPhrase}")`);
  }

  // A storefront with NO detectable processor but explicit card-loss language
  // is the classic just-got-dropped profile.
  if (processors.length === 0 && lossPhrase) {
    signals.add("processor_terminated");
    evidence.push("processor_terminated (no processor detected + card-loss language)");
  }

  // ── Vertical ─────────────────────────────────────────────────────────
  let vertical: string | undefined;
  let bestHits = 0;
  for (const { vertical: v, words } of VERTICAL_KEYWORDS) {
    const hits = words.filter((w) => body.includes(w));
    // Two distinct keywords required — one is noise (a blog post, a footer).
    if (hits.length >= 2 && hits.length > bestHits) {
      bestHits = hits.length;
      vertical = v;
    }
  }
  if (vertical) {
    evidence.push(`vertical:${vertical} (${bestHits} keyword hits)`);
  }

  const ageGate = AGE_GATE_PHRASES.find((p) => body.includes(p));
  if (ageGate) {
    evidence.push(`age_gate ("${ageGate}")`);
    // Age gate + no vertical still tells us high-risk; the qualify() gate reads
    // facts.high_risk, so the ingest layer can set it from this.
  }

  return {
    processors,
    signals: [...signals],
    vertical,
    checkout_impaired,
    evidence,
  };
}

/** True when the page carries an age gate — a high-risk tell on its own. */
export function hasAgeGate(page: PageSnapshot): boolean {
  const body = normalize(page.html);
  return AGE_GATE_PHRASES.some((p) => body.includes(p));
}

/**
 * Compare a previous processor set against a new one. A merchant who swapped
 * processors recently is in-market by definition — they just proved they will
 * change, and whatever drove the change may not be resolved.
 */
export function detectStackChange(
  previous: readonly string[] | undefined,
  current: readonly string[],
): { changed: boolean; added: string[]; removed: string[] } {
  if (!previous || previous.length === 0) {
    return { changed: false, added: [], removed: [] };
  }
  const prev = new Set(previous);
  const cur = new Set(current);
  const added = [...cur].filter((p) => !prev.has(p));
  const removed = [...prev].filter((p) => !cur.has(p));
  return { changed: added.length > 0 || removed.length > 0, added, removed };
}
