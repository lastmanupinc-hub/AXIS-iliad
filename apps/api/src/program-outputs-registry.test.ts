import { describe, it, expect } from "vitest";
import { listAvailableGenerators } from "@axis/generator-core";
import { PROGRAM_OUTPUTS } from "./handlers.js";

// DB-free guard: PROGRAM_OUTPUTS (the authoritative REST+MCP request list) must stay in
// sync with the generator REGISTRY. A renamed/removed output path here silently drops
// the file from every deploy of that program — exactly what happened when
// deploy/.dockerignore was renamed to deploy/Dockerfile.dockerignore in the generators +
// generate.ts REGISTRY but not in this list.
describe("PROGRAM_OUTPUTS ↔ generator registry", () => {
  const registered = new Set(listAvailableGenerators().map((g) => g.path));

  it("every requested output path is a registered generator", () => {
    const missing: string[] = [];
    for (const [program, outputs] of Object.entries(PROGRAM_OUTPUTS)) {
      for (const path of outputs) {
        if (!registered.has(path)) missing.push(`${program}: ${path}`);
      }
    }
    expect(missing, `requested outputs with no registered generator:\n${missing.join("\n")}`).toEqual([]);
  });
});
