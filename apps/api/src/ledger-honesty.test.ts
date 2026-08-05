// ─── Ledger honesty (ops_01_ledger_reconciliation) ─────────────────────────
//
// The count guards (count-honesty, counts-consistency, launch-claims,
// strategic-docs-honesty, count-surface-coverage) all answer one question:
// "does this document state a NUMBER that disagrees with the code?"
//
// None of them answers the question that actually bit us: "does this document
// state a STATUS that disagrees with the code?" On 2026-08-05 begin.yaml said
// app_30_seo_applies was `open` while its deliverable had shipped in 57edf62
// with CI green, and nothing caught it — a ledger can be wrong about what is
// DONE just as easily as about how many things exist.
//
// This closes that class for the checkable subset. Deliberately narrow: it
// only asserts things derivable from code, because a guard that guesses is how
// you get a green suite over a false claim.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { listAvailableGenerators } from "@axis/generator-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Cheap targeted reader — begin.yaml is huge and we only need id -> status. */
function candidateStatuses(): Array<{ id: string; status: string; block: string }> {
  const text = readFileSync(join(ROOT, "begin.yaml"), "utf8");
  const out: Array<{ id: string; status: string; block: string }> = [];
  const re = /^\s*- id: "([^"]+)"$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const next = text.indexOf('- id: "', start + 10);
    const block = text.slice(start, next === -1 ? text.length : next);
    const status = /completion_status:\s*(\w+)/.exec(block)?.[1] ?? "";
    if (status) out.push({ id: m[1], status, block });
  }
  return out;
}

describe("ledger honesty — begin.yaml status matches the code", () => {
  it("parses a meaningful number of candidates (guards against the regex silently matching nothing)", () => {
    // A guard that reads zero rows passes every assertion below while checking
    // nothing. This floor makes that failure loud.
    expect(candidateStatuses().length).toBeGreaterThan(20);
  });

  it("every candidate marked complete carries a receipt", () => {
    // "complete" with no evidence is indistinguishable from "someone edited a
    // field". The loop's own convention is an inline SCOPED/DONE note; several
    // also cite a commit. Require at least one.
    const bad = candidateStatuses()
      .filter((c) => c.status === "complete")
      // Accepted receipt markers. RECONCILED is the ops_01 backfill marker for
      // entries completed before the receipt convention existed — it records
      // what was verified and, importantly, at what confidence.
      .filter((c) => !/(SCOPED|RECONCILED|VERIFIED|DONE|CANCELLED|commit|CI green|shipped)/i.test(c.block))
      .map((c) => c.id);
    expect(bad, "candidates marked complete with no receipt in their entry").toEqual([]);
  });

  it("no OPEN candidate names a generator that the registry already ships", () => {
    // This is the exact app_30 failure, generalized: a candidate whose whole
    // deliverable is a generator output path cannot still be "open" once that
    // path is live in the registry. Only candidates that NAME a concrete
    // output file are checkable, so only those are checked.
    // listAvailableGenerators() returns {path, program} OBJECTS, not strings.
    // A first version did `new Set(listAvailableGenerators())` and then asked
    // `shipped.has(somePathString)` — always false, so the assertion could
    // never fire. It passed for the same reason the attestation step passed:
    // it checked something adjacent to the truth instead of the truth. Caught
    // only by red-testing; see the .map() and the floor assertion below.
    const byPath = new Map(listAvailableGenerators().map((g) => [g.path, g.program]));
    expect(byPath.size, "generator registry read back empty — the check below would be vacuous").toBeGreaterThan(100);

    const bad: string[] = [];
    for (const c of candidateStatuses()) {
      if (c.status !== "open") continue;
      // A candidate's OWN program, from its source file
      // (…/generators-<program>.ts). Without this the check over-fires: app_44
      // (algorithmic) merely MENTIONS AGENTS.md, which the skills program owns,
      // and a naive match called that "already shipped". Mentioning a file is
      // not claiming to deliver it — only a path owned by the candidate's own
      // program is evidence its deliverable already exists.
      const own = /generators-([a-z0-9-]+)\.ts/.exec(c.block)?.[1];
      if (!own) continue;
      for (const m of c.block.matchAll(/\b([a-z0-9-]+\.(?:md|json|yaml|yml|d2|html))\b/gi)) {
        const path = m[1];
        if (byPath.get(path) === own) {
          bad.push(`${c.id}: is 'open' but '${path}' (program '${own}') already ships in the registry`);
        }
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it("V1_LAUNCH_TODO.md declares whether it has been reconciled, and when", () => {
    // The failure this file had was not being WRONG — it was being unmaintained
    // while looking authoritative: 55 unchecked boxes, zero ever ticked, no
    // statement anywhere that it had stopped tracking reality. Any long-lived
    // checklist must say when it was last checked against code, so a reader can
    // weigh it. This does not police the item count; it polices the disclosure.
    const text = readFileSync(join(ROOT, "V1_LAUNCH_TODO.md"), "utf8");
    expect(text, "V1_LAUNCH_TODO.md must carry a RECONCILED marker with a date").toMatch(
      /RECONCILED\s+\d{4}-\d{2}-\d{2}/,
    );
  });

  it("continuation.yaml is parseable enough to read its own identity", () => {
    // It was NOT valid YAML for months (three defects, incl. descriptions of
    // mojibake whose bytes contain a literal quote that closed the scalar).
    // Nothing could load it, so nothing could notice it had gone stale. A
    // ledger no tool can read is not a ledger.
    const text = readFileSync(join(ROOT, "continuation.yaml"), "utf8");
    const date = /^\s*date:\s*"(\d{4}-\d{2}-\d{2})"/m.exec(text)?.[1];
    expect(date, "continuation.yaml must expose a current_identity date").toBeTruthy();
    // The em-dash mojibake sequence ends in a raw quote; inside a double-quoted
    // scalar it breaks the file. Catch a reintroduction at the byte level.
    // The escaped form puts a backslash BETWEEN the euro sign and the quote, so
    // it does not contain the unescaped sequence as a substring — counting the
    // unescaped bytes directly is the whole check. (Subtracting the escaped
    // count, as a first version did, yields a negative number and fails on a
    // clean file.)
    const moji = Buffer.from([0xc3, 0xa2, 0xe2, 0x82, 0xac, 0x22]).toString("utf8");
    const unescaped = text.split(moji).length - 1;
    expect(unescaped, "unescaped mojibake-quote in continuation.yaml would break YAML parsing").toBe(0);
  });
});
