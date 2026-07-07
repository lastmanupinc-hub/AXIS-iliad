import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonicalize } from "./canonical.js";

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(here, "__fixtures__", "golden");

// The actual committed golden mandates/messages (src/__fixtures__/golden/*.json)
// — each fixture's `.mandate` (AP2) or `.message` (TAP/UCP) is a real,
// nested-object/array wire shape, used for the key-shuffle byte-identity
// checks below.
const GOLDEN_SAMPLES: unknown[] = readdirSync(GOLDEN_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const fixture = JSON.parse(readFileSync(join(GOLDEN_DIR, f), "utf8")) as Record<string, unknown>;
    return fixture.mandate ?? fixture.message;
  });

/** Deterministic-ish shuffle: returns a NEW object with the same key/value
 *  pairs (recursively for nested plain objects) in a different iteration
 *  order. Arrays are left in place (order is semantically significant there;
 *  only OBJECT key order is insignificant in JSON). */
function shuffleKeys<T>(value: T, seed: number): T {
  if (Array.isArray(value)) {
    return value.map((v, i) => shuffleKeys(v, seed + i + 1)) as unknown as T;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    // Simple deterministic pseudo-shuffle keyed by `seed` so each of the 100
    // iterations produces a different (but reproducible) order.
    const shuffled = [...entries];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = (seed * (i + 7) + i * 31) % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of shuffled) out[k] = shuffleKeys(v, seed + 1);
    return out as T;
  }
  return value;
}

describe("canonicalize", () => {
  it("is insensitive to top-level key order", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it("is insensitive to nested key order", () => {
    const x = { outer: { b: 1, a: 2 }, z: [{ y: 1, x: 2 }] };
    const y = { z: [{ x: 2, y: 1 }], outer: { a: 2, b: 1 } };
    expect(canonicalize(x)).toBe(canonicalize(y));
  });

  it("produces byte-identical output across 100 randomly key-shuffled clones of each sample", () => {
    for (const sample of GOLDEN_SAMPLES) {
      const baseline = canonicalize(sample);
      for (let i = 0; i < 100; i++) {
        const clone = shuffleKeys(sample, i);
        expect(canonicalize(clone)).toBe(baseline);
      }
    }
  });

  it("throws on NaN", () => {
    expect(() => canonicalize({ a: NaN })).toThrow();
  });

  it("throws on Infinity", () => {
    expect(() => canonicalize({ a: Infinity })).toThrow();
  });

  it("throws on undefined at the root", () => {
    expect(() => canonicalize(undefined)).toThrow();
  });

  it("throws on undefined nested in an object", () => {
    expect(() => canonicalize({ a: undefined })).toThrow();
  });

  it("throws on a non-integer float (out of this canonicalizer's scope)", () => {
    expect(() => canonicalize({ a: 1.5 })).toThrow();
  });

  it("round-trips integers, strings, booleans, null, and arrays exactly", () => {
    const value = { n: 42, s: "hello \"quoted\"", b: true, nil: null, arr: [1, 2, 3] };
    const out = canonicalize(value);
    expect(JSON.parse(out)).toEqual(value);
  });

  it("sorts keys alphabetically by UTF-16 code unit", () => {
    expect(canonicalize({ z: 1, a: 2, m: 3 })).toBe('{"a":2,"m":3,"z":1}');
  });
});
