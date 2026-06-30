import { describe, it, expect } from "vitest";
import { TOTAL_GENERATORS, TOTAL_PROGRAMS } from "@axis/generator-core";
import { MCP_TOOL_COUNT, ENDPOINT_COUNT } from "./counts.js";
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
// Legit partial counts are the 3 free-tier programs, the 17-program Pro tier (20 − 3 free),
// and a per-example "Pro (16 programs)" — all < 18. The stale GLOBAL totals were 18/19, so a
// >= 18 floor isolates a wrong global total from those legitimate tier/example counts.
const PROG_ADJ = "(?:specialized|axis|public|separately|billable|free|pro|distinct|total|additional)";
function programClaims(v: string): number[] {
  const ns: number[] = [];
  for (const m of v.matchAll(new RegExp(`(\\d+)\\s+(?:${PROG_ADJ}\\s+){0,3}programs?\\b`, "gi"))) ns.push(Number(m[1]));
  for (const m of v.matchAll(/\bprograms?\s+(\d+(?:\s+\d+){2,})\b/gi)) for (const x of m[1].split(/\s+/)) ns.push(Number(x));
  for (const m of v.matchAll(/\bprograms?\s*\((\d+)\)/gi)) ns.push(Number(m[1]));
  return ns.filter((n) => n >= 18);
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

// Advertised MCP tool count, e.g. "29 MCP tools" / "29 public tools". The qualifier
// (MCP|public) is required so this never binds to prose like "your AI tools" or the
// named "Free MCP tools:" list (no leading number). The live count is MCP_TOOL_COUNT,
// itself pinned == MCP_TOOLS.length by counts-consistency.test.ts. Stale value was 14.
function toolClaims(v: string): number[] {
  const ns: number[] = [];
  for (const m of v.matchAll(/(\d+)\s+(?:MCP|public)\s+tools\b/gi)) ns.push(Number(m[1]));
  return ns;
}

// Advertised HTTP endpoint count, e.g. "143 endpoints" / "143 REST endpoints". The live
// value is ENDPOINT_COUNT (pinned in counts.ts, guarded by counts-consistency.test.ts).
// A >= 50 floor isolates a GLOBAL API-surface claim from any small per-example count.
// Stale values were 102 (README) and 110 (QAPage).
function endpointClaims(v: string): number[] {
  const ns: number[] = [];
  for (const m of v.matchAll(/(\d+)\+?\s*(?:REST |API |HTTP )?endpoints?\b/gi)) ns.push(Number(m[1]));
  return ns.filter((n) => n >= 50);
}

describe("count honesty — docs/UI match the code (A4)", () => {
  it("every advertised MCP/public tool count equals MCP_TOOL_COUNT", () => {
    const bad: string[] = [];
    for (const { name, text } of docs()) {
      for (const n of toolClaims(visible(text))) if (n !== MCP_TOOL_COUNT) bad.push(`${name}: ${n} (expected ${MCP_TOOL_COUNT})`);
    }
    expect(bad).toEqual([]);
  });

  it("every advertised endpoint count equals ENDPOINT_COUNT", () => {
    const bad: string[] = [];
    for (const { name, text } of docs()) {
      for (const n of endpointClaims(visible(text))) if (n !== ENDPOINT_COUNT) bad.push(`${name}: ${n} (expected ${ENDPOINT_COUNT})`);
    }
    expect(bad).toEqual([]);
  });

  // The data layer migrated SQLite → Neon Postgres (see NEON_MIGRATION_PLAN.md); the
  // better-sqlite3 dep was removed in A7. Any SQLite/better-sqlite3/FTS5 in user-facing
  // docs is now a falsehood about the architecture. Guard README + the web UI against it.
  it("no stale SQLite/better-sqlite3/FTS5 data-layer claims (the store is Neon Postgres)", () => {
    const bad: string[] = [];
    for (const { name, text } of docs()) {
      for (const m of text.matchAll(/\b(?:SQLite|better-sqlite3|FTS5)\b/gi)) bad.push(`${name}: "${m[0]}"`);
    }
    expect(bad).toEqual([]);
  });

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
