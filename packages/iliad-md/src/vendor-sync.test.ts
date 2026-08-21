// The systemic guard tool_01_redundancy_sweep's first real run pointed at:
// packages/iliad-md/src/vendor/ is a hand-vendored copy of repo-parser,
// context-engine, snapshots, and cli source, shipped inside the PUBLISHED
// iliad-md npm CLI, with no automated re-vendor step. This is not a
// hypothetical risk — vendor/snapshots/github.test.ts documents that this
// exact file already drifted once (2026-07-22, missing 2 shipped security
// fixes) and vendor/repo-parser/import-resolver.ts's own header comment
// ("KEEP IN SYNC: HARDEN-2 found this copy had drifted") documents a SECOND,
// independent prior incident. Two point-fixes exist for two already-found
// instances; nothing previously caught the NEXT one before now.
//
// METHOD: bag-of-lines containment, not byte/positional diffing. A vendored
// file is deliberately NOT byte-identical to its source (import paths are
// rewired, per every file's own header comment), so exact equality is the
// wrong check. Instead: strip imports/comments/blank lines from both files,
// then ask what fraction of the VENDORED file's remaining lines still appear
// verbatim somewhere in the CURRENT source. A source fix or feature addition
// that the vendored copy never received shows up as vendor lines that no
// longer find a match — which is exactly what both prior incidents were.
//
// KNOWN LIMITATION, not hidden (see the dedicated test below): this metric
// only catches drift where source REPLACES lines the vendored copy still has
// — a pure insertion (source adds a new line alongside otherwise-untouched
// code) leaves 100% of vendor's old lines individually findable in source, so
// the ratio stays at 1.0 and the drift slips through. Both real instances
// this guard is proven against below (domain-extractor.ts, scanner.ts)
// drifted via replacement, which is why it catches them — but it is not a
// complete drift detector, and should not be sold as one.
//
// Scoping this (2026-08-20) found TWO MORE, currently open, unfixed drift
// instances this way: cli/scanner.ts (source gained manifest-file admission
// by name + a doc-audit filter the vendored copy never got) and
// repo-parser/domain-extractor.ts (source was fixed to use brace-BALANCED
// matching for Go struct/interface bodies — the vendored copy still runs the
// old regex the source's own comment says "dropped every field after a
// nested type"). Both are real correctness gaps in a published package, not
// this guard's fault to silently fix — recorded as an explicit, dated
// exemption with the real reason, exactly like this repo's existing
// count-surface-coverage.test.ts pattern, so the gate stays honest about
// what's covered vs. what's a known, open, tracked gap.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

interface VendorPair {
  vendor: string;
  source: string;
  /** Present ONLY for a known, dated, open drift — never used to hide a fresh one. */
  exempt?: string;
}

const VENDOR_PAIRS: VendorPair[] = [
  { vendor: "packages/iliad-md/src/vendor/cli/manifest.ts", source: "apps/cli/src/runner.ts" },
  {
    // FIXED 2026-08-20: re-vendored with the source-first admission algorithm (manifest-name
    // admission, doc-audit deferred fill, per-top-level round-robin walk). Was exempt (82.5%
    // contained); NOT a straight copy — apps/cli/src/scanner.ts dropped the `excludePaths`
    // option this package's own cli.ts still genuinely depends on (self-poisoning guard against
    // re-scanning this tool's own prior output), so it was re-added on top of the ported
    // algorithm rather than silently lost. The 5 lines that make this file NOT 100% (vs.
    // domain-extractor.ts's 100%) are exactly that deliberate re-addition — see the file's own
    // header comment.
    vendor: "packages/iliad-md/src/vendor/cli/scanner.ts",
    source: "apps/cli/src/scanner.ts",
  },
  { vendor: "packages/iliad-md/src/vendor/context-engine/engine.ts", source: "packages/context-engine/src/engine.ts" },
  { vendor: "packages/iliad-md/src/vendor/context-engine/types.ts", source: "packages/context-engine/src/types.ts" },
  {
    // FIXED 2026-08-20: re-vendored with balancedBraceBody()/collectBraceTypes() ported from
    // source, plus the ReDoS-safe per-line parseTSFields. Was exempt (77.5% contained); this
    // guard's own "exemption stays valid only while it's still actually drifted" test caught
    // the fix immediately (scored 100%, failed the exempt-branch assertion) — exactly the
    // mechanism it exists for. See the commit for the full before/after.
    vendor: "packages/iliad-md/src/vendor/repo-parser/domain-extractor.ts",
    source: "packages/repo-parser/src/domain-extractor.ts",
  },
  { vendor: "packages/iliad-md/src/vendor/repo-parser/framework-detector.ts", source: "packages/repo-parser/src/framework-detector.ts" },
  { vendor: "packages/iliad-md/src/vendor/repo-parser/import-resolver.ts", source: "packages/repo-parser/src/import-resolver.ts" },
  { vendor: "packages/iliad-md/src/vendor/repo-parser/language-detector.ts", source: "packages/repo-parser/src/language-detector.ts" },
  { vendor: "packages/iliad-md/src/vendor/repo-parser/parser.ts", source: "packages/repo-parser/src/parser.ts" },
  { vendor: "packages/iliad-md/src/vendor/repo-parser/sql-extractor.ts", source: "packages/repo-parser/src/sql-extractor.ts" },
  { vendor: "packages/iliad-md/src/vendor/repo-parser/types.ts", source: "packages/repo-parser/src/types.ts" },
  { vendor: "packages/iliad-md/src/vendor/snapshots/github.ts", source: "packages/snapshots/src/github.ts" },
  { vendor: "packages/iliad-md/src/vendor/snapshots/types.ts", source: "packages/snapshots/src/types.ts" },
];

/** Strips imports, comments, and blank/bare-punctuation lines — the parts a
 * vendored file is EXPECTED to differ on (import paths are always rewired). */
export function bodyLines(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let inBlockComment = false;
  let inImport = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (inBlockComment) {
      if (t.includes("*/")) inBlockComment = false;
      continue;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlockComment = true;
      continue;
    }
    if (inImport) {
      if (t.includes(";")) inImport = false;
      continue;
    }
    if (/^import\b/.test(t)) {
      if (!t.includes(";")) inImport = true;
      continue;
    }
    if (t.startsWith("//")) continue;
    if (t.length === 0) continue;
    if (/^[{}()[\];,]+$/.test(t)) continue;
    out.push(t);
  }
  return out;
}

/** What fraction of `vendorLines` still appears verbatim somewhere in `sourceLines`. */
export function containmentRatio(vendorLines: string[], sourceLines: string[]): number {
  if (vendorLines.length === 0) return 1;
  const sourceSet = new Set(sourceLines);
  const matched = vendorLines.filter((l) => sourceSet.has(l)).length;
  return matched / vendorLines.length;
}

const PASS_THRESHOLD = 0.95;

function readBody(relPath: string): string[] {
  return bodyLines(readFileSync(join(ROOT, relPath), "utf8"));
}

describe("vendor-sync — packages/iliad-md/src/vendor/ must not silently drift from its source", () => {
  it("covers a non-trivial registry (guards against this whole suite passing vacuously)", () => {
    expect(VENDOR_PAIRS.length).toBeGreaterThanOrEqual(13);
  });

  for (const pair of VENDOR_PAIRS) {
    const label = pair.vendor.replace("packages/iliad-md/src/vendor/", "");
    if (pair.exempt) {
      it(`${label}: KNOWN OPEN DRIFT, exemption stays valid only while it's still actually drifted`, () => {
        const ratio = containmentRatio(readBody(pair.vendor), readBody(pair.source));
        // If this ever passes, someone fixed the drift and forgot to remove the
        // exemption — the SAME "stale exemption" failure mode ops_01/SPEC-12
        // already found once in this repo's own honesty guards. Failing loud
        // here is what prevents that repeat.
        expect(
          ratio,
          `${label} scored ${(ratio * 100).toFixed(1)}% containment — at or above the pass threshold. ` +
            `That means the documented drift may be FIXED now. Move this pair out of the exempt list ` +
            `(delete its \`exempt\` reason) rather than leaving a stale exemption in place.`,
        ).toBeLessThan(PASS_THRESHOLD);
      });
    } else {
      it(`${label}: stays in sync with its real source`, () => {
        const ratio = containmentRatio(readBody(pair.vendor), readBody(pair.source));
        expect(
          ratio,
          `${label} is only ${(ratio * 100).toFixed(1)}% contained in ${pair.source} — the vendored ` +
            `copy has drifted from its real source (or the source moved/was rewritten). Either re-vendor ` +
            `this file, or if the gap is real and known, add a dated \`exempt\` reason explaining why, ` +
            `matching how the other two known-open gaps in this same file are recorded.`,
        ).toBeGreaterThanOrEqual(PASS_THRESHOLD);
      });
    }
  }
});

describe("containmentRatio — RED-PROVEN against the exact failure mode this guard exists for", () => {
  it("scores 100% when vendor's content is an exact (import-rewired) subset of source", () => {
    const source = ["const a = 1;", "function f() { return a; }", "export { f };"];
    const vendor = ["const a = 1;", "function f() { return a; }", "export { f };"]; // same body, imports differ (stripped before this call)
    expect(containmentRatio(vendor, source)).toBe(1);
  });

  it("drops below threshold when source REPLACES logic the vendor copy never received", () => {
    // Matches the actual shape both real, currently-open drift instances took
    // (scanner.ts, domain-extractor.ts): the source doesn't just ADD a line
    // alongside the old ones, it REPLACES existing lines with new logic — so
    // the stale vendor lines stop appearing in source's line set at all.
    const staleVendor = [
      "function fetchUrl(url) {",
      "  return httpGet(url);",
      "}",
    ];
    const fixedSource = [
      "function fetchUrl(url) {",
      "  if (!url.startsWith('https://')) throw new Error('non-https redirect rejected');",
      "  return httpGetSecure(url);", // replaced, not merely appended alongside
      "}",
    ];
    const ratio = containmentRatio(staleVendor, fixedSource);
    expect(ratio).toBeLessThan(PASS_THRESHOLD);
    expect(ratio).toBeCloseTo(2 / 3, 5); // "function fetchUrl(url) {" and "}" still match; the changed line doesn't
  });

  it("KNOWN LIMITATION, documented rather than hidden: a pure insertion (source adds a new line without changing any existing ones) does NOT drop the ratio", () => {
    // If a security fix is a clean insert alongside otherwise-untouched code,
    // every one of the stale vendor's lines is STILL individually present
    // somewhere in source, so bag-of-lines containment stays at 1.0 — this
    // guard would miss that shape of drift. Both real instances this guard
    // was built against (domain-extractor.ts, scanner.ts) drifted via
    // replacement, not pure insertion, which is why the guard catches them —
    // but this negative case is recorded so nobody mistakes the metric for
    // catching every possible drift shape.
    const staleVendor = ["function fetchUrl(url) {", "  return httpGet(url);", "}"];
    const sourceWithPureInsertOnly = [
      "function fetchUrl(url) {",
      "  logRequest(url);", // purely additive, nothing removed or changed
      "  return httpGet(url);",
      "}",
    ];
    expect(containmentRatio(staleVendor, sourceWithPureInsertOnly)).toBe(1);
  });

  it("does not false-positive when vendor and source are simply unrelated files", () => {
    const vendor = ["export function totallyDifferentLogic() {", "  return 42;", "}"];
    const source = ["export function somethingElseEntirely() {", "  return 'unrelated';", "}"];
    expect(containmentRatio(vendor, source)).toBeLessThan(0.5);
  });

  it("bodyLines strips rewired imports so THEY never count as drift", () => {
    const withRewiredImport = [
      "import type { FileEntry } from \"../snapshots/types.js\";",
      "export function real(): number { return 1; }",
    ];
    const withDifferentImport = [
      "import type { FileEntry } from \"./types.js\";",
      "export function real(): number { return 1; }",
    ];
    // Different import paths, but bodyLines() should reduce both to the same
    // single real line — proving import rewiring alone never trips this guard.
    expect(bodyLines(withRewiredImport.join("\n"))).toEqual(bodyLines(withDifferentImport.join("\n")));
  });
});
