import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { IncomingMessage } from "node:http";

vi.mock("./mpp.js", () => ({
  getPricingTier: vi.fn((tool: string) => ({ tool, standard_cents: 50, lite_cents: 15, lite_description: "" })),
}));

import {
  anonProvisionEnabled,
  allowChallenge,
  resetChallengeWindows,
  buildProvisioningChallenge,
} from "./anon-frontdoor.js";

describe("anonProvisionEnabled", () => {
  afterEach(() => {
    delete process.env.AXIS_ANON_PROVISION_FRONTDOOR;
  });

  it("defaults OFF when the env var is unset", () => {
    expect(anonProvisionEnabled()).toBe(false);
  });
  it("enables on 'true' or '1', stays off otherwise", () => {
    process.env.AXIS_ANON_PROVISION_FRONTDOOR = "true";
    expect(anonProvisionEnabled()).toBe(true);
    process.env.AXIS_ANON_PROVISION_FRONTDOOR = "1";
    expect(anonProvisionEnabled()).toBe(true);
    process.env.AXIS_ANON_PROVISION_FRONTDOOR = "false";
    expect(anonProvisionEnabled()).toBe(false);
  });
});

describe("allowChallenge — IP-prefix-aggregated, namespaced rate limit", () => {
  beforeEach(() => {
    resetChallengeWindows();
  });

  it("allows up to the per-window cap, then blocks", () => {
    for (let i = 0; i < 10; i++) {
      expect(allowChallenge("203.0.113.5")).toBe(true);
    }
    expect(allowChallenge("203.0.113.5")).toBe(false);
  });

  it("aggregates distinct IPv4 addresses in the same /24 into ONE bucket", () => {
    // 10 distinct addresses within 203.0.113.0/24 share the cap, not each get
    // their own 10 — proves a single cloud allocation can't farm fresh
    // buckets by rotating the last octet.
    for (let i = 0; i < 10; i++) {
      expect(allowChallenge(`203.0.113.${i}`)).toBe(true);
    }
    expect(allowChallenge("203.0.113.250")).toBe(false);
  });

  it("a different /24 gets its own independent bucket", () => {
    for (let i = 0; i < 10; i++) allowChallenge("203.0.113.5");
    expect(allowChallenge("203.0.113.5")).toBe(false);
    expect(allowChallenge("198.51.100.1")).toBe(true);
  });

  it("aggregates distinct IPv6 addresses in the same /64 into ONE bucket", () => {
    // 10 distinct trailing suffixes within one /64 collapse to a single
    // bucket — the exact IPv6-rotation-defeats-per-IP-throttle attack the
    // identity hardening calls out.
    for (let i = 0; i < 10; i++) {
      expect(allowChallenge(`2001:db8:1234:5678:${i}::1`)).toBe(true);
    }
    expect(allowChallenge("2001:db8:1234:5678:9999::9999")).toBe(false);
  });

  it("aggregates IPv6 addresses whose NETWORK prefix itself is zero-compressed (H-cycle-25 fix)", () => {
    // Distinct from the test above: there the "::" falls in the HOST portion
    // (after the real /64 hextets), which the naive split-and-filter-empty
    // implementation happened to handle correctly by accident. Here the "::"
    // falls INSIDE the network portion itself (2001:db8::/64, with the zero
    // hextets it stands for landing in positions 3-4) — the exact shape that
    // let host-bit hextets shift into the "first 4 hextets" slot and mint a
    // fresh bucket per address sharing one real /64.
    for (let i = 0; i < 10; i++) {
      expect(allowChallenge(`2001:db8::a1b2:c3d4:e5f6:${i}`)).toBe(true);
    }
    expect(allowChallenge("2001:db8::9999:8888:7777:6666")).toBe(false);
    // A genuinely different /64 must still get its own, fresh bucket.
    expect(allowChallenge("2001:db8:1::a1b2:c3d4:e5f6:1")).toBe(true);
  });

  it("treats 'unknown' as its own bucket, not aggregated with real IPs", () => {
    for (let i = 0; i < 10; i++) allowChallenge("unknown");
    expect(allowChallenge("unknown")).toBe(false);
    expect(allowChallenge("203.0.113.5")).toBe(true);
  });
});

describe("buildProvisioningChallenge", () => {
  const req = { headers: {} } as unknown as IncomingMessage;

  it("carries scalar pricing derived from getPricingTier, never an x402 rail", () => {
    const text = buildProvisioningChallenge("analyze_repo", req);
    const parsed = JSON.parse(text);
    expect(parsed._provision_required).toBe(true);
    expect(parsed.tool).toBe("analyze_repo");
    expect(parsed.pricing).toEqual({ standard_cents: 50, lite_cents: 15 });
    // The whole point: this is a routing pointer, not a payable x402 challenge.
    // None of these fields — which a REAL 402 negotiation body always carries
    // (see build402NegotiationBody) — may ever appear here, since an anonymous
    // caller cannot fulfil them.
    expect(parsed.x402).toBeUndefined();
    expect(parsed.payTo).toBeUndefined();
    expect(parsed.accepted_payment_schemes).toBeUndefined();
    expect(parsed.preferred_payment_scheme).toBeUndefined();
    expect(parsed.payment_rails).toBeUndefined();
    expect(parsed.payment_url).toBeUndefined();
  });

  it("points the retry credential at a real, working Iliad endpoint (not an unconfigured PAI'D promise)", () => {
    const parsed = JSON.parse(buildProvisioningChallenge("analyze_repo", req));
    expect(parsed.provision.onboarding_url).toBe("https://axis-api-6c7z.onrender.com/v1/accounts");
    expect(parsed.provision.credential_source).toContain("/v1/accounts");
    expect(parsed.retry).toEqual({
      method: "tools/call",
      name: "analyze_repo",
      headers_hint: ["Authorization: Bearer <api_key>"],
    });
  });
});
