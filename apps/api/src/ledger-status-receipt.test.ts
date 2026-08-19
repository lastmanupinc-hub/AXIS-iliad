// A candidate cannot be `open` while its own status line records that it shipped.
//
// WHY THIS EXISTS: ledger-honesty.test.ts already guards "no OPEN candidate
// names a generator the registry ships" — but that only fires when a candidate
// names its own program's output file. spoke_05 and app_31 both shipped, went
// live, and stayed `open`; neither named a qualifying file, so nothing caught
// it. Found by a code-derived audit on 2026-08-19, not by the suite.
//
// Note the DIRECTION of that drift: the ledger UNDERSTATED progress. Drift is
// usually assumed to flatter; this did the opposite, which makes the autonomy
// loop redo finished work. Both directions are bugs.
//
// SCOPE: only the completion_status line's own trailing comment, which is where
// this repo writes receipts. A first attempt scanned the whole candidate block
// and could not be shown to fire — a block quotes prior notes, other
// candidates' shas, and words like LIVE. A guard whose behaviour cannot be
// demonstrated is precisely what these files exist to prevent.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Status lines that say `open` AND carry a receipt-shaped trailing comment. */
export function contradictoryOpenLines(text: string): string[] {
  const bad: string[] = [];
  // CRLF, learned by red-testing against the real file: this repo checks out
  // with \r\n, so splitting on "\n" leaves a trailing \r and the `$` anchor
  // never matches. The LF-only unit sample passed happily while the real file
  // could never fire — green because it could not see anything.
  const normalized = text.split("\r").join("");
  for (const line of normalized.split("\n")) {
    const m = /completion_status:\s*open\s*#(.*)$/.exec(line);
    if (!m) continue;
    const note = m[1];
    const claimsDone = /\b(SHIPPED|BUILT|DEPLOYED|COMPLETE)\b/.test(note);
    const hasSha = /\b[0-9a-f]{7,40}\b/.test(note);
    if (claimsDone && hasSha) bad.push(note.trim().slice(0, 90));
  }
  return bad;
}

describe("ledger status vs receipt — one entry cannot claim both", () => {
  it("detects the contradiction (proves the matcher works before trusting it)", () => {
    const sample = [
      "        completion_status: open  # SHIPPED 2026-08-17 (80c05ce), all 21 live",
      "        completion_status: complete  # SHIPPED 2026-08-17 (80c05ce)",
      "        completion_status: open  # blocked on an owner decision",
      "        completion_status: open  # ships once the gate is green",
    ].join("\n");
    const hits = contradictoryOpenLines(sample);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("SHIPPED");
  });

  it("fires on CRLF text too — the bug that made the first version vacuous", () => {
    const crlf = "        completion_status: open  # SHIPPED 2026-08-17 (80c05ce)\r\n";
    expect(contradictoryOpenLines(crlf)).toHaveLength(1);
  });

  it("does not fire on prose without a commit sha", () => {
    // "COMPLETE" alone is a plan. A sha is what turns it into a claim that
    // work actually landed.
    expect(
      contradictoryOpenLines("        completion_status: open  # COMPLETE once spoke_06 lands"),
    ).toEqual([]);
  });

  it("begin.yaml has no candidate that is open AND shipped", () => {
    const text = readFileSync(join(ROOT, "begin.yaml"), "utf8");
    expect(
      (text.match(/completion_status:/g) ?? []).length,
      "begin.yaml read back with no completion_status lines — this guard would be vacuous",
    ).toBeGreaterThan(20);

    expect(
      contradictoryOpenLines(text),
      "A candidate is 'open' while its own status line records that it shipped (a completion verb " +
        "plus a commit sha). Flip the status, or remove the receipt if the work is unfinished.",
    ).toEqual([]);
  });
});
