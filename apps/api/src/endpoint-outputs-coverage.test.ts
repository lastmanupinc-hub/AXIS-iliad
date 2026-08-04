// ─── No generator is silently unreachable (docs/OPEN_WORK_STRATEGY.md §D1) ──
//
// THE MISS THIS EXISTS TO STOP. A generator can be fully built, registered,
// counted in every honesty guard, advertised on the Programs page — and still
// be unreachable, because `PROGRAM_OUTPUTS` in handlers.ts is what a program
// endpoint actually returns by default and it is maintained BY HAND. app_24
// added `architecture-diagram.d2` to the canvas program and did not add it
// here, so for weeks `/v1/canvas/generate` served five files while the sixth
// existed and no customer could get it. Nothing failed. Every count guard was
// green, because they count what the REGISTRY has, never what the API serves.
//
// WHY THIS IS NOT JUST `expect(PROGRAM_OUTPUTS[p]).toEqual(registry[p])`. Some
// divergence is legitimate: `superpowers` owns 8 outputs but its endpoint
// returns 5, because the three verify-gate files (verify.sh, verify-full.sh,
// .githooks/pre-push) are delivered by a different path. A blanket equality
// assertion would look like a tidy-up and would break that correct behaviour —
// which is exactly the "fix" that looks right and isn't.
//
// So the rule is: every generator must be either SERVED by its program's
// endpoint, or listed below with a reason. Divergence becomes declared instead
// of accidental, and a newly added generator fails here until someone decides
// which it is.
import { describe, it, expect } from "vitest";
import { listAvailableGenerators } from "@axis/generator-core";
import { PROGRAM_OUTPUTS } from "./handlers.js";

/**
 * Generators deliberately NOT returned by their program's default endpoint
 * response. A reason is mandatory: this list is where a future reader learns
 * why something is unreachable by default, so "it was failing" is not one.
 */
const ENDPOINT_EXCLUSIONS: Record<string, { paths: string[]; reason: string }> = {
  superpowers: {
    paths: ["verify.sh", "verify-full.sh", ".githooks/pre-push"],
    reason:
      "The three verify-gate files ship through the verify-gate path, not the program endpoint. " +
      "Documented divergence: the manifest counts superpowers at 8 outputs while the endpoint returns 5 " +
      "(generators-agentic-purchasing-develop.test.ts pins PROGRAM_OUTPUT_COUNTS.superpowers === 8).",
  },
  artifacts: {
    paths: ["prd.md", "design.md", "tasks.md", "context.md", "index.html", "capability-map.yaml"],
    reason:
      "UNCONFIRMED (recorded 2026-08-04, not decided). These six exist in the registry and are not in the " +
      "endpoint's default set. Whether that is deliberate scoping or the same hand-maintenance miss that hid " +
      "architecture-diagram.d2 needs an owner call — see docs/OPEN_WORK_STRATEGY.md §D1. Listed rather than " +
      "silently served, because adding six files to a paid endpoint's response is a product change, not a fix.",
  },
  mcp: {
    paths: ["mcp/fintech-mcp-surface-package.md", "mcp/fintech-domain-schema.yaml"],
    reason:
      "UNCONFIRMED (recorded 2026-08-04, not decided). Two fintech-specific MCP artifacts exist in the registry " +
      "but are absent from the endpoint's default set. Plausibly deliberate — they are domain-specific rather " +
      "than universal — but that is a guess, and it is recorded as one.",
  },
};

/** Programs whose endpoints are custom handlers with no PROGRAM_OUTPUTS entry at all. */
const CUSTOM_HANDLER_PROGRAMS = new Set([
  "search", // POST /v1/search/index + /query — index/query semantics, not a file-generation response
  "skills", // handleSkillsGenerate builds its own response shape
]);

function generatorsByProgram(): Map<string, string[]> {
  const byProgram = new Map<string, string[]>();
  for (const g of listAvailableGenerators()) {
    const list = byProgram.get(g.program) ?? [];
    list.push(g.path);
    byProgram.set(g.program, list);
  }
  return byProgram;
}

describe("endpoint outputs — every generator is served or deliberately excluded", () => {
  it("no generator is unreachable by accident", () => {
    const unreachable: string[] = [];

    for (const [program, paths] of generatorsByProgram()) {
      if (CUSTOM_HANDLER_PROGRAMS.has(program)) continue;
      const served = PROGRAM_OUTPUTS[program];
      if (!served) {
        unreachable.push(`${program}: has generators but no PROGRAM_OUTPUTS entry and is not a declared custom handler`);
        continue;
      }
      const excluded = new Set(ENDPOINT_EXCLUSIONS[program]?.paths ?? []);
      for (const path of paths) {
        if (!served.includes(path) && !excluded.has(path)) {
          unreachable.push(`${program}: "${path}" is generated but the endpoint never returns it`);
        }
      }
    }

    expect(
      unreachable,
      "A generator exists that no customer can reach. Add it to PROGRAM_OUTPUTS in handlers.ts, " +
        "or to ENDPOINT_EXCLUSIONS in this file with a reason.",
    ).toEqual([]);
  });

  it("the endpoint never advertises a file no generator produces", () => {
    const byProgram = generatorsByProgram();
    const phantom: string[] = [];

    for (const [program, served] of Object.entries(PROGRAM_OUTPUTS)) {
      const real = new Set(byProgram.get(program) ?? []);
      for (const path of served) {
        if (!real.has(path)) phantom.push(`${program}: endpoint promises "${path}" but no generator produces it`);
      }
    }

    // The inverse failure, and the more damaging one: the endpoint charges for
    // output it cannot deliver. This is the same shape Phase T found on the
    // Programs page (37 advertised filenames with no generator behind them).
    expect(phantom, "A program endpoint advertises output that does not exist.").toEqual([]);
  });

  it("every exclusion names real generators and carries a real reason", () => {
    const byProgram = generatorsByProgram();
    for (const [program, { paths, reason }] of Object.entries(ENDPOINT_EXCLUSIONS)) {
      const real = new Set(byProgram.get(program) ?? []);
      expect(reason.length, `${program}: exclusion needs a real reason`).toBeGreaterThan(40);
      for (const path of paths) {
        // A stale exclusion is worse than none — it implies a decision about a
        // file that no longer exists, and hides the next real omission.
        expect(real.has(path), `${program}: excludes "${path}" but no such generator exists any more`).toBe(true);
      }
    }
  });
});
