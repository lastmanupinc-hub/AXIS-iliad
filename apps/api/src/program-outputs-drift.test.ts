// spoke_06's API-surface half: the REST program endpoints must offer exactly the
// artifacts the generators actually produce.
//
// PROGRAM_OUTPUTS used to be a hand-written literal, and it had drifted: three
// programs' default runs silently omitted 11 artifacts between them, including
// the ENTIRE superpowers verify gate, while the storefront pages — which count
// from the manifest — advertised the larger number. Customers paid for a count
// the API did not deliver.
//
// It is derived now, so this guard's job is to fail if anyone reintroduces a
// second hand-maintained list.
import { describe, it, expect } from "vitest";
import { PROGRAM_OUTPUTS } from "./handlers.js";
import { listAvailableGenerators } from "@axis/generator-core";

/** program -> its real outputs, from the generator registry. */
function fromManifest(): Record<string, string[]> {
  const byProgram: Record<string, string[]> = {};
  for (const { path, program } of listAvailableGenerators()) {
    (byProgram[program] ??= []).push(path);
  }
  for (const p of Object.keys(byProgram)) byProgram[p].sort();
  return byProgram;
}

describe("PROGRAM_OUTPUTS — no second hand-maintained list", () => {
  it("has a non-trivial set of programs (guards against a vacuous comparison)", () => {
    expect(Object.keys(PROGRAM_OUTPUTS).length).toBeGreaterThanOrEqual(15);
  });

  it("offers EXACTLY the artifacts each program's generators produce", () => {
    const manifest = fromManifest();
    const drift: string[] = [];
    for (const [program, outputs] of Object.entries(PROGRAM_OUTPUTS)) {
      const real = manifest[program] ?? [];
      const missing = real.filter((o) => !outputs.includes(o));
      const extra = outputs.filter((o) => !real.includes(o));
      if (missing.length) drift.push(`${program} MISSING ${missing.join(", ")}`);
      if (extra.length) drift.push(`${program} has non-existent ${extra.join(", ")}`);
    }
    expect(
      drift,
      "A REST program endpoint's default outputs disagree with the generators that exist. " +
        "Missing entries mean a paying caller silently receives fewer artifacts than the " +
        "storefront advertises. Derive from listAvailableGenerators(); never hand-maintain.",
    ).toEqual([]);
  });

  it("covers every program except the two with dedicated handlers", () => {
    const manifestPrograms = new Set(Object.keys(fromManifest()));
    const covered = new Set(Object.keys(PROGRAM_OUTPUTS));
    const uncovered = [...manifestPrograms].filter((p) => !covered.has(p)).sort();
    // search and skills have their own handlers and output contracts.
    expect(uncovered).toEqual(["search", "skills"]);
  });

  it("regression: the three programs that had drifted now carry their full set", () => {
    // Named explicitly so the fix cannot silently regress to the old counts.
    const manifest = fromManifest();
    for (const program of ["artifacts", "superpowers", "mcp"]) {
      expect(PROGRAM_OUTPUTS[program], `${program} missing from PROGRAM_OUTPUTS`).toBeDefined();
      expect(PROGRAM_OUTPUTS[program].length, `${program} regressed`).toBe(manifest[program].length);
    }
    // The specific artifacts that were absent, by name.
    expect(PROGRAM_OUTPUTS.superpowers).toContain("verify.sh");
    expect(PROGRAM_OUTPUTS.superpowers).toContain(".githooks/pre-push");
    expect(PROGRAM_OUTPUTS.artifacts).toContain("prd.md");
    expect(PROGRAM_OUTPUTS.artifacts).toContain("capability-map.yaml");
    expect(PROGRAM_OUTPUTS.mcp).toContain("mcp/fintech-domain-schema.yaml");
  });
});
