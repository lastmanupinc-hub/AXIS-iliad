# HARDEN & POLISH LOOP — Convergent System-Hardening Guide (Sonnet 5 execution)

**BUILD COMMAND: `continue`** — when the operator sends `continue` (any casing, with or
without other text), the executing model MUST: read this file top-to-bottom → ground-truth
the STATE table against `git log`/`git status`/CI (never trust the table over reality) →
execute the next pending unit(s) → verify → commit → push → update STATE → keep going until
the session ends or the CONVERGENCE test passes. Do not ask permission between units; the
only stops are the ESCALATION list. This document is the single source of truth for the
loop; edit it in place as you work.

**Mission:** close every known gap in the current system, polish the experience for both
human users and AI agents, and keep re-auditing until two consecutive audit cycles find
nothing new — at which point the platform tree and ROI candidate list (Phase T) are the
deliverables that declare the infrastructure ready for new verticals.

**Written by:** Fable 5, 2026-07-11, from a full 5-day verification with three adversarial
review agents + live systems checks. Every gap below carries receipts (file:line or live
probe). Executor: Sonnet 5.

---

## Resume protocol (context resets are normal — plan for them, don't fight them)

A single session cannot hold this whole plan's context. The STATE table + PROGRESS ledger
in THIS file are the resume state; work is resumable at any commit boundary.

- **On every session start / `continue`:** read this file → reconcile STATE against
  `git log`/`git status`/CI (reality wins) → find the top `in-progress` unit (or, if none,
  the top `pending` unit not behind a gate) → resume there. Never re-plan from scratch;
  never redo a unit whose commit exists.
- **Checkpoint discipline:** commit + STATE update + one PROGRESS line at EVERY green
  acceptance — a checkpoint is the unit of survivable progress. Never hold >1 unit of
  uncommitted work.
- **When context is getting heavy** (you notice re-reading files you already read,
  summarized history, or degraded recall): finish the smallest verifiable step of the
  current unit, checkpoint it, mark the unit `in-progress (checkpointed at <what>)` in
  STATE, and END the session cleanly. A deliberate checkpoint beats a degraded push —
  quality of the last commit is worth more than one more unit.
- **End-of-session report:** before stopping, output a short summary — units completed
  (with hashes), the unit in progress and its exact resume point, and any BLOCKED items.

## 0 · Operating rules (the constitution — read every session, violations get reverted)

These encode this repo's standing law plus the exact failure modes observed during the
July build program. They are not suggestions.

1. **Ground truth is git + live probes, never docs or memory.** First act of every
   `continue`: `git log --oneline -15`, `git status --porcelain`,
   `gh run list --repo lastmanupinc-hub/AXIS-iliad --branch main --limit 3`. Reconcile the
   STATE table to reality before doing anything else.
2. **One unit per commit; tree clean as your final act.** Two work-order agents in July
   finished coding and never committed. `git status --porcelain` must print nothing when a
   unit is done. Disclose every deviation from a unit's spec in the commit body.
3. **Verification before push, always in this order:** typecheck (`npx tsc -b --force` in
   the touched app/package) → scoped vitest suites for what you touched → the guard suites
   (`counts-consistency`, `count-honesty`, `launch-claims`, `strategic-docs-honesty` when
   any doc/copy/count changed) → `pnpm run build` (full monorepo) → push.
   Postgres-backed tests need `docker start axis-test-pg` and
   `DATABASE_URL=postgres://postgres:postgres@localhost:5433/axis_test`.
   **Scope = grep, not memory:** "suites for what you touched" means every test file that
   references any FUNCTION or export you changed — find them by grepping the changed
   symbol names across `*.test.ts`, not by recalling which files you think cover it. (A
   changed `settleOverageCash` behavior once shipped past a locally-green run because the
   dedicated wallet suite referenced it under names the author didn't grep; CI caught it.)
4. **Push = deploy.** Pushing `main` auto-deploys the API (Render) and, via CI's deploy-web
   job, the web app (Cloudflare Pages) — **web only ships if CI is green** (a red CI once
   silently froze web deploys for 4 days). After every push: confirm both workflows green
   and spot-probe live (`curl -s https://axis-api-6c7z.onrender.com/v1/health`).
5. **Run scoped suites locally, not the full monorepo run** (it stalls under load on this
   machine). CI is the authoritative full run. Known load-flaky suites are listed in H1 —
   a failure there is not automatically your regression; re-run isolated before diagnosing.
6. **Sequential execution in this one checkout.** No parallel worktrees (July's Phase-2
   merge conflicts). If you spawn subagents, they read; you write.
7. **Money-path law:** PAI'D is the ONLY checkout (never resurrect `POST /v1/checkout`);
   customer-facing payment copy says PAI'D Payments Intelligence; validate-first ordering
   (caps before charges) must never regress; consumeUsageCredits records usage, never money;
   cash truth lives only in `payment_receipts`. **Red before green, demonstrated:** for
   every money-path defect fix (all of H0.1–H0.6, H2.*), write the reproducing test FIRST
   and prove it fails against the pre-fix code (temporary local revert or pre-fix run —
   never committed), then fix; the commit body states how red was demonstrated.
   **Kill-switch proof:** any flag-gated or dark-launched behavior ships a test proving
   the flag-OFF path still produces the exact previous behavior — "kill-switchable" is a
   demonstrated property, not a design intention.
8. **Web law:** HttpOnly `axis_session` cookie auth only (localStorage holds only the
   `__cookie_session__` marker); counts route through `apps/web/src/config.ts` or live API;
   no new npm deps; no class components; every `href="#..."`/hash assignment must match a
   pattern in `routes.tsx`; no dead/fake UI, no fabricated stats, no simulated streaming.
9. **Honesty law:** a claim ships only when its acceptance test is green; external-gated
   features self-downgrade to `configured:false`; never cite unmeasured latency numbers;
   Visa IC 200-800ms is always "published industry range, not measured here".
10. **Secrets law:** credentials come from `key.txt` or Render env, used in-process, never
    printed, logged, or committed. When a label is ambiguous, stop and ask (escalation).
11. **HOLDS (do not touch without a new, explicit owner instruction):** everything under
    `docs/github-app-plan/` (GitHub App/Marketplace); npm publish of the `axis-iliad` CLI;
    accepting any legal agreement; entering legal-entity/KYC data anywhere; switching
    Iliad's live charge traffic to the new Stripe connected account (`acct_1Ts5YxDwUJERAuEd`
    — created and logged, cutover is an owner decision).
12. **When blocked on an owner-only item:** never wait. Append it to the PENDING-OWNER
    table (Phase T file), pick the next unit, move on.
13. **Model-cascade law (how this loop itself spends tokens):** every tier maximizes the
    tier below it. The frontier model wrote this strategy; the executor (Sonnet) implements
    units against their acceptance criteria; when the executor spawns subagents, it picks
    the LOWEST-token-cost model that still clears the unit's quality bar — haiku-class for
    mechanical work (greps, sweeps, count syncs, checklist audits with a tight rubric),
    sonnet-class for implementation and review, frontier only when a unit has failed twice
    at the current tier (escalate ONE tier, attach the two failure transcripts as context).
    Verification of a unit runs at-or-above the tier that implemented it, never below.
14. **Process guards (anti-rabbit-hole):** WIP = 1 — exactly one unit in progress at a
    time. **Stuck rule — move on, never loop:** after **2 honest attempts** at a unit's
    gate (or one full session, whichever comes first), mark it `BLOCKED(<specific
    blocker>)` in STATE, write the FAILURES ledger row, and move to the next unit; blocked
    items are re-attempted at most once more later (fresh context or one tier up per rule
    13) and are always listed in the end-of-session report. Grinding a third consecutive
    attempt on the same blocker is a constitution violation. Every fixed defect ships its
    regression test **in the same commit**. Irreversible or cross-cutting decisions get a
    one-page ADR (`docs/adr/NNN-title.md`: context / decision / consequences) before the
    code lands.
15. **Public-API compatibility law:** `/v1` REST routes, MCP tool names/argument shapes,
    and `error_code` strings are all API surface that live agents depend on. Changes are
    additive-only; a rename or removal requires a deprecation entry (changelog, once
    WO-A4 lands) and a stated compat window. Breaking silently is a HIGH-severity
    self-finding in the next audit cycle.
16. **State + staging safety:** any locally-run server or test uses SCRATCH data only —
    OS temp dirs / the session scratchpad / the dockerized `axis_test` database — never a
    live store, never a real data directory, never live credentials beyond read-only
    probes. Stage commits by EXPLICIT path (`git add <file> <file>`), never `git add .` /
    `-A`; review `git status` before every commit; anything credential-shaped in the diff
    = stop. (Operator has flagged equivalent hazards in the PAI'D repo — an un-gitignored
    smtp/email file and `PORTAL_DATA_DIR` handling; those belong to the PAI'D track:
    record in PENDING-OWNER, do not fix cross-repo from this loop.)
17. **Anti-gold-plating — what "quality" means here:** correctness + coherence + the
    unit's acceptance gate, WITHIN the unit's spec. No bonus features, no unrequested
    capabilities, no speculative abstraction. A drive-by improvement bigger than ~5 lines
    becomes a new pending STATE unit instead of riding along. Polish means the specified
    thing done excellently, not more things.

---

## STATE (the cursor — executor edits this table every unit)

| Unit | Phase | Status | Commit / evidence |
|---|---|---|---|
| H0.1–H0.10 | Hygiene | ALL DONE (H0.2 closed by H2.3) | see PROGRESS |
| H1.1–H1.4 | Reliability | ALL DONE (H1.1 deflake, H1.2 `fdfddd5`, H1.3 source-guard 30s `317095b`, H1.4 ci-mirror) | see PROGRESS |
| H2.1–H2.5 | Money path | H2.1 + H2.2 + H2.3 + H2.4 DONE; H2.5 pending | see PROGRESS |
| ⛔ MONEY GATE | Operator checkpoint after H0+H1+H2 | NOT PASSED — blocks H3+ | |
| H3.1–H3.11 | Web completion | pending (behind MONEY GATE) | |
| H4.1–H4.6 | AI-agent UX | pending | |
| H5.1–H5.3 | Human UX | pending | |
| H6.1–H6.3 | Ops/security | pending | |
| H7.1–H7.4 | Model-cascade productization | pending | |
| H8.1–H8.12 | Foundation engineering | pending | |
| A (audit) | Re-audit cycle | pending — cycle 0 | dry-count: 0 |
| T.1–T.3 | Tree + ROI | pending | |

Convergence: **two consecutive A-cycles with zero new confirmed findings** AND all
non-blocked units done → execute Phase T → declare ready.

---

## Phase H0 · Immediate hygiene (receipts-backed gaps from the July verification)

Each unit is small, self-contained, and carries its acceptance test. Order is priority.

- **H0.1 — Wallet-rail idempotency key is wrong in both directions.**
  `apps/api/src/paid-client.ts:80-83` builds `checkoutIdempotencyKey(accountId,
  "fc-debit:"+tool)` on a 120-second bucket: distinct rapid calls to the same tool collapse
  to one key (if PAI'D dedupes → free calls), while retries get a NEW bucket after 120s.
  Fix: per-call UUID key generated at charge time, carried through retry of the SAME call
  only (mirror `packages/paid-client/src/index.ts:209`'s contract). Acceptance: unit test —
  two sequential calls same tool/account produce different keys; a retry of one logical
  call reuses its key.
- **H0.2 — Enforce-mode wallet ambiguity can double-charge across rails.**
  `apps/api/src/cashier.ts:109-116`: a non-402 wallet error (incl. the 15s timeout where
  the debit may have succeeded) falls through to `chargeMpp` — FC debit + Stripe charge for
  one call. Fix per WO-20 doctrine: ambiguous outcomes do NOT fall through; write a
  `compensation_ledger` row (`wallet_rail_ambiguous`) and fail the call payment-required.
  Depends on H2.1's table. Acceptance: mocked timeout → exactly zero mpp charges + one
  ledger row.
- **H0.3 — Enforce-mode wallet success is invisible to settled revenue.**
  `apps/api/src/cashier.ts:182-184` records `recordPaidCall` but not
  `recordSettledPayment`, so WO-19's receipts miss wallet-rail revenue. Fix: record a
  receipt (provider `paid_fc`). Acceptance: growth-store test — wallet-settled call
  appears in `settled_revenue_cents_all_time`.
- **H0.4 — Stripe API version is unpinned and the code reads pre-Basil shapes.**
  `apps/api/src/stripe.ts` sends no `Stripe-Version` header while reading
  `invoice.subscription` (:323) and top-level `subscription.current_period_start/end`
  (:307-308) — both relocated in Stripe's 2025-03-31.basil. Fix: pin
  `Stripe-Version: 2026-06-24.dahlia` on every call AND migrate the two payload reads to
  the current shapes (parent/period fields). Acceptance: webhook tests updated to dahlia
  fixture shapes; a test asserts the header on every outbound Stripe call.
- **H0.5 — checkout.session.completed resolves price from CURRENT env, not the session.**
  `apps/api/src/stripe.ts:253`. A price change between checkout and webhook mis-tiers the
  customer. Fix: read the session's own line-item/price id. Acceptance: test with env
  price rotated between create and webhook still resolves the original tier.
- **H0.6 — No Idempotency-Key on Stripe POSTs.** Checkout-session create + subscription
  update (`stripe.ts:481, :615`) send none. Fix: add per-operation idempotency keys.
  Acceptance: test asserts header present.
- **H0.7 — Three deploy-generator fixes have no regression tests** (commit `1261357`
  claimed coverage that doesn't exist): root-vs-nested `package.json` disambiguation, the
  Go `-o /out/app .` build-target fix, framework-aware Python `CMD` (gunicorn for
  Flask/Django) in `packages/generator-core/src/generators-deploy.ts`. Fix: add the three
  locks to `generators-batch5-debug.test.ts`. Acceptance: each fails against the
  pre-`1261357` behavior (verify by temporary revert locally, do not commit the revert).
- **H0.8 — `runEmbeddings` has zero direct tests** (`apps/api/src/mcp-tool-impls.ts:364-390`).
  Fix: handler-level tests mirroring `runObjectStorage`'s pattern (not-configured envelope +
  configured happy path with stubbed backend). Acceptance: both paths locked.
- **H0.9 — PlansPage static fallback renders as if live** (`apps/web/src/pages/PlansPage.tsx:71-90`).
  Fix: when `getPlans()` fails, show the fallback with an honest "showing standard pricing —
  live plans unavailable" note (Callout pattern). Acceptance: test asserts the notice
  renders only on fetch failure.
- **H0.10 — Root-debris sweep (committed output logs in a PUBLIC repo).** Nine tracked
  test/coverage output files sit at the repo root (`coverage-full.txt`,
  `coverage-output.txt`, `docker-ci-run3.txt`, `ls-coverage.txt`, `stalling fix.txt`,
  `test_output.txt`, `vitest-full.txt`, `vitest-output.txt`, `vitest_requested_output.txt`
  — verified via `git ls-files`, April–May vintage). Output logs are a classic
  secret-leak vector. Fix: scan each for credential shapes FIRST (report any hit as a
  HIGH finding + escalate for rotation); then `git rm` all nine and add root-level
  `*-output.txt` / `coverage-*.txt`-style patterns to `.gitignore`. Also sweep for any
  other tracked root artifact that is plainly a run log. Acceptance: `git ls-files` clean
  of run logs; scan results stated in the commit body. (History rewrite is NOT in scope —
  if the scan finds a real secret, that becomes an owner escalation, not a filter-repo
  adventure.)

## Phase H1 · Reliability / deflake (make green mean green)

- **H1.1 — production-startup.test.ts + rate-limiter.test.ts timeout under load** (5s
  default; they spin real HTTP servers + Postgres). Fix: per-test timeouts (30s) on the
  server-lifecycle tests, replace fixed `setTimeout` waits with event-driven waits
  (`server.once("listening")` pattern already in the file — finish the job), and serialize
  their DB resets. Acceptance: 3 consecutive full-suite CI runs green; local isolated runs
  green.
- **H1.2 — anon-analyze race** (`app-routing.test.tsx` "shows the real result immediately"
  — ProjectPage crashed reading `.length` of undefined under CI load; passed locally).
  Root-cause properly: guard `generatedFiles`/`snapshot_summary` optional chains in
  `ProjectPage` (defensive render) AND fix the test's await discipline (findBy over getBy).
  Acceptance: the exact test passes 5 consecutive CI runs.
- **H1.3 — source-guard fs-scan margins** — already bumped to 30s; extend the same
  treatment to any other fs-walking test found by grepping `readdir` in `*.test.ts`.
- **H1.4 — Full-suite local stall** — add a root `test:ci-mirror` script that runs the
  suite with CI's exact worker settings, documented in GROK-HANDOFF/this file, so local
  full runs stop being folklore.

## Phase H2 · Money-path completion (WO-20 phases 2-3 — spec in
`docs/build-plan/WO-20-charge-integrity-hybrid.md`, read it first)

- **H2.1 — `compensation_ledger` migration in `@axis/snapshots`** per the WO-20 schema,
  at the NEXT free PG_MIGRATIONS version (v34 — H0.3 took v33 for the provider-CHECK
  widening). Acceptance: migration idempotent test (memory-store.test.ts pins the current
  version — update it in the same commit; the July bug was a hardcoded stale version).
- **H2.2 — Producer: settled-then-error.** MCP dispatch catch-path writes an `owed` row
  when `isInbandSettled(req)` and the tool threw (today it only apologizes in text —
  `mcp-tool-impls.ts` "settled-then-error"). Acceptance: mocked settled+throwing tool →
  receipt row + ledger row, idempotent on retry.
- **H2.3 — Producer: wallet ambiguity** (pairs with H0.2).
- **H2.4 — Compensator: auto credit-grant** equal to `amount_cents`, retried, idempotent
  on entry_id; `_usage` gains `compensation: {owed_cents, credited_cents}`; admin revenue
  subtracts owed. Acceptance: WO-20's acceptance block, verbatim.
- **H2.5 — 402 payload schema unification.** One shape for every payment-required response
  (REST + MCP): same field names, PAI'D-only pointers, price + lite option + upgrade_url +
  usage_credits present everywhere applicable. Write the shape as a type, add a
  contract test that walks every `sendError(..., 402/429, ...)` call site. (Several July
  fixes touched these one at a time; this closes the class.)

### ⛔ MONEY GATE — mandatory operator checkpoint (the loop's ONE planned stop)

When the last unit of **Wave 0 = H0 + H1 + H2** is green and pushed: **HALT.** Do not
start H3 or any later phase. Output a **review packet**: every Wave-0 commit (hash +
one-line what/why), the files touched per commit, which units were red-green demonstrated
(rule 7), and anything BLOCKED. The operator reviews the money diffs before more is built
on top of freshly-changed billing; their next `continue` AFTER the packet unlocks H3+.
Mark the gate row in STATE `PASSED (operator, <date>)` when it happens. This checkpoint
is deliberate risk-tolerance policy, not an escalation — cheap insurance exactly where a
human look matters most.

## Phase H3 · Web completion (the remaining product surface)

Execute `docs/web-plan/BUILD-PLAN.md` WO-A4, WO-A5, then WO-P9 → P17, using
`docs/web-plan/GROK-HANDOFF.md` as the operating manual (it is model-agnostic; every rule
in it binds Sonnet equally). Sequencing: **A4+A5 first** (they unblock P16/P12), then
P11 → P10 → P12 → P9 → P13 → P14 → P15 → P16 → P17. One page per commit, acceptance
criteria are the definition of done, update the BUILD-PLAN status table as each lands
(units H3.1–H3.11 = A4, A5, P11, P10, P12, P9, P13, P14, P15, P16, P17).

## Phase H4 · AI-agent UX polish (the "customer" most of this platform serves is an agent)

- **H4.1 — MCP tool-description accuracy audit.** For each of the tools in
  `apps/api/src/mcp-tools.ts`: does the description match the implementation's actual
  behavior, arguments, pricing, and gating? Fix drift; add a test that every metered tool's
  description mentions its price source. (July found descriptions are the authoritative
  per-tool pricing disclosure — make that reliably true.)
- **H4.2 — Error-code catalog.** Every `ErrorCode.*` documented in one generated section of
  DocsPage + `/llms.txt`, with retry guidance per code (agents parse this).
- **H4.3 — `_usage` envelope documentation** on ForAgentsPage + docs: fields, when
  `_idempotent_replay` appears, what `compensation` means once H2.4 lands.
- **H4.4 — begin-loop follow-ups** (from the shipped autonomy layer): REST export of
  `begin.yaml`/`continuation.yaml` + README mention, so agent crawlers discover the loop.
- **H4.5 — probe-intent quality pass:** run 20 realistic intents, fix the worst routing
  misses (the classifier lives in `apps/api/src/intent.ts`; keep deterministic).
- **H4.6 — llms.txt freshness test:** guard that counts/urls in `llms.txt` route through
  `counts.ts` (same regime as count-honesty).

## Phase H5 · Human UX polish

- **H5.1 —** WO-P14's a11y/error-state sweep is part of H3; this unit is the
  cross-page pass AFTER all pages exist: keyboard-only walkthrough, focus states, skeleton/
  empty/error patterns audit (the four patterns from WO-F4) on every page.
- **H5.2 — Mobile pass** on all new pages (the plan's Gate 4).
- **H5.3 — Performance:** lazy-load heavy pages via dynamic import (the >500kB chunk
  warning), Lighthouse a11y ≥95 on the 5 core pages. No new deps.

## Phase H6 · Ops + security hardening

- **H6.1 — Key-rotation runbook execution prep:** inventory every live credential
  (key.txt labels + Render env), record rotation procedure per credential in
  `docs/SECURITY_ROTATION.md` (procedure only — no values), flag the two known standing
  risks for the owner: Render key blast radius, org 2FA. Includes the owner-gated `rk_`
  migration prep from the July report: enumerate exact Stripe permissions used (from
  H0.4-H0.6 work) into the doc so the owner can mint the restricted key in one sitting.
- **H6.2 — Dependency + hygiene self-scan:** `pnpm audit` triage (fix or document),
  run the repo's own `iliad_hygiene` scanner against itself, fix findings.
- **H6.3 — Live-probe battery as a script:** `scripts/live-probe.mjs` — health/ready,
  MCP tools count, PAI'D config, anon 413 gate, web bundle marker — one command the loop
  (and CI, non-gating) can run. The July systems check did this by hand; make it repeatable.

## Phase H7 · Productize the model-cascade doctrine (owner directive, 2026-07-11)

The strategy pattern this very document embodies — a higher-capability model writing
acceptance-criteria-complete execution guides for the cheapest adequate lower tier —
becomes a customer-facing artifact emitted by the generator suite. It must be generic
(any customer repo), deterministic, and derived from real repo signals like every other
generator. No LLM calls at generation time — the artifact TEACHES the cascade; it is not
produced by one.

- **H7.1 — New generator: `model-cascade.md` under the `skills` program**
  (`packages/generator-core/` — follow the existing skills-generator conventions and
  register in the REGISTRY; `ARTIFACT_COUNT` derives from the registry and will bump
  automatically). Content, derived from the context map / repo profile:
  (a) a three-tier table — planner (frontier-class) / executor (mid-class) /
  mechanical (small-class) — with task-type assignments mapped from detected repo signals
  (has CI → "CI triage: mechanical"; has tests → "test-backed implementation: executor";
  monorepo/multi-service → "cross-cutting design + adversarial verification: planner";
  etc. — deterministic mapping, no invented facts);
  (b) the delegation contract: each tier writes work orders with acceptance criteria for
  the tier below; verification runs at-or-above implementation tier;
  (c) the cost rule: "run every unit on the lowest-token-cost model that clears its
  quality bar; escalate one tier after two failures, carrying the failure context";
  (d) an honest limits note: tier names are capability CLASSES, not vendor SKUs — no
  pricing claims, no benchmark claims.
- **H7.2 — Wiring + count sweep:** add the output to the skills entry in
  `PROGRAM_OUTPUTS`; re-run the pinned-literal sweep on the docs that pin the artifact
  count (the same set the last count bump touched: `README.md`, `LAUNCH_CLAIMS.yaml`,
  `AXIS_Board_Pitch.md`, `launch-content.md`, web `config.ts` if pinned) and let
  `count-honesty`/`counts-consistency`/`launch-claims` enforce. The skills program is on
  the FREE tier — this artifact ships free (deliberate: it is the self-propagating
  explainer for how to consume the rest of the platform). No MCP tool-count change (no new
  tool; it rides the existing skills/analyze surface).
- **H7.3 — Tests per program-loop conventions:** determinism (byte-identical on identical
  input), injection/escaper suite parity with sibling skills generators, and a
  content-contract test (tier table present, delegation contract present, no vendor-SKU or
  pricing strings).
- **H7.4 — Cascade section in `workflow-pack.md`:** the skills program's existing
  workflow artifact gains a short "Model cascade" section pointing at `model-cascade.md`
  (one cross-reference, not duplicated doctrine). Update its tests.

## Phase H8 · Foundation engineering (known-technique hardening of the safety net itself)

Everything above proves the code works. This phase proves the **safety net** works — the
canon techniques (mutation testing, property-based invariants, contract tests, fitness
functions, data-safety drills, synthetic monitoring, rollback rehearsal) applied within
this repo's no-new-runtime-deps law. Where a real tool would be better than the hand-rolled
version, it is named as a dep-gated ROI candidate — do not add the dep yourself.

- **H8.1 — Unhappy-path completeness audit.** Enumerate every external call site in
  `apps/api/src` (grep `fetch(` excluding tests). Each must have three tests: timeout,
  transport error, malformed/unexpected-shape response — or a one-line documented waiver.
  Write the missing ones. Acceptance: the enumeration table (call site → 3 tests or
  waiver) in the commit body; zero unwaived gaps.
- **H8.2 — Money-math invariants (property-style, hand-rolled seeded PRNG — no new dep).**
  New test over `packages/snapshots/src/usage-credit-metering.ts`: ~1,000 seeded cases
  asserting, for every (allowance, used, amountCents): `included_credits_applied +
  overage_credits === credits_required`; both terms ≥ 0; `included_credits_applied ≤
  remaining allowance`; sequential consumes accumulate exactly (no lost updates
  single-threaded). Acceptance: suite green; a deliberately mis-split local mutation is
  caught (verify locally, never commit the mutant). Dep-gated upgrade: fast-check.
- **H8.3 — Mutation-lite pass on the money path.** For `cashier.ts`, `mcp-runtime.ts`,
  `usage-credit-metering.ts`, `growth-store.ts`, `stripe.ts`: flip each boundary operator
  / negate each early-return guard ONE at a time locally; run the scoped suites; any
  surviving mutant gets a killing test. Acceptance: mutant → killing-test table in the
  commit body, survivors driven to zero. NEVER commit a mutant (verify
  `git status`/`git diff` clean of mutations before commit). Dep-gated upgrade: Stryker.
- **H8.4 — PAI'D contract fixtures.** Golden request/response fixtures for every PAI'D
  endpoint Iliad calls (`apps/api/src/paid-client.ts` + `packages/paid-client/`), asserted
  in unit tests; plus an env-gated live contract canary (pattern:
  `live-settlement.e2e.test.ts`) validating fixtures against `api.trustfabric.ai` —
  includes finally verifying whether PAI'D honors `Idempotency-Key` (the client's own
  comment says unverified). Acceptance: fixture drift breaks tests; canary green when run
  with creds; the idempotency answer documented in the client comment.
- **H8.5 — OpenAPI ↔ router bijection test.** Every route registered in
  `apps/api/src/server.ts` appears in `openapi.ts` and vice versa (explicit waiver list
  for non-REST surfaces like `/mcp` JSON-RPC). Acceptance: bijection test green; any
  drift found is fixed, not waived.
- **H8.6 — Architecture-boundary fitness tests (hand-rolled fs walk, no dep).**
  Lock the dependency rule: `apps/web` and `apps/api` never import each other's `src`;
  `packages/*` never import from `apps/*`; no cycles in the `@axis/*` workspace-dependency
  graph (walk the package.json files). Acceptance: test green; violations fixed or
  waived with an in-test comment. Dep-gated upgrade: knip/madge for dead-export + cycle
  depth.
- **H8.7 — Neon data-safety drill.** Confirm PITR/branching on the live Neon project;
  document the restore procedure in `docs/RUNBOOK_ROLLBACK.md`; perform ONE drill:
  create a branch at T-minus-15-minutes, verify row counts on 3 core tables, delete the
  branch. Escalate if no Neon credential label exists. Acceptance: runbook section +
  drill evidence (timestamps, counts) committed.
- **H8.8 — Deploy rollback runbook + rehearsal.** Document in the same runbook: API
  rollback via Render (redeploy previous deploy id), web rollback via Cloudflare Pages
  previous deployment, git-revert-and-push as the default path; make explicit the
  standing rule **CI red after your push = priority zero, nothing else proceeds**.
  Rehearse one rollback of a no-op commit off-peak, or record why not + add to
  PENDING-OWNER. Acceptance: runbook complete; rehearsal evidence or explicit deferral.
- **H8.9 — Synthetic monitor (dead-man's switch).** Promote `scripts/live-probe.mjs`
  (H6.3) into `.github/workflows/synthetic.yml`: scheduled every 30 min, non-gating,
  opens/updates a single GitHub issue on failure and closes it on recovery (native
  GITHUB_TOKEN, no new secrets). Acceptance: scheduled run green; one forced-failure test
  run demonstrably opens the issue (then reverted).
- **H8.10 — Web security headers.** Cloudflare Pages `_headers` file: CSP (self + the two
  API origins), HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `frame-ancestors 'none'`. Must not break hash routing, OAuth callback, or the PAI'D
  checkout redirect — verify all three live after deploy. Acceptance: headers visible via
  `curl -I` on prod; routing/auth/checkout spot-checks pass.
- **H8.11 — CI secret-scan + webhook replay audit.** (a) A CI step greping each push's
  diff for credential shapes (`sk_live_`, `rk_live_`, `whsec_`, `re_[A-Za-z0-9]{20,}`,
  `hf_[A-Za-z0-9]{30,}`, `rnd_`) with an allowlist for the known fake fixtures; prove it
  with a scratch branch containing a fake key (must fail), then delete the branch.
  (b) Audit replay protection on every webhook handler (Stripe has 5-min tolerance —
  verify the PAI'D and GitHub handlers reject stale/replayed deliveries; fix gaps).
  Acceptance: CI step live + proven; replay matrix documented with fixes landed.
- **H8.12 — Dependabot config (config file only — not a runtime dep).** Weekly, grouped
  minor/patch, majors labeled `deps-discussion` per repo law (never auto-merge).
  Acceptance: valid `dependabot.yml` on main; first batch triaged per law.

## Phase A · Re-audit cycle (after H0–H8, and again after every subsequent fix batch)

1. Run the full CI suite + live-probe battery + `pnpm run build`.
2. Spawn up to 3 read-only review subagents with the July checklists (payments/PAI'D
   coherence; web routes/auth/counts/dead-UI; engines/MCP honesty+determinism+gating), each
   returning findings with file:line + severity + regression-vs-pre-existing. Verify every
   HIGH/MED yourself by reading the code before acting.
3. **Recurring foundation checks** (each cycle, cheap, mechanical-tier work):
   (a) idempotency classification sweep — every state-mutating endpoint added since the
   last cycle is classified idempotent-by-key / naturally-idempotent / at-most-once-risky,
   and risky ones get a unit; (b) unhappy-path re-grep — new `fetch(` sites since last
   cycle get the H8.1 three-test treatment; (c) mutation-lite rotation — ONE money-path
   module per cycle gets the H8.3 flip-and-verify treatment; (d) the H8.5/H8.6 fitness
   tests and H8.9 synthetic monitor are green.
4. Confirmed findings become new units (append to STATE, tag cycle number). Fix them.
5. A cycle with **zero new confirmed findings** increments the dry-count; any finding
   resets it. **dry-count = 2 → CONVERGED** → Phase T.

## Phase T · Terminal deliverables (the tree + the ROI list)

- **T.1 — `docs/PLATFORM_TREE.md`:** the full system as a tree. **Roots** (infrastructure:
  Neon PG, Render API, Cloudflare web, CI, PAI'D rail, Stripe Connect platform, HF Spaces
  bridge). **Branches** (product surfaces: REST API, MCP server, web app, CLI, generator
  programs, compliance engines, assetforge). **Leaves** (every feature, marked
  `shipped | gated(owner) | gated(external) | candidate`). Every node cites its evidence
  (file, endpoint, or live probe). Nothing aspirational may appear unmarked.
- **T.2 — `docs/ROI_CANDIDATES.md`:** structured, ranked list for continued work. Columns:
  candidate · tree position · effort (S/M/L) · impact (revenue / strategic / enabling) ·
  gates/dependencies · confidence. Seed entries (verify, re-rank, extend as the loop
  discovers more): engineer-tier E7/E10/E11/E12 (dep-gated — owner discussion);
  `axis-iliad` npm publish (owner credential); GitHub App free listing (ON HOLD — owner);
  official MCP registry listing; WO-A6 async runs/SSE; multipart ZIP intake (kills
  client-side unzip); status-page incident history storage; Iliad connected-account charge
  cutover (owner decision, account exists); PAI'D embedded "Complete verification" button
  (different repo); PAI'D sanctions-restricted events investigation (read-only, different
  repo); distribution/activation items from repo-root `ACTIVATION_TRACKER.md`; assetforge
  LOCAL-backend GPU vertical; test-tooling upgrades gated on dep discussion (Stryker
  mutation testing, fast-check property testing, knip dead-export analysis, Playwright
  browser e2e — each replaces a hand-rolled H8 technique with the industrial version);
  branch protection with required status checks on `main` (owner decision — changes the
  push-equals-deploy workflow this loop and the operator both rely on); new verticals
  discovered during the loop.
- **T.3 — Confidence report + PENDING-OWNER table:** one honest page — what is verified
  solid, what is monitored, every owner-only item accumulated by rule 12, and the loop's
  final dry-count evidence. This is the "ready for new verticals" attestation; it may not
  overstate.

---

## Escalation list (the ONLY reasons to stop and ask)

- A fix requires a new runtime dependency (repo law: discussion first).
- A fix requires schema-destructive migration on live Neon data.
- Anything on the HOLDS list (rule 11) appears load-bearing for a unit.
- A credential label is ambiguous, or a needed credential doesn't exist.
- Two honest designs conflict with each other's law (e.g., a polish item would require
  weakening a guard test) — present both, wait.

Everything else: decide, disclose in the commit body, keep moving.

---

## PROGRESS ledger

Append-only — one line per completed unit; the operator scans this instead of reading
every diff. Newest at the bottom.

| Date | Unit | One-line outcome | Commit |
|---|---|---|---|
| 2026-07-11 | H1.2 | ProjectPage crash on malformed generated-files response fixed (defensive coerce + findBy); CI-flake root cause closed | `fdfddd5` |
| 2026-07-11 | H0.1 | FC-debit idempotency: per-invocation UUID replaces 120s-bucket key (bucketing dropped 2nd call in window / re-keyed late retries); red demonstrated first | `e5558fb` |
| 2026-07-11 | H0.3 | Wallet-rail revenue now settled-visible: migration v33 widens provider CHECK to paid_fc, TS union extended, enforce-success records the receipt; 3 reds demonstrated first | `5c8e120` |
| 2026-07-11 | H0.4 | Stripe-Version 2026-06-24.dahlia pinned on all 4 outbound call sites (stripe.ts x2, network-token, dispute-clients); webhook handlers dual-read Basil+ shapes (item-level periods, invoice parent.subscription_details) with legacy fallback; 6 reds demonstrated first | `24f827a` |
| 2026-07-11 | H0.5 | checkout-completed now stores the price the customer ACTUALLY bought (fetched from the subscription, pinned version, fail-to-env-fallback) with plan-intent tier fallback so env rotation can't strand or rewrite a paying customer; red demonstrated first | `493d986` |
| 2026-07-11 | H0.6 | Idempotency-Key on both Stripe POSTs: checkout create keyed by checkoutIdempotencyKey (its designed double-submit purpose), cancel keyed per subscription; red demonstrated first | `653d773` |
| 2026-07-11 | H0.7 | The three unlocked 1261357 deploy fixes now have regression tests (root-vs-nested packageManager, Go -o /out/app ., framework-aware Python CMD); red proven via temporary local revert (5/5 deploy locks fail pre-fix), revert never committed | `df86b2c` |
| 2026-07-11 | H0.8 | runEmbeddings gains its first direct tests (5): both _not_configured honesty envelopes never charge or fabricate, happy path captures credits exactly once, input validation clean | `3466f99` |
| 2026-07-11 | H0.9 | PlansPage fallback pricing now DISCLOSES itself (warning Callout, only on failure); malformed-200 payloads treated as failure instead of storing junk (H1.2 class); red demonstrated first (2 red + control green) | `2ca1762` |
| 2026-07-11 | H0.10 | TEN tracked root run-logs (incl. oauth-fail.log, found beyond the doc's nine) secret-scanned (all clean — valid ERE scan after a first invalid-regex attempt), untracked via git rm --cached (kept on disk), class gitignored; only curated llms.txt remains | `cb8366f` |
| 2026-07-11 | H1.1 | production-startup + rate-limiter deflaked: 30s per-file ceilings + every fixed sleep replaced with event-driven waits (close callbacks, once("error")); 43/43 isolated | see commit |
| 2026-07-11 | H1.4 | scripts/test-ci-mirror.mjs + pnpm run test:ci-mirror — CI=true (4-worker cap) + the exact ci.yml coverage flags, DATABASE_URL defaulted to the local container | `b162cc3` |
| 2026-07-11 | H2.1 | compensation_ledger migration v34 + store: at-most-once claim proven incl. 8-way concurrent race; per-account + platform summaries; producer idempotency lifecycle-borne | `daf6091` |
| 2026-07-11 | H2.2 | settled-then-error producer live: dispatch catch records the owed entry (amount rides the settled marker, now a WeakMap) + agent sees _compensation in the error envelope; red demonstrated first | see commit |
| 2026-07-12 | H2.3 (+H0.2) | Enforce-mode wallet ambiguity closed: any non-402 debit error (timeout, network, 5xx) no longer falls through to chargeMpp — records a wallet_rail_ambiguous ledger row and fails the call closed (402, no work, no second-rail charge); existing test that had encoded the bug as "correct" flipped and proven red first | `28932bc` |
| 2026-07-12 | H2.4 | Compensator live: grantUsageCredits (new additive primitive — banks negative included_credits_used as spendable headroom) + claim-then-grant orchestration (apps/api/src/compensator.ts), triggered lazily on every _usage build (no new background infra) so an account is made whole on its very next call; _usage gains compensation:{owed_cents,credited_cents}; admin revenue gains compensation_owed_cents_all_time + a net-of-compensation figure WITHOUT altering the existing settled_revenue_cents_all_time definition | see commit |

## FAILURES ledger (rule 14 — append-only; a halted unit is a data point, not a shame)

| Date | Unit | What was attempted | Why halted | Disposition (re-scoped / escalated / owner) |
|---|---|---|---|---|
| — | — | — | — | — |
