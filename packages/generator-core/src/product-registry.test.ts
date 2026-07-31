import { describe, it, expect } from "vitest";
import { ALL_PROGRAMS } from "@axis/snapshots";
import { PRODUCT_REGISTRY, PRODUCT_IDS, PARKED_PROGRAMS, productIdForProgram, getProduct } from "./product-registry.js";

// The hub-and-spoke consolidation (docs/saas-strategy/CONSOLIDATION.md): 20
// generator programs sold as 9 standalone applications. This registry is the
// single source every consumer (billing, landing pages, entitlement checks)
// must read — these tests pin the coverage invariant, not the copy, so
// pricing/subdomains can change without a test failing for the wrong reason.

describe("PRODUCT_REGISTRY — coverage", () => {
  it("has exactly the 9 products from CONSOLIDATION.md", () => {
    expect(PRODUCT_IDS.sort()).toEqual(
      ["atlas", "checkout", "crate", "embed", "onboard", "palette", "reach", "runway", "socket"].sort(),
    );
  });

  it("covers every program exactly once — sold by one product, or explicitly parked, never both, never neither", () => {
    const sold = new Set<string>();
    for (const p of Object.values(PRODUCT_REGISTRY)) {
      for (const program of p.programs) {
        expect(sold.has(program), `"${program}" is sold by more than one product`).toBe(false);
        sold.add(program);
      }
    }
    const parked = new Set<string>(PARKED_PROGRAMS);
    const overlap = [...sold].filter((p) => parked.has(p));
    expect(overlap, `programs both sold and parked: ${overlap.join(", ")}`).toEqual([]);

    const uncovered = (ALL_PROGRAMS as readonly string[]).filter((p) => !sold.has(p) && !parked.has(p));
    expect(uncovered, `programs neither sold nor parked: ${uncovered.join(", ")}`).toEqual([]);

    const unknown = [...sold, ...parked].filter((p) => !(ALL_PROGRAMS as readonly string[]).includes(p));
    expect(unknown, `references a program ALL_PROGRAMS doesn't recognize: ${unknown.join(", ")}`).toEqual([]);
  });

  it("resolves the merged programs to their absorbing product, per CONSOLIDATION.md", () => {
    expect(productIdForProgram("frontend")).toBe("embed"); // Grain merge
    expect(productIdForProgram("seo")).toBe("embed");
    expect(productIdForProgram("brand")).toBe("reach"); // Voice + Funnel
    expect(productIdForProgram("canvas")).toBe("atlas"); // Poster merge
    expect(productIdForProgram("notebook")).toBe("onboard"); // Marginalia merge
    expect(productIdForProgram("debug")).toBe("onboard"); // Postmortem merge
  });

  it("returns undefined for a parked program — it has no product to resolve to", () => {
    for (const program of PARKED_PROGRAMS) {
      expect(productIdForProgram(program), `${program} unexpectedly resolved to a product`).toBeUndefined();
    }
  });

  it("prices Atlas free and every other product as a positive number", () => {
    expect(getProduct("atlas")?.price_usd).toBe("free");
    expect(getProduct("atlas")?.billing).toBe("free");
    for (const [id, p] of Object.entries(PRODUCT_REGISTRY)) {
      if (id === "atlas") continue;
      expect(typeof p.price_usd, `${id}.price_usd should be numeric`).toBe("number");
      expect(p.price_usd as number, `${id}.price_usd should be positive`).toBeGreaterThan(0);
    }
  });

  it("every subdomain is unique and ends in .trustfabric.ai", () => {
    const subdomains = Object.values(PRODUCT_REGISTRY).map((p) => p.subdomain);
    expect(new Set(subdomains).size).toBe(subdomains.length);
    for (const s of subdomains) expect(s.endsWith(".trustfabric.ai")).toBe(true);
  });
});
