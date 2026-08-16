import { describe, it, expect } from "vitest";
import { ALL_PROGRAMS } from "@axis/snapshots";
import { PRODUCT_REGISTRY, PRODUCT_IDS, productIdForProgram, getProduct } from "./product-registry.js";

// Hub-and-spoke, reworked 2026-07-31 per owner directive: no mergers. Every
// one of the 20 generator programs is its own standalone product — see
// docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md, which supersedes
// CONSOLIDATION.md's 9-product bundle map. This registry is the single
// source every consumer (billing, landing pages, entitlement checks) must
// read — these tests pin the coverage invariant (one product per program,
// every program covered), not the copy, so pricing/subdomains can change
// without a test failing for the wrong reason.

const FREE_PRODUCTS = ["search", "obsidian"];

describe("PRODUCT_REGISTRY — coverage", () => {
  it("has exactly 21 products — one per generator program, no mergers", () => {
    expect(PRODUCT_IDS.length).toBe(21);
    expect(PRODUCT_IDS.sort()).toEqual([...(ALL_PROGRAMS as readonly string[])].sort());
  });

  it("every product sells exactly the one program matching its id — no absorbing, no bundling", () => {
    for (const [id, p] of Object.entries(PRODUCT_REGISTRY)) {
      expect(p.programs, `${id} must sell exactly [${id}]`).toEqual([id]);
    }
  });

  it("covers every program in ALL_PROGRAMS exactly once — nothing sold twice, nothing left out", () => {
    const sold = new Set<string>();
    for (const p of Object.values(PRODUCT_REGISTRY)) {
      for (const program of p.programs) {
        expect(sold.has(program), `"${program}" is sold by more than one product`).toBe(false);
        sold.add(program);
      }
    }
    const uncovered = (ALL_PROGRAMS as readonly string[]).filter((p) => !sold.has(p));
    expect(uncovered, `programs with no product: ${uncovered.join(", ")}`).toEqual([]);

    const unknown = [...sold].filter((p) => !(ALL_PROGRAMS as readonly string[]).includes(p));
    expect(unknown, `references a program ALL_PROGRAMS doesn't recognize: ${unknown.join(", ")}`).toEqual([]);
  });

  it("resolves every program directly to its own product id — no merger indirection", () => {
    for (const program of ALL_PROGRAMS as readonly string[]) {
      expect(productIdForProgram(program)).toBe(program);
    }
  });

  it("prices search and obsidian free (their own merits, not a merger artifact) and every other product as a positive number", () => {
    for (const id of FREE_PRODUCTS) {
      expect(getProduct(id)?.price_usd, `${id} should be free`).toBe("free");
      expect(getProduct(id)?.billing, `${id} should be billing:free`).toBe("free");
    }
    for (const [id, p] of Object.entries(PRODUCT_REGISTRY)) {
      if (FREE_PRODUCTS.includes(id)) continue;
      expect(typeof p.price_usd, `${id}.price_usd should be numeric`).toBe("number");
      expect(p.price_usd as number, `${id}.price_usd should be positive`).toBeGreaterThan(0);
    }
  });

  // agentic-purchasing is the one deliberate exception: "commerce.trustfabric.ai"
  // reads as a real product URL where "agentic-purchasing.trustfabric.ai" would
  // not. Every other product's subdomain matches its id exactly.
  const SUBDOMAIN_EXCEPTIONS: Record<string, string> = { "agentic-purchasing": "commerce" };

  it("every subdomain is unique, ends in .trustfabric.ai, and matches its product id (or a named exception)", () => {
    const subdomains = Object.values(PRODUCT_REGISTRY).map((p) => p.subdomain);
    expect(new Set(subdomains).size).toBe(subdomains.length);
    for (const [id, p] of Object.entries(PRODUCT_REGISTRY)) {
      const expectedPrefix = SUBDOMAIN_EXCEPTIONS[id] ?? id;
      expect(p.subdomain).toBe(`${expectedPrefix}.trustfabric.ai`);
    }
  });

  it("remotion carries a gate_note (owner-purchase license blocker) — the only product that does", () => {
    for (const [id, p] of Object.entries(PRODUCT_REGISTRY)) {
      if (id === "remotion") {
        expect(p.gate_note, "remotion must document its license blocker").toBeTruthy();
      } else {
        expect(p.gate_note, `${id} should have no gate_note`).toBeUndefined();
      }
    }
  });
});
