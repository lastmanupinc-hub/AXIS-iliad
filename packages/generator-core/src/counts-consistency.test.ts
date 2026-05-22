import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { TOTAL_GENERATORS, TOTAL_PROGRAMS, listAvailableGenerators } from "./generate.js";

const here = dirname(fileURLToPath(import.meta.url));

function pickConst(source: string, name: string): number {
  const re = new RegExp(`const ${name} = (\\d+);`);
  const m = source.match(re);
  if (!m) throw new Error(`could not find ${name} in source`);
  return Number(m[1]);
}

describe("canonical counts cannot drift", () => {
  it("TOTAL_GENERATORS equals the REGISTRY size via listAvailableGenerators", () => {
    expect(TOTAL_GENERATORS).toBe(listAvailableGenerators().length);
  });

  it("TOTAL_PROGRAMS matches the distinct program set", () => {
    const programs = new Set(listAvailableGenerators().map(g => g.program));
    expect(TOTAL_PROGRAMS).toBe(programs.size);
  });

  it("generators-skills.ts ARTIFACT_COUNT matches TOTAL_GENERATORS", () => {
    const src = readFileSync(join(here, "generators-skills.ts"), "utf-8");
    expect(pickConst(src, "ARTIFACT_COUNT")).toBe(TOTAL_GENERATORS);
  });

  it("generators-skills.ts PROGRAM_COUNT matches TOTAL_PROGRAMS", () => {
    const src = readFileSync(join(here, "generators-skills.ts"), "utf-8");
    expect(pickConst(src, "PROGRAM_COUNT")).toBe(TOTAL_PROGRAMS);
  });

  it("generators-agentic-purchasing.ts ARTIFACT_COUNT matches TOTAL_GENERATORS", () => {
    const src = readFileSync(join(here, "generators-agentic-purchasing.ts"), "utf-8");
    expect(pickConst(src, "ARTIFACT_COUNT")).toBe(TOTAL_GENERATORS);
  });

  it("generators-agentic-purchasing.ts PROGRAM_COUNT matches TOTAL_PROGRAMS", () => {
    const src = readFileSync(join(here, "generators-agentic-purchasing.ts"), "utf-8");
    expect(pickConst(src, "PROGRAM_COUNT")).toBe(TOTAL_PROGRAMS);
  });
});
