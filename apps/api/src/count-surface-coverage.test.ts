// ─── The gap this closes (infra_01_test_suite_cost, lever 2) ───────────────
//
// Four separate guards each scan their own corpus for stale global counts:
//   count-honesty.test.ts ......... README, examples/*, apps/web (UI + index.html)
//   launch-claims.test.ts ......... launch-content.md, marketing-pack.md, board pitch
//   strategic-docs-honesty.test.ts  begin.yaml (identity section), CONTRIBUTING.md
//   counts-consistency.test.ts .... root + packages/*/package.json descriptions
//
// Every one of them answers "does MY corpus lie?" — and NONE answers "is every
// lying file in SOMEBODY's corpus?". That hole is not theoretical: bumping the
// artifact count 142 -> 143 required edits in eight files, and a ninth
// (generators-agentic-purchasing.ts, which keeps its own private ARTIFACT_COUNT
// feeding the commerce product schema) was missed by every guard and only
// surfaced when CI failed on an unrelated assertion. Scattered enforcement is
// simultaneously redundant AND incomplete.
//
// This test walks the tracked repo, finds every file that makes a global count
// claim, and asserts each one is either covered by a corpus above or listed in
// UNGUARDED below with a reason. Adding a new doc with a count in it now fails
// here until someone puts it under a guard — which is the property the four
// guards could never have, individually or together.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { hasAnyCountClaim } from "./count-extractors.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "coverage", ".pnpm-store", ".vite",
  ".ai", ".dogfood-closer-output", ".claude", ".github",
]);

/**
 * Generated AXIS output trees (.ai-output, .ai-output-v2, .ai-output-new, …):
 * ARTIFACTS of a past run, not source of truth. They legitimately embed
 * whatever count was live when produced, and new ones appear with each dogfood
 * run — matched by prefix so a future .ai-output-<whatever> is covered too.
 */
const isGeneratedOutputDir = (name: string): boolean => name.startsWith(".ai-output");

/**
 * Docs only — deliberately NOT .ts/.tsx. Source constants are guarded far more
 * strongly than a regex could manage: counts-consistency.test.ts pins them to
 * the LIVE registry (listAvailableGenerators().length, MCP_TOOLS.length, the
 * real route count), so they cannot drift by construction. Regex-scanning
 * source would mostly match numbers in comments — including this guard's own
 * explanatory notes about historical stale values. apps/web/src/**.tsx is
 * already covered by count-honesty's corpus.
 */
const SCANNED_EXTENSIONS = [".md", ".json", ".yaml", ".yml", ".html"];

/**
 * Files that DO carry a global count but are deliberately not guarded. Each
 * needs a reason — this list is the place a future reader looks to understand
 * why something is exempt, so "it was failing" is not an acceptable entry.
 */
const UNGUARDED: Array<{ path: string; reason: string }> = [
  { path: "CHANGELOG.md", reason: "historical record — past entries describe counts that were true when written" },
  { path: "begin.yaml", reason: "identity section IS guarded by strategic-docs-honesty; the candidate log below it is a dated history" },
  { path: "continuation.yaml", reason: "dated progress log, same rationale as begin.yaml's candidate block" },
  { path: "CLAUDE.md", reason: "AXIS-generated artifact describing this repo — regenerated, not hand-maintained" },
  { path: "AGENTS.md", reason: "AXIS-generated artifact, same as CLAUDE.md" },
  { path: "LAUNCH_CLAIMS.yaml", reason: "IS the claims registry — launch-claims.test.ts pins its values to counts.ts directly" },
  { path: "capability_inventory.yaml", reason: "carries pricing-tier and per-program PARTIAL counts, not global totals — strategic-docs-honesty.test.ts documents it as hand-corrected by design" },
  { path: ".tmp-vitest.json", reason: "transient vitest reporter output, not a committed surface" },
  // OWNER DECISION NEEDED (2026-08-04). Both are hand-maintained customer-facing
  // packs and belong in launch-claims' corpus alongside canvas/remotion-pack.
  // Their COUNTS were stale and are now fixed, and obsidian-vault-pack's stale
  // "SQLite WAL, 5 tables" data-layer claim is corrected to Neon Postgres. What
  // still blocks them is prose, not numbers: both assert "81/82 at Grade A",
  // the unverifiable capability_inventory self-audit that SPEC-12 already
  // stripped from the launch corpus. Deleting that line from marketing copy is
  // the owner's call, so it is recorded here rather than silently rewritten.
  // Resolve the claim, then move both into corpus() and delete these entries.
  { path: "obsidian-vault-pack.md", reason: "OWNER: still asserts the unverifiable '81/82 at Grade A' self-audit SPEC-12 removed from the launch corpus; counts and SQLite claims already corrected" },
  { path: "superpowers-pack.md", reason: "OWNER: same unverifiable '81/82 at Grade A' self-audit claim; counts already corrected to 143/20" },
];

/**
 * Internal, dated documents: planning records, work orders, specs, audit
 * reports and runbooks. Their counts describe what was true WHEN WRITTEN and
 * are meaningful as history — rewriting them on every count bump would destroy
 * the record and produce enormous churn. They are not customer-facing claims.
 * Matched by prefix so new specs/work-orders inherit the exemption.
 */
const INTERNAL_DOC_PREFIXES = [
  "docs/",
  "HARDEN_POLISH_LOOP.md",
  "SONNET5_REMEDIATION_PLAYBOOK.md",
  "V1_LAUNCH_TODO.md",
  "V1_ROI_CANDIDATES.md",
  "AXIS_DEMO_REPORT.md",
  "launch-checklist.md",
  "daily-maintenance-runbook.yaml",
  "competitive-gap-matrix.yaml",
  "iliad-agentic-platform-strategy.yaml",
];

/** Corpora already guarded elsewhere. Kept as prefixes/exact paths, matching each guard's real scope. */
const GUARDED_PREFIXES = [
  "README.md",
  "CONTRIBUTING.md",
  "examples/README.md",
  "examples/README.json",
  "apps/web/index.html",
  "apps/web/src/",
  "launch-content.md",
  "marketing-pack.md",
  "AXIS_Board_Pitch.md",
  "canvas-pack.md",
  "remotion-pack.md",
  "server.json",
  "package.json",
  "packages/", // packages/*/package.json descriptions, via counts-consistency
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || isGeneratedOutputDir(entry)) continue;
    const abs = join(dir, entry);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue; // races/symlinks — nothing to assert about a file we can't stat
    }
    if (st.isDirectory()) walk(abs, out);
    else if (SCANNED_EXTENSIONS.some((e) => entry.endsWith(e))) out.push(abs);
  }
  return out;
}

function isGuarded(rel: string): boolean {
  return GUARDED_PREFIXES.some((p) => (p.endsWith("/") ? rel.startsWith(p) : rel === p || rel.endsWith(`/${p}`)));
}

describe("count-surface coverage — no count claim escapes every guard", () => {
  it("every file making a global count claim is guarded or explicitly exempted", () => {
    const exempt = new Set(UNGUARDED.map((u) => u.path));
    const unguarded: string[] = [];

    for (const abs of walk(ROOT)) {
      const rel = relative(ROOT, abs).replace(/\\/g, "/");
      if (exempt.has(rel) || isGuarded(rel)) continue;
      if (INTERNAL_DOC_PREFIXES.some((p) => (p.endsWith("/") ? rel.startsWith(p) : rel === p))) continue;
      // Test files ASSERT about counts; they are not marketing surfaces.
      if (/\.test\.tsx?$/.test(rel)) continue;

      let text: string;
      try {
        text = readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      if (hasAnyCountClaim(text)) unguarded.push(rel);
    }

    expect(
      unguarded,
      "These files claim a global artifact/program/tool/endpoint total but no honesty guard scans them. " +
        "Add the file to a guard's corpus, or to UNGUARDED with a reason.",
    ).toEqual([]);
  });

  it("every UNGUARDED entry carries a reason and still exists", () => {
    for (const { path, reason } of UNGUARDED) {
      expect(reason.length, `${path} needs a real reason`).toBeGreaterThan(20);
      // A stale exemption is worse than none: it silently un-guards nothing while
      // implying coverage. If the file is gone, the entry must go too.
      expect(() => readFileSync(join(ROOT, path), "utf8"), `${path} is exempted but missing`).not.toThrow();
    }
  });
});
