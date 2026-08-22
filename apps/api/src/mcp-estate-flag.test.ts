/**
 * est_02 (2026-08-22, docs/ESTATE_FEDERATION_STRATEGY.md §4): the estate flag
 * on McpToolCatalogEntry. These tests prove deriveMcpToolCatalog() derives
 * the flag correctly using a synthetic tools array (est_02), AND — since
 * est_03 (same day) shipped the first 5 real estate-flagged tools (Foundry
 * Wave-1 PLANNED_CAPABILITIES stubs) — that the REAL catalog now carries
 * exactly those 5, correctly, and nothing else. discover_estate_tools stays
 * estate:false: it's Iliad's OWN discovery capability about the estate, not
 * a relay INTO one, and must stay visible on the human webapp (it already
 * does — see well-known-handlers.test.ts and ForAgentsPage.tsx's own tool
 * list from est_01).
 */
import { describe, it, expect } from "vitest";
import { deriveMcpToolCatalog } from "./mcp-tool-impls.js";
import { PLANNED_CAPABILITIES } from "./mcp-tools.js";
import { ESTATE_REGISTRY } from "@axis/generator-core";

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

  it("the REAL catalog (zero-arg call) carries exactly the 5 est_03 Foundry Wave-1 stubs as estate:true, nothing else", () => {
    // This test's own history is the point it demonstrates: it originally
    // asserted ZERO estate tools and was deliberately written to fail loud
    // the moment one shipped, forcing a reviewed update rather than a silent
    // pass. est_03 (same day) shipped the first 5; this is that reviewed
    // update, not a silent one.
    const catalog = deriveMcpToolCatalog();
    const estateTools = catalog.filter((t) => t.estate).map((t) => t.name).sort();
    expect(estateTools).toEqual(
      ["axis_compare", "axis_inspect", "axis_manifest_verify", "axis_validate", "roblox_compliance_check"].sort(),
    );
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

describe("PLANNED_CAPABILITIES Foundry stubs ↔ ESTATE_REGISTRY.foundry.tools guard (est_03)", () => {
  // Collapses what would otherwise be a THIRD hand-typed copy of Foundry's
  // name/summary/price (Foundry's own source -> estate-registry.ts already
  // vendors it once; a stub re-typing it again is exactly the drift class
  // this repo keeps rediscovering) into one guarded derivation.
  const foundryTools = new Map((ESTATE_REGISTRY.foundry.tools ?? []).map((t) => [t.name, t]));
  const stubs = PLANNED_CAPABILITIES.filter((c) => c.estate);

  it("finds at least one estate stub to guard (a vacuous guard proves nothing)", () => {
    expect(stubs.length).toBeGreaterThan(0);
  });

  it("every estate stub's name exists in ESTATE_REGISTRY.foundry.tools", () => {
    const missing = stubs.filter((c) => !foundryTools.has(c.name)).map((c) => c.name);
    expect(missing, `estate stub names with no ESTATE_REGISTRY.foundry.tools row: ${missing.join(", ")}`).toEqual([]);
  });

  it("every estate stub's summary matches its ESTATE_REGISTRY.foundry.tools row verbatim", () => {
    const mismatched = stubs
      .filter((c) => foundryTools.get(c.name)?.summary !== c.summary)
      .map((c) => c.name);
    expect(mismatched, `estate stub summary drifted from ESTATE_REGISTRY for: ${mismatched.join(", ")}`).toEqual([]);
  });

  it("every estate stub's advertised price matches its ESTATE_REGISTRY.foundry.tools row", () => {
    const mismatched = stubs.filter((c) => {
      const registryTool = foundryTools.get(c.name);
      if (!registryTool || registryTool.price_usd === "free") return true;
      return c.recommended_provider.pricing !== `$${registryTool.price_usd.toFixed(2)}`;
    }).map((c) => c.name);
    expect(mismatched, `estate stub price drifted from ESTATE_REGISTRY for: ${mismatched.join(", ")}`).toEqual([]);
  });

  it("every estate stub points its recommended_provider at Foundry's real MCP endpoint", () => {
    const wrong = stubs.filter((c) => c.recommended_provider.url !== ESTATE_REGISTRY.foundry.mcp?.url).map((c) => c.name);
    expect(wrong, `estate stub provider URL doesn't match ESTATE_REGISTRY.foundry.mcp.url for: ${wrong.join(", ")}`).toEqual([]);
  });

  it("every estate stub's capability_id is a self-describing estate_foundry_<name> slug", () => {
    for (const c of stubs) expect(c.capability_id, c.name).toBe(`estate_foundry_${c.name}`);
  });
});
