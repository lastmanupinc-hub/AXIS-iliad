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
   cash truth lives only in `payment_receipts`.
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

---

## STATE (the cursor — executor edits this table every unit)

| Unit | Phase | Status | Commit / evidence |
|---|---|---|---|
| H0.1–H0.9 | Hygiene | pending | |
| H1.1–H1.4 | Reliability | pending | |
| H2.1–H2.5 | Money path | pending | |
| H3.1–H3.11 | Web completion | pending | |
| H4.1–H4.6 | AI-agent UX | pending | |
| H5.1–H5.3 | Human UX | pending | |
| H6.1–H6.3 | Ops/security | pending | |
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

- **H2.1 — `compensation_ledger` migration (v33) in `@axis/snapshots`** per the WO-20
  schema. Acceptance: migration idempotent test (mirror memory-store.test.ts, use the
  CURRENT version number — the July bug was a hardcoded stale version).
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

## Phase A · Re-audit cycle (after H0–H6, and again after every subsequent fix batch)

1. Run the full CI suite + live-probe battery + `pnpm run build`.
2. Spawn up to 3 read-only review subagents with the July checklists (payments/PAI'D
   coherence; web routes/auth/counts/dead-UI; engines/MCP honesty+determinism+gating), each
   returning findings with file:line + severity + regression-vs-pre-existing. Verify every
   HIGH/MED yourself by reading the code before acting.
3. Confirmed findings become new units (append to STATE, tag cycle number). Fix them.
4. A cycle with **zero new confirmed findings** increments the dry-count; any finding
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
  LOCAL-backend GPU vertical; new verticals discovered during the loop.
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
