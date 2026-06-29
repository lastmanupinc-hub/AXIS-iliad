import { describe, it, expect } from "vitest";
import { ARTIFACT_COUNT, PROGRAM_COUNT } from "./counts.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Runtime-truth guard for the strategic / contributor docs. README + the web UI are
// covered by count-honesty.test.ts; these files were not, and rotted to "86 artifacts /
// 18 programs / 102 generators" while the code-derived totals were 137 / 20. A doc that
// parses clean is not runtime truth — so we diff its current-state counts against counts.ts.
//
// Only docs with a SINGLE global count claim (no legit partials) are strict-guarded here.
// AXIS_Board_Pitch.md + capability_inventory.yaml carry pricing-tier / per-program partials
// ("15 programs", "5 generators") and ASCII art, so they're corrected by hand, not guarded.
// begin.yaml's `completed_candidates` block is a DATED milestone log (true when written) and
// is excluded — only the identity text that describes what Iliad IS NOW is enforced.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Keep only the current-state identity text; drop the dated milestone log + after. */
function identitySection(yaml: string): string {
  const histStart = yaml.search(/^\s*(completed_candidates|remaining_candidates):/m);
  return histStart === -1 ? yaml : yaml.slice(0, histStart);
}

function sources(): Array<{ name: string; text: string }> {
  return [
    { name: "begin.yaml (identity)", text: identitySection(readFileSync(join(ROOT, "begin.yaml"), "utf8")) },
    { name: "CONTRIBUTING.md", text: readFileSync(join(ROOT, "CONTRIBUTING.md"), "utf8") },
  ];
}

describe("strategic-docs honesty — current-state docs match code-derived counts", () => {
  it("every current-state artifact/generator count equals ARTIFACT_COUNT", () => {
    const bad: string[] = [];
    for (const { name, text } of sources()) {
      for (const m of text.matchAll(/(\d+)\s+(?:structured\s+|agent-ready\s+)*(?:artifacts|generators)/gi)) {
        if (Number(m[1]) !== ARTIFACT_COUNT) bad.push(`${name}: "${m[0].trim()}" (expected ${ARTIFACT_COUNT})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("every current-state program count equals PROGRAM_COUNT", () => {
    const bad: string[] = [];
    for (const { name, text } of sources()) {
      for (const m of text.matchAll(/(\d+)\s+(?:specialized\s+)?programs/gi)) {
        if (Number(m[1]) !== PROGRAM_COUNT) bad.push(`${name}: "${m[0].trim()}" (expected ${PROGRAM_COUNT})`);
      }
    }
    expect(bad).toEqual([]);
  });
});
