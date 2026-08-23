import { describe, it, expect } from "vitest";
import { ESTATE_REGISTRY, ESTATE_IDS, ESTATE_SCHEMA_VERSION, getEstateEntry, buildEstateManifest, type EstateEntry } from "./estate-registry.js";
import { RESELL_CAPABILITIES } from "./generators-artifacts.js";

const entries = (): EstateEntry[] => Object.values(ESTATE_REGISTRY);

describe("ESTATE_REGISTRY — shape", () => {
  it("every entry's own id matches its registry key", () => {
    for (const [key, entry] of Object.entries(ESTATE_REGISTRY)) {
      expect(entry.id).toBe(key);
    }
  });

  it("ESTATE_IDS is exactly Object.keys(ESTATE_REGISTRY)", () => {
    expect(ESTATE_IDS).toEqual(Object.keys(ESTATE_REGISTRY));
  });

  it("every entry has a non-empty name, capabilities_summary, and at least one domain", () => {
    for (const entry of entries()) {
      expect(entry.name.length, entry.id).toBeGreaterThan(0);
      expect(entry.capabilities_summary.length, entry.id).toBeGreaterThan(0);
      expect(entry.domains.length, entry.id).toBeGreaterThan(0);
    }
  });

  it("every entry is webapp_surface: agent-only — the whole point of this table", () => {
    for (const entry of entries()) {
      expect(entry.webapp_surface, entry.id).toBe("agent-only");
    }
  });

  it("does not include an Iliad self-row — webapp_surface: agent-only would be false for Iliad's own webapp", () => {
    expect(ESTATE_REGISTRY.iliad).toBeUndefined();
    expect(ESTATE_IDS).not.toContain("iliad");
  });

  it("ESTATE_SCHEMA_VERSION is a non-empty string", () => {
    expect(typeof ESTATE_SCHEMA_VERSION).toBe("string");
    expect(ESTATE_SCHEMA_VERSION.length).toBeGreaterThan(0);
  });
});

describe("ESTATE_REGISTRY — status honesty", () => {
  it("a planned entry carries no mcp/payment/tools — those would claim a callable surface that doesn't exist yet", () => {
    for (const entry of entries().filter((e) => e.status === "planned")) {
      expect(entry.mcp, entry.id).toBeUndefined();
      expect(entry.payment, entry.id).toBeUndefined();
      expect(entry.tools, entry.id).toBeUndefined();
    }
  });

  it("every entry carrying tools[] also carries tools_source.vendored_at — an undated snapshot is unstaleness-checkable", () => {
    for (const entry of entries().filter((e) => e.tools)) {
      expect(entry.tools_source?.vendored_at, entry.id).toBeTruthy();
    }
  });

  it("every tool price is a positive number or the literal 'free' — never zero, negative, or NaN", () => {
    for (const entry of entries()) {
      for (const tool of entry.tools ?? []) {
        if (tool.price_usd === "free") continue;
        expect(tool.price_usd, `${entry.id}.${tool.name}`).toBeGreaterThan(0);
        expect(Number.isFinite(tool.price_usd), `${entry.id}.${tool.name}`).toBe(true);
      }
    }
  });

  it("a live entry's health.last_status is never 'unreachable' — a dead sibling must not claim live", () => {
    for (const entry of entries().filter((e) => e.status === "live")) {
      expect(entry.health?.last_status, entry.id).not.toBe("unreachable");
    }
  });
});

describe("getEstateEntry", () => {
  it("returns the real entry for a known id", () => {
    expect(getEstateEntry("paid")?.name).toBe("PAI'D");
  });

  it("returns undefined for an unknown id — never fabricates a row", () => {
    expect(getEstateEntry("not_a_real_sibling")).toBeUndefined();
  });
});

describe("est_06 — PAI'D surface, verified fields", () => {
  it("PAI'D's MCP endpoint carries the protocol version PAI'D themselves verified live (2025-06-18)", () => {
    expect(ESTATE_REGISTRY.paid.mcp?.protocol_version).toBe("2025-06-18");
  });

  it("PAI'D exposes exactly the three blessed read-only tools — never execute_payment, wallet top-up, or checkout-initiation", () => {
    const names = (ESTATE_REGISTRY.paid.tools ?? []).map((t) => t.name).sort();
    expect(names).toEqual(["get_payment_intent", "get_quote", "list_providers"].sort());
  });
});

describe("est_07 — Launch surface, corrected fields", () => {
  it("no longer claims Launch has zero callable functions — links its real RFC 9727 catalog instead", () => {
    expect(ESTATE_REGISTRY.launch.discovery.api_catalog).toBe("https://jonathanarvay.com/.well-known/api-catalog");
  });

  it("still carries no mcp block for Launch — its real surface is plain REST, not MCP tools", () => {
    expect(ESTATE_REGISTRY.launch.mcp).toBeUndefined();
  });

  it("axis_launch known_repos entry links back to this same estate registry (verified reciprocity)", () => {
    // Not independently network-checkable from this test (same §1.4 interception every other
    // launch/foundry live check hits) — this pins the STATIC fact this repo's own side controls:
    // ESTATE_REGISTRY.launch.discovery.well_known points at the file that, per a direct read of
    // Launch's own repo on this machine (2026-08-22), now points straight back here.
    expect(ESTATE_REGISTRY.launch.discovery.well_known).toBe("https://jonathanarvay.com/.well-known/axis-launch.json");
  });
});

describe("sibling_process ↔ ESTATE_REGISTRY guard", () => {
  // Collapses what would otherwise be independent, driftable sibling-ownership
  // claims (RESELL_CAPABILITIES.sibling_process in this same package, plus the
  // MCP-surface doctrine comments est_02 rewrites) down to one guarded
  // derivation, per docs/ESTATE_FEDERATION_STRATEGY.md's Layer 1 section.
  const siblingProcessEntries = RESELL_CAPABILITIES.filter((c) => c.status === "sibling_owned" && c.sibling_process);

  it("finds at least one sibling_owned capability to guard (a vacuous guard proves nothing)", () => {
    expect(siblingProcessEntries.length).toBeGreaterThan(0);
  });

  it("every sibling_process.name resolves to a real ESTATE_REGISTRY entry by name", () => {
    const registryNames = new Set(entries().map((e) => e.name));
    const missing = siblingProcessEntries
      .map((c) => c.sibling_process!.name)
      .filter((name) => !registryNames.has(name));
    expect(missing, `sibling_process names with no ESTATE_REGISTRY row: ${missing.join(", ")}`).toEqual([]);
  });

  it("image_generation's sibling_process names AXIS Foundry, matching ESTATE_REGISTRY.foundry", () => {
    const imageGen = RESELL_CAPABILITIES.find((c) => c.id === "image_generation");
    expect(imageGen?.sibling_process?.name).toBe(ESTATE_REGISTRY.foundry.name);
  });
});

describe("buildEstateManifest — the one shared source for both served surfaces", () => {
  // Consolidates handlers.ts's handleEstateManifest and mcp-tool-impls.ts's
  // runDiscoverEstateTools, which independently hand-built this shape until
  // a third shared field (field_docs) made the drift concrete: the MCP
  // version had already dropped this_property.domains/api_base that the
  // REST version carried.
  it("carries field_docs.webapp_surface clarifying it describes Iliad's treatment, not the property's own site", () => {
    const manifest = buildEstateManifest();
    expect(manifest.field_docs.webapp_surface).toMatch(/Iliad/);
    expect(manifest.field_docs.webapp_surface.toLowerCase()).toContain("not a claim about the property's own website");
  });

  it("this_property is Iliad's own row, never one of the ESTATE_REGISTRY siblings", () => {
    const manifest = buildEstateManifest();
    expect(manifest.this_property.id).toBe("iliad");
    expect(manifest.properties.some((p) => p.id === "iliad")).toBe(false);
  });

  it("this_property carries domains and api_base, not just id/name/mcp", () => {
    const manifest = buildEstateManifest();
    expect(manifest.this_property.domains.length).toBeGreaterThan(0);
    expect(manifest.this_property.api_base.length).toBeGreaterThan(0);
  });

  it("properties is exactly ESTATE_REGISTRY's values — the same reference data both surfaces serve", () => {
    const manifest = buildEstateManifest();
    expect(manifest.properties).toEqual(Object.values(ESTATE_REGISTRY));
  });

  it("is deterministic — two calls produce deep-equal output (no clocks, no randomness)", () => {
    expect(buildEstateManifest()).toEqual(buildEstateManifest());
  });
});
