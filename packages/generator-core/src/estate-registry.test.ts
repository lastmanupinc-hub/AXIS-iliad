import { describe, it, expect } from "vitest";
import { ESTATE_REGISTRY, ESTATE_IDS, ESTATE_SCHEMA_VERSION, getEstateEntry, type EstateEntry } from "./estate-registry.js";
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
