# Open Work — execution strategy per item

**What this is.** A per-item plan for everything currently open, written 2026-08-04 after a
full re-read of the governing docs. Companion to [`ROI_CANDIDATES.md`](./ROI_CANDIDATES.md)
(what is worth doing, ranked) — this answers *how to do each one without breaking something*,
including the specific trap each item carries.

**What this is NOT.** Not a new loop and not a competing entry point.
[`HARDEN_POLISH_LOOP.md`](../HARDEN_POLISH_LOOP.md) remains the loop of record and the single
meaning of `continue`. This file is reference material for the items that are currently
between phases: Phase R is CONVERGED (2026-07-26), Phase T shipped (2026-07-27), and Phase A
is owner-paused, so the queue is `begin.yaml`'s `app_*` candidates plus the Tier 0–3 rows
that were never closed.

**Ordering law (not editorial preference).** `ROI_CANDIDATES.md` states it: anything that
makes a **false public claim** or **silently loses money/signal** outranks anything that
merely adds capability. Sections below are in that order.

**Evidence convention.** Every claim here was verified firsthand on 2026-08-04 unless the row
says otherwise. Where something needs checking before acting, the row says so rather than
guessing — a strategy built on an assumed fact is how the last few misses happened.

---

## A · Integrity — false claims currently shipping

### A1 · `attestation.json` asserts integrity over bytes that no longer match

**Verified:** `packaging/trust-fabric/attestation.json` carries
`"generated_at": "1970-01-01T00:00:00.000Z"` and a merkle root predating months of changes.
`release.yml` verifies it and attaches it to **every GitHub Release**. This is
`ROI_CANDIDATES.md` row 0.3, open since 2026-07-27.

**Why it outranks everything else here:** it is a supply-chain integrity claim. A consumer
checking the attestation is being told these bytes were verified; they were not. Of the three
remaining Tier 0 rows this is the only one where inaction is itself the harm — 0.1 (alerting)
is an owner-accepted risk and 0.5 (sandbox) is a hosting decision.

> **CORRECTED 2026-08-04 — this section's original premise was wrong, and the real problem is
> worse than `ROI_CANDIDATES.md` 0.3 describes.** Building the verifier disproved the plan
> written above it. Recorded rather than quietly rewritten, because the wrong version is the
> one a reader would otherwise repeat.
>
> **Measured:** 5 of 9 attested leaves do not match the repo's shipped files — `Dockerfile`,
> `docker-compose.yml`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `Makefile`
> — and a 6th, `packaging/manifests/npm-package.json`, **is attested but does not exist**
> (deleted; `cli-docs-parity.test.ts` requires it stay deleted). Only 4 leaves match, and only
> because the closer's generated output for those paths happens to be committed verbatim.
>
> **Cause is structural, not staleness.** The leaves come from generator-core's
> `closerAttestedArtifacts`, which hashes **what the closer program generates for a project**,
> not what this repository ships — while the leaf paths read like repo paths and the bundle is
> attached to every Release as an integrity claim.
>
> **Therefore "make `make attest` regenerate at ship time" is NOT a remedy.** It would attest
> freshly-generated content under repo-looking paths — the same false shape, newly dated.
>
> Two remedies actually resolve it. **(a) Re-point the attestation at the repo's real files** —
> makes it a genuine supply-chain artifact, but requires deciding the attested set deliberately,
> since the current one includes a deleted file and excludes everything that actually ships to
> users. **(b) Stop publishing it** — mark the files `SAMPLE`, drop them from the Release, and
> delete the verification step. Honest, and cheap.

**Done, and not gated on the remedy:** `scripts/verify-attestation.mjs` recomputes leaf
digests, rebuilds the merkle root, and checks the signature and timestamp;
`release.yml` now runs it instead of `test -f`. The next release **will fail loudly** rather
than publish a bundle that does not verify. That is correct under either remedy and required
under both.

**Trap (still true):** do not "fix" this by regenerating the file by hand and committing a
fresh timestamp. That produces a file honest for exactly one commit and silently false again
on the next — the same failure mode as `test_file_count`, which sat `verified` and wrong for
a month.

**Deliberately NOT added to the main CI suite.** A permanently-red `main` would block every
deploy to force a decision that belongs to the owner. `release.yml` runs on tag push, so the
failure lands at ship time — the moment the claim would actually be published.

**Gate:** owner picks (a) or (b).

### A2 · Two packs still assert an unverifiable self-audit

**Verified:** `obsidian-vault-pack.md` (`| Grade A | 81/82 |`) and `superpowers-pack.md`
(`Currently: 81/82 at Grade A.`) both assert a capability grade traceable to
`capability_inventory.yaml` v0.5.0 — the stale inventory SPEC-12 already stripped from the
launch corpus for being unverifiable against runtime.

**Strategy — apply the decision that already exists.** SPEC-12 removed this claim class from
launch copy. Extending that decision to two files it missed is consistency, not a new policy:
delete the two assertions, then add both packs to `launch-claims.test.ts`'s `corpus()` and
drop their entries from `count-surface-coverage.test.ts`'s `UNGUARDED`. Their counts and the
stale `SQLite WAL, 5 tables` line are already fixed, so the Grade-A prose is the only thing
holding them out of the guarded set.

**Trap:** the existing `CAPABILITY_GRADE` regex does **not** catch these — it requires
`capabilit*` within 40 characters of `grade a`, and both real violations are phrased outside
that window while three innocuous strings (a heading, an `N/82` template placeholder, process
prose) match it. Tightening the regex to require a numeric ratio near "Grade A" is the actual
fix; without it, adding the packs to the corpus fails on the wrong lines and passes the right
ones.

**Gate:** owner confirms deleting marketing prose. Everything else is mechanical.

---

## B · Money path

### B1 · `mppx` 0.5.12 → 0.8.14

**Verified:** `apps/api/package.json` pins `^0.5.12`; installed is 0.5.12. `mppx` is imported
by `apps/api/src/cashier.ts` — the only checkout rail. Dependabot groups this under
"minor-and-patch" (PR #241), but `0.x` minors are breaking ranges by semver: this is three
breaking ranges. The registry currently publishes through 0.8.15.

**Governing rule:** `HARDEN_POLISH_LOOP.md` §7 — validate-first ordering (caps before
charges) must never regress; **red before green, demonstrated**, for every money-path change.

**Strategy — characterize first, then bump.** A library swap has no "defect" to reproduce, so
the red-before-green discipline has to be adapted rather than skipped:

1. **Pin current behavior before touching anything.** Write characterization tests over
   `cashier.ts` that assert the properties the money-path law names: caps evaluated before
   charges, `consumeUsageCredits` recording usage and never money, the stable HMAC-derived
   idempotency key (not a fresh UUID per invocation — that was RT.2/RT.3, a real double-charge
   defect), and the 4xx-vs-ambiguous split from H2.3 that stops free-credit farming. These
   must pass on 0.5.12 **before** the bump — that is the "red" equivalent: proof the tests
   actually describe today's behavior rather than tomorrow's.
2. **Read the changelog between 0.5.12 and 0.8.x.** Three minor ranges on a payment library
   will have intentional breaking changes; find them before the compiler does.
3. Bump, then run: the characterization tests, the existing money suites (`cashier`,
   `cashier-settled-payment`, `cashier-paid-wallet`, `billing`, `compensate-on-post-charge-failure`,
   `snapshot-double-charge`), and `packages/paid-client`'s golden vectors.
4. **Verify against live PAI'D test-mode** before merging. `packages/ap2` carries a
   self-disclosed never-tested-live gap; a payment-library bump is exactly when that matters.

**Trap:** the tempting shortcut is "tests pass, ship it." The money suites are good but they
test *our* code; a 0.x library bump can change wire behavior the mocks never see. Step 4 is
the one that would actually catch that, and it is the one most likely to get skipped.

**Gate:** owner confirms; needs PAI'D test-mode access for step 4.

---

## C · Dependency queue — 13 open Dependabot PRs

**Context that changes how to read all of them:** PR #241's `build-and-test` was **skipped**,
blocked by the `determine-affected` failure fixed 2026-08-04. Any PR opened before that fix
has untested dependencies regardless of what its checks appear to say. Re-run CI before
trusting any of them.

### C1 · `uuid` — remove it, do not bump it

**Verified:** declared in `packages/snapshots/package.json` as `"uuid": "^11.1.1"` and
**imported by nothing**. The only matches repo-wide are Postgres's `gen_random_uuid()`, a
`"<uuid>"` doc placeholder, and a test fixture using "uuid" as a fake package name.

**Strategy:** delete the dependency, run the full suite, close PR #228. This shrinks a
published package and removes a recurring major-bump prompt permanently. Confirm nothing
resolves it transitively at runtime first (`pnpm why uuid`).

### C2 · PR #250 — close without merging

**Verified:** it bumps `Dockerfile.glama` (node:20-slim). That file is on the remediation
playbook's **PROTECTED** list: the live Glama listing advertises self-hosting from it, it is
known broken, and repair is owner-gated (R5.5). The main `Dockerfile` is already node:22.

**Strategy:** close with a comment pointing at R5.5. Bumping a base image inside a file that
is already broken fixes nothing and implies maintenance that is not happening.

### C3 · Vite — the PR is stale

**Verified:** installed Vite is already 8.1.0; PR #223 proposes 6.4.3 → 8.1.5. The major
already happened via another path.

**Strategy:** take 8.1.5 as an ordinary patch bump alongside other safe updates. Do not treat
it as a major.

### C4 · `@types/node` 22 → 26

Type-only, but wide: every package typechecks against it. **Strategy:** bump alone, run
`pnpm -r exec tsc --noEmit`, expect signature churn around `node:fs`/`node:child_process`
(both used heavily by the CLI and the watchers). Cheap to revert, so it is a good first
major.

### C5 · TypeScript 5.7 → 7

Largest blast radius in the queue — the whole monorepo, plus `typescript-eslint` must support
it. **Strategy:** do it last and alone. Check `typescript-eslint`'s supported-range first; if
8.65 does not support TS 7, this is blocked on that project, not on us. Budget for real
breakage under `strict` and `noUnusedLocals`.

### C6 · `react` / `react-dom` / `@types/react`

Not hoisted to the root, so a workspace-wide `pnpm update` misses them. **Strategy:** update
inside `apps/web`, then run the web test suite (happy-dom) and `pnpm --filter @axis/web build`.
Minor bumps on React 19 — low risk, but the web suite is the only thing that would catch a
render regression.

### C7 · `node-llama-cpp` 3.19.1

**Verified:** real and load-bearing — it is the SOVEREIGN in-process inference backend in
`apps/api/src/embeddings.ts`, not optional tooling. Native dependency.

**Strategy:** bump alone, and verify the *native* path actually loads on both CI platforms
rather than trusting a green unit run — a native module can install fine and fail at dlopen.
If the sovereign backend is not reachable in production today, say so in the PR rather than
implying it was exercised.

---

## D · Guard gaps found while working

### D1 · 18 program endpoint tests hardcode their file counts

**Verified:** `apps/api/src/api.test.ts` asserts a literal count per program endpoint. Adding
a generator requires editing it by hand and **nothing flags the omission** — app_30 shipped
past all six honesty guards and was caught only by this assertion failing in CI.

**Strategy — model the relationship, do not substitute the constant.** The naive fix
(derive every count from `PROGRAM_OUTPUT_COUNTS`) is wrong: `superpowers` correctly asserts 5
while the manifest says 8, because that endpoint returns a subset (the three verify-gate files
come from elsewhere). Doing it anyway would look like cleanup while breaking a correct
assertion. The real fix is an explicit endpoint-outputs map — what each endpoint *returns*, as
distinct from what the program *owns* — with a guard asserting both, so the divergence is
declared rather than accidental.

---

## E · Test suite (`infra_01_test_suite_cost`)

Levers 1 and 2 are shipped and CI-green. Of the rest:

**Levers 3 and 4 (vitest project split, per-worker databases): recommend SKIP.** Their entire
justification was database contention, and lever 1 removed it — the reset went from ~7.8s to
~150ms and the bottleneck moved to module import. Re-measure before spending a day on either;
the measurement will likely say no.

**Lever 5 (33 `*-branches*` files, ~1,500 tests): MEASURED 2026-08-05.**

In `packages/generator-core` alone: **21 branches files hold 1,060 of its 2,245 tests — 47%
of the package's test count.** Running that package's suite with and without them:

| metric | with | without | delta |
|---|---|---|---|
| lines | 46.98 | 45.46 | −1.52 |
| statements | 45.05 | 43.48 | −1.57 |
| functions | 29.39 | 28.79 | −0.60 |
| branches | 27.84 | 25.53 | **−2.31** |

(Absolute values are low because only one package's tests ran while the whole repo was
instrumented — the DELTA is the meaningful figure.)

**The thresholds are not at risk.** Full-suite coverage in CI is statements 89.44 / branches
79.12 / functions 87.89 / lines 90.88, against thresholds of 60/60/50/60 — roughly **29 points
of headroom on every metric**. Losing ~2.3 points of branch coverage leaves branches near 77%,
still 27 points clear.

**Conclusion: consolidation is SAFE from a threshold standpoint.** 1,060 tests buy 2.31 points
of the metric they are named for. Nothing about the coverage gate requires keeping them.

**What this measurement cannot tell you, and the reason it is not an instruction to delete:**
coverage counts lines EXECUTED, not assertions that would catch a regression. A mechanically
generated branch test can execute a great deal while asserting almost nothing — so a small
delta proves these files are not load-bearing for the GATE, not that they catch nothing. The
remaining question is qualitative: do they encode real expectations, or do they exist to move
a number? That is a reading task, not a measuring one.

**Also worth noting:** thresholds of 60/60/50/60 against actual coverage of ~90/79/88/91 are
so slack they would not fail until roughly a third of the suite was deleted. They are not
currently protecting anything. Raising them toward actual (with headroom) would turn a
decorative gate into a real one — a cheaper and more useful change than deleting tests.

---

## F · Ledgers

### F1 · `continuation.yaml` — retire it rather than maintain it

**Verified:** it is a snapshot of session 121 (2026-06-11), self-flagged as unmaintained, and
its own header says *"For current truth, read the code, not this file"* — while its
`reference_policy` still says `after_session: update_this_file: true`. Its stated counts are
wrong today.

**Strategy:** the repo already has two live ledgers (`begin.yaml` for the candidate queue,
`HARDEN_POLISH_LOOP.md` for phase state). A third, hand-maintained one that instructs readers
not to trust it is worse than none — it is a standing invitation to cite stale numbers.
Either retire it (replace the body with a pointer to the two live ledgers and the code) or
generate it mechanically from `counts.ts` + git. **Do not hand-maintain it**; that is what
produced the current state.

**Gate:** owner call — it is a record of their project, and deleting a ledger is not a
janitorial decision.

---

## G · Revenue (Tier 1) — all currently gated

Recorded so the gates are visible, not because engineering is blocked:

| Item | Gate |
|---|---|
| **1.1 Recurring billing** | Gated on the Terms change dated **2026-08-15**. Until then every "subscriber" pays once and keeps the tier forever — the ToS auto-renewal claim was false and has been corrected. |
| **1.2 Publish `axis-iliad` to npm** | Built, zero-dependency, smoke-tested in CI, unpublished. Needs npm credentials and an owner decision to publish. `CLI_PUBLISHED = false` gates the install docs, so the honesty guard already handles the interim. |
| **1.4 Tempo/USDC rail** | `TEMPO_RECIPIENT_ADDRESS` unset in production — owner must supply an address. |
| **1.5 Spec-compliant x402 front door** | Effort L and needs a design decision (STRATEGY option C), possibly a facilitator dependency. Stock x402 clients cannot pay AXIS today. |

---

## Recommended sequence

Assuming the owner unblocks the gated decisions, the order that clears the most risk per unit
of effort:

1. **A1 guard** — write the attestation honesty test now; it needs no decision and turns the
   oldest live false claim into a red build.
2. **C1, C2, C3** — remove dead `uuid`, close #250, take Vite 8.1.5. Clears three PRs in an
   afternoon with near-zero risk.
3. **A2** — tighten the `CAPABILITY_GRADE` regex, delete the two Grade-A assertions, move both
   packs into the guarded corpus.
4. **D1** — endpoint-outputs map, so the next generator cannot slip past the guards.
5. **C4, C6, C7** — the tractable majors, one at a time, each with its own CI run.
6. **B1** — `mppx`, with characterization tests and live PAI'D verification.
7. **C5** — TypeScript 7 last, alone, once everything else is stable.
8. **E lever 5** — measure, then decide.

`app_*` capability work resumes after 1–4; those four are what the ordering law puts ahead of
it, and none of them is large.
