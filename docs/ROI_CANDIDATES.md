# ROI Candidates — ranked continuation list

**Phase T.2 deliverable.** Companion to [`PLATFORM_TREE.md`](./PLATFORM_TREE.md) (what exists) and
[`CONFIDENCE_REPORT.md`](./CONFIDENCE_REPORT.md) (what is trustworthy).

Generated 2026-07-27. Every row is evidence-cited. Where a claim could not be verified from the
repository — anything living only in a provider dashboard — the row says so instead of guessing.

**Ranking basis.** Sorted by *expected value per unit of effort*, with a hard tie-break: anything
that makes a **false public claim** or **silently loses money/signal** outranks anything that merely
adds capability. That ordering is not editorial preference — it follows the repo's own honesty law
(`HARDEN_POLISH_LOOP.md` rule 9: a claim ships only when its acceptance test is green).

Legend — **Effort:** S ≤ half a day · M ≈ 1–3 days · L > 3 days or needs design.
**Impact:** `revenue` (moves cash) · `strategic` (moves position) · `enabling` (unblocks other work) ·
`integrity` (stops a false claim or a silent loss).
**Confidence:** how sure we are the row is both real and correctly scoped.

---

## Tier 0 — Integrity: live defects and false claims

These are not features. Each one is currently telling a customer, an agent, or an operator
something untrue, or losing something silently.

> **Sweep status — 2026-07-27, commit `0f2c32d`.** Four of the seven Tier 0 rows are **CLOSED**:
> 0.0 (Programs page), 0.2 (dead `/v1/openapi`), 0.4 (stale activation tracker), and 0.6 (orphan
> secrets — annotated; the deletion itself stays an owner call, P8).
>
> Of the remaining three: **0.1 alerting is DEFERRED by owner** (2026-07-27) — an accepted risk,
> not a fixed one; the gap it describes is still fully true. **0.3 attestation** and **0.5
> code-sandbox** stay owner-gated on a choice of remedy and a hosting decision respectively. No
> engineering work blocks any of the three.

| # | Candidate | Tree position | Effort | Impact | Gates / dependencies | Confidence |
|---|---|---|---|---|---|---|
| 0.0 | ✅ **CLOSED `0f2c32d`** — **The public Programs page advertised 37 output files that no generator produces.** `apps/web/src/pages/ProgramsPage.tsx:15-218` hand-types an `outputs` list per program; 37 of 97 names have no generator behind them. For the **free `skills`** program all five are fictional — the page promises `copilot-instructions.md`, `cursor-rules.md`, `windsurf-rules.md`, `aider-conventions.md`, `ai-onboarding.md`; the generator emits `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `workflow-pack.md`, `policy-pack.md`, `model-cascade.md` (verified firsthand — **zero overlap**). `canvas` is likewise 5/5 fictional. This is on the free tier, so it is the first promise a new customer sees, and **no guard test covers it** — `count-honesty` pins scalar counts, never filename lists. | Branches › Web › Programs page | S | **integrity** | None. Derive the lists from `program-manifest.ts` instead of hand-typing, and add a guard test so it cannot drift again. | **High** — diffed page against manifest directly |
| 0.1 | ⏸ **DEFERRED by owner 2026-07-27 — accepted risk, still true.** **Turn on threshold alerting.** `ALERT_WEBHOOK_URL` is absent from `render.yaml`, so `startAlerting()` logs `alerting_disabled` and returns — no timer, no evaluation (`apps/api/src/alerting.ts:97-101`, verified firsthand). **Nothing pages on a 5xx spike.** The only live signal is a 30-min synthetic that files a GitHub issue. Same failure class as the `RESEND_FROM_ADDRESS` gap fixed 2026-07-26. | Roots › Observability › Alerting | S | integrity, enabling | Owner must supply a webhook URL (Slack/Discord/PagerDuty). Then pin it in `render.yaml`, not the dashboard. | **High** — verified in repo and in code |
| 0.2 | ✅ **CLOSED `0f2c32d`** — **Fix or retract `/v1/openapi`.** Advertised in MCP registry metadata (`apps/api/src/mcp-server.ts:889`) but **404s live** (verified: `GET /v1/openapi` → 404, `GET /openapi.json` → 200). Registry crawlers and agents following `_meta.openapi` hit a dead URL. | Branches › MCP › registry metadata | S | integrity, strategic | None. Additive alias, or correct the metadata. Note: adding a route bumps `ENDPOINT_COUNT` and cascades through 6 count-guarded files. | **High** — verified live |
| 0.3 | **Resolve the false attestation.** `packaging/trust-fabric/attestation.json` has `generated_at: "1970-01-01T00:00:00.000Z"` and a merkle root predating months of changes, yet `release.yml` verifies and attaches it to every GitHub Release. It asserts integrity over bytes that no longer match. | Roots › CI/CD › release | S | integrity | Owner decision (R5.6): make `make attest` regenerate at ship time, **or** mark the files `SAMPLE`. Leaving a false attestation published is the one option excluded. | **High** — file inspected |
| 0.4 | ✅ **CLOSED `0f2c32d`** — **Reconcile `ACTIVATION_TRACKER.md` with production.** It lists E-A/E-B/E-C (Stripe, PAI'D live, Render env) as ⬜ not-started, but production reports `payment_rail: live` and PAI'D config is pinned in `render.yaml`. The estate's revenue-readiness tracker is stale in the optimistic direction's opposite — it understates progress, so it can't be used to decide anything. | Roots › Payment rails | S | enabling | None — pure reconciliation against live state. | **High** — probed `/v1/health/ready` |
| 0.5 | **Decide `iliad_code_sandbox`'s fate.** A **paid** tool (5¢ std / 2¢ lite / 25¢ engineer) whose own source says it cannot work on this host: *"Render.com's standard services do NOT expose /var/run/docker.sock"* (`apps/api/src/code-sandbox.ts:26-30`). It fails safe — returns `_not_configured`, never charges — so this is a catalog-honesty problem, not a billing one. | Branches › MCP › paid tools | M | integrity, strategic | Either move to a Docker-capable host (Render Private Service w/ DinD, or self-hosted), or delist. Owner call on hosting spend. | **High** — code comment + host config |
| 0.6 | ◐ **ANNOTATED `0f2c32d`; deletion still owner-gated (P8)** — **Remove or implement `REPLICATE_API_TOKEN` / `FASTIO_API_KEY`.** Both are provisioned as `sync: false` production secrets in `render.yaml` for capabilities with **zero integration code** — `FASTIO_API_KEY` appears in exactly one place, the env spec (verified firsthand). Provisioned secrets that nothing reads are attack surface and operator confusion. | Roots › External integrations | S | integrity | None. Decide: build the integration or drop the vars. | **High** — grepped all non-test source |

---

## Tier 1 — Revenue: the shortest paths to money

| # | Candidate | Tree position | Effort | Impact | Gates / dependencies | Confidence |
|---|---|---|---|---|---|---|
| 1.1 | **Recurring billing — ⚠ RE-GATED 2026-07-27, this is now OUR work, not PAI'D's.** Today "Pro $99/month" is still **a one-time charge**: every "subscriber" pays once and keeps the tier forever. But the stated blocker was wrong. Iliad's client assumes recurring means `checkout/sessions` with `mode: "subscription"`, which PAI'D 501s (`packages/paid-client/src/index.ts:270-288`) — and that assumption is stale. **PAI'D's live public OpenAPI now declares a full subscription resource**: `POST /v1/plans` (+ activate/archive), `POST /v1/subscriptions` ("Create a subscription to a billing plan"), `/v1/subscriptions/{id}/{cancel,pause,resume,generate_cycle}`, and `/v1/billing_cycles` (+ `/charge_result`) — all documented `200`, none `501`. Iliad calls **none** of them: its only `/v1/subscriptions` calls go to **Stripe** (`apps/api/src/stripe.ts:277,618`). So the largest revenue gap in the platform is no longer blocked on another team. | Roots › Payment rails › PAI'D | L | **revenue** | **No longer `gated(external)` on PAI'D's roadmap — now gated on a CONTRACT, which is a much smaller ask.** Owner confirmed 2026-07-27 there are **no existing customers**, so the migration/grandfathering question is moot and there is no live revenue to break. One blocker remains: **PAI'D's spec lists the routes but not their shapes.** It carries 38 component schemas, none for Subscription/Plan/BillingCycle, and only **5 of 174** write operations document a `requestBody` — none of them the subscription ones; the `200`s are bare `{"description":"Success"}`. Building against guessed field names would compile, pass self-authored stubs, and fail against real PAI'D — the exact anti-pattern `@axis/ap2` already flags. Unblocked by **either**: a `PAID_API_KEY` to probe the live contract, or the request/response schemas from PAI'D directly. Then it is L-effort money-path work under repo rule 7. | **High** on the capability (spec fetched + parsed 2026-07-27; Iliad-side absence grepped). *Contract shapes: unknown, and deliberately not guessed.* |
| 1.2 | **Publish the `axis-iliad` CLI to npm.** Built, zero-runtime-dependency, smoke-tested in CI — and unpublished. `CLI_PUBLISHED = false` (`apps/web/src/pages/DocsPage.tsx:1436`) forces the docs to show a tarball path instead of `npx`. No `npm publish` exists anywhere in CI (`Makefile:15-16`). This is the top-of-funnel wedge per [[iliad-md-product-strategy]]. | Branches › CLI | S | **revenue**, strategic | `gated(owner)` — npm credential. Repo law HOLD; owner must lift. | **High** — flag + test + Makefile all confirm |
| 1.3 | ✅ **CLOSED — no work needed. Re-audited 2026-07-27; the lever was already shut.** Recorded as revenue lever #1 in [[monetization-activation-workstream]], but that note is **stale**. `analyze_repo`/`analyze_files` lite promises "search/skills/debug only (3 of 20 programs)" and **both** twins enforce it: MCP via `restrictGeneratorsForLiteMode` (`mcp-tool-impls.ts:1513`, called at `:1957` and `:2113`) and REST via the inline gate `(!lite \|\| FREE_PROGRAMS.has(prog))` (`handlers.ts:1987`). Both are regression-tested — `analyze.test.ts:550` ("lite mode restricts output to search/skills/debug even for a fully-entitled account") and `mcp-server.test.ts:608`. Input-transform caps are separately pinned bidirectionally against their `lite_description` copy by `lite-caps.test.ts`. The one remaining `mode === "lite"` price-only site is the crawl cap at `handlers.ts:4836`, which *does* restrict pages. | Branches › MCP › metering | — | — | None — verified closed, not deferred. | **High** — traced both twins to their tests |
| 1.4 | **Turn on the Tempo/USDC token rail.** `TEMPO_RECIPIENT_ADDRESS` is unset in production (live-verified, `docs/x402/STRATEGY.md:70,110`), so the 402 envelope serves a Stripe-only rail. Setting it makes token-first payments live and is what most x402-speaking agents expect. | Roots › Payment rails › mppx | S | **revenue**, strategic | `gated(owner)` — a wallet address. Also `mpp.ts:90-98` discloses an unresolved testnet asset-constant mismatch; verify against live mppx first. | **Medium-High** — gate verified; asset bug is disclosed-unfixed |
| 1.5 | **Spec-compliant x402 front door.** Stock x402 clients **cannot pay AXIS today** — AXIS settles on Tempo (chainId 4217/42431) with an `mppx/*` dialect, not the Base-USDC + facilitator flow the ecosystem implements. Ranked Critical/High in `docs/x402/STRATEGY.md:107-134`. | Branches › MCP › x402 | L | **revenue**, strategic | Design decision (STRATEGY option C). Possibly a facilitator dependency. | **High** — strategy doc is explicit |

---

## Tier 2 — Strategic: distribution and position

| # | Candidate | Tree position | Effort | Impact | Gates / dependencies | Confidence |
|---|---|---|---|---|---|---|
| 2.1 | **Official MCP registry listing.** All the metadata already exists and is served (`/.well-known/mcp.json`, `/v1/mcp/server.json`). Mostly a submission, not a build. | Branches › MCP › discovery | S | strategic | `gated(owner)` — registry account. Fix 0.2 first so the advertised OpenAPI URL resolves. | **High** |
| 2.2 | **Glama + Smithery listings.** `/.well-known/glama.json` is already served. Tracked as E-D3. Note R5.5: `Dockerfile.glama` is **broken** (copies 4 workspace packages; the API needs 8) while the live listing advertises self-hosting from it. | Branches › MCP › discovery | S | strategic | `gated(owner)` — dashboard access to confirm whether a custom dockerfile path is configured. | **High** |
| 2.3 | **GitHub App + Marketplace Action.** A second funnel (E-D4). | Branches › GitHub intake | L | strategic | **HOLD** (rule 11) — `docs/github-app-plan/` is off-limits without explicit owner instruction. | **High** — hold is explicit |
| 2.4 | **Enable the anonymous MCP provisioning front door.** Built and tested; converts a dead-end 401 into a routing pointer for anonymous agents. `AXIS_ANON_PROVISION_FRONTDOOR` is not declared in `render.yaml` and defaults off (`anon-frontdoor.ts:32-35`). | Branches › MCP › onboarding | S | strategic | Owner decision — it is a deliberate default-off, not an oversight. Watch abuse surface. | **High** |
| 2.5 | **Restore `iliad_network_tokenization` read/provision.** Half the tool is hard-disabled after a real security fix: both ops resolved a caller-supplied payment-method id against the platform's own Stripe key with **no ownership check** (`mcp-tool-impls.ts:922-956`). Honestly disclosed in `tools/list`, so this is unbuilt capability, not a lie. | Branches › MCP › commerce | L | strategic | Needs a new account↔payment-method ownership model in the data layer. Real design work. | **High** — root cause documented in code |

---

## Tier 3 — Enabling: make future work cheaper and safer

| # | Candidate | Tree position | Effort | Impact | Gates / dependencies | Confidence |
|---|---|---|---|---|---|---|
| 3.1 | **Triage 13 open Dependabot PRs**, including majors: TypeScript 7, Vite 8, uuid 14, Node 26 image, checkout v7. Verified open. | Roots › CI/CD | M | enabling | `gated(owner)` — repo law forbids dependency changes without discussion (rule 11). Never git-delete a dependabot branch; it reopens. | **High** — `gh pr list` |
| 3.2 | **Branch hygiene: 116 local / 174 remote.** Verified counts. Local `git branch -d` is self-verifying; the remote sweep is irreversible. | Roots › Repo | S | enabling | `gated(owner)` — R5.1 standing ruling requires confirmation. Present the exact list; delete nothing unilaterally. | **High** |
| 3.3 | **Close or land PR #97** (`feat/launch-prep-1`) — the only branch with genuinely unlanded work (a 492-line competitive analysis + debug-generator changes). Its own count claims are stale. | Roots › Repo | M | enabling | `gated(owner)` — R5.2. Cherry-pick candidates; do not force-land. | **High** — PR verified open |
| 3.4 | ◐ **EVIDENCE GATHERED, still owner-gated** — **Remove the unused 1 GB `/data` disk** from `render.yaml`. Nothing mounts it since the Neon migration — zero code references. | Roots › API hosting | S | enabling | Confirmed 2026-07-27 via Render's API that the disk really is provisioned (`dsk-d7c2hi28qa3s738oug1g`, 1 GB, `/data`) and code still has **zero** references to the mount. Render's public API exposes **no disk-usage endpoint** (`/v1/disks/...` → connection refused), so "is it empty?" still needs the dashboard, and deletion is irreversible — genuinely an owner call. Must land as one change set across `render.yaml`, `docker-compose.yml`, `deployment.test.ts` + 2 runbooks. | **High** |
| 3.5 | ✅ **CLOSED** — **Declare `autoDeploy` explicitly in `render.yaml`.** Verified against Render's API that the live service has `autoDeploy: yes` on branch `main`, so "push equals deploy" — the single most load-bearing operational fact in this repo — existed only as an untracked dashboard default. Now pinned to match reality. | Roots › API hosting | S | enabling | None. | **High** — verified live, then declared |
| 3.6 | ✅ **CLOSED** — **Make the Cloudflare deploy path unambiguous and loud.** Resolved against Cloudflare's API, not left as a question: the `axis-web` project has **`source: null`** — the Git connection was never made, so `cloudflare-pages.md`'s procedure describes a path that was planned and not adopted. **GitHub Actions + wrangler is the SOLE deploy path**, and it works (6 consecutive `direct_upload` successes on 2026-07-27). Removed its `continue-on-error: true`: masking failure on the only deploy path meant a green CI beside a silently stale site. `cloudflare-pages.md` now opens by saying it is not the live setup. | Roots › Web hosting | S | enabling, integrity | None — was owner-gated only for lack of dashboard visibility. | **High** — Cloudflare API |
| 3.7 | **Un-suppress the web-origin synthetic check.** `web_bundle_marker` is permanently excluded from alerting because Cloudflare challenges GitHub runner IPs (`scripts/live-probe.mjs:126`). Net effect: a real web outage is only caught indirectly. | Roots › Observability › synthetic | M | integrity | Needs a probe source Cloudflare won't challenge, or a CF Access service token. | **High** |
| 3.8 | **Industrial test tooling** — Stryker (mutation), fast-check (property), knip (dead exports), Playwright (browser e2e). Each replaces a hand-rolled H8 technique with the maintained version. | Roots › CI/CD › quality | L | enabling | `gated(owner)` — each is a new dependency; repo law requires discussion. | **High** |
| 3.9 | **Branch protection + required checks on `main`.** | Roots › Repo | S | enabling | `gated(owner)` — deliberately deferred: it changes the push-equals-deploy workflow this loop and the operator both rely on. | **High** |
| 3.10 | **Per-page SEO metadata.** Every route shares one `<title>`/description/canonical; there is no helmet-equivalent. The new `/feedback` page ships `ContactPage` JSON-LD, but its `<title>` is the site-wide one. | Branches › Web | M | strategic | None — but adding a dependency needs discussion; a hand-rolled head manager does not. | **High** |

---

## Tier 4 — Deferred / cross-repo

| # | Candidate | Tree position | Effort | Impact | Gates / dependencies | Confidence |
|---|---|---|---|---|---|---|
| 4.1 | **Engineer-tier E7/E10/E11/E12.** | Branches › MCP › modes | M | revenue | `gated(owner)` — each needs a new dependency ([[engineer-tier]]). | **Medium** — not re-verified this pass |
| 4.2 | **PAI'D user-controlled wallets (MTL risk).** Deployed PAI'D Circle wallets are dev-controlled — PAI'D holds a signing key over third-party funds. Engineering may proceed; **onboarding third parties waits for counsel**. | External › PAI'D | L | strategic | `gated(external)` — legal. Different repo. | **High** — [[paid-mtl-risk-finding]] |
| 4.3 | **Stripe connected-account cutover** (`acct_1Ts5YxDwUJERAuEd` exists). | Roots › Payment rails | M | revenue | `gated(owner)` — **HOLD** (rule 11), owner decision. | **High** |
| 4.4 | **WO-A6 async runs / SSE**, multipart ZIP intake, status-page incident history. | Branches › REST | M–L | enabling | None identified. | **Low-Medium** — carried from the seed list, not re-scoped this pass |
| 4.5 | **assetforge LOCAL-backend GPU vertical.** | External › Foundry | L | strategic | Different product; see [[slate_vision]] / Foundry track. | **Low** — outside this repo |

---

## What changed versus the seeded list

Phase T.2's spec seeded ~15 candidates. This pass:

- **Promoted to Tier 0 (new):** alerting-off, dead `/v1/openapi`, false attestation, stale activation
  tracker, code-sandbox host mismatch, orphan secrets. None were in the seed list; all six were found
  by direct verification during Phase T and all are live-integrity issues.
- **Re-ranked upward:** recurring billing (1.1) — the seed list did not carry it at all, yet it is the
  largest revenue gap in the platform.
- **Confirmed and kept:** npm publish, MCP registry, Glama/Smithery, GitHub App (HOLD), Dependabot,
  branch pruning, PR #97, `/data` disk, branch protection, test tooling, engineer tiers, PAI'D MTL,
  Stripe cutover.
- **Deliberately not re-scoped:** WO-A6 async/SSE, multipart ZIP, status-page history, assetforge —
  carried at low confidence because they were not verified this pass. Do not treat their effort
  estimates as reliable.

## How to use this list

1. **Tier 0 first, always.** Every row there is currently saying something untrue or losing a signal.
   Most are S-effort.
2. **Nothing here is started without checking its gate.** Rows marked `gated(owner)` /
   `gated(external)` are blocked on something no amount of engineering resolves — see the
   PENDING-OWNER table in [`CONFIDENCE_REPORT.md`](./CONFIDENCE_REPORT.md).
3. **Confidence is not impact.** A Low-confidence row is not low-value; it means the estimate is soft
   and it needs scoping before it is scheduled.
