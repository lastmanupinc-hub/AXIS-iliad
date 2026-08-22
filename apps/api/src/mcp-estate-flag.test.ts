/**
 * est_02 (2026-08-22, docs/ESTATE_FEDERATION_STRATEGY.md §4): the estate flag
 * on McpToolCatalogEntry — the mechanism, not any live tool. Zero real
 * MCP_TOOLS entries carry `_meta.estate` yet (est_03/04's job); these tests
 * prove deriveMcpToolCatalog() derives the flag correctly using a synthetic
 * tools array, and that the REAL catalog is estate:false across the board
 * today — including discover_estate_tools itself, which is Iliad's OWN
 * discovery capability about the estate, not a relay INTO one, and must stay
 * visible on the human webapp (it already does — see well-known-handlers.test.ts
 * and ForAgentsPage.tsx's own tool list from est_01).
 */
import { describe, it, expect } from "vitest";
import { deriveMcpToolCatalog } from "./mcp-tool-impls.js";

describe("deriveMcpToolCatalog — estate flag derivation", () => {
  it("marks a tool with _meta.estate:true as estate:true", () => {
    const catalog = deriveMcpToolCatalog([
      { name: "estate_foundry_generate", description: "Relays to a sibling.", _meta: { estate: true } },
    ]);
    expect(catalog[0].estate).toBe(true);
  });

  it("marks a tool with no _meta at all as estate:false — the real MCP_TOOLS shape today", () => {
    const catalog = deriveMcpToolCatalog([{ name: "list_programs", description: "Iliad-owned." }]);
    expect(catalog[0].estate).toBe(false);
  });

  it("marks a tool with _meta present but estate unset/false as estate:false", () => {
    const catalog = deriveMcpToolCatalog([
      { name: "a", description: "d", _meta: {} },
      { name: "b", description: "d", _meta: { estate: false } },
    ]);
    expect(catalog.map((t) => t.estate)).toEqual([false, false]);
  });

  it("derives a mixed catalog correctly, entry by entry", () => {
    const catalog = deriveMcpToolCatalog([
      { name: "iliad_owned_one", description: "d" },
      { name: "estate_one", description: "d", _meta: { estate: true } },
      { name: "iliad_owned_two", description: "d" },
      { name: "estate_two", description: "d", _meta: { estate: true } },
    ]);
    expect(catalog.map((t) => ({ name: t.name, estate: t.estate }))).toEqual([
      { name: "iliad_owned_one", estate: false },
      { name: "estate_one", estate: true },
      { name: "iliad_owned_two", estate: false },
      { name: "estate_two", estate: true },
    ]);
  });

  it("the REAL catalog (zero-arg call) is estate:false for every tool today", () => {
    // Zero live estate tools exist yet — this fails loud the moment est_03/04
    // ships the first one without updating this test's own expectation, which
    // is the point: a change here should be a deliberate, reviewed moment,
    // not a silent side effect.
    const catalog = deriveMcpToolCatalog();
    const estateTools = catalog.filter((t) => t.estate).map((t) => t.name);
    expect(estateTools).toEqual([]);
  });

  it("discover_estate_tools itself is estate:false — it's Iliad's own discovery capability, not a relay", () => {
    const catalog = deriveMcpToolCatalog();
    const entry = catalog.find((t) => t.name === "discover_estate_tools");
    expect(entry).toBeDefined();
    expect(entry?.estate).toBe(false);
  });

  it("every real catalog entry has a defined boolean estate field, never undefined", () => {
    for (const t of deriveMcpToolCatalog()) {
      expect(typeof t.estate, t.name).toBe("boolean");
    }
  });
});
