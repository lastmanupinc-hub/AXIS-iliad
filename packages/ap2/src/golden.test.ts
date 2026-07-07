import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonicalize } from "./canonical.js";
import { verifyMandate } from "./ap2.js";
import { verifyTapMessage } from "./tap.js";
import { verifyUcpMessage } from "./ucp.js";

// Committed, FROZEN golden vectors — regression guard. If a future change to
// the wire format (field rename, canonicalization tweak, validation rule)
// alters what these fixtures encode to, this test fails: the fixtures are
// signed with a deterministic demo keypair and their `canonical` field is the
// exact byte string canonicalize() produced when they were generated.

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(here, "__fixtures__", "golden");

interface MandateFixture {
  mandate: unknown;
  jws: { protected: string; signature: string };
  public_key: string;
  canonical: string;
}

interface MessageFixture {
  message: unknown;
  jws: { protected: string; signature: string };
  public_key: string;
  canonical: string;
}

function loadFixture<T>(filename: string): T {
  return JSON.parse(readFileSync(join(GOLDEN_DIR, filename), "utf8")) as T;
}

describe("golden vectors — every committed fixture file is accounted for", () => {
  it("lists exactly the 5 expected golden fixtures (regression guard on the fixture set itself)", () => {
    const files = readdirSync(GOLDEN_DIR).sort();
    expect(files).toEqual(["ap2-cart.json", "ap2-intent.json", "ap2-payment.json", "tap-token.json", "ucp-settlement.json"]);
  });
});

describe("golden vectors — AP2 mandates", () => {
  it.each(["ap2-intent.json", "ap2-cart.json", "ap2-payment.json"])("%s verifies and matches its frozen canonical bytes", (filename) => {
    const fixture = loadFixture<MandateFixture>(filename);
    const result = verifyMandate({ mandate: fixture.mandate as never, jws: fixture.jws, public_key: fixture.public_key });
    expect(result.issues, JSON.stringify(result.issues)).toEqual([]);
    expect(result.valid).toBe(true);
    expect(canonicalize(fixture.mandate)).toBe(fixture.canonical);
  });
});

describe("golden vectors — TAP token message", () => {
  it("tap-token.json verifies and matches its frozen canonical bytes", () => {
    const fixture = loadFixture<MessageFixture>("tap-token.json");
    const result = verifyTapMessage({ message: fixture.message as never, jws: fixture.jws, public_key: fixture.public_key });
    expect(result.issues, JSON.stringify(result.issues)).toEqual([]);
    expect(result.valid).toBe(true);
    expect(canonicalize(fixture.message)).toBe(fixture.canonical);
  });
});

describe("golden vectors — UCP settlement message", () => {
  it("ucp-settlement.json verifies and matches its frozen canonical bytes", () => {
    const fixture = loadFixture<MessageFixture>("ucp-settlement.json");
    const result = verifyUcpMessage({ message: fixture.message as never, jws: fixture.jws, public_key: fixture.public_key });
    expect(result.issues, JSON.stringify(result.issues)).toEqual([]);
    expect(result.valid).toBe(true);
    expect(canonicalize(fixture.message)).toBe(fixture.canonical);
  });
});

describe("golden vectors — regression guard on tamper", () => {
  it("a mutated fixture mandate no longer verifies (proves the test actually exercises the signature)", () => {
    const fixture = loadFixture<MandateFixture>("ap2-cart.json");
    const mutated = { ...(fixture.mandate as Record<string, unknown>), merchant_id: "someone-else" };
    const result = verifyMandate({ mandate: mutated as never, jws: fixture.jws, public_key: fixture.public_key });
    expect(result.valid).toBe(false);
  });
});
