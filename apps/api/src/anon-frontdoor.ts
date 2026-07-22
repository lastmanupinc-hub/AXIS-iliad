// ─── Anonymous provisioning front door (flag-gated, default OFF) ──────────
//
// The problem this closes: an anonymous MCP caller hitting a metered tool gets
// a dead-end "Authentication required" error today — no path forward, no
// x402-style handshake, just a wall. Real x402-speaking agents bounce off that
// wall permanently (see docs/x402/STRATEGY.md).
//
// The fix is NOT a new anonymous settlement path — Iliad already settles money
// through authenticated accounts (mppx / PAI'D), and adding a SECOND,
// anonymous-keyed settlement path would be the exact custody/MTL risk this
// design is built to avoid (see [[paid-mtl-risk-finding]] memory / the
// STRATEGY.md PAI'D-routing design). Instead: turn the dead-end into a
// PROVISIONING challenge — a routing pointer at how to get a real, reachable
// API key — so the anonymous caller has somewhere to go. No payment fields,
// no rail, nothing this response can misrepresent. Settlement, once the
// caller has a key, runs entirely over the EXISTING authenticated rails,
// completely unchanged.
//
// Honesty note: this does NOT yet name PAI'D as the credential issuer. PAI'D
// has no machine-identity provisioning endpoint today (verified: @axis/paid-client
// exposes only checkout/wallet-read/wallet-debit) — advertising a capability
// that doesn't exist yet is exactly the class of defect cycle 24 just spent a
// unit removing. The challenge points at Iliad's own real, working signup
// endpoint. PAI'D-branded provisioning is a documented future upgrade (see
// docs/x402/STRATEGY.md), not something this file claims today.

import type { IncomingMessage } from "node:http";
import { getPricingTier } from "./mpp.js";

/** Feature flag: turn the anonymous auth-error into a provisioning challenge. Default OFF. */
export function anonProvisionEnabled(): boolean {
  const v = process.env.AXIS_ANON_PROVISION_FRONTDOOR;
  return v === "true" || v === "1";
}

// IP-prefix-aggregated rate limiter for challenge emission, deliberately
// SEPARATE from rate-limiter.ts's general per-IP window (namespaced so this
// door never consumes that budget) and aggregated to a /64 (IPv6) or /24
// (IPv4) prefix so a single cloud allocation or IPv6 address rotation can't
// mint a fresh bucket per request.
interface ChallengeWindow {
  count: number;
  resetAt: number;
}
const CHALLENGE_WINDOW_MS = 60_000;
const CHALLENGE_MAX_PER_WINDOW = 10;
const challengeWindows = new Map<string, ChallengeWindow>();

/**
 * Expand IPv6 "::" zero-compression into the full 8 hextets. A naive
 * `split(":").filter(Boolean)` (the original implementation here) drops the
 * empty string "::" produces WITHOUT restoring the zero hextets it stands
 * for — so for an address whose *network* portion itself contains the
 * compression (e.g. "2001:db8::a1b2:c3d4:e5f6:1234", true prefix
 * "2001:db8::/64"), host-bit hextets silently shift into the "first 4"
 * slot, producing a DIFFERENT aggregated prefix per address even though
 * they share the same real /64 — defeating the abuse-throttling this
 * function exists for (any attacker whose own /64 happens to contain a
 * zero hextet, or who rotates IPv6 privacy addresses, mints a fresh
 * rate-limit bucket per request). Full expansion first, then slicing the
 * first 4 of the real 8 hextets, is required to aggregate correctly.
 */
function expandIpv6Hextets(ip: string): string[] {
  const compressedAt = ip.indexOf("::");
  if (compressedAt === -1) {
    return ip.split(":");
  }
  const left = ip.slice(0, compressedAt).split(":").filter((h) => h.length > 0);
  const right = ip.slice(compressedAt + 2).split(":").filter((h) => h.length > 0);
  const zerosNeeded = Math.max(0, 8 - left.length - right.length);
  const zeros: string[] = new Array<string>(zerosNeeded).fill("0");
  return [...left, ...zeros, ...right];
}

function aggregateIpPrefix(ip: string): string {
  if (ip.includes(":")) {
    // IPv4-mapped IPv6 ("::ffff:a.b.c.d" — common for req.socket.remoteAddress
    // on a dual-stack listener) is really an IPv4 client; aggregate as IPv4.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return aggregateIpPrefix(mapped[1]);
    // IPv6 — expand "::" first, then keep the first 4 of the real 8 hextets (a /64).
    return expandIpv6Hextets(ip).slice(0, 4).join(":") + "::/64";
  }
  const octets = ip.split(".");
  if (octets.length === 4) return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  // "unknown" or malformed — not a real IP to aggregate; bucket it on its own.
  return ip;
}

/** True if this (prefix-aggregated) IP may receive another challenge this window. */
export function allowChallenge(ip: string): boolean {
  const key = `challenge:${aggregateIpPrefix(ip)}`;
  const now = Date.now();
  let entry = challengeWindows.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + CHALLENGE_WINDOW_MS };
    challengeWindows.set(key, entry);
  }
  entry.count++;
  return entry.count <= CHALLENGE_MAX_PER_WINDOW;
}

/** Test-only: clear challenge rate-limit state between test cases. */
export function resetChallengeWindows(): void {
  challengeWindows.clear();
}

const ACCOUNT_SIGNUP_URL = "https://axis-api-6c7z.onrender.com/v1/accounts";

/**
 * The anonymous front door's challenge. Deliberately NOT an x402 negotiation
 * body — never spreads build402NegotiationBody, carries no x402/payTo/
 * accepted_payment_schemes/payment_rails fields. This is a routing pointer,
 * not a payable challenge: the caller cannot pay anonymously, so nothing here
 * may claim otherwise. Pricing is scalar-only (getPricingTier), so the
 * response can never misrepresent a rail this caller can't use yet.
 */
export function buildProvisioningChallenge(tool: string, _req: IncomingMessage): string {
  const tier = getPricingTier(tool);
  return JSON.stringify(
    {
      error: "Provisioning Required",
      _provision_required: true,
      tool,
      message: `${tool} is a metered tool and requires an API key. No human signup form, no session — get a machine-usable key and retry the same call.`,
      pricing: { standard_cents: tier.standard_cents, lite_cents: tier.lite_cents },
      provision: {
        onboarding_url: ACCOUNT_SIGNUP_URL,
        credential_source: `POST ${ACCOUNT_SIGNUP_URL} with {email, name, tier: "free"} -> raw_key`,
      },
      retry: {
        method: "tools/call",
        name: tool,
        headers_hint: ["Authorization: Bearer <api_key>"],
      },
    },
    null,
    2,
  );
}
