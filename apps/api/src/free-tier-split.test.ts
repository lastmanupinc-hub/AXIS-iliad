// Free tier is ARTIFACT-level: every one of the 21 programs ships a genuinely
// useful free artifact and withholds the rest, and every narrowed response
// NAMES what it withheld. The old program-level gate made 18 of 21 programs
// invisible until paid — a caller could not see what they would be buying,
// which is the shape the telemetry blamed for 0 returning accounts.
//
// These tests pin the properties that make the split trustworthy rather than
// the exact 47, which counts-consistency/count-honesty already guard:
//   1. every program has at least one free artifact (the core promise)
//   2. free artifacts are real registry paths (a typo would silently paywall one)
//   3. the free set never SHRINKS silently for the three formerly-free programs
//   4. withheld content is never leaked by the upsell block
import { describe, it, expect } from "vitest";
import {
  listAvailableGenerators,
  isFreeGenerator,
  FREE_GENERATORS,
  FREE_GENERATOR_COUNT,
  PROGRAM_FREE_COUNTS,
  GENERATOR_PROGRAMS,
  TOTAL_GENERATORS,
} from "@axis/generator-core";
import { buildFreeTierUpsell, buildNarrowedUpsell, PRO_UNLOCK_NOTE } from "./free-tier-upsell.js";

const ALL = listAvailableGenerators();
const PROGRAMS = [...new Set(ALL.map((g) => g.program))];

describe("free tier — artifact-level split", () => {
  it("every program has at least one free artifact", () => {
    const missing = PROGRAMS.filter((p) => (PROGRAM_FREE_COUNTS[p] ?? 0) === 0);
    expect(missing, `programs with no free artifact: ${missing.join(", ")}`).toEqual([]);
  });

  it("every program also retains at least one artifact worth paying for", () => {
    // Otherwise there is nothing to upsell and the paid tier is empty. The
    // three originally-free programs are the deliberate exception.
    const alwaysFree = new Set(["search", "skills", "debug"]);
    const noPaid = PROGRAMS.filter(
      (p) => !alwaysFree.has(p) && ALL.filter((g) => g.program === p).every((g) => isFreeGenerator(g.path)),
    );
    expect(noPaid, `programs with nothing paid left: ${noPaid.join(", ")}`).toEqual([]);
  });

  it("every FREE_GENERATORS entry is a real registry path (a typo would silently paywall it)", () => {
    const known = new Set(Object.keys(GENERATOR_PROGRAMS));
    const unknown = [...FREE_GENERATORS].filter((p) => !known.has(p));
    expect(unknown, `not in GENERATOR_PROGRAMS: ${unknown.join(", ")}`).toEqual([]);
  });

  it("search/skills/debug remain free IN FULL — no clawback of existing free value", () => {
    for (const program of ["search", "skills", "debug"]) {
      const notFree = ALL.filter((g) => g.program === program && !isFreeGenerator(g.path)).map((g) => g.path);
      expect(notFree, `${program} lost free artifacts: ${notFree.join(", ")}`).toEqual([]);
    }
  });

  it("the three artifacts generate.ts force-adds to every run are free", () => {
    // generate.ts unconditionally adds these regardless of requested_outputs —
    // if any were paid, every free run would emit an artifact it can't deliver.
    for (const path of ["context-map.json", "repo-profile.yaml", "architecture-summary.md"]) {
      expect(isFreeGenerator(path), `${path} must be free — generate.ts force-adds it`).toBe(true);
    }
  });

  it("free is a strict subset of the full catalog (there is still a paid product)", () => {
    expect(FREE_GENERATOR_COUNT).toBeGreaterThan(0);
    expect(FREE_GENERATOR_COUNT).toBeLessThan(TOTAL_GENERATORS);
  });
});

describe("free tier — the upsell block", () => {
  const brandFiles = [
    { path: "brand-guidelines.md", program: "brand", content: "x", description: "Brand rules" },
    { path: "voice-and-tone.md", program: "brand", content: "x", description: "Voice guide" },
    { path: ".vale.ini", program: "brand", content: "SECRET", description: "Vale linter config" },
    { path: "channel-rulebook.md", program: "brand", content: "SECRET", description: "Per-channel tone" },
  ];

  it("names every withheld artifact, with its real description", () => {
    const upsell = buildFreeTierUpsell(brandFiles, "brand");
    expect(upsell).toBeDefined();
    expect(upsell!.withheld.map((w) => w.path).sort()).toEqual([".vale.ini", "channel-rulebook.md"]);
    expect(upsell!.withheld.find((w) => w.path === ".vale.ini")!.description).toBe("Vale linter config");
    expect(upsell!.included.sort()).toEqual(["brand-guidelines.md", "voice-and-tone.md"]);
    expect(upsell!.withheld_count).toBe(2);
  });

  it("NEVER leaks withheld content", () => {
    const upsell = buildFreeTierUpsell(brandFiles, "brand");
    expect(JSON.stringify(upsell)).not.toContain("SECRET");
    for (const w of upsell!.withheld) {
      expect(w).not.toHaveProperty("content");
    }
  });

  it("quotes a real one-time unlock price for a single-program response", () => {
    const upsell = buildFreeTierUpsell(brandFiles, "brand");
    expect(upsell!.unlock.one_time_usd).toBe(15); // PRODUCT_REGISTRY brand
    expect(upsell!.unlock.per_call_usd).toMatch(/^\d+\.\d{2}$/);
    expect(upsell!.unlock.message).toContain("not a recurring subscription");
  });

  it("omits a one-time price when several programs are involved (no fabricated total)", () => {
    const mixed = [
      { path: ".vale.ini", program: "brand", content: "x", description: "d" },
      { path: "theme.css", program: "theme", content: "x", description: "d" },
    ];
    const upsell = buildFreeTierUpsell(mixed, "analyze_repo");
    expect(upsell!.unlock.one_time_usd).toBeUndefined();
    expect(upsell!.programs).toEqual(["brand", "theme"]);
  });

  it("is undefined when nothing was withheld, so a paid response is byte-identical", () => {
    const allFree = brandFiles.filter((f) => isFreeGenerator(f.path));
    expect(buildFreeTierUpsell(allFree, "brand")).toBeUndefined();
  });

  it("the narrowed (pre-generation) upsell names paid artifacts without inventing content", () => {
    const upsell = buildNarrowedUpsell(["theme"]);
    expect(upsell).toBeDefined();
    expect(upsell!.included).toContain("design-tokens.json");
    expect(upsell!.withheld.map((w) => w.path)).toContain("theme.css");
    expect(upsell!.unlock.one_time_usd).toBe(19); // PRODUCT_REGISTRY theme
  });
});

describe("free tier — derived copy cannot go stale", () => {
  it("PRO_UNLOCK_NOTE derives its counts (the old literal said a stale '15 more programs')", () => {
    expect(PRO_UNLOCK_NOTE).toContain(String(TOTAL_GENERATORS - FREE_GENERATOR_COUNT));
    expect(PRO_UNLOCK_NOTE).not.toContain("15 more programs");
    expect(PRO_UNLOCK_NOTE).toContain("not a recurring subscription");
  });
});
