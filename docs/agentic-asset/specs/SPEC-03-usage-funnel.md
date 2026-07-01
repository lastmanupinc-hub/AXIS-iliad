# SPEC-03 — Usage-aware program funnel

**Goal:** `recommended-next-programs.md` personalizes to the ACCOUNT's history:
programs they've never run rank ahead of ones they already use. Core stays
pure; personalization is an optional explicit input.

## Read first
`packages/generator-core/src/program-funnel.ts` (whole file, ~150 lines),
its test, and the `apps/api/src/export.ts` call site. Find the per-account
program-usage source by grepping `by_program` in `apps/api/src` +
`packages/snapshots/src` (the Account page's usage summary reads it — reuse
that exact store function; do not write a new query if one exists).

## Contract (exact)

```ts
// program-funnel.ts — signature extension (backward compatible):
export function buildNextPrograms(
  programsRun: Set<string>,
  ctx: ContextMap,
  limit = 3,
  accountUsage?: Record<string, number>,  // program -> lifetime run count
): string[];
export function appendProgramFunnel(
  generated: GeneratorResult,
  ctx: ContextMap,
  accountUsage?: Record<string, number>,
): void;
```

Ranking rule (deterministic): build the candidate list exactly as today
(adjacency → repo boosts → moat defaults, dedup, minus `programsRun`). Then, if
`accountUsage` is provided, **stable-partition** it: candidates with
`(accountUsage[p] ?? 0) === 0` first (preserving existing relative order),
then the rest. No usage input ⇒ identical output to today (this is the
determinism guarantee — assert it in tests). When usage-influenced, the
rendered artifact adds one line under the intro:
`_Ranked for this account: programs you haven't tried yet come first._`

## Surface wiring (`apps/api/src/export.ts`)

At the existing `appendProgramFunnel(generated, ctx)` call: resolve the
account already in scope at that call site (if none is, fetch via the same
auth/ownership context the export handler resolves — read the handler top).
Load the account's per-program run counts via the existing usage-summary store
function; map to `Record<string, number>`; pass as the third arg. Failure to
load usage ⇒ pass `undefined` (never fail the export). Fire
`trackEvent(account_id, "funnel_personalized", "product", {})` best-effort
only when usage was actually applied.

## Tests (write first)

Extend `program-funnel.test.ts`: (1) no-usage call output is byte-identical to
the pre-change snapshot of behavior (construct expectation from the current
implementation's known ordering — e.g. run `debug` ⇒ first rec `optimization`);
(2) with `accountUsage` marking `optimization: 5` and `mcp: 0`, `mcp` outranks
`optimization`; (3) determinism: same inputs twice ⇒ identical; (4) rendered
artifact includes the personalization line only when usage provided.
Export test: analysis for an account with recorded usage produces the
personalization line (or skip with a comment if constructing usage rows in the
export test is disproportionate — note it in the PR).

## Guards
Do not change the adjacency map or value-prop copy. Do not make generator-core
read the DB. ~90 LOC.
