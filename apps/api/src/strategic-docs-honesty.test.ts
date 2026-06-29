import { describe, it, expect } from "vitest";
import { ARTIFACT_COUNT, PROGRAM_COUNT } from "./counts.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Runtime-truth guard for the strategic ledgers. README + the web UI are covered by
// count-honesty.test.ts; begin.yaml was NOT, and its identity claims rotted to "86
// artifacts / 18 programs" while the code-derived totals were 137 / 20. A doc that parses
// clean is not runtime truth — so we diff its current-state counts against counts.ts.
//
// `begin.yaml`'s `completed_candidates` block is a DATED milestone log: each entry was
// true when written (e.g. "12 tools"), so it is history, not a current claim — we only
// enforce the identity text that describes what Iliad IS NOW (everything before that log).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Keep only the current-state identity text; drop the dated milestone log + after. */
function identitySection(yaml: string): string {
  const histStart = yaml.search(/^\s*(completed_candidates|remaining_candidates):/m);
  return histStart === -1 ? yaml : yaml.slice(0, histStart);
}

describe("strategic-docs honesty — begin.yaml matches code-derived counts", () => {
  const begin = identitySection(readFileSync(join(ROOT, "begin.yaml"), "utf8"));

  it("every current-state artifact/generator count equals ARTIFACT_COUNT", () => {
    const bad: string[] = [];
    for (const m of begin.matchAll(/(\d+)\s+(?:structured\s+|agent-ready\s+)*(?:artifacts|generators)/gi)) {
      if (Number(m[1]) !== ARTIFACT_COUNT) bad.push(`"${m[0].trim()}" (expected ${ARTIFACT_COUNT})`);
    }
    expect(bad).toEqual([]);
  });

  it("every current-state program count equals PROGRAM_COUNT", () => {
    const bad: string[] = [];
    for (const m of begin.matchAll(/(\d+)\s+(?:specialized\s+)?programs/gi)) {
      if (Number(m[1]) !== PROGRAM_COUNT) bad.push(`"${m[0].trim()}" (expected ${PROGRAM_COUNT})`);
    }
    expect(bad).toEqual([]);
  });
});
