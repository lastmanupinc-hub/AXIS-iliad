// ─── Shared count-claim extractors (infra_01_test_suite_cost, lever 2) ─────
//
// ONE implementation of "find every GLOBAL count claim in this text", used by
// every honesty guard. Previously each guard carried its own copy:
// count-honesty.test.ts (README + web UI), launch-claims.test.ts (launch
// corpus), strategic-docs-honesty.test.ts (begin.yaml + CONTRIBUTING), and
// counts-consistency.test.ts (package.json descriptions) — four near-identical
// PROG_ADJ/GEN_ADJ regex sets that could drift apart silently, and two of which
// were materially weaker than count-honesty's.
//
// What is NOT consolidated, deliberately: the CORPORA stay separate. SPEC-12
// scoped count-honesty to README/web and launch-claims to the launch corpus on
// purpose, and that separation is preserved — only the extraction logic is
// shared. See count-surface-coverage.test.ts for the guard that every
// count-bearing file belongs to at least one corpus, which is the gap that let
// the 142->143 bump be applied to eight files and still miss one.
//
// Every subtlety below encodes a real past miss; the inline notes name them.

/**
 * Strip JSX/HTML tags so SPLIT markup (`<div>19</div><div>Programs</div>`, or a
 * table row `Programs | 3 | 19 | 19 | 19`) collapses to adjacent visible text
 * the regexes can actually see.
 */
export const visible = (s: string): string => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/**
 * visible()'s tag-stripper is built for JSX TEXT NODES (content between tags).
 * Fed a self-closing `<meta ... content="140 Artifacts" />` it matches the whole
 * tag as `<[^>]+>` and erases the attribute value along with the markup, so a
 * stale og:title/twitter:title count would be invisible to every check. Pull
 * meta content="..." values out as bare text first. (JSON-LD <script> text
 * already survives visible() unchanged, since it sits between tags, not inside
 * one.) R1.1: a stale "140 Artifacts" sat in this surface for weeks unguarded.
 */
export function htmlWithMetaContent(html: string): string {
  const metaContents = [...html.matchAll(/<meta[^>]+content="([^"]*)"/gi)].map((m) => m[1]);
  return `${html}\n${metaContents.join("\n")}`;
}

// PROGRAM totals, in any layout: forward ("20 [adj] programs", including a split
// stat card that tag-stripping turns into "20 Programs"), a tier-table row
// ("Programs 3 20 20 20"), and reversed ("Programs (20)"). Interposed words are
// an ALLOWLIST of real adjectives so a distant number cannot bind to "programs"
// (the table pattern needs 3+ cells, not prose). Legit partials are the 3
// free-tier programs, the 17-program Pro tier, and a per-example "Pro (17
// programs)" — all < 18. Stale GLOBAL totals were 18/19, so a >= 18 floor
// isolates a wrong global total from legitimate tier/example counts.
const PROG_ADJ = "(?:specialized|axis|public|separately|billable|free|pro|distinct|total|additional)";
const PROGRAM_FLOOR = 18;

export function programClaims(v: string): number[] {
  const ns: number[] = [];
  for (const m of v.matchAll(new RegExp(`(\\d+)\\s+(?:${PROG_ADJ}\\s+){0,3}programs?\\b`, "gi"))) ns.push(Number(m[1]));
  for (const m of v.matchAll(/\bprograms?\s+(\d+(?:\s+\d+){2,})\b/gi)) for (const x of m[1].split(/\s+/)) ns.push(Number(x));
  for (const m of v.matchAll(/\bprograms?\s*\((\d+)\)/gi)) ns.push(Number(m[1]));
  return ns.filter((n) => n >= PROGRAM_FLOOR);
}

// GENERATOR/ARTIFACT/OUTPUT totals (forward including tag-stripped stat cards,
// and reversed). Per-example subsets ("75 structured artifacts", "Pro (…, 89
// files)") are legitimate and < 95; stale globals were 99/102 — so a >= 95 floor
// isolates genuine global claims from example subsets.
const GEN_ADJ = "(?:deterministic|structured|ai|context|generated|specialized|distinct|unique)";
const GENERATOR_FLOOR = 95;

export function generatorClaims(v: string): number[] {
  const ns: number[] = [];
  for (const m of v.matchAll(
    new RegExp(`(\\d+)\\s*(?:\\+\\s*)?(?:${GEN_ADJ}\\s+){0,3}(?:generators?|artifacts?|outputs?)\\b`, "gi"),
  ))
    ns.push(Number(m[1]));
  for (const m of v.matchAll(/\b(?:generators?|artifacts?|outputs?)\s*\((\d+)\)/gi)) ns.push(Number(m[1]));
  return ns.filter((n) => n >= GENERATOR_FLOOR);
}

/**
 * Advertised MCP tool count ("29 MCP tools" / "29 public tools"). The
 * (MCP|public) qualifier is REQUIRED so this never binds to prose like "your AI
 * tools" or a named "Free MCP tools:" list with no leading number. Stale value
 * was 14. No floor: the qualifier alone is specific enough.
 */
export function toolClaims(v: string): number[] {
  const ns: number[] = [];
  for (const m of v.matchAll(/(\d+)\s+(?:MCP|public)\s+tools\b/gi)) ns.push(Number(m[1]));
  return ns;
}

// Advertised HTTP endpoint count ("143 endpoints" / "143 REST endpoints").
// A >= 50 floor isolates a GLOBAL API-surface claim from a small per-example
// count. Stale values were 102 (README) and 110 (QAPage).
const ENDPOINT_FLOOR = 50;

export function endpointClaims(v: string): number[] {
  const ns: number[] = [];
  for (const m of v.matchAll(/(\d+)\+?\s*(?:REST |API |HTTP )?endpoints?\b/gi)) ns.push(Number(m[1]));
  return ns.filter((n) => n >= ENDPOINT_FLOOR);
}

/** True if the text makes ANY global count claim — used by the coverage guard. */
export function hasAnyCountClaim(text: string): boolean {
  const v = visible(text);
  return (
    programClaims(v).length > 0 ||
    generatorClaims(v).length > 0 ||
    toolClaims(v).length > 0 ||
    endpointClaims(v).length > 0
  );
}
