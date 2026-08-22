# Platform Tree — Axis' Iliad

**Phase T.1 deliverable.** The whole system as a tree: **roots** (infrastructure it stands on),
**branches** (surfaces it presents), **leaves** (individual capabilities).

Generated 2026-07-27 against HEAD `00db278`. Companion to
[`ROI_CANDIDATES.md`](./ROI_CANDIDATES.md) (what to do next) and
[`CONFIDENCE_REPORT.md`](./CONFIDENCE_REPORT.md) (what is trustworthy).

## How to read this

Every leaf carries a status. **Nothing aspirational appears unmarked** — that is the document's
one hard rule.

| Status | Meaning |
|---|---|
| `shipped` | Code path exists and executes. Verified by file, endpoint, or live probe. |
| `gated(owner)` | Code is complete; blocked on a credential, a host, or a decision the owner controls. |
| `gated(external)` | Blocked on a third party — network onboarding, an acquirer, another product's roadmap. |
| `candidate` | Described somewhere but **not implemented here**. |

**Verification boundary.** Everything below is verified from repository contents or a live probe run
on 2026-07-27. Any value declared `sync: false` in `render.yaml` lives only in the Render dashboard
and **cannot be verified from this repo** — those are marked *unverifiable-from-repo* rather than
assumed working. That distinction is load-bearing: on 2026-07-26 a dashboard-only
`RESEND_FROM_ADDRESS` was one Blueprint sync away from silently killing all email.

---

# ROOTS — infrastructure

## Data layer — Neon Postgres · `shipped`

| Leaf | Status | Evidence |
|---|---|---|
| Async pg data core (no ORM) | `shipped` | `packages/snapshots/src/pg.ts:19-49`; `pg` ^8.22.0 |
| SQL-aware `?`→`$n` placeholder rewriter (skips string literals, dollar-quotes, comments, jsonb `?|`) | `shipped` | `pg.ts:70-182` |
| Transactions with explicit BEGIN/COMMIT/ROLLBACK | `shipped` | `pg.ts:184-236` (`sql.tx`) |
| Migrations at boot, fail-open | `shipped` | `pg-schema.ts:762-787`; `router.ts:251-262` — on failure it still binds, `/v1/health/ready` reports `not_ready`, retries in background |
| **46 tables, schema version 40** | `shipped` | Baseline `PG_SCHEMA` (41 tables) + 5 net-new from migrations 28–40 |
| Full-text search via `tsvector` + GIN (replaced FTS5) | `shipped` | `pg-schema.ts:144-147` |
| SQLite fully retired | `shipped` | `better-sqlite3` in zero `package.json`; retirement CI-enforced by `count-honesty.test.ts:120` |
| `DATABASE_URL` | *unverifiable-from-repo* | `render.yaml:38-39` (`sync: false`) |
| Stale `axis.db` (3 MB) at repo root | dead artifact | Nothing opens it |
| `lemon_squeezy_subscriptions` table | dead schema | DDL exists (`pg-schema.ts:254-271`); **no code reads or writes it** |

## API hosting — Render `axis-api` · `shipped`

| Leaf | Status | Evidence |
|---|---|---|
| Docker web service, Oregon, `starter`, 1 instance | `shipped` | `render.yaml:7-19` |
| 3-stage build, non-root user, port 4000 | `shipped` | `Dockerfile:3-26` |
| Health check `/v1/health` (Render + container-level) | `shipped` | `render.yaml:18`; `Dockerfile:25` |
| 32 env keys — 13 literal, **19 owner-set** | mixed | `render.yaml:21-135` |
| **`autoDeploy` not declared** | *unverifiable-from-repo* | Absent from `render.yaml` (verified firsthand). Auto-deploy-on-push relies on a dashboard default, not config — see ROI 3.5 |
| **1 GB `/data` disk, unused** | dead config | `render.yaml:136-139`; **zero** code references to the mount since the Neon migration — see ROI 3.4 |

## Web hosting — Cloudflare Pages `axis-web` · `shipped`

| Leaf | Status | Evidence |
|---|---|---|
| Live site at `iliad.trustfabric.ai` | `shipped` | Live probe 2026-07-27 → 200 |
| SPA fallback + security headers (CSP, HSTS, frame-ancestors) | `shipped` | `apps/web/public/_redirects`, `_headers` |
| **Two competing deploy paths documented** | ambiguous | GH Actions wrangler (`ci.yml:186-220`) vs Cloudflare Git-connect (`cloudflare-pages.md:6-20`). Which is operative is *unverifiable-from-repo* |
| **Actions deploy is `continue-on-error: true`** | risk | `ci.yml:220` — a broken web deploy does not fail CI. See ROI 3.6 |

## CI/CD — 7 workflows · `shipped`

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | push/PR to `main` | Affected-package detection → reusable suite → web deploy → secret scan → live probe |
| `reusable-test-suite.yml` | `workflow_call` | Build + vitest (vs real `postgres:16`) + full typecheck + full lint + freshness gate |
| `nightly.yml` | cron 09:00 UTC | Full regression backstop for anything affected-narrowing misses |
| `synthetic.yml` | cron every 30 min | Live production probe → opens/closes a GitHub issue |
| `release.yml` | tag `v*` | `make ship`, GHCR image, GitHub Release + attestation bundle |
| `compliance-check.yml` | PR/push | AP2/Visa compliance gate, minimum grade B |
| `context-freshness.yml` | PR | Agent-context drift — **warn-only** (`fail-on-drift: false`) |

`docker-build` and `deploy-api` are **break-glass only** (`workflow_dispatch`, `ci.yml:85,166`).

## Payment rails — four rails, **one live**

| Rail | Status | Evidence |
|---|---|---|
| **PAI'D hosted checkout** | `shipped` | `packages/paid-client/src/index.ts:274-306`; live probe `payment_rail: live` |
| ↳ **one-time charges only** | constraint — **but self-imposed as of 2026-07-27** | `index.ts:270-288` sends `mode: "payment"` because PAI'D 501s on `mode: "subscription"`. That is still true of *that endpoint*, but it is no longer the whole story: PAI'D's live public OpenAPI declares a separate subscription resource (`POST /v1/plans`, `POST /v1/subscriptions`, `/subscriptions/{id}/{cancel,pause,resume,generate_cycle}`, `/v1/billing_cycles`), all `200`. **Iliad integrates none of it** — its only `/v1/subscriptions` calls go to Stripe (`stripe.ts:277,618`). So "no recurring billing" is now an Iliad gap, not a PAI'D one. See ROI 1.1 |
| ↳ PAI'D subscription webhooks | dead code | `paid-handlers.ts:229-237` — self-labeled *"currently DEAD IN PRODUCTION"*; nothing creates a PAI'D subscription |
| Stripe webhook receiver + subscription cancel | `gated(owner)` | `stripe.ts:463-534`; keys `sync: false` |
| ↳ Stripe checkout **creation** | deliberately removed | `stripe.ts:536-550` — *"PAI'D is the ONLY checkout … never resurrect this endpoint"* |
| mppx / x402 — Stripe SPT leg | `gated(owner)` | `mpp.ts:110-149` — returns `null` without `STRIPE_SECRET_KEY` |
| mppx / x402 — **Tempo USDC leg** | `gated(owner)` | `TEMPO_RECIPIENT_ADDRESS` unset; `render.yaml:80` records the rail **verified OFF** 2026-07-14 |
| PAI'D Fabric-Credit wallet | `gated(owner)` | Double-gated: `PAID_WALLET_MODE` defaults `off` **and** an empty owner allowlist fails closed (`cashier.ts:79-83`). Live canary **never run** |
| **Stripe Connect** | `candidate` | **Zero code in this repo.** Settlement to the owner happens inside PAI'D (`H1_INBAND_SETTLEMENT.md:37-41`) |

## External integrations

| Service | Status | Unset behavior |
|---|---|---|
| Resend (email) | `gated(owner)` | Needs **both** `RESEND_API_KEY` + `RESEND_FROM_ADDRESS`; feedback → 503, MCP tool → `_not_configured` |
| Firecrawl | `gated(owner)` | **Not the default** — `sovereign` (AXIS-owned crawler, no key) is |
| OpenAI embeddings | `gated(owner)` | Not the default — `local` GGUF is |
| GitHub / Google OAuth | `gated(owner)` | 503 "not configured" |
| GitHub repo intake | `shipped` (degrades) | `GITHUB_TOKEN` is a fallback; unauthenticated calls work at lower rate limits |
| Cloudflare R2 | `gated(owner)` | All four `R2_*` absent from `render.yaml` |
| Visa VTS / Mastercard MDES | `gated(external)` | *"Requires Visa network onboarding — cannot be obtained by code"* (`env.ts:89-90`) |
| **Replicate** | `candidate` | Secret provisioned (`render.yaml:118-119`); **zero integration code** (verified firsthand) |
| **Fastio** | `candidate` | Secret provisioned; appears in **exactly one place** — the env spec |
| HuggingFace | *not an integration* | Doc URLs + a secret-scanner regex only. No API call |

**Design contract worth stating:** MCP surfaces return a structured `{_not_configured: true, …}`
envelope naming the missing env var and are **not billed**; REST surfaces return 503. Documented at
`logger.ts:193-195`.

## Observability

| Leaf | Status | Evidence |
|---|---|---|
| Structured JSON logging → Render log stream | `shipped` | `logger.ts:224-244`. **No shipper, no aggregator, no APM, no tracing** anywhere in the repo |
| Error-code catalog (29 entries) served at `/v1/error-codes` | `shipped` | `logger.ts:111-202`; 1:1 coverage asserted by `logging.test.ts` |
| Prometheus `/v1/metrics` | `shipped` (endpoint) | `metrics.ts:128-201`. **No scraper configured anywhere** — collection *unverifiable-from-repo* |
| Health / readiness | `shipped` | `metrics.ts:102-124`. Readiness gates only on shutdown + PG integrity; `payment_rail` is diagnostic-only and deliberately never gates ready |
| **Threshold alerting** | `gated(owner)` | **`ALERT_WEBHOOK_URL` absent from `render.yaml`** (verified firsthand) → `startAlerting()` logs `alerting_disabled` and returns. **Nothing pages on a 5xx spike.** Also: only one condition exists (error rate). See ROI 0.1 |
| Synthetic monitor, 6 checks / 30 min → GitHub issue | `shipped` | `synthetic.yml`; `scripts/live-probe.mjs`. No pager, no email, no Slack |
| ↳ `web_bundle_marker` **permanently suppressed** | gap | `live-probe.mjs:126` — Cloudflare challenges runner IPs, so a real web outage is caught only indirectly. See ROI 3.7 |

---

# BRANCHES — product surfaces

## REST API — 160 endpoints · `shipped`

179 registrations − 15 `.well-known` − 4 `/oauth` = **160**, matching `counts.ts:31` and guarded by
`counts-consistency.test.ts`. Exact-path matching only (`router.ts:63-100`) — anything unregistered 404s.

| Family | Count | Auth | Status |
|---|---|---|---|
| Health & ops | 10 | none | `shipped` |
| Docs / spec | 6 | none | `shipped` |
| Snapshots + versioning | 6 | required | `shipped` |
| Projects / context / memory / export | 9 | required | `shipped` |
| Programs / generation | 23 | required + metered | `shipped` |
| GitHub intake & webhooks | 3 | mixed (HMAC) | `shipped` |
| Web research proxy | 2 | required | `shipped` |
| Discovery / `.well-known` | 31 | none | `shipped` |
| **Feedback** | 1 | **none by design** | `shipped` — verified end-to-end 2026-07-27, ticket `AXIS-53D77C60` delivered |
| Search | 4 | required | `shipped` |
| MCP transport | 16 | tool-level | `shipped` |
| Accounts / keys / usage | 21 | required | `shipped` |
| Billing / credits / payments | 13 | required | mixed — see rails |
| Plans / funnel / seats | 10 | mixed | `shipped` |
| Customer webhooks | 5 | required | `shipped` |
| Admin | 5 | admin key | `gated(owner)` — 403 unless `ADMIN_API_KEY` set; **not declared in `render.yaml`** |
| OAuth login | 7 | none→session | `gated(owner)` |
| OAuth 2.0 AS | 4 | protocol | `gated(owner)` — without `JWT_*` keys the server falls back to an **ephemeral keypair and every issued token dies on restart** |

## MCP server — 43 tools · `shipped`

Protocol `2025-03-26`, Streamable HTTP. Live-probed 2026-07-27: `tools/list` returns a 108 KB catalog.
**20 metered, 17 free**, exhaustive at compile time (`mcp-runtime.ts:192-213`).

**Fully working paid tools** (`shipped`): `analyze_repo`, `analyze_files`,
`prepare_agentic_purchasing`, `closer`, `deploy`, `assemble_representment`, `iliad_web_research`,
`iliad_web_research_crawl`, `iliad_vector_database`, `iliad_analytics`, `iliad_web_search`,
`iliad_document_parsing`, `iliad_hygiene`.

**Paid tools that cannot run as deployed** — all fail safe (`_not_configured`, never charged):

| Tool | Status | Blocker |
|---|---|---|
| `iliad_code_sandbox` | `gated(owner)` | **Cannot work on this host.** `code-sandbox.ts:26-30`: Render standard services do not expose `/var/run/docker.sock`. Verified firsthand |
| `iliad_llm_inference` | `gated(owner)` | GGUF model not in the image |
| `iliad_embeddings` (local) | `gated(owner)` | GGUF model not in the image |
| `iliad_speech_to_text` | `gated(owner)` | Needs `whisper-cli` + ggml model, neither in the Dockerfile |
| `iliad_text_to_speech` | `gated(owner)` | Needs `piper` binary + `.onnx` voices |
| `iliad_object_storage` | `gated(owner)` | No `R2_*` vars declared |
| `iliad_transactional_email` | `gated(external)` | `RESEND_API_KEY` is `sync: false` |

**Free tools** (17, all `shipped`): `list_programs`, `get_snapshot`, `get_artifact`,
`prepare_agentic_purchasing_preview`, `search_and_discover_tools`, `discover_commerce_tools`,
`discover_agentic_purchasing_needs`, `improve_my_agent_with_axis`, `get_referral_code`,
`get_referral_credits`, `ping_payment`, `sca_exemption_decision`, `grade_compliance`,
`assemble_ce3_evidence`, `build_ap2_mandate`, `score_dispute_readiness`,
`iliad_network_tokenization`.

**Partially disabled leaf:**

| Leaf | Status | Evidence |
|---|---|---|
| `iliad_network_tokenization` — `capabilities`, `lifecycle` | `shipped` | `mcp-tool-impls.ts:878-920` |
| `iliad_network_tokenization` — **`read`, `provision`** | `candidate` | `mcp-tool-impls.ts:941-956` — always return `_not_configured`. Disabled after a real security finding: both resolved a caller-supplied payment-method id against the platform's Stripe key **with no ownership check**. Needs a new account↔payment-method data model. **Honestly disclosed in `tools/list` itself** (`mcp-tools.ts:1798`) |

**Broken advertised URL:** `mcp-server.ts:889` publishes `openapi: ".../v1/openapi"` in MCP registry
metadata. **That route does not exist** — verified live: `GET /v1/openapi` → 404, `/openapi.json` → 200.
See ROI 0.2.

**Deliberate absence, not a gap:** there is no image-generation tool. `PLANNED_CAPABILITIES` is an
**empty array** (`mcp-tools.ts:66`) — every advertised tool is real. Image/3D is delegated to sibling
AXIS Foundry (`mcp-server.ts:173-186`).

## Web app — 33 routes · `shipped`

13 auth-only, 2 admin-only, rest public. Table-driven from `routes.tsx` — adding a page is one entry.

| Notable leaf | Status | Evidence |
|---|---|---|
| Analyze → Project → Artifacts → Versions flow | `shipped` | `routes.tsx:285-403` |
| `/feedback` (new 2026-07-27) | `shipped`, runtime-gated | Page live; API 503s without Resend config |
| `status` page | `shipped`, honest by construction | `StatusPage.tsx:9-16` — explicitly refuses to show uptime % or incident history because no backend stores them |
| `changelog` | `shipped`, self-disclosing | `ChangelogPage.tsx:11-17` — states it lags `APP_VERSION` |
| `kitchen-sink` | dev aid | Hidden, reachable only by typing the hash |
| **`programs` page output lists** | ⚠ **`candidate` content on a `shipped` page** | `ProgramsPage.tsx:15-218` advertises **37 filenames with no generator behind them**; the free `skills` list is 5/5 fictional (verified firsthand). **Unguarded** — count-honesty pins scalars, not filename lists. See ROI 0.0 |
| `examples` page | `shipped`, static | Hand-written case studies about **sibling products**; its numbers are unverifiable from this repo |
| `plans` "Coming soon" renderer | dead affordance | `PlansPage.tsx:307` — nothing produces that value |

## CLI — `axis-iliad` · `gated(owner)`

| Leaf | Status | Evidence |
|---|---|---|
| 9 commands (`analyze`, `export`, `github`, `programs`, `list-programs`, `status`, `auth`, `help`, `version`) | `shipped` | `apps/cli/src/cli.ts:14-24` |
| Zero-runtime-dependency bundle; build fails if any bare specifier survives | `shipped` | `apps/cli/build.mjs` |
| pg-free `snapshots-lite` façade so the offline CLI never loads Postgres | `shipped` | generated at build |
| Docs/CLI parity CI-enforced | `shipped` | `cli-docs-parity.test.ts` |
| **npm publish** | `gated(owner)` | `CLI_PUBLISHED = false` (`DocsPage.tsx:1436`); **no `npm publish` step exists in any workflow or the Makefile**. See ROI 1.2 |

## Generator engine — 20 programs / 142 artifacts · `shipped`

Verified two independent ways: `PROGRAM_OUTPUT_COUNTS` sums to 142, and `Object.keys(REGISTRY).length`
= 142. Free tier = `search` (6) + `skills` (6) + `debug` (4) = **16 artifacts**, matching
`FREE_FILE_COUNT`.

Largest programs: `mcp` (19), `closer` (16), `deploy` (13), `artifacts` (11), `superpowers` (8).

| Property | Status | Evidence |
|---|---|---|
| Determinism — no wall-clock in any generator | `shipped`, structurally enforced | `generate.ts:281-283`; three determinism suites (core, CLI, iliad-md) assert byte-identical repeat runs |
| Injection resistance per program family | `shipped` | 19 `generators-*-injection.test.ts` |
| Marketing content banned from machine-readable outputs | `shipped` | `generators-decontamination.test.ts` |

## Compliance engines

The code here is **self-policing and accurate** — every unimplemented capability is already labeled
in-code. The exposure is in docs that repeat package descriptions verbatim.

| Leaf | Status | Evidence |
|---|---|---|
| CE 3.0 evidence assembly | `shipped` | `ce3.ts:141` — pure, deterministic, no network |
| Dispute state machine | `shipped` | `dispute-state-machine.ts:42-83` |
| **Stripe dispute rail** (fetch + submit evidence) | `shipped` | `dispute-clients.ts:87-128`, API pinned `2026-06-24.dahlia` |
| **VROL / Verifi / Ethoca (RDR, CDRN)** | `gated(external)` | `dispute-clients.ts:141-176` — both live methods **`throw NotImplementedError`**, even when enabled. ⚠ `package.json` says *"integration-ready behind AXIS_ENABLE_VROL"*, which reads as "works when enabled". It does not |
| Dispute win-probability | `shipped` as an **uncalibrated heuristic** | `dispute-win.ts:16,106` — `win-prob-v0`, hand-set coefficients, **not** Visa-endorsed. Disclaimer shipped in the tool wrapper |
| SCA exemption engine | `shipped` as **decision support** | `generators-agentic-purchasing.ts:1161`. TRA bands are *published* EBA values, not your acquirer's live fraud rate; final eligibility is the issuer's |
| 8-check compliance grader | `shipped` — **textual pattern matcher** | `:920-967`. Two-signal regex over source text, **not** runtime conformance testing |
| AP2 / TAP / UCP codecs | `shipped` | Full encode/decode/sign/verify, Ed25519 detached JWS, zero deps |
| ↳ conformance | **not certified** | `packages/ap2/src/index.ts:16-26` — TAP/UCP shapes modeled from public docs; verified only against **self-authored** golden vectors; no official conformance suite, no live network counterparty |
| Reproducibility proof (sha256 over canonical JSON) | `shipped`, correctly scoped | `commerce-engines.ts:41` — *"a receipt, not a signature and not a certification"* |

## Quality infrastructure

| Leaf | Status | Evidence |
|---|---|---|
| **402 test files** (359 `.test.ts` + 43 `.test.tsx`), ~7,324 statically-declared cases | `shipped` | Counted across `apps/` + `packages/`, excluding `node_modules`/`dist` |
| Guard suites: count-honesty, launch-claims, strategic-docs-honesty, counts-consistency | `shipped` | Fail CI on any drift between code-derived counts and public copy |
| OpenAPI ↔ router bijection | `shipped` | Ground truth is the live `Router.getRoutes()`, not a regex |
| Architecture fitness (no web→api imports, no packages→apps, no cycles) | `shipped` | `monorepo-boundaries.test.ts` |
| Money invariants (~1,000 seeded property tuples) | `shipped` | `usage-credit-metering.invariants.test.ts` |
| SSRF blocklist incl. cloud metadata `169.254.169.254` | `shipped` | `url-guard.ts` |
| Diff-scoped secret scan | `shipped` | `scripts/scan-diff-secrets.mjs`, gating |
| Coverage floor | 60% enforced | `vitest.config.ts:30-35` — **well below** the 91.5% marketing figure |

---

# EXTERNAL — owned by sibling products, not here

**Boundary:** Iliad is **text and artifact generation only**. Every visual, 3D, mesh, animation and
texture capability belongs to a sibling product with its own repo, MCP surface and pricing. This repo
contains no image or 3D generation code — only the delegation note.

| Product | Relationship | Status here |
|---|---|---|
| AXIS Foundry (3D/2D generation) | Sibling process, own repo + MCP | `candidate` — deliberate absence, pinned by two tests |
| assetforge (Python, mesh/texture) | Separate repo | *unverifiable-from-repo*; animation path `gated(external)` — "no live public Space exists" |
| PAI'D (payments) | Sibling product; the live checkout rail | Integrated via `@axis/paid-client`; recurring billing is PAI'D's roadmap |

⚠ **Do not reproduce as a package list:** `CODE_TO_DOCS_BUILD_STRATEGY.md:85-89` names four "NEW"
packages; three (`@axis/assetforge`, `@axis/embeddings`, `@axis/web-research`) **do not exist as
packages**. Embeddings and web-research shipped as `apps/api/src` modules instead.

---

# Packages — 10 workspace packages, **none published**

`@axis/generator-core`, `@axis/repo-parser`, `@axis/context-engine`, `@axis/snapshots`, `@axis/sdk`,
`@axis/mpp`, `@axis/paid-client`, `@axis/ap2`, `@axis/agentic-compliance` (`private: true`),
`iliad-md` (v0.1.0).

**No `npm publish` step exists anywhere** — not in any workflow, script, or the Makefile. Nine of ten
are technically publishable (`private` unset) but none is shipped. Any claim that a package is
"available on npm" is unsupported.

---

# Summary — what must never be published unmarked

1. **Programs page advertises 37 nonexistent output files**; free `skills` list is 5/5 fictional, unguarded.
2. **No threshold alerting in production** — `ALERT_WEBHOOK_URL` undeclared.
3. **"Pro $99/month" is a one-time charge** — no recurring billing exists anywhere.
4. **`/v1/openapi` is advertised and 404s.**
5. **`iliad_code_sandbox` cannot run on the current host**, though it is a paid tool.
6. **VROL/RDR/CDRN throws even when enabled**; Stripe is the only live dispute rail.
7. **`iliad_network_tokenization` read/provision are disabled**, disclosed in-catalog.
8. **AP2/TAP/UCP are not conformance-certified** and have never touched a live network counterparty.
9. **Win-probability is an uncalibrated heuristic**, not a Visa-endorsed rate.
10. **No package is published to npm**; the CLI install docs are deliberately dark.
11. **`attestation.json` makes a false integrity claim** (epoch timestamp, stale merkle root).
12. **"205 test files / verified"** in `LAUNCH_CLAIMS.yaml` — actual is 402.
13. **"4,900+ tests" and "91.5% coverage"** are stale; enforced floor is 60%.
14. **"Open source" is forbidden copy** until the owner opens the repo; LICENSE is private.
15. **Replicate and Fastio secrets are provisioned with zero integration code.**
