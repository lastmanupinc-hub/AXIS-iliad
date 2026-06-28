# Axis' Iliad — v1.0 ROI Candidate List

**Source**: synthesis of 16 strategic root YAMLs (`begin.yaml`, `continuation.yaml`, `competitive-gap-matrix.yaml`, `iliad-agentic-platform-strategy.yaml`, `capability_inventory.yaml`, `e2e_ui_audit.yaml`, `e2e_wiring_audit.yaml`, `static_analysis_phase.yaml`, `repo_snapshot.yaml`, `human user audt.yaml`, `axis_master_blueprint.yaml`, `daily-maintenance-runbook.yaml`, `memory generator.yaml`, plus the manually-curated `V1_LAUNCH_TODO.md`).

**Deduplication**: every item the audit-agents found was cross-checked against the post-session-100 shipped surface. Items already complete are listed in the **Shipped Stack** at the end of this file. Stale items (recommended actions that turned out to be done) do not appear in the candidate list.

**Scoring**: per `begin.yaml` `roi_policy`. Each candidate's ROI score reflects the sum of capability_gain + production_quality_gain + integration_quality_gain + agent_acquisition_gain + conformance_and_protocol_gain (minus implementation_cost). Higher = pick first.

**Maturity levels**:
- `not-started` — nothing in the repo touches it
- `partial` — code exists but acceptance criteria unmet
- `proven-but-unverified` — works locally but never tested under production load
- `proxy-only` — wrapper around a third party; "owned both ends" disqualified

---

## Tier A — Audit Remediation (adversarial assessment 2026-06-25)

**Source**: a 29-agent adversarial assessment that *ran* the system (build, CLI, server boot, reproduced billing races). Overall grade **B−** — strong, secure (Security **A**), deterministic core; the items below are the *verified* gaps. Ranked by production risk — **A1 (billing concurrency) is the #1 liability** for a billing product.

| # | ID | Title | Sev | ROI | Status · proof |
|---|----|-------|-----|-----|----------------|
| **A1** | **billing-concurrency-safety** | Fix 3 confirmed double-spend races from the Neon sync→async migration. Done: `meterPersistenceOp` + `consumeUsageCredits` serialize per-account via `pg_advisory_xact_lock` (ns 1/2) inside a tx (append-only ledger has no row to lock); `markPurchaseSucceeded` uses `SELECT … FOR UPDATE` + rowCount guard + grant moved into the same tx. Review caught + fixed a pool-exhaustion self-deadlock (usage-credit now does all pool reads BEFORE the tx; opt-in `PG_CONNECT_TIMEOUT_MS` as defense). | HIGH | **95** | ✅ **100%** · branch `feat/audit-a1-billing-concurrency`. 5 concurrency tests, each adversarially proven to FAIL on old code (double-spend 10≠1, overspend 12≠6, triple-grant 3≠1, lost-update 18≠48, deadlock=connect-timeout) and pass on the fix. 41/41 metering + full snapshots suite green on real pg16. |
| A2 | boot-resilience-db-down | Bind the port even when migrations fail so the DB-free health/discovery/static surface stays reachable (old boot set `exitCode=1` and never listened → whole process crash-looped). Done: `scheduleBootMigrations` listens-after-apply on the happy path (no pre-schema traffic window), listens-anyway on failure, and retries in the background (5s·n, cap 60s) so a transient outage self-heals without a restart. Readiness already gates DB traffic (503) while liveness stays 200. | HIGH | 68 | ✅ **100%** · branch `feat/audit-a2-boot-resilience`. 4 DI unit tests (no DB/sockets) pin the fix — the reverted boot fails all 3 "DB down" assertions. Adversarial review: **0 blockers, 3×A**. 31/31 health/metrics tests green; tsc clean. |
| A3 | quality-judge-llm-tests | Two parts, both done. (1) Extracted `llmDesignVerdict` (headline AI judge, was 0 tests) into `design-judge.ts` + 7 unit tests (mock the LLM; degrade-to-null, parse/round, schema-rejects-out-of-range, grounding, omission). (2) De-vacuumed `scoreNeedsCoverage`: the assessment warnings were echoed into context-map.json/architecture-summary.md and the coverage regex matched the RESTATED need → a warnings-only package scored 100. Fix strips the warning text before matching. | HIGH | 52 | ✅ **100%** · branch `feat/audit-a3-quality-judge-tests`. Validated against the REAL 137-file generators: real package unchanged (100/passed), degenerate warnings-only 100→0/failed. 18 unit tests; mcp-server regression green (lone failure = the A11 code-sandbox flake). Adversarial review: **0 blockers, 3×A**. Also a small A6 down-payment (god-file −58 LOC). |
| A4 | count-honesty-reconcile | Reconciled contradictory generator/program totals to the code truth (137 generators / 20 programs) across README + every web page **and component** — the UI was calibrated to a stale 99/19 era; README said 102/18. The first pass missed split-markup stat cards, reversed "Programs (18)", table rows, and the `components/` dir — all caught by the adversarial review + a completeness sweep. Also: README program table was missing **Closer + Deploy** rows; the ProgramLauncher list was missing **3 paid programs** (agentic-purchasing/closer/deploy — a functional gap, users couldn't launch them) with a hardcoded "14 programs" badge → added them + derive `{proTier.length}`; ProgramsPage was missing **deploy**. Tier partials (3 free, example "Pro 16 / 75 artifacts", per-program "19 MCP") correctly preserved. | HIGH | 48 | ✅ **100%** · branch `feat/audit-a4-count-honesty`. `count-honesty.test.ts` guard imports `TOTAL_GENERATORS`/`TOTAL_PROGRAMS`, **strips JSX tags** (so split markup collapses to adjacent text), and matches forward/reversed/table layouts with adjective allowlists; flags any total that drifts (≥30 gen / ≥17 prog floors skip legit partials). Program lists verified 20/20 vs canonical. Guard green; web tsc + build clean. |
| A5 | pg-placeholder-safety | `toPg` rewrote *every* `?` to `$N`, corrupting a `?` inside string literals / jsonb operators (`'why?'` → `'why$1'`). Done: replaced with a single-pass SQL-aware tokenizer that skips string literals, quoted identifiers, dollar-quotes, line/block (nested) comments, and `?\|`/`?&` operators. | MED | 46 | ✅ **100%** · branch `feat/audit-a5-pg-placeholder`. 14 pure unit tests (no DB); 8/9 fail on the old translator. Adversarial review: **0 blockers, 3×A** — 200k-iteration fuzzer (0 throws/hangs) + 165 real codebase queries through old-vs-new = **0 divergences**. 51 store/search/funnel tests green on real pg. |
| A6 | mcp-server-decompose | Carve the god-file + break the `handlers.ts ↔ mcp-server.ts` circular import. **Done:** circular import broken (intent/probe telemetry → new `intent.ts`; handlers imports from there, not mcp-server); `MCP_TOOLS` catalog (1,414-line literal) + `toolAnnotations` + 3 schemas + the planned-capability machinery → new `mcp-tools.ts` (re-exported so importers keep working). **mcp-server.ts 5,261 → 3,700 LOC (−30%).** **A6b (done):** the ~29 `run*` tool impls (+ their tool-specific constants/helpers) → new `mcp-tool-impls.ts`; the shared infra (rpc/tool-result helpers, RPC codes, idempotency, and the **credit/billing helpers** — `authorize/capture/meterMcpToolCredits`, `buildMcpPaymentRequiredError`) → new `mcp-runtime.ts`, in a no-cycle chain `mcp-runtime ← mcp-tool-impls ← mcp-server`. **mcp-server.ts 5,261 → 3,688 → 598 LOC.** | MED | 40 | ✅ **100%** · branches `feat/audit-a6-decompose` + `feat/audit-a6b-mcp-carve`. A6b verbatim-verified: 3,330/3,332 original content lines byte-identical (the 2 diffs are an em-dash display artifact + a comment divider's padding); 0 import cycles (grep-proven); public API preserved via re-exports; api tsc clean; full dispatch + billing + idempotency suite green on pg16. |
| A7 | sqlite-layer-removal | Deleted the 877-line dead SQLite `db.ts` (production-dead post-Neon) + its SQLite-era tests (`db.test.ts`, `db-maintenance.test.ts`) + the broken `perf.bench.ts`; removed the package-index re-export; repointed `coverage-gaps.test.ts` + converted `email-store.test.ts`'s schema check to a pg `information_schema` query. **Dropped `better-sqlite3` + `@types/better-sqlite3`** (snapshots + api) and regenerated `pnpm-lock.yaml` (`pnpm install --lockfile-only`, 0 refs remain) so CI's `--frozen-lockfile` install passes. | MED | 38 | ✅ **100%** · branch `feat/audit-a7-sqlite-removal` (PR #56). No `better-sqlite3` in deps/lockfile/imports; tsc clean (snapshots + api); email-store + store 54/54 on pg16 (pre-disk-issue). Full suite verified on CI. |
| A8 | quality-judge-in-cli | The Package Quality Judge's deterministic floors lived in `apps/api`, so only the API/MCP path graded + appended `package-quality-report.json` — the offline CLI shipped artifacts with no quality report. Moved `package-quality.ts` (+ test) to **@axis/generator-core** (it only needs the `ContextMap` type; the CLI already deps generator-core) + added a shared `appendQualityArtifacts(generated, ctx, design)`. The API's `maybeRunQualityGate` now computes the engineer-mode LLM verdict and delegates the append to the shared helper (behavior-identical); the CLI calls it with `design=null` (no model offline → report records design not-assessed). | LOW | 26 | ✅ **100%** · branch `feat/audit-a8-quality-judge-cli`. tsc clean across generator-core/api/cli; `package-quality.test.ts` (11) green in its new home; design-judge (7) + 2 new CLI runner tests (report present + not-assessed; byte-deterministic) green. mcp-server refactor is a verbatim logic move (no test asserts its output); full mcp-server suite verified on CI pg16. |
| A9 | web-search-span-fix | `answerFromHits` computed rerank/coverage over `title+snippet` but the citation span over `snippet` only → a title-matched hit ranked + passed the gate yet emitted an off-topic/empty span. Extracted a shared `hitText(h)` (= `title + snippet`) used by BOTH coverage and the span, so the span always reflects why the hit was selected. | LOW | 20 | ✅ **100%** · branch `feat/audit-a9-web-search-span`. New title-only-match test fails on old code (span lacked the query terms) and passes on the fix; 5 Answer Engine tests green (pure, no pg); tsc clean. |
| A10 | repo-root-cleanup | Generated artifacts + coverage logs committed to the repo root (root had **200** tracked files). Removed **102** junk files (79 generator outputs + 23 coverage/fail logs) by intersecting against the live generator-output basenames, with a protect-list shielding real config that shares a name (`render.yaml`, `docker-compose.yml`, `mcp-config.json`, + the repo's own `AGENTS.md`/`CLAUDE.md`/`.cursorrules`/etc.). gitignore now covers the log patterns. | LOW | 12 | ✅ **100%** · branch `feat/audit-a10-root-cleanup`. Root 200→98 tracked files. Verified no source imports the removed files (only string metadata in `handlers.js`); api tsc + web build clean. |
| A11 | flaky-test-stabilization | Two intermittently-CI-reddening tests made deterministic. **crash-resilience**: a hardcoded port (44530, EADDRINUSE-prone) + an unawaited async `listen` (ECONNREFUSED race) + a server shared across tests → rewrote to ephemeral ports (0), an awaited `listen`, and self-contained per-test servers. **code-sandbox**: the test did REAL Docker work (image-pull + run, >60s) when a host had Docker → added an `AXIS_CODE_SANDBOX_DISABLED` kill-switch (honored in BOTH `isCodeSandboxConfigured` and `runCodeSandbox` — the handler calls the latter directly) so the dispatch + unit tests force a deterministic `_not_configured`; live execution stays in the `AXIS_RUN_DOCKER_TESTS` opt-in suite. | MED | 35 | ✅ **100%** · branch `feat/audit-a11-flaky-tests`. crash-resilience 7/7 × 3 consecutive runs; code-sandbox unit 15/15 (no Docker); kill-switch + `disabled` reason tested. Verified the fix was needed: the pre-`runCodeSandbox`-fix run FAILED (Docker reachable). tsc clean. |
| A12 | stale-stack-docs | README had a DUPLICATED "Tech Stack" section with contradictory test counts (1485/68 vs 4076/140), a stale `SQLite (better-sqlite3, WAL)` backend line + FTS5 benchmark, and the badge said 4076. The "14 MCP tools" claim was stale (real = **29**, pinned `MCP_TOOL_COUNT`) AND the UI named only 14 — missing the entire engineer-tier `iliad_*` toolset. SQLite/better-sqlite3/FTS5 falsehoods were ALSO scattered across DocsPage/HelpPage/QAPage/SearchTab. Removed the dup section; switched all data-layer copy to Neon Postgres; updated both UI tool lists to the real 29. | LOW | 22 | ✅ **100%** · branch `feat/audit-a10-root-cleanup` (batched w/ A10). Extended the A4 count-honesty guard with (a) MCP/public tool count == `MCP_TOOL_COUNT` and (b) a no-SQLite/better-sqlite3/FTS5 guard over README+web — caught split-markup "14 MCP **Tools**" my literal `sed` missed. 4/4 guard checks green; web build clean. |

**Build order (risk-ranked):** ✅ A1 → ✅ A2 → ✅ A5 → ✅ A3 → ✅ A4 → ✅ A11 → ✅ A6 → ✅ A7 → ✅ A9 → ✅ A10 → ✅ A12 → ✅ A8 → ✅ **A6b**. **All 13 Tier-A candidates complete.**

**Status (2026-06-28):** all 13 Tier-A candidates complete — 12 merged to `main`, A6b in PR. Each adversarially/CI-verified on pg16.

### A6b — carve (done)

**Result:** `apps/api/src/mcp-server.ts` **3,688 → 598 LOC** (mcp-tool-impls.ts 2,961, mcp-runtime.ts 210). Executed the no-cycle 3-module split below; verbatim-verified (3,330/3,332 original content lines byte-identical — the 2 diffs are an em-dash display artifact + a comment divider's padding), 0 import cycles, public API preserved via re-exports, api tsc clean, full dispatch/billing/idempotency suite green on pg16.

Three-module split, ordered as a no-cycle chain (`mcp-runtime` ← `mcp-tool-impls` ← `mcp-server`):

1. **`mcp-runtime.ts`** (leaf) — shared infra the impls need: `rpcOk/rpcErr/toolOk/toolErr`, `categorizeError` (+ `ErrorCategory`), the RPC error-code constants, `readIdempotencyKey`, `hashToolRequest`, and the credit/billing helpers (`authorizeMcpToolCredits`, `captureMcpToolCredits`, `meterMcpToolCredits`, `buildMcpPaymentRequiredError`). **Treat the credit helpers with A1-level care.**
2. **`mcp-tool-impls.ts`** — the ~29 `run*` functions + their tool-specific constants (`OBJECT_STORAGE_MAX_TTL_SECONDS`, `VECTOR_*`, `ANALYTICS_*`, `WEB_SEARCH_*`, `PREVIEW_*`, `PURCHASING_INTENT_MAP`, …), importing only from `mcp-runtime.ts`. Re-export so existing importers keep working.
3. **`mcp-server.ts`** retains `dispatch()` (the `tools/call` switch), the `handleMcp*` HTTP layer, `tools/list`, and `getMcpServerMeta`.

Verify: tsc (api) clean → push → full mcp-server dispatch suite green on CI pg16 (the `226+` tests).

---

## Tier E — Engineer Tier (premium "over-the-top" upsell · `X-Agent-Mode: engineer`)

**Directive (2026-06-23):** add a third mode (`engineer`) on top of the existing lite/standard pricing. Base stays free/cheap; engineer is depth + novelty at a designer price. Per `begin.yaml` `no_go_rules` ("don't expand breadth before core paths are strong"; "no automation/AI without structured contracts") the canonical **contract (E0) is the unblocking foundation** — every per-tool upgrade is forbidden breadth until E0 lands. Execute in ranked order; commit after each.

| # | ID | Title (engineer mode) | Size | ROI | Novel hook · proof of completion |
|---|---|---|---|---|---|
| **E0** | **eng-mode-contract** | Wire `X-Agent-Mode: engineer` as a 3rd MPP tier: engineer price in PRICING_TIERS, plumb the mode through the credit/charge path + the 402 negotiation body; default → standard. | S | **92** | Foundation — unblocks all below, opens a new revenue loop, one-door pricing contract. Proof: a tool called with `engineer` mode charges the engineer price and the 402 advertises it; counts-consistency test pins the new tier. |
| E1 | hygiene-security-engineer | `iliad_hygiene`: remediation as an **applyable unified-diff patch + SARIF** (not just a plan). | M | 84 | Ships the fix, not the to-do. Deterministic (no AI-without-contract risk). Proof: engineer scan returns a valid `patch` + `sarif`. |
| E2 | storage-managed-bucket | `iliad_object_storage`: list/delete/copy ops + content-addressed dedup keys + mint-time content-type/size policy. | S–M | 80 | Full lifecycle, storage-with-a-brain. Pure owned extension. Proof: list/delete/copy round-trip + dedup hash. |
| E3 | search-answer-engine | `iliad_web_search`: hybrid BM25⊕vector + rerank + grounded **answer with citation spans** (refuse on weak evidence). | M | 82 | Private Perplexity over the user's corpus. Needs E0. Proof: answer + spans + a refusal case. |
| E4 | vector-managed-memory | `iliad_vector_database` → **pgvector/HNSW on Neon** + hybrid fusion + recency decay + semantic-dedup upsert. | L | 79 | Managed *forgetting*. BLOCKED on Neon PR #33 merge. Proof: large namespace + ANN query. |
| E5 | living-architecture | `analyze_repo`: deterministic skeleton + **verified LLM specificity pass** (drop unverifiable claims) + push-triggered PR drift mode. | XL | 86 | Repo-specific, not repo-shaped, without losing the determinism guarantee. Flagship. Needs E0. |
| E6 | sandbox-verified-exec | `iliad_code_sandbox`: persistent session + **signed (code-hash→output-hash) attestation** (Trust-Fabric merkle tie-in). | L | 81 | Provable compute another agent trusts without re-running. |
| E7 | doc-intelligence | `iliad_document_parsing`: OCR + table/layout fidelity + **extract-to-caller-schema** + retrieval chunking. | M–L | 77 | Typed data, not just markdown. |
| E8 | constrained-inference | `iliad_llm_inference`: grammar/JSON-schema-**constrained decoding** + worker isolation + streaming. | M | 75 | Guaranteed-valid structured output, in-process. |
| E9 | commerce-integration | `prepare_agentic_purchasing`: scaffold a **live x402/AP2 endpoint wired to PAI'D** + sandbox txn test + submittable CE 3.0 pack + win-probability sim. | XL | 83 | Working integration, not a score. Enterprise flagship. |
| E10 | voice-brand-kit | TTS/STT: owned voice cloning + **persona auto-derived from the `brand`/`voice-and-tone` artifacts**; STT diarization + custom vocab. | L | 72 | Brand artifact → consistent owned voice (only the generator suite can do this). |
| E11 | deliverability + product-intel | email + analytics: SPF/DKIM/DMARC autoconfig + warmup + inbox-placement; funnels/cohorts **auto-wired from the `marketing` artifact**. | M | 70 | Self-instrumenting funnel; deliverability engineering. |
| E12 | domain-embeddings | `iliad_embeddings`: owned ONNX + Matryoshka truncation + per-corpus adapter; pipes into E4. | M | 68 | Embeddings better on *their* data, owned (pairs with proxy-kill #34). |

**Bundle:** Engineer Pass (subscription / credit-pack) unlocks `engineer` across all tools at a discount; Agency/white-label tier on top (resale + higher referral caps). Per-tool designer prices in the design note.

**Build order (begin.yaml ranked):** ✅ **E0** (`priceForMode` contract; 21/21) → ✅ **E1** (hygiene patch + SARIF; 44/44) → ✅ **E2** (Managed Bucket: list/delete/CAS/copy + **mint-time content-type/size policy**; 38/38 — acceptance criteria fully met) → ✅ **E3** (Answer Engine: grounded answer + citations + refusal; 57/57) → ✅ **harden→polish→develop→harden→polish pass** (fixed patch-apply + billing-ladder HIGHs; single-sourced SigV4; capped title DoS; added server-side COPY; COPY audited multi-tenant-safe) → ✅ **E4** (pgvector Managed Memory — unblocked once the Neon migration merged) → ✅ **E5–E12 all shipped**. **ALL of E0–E12 are merged to main (2026-06-23/24); the engineer tier is complete.** E0–E3 (+COPY, +hardening) = a clean, PR-able batch on `feat/engineer-tier`, each commit build+test green.

---

## Tier 1 — MUST-SHIP for v1 (blocks launch)

| # | ID | Title | Maturity | Effort | ROI | Proof for v1 |
|---|---|---|---|---|---|---|
| 1 | **catalog-honesty-1** | Hide 12 `PLANNED_CAPABILITIES` stubs from public `tools/list`. Show only when `?include_planned=true` query param set. | partial (stubs ship today) | S | 22 | `tools/list` returns 15 entries (down from 27) for unauthenticated callers. Test: existing `mcp-server.test.ts` length assertion bumped + new test for `include_planned=true` opt-in. |
| 2 | **catalog-honesty-2** | Add `provider` chip on Tools Index for the 4 proxied `iliad_*` tools. UI honesty about Firecrawl/OpenAI/Resend backends. | not-started | S | 18 | `ToolsIndexPage.tsx` renders provider chips. Snapshot test verifies the 4 tools show provider labels. |
| 3 | **pricing-tiers** | Add pricing tiers in `@axis/mpp/src/index.ts` `PRICING_TIERS` for the 6 real `iliad_*` tools. MPP 402 falls through to default $0.50 right now. | not-started | S | 19 | All 6 tools have explicit tier entries with standard + lite pricing. counts-consistency test pins the registry size. |
| 4 | **mpp-402-wiring** | Wire owned tools into MPP 402 flow so anonymous agents can pay per call (object_storage, vector_database, embeddings, transactional_email, web_research × 2). | not-started | S | 16 | Anonymous agent calls `iliad_object_storage` → receives 402 with payment_session_url → pays → retries successfully. |
| 5 | **privacy-policy** | Dedicated Privacy Policy page (GDPR/CCPA-aware). Terms page mentions "Privacy" but lacks the legal language. Hard launch blocker for EU/CA traffic. | not-started | S | 17 | New `PrivacyPage.tsx` route. Lists subprocessors (Stripe, Resend, OpenAI, Firecrawl, R2, GitHub, Render). Cookie disclosure. Right-to-delete contact. |
| 6 | **subprocessor-list** | Enumerate every SaaS in the data path inside the privacy policy. | not-started | S | 8 | Folded into privacy-policy commit. |
| 7 | **github-app-register** | Register the GitHub App at `github.com/settings/apps/new` using `.github/app-manifest.json`. Sets `GITHUB_WEBHOOK_SECRET` in prod. | not-started (manual) | S | 21 | A real installation fires a push event, AXIS receives it, snapshot lands in DB. The CodeRabbit-class distribution channel needs this. |
| 8 | **mcp-publisher-publish** | Publish to MCP registry via `mcp-publisher publish`. Manifest enriched in session 095. | not-started (manual) | S | 18 | Discovery on registry confirms axis-iliad is listed. |
| 9 | **npm-publish-mpp** | `pnpm --filter @axis/mpp publish --access public` (README + LICENSE shipped session 101). | not-started (manual) | S | 14 | Package visible on npmjs.com. |
| 10 | **npm-publish-sdk** | `pnpm --filter @axis/sdk publish --access public` (test suite landed session 097). | not-started (manual) | S | 12 | Package visible on npmjs.com. |
| 11 | **prod-env-audit** | Every var in `apps/api/src/env.ts ENV_SPEC` has a real prod value or is explicitly opted out. | not-started | S | 15 | Checklist commit referencing each env var; missing-value ops items tracked. |
| 12 | **db-backup-automation** | Nightly `axis.db` → R2 snapshot. Uses the existing `iliad_object_storage` plumbing. | not-started | S | 14 | Cron job (Render) writes a daily snapshot; restoration test passes. |
| 13 | **uptime-monitor** | UptimeRobot or Better Uptime on `/health`. One alert channel. | not-started (manual) | S | 12 | Synthetic monitor green; one alert sent during chaos test. |
| 14 | **resend-domain-verify** | Verify `RESEND_FROM_ADDRESS` domain. Without this `iliad_transactional_email` lands in spam. | not-started (manual) | S | 9 | Resend dashboard shows domain verified; test email reaches inbox not spam. |
| 15 | **incident-template** | Severity definitions + acker/fixer/postmortem roles. | not-started | S | 7 | `INCIDENT.md` in repo root. |
| 16 | **demo-video** | 60-90s screen recording: GitHub URL → 124 artifacts → drag AGENTS.md into Cursor. | not-started | M | 15 | Public-hosted MP4 / Loom link. Press kit references it. |

**Tier 1 total**: 16 items. Mix of code (1–4, 12), legal (5, 6), manual ops (7–10, 13, 14), and launch enablement (15, 16). Code items are all small.

---

## Tier 2 — SHOULD-SHIP for v1 (prevents embarrassment)

| # | ID | Title | Maturity | Effort | ROI | Proof for v1 |
|---|---|---|---|---|---|---|
| 17 | **convert-web-research-owned** | Replace Firecrawl proxy with in-process Playwright. ~250 LoC handler + tests; one new dep. | proxy-only | M | 17 | Status flips `live_proxy → owned` in capability-map. iliad_web_research returns markdown via Playwright; no FIRECRAWL_API_KEY needed. Test against 10 real URLs. |
| 18 | **convert-transactional-email-owned** | Replace Resend proxy with direct SMTP via `nodemailer`. ~200 LoC; one new dep. | proxy-only | M | 15 | Status flips `live_proxy → owned`. Operator supplies SMTP creds; no SaaS layer. Test via Mailpit/Mailcrab. |
| 19 | **status-page** | Public status page at `status.axis-iliad.com` (Instatus or Atlassian free tier). Auto-updated from uptime monitor. | not-started | M | 13 | Live page; incidents append-only history. |
| 20 | **prom-metrics-scraped** | Grafana Cloud free tier scrapes `/metrics`. Endpoint exists; nothing consumes it. | partial (endpoint exists, no scraper) | M | 11 | Dashboard shows live request counts + latencies. |
| 21 | **launch-landing-page** | Honest v1 pitch: "Analyze any codebase → 124 deterministic AI context artifacts via single MCP call." Distinguishes owned vs proxied tools. | not-started | M | 14 | `LandingPage.tsx` route at `/`; routes unauthenticated visitors here, not `UploadPage`. |
| 22 | **pricing-page-audit** | Every "Coming soon" cell on `PlansPage.tsx` table either becomes a real feature or is removed. Don't ship a pricing table with placeholders. | partial | S | 10 | Manual review + commit; the table reflects only shipped features. |
| 23 | **tools-index-honesty** | Each `coming_soon` Tools Index entry either gets a working ToolPage or is removed. 9 entries → either ≥5 working or fewer entries shown. | partial | M | 12 | `ToolsIndexPage.tsx`: every entry routes somewhere real. |
| 24 | **fix-plans-page-auto-fetch** | `e2e_ui_audit.yaml:plans_page_auto_fetch`: PlansPage doesn't auto-fetch from `getPlans()`. Static fallback in place but the API path is the right one. | partial | S | 8 | Export `getPlans()` from `api.ts`; PlansPage calls it on mount; remove static fallback. |
| 25 | **fix-api-key-connect-button** | `e2e_ui_audit.yaml:api_key_connect_button`: AccountPage uses brittle `document.querySelector('input[placeholder="axis_..."]')`. Replace with React ref. | partial | S | 6 | Refactor to `useRef<HTMLInputElement>`; placeholder text can change without breaking. |
| 26 | **fix-nested-file-route** | `e2e_ui_audit.yaml:get_generated_file_single`: GET `/v1/projects/:id/generated-files/.ai/foo.json` returns 404 because `/` in route param fails. | partial | S | 7 | Switch to wildcard route segment or encode path; nested files accessible via API. |
| 27 | **log-aggregation** | Logflare / Better Stack ingests stdout. SSH-and-tail is not v1-grade. | not-started | M | 9 | Search "request_id=…" in dashboard works. |
| 28 | **changelog-v05x** | `CHANGELOG.md` entry for the v0.5.x line ending at v1.0.0. | not-started | S | 6 | Markdown file in repo root following Keep-A-Changelog. |
| 29 | **license-aggregation** | `LICENSES.txt` generated from `pnpm ls --json --depth 0` for production deps. | not-started | S | 5 | File committed; license review confirms no GPL leakage. |
| 30 | **compliance-action-marketplace** | Publish `axis-iliad/compliance-check` to GitHub Marketplace listing. | not-started (manual) | S | 11 | Action visible at github.com/marketplace; install count > 0 within first week. |
| 31 | **glama-smithery-submit** | Submit to Glama.ai and Smithery.ai (manual review forms). | not-started (manual) | S | 9 | Listed on both sites within 2 weeks of submission. |
| 32 | **sample-agent-repo** | Public Claude Code starter repo using AXIS MCP. ~200 LoC, end-to-end demo. | not-started | M | 12 | Repo lives at github.com/lastmanupinc-hub/axis-claude-starter; README + screenshot. |
| 33 | **press-kit** | Logo SVG, 3–5 screenshots, 1-pager PDF, founder bio + photo. | not-started | M | 7 | `/press` directory or external Notion/Drive link. |

**Tier 2 total**: 17 items.

---

## Tier 3 — COULD-SHIP for v1 (improves launch, not blocking)

| # | ID | Title | Maturity | Effort | ROI | Proof for v1 |
|---|---|---|---|---|---|---|
| 34 | **convert-embeddings-owned** | In-process ONNX embeddings (fastembed-js / @xenova/transformers / hand-roll). Resolves the model-file-ownership story honesty. | proxy-only | M | 13 | Status flips `live_proxy → owned`. Same vector output shape; OpenAI key no longer required. **Blocked by** model-file decision from user. |
| 35 | **on-call-rotation** | PagerDuty / Pager.ly. Only matters once we have paying customers asleep. | not-started | M | 6 | Schedule defined; first page acknowledged within SLA. |
| 36 | **secret-rotation-runbook** | How to rotate `STRIPE_SECRET_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `GITHUB_WEBHOOK_SECRET`, `R2_SECRET_ACCESS_KEY`, `ADMIN_API_KEY`. | not-started | S | 5 | `RUNBOOK.md` section in repo root. |
| 37 | **dpa-template** | Data Processing Agreement template for enterprise sales. | not-started | M | 5 | Signed template + signature flow (DocuSign / HelloSign). |
| 38 | **trademark-filing** | AXIS trademark intent-to-use filing. Lawyer conversation, not engineering. | not-started (legal) | M | 4 | USPTO filing reference. |
| 39 | **graceful-shutdown-load-test** | Verify SIGTERM drain works under load. The handler exists; load test confirms drain. | proven-but-unverified | S | 8 | Test report: send SIGTERM during 10 concurrent /v1/analyze; all requests finish, no 502s. |
| 40 | **dark-mode-visual-pass** | Dark-mode tokens exist; visual review across all pages catches contrast/hierarchy bugs. | partial | M | 6 | Per-page screenshot pair (light/dark) reviewed; bugs filed. |
| 41 | **launch-r-mcp-post** | r/mcp launch post on Reddit. | not-started | S | 7 | Posted Tuesday morning; ≥10 upvotes within 24h is the baseline signal. |
| 42 | **launch-x-thread** | X (Twitter) thread with demo GIF. | not-started | S | 6 | Posted; engagement tracked. |
| 43 | **show-hn-submission** | Show HN. Best window: Tuesday 8:00 AM PT. | not-started | S | 7 | Posted; front page is the bonus. |
| 44 | **empty-state-copy-review** | All pages have shipped empty states; verify copy is humane (not "no items found"). | partial | S | 4 | One-pass review + commit. |
| 45 | **slo-instrumentation** | Define week-1 SLOs: error rate < 1%, p95 latency < 500ms, 99.9% uptime. | not-started | S | 8 | Targets documented in `SLO.md`; baseline measured from existing metrics. |

**Tier 3 total**: 12 items.

---

## Tier 4 — Explicitly DEFERRED to v1.1+

These appear in the source YAMLs but are out-of-scope for v1.

| ID | Title | Why deferred |
|---|---|---|
| `convert-embeddings-owned` model decision | Honest "we trained this" path requires $10k-$100k compute + months. Honest "we host this open-weight model" path requires the model-file decision. | Needs user-level approval and a longer ramp. |
| `iliad_llm_inference` owned | node-llama-cpp + 2.4GB model file. | XL effort; standalone project. |
| `iliad_image_generation` owned | GPU required. SDXL/Flux model files. | XL effort. |
| `iliad_text_to_speech` owned | piper-tts bindings + 30MB voices. | M effort but post-v1 priority. |
| `iliad_speech_to_text` owned | whisper.cpp + 150MB model. | M effort but post-v1 priority. |
| `iliad_web_search` owned | Self-hosted SearXNG OR own crawler + Tantivy index. | XL infrastructure project. |
| `iliad_code_sandbox` owned | Firecracker microVMs on bare metal OR worker_threads/vm. | M effort but post-v1 priority. |
| `iliad_document_parsing` owned | pdf-parse + mammoth + tesseract.js. | M effort but post-v1 priority. |
| `iliad_analytics` owned | Self-host PostHog OSS. | M effort + separate infra. |
| gap_c7_001 / gap_cr_002 / gap_s2_002 | Seat-based + per-repo Stripe meters | Stripe-dashboard product creation manual prereq. Block-on-billing-design. |
| gap_c7_002 / gap_cr_004 | Overage billing + credit packs | Same Stripe-dashboard manual prereq. |
| gap_s2_004 / gap_cr_005 | Cross-repo context graph | Requires architecture for multi-repo dep graphs; weeks of work. |
| gap_s2_005 | Semantic search across snapshot history | Depends on `iliad_embeddings` owned + indexing pipeline. |
| gap_cr_003 | Inline PR review surface | Deep GitHub API integration; weeks of work. |
| gap_c7_003 | SOC-2 + SSO | 3-6 month certification process. |
| gap_s3_004 | Compliance drift alerting | Depends on push-triggered comparison logic. |
| gap_s3_005 | Audit evidence export for Vanta/Drata | Niche enterprise feature. |
| gap_s1_003 | Gateway dashboard for 3rd-party MCP operators | Standalone product surface. |
| gap_s1_004 | Signed webhook fulfillment registry | Depends on 3rd-party MCP operator flow. |
| `human user audt.yaml`: WF-01..WF-13 | Mandatory non-technical QA workflows | **Blocked**: no test environment URL or credentials provided. |
| `axis_master_blueprint.yaml`: theme bridge | averionics_theme_bridge.yaml integration | Out of code-only scope. |
| `memory generator.yaml`: per-folder MEMORY.yaml standard | MEMORY.yaml files instantiated across subsystems | Lower ROI than tier 1-3 work. |
| `repo_snapshot.yaml`: version skew | Single source of truth for display version | Largely fixed by sessions 097-098; remaining drift is documentation. |

**Tier 4 total**: 23 items.

---

## Shipped Stack — items the YAMLs flag as gaps but are already done

These came up in the agent audit, but cross-checking against commits 4b537ba..0178638 shows they ship:

- **gap_s1_001** (@axis/mpp publishable) — DONE session 100 + README/LICENSE session 101.
- **gap_s1_002** (MCP monetization starter kit) — DONE session 101 via @axis/mpp README quickstart.
- **gap_s3_001** (GitHub Action compliance check) — DONE session 100.
- **gap_s3_002** (PR Check Run with compliance grade) — DONE session 102.
- **gap_s3_003** (compliance_grade in snapshot response) — DONE session 100.
- **gap_cr_001 / gap_s2_001** (GitHub App webhook handler + manifest) — DONE session 103.
- **Iliad strategy Phase 1** (Firecrawl web research MCP tool + x402 + env wiring) — LIVE as `iliad_web_research` / `iliad_web_research_crawl`.
- **Iliad strategy Phase 3** (Resend `iliad_send_email`) — LIVE as `iliad_transactional_email` (session 108).
- **Iliad strategy Phase 4** (memory store, namespace isolation) — LIVE as `iliad_vector_database` (session 106).
- **Iliad strategy Phase 2** (Replicate iliad_image_gen, Fastio iliad_storage) — `iliad_object_storage` LIVE (session 105); image_gen still planned-only.
- **static_analysis_phase eq_075..eq_086** (Go ecosystem parsing + SQL + domain models) — VERIFIED SHIPPED. `packages/repo-parser/src/parser.ts` exposes `go_module`, `sql_schema`, `domain_models`.
- **capability_inventory.payment_integration** — STILL BLOCKED on No Fate Platform processor (not actionable from this repo).

---

## Top of the queue — what to execute next

Per `begin.yaml` `next_move_selection_algorithm`:

1. Determine active verticals → v0_core_platform + v18_agentic_commerce.
2. Gather unblocked qualifying candidates → all Tier 1 items 1-16 except the manual-only ones (7-10, 13, 14, 16).
3. Score via roi_policy → table above already ranked.
4. Discard refusal-surface items → none.
5. Highest-ranked qualifying unblocked candidate:

**→ Tier 1 #7 (`github-app-register`) is highest-ROI strategic move but is MANUAL OPS only** — cannot execute without a human at github.com/settings/apps/new.

**Highest-ROI code-only item: Tier 1 #1 (`catalog-honesty-1`) — hide planned-capability stubs from public `tools/list`.** Cuts the 27-tool catalog to 19 honest tools, ~30 LoC + tests, ~1h work, immediately fixes the "we ship 12 stubs as features" credibility problem.

Then in sequence:
- #3 (`pricing-tiers`) — wire MPP pricing for the 6 real iliad_* tools, ~80 LoC.
- #2 (`catalog-honesty-2`) — provider chips on Tools Index, ~40 LoC.
- #4 (`mpp-402-wiring`) — wire owned tools into 402 negotiation, ~50 LoC.
- #5 (`privacy-policy`) — new `PrivacyPage.tsx`, ~250 LoC content + route.

**Beginning #1 now.**

---

_Generated 2026-05-22 as the master v1 ROI candidate list. Update on each session — every commit that closes a checkbox is a v1 readiness milestone. The Shipped Stack section grows as `Tier 1-3` rows resolve to `complete`._
