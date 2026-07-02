# SPEC-10 — Remediation of the WO-08/09 tail-review findings

**Origin:** a 17-agent adversarial review of the program tail (PRs #119–#120,
2026-07-01) confirmed 5 findings (3 medium, 2 low; 1 refuted). A re-grounding
pass at merged main HEAD (12fef79, 2026-07-02) re-confirmed all five and
surfaced one additional CRITICAL instance of the same class (marker injection,
Fix 3a below). Three of the five are planning-spec-rooted (SPEC-07/08/09
misses) — the fixes below are decisions, not suggestions. The re-grounding
also verified the #109+#121 merge introduced no interactions at these sites
(memory-weave.ts and fleet-report.ts are byte-identical to their WO-08/09
versions).

## Read first
`packages/generator-core/src/memory-weave.ts` (whole file — small),
`packages/generator-core/src/autonomy-loop.ts:227-260` (continueFooter + the
begin.yaml idempotence guard), `packages/generator-core/src/fleet-report.ts:80-150`
(table row, computeShared joins, fleet-CLAUDE.md decisions),
`apps/api/src/fleet-handlers.ts` (whole file — small),
`packages/generator-core/src/delta-report.ts:255-265` + `program-funnel.ts:105-115`
(the H1 interpolations), `apps/api/src/export.test.ts:585-592` (the existing
stale-weave test this WO extends).

## Fix 0 — shared inline-markdown sanitizer (foundation for Fixes 3/4)

New module `packages/generator-core/src/md-sanitize.ts`:

```ts
/**
 * Collapse a user/DB-sourced string for safe interpolation into markdown
 * INLINE contexts (table cells, headings, list items). Pure + deterministic.
 *  - all whitespace runs (incl. CR/LF) → single space
 *  - `|` → `\|`               (GFM table-cell safe; renders as a literal pipe elsewhere)
 *  - `<!--` → `<! --`, `-->` → `-- >`  (breaks HTML-comment delimiters so content can
 *    never smuggle structural markers — e.g. the memory-weave delimiters — into output)
 *  - trimmed
 */
export function mdInline(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/<!--/g, "<! --")
    .replace(/-->/g, "-- >")
    .trim();
}
```

Export from `packages/generator-core/src/index.ts`. Identity on clean
single-line strings (modulo multi-space runs), so existing fixtures with clean
content stay byte-identical. New `md-sanitize.test.ts` covers each transform +
determinism (same input twice ⇒ same bytes) + identity on a clean name.

## Fix 1 — legacy undelimited weave migration (F1, MEDIUM)

WO-07-era code appended the memory section to AGENTS.md/CLAUDE.md with NO
delimiters; WO-08's `injectOrReplaceSection` (memory-weave.ts:83-91) only
recognizes the `<!-- axis:project-memory:start/end -->` pair, so a package
persisted between the two duplicates the section on every later weave (fresh
delimited copy appended, stale undelimited copy permanent). project-memory.md
self-heals (wholesale replace); only AGENTS.md/CLAUDE.md are affected.

In `memory-weave.ts`:
- Hoist the heading into a module constant used by `renderSectionLines`:
  `const SECTION_HEADING = "## Decisions already made — do not re-litigate";`
  with a comment that this exact string doubles as the LEGACY migration marker
  for pre-delimiter weaves — if the live heading is ever reworded, the old
  string must stay recognized. Emitted bytes must not change (determinism).
- In `injectOrReplaceSection`, between the marker branch and the append
  fallback, add the legacy branch: `headingIdx = content.indexOf(SECTION_HEADING)`;
  if found, the legacy section ends at the next H1/H2 after it
  (`/^##? /m` on `content.slice(headingIdx + SECTION_HEADING.length)` — H3
  subheadings like `### Decisions` deliberately do NOT terminate the scan) or
  `content.length`; return
  `content.slice(0, headingIdx) + block + content.slice(legacyEnd)`.
  One-pass migration to the delimited form; the marker branch handles all
  future refreshes.

Tests (extend `memory-weave.test.ts`): (1) legacy weave at EOF → exactly one
heading, old entry gone, new entry present, both markers now exist; (2) legacy
section mid-file followed by `## Later Section` → replacement stops at the H2,
trailing content preserved verbatim; (3) legacy body with `### Decisions`/
`### Conventions` subheadings → H3s don't terminate the scan, no orphaned
fragments; (4) migration idempotence — legacy→delimited once, then refresh with
different entries via the marker branch, still one heading + one marker pair;
(5) existing delimited-refresh and fresh-append tests unchanged.
Extend `apps/api/src/export.test.ts` with the end-to-end case mirroring the
existing stale-weave test (:585-592): persist a package whose AGENTS.md carries
a hand-built legacy undelimited section, add a fresh memory entry, export ⇒
exactly one delimited section with the fresh entry, stale one gone.

## Fix 2 — preserve the ⟳ Continue footer across project-memory.md refresh (F2, MEDIUM)

At MCP time `appendAutonomyLoop` appends a ⟳ footer to project-memory.md and
the package persists with begin.yaml. At export, `appendMemoryWeave`'s refresh
does a wholesale `existing.content = content` (memory-weave.ts:135), stripping
the footer; `appendAutonomyLoop` then no-ops package-wide (begin.yaml present,
autonomy-loop.ts:257) so it is never restored — project-memory.md drops out of
the begin-loop chain.

**Decision: preserve the footer at the refresh site; do NOT touch the
begin.yaml idempotence guard** (re-running footer weaving would re-derive the
whole sequence and risks double-footering every other artifact).

- `autonomy-loop.ts`: extract the footer's stable prefix into an exported
  constant and use it in `continueFooter` — output must stay byte-identical:
  `export const CONTINUE_FOOTER_MARKER = "\n\n---\n\n## ⟳ Continue the loop\n";`
- `memory-weave.ts`: import it (no cycle — autonomy-loop does not import
  memory-weave) and change the refresh branch to:
  ```ts
  if (existing) {
    const footerIdx = existing.content.lastIndexOf(CONTINUE_FOOTER_MARKER);
    existing.content = footerIdx === -1 ? content : content + existing.content.slice(footerIdx);
  }
  ```
  `lastIndexOf` so a memory entry quoting the marker text can't truncate the
  carry-over. Preserving verbatim is correct: the file's position in the
  sequence is unchanged by a refresh.

Tests: (1) `memory-weave.test.ts` — weave → real `appendAutonomyLoop` → weave
with different entries ⇒ new content present, old gone, footer appears exactly
once at EOF; (2) full MCP→export round-trip (weave→loop→weave→loop-noop) ⇒
entries2 + exactly one footer, no artifact double-footered; (3) refresh with no
footer is a pure replace (regression); (4) `autonomy-loop.test.ts` — every
footered artifact's footer starts with the exported constant (locks producer
and marker together).

## Fix 3 — sanitize memory content/source at render (F3 + sweep, MEDIUM→HIGH)

Memory `content`/`source` are length-only validated (4000/500), so newlines
and markdown inject structure into agent-read files. The re-grounding sweep
found the worst case (**3a, treat as the headline of this fix**): content
containing the literal `<!-- axis:project-memory:end -->` causes the NEXT
weave's `indexOf(MEMORY_MARKER_END)` to match INSIDE the block — the replace
orphans the tail of the old section and strands a stray real end-marker,
**permanent structural corruption that compounds on every refresh**. `mdInline`'s
comment-breaking transform closes this by construction.

- `memory-weave.ts` `renderEntryLine`:
  `return `- ${mdInline(e.content)} _(${mdInline(meta)})_`;`
  (meta covers `source` — the sweep's second instance — and `created_at`,
  which is ISO and passes through unchanged).
- `fleet-report.ts` line 147: `for (const d of p.memory_decisions) lines.push(`- ${mdInline(d)}`);`
- **No render-side truncation** (content is already write-capped at 4000; a
  second cap would be new policy, not a fix). **fleet-report.md needs no
  change** (it never renders memory_decisions — verified).

Tests: (1) `memory-weave.test.ts` — entry whose content embeds BOTH marker
strings; weave twice over the same CLAUDE.md ⇒ exactly one start+end marker
pair and byte-stable second weave (the 3a corruption case); (2) multiline
markdown-bearing content renders as one collapsed bullet, no injected headings
in AGENTS.md/CLAUDE.md/project-memory.md; (3) multi-line `source` can't break
the list item; (4) `fleet-report.test.ts` — decision `"real\n## Injected\n- fake"`
⇒ single collapsed bullet in fleet-CLAUDE.md, no `## Injected` line of its own.

## Fix 4 — sanitize project_name in fleet renders (F4, LOW)

`project_name` is type/length-validated only; a `|` splits the fleet-report.md
table row (fleet-report.ts:85), a newline demotes the fleet-CLAUDE.md `### `
heading (:146) and breaks the computeShared joins (:37,95,100,108).

**Decision: sanitize once at the entry point, not per render site.** In
`buildFleetReport` (fleet-report.ts:166), map before sorting:
```ts
const sorted = projects
  .map((p) => ({ ...p, project_name: mdInline(p.project_name) }))
  .sort((a, b) => a.project_name.localeCompare(b.project_name));
```
This covers every downstream site in both files. Do NOT sanitize at the store
(project_name is a uniqueness key — pg-schema unique indexes; mutating at write
time would break re-analysis identity). The REST response and trackEvent
payloads keep raw names (JSON needs no markdown escaping).

Tests (`fleet-report.test.ts`): (1) `evil|name` ⇒ every table data row still
splits into exactly 5 cells and contains `evil\|name`; (2) `line1\nline2` ⇒
single-line `### line1 line2` heading, no bare `line2` line in either file;
(3) shared-framework join renders the sanitized name; (4) determinism —
reversed input order ⇒ byte-identical files.

## Fix 4b — same-class H1 interpolations in the program's own artifacts (LOW)

The re-grounding sweep found the identical vector in two WO-01/WO-03 files:
`delta-report.ts:260` (`# Delta Report — ${name}`) and `program-funnel.ts:110`
(`# Recommended Next Programs — ${name}`, plus `**${name}**` at :112) — `name`
is user-suppliable via the MCP `project_name` arg (length-only validated). Wrap
all three interpolations in `mdInline(...)`. One test each (extend
`delta-report.test.ts` / `program-funnel.test.ts`): a `line1\nline2` name
renders a single-line H1 and injects no extra lines; clean-name output is
byte-identical to before (determinism regression).

## Fix 5 — bound the fleet scan (F5, LOW)

The 25 cap (fleet-handlers.ts:47) bounds ELIGIBLE projects, not projects
SCANNED; `listProjectsByAccount` has no LIMIT and `resolveLatestContext`
(:23-30) walks EVERY snapshot of each context-less project ⇒ O(projects ×
snapshots) DB round-trips per request, and the router's 408 (router.ts:270)
doesn't stop the loop — it keeps churning a dead response.

All in `apps/api/src/fleet-handlers.ts`:
1. `export const FLEET_SCAN_LIMIT = 100; // bound total projects examined — the eligible cap alone lets context-less projects force a full-account walk`
2. Line 46 → `for (const proj of projectRows.slice(0, FLEET_SCAN_LIMIT)) {`
   (rows are already name-ordered; keep the inner eligible-cap break).
3. First statement in the loop body:
   `if (res.writableEnded) return; // 408 already sent — stop burning DB round-trips`
4. In `resolveLatestContext`: `const FLEET_MAX_SNAPSHOTS_PER_PROJECT = 10;`
   and start the walk at
   `i >= Math.max(0, snapshots.length - FLEET_MAX_SNAPSHOTS_PER_PROJECT)`.
   Worst case per request is now FLEET_SCAN_LIMIT × (1 + 10) round-trips.
5. Update `docs/agentic-asset/specs/SPEC-09-fleet-report.md` step 3 wording:
   FLEET_MAX_PROJECTS caps eligible projects COLLECTED; FLEET_SCAN_LIMIT caps
   projects EXAMINED (this spec supersedes the ambiguous "stop after
   FLEET_MAX_PROJECTS" phrasing).

Tests (`fleet-handlers.test.ts`): (1) scan bound — seed FLEET_SCAN_LIMIT
context-less projects (snapshot-created, no context map saved — cheapest path)
named to sort BEFORE two analyzed projects ⇒ 200 `ready:false`,
`eligible_projects: 0`, `project_count = FLEET_SCAN_LIMIT + 2`; (2) existing
ready-path regression unchanged; (3) dead-response abort — stubbed
`writableEnded: true` response ⇒ handler resolves without calling
writeHead/end; (4) snapshot-walk bound — a project whose only context map sits
deeper than 10 snapshots from the newest is ineligible; (5) constant sanity —
`FLEET_SCAN_LIMIT >= FLEET_MAX_PROJECTS`.

## Explicitly NOT fixed (recorded verdicts — do not "improve")
- **Legacy generators family**: `id.name` interpolated into tables/headings in
  generators-algorithmic.ts:378, generators-artifacts.ts:536,
  generators-debug.ts:402, generators-marketing.ts:758/777,
  generators-obsidian.ts:538, generators-canvas.ts:645, generators-seo.ts:756.
  Pre-dates the program; `mdInline` is exported precisely so these adopt
  incrementally in future work. Do not touch them in WO-10.
- **F2 sibling gap**: markdown artifacts newly added at export over a stored
  package (delta-report.md, recommended-next-programs.md) get NO footer because
  of the same begin.yaml no-op. Separate finding for a future spec; WO-10
  deliberately does not change appendAutonomyLoop's idempotence guard.
- **computeShared warning strings** (fleet-report.ts:108): repo-derived, not
  user free-text; F4's entry-point mapping sanitizes the project-name lists it
  renders, which is enough.
- **Sorting on sanitized names** (Fix 4) is an accepted, deterministic
  behavior change; **scan/snapshot bounds** (Fix 5) are accepted graceful
  degradations for pathological portfolio shapes.

## Estimate & guards
~550 changed lines, majority tests. Packages: generator-core (md-sanitize.ts
NEW, memory-weave.ts, autonomy-loop.ts, fleet-report.ts, delta-report.ts +
program-funnel.ts one-line H1 fixes via mdInline, index.ts exports) and api
(fleet-handlers.ts) + their tests + export.test.ts + SPEC-09 wording. No
migration, no new dependencies, no forbidden zones (fleet-handlers' requireAuth
line is untouched). Byte-identical output for clean inputs everywhere —
determinism.test.ts must pass unchanged. Rebuild generator-core
(`pnpm --filter @axis/generator-core build`) before the api typecheck
(the WO-06 dist finding). Branch from `main` (the governance corpus now lives
on main — the WO-01..09 base-branch note is obsolete).
