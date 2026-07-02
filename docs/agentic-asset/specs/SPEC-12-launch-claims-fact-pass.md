# SPEC-12 — Launch-claims fact-pass (LAUNCH_CLAIMS.yaml + gate + copy rewrite)

**Origin:** NO_FATE_ROLLOUT Workstream D / §10 — the launch copy must be
fact-passed before anything ships ("the honesty spine IS the brand"). The
current launch corpus is badly stale: `launch-content.md` claims 102 artifacts
(live: 140), 18 programs (live: 20), "SQLite persistence" (live: Neon
Postgres), "4,000+ tests (99.99% coverage)" (README badge: 4900+/91.5%),
"$29/month for all programs" (live tiers: Starter $29 / Pro $99 / Growth $299),
and "now open source" (the license badge says private). `marketing-pack.md`
repeats the same family (102/87/18, "Pro tier 18 programs"). The count-honesty
gate deliberately scans only README + apps/web — the launch corpus has NO
guard. This order gives launch claims one registry, one gate, and one
fact-passed rewrite.

## Read first
`apps/api/src/counts.ts` (the four canonical counts + API_VERSION),
`apps/api/src/count-honesty.test.ts` (the extractor-with-floor idiom this gate
reuses — floors isolate GLOBAL claims from legitimate small per-example
numbers), `packages/snapshots/src/funnel-types.ts:114-150` (PLAN_CATALOG — the
pricing source of truth), `launch-content.md` + `marketing-pack.md` (the
corpus), `README.md:7-8` (tests/coverage badges).

## Deliverable 1 — `LAUNCH_CLAIMS.yaml` (repo root): the claim registry

One entry per publishable factual claim:

```yaml
# LAUNCH_CLAIMS.yaml — the single registry of publishable launch claims.
# A claim may appear in launch copy ONLY if it is here with status: verified.
# launch-claims.test.ts enforces the counts-backed entries against the live
# constants; command-backed entries carry the regeneration command and MUST be
# re-run (and verified_at bumped) before any publish.
claims:
  - id: artifact_count
    text: "140 artifacts per analysis"
    value: 140
    source: "apps/api/src/counts.ts ARTIFACT_COUNT (derived from the generator REGISTRY)"
    status: verified
  - id: program_count
    text: "20 specialized programs"
    value: 20
    source: "apps/api/src/counts.ts PROGRAM_COUNT"
    status: verified
  - id: endpoint_count
    text: "148 REST endpoints"
    value: 148
    source: "apps/api/src/counts.ts ENDPOINT_COUNT (guarded by counts-consistency.test.ts)"
    status: verified
  - id: mcp_tool_count
    text: "29 MCP tools"
    value: 29
    source: "apps/api/src/counts.ts MCP_TOOL_COUNT"
    status: verified
  - id: persistence
    text: "Neon Postgres persistence"
    value: "Neon Postgres"
    source: "packages/snapshots (pg data layer); NEVER say SQLite"
    status: verified
  - id: pricing
    text: "Free / Starter $29 / Pro $99 / Growth $299 per month"
    value: { starter_cents: 2900, pro_cents: 9900, growth_cents: 29900 }
    source: "packages/snapshots/src/funnel-types.ts PLAN_CATALOG"
    status: verified
  - id: free_programs
    text: "3 programs free (Search, Skills, Debug)"
    value: 3
    source: "TIER_LIMITS / entitlements"
    status: verified
  - id: test_count
    text: "4,900+ automated tests"
    value: "regenerate"
    source: "npx vitest run --reporter=dot 2>&1 | tail -5 — refresh + bump verified_at before publish"
    status: needs_regeneration_before_publish
  - id: coverage
    text: "91.5% coverage"
    value: "regenerate"
    source: "vitest --coverage summary — refresh + bump verified_at before publish"
    status: needs_regeneration_before_publish
  - id: open_source
    text: "open source"
    value: false
    source: "LICENSE is private (README badge). OWNER DECISION — do not claim until the owner opens the repo"
    status: forbidden_until_owner_decision
  - id: session_count
    text: "N development sessions"
    value: "regenerate"
    source: "continuation.yaml session ledger (latest session_result_N)"
    status: needs_regeneration_before_publish
```

Exact schema latitude is the executor's (keep it flat + greppable); the
ENTRIES above are decisions — values, sources, and statuses as written
(executor re-verifies each against its source at execution time and corrects
any that have moved).

## Deliverable 2 — `apps/api/src/launch-claims.test.ts`: the gate

New test file, same family as count-honesty (pure fs + constants, no DB):

1. **Registry-vs-live**: parse LAUNCH_CLAIMS.yaml; for the counts-backed
   entries assert value === the imported constant (ARTIFACT_COUNT,
   PROGRAM_COUNT, ENDPOINT_COUNT, MCP_TOOL_COUNT); for pricing assert the
   cents values === PLAN_CATALOG's.
2. **Corpus-vs-registry**: corpus = `launch-content.md`, `marketing-pack.md`,
   `AXIS_Board_Pitch.md`. Reuse count-honesty's extractor-with-floor idiom
   (duplicate the small regexes into this file; count-honesty stays
   README/web-scoped): artifact claims ≥ 95 must equal ARTIFACT_COUNT;
   program claims ≥ 15 must equal PROGRAM_COUNT; endpoint claims ≥ 50 must
   equal ENDPOINT_COUNT.
3. **Forbidden strings** in the corpus: `SQLite` (case-insensitive; the stack
   is Neon), and `open source` / `open-source` / `open sourced` while the
   registry's open_source claim has value false (the check reads the registry,
   so flipping the registry after the owner's license decision un-forbids it
   without touching the test).
4. **Registry hygiene**: every claim has id/text/value/source/status; no
   status outside the enum; duplicate ids fail.

## Deliverable 3 — fact-pass rewrite of the corpus

Rewrite `launch-content.md` and `marketing-pack.md` values from the registry —
voice and structure PRESERVED, numbers and facts corrected:
- 102/86/87 artifacts → 140; 18 programs → 20; "11 more programs" → 14.
- "SQLite persistence with full-text search" → "Neon Postgres persistence
  with full-text search".
- Pricing: "$29/month for all programs" framing → the three-tier truth
  (Starter $29 / Pro $99 / Growth $299; free tier = Search/Skills/Debug).
  marketing-pack's "Pro tier (18 programs, 87 generators)" table rows get the
  same correction.
- "4,000+ tests (99.99% coverage)" → the regenerated real numbers (run the
  suite, use the actual totals; if not regenerating in this WO, use the README
  badge values 4,900+/91.5% and note they share a source).
- "now open source" / "I open-sourced" → REMOVE or rephrase to "now public"
  pending the owner's license decision (the gate forbids the phrase).
- "97 sessions" → the current ledger count (continuation.yaml).
- AXIS_Board_Pitch.md: numbers-only pass (artifacts/programs/endpoints/tests);
  no prose rewrite.

## Explicitly NOT in scope
- The estate-wide fact-pass (odyssey posting pipeline, NO_FATE_* docs,
  Foundry/PAI'D copy) — this order covers the ILIAD repo's corpus only; the
  registry format is designed to be copied estate-wide later.
- Publishing anything. This is pre-publish hygiene; distribution stays held
  per the rollout gates.
- LAUNCH_RUNBOOK.md / V1_LAUNCH_TODO.md / launch-checklist.md — operational
  docs, not claim-bearing launch copy.

## Estimate & guards
~450 changed lines (registry ~80, test ~150, copy edits ~200). New files:
LAUNCH_CLAIMS.yaml, apps/api/src/launch-claims.test.ts. Edited:
launch-content.md, marketing-pack.md, AXIS_Board_Pitch.md, WORK_ORDERS.yaml.
No source-code changes, no schema, no forbidden zones. Acceptance: the new
test passes + count-honesty/counts-consistency unchanged + tsc --noEmit clean
(the test file imports counts + PLAN_CATALOG). Branch from `main`. The yaml
parser available to tests: js-yaml is NOT a dependency — parse with a minimal
hand-rolled reader or use YAML.parse from the `yaml` package ONLY if it is
already in the workspace lockfile (check first; if absent, hand-roll the flat
parse — do NOT add a dependency).
