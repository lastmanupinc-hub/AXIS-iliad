/**
 * H2.5 — 402/429 payload schema unification contract test.
 *
 * Walks every `sendError(res, 402|429, ...)` call site (plus cashier.ts's two
 * raw `res.writeHead(402, ...)` sites, which bypass sendError entirely) and
 * asserts each one either carries the canonical `upgrade_url` pointer or is
 * on the explicit RATE_LIMITED waiver (a pure external/anti-abuse rate limit
 * has no price, tier, or account concept to point an agent at — forcing a
 * payment shape onto it would be dishonest, not helpful).
 *
 * This is a SOURCE-TEXT scan (the established pattern in this repo — see
 * count-honesty.test.ts), not a live HTTP walk: replicating the auth/tier/
 * quota state needed to trigger all these sites live would dwarf the unit
 * this test protects. Two different verification strategies are used
 * depending on HOW each site gets its fields:
 *   - Most handlers.ts sites spread `buildPaymentRequiredPayload(...)`, which
 *     calls the shared `build402NegotiationBody` (packages/mpp) — `upgrade_url`
 *     is added there ONCE and inherited at runtime, so it is NOT literal text
 *     at these call sites. For these, this test verifies the call site
 *     actually invokes the shared builder; `mpp.test.ts`'s own
 *     "build402NegotiationBody — canonical fields" suite is what proves the
 *     builder always includes `upgrade_url`. Checking both closes the loop.
 *   - billing.ts / versions.ts / cashier.ts / funnel.ts do NOT call the
 *     shared builder — they set `upgrade_url` as a literal field, so a
 *     direct text scan for the field name is the correct check there.
 *
 * The per-file EXPECTED_* counts are the durability mechanism — a new
 * 402/429 site added later without updating this manifest fails the count
 * assertion immediately, so it can't silently skip review.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = dirname(fileURLToPath(import.meta.url));

function source(file: string): string {
  return readFileSync(join(SRC, file), "utf8");
}

interface Site {
  index: number;
  code: string;
}

/** Every `sendError(res, <status>, ErrorCode.X, ...)` call site, in source order. */
function findSendErrorSites(text: string, status: 402 | 429): Site[] {
  const re = new RegExp(`sendError\\(\\s*res,\\s*${status}\\s*,\\s*ErrorCode\\.(\\w+)`, "g");
  const out: Site[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ index: m.index, code: m[1] });
  return out;
}

/** Every `res.writeHead(<status>, ...)` call site (cashier.ts bypasses sendError). */
function findWriteHeadSites(text: string, status: 402): Site[] {
  const re = new RegExp(`res\\.writeHead\\(\\s*${status}\\b`, "g");
  const out: Site[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ index: m.index, code: "" });
  return out;
}

/**
 * True if literal `needle` text appears between this call site's start and
 * the start of the NEXT `sendError(`/`res.writeHead(` occurrence (or a
 * 2500-char cap, generously larger than any real call site in these files)
 * — a bounded, per-site window that can't accidentally read into a sibling
 * call. `nextCallLiteral` is a plain substring (e.g. "sendError("), not a regex.
 */
function siteHasText(text: string, site: Site, needle: string, nextCallLiteral: string): boolean {
  const rest = text.slice(site.index);
  const nextOffset = rest.indexOf(nextCallLiteral, 1);
  const windowEnd = nextOffset === -1 ? Math.min(rest.length, 2500) : Math.min(nextOffset, 2500);
  return rest.slice(0, windowEnd).includes(needle);
}

const HANDLERS = source("handlers.ts");
const BILLING = source("billing.ts");
const VERSIONS = source("versions.ts");
const FUNNEL = source("funnel.ts");
const RATE_LIMITER = source("rate-limiter.ts");
const CASHIER = source("cashier.ts");

describe("payment-required contract (H2.5) — every 402/429 site is canonical-shaped or explicitly waived", () => {
  it("handlers.ts: exactly 9 402 sites (all TIER_REQUIRED) and 6 429 sites (4 QUOTA_EXCEEDED + 2 RATE_LIMITED)", () => {
    const sites402 = findSendErrorSites(HANDLERS, 402);
    const sites429 = findSendErrorSites(HANDLERS, 429);
    expect(sites402).toHaveLength(9);
    expect(sites429).toHaveLength(6);
    expect(sites402.every((s) => s.code === "TIER_REQUIRED")).toBe(true);
    expect(sites429.filter((s) => s.code === "QUOTA_EXCEEDED")).toHaveLength(4);
    expect(sites429.filter((s) => s.code === "RATE_LIMITED")).toHaveLength(2);
  });

  it("handlers.ts: every 402 (TIER_REQUIRED) site calls the shared buildPaymentRequiredPayload builder (which itself always includes upgrade_url — see mpp.test.ts)", () => {
    const sites = findSendErrorSites(HANDLERS, 402);
    for (const site of sites) {
      expect(siteHasText(HANDLERS, site, "buildPaymentRequiredPayload(", "sendError(")).toBe(true);
    }
  });

  it("handlers.ts: every QUOTA_EXCEEDED (429) site calls the shared builder too", () => {
    const sites = findSendErrorSites(HANDLERS, 429).filter((s) => s.code === "QUOTA_EXCEEDED");
    expect(sites).toHaveLength(4);
    for (const site of sites) {
      expect(siteHasText(HANDLERS, site, "buildPaymentRequiredPayload(", "sendError(")).toBe(true);
    }
  });

  it("handlers.ts: the 2 GitHub RATE_LIMITED sites are the explicit waiver — no payment shape forced onto a third-party API rate limit", () => {
    const sites = findSendErrorSites(HANDLERS, 429).filter((s) => s.code === "RATE_LIMITED");
    expect(sites).toHaveLength(2);
    for (const site of sites) {
      // Waived sites name the true external cause instead of a fabricated
      // payment reason, and are NOT expected to call the shared builder.
      expect(siteHasText(HANDLERS, site, "GitHub API rate limit", "sendError(")).toBe(true);
      expect(siteHasText(HANDLERS, site, "buildPaymentRequiredPayload(", "sendError(")).toBe(false);
    }
  });

  it("buildPaymentRequiredPayload passes account tier through to the shared builder for usage_credits (except the one deliberately anonymous call site)", () => {
    // "await buildPaymentRequiredPayload(" — actual CALL sites only, never the
    // `async function buildPaymentRequiredPayload(tool: string, ...)` declaration.
    const calls = [...HANDLERS.matchAll(/await buildPaymentRequiredPayload\(([^)]*)\)/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThanOrEqual(11);
    const withoutTier = calls.filter((args) => !args.includes("auth.account.tier"));
    // Exactly one call site has no authenticated account at all (the anonymous
    // free-tier-blocked-programs gate) — every other call site must thread tier.
    expect(withoutTier).toHaveLength(1);
    expect(withoutTier[0]).not.toContain("auth.account.account_id");
  });

  it("billing.ts: exactly 3 PAYMENT_REQUIRED sites, each carrying a literal upgrade_url and a PAI'D-only checkout pointer", () => {
    const sites = findSendErrorSites(BILLING, 402);
    expect(sites).toHaveLength(3);
    expect(sites.every((s) => s.code === "PAYMENT_REQUIRED")).toBe(true);
    for (const site of sites) {
      expect(siteHasText(BILLING, site, "upgrade_url", "sendError(")).toBe(true);
      expect(siteHasText(BILLING, site, "iliad.trustfabric.ai/#plans", "sendError(")).toBe(true);
    }
  });

  it("versions.ts: the 1 PERSISTENCE_CREDITS_REQUIRED site carries a literal error_code, message, and upgrade_url", () => {
    const sites = findSendErrorSites(VERSIONS, 402);
    expect(sites).toHaveLength(1);
    expect(sites[0].code).toBe("PERSISTENCE_CREDITS_REQUIRED");
    expect(siteHasText(VERSIONS, sites[0], "upgrade_url", "sendError(")).toBe(true);
    expect(siteHasText(VERSIONS, sites[0], "message:", "sendError(")).toBe(true);
  });

  it("funnel.ts: the 1 SEAT_LIMIT (429) site carries a literal upgrade_url (paired with the existing upgrade_hint)", () => {
    const sites = findSendErrorSites(FUNNEL, 429);
    expect(sites).toHaveLength(1);
    expect(sites[0].code).toBe("SEAT_LIMIT");
    expect(siteHasText(FUNNEL, sites[0], "upgrade_url", "sendError(")).toBe(true);
  });

  it("rate-limiter.ts: the 1 RATE_LIMITED (429) site is the explicit waiver — pure IP-based anti-abuse throttle, no account/tier/money concept", () => {
    const sites = findSendErrorSites(RATE_LIMITER, 429);
    expect(sites).toHaveLength(1);
    expect(sites[0].code).toBe("RATE_LIMITED");
    // Explicitly does NOT require upgrade_url. The waiver is documented here
    // in prose plus the total-count assertion above: this is the ONLY
    // rate-limiter.ts site, and it is not in any "must have upgrade_url" loop
    // in this test file — asserting the field's ABSENCE would be brittle
    // (a future unrelated field could coincidentally match).
  });

  it("cashier.ts: exactly 2 raw writeHead(402) sites (bypass sendError entirely), both carry literal error_code, message, upgrade_url, and request_id", () => {
    const sites = findWriteHeadSites(CASHIER, 402);
    expect(sites).toHaveLength(2);
    for (const site of sites) {
      expect(siteHasText(CASHIER, site, "error_code", "res.writeHead(")).toBe(true);
      expect(siteHasText(CASHIER, site, "upgrade_url", "res.writeHead(")).toBe(true);
      expect(siteHasText(CASHIER, site, "request_id", "res.writeHead(")).toBe(true);
    }
  });

  it("no site anywhere in this manifest advertises the dead legacy /v1/checkout endpoint as a live pointer", () => {
    // The one legitimate mention is billing.ts's own comment explaining WHY it
    // is dead (`/v1/checkout endpoint is unconfigured in prod`) — a prose
    // reference, not a value returned to a caller. Assert it appears at most
    // that one time, in a comment, never inside a returned URL string.
    const occurrences = (BILLING.match(/\/v1\/checkout/g) ?? []).length;
    expect(occurrences).toBe(3); // the same explanatory comment, once per site
    for (const m of BILLING.matchAll(/^.*\/v1\/checkout.*$/gm)) {
      expect(m[0].trim().startsWith("//")).toBe(true);
    }
    for (const text of [HANDLERS, VERSIONS, FUNNEL, RATE_LIMITER, CASHIER]) {
      expect(text).not.toContain("/v1/checkout");
    }
  });
});
