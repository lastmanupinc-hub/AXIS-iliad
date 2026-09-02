import { describe, it, expect } from "vitest";
import {
  fingerprintPage,
  hasAgeGate,
  detectStackChange,
  isAllowed,
  parseRobots,
  ROBOTS_ABSENT,
  type PageSnapshot,
} from "./index.js";

function page(html: string, status = 200, url = "https://shop.example/"): PageSnapshot {
  return { url, status, headers: {}, html };
}

// ─── Processor detection ─────────────────────────────────────────────────

describe("fingerprintPage: processors", () => {
  it("detects a processor from its real SDK marker", () => {
    const r = fingerprintPage(page(`<script src="https://js.stripe.com/v3/"></script>`));
    expect(r.processors).toContain("stripe");
    expect(r.evidence.join(" ")).toContain("js.stripe.com");
  });

  it("does NOT fire on a bare brand mention in footer copy", () => {
    // "We accept Visa, Mastercard and PayPal" must not count as a PayPal
    // integration — brand words are everywhere; only integration markers count.
    const r = fingerprintPage(page(`<footer>We accept Visa, Mastercard and PayPal.</footer>`));
    expect(r.processors).toEqual([]);
  });

  it("detects multiple processors on one page", () => {
    const r = fingerprintPage(
      page(`<script src="https://js.stripe.com/v3/"></script>
            <script src="https://x.klarnacdn.net/kp/lib/v1/api.js"></script>`),
    );
    expect(r.processors).toContain("stripe");
    expect(r.processors).toContain("klarna");
  });
});

// ─── Checkout health: the highest-intent signal ──────────────────────────

describe("fingerprintPage: checkout health", () => {
  it("flags an explicit outage message", () => {
    const r = fingerprintPage(page(`<h1>Payments temporarily unavailable</h1>`));
    expect(r.checkout_impaired).toBe(true);
    expect(r.signals).toContain("checkout_down");
  });

  it("treats a 5xx storefront as checkout_down on its own", () => {
    const r = fingerprintPage(page("<h1>Service Unavailable</h1>", 503));
    expect(r.signals).toContain("checkout_down");
    expect(r.evidence.join(" ")).toContain("HTTP 503");
  });

  it("reads card-loss language as payment pain", () => {
    const r = fingerprintPage(page(`<p>We no longer accept credit cards — bank transfer only.</p>`));
    expect(r.signals).toContain("payment_pain_public");
  });

  it("infers processor_terminated from card-loss language with no processor present", () => {
    // The classic just-got-dropped profile: nothing integrated, and the page
    // says so out loud.
    const r = fingerprintPage(page(`<p>We no longer accept credit cards.</p>`));
    expect(r.processors).toEqual([]);
    expect(r.signals).toContain("processor_terminated");
  });

  it("does NOT infer termination when a processor is still integrated", () => {
    const r = fingerprintPage(
      page(`<script src="https://js.stripe.com/v3/"></script><p>cash or check only</p>`),
    );
    expect(r.signals).not.toContain("processor_terminated");
    expect(r.signals).toContain("payment_pain_public");
  });

  it("a healthy page yields no signals", () => {
    const r = fingerprintPage(page(`<script src="https://js.stripe.com/v3/"></script><h1>Shop</h1>`));
    expect(r.signals).toEqual([]);
    expect(r.checkout_impaired).toBe(false);
  });
});

// ─── Vertical: conservative on purpose ───────────────────────────────────

describe("fingerprintPage: vertical", () => {
  it("requires two distinct keywords before claiming a vertical", () => {
    // One stray mention (a blog post about CBD) must not classify the merchant.
    const one = fingerprintPage(page(`<p>Our blog discusses cbd regulation.</p>`));
    expect(one.vertical).toBeUndefined();

    const two = fingerprintPage(page(`<p>Premium cbd and hemp-derived products.</p>`));
    expect(two.vertical).toBe("cbd");
  });

  it("picks the vertical with the most evidence when several match", () => {
    const r = fingerprintPage(
      page(`<p>vape, e-liquid, vaporizer and nicotine pouches. Also one cbd mention.</p>`),
    );
    expect(r.vertical).toBe("vape");
  });

  it("detects an age gate independently of vertical keywords", () => {
    const p = page(`<div>Are you 21 or older?</div>`);
    expect(hasAgeGate(p)).toBe(true);
    expect(fingerprintPage(p).evidence.join(" ")).toContain("age_gate");
  });
});

// ─── Stack change ────────────────────────────────────────────────────────

describe("detectStackChange", () => {
  it("reports nothing on a first observation (no previous state)", () => {
    // Critical: a first scan must not look like a migration.
    expect(detectStackChange(undefined, ["stripe"]).changed).toBe(false);
    expect(detectStackChange([], ["stripe"]).changed).toBe(false);
  });

  it("detects a swap in both directions", () => {
    const r = detectStackChange(["stripe"], ["adyen"]);
    expect(r.changed).toBe(true);
    expect(r.added).toEqual(["adyen"]);
    expect(r.removed).toEqual(["stripe"]);
  });

  it("reports no change when the stack is identical", () => {
    expect(detectStackChange(["stripe", "klarna"], ["klarna", "stripe"]).changed).toBe(false);
  });
});

// ─── robots.txt: the part that must be right ─────────────────────────────

describe("robots.txt", () => {
  it("an absent robots.txt allows everything (the convention)", () => {
    expect(isAllowed(ROBOTS_ABSENT, "AxisRevOpsBot", "/anything").allowed).toBe(true);
  });

  it("honors a wildcard Disallow", () => {
    const rules = parseRobots(`User-agent: *\nDisallow: /private`);
    expect(isAllowed(rules, "AxisRevOpsBot", "/private/page").allowed).toBe(false);
    expect(isAllowed(rules, "AxisRevOpsBot", "/public").allowed).toBe(true);
  });

  it("an empty Disallow value means allow everything", () => {
    const rules = parseRobots(`User-agent: *\nDisallow:`);
    expect(isAllowed(rules, "AxisRevOpsBot", "/anything").allowed).toBe(true);
  });

  it("Allow beats Disallow at equal-or-longer match (RFC 9309)", () => {
    const rules = parseRobots(`User-agent: *\nDisallow: /shop\nAllow: /shop/public`);
    expect(isAllowed(rules, "AxisRevOpsBot", "/shop/private").allowed).toBe(false);
    expect(isAllowed(rules, "AxisRevOpsBot", "/shop/public/x").allowed).toBe(true);
  });

  it("an agent-specific group beats the wildcard group", () => {
    const rules = parseRobots(
      `User-agent: *\nDisallow:\n\nUser-agent: axisrevopsbot\nDisallow: /`,
    );
    // A site that named us specifically has asked us, specifically, to stay out.
    expect(isAllowed(rules, "AxisRevOpsBot", "/").allowed).toBe(false);
  });

  it("groups consecutive User-agent lines together", () => {
    const rules = parseRobots(`User-agent: badbot\nUser-agent: axisrevopsbot\nDisallow: /nope`);
    expect(isAllowed(rules, "AxisRevOpsBot", "/nope").allowed).toBe(false);
  });

  it("supports * and $ wildcards", () => {
    const star = parseRobots(`User-agent: *\nDisallow: /*.pdf$`);
    expect(isAllowed(star, "b", "/docs/a.pdf").allowed).toBe(false);
    expect(isAllowed(star, "b", "/docs/a.pdf.html").allowed).toBe(true);
  });

  it("ignores comments and blank lines", () => {
    const rules = parseRobots(`# comment\n\nUser-agent: *  # trailing\nDisallow: /x`);
    expect(isAllowed(rules, "b", "/x").allowed).toBe(false);
  });

  it("surfaces Crawl-delay so the fetcher can honor it", () => {
    const rules = parseRobots(`User-agent: *\nCrawl-delay: 10\nDisallow: /x`);
    expect(isAllowed(rules, "b", "/ok").crawlDelaySec).toBe(10);
  });

  it("REFUSES when robots.txt is present but unparseable (fail closed)", () => {
    // We must never resolve our own ambiguity in our own favour.
    const broken = { groups: [], parsed: false } as const;
    expect(isAllowed(broken, "b", "/").allowed).toBe(false);
  });
});
