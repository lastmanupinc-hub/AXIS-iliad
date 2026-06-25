import { describe, it, expect } from "vitest";
import { TOTAL_GENERATORS, TOTAL_PROGRAMS } from "@axis/generator-core";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// apps/api/src -> repo root
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// Strip JSX/HTML tags so SPLIT markup (`<div>19</div><div>Programs</div>` or a table row
// `Programs | 3 | 19 | 19 | 19`) collapses to adjacent visible text the regexes can see.
const visible = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function docs(): Array<{ name: string; text: string }> {
  const out = [{ name: "README.md", text: readFileSync(join(ROOT, "README.md"), "utf8") }];
  const webSrc = join(ROOT, "apps", "web", "src");
  for (const rel of readdirSync(webSrc, { recursive: true }) as unknown as string[]) {
    if (typeof rel === "string" && rel.endsWith(".tsx")) {
      out.push({ name: `apps/web/src/${rel.replace(/\\/g, "/")}`, text: readFileSync(join(webSrc, rel), "utf8") });
    }
  }
  return out;
}

// PROGRAM total claims, in any layout: forward ("20 [adj] programs", incl. a split stat
// card that tag-stripping turns into "20 Programs"), a tier table row ("Programs 3 20 20 20"),
// and reversed ("Programs (20)"). Interposed words are an ALLOWLIST of real adjectives so a
// distant number can't bind to "programs" (the table pattern needs 3+ cells, not prose).
// Legit partials (3 free, per-example "Pro 16") are < 17, so a >= 17 floor excludes them.
const PROG_ADJ = "(?:specialized|axis|public|separately|billable|free|pro|distinct|total)";
function programClaims(v: string): number[] {
  const ns: number[] = [];
  for (const m of v.matchAll(new RegExp(`(\\d+)\\s+(?:${PROG_ADJ}\\s+){0,3}programs?\\b`, "gi"))) ns.push(Number(m[1]));
  for (const m of v.matchAll(/\bprograms?\s+(\d+(?:\s+\d+){2,})\b/gi)) for (const x of m[1].split(/\s+/)) ns.push(Number(x));
  for (const m of v.matchAll(/\bprograms?\s*\((\d+)\)/gi)) ns.push(Number(m[1]));
  return ns.filter((n) => n >= 17);
}

// GENERATOR/ARTIFACT/OUTPUT totals (forward incl. tag-stripped stat cards, and reversed).
// Per-example subsets ("75 structured artifacts", a "Pro (…, 89 files)") are legitimate and
// < 95; the global total is 137; the stale globals were 99/102 — so a >= 95 floor isolates
// genuine global claims from example subsets. Interposed words are an allowlist of adjectives.
const GEN_ADJ = "(?:deterministic|structured|ai|context|generated|specialized|distinct|unique)";
function generatorClaims(v: string): number[] {
  const ns: number[] = [];
  for (const m of v.matchAll(new RegExp(`(\\d+)\\s*(?:\\+\\s*)?(?:${GEN_ADJ}\\s+){0,3}(?:generators?|artifacts?|outputs?)\\b`, "gi"))) ns.push(Number(m[1]));
  for (const m of v.matchAll(/\b(?:generators?|artifacts?|outputs?)\s*\((\d+)\)/gi)) ns.push(Number(m[1]));
  return ns.filter((n) => n >= 95);
}

describe("count honesty — docs/UI match the code (A4)", () => {
  it("every GLOBAL generator/artifact/output total equals TOTAL_GENERATORS (split-markup, reversed, table)", () => {
    const bad: string[] = [];
    for (const { name, text } of docs()) {
      for (const n of generatorClaims(visible(text))) if (n !== TOTAL_GENERATORS) bad.push(`${name}: ${n} (expected ${TOTAL_GENERATORS})`);
    }
    expect(bad).toEqual([]);
  });

  it("every GLOBAL program total equals TOTAL_PROGRAMS (split-markup, reversed, table)", () => {
    const bad: string[] = [];
    for (const { name, text } of docs()) {
      for (const n of programClaims(visible(text))) if (n !== TOTAL_PROGRAMS) bad.push(`${name}: ${n} (expected ${TOTAL_PROGRAMS})`);
    }
    expect(bad).toEqual([]);
  });
});
