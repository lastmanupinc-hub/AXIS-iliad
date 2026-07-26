# Architecture Summary: axis-iliad

> \> **Axis' Iliad — The modern epic that shapes raw codebases into canonical, agent-ready artifacts. Axis' Iliad authors the definitive foundation for the next era of natural-language workspace development.**

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 9 top-level directories. It defines 278 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Overview

- **Primary Language:** TypeScript
- **Project Type:** monorepo
- **Files:** 500 (108805 LOC)
- **Directories:** 45

## Frameworks & Libraries

- **React** ^19.1.0 (95% confidence)

## Architecture Patterns

- `monorepo`
- `containerized`
- **Separation Score:** 0.64

## Layer Boundaries

| Layer | Directories |
|-------|------------|
| presentation | apps |

## Routes

| Method | Path | Source |
|--------|------|--------|
| GET | `/health` | docs/archive/e2e_ui_audit.yaml |
| GET | `/v1/health` | docs/archive/e2e_ui_audit.yaml |
| POST | `/v1/accounts` | apps/api/src/account-lifecycle.test.ts |
| GET | `/v1/account` | apps/api/src/account-lifecycle.test.ts |
| PATCH | `/v1/account` | apps/api/src/account-lifecycle.test.ts |
| DELETE | `/v1/account` | apps/api/src/account-lifecycle.test.ts |
| POST | `/v1/snapshots` | apps/api/src/account-lifecycle.test.ts |
| GET | `/v1/health` | apps/api/src/admin.test.ts |
| POST | `/v1/accounts` | apps/api/src/admin.test.ts |
| POST | `/v1/snapshots` | apps/api/src/admin.test.ts |
| GET | `/v1/admin/stats` | apps/api/src/admin.test.ts |
| GET | `/v1/admin/accounts` | apps/api/src/admin.test.ts |
| GET | `/v1/admin/activity` | apps/api/src/admin.test.ts |
| GET | `/v1/admin/mcp-usage` | apps/api/src/admin.test.ts |
| GET | `/v1/admin/revenue` | apps/api/src/admin.test.ts |
| GET | `/llms.txt` | apps/api/src/agent-discovery.test.ts |
| GET | `/.well-known/skills/index.json` | apps/api/src/agent-discovery.test.ts |
| GET | `/v1/docs.md` | apps/api/src/agent-discovery.test.ts |
| GET | `/.well-known/axis.json` | apps/api/src/agent-discovery.test.ts |
| GET | `/for-agents` | apps/api/src/agent-discovery.test.ts |
| GET | `/v1/install` | apps/api/src/agent-discovery.test.ts |
| GET | `/v1/install/:platform` | apps/api/src/agent-discovery.test.ts |
| POST | `/probe-intent` | apps/api/src/agent-discovery.test.ts |
| GET | `/v1/error-codes` | apps/api/src/agent-discovery.test.ts |
| POST | `/mcp` | apps/api/src/analyze-repo-success.test.ts |
| POST | `/v1/analyze` | apps/api/src/analyze.test.ts |
| GET | `/.well-known/axis.json` | apps/api/src/analyze.test.ts |
| POST | `/v1/snapshots` | apps/api/src/api-branches.test.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/api-branches.test.ts |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/api-branches.test.ts |
| GET | `/v1/projects/:project_id/context` | apps/api/src/api-branches.test.ts |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/api-branches.test.ts |
| GET | `/v1/projects/:project_id/generated-files/:file_path` | apps/api/src/api-branches.test.ts |
| DELETE | `/v1/projects/:project_id` | apps/api/src/api-branches.test.ts |
| GET | `/v1/health` | apps/api/src/api-branches.test.ts |
| GET | `/v1/db/stats` | apps/api/src/api-branches.test.ts |
| POST | `/v1/db/maintenance` | apps/api/src/api-branches.test.ts |
| POST | `/v1/search/index` | apps/api/src/api-branches.test.ts |
| POST | `/v1/search/query` | apps/api/src/api-branches.test.ts |
| GET | `/v1/search/:snapshot_id/stats` | apps/api/src/api-branches.test.ts |
| *… 551 more* | | |

## Directory Layout

- `apps/` — monorepo_apps (295 files)
- `docs/` — documentation (48 files)
- `packages/` — monorepo_packages (19 files)
- `mcp/` — project_directory (12 files)
- `examples/` — project_directory (11 files)
- `scripts/` — build_scripts (11 files)
- `.github/` — project_directory (10 files)
- `packaging/` — project_directory (6 files)
- `search/` — project_directory (2 files)

## Dependency Hotspots

| File | Inbound | Outbound | Risk |
|------|---------|----------|------|
| apps/api/src/router.ts | 113 | 4 | 100% |
| apps/api/src/test-helpers.ts | 54 | 1 | 100% |
| apps/api/src/billing.ts | 44 | 3 | 100% |
| apps/api/src/handlers.ts | 36 | 21 | 100% |
| apps/api/src/rate-limiter.ts | 46 | 2 | 100% |
| apps/api/src/mcp-tool-impls.ts | 18 | 27 | 100% |
| apps/api/src/mpp.ts | 19 | 1 | 100% |
| apps/api/src/logger.ts | 34 | 0 | 100% |
| apps/api/src/mcp-server.ts | 17 | 15 | 100% |
| apps/api/src/server.ts | 2 | 35 | 100% |
| apps/web/src/api.ts | 17 | 1 | 90% |
| apps/api/src/counts.ts | 16 | 0 | 80% |
| apps/api/src/mcp-runtime.ts | 10 | 2 | 60% |
| apps/cli/src/cli.ts | 6 | 6 | 60% |
| apps/api/src/mcp-tools.ts | 10 | 1 | 55% |
| apps/api/src/metrics.ts | 10 | 1 | 55% |
| apps/api/src/cashier.ts | 7 | 3 | 50% |
| apps/api/src/stripe.ts | 5 | 5 | 50% |
| apps/api/src/env.ts | 10 | 0 | 50% |
| apps/api/src/lite-caps.test.ts | 0 | 10 | 50% |

## Domain Models

Detected 278 domain models:

| Model | Kind | Fields | Source |
|-------|------|--------|--------|
| `AlertThresholds` | interface | 2 | apps/api/src/alerting.ts |
| `Counters` | type_alias | 2 | apps/api/src/alerting.ts |
| `DebounceState` | interface | 2 | apps/api/src/alerting.ts |
| `WindowResult` | interface | 4 | apps/api/src/alerting.ts |
| `AnalyticsCountByBucketResult` | interface | 3 | apps/api/src/analytics.ts |
| `AnalyticsCountByBucketRow` | interface | 2 | apps/api/src/analytics.ts |
| `AnalyticsCountByEventResult` | interface | 2 | apps/api/src/analytics.ts |
| `AnalyticsCountByEventRow` | interface | 2 | apps/api/src/analytics.ts |
| `AnalyticsCountResult` | interface | 2 | apps/api/src/analytics.ts |
| `AnalyticsDistinctUsersResult` | interface | 2 | apps/api/src/analytics.ts |
| `AnalyticsEvent` | interface | 4 | apps/api/src/analytics.ts |
| `AnalyticsQuery` | interface | 8 | apps/api/src/analytics.ts |
| `WhereClause` | interface | 2 | apps/api/src/analytics.ts |
| `ChallengeWindow` | interface | 2 | apps/api/src/anon-frontdoor.ts |
| `DriftDeps` | interface | 5 | apps/api/src/architecture-drift-webhook.ts |
| `DriftOutcome` | interface | 3 | apps/api/src/architecture-drift-webhook.ts |
| `DriftResult` | interface | 3 | apps/api/src/architecture-drift.ts |
| `PushInfo` | interface | 7 | apps/api/src/architecture-drift.ts |
| `Attestation` | interface | 12 | apps/api/src/attestation.ts |
| `AttestationInput` | interface | 3 | apps/api/src/attestation.ts |
| `AttestationOutput` | interface | 3 | apps/api/src/attestation.ts |
| `ChainLink` | interface | 3 | apps/api/src/attestation.ts |
| `AuthContext` | interface | 3 | apps/api/src/billing.ts |
| `SettleOptions` | interface | 4 | apps/api/src/cashier.ts |
| `NotConfiguredResult` | interface | 6 | apps/api/src/code-sandbox.ts |
| *… 253 more* | | | |

> **High-complexity models** (8+ fields): `AnalyticsQuery`, `Attestation`, `OpenDriftPrParams`, `PullRequestPayload`, `PushPayload`, `HygieneReport`, `ClaimEvidence`, `CompletionOptions`, `PlannedCapability`, `OpenApiSpec`, `CreateCheckoutInput`, `PurchasingReadinessAnalysis`, +23 more — consider splitting if they grow further.

## Tooling

- **Build:** vite, make
- **Test:** vitest
- **Package Manager:** pnpm
- **CI:** github_actions
- **Deploy:** docker

## Conventions

- TypeScript strict mode
- Linter configured
- Formatter configured
- pnpm workspaces
- Makefile build

## File Tree

```
.github/actions/compliance-check/action.yml (13.0 KB)
.github/actions/context-freshness/README.md (5.3 KB)
.github/actions/context-freshness/action.yml (6.0 KB)
.github/app-manifest.json (1.0 KB)
.github/dependabot.yml (1.6 KB)
.github/workflows/ci.yml (11.0 KB)
.github/workflows/compliance-check.yml (1.7 KB)
.github/workflows/context-freshness.yml (0.9 KB)
.github/workflows/release.yml (1.9 KB)
.github/workflows/synthetic.yml (3.6 KB)
.gitignore (1.2 KB)
.prettierrc.json (0.1 KB)
.tmp-vitest.json (68.7 KB)
ACTIVATION_TRACKER.md (7.9 KB)
AGENTS.md (7.0 KB)
AXIS_Board_Pitch.md (30.7 KB)
AXIS_DEMO_REPORT.md (12.4 KB)
CHANGELOG.md (7.8 KB)
CLAUDE.md (7.9 KB)
CODE_TO_DOCS_BUILD_STRATEGY.md (11.1 KB)
COMPLIANCE_KIT_BUILD_SPEC.md (10.9 KB)
CONTRIBUTING.md (6.4 KB)
DEPLOY_OFF_ACTIONS_RUNBOOK.md (10.6 KB)
DISTRIBUTABLE.md (0.6 KB)
Dockerfile (0.9 KB)
E5_LIVING_ARCHITECTURE_DESIGN.md (4.7 KB)
E9_COMMERCE_INTEGRATION_DESIGN.md (4.0 KB)
ENV_ROUTING_MAP.md (10.5 KB)
HARDENING_AUDIT.md (8.8 KB)
ILIAD_PRODUCT_READINESS_SCORECARD.yaml (13.9 KB)
LAUNCH_CLAIMS.yaml (4.6 KB)
LAUNCH_RUNBOOK.md (17.7 KB)
Makefile (0.4 KB)
NEON_MIGRATION_PLAN.md (8.8 KB)
PRIVACY_POLICY.md (9.8 KB)
README.md (19.2 KB)
ROUTING_GO_LIVE_RUNBOOK.md (5.1 KB)
SECURITY.md (2.3 KB)
SETUP_PAID_STRIPE_MCP.md (13.6 KB)
SHARED_PAID_CLIENT_PLAN.md (3.6 KB)
SONNET5_REMEDIATION_PLAYBOOK.md (49.8 KB)
STRIPE_CHANGES_REQUIRED.md (12.9 KB)
TERMS_OF_SERVICE.md (8.5 KB)
V1_LAUNCH_TODO.md (13.5 KB)
V1_ROI_CANDIDATES.md (47.2 KB)
algorithmic-pack.json (7.9 KB)
apps/api/H1_INBAND_SETTLEMENT.md (6.7 KB)
apps/api/keys.env (4.3 KB)
apps/api/package.json (1.0 KB)
apps/api/src/account-lifecycle.test.ts (9.1 KB)
apps/api/src/admin.test.ts (14.2 KB)
apps/api/src/admin.ts (5.2 KB)
apps/api/src/agent-discovery.test.ts (39.1 KB)
apps/api/src/alerting.test.ts (5.6 KB)
apps/api/src/alerting.ts (5.7 KB)
apps/api/src/analytics.test.ts (12.1 KB)
apps/api/src/analytics.ts (15.5 KB)
apps/api/src/analyze-repo-success.test.ts (5.1 KB)
apps/api/src/analyze.test.ts (26.5 KB)
apps/api/src/anon-frontdoor.test.ts (5.2 KB)
apps/api/src/anon-frontdoor.ts (6.6 KB)
apps/api/src/api-branches.test.ts (22.1 KB)
apps/api/src/api-layer5.test.ts (10.7 KB)
apps/api/src/api.test.ts (20.8 KB)
apps/api/src/architecture-drift-webhook.test.ts (11.3 KB)
apps/api/src/architecture-drift-webhook.ts (8.4 KB)
apps/api/src/architecture-drift.test.ts (4.6 KB)
apps/api/src/architecture-drift.ts (4.4 KB)
apps/api/src/attestation.test.ts (4.7 KB)
apps/api/src/attestation.ts (8.5 KB)
apps/api/src/b-grade-upgrade.test.ts (10.2 KB)
apps/api/src/begin-loop-export.test.ts (3.5 KB)
apps/api/src/billing-flow.test.ts (27.1 KB)
apps/api/src/billing.test.ts (13.0 KB)
apps/api/src/billing.ts (37.5 KB)
apps/api/src/boot-resilience.test.ts (3.6 KB)
apps/api/src/budget-probe.test.ts (46.8 KB)
apps/api/src/cashier-paid-wallet.test.ts (21.6 KB)
apps/api/src/cashier-settled-payment.test.ts (12.8 KB)
apps/api/src/cashier-wallet-idempotency.test.ts (6.4 KB)
apps/api/src/cashier.ts (18.9 KB)
apps/api/src/changelog.test.ts (2.6 KB)
apps/api/src/checkout-email.test.ts (11.3 KB)
apps/api/src/closer-deploy-metering.test.ts (10.1 KB)
apps/api/src/code-sandbox.test.ts (9.7 KB)
apps/api/src/code-sandbox.ts (18.4 KB)
apps/api/src/commerce-integration.test.ts (8.8 KB)
apps/api/src/commerce-integration.ts (22.0 KB)
apps/api/src/compensate-on-post-charge-failure.test.ts (13.7 KB)
apps/api/src/compensator.test.ts (6.8 KB)
apps/api/src/compensator.ts (4.2 KB)
apps/api/src/count-honesty.test.ts (21.1 KB)
apps/api/src/counts-consistency.test.ts (4.9 KB)
apps/api/src/counts.ts (1.8 KB)
apps/api/src/crash-resilience.test.ts (4.7 KB)
apps/api/src/credit-pack-handlers.ts (6.2 KB)
apps/api/src/credit-pack-purchases.test.ts (5.1 KB)
apps/api/src/credits-api.test.ts (10.9 KB)
apps/api/src/db-endpoints.test.ts (5.9 KB)
apps/api/src/deletion.test.ts (9.8 KB)
apps/api/src/deliverability.test.ts (3.5 KB)
apps/api/src/deliverability.ts (5.3 KB)
apps/api/src/deployment.test.ts (10.6 KB)
apps/api/src/design-judge.test.ts (5.1 KB)
apps/api/src/design-judge.ts (3.5 KB)
apps/api/src/disputes.test.ts (22.5 KB)
apps/api/src/disputes.ts (16.1 KB)
apps/api/src/document-engineer.test.ts (3.4 KB)
apps/api/src/document-engineer.ts (5.1 KB)
apps/api/src/document-ocr.test.ts (1.9 KB)
apps/api/src/document-ocr.ts (2.4 KB)
apps/api/src/document-parsing.test.ts (21.2 KB)
apps/api/src/document-parsing.ts (20.8 KB)
apps/api/src/e2e-flows.test.ts (23.8 KB)
apps/api/src/e2e-smoke.test.ts (4.5 KB)
apps/api/src/email.test.ts (10.8 KB)
apps/api/src/email.ts (6.2 KB)
apps/api/src/embeddings-engineer.test.ts (3.9 KB)
apps/api/src/embeddings-engineer.ts (4.1 KB)
apps/api/src/embeddings.test.ts (12.3 KB)
apps/api/src/embeddings.ts (7.0 KB)
apps/api/src/env.test.ts (10.5 KB)
apps/api/src/env.ts (24.3 KB)
apps/api/src/export-edge-cases.test.ts (12.9 KB)
apps/api/src/export.test.ts (29.6 KB)
apps/api/src/export.ts (10.1 KB)
apps/api/src/firecrawl-402-fallthrough.test.ts (7.4 KB)
apps/api/src/fleet-handlers.test.ts (10.8 KB)
apps/api/src/fleet-handlers.ts (4.0 KB)
apps/api/src/funnel-api.test.ts (32.6 KB)
apps/api/src/funnel.ts (12.4 KB)
apps/api/src/github-pr.test.ts (7.5 KB)
apps/api/src/github-pr.ts (5.6 KB)
apps/api/src/github-webhook.test.ts (26.9 KB)
apps/api/src/github-webhook.ts (15.1 KB)
apps/api/src/github.test.ts (6.0 KB)
apps/api/src/github.ts (0.2 KB)
apps/api/src/handler-edge-cases.test.ts (11.8 KB)
apps/api/src/handler-shutdown.test.ts (2.8 KB)
apps/api/src/handler-validation.test.ts (11.4 KB)
apps/api/src/handlers-deep.test.ts (20.4 KB)
apps/api/src/handlers.ts (247.0 KB)
apps/api/src/html-extract.test.ts (6.5 KB)
apps/api/src/html-extract.ts (18.6 KB)
apps/api/src/hygiene.test.ts (16.3 KB)
apps/api/src/hygiene.ts (25.8 KB)
apps/api/src/idempotency-dispatch.test.ts (6.7 KB)
apps/api/src/intent.ts (2.7 KB)
apps/api/src/interpret-readiness.test.ts (1.5 KB)
apps/api/src/json-schema-validate.test.ts (5.3 KB)
apps/api/src/json-schema-validate.ts (6.7 KB)
apps/api/src/large-body-surcharge.test.ts (8.1 KB)
apps/api/src/latency-histogram.test.ts (9.2 KB)
apps/api/src/launch-claims.test.ts (11.5 KB)
apps/api/src/lite-caps.test.ts (24.2 KB)
apps/api/src/lite-caps.ts (11.5 KB)
apps/api/src/live-settlement.e2e.test.ts (5.9 KB)
apps/api/src/living-architecture.test.ts (11.5 KB)
apps/api/src/living-architecture.ts (17.7 KB)
apps/api/src/llm-inference.test.ts (6.7 KB)
apps/api/src/llm-inference.ts (10.0 KB)
apps/api/src/local-embeddings.test.ts (6.4 KB)
apps/api/src/local-embeddings.ts (7.1 KB)
apps/api/src/logger.test.ts (3.7 KB)
apps/api/src/logger.ts (12.3 KB)
apps/api/src/logging.test.ts (9.2 KB)
apps/api/src/mcp-anon-frontdoor.test.ts (6.5 KB)
apps/api/src/mcp-commerce-tools.test.ts (19.1 KB)
apps/api/src/mcp-embeddings.test.ts (5.1 KB)
apps/api/src/mcp-inband-settlement.test.ts (37.4 KB)
apps/api/src/mcp-runtime.test.ts (3.3 KB)
apps/api/src/mcp-runtime.ts (20.3 KB)
apps/api/src/mcp-server.test.ts (139.4 KB)
apps/api/src/mcp-server.ts (40.1 KB)
apps/api/src/mcp-tool-impls.ts (194.2 KB)
apps/api/src/mcp-tools.test.ts (2.6 KB)
apps/api/src/mcp-tools.ts (127.7 KB)
apps/api/src/memory-handlers.test.ts (10.8 KB)
apps/api/src/memory-handlers.ts (5.7 KB)
apps/api/src/metrics-branches.test.ts (2.7 KB)
apps/api/src/metrics.test.ts (7.2 KB)
apps/api/src/metrics.ts (7.6 KB)
apps/api/src/monorepo-boundaries.test.ts (5.1 KB)
apps/api/src/mpp.test.ts (20.3 KB)
apps/api/src/mpp.ts (10.2 KB)
apps/api/src/multi-tenancy.test.ts (20.0 KB)
apps/api/src/network-token.test.ts (21.9 KB)
apps/api/src/network-token.ts (12.6 KB)
apps/api/src/oauth-server.test.ts (11.3 KB)
apps/api/src/oauth-server.ts (11.3 KB)
apps/api/src/oauth.test.ts (17.0 KB)
apps/api/src/oauth.ts (10.7 KB)
apps/api/src/object-storage.test.ts (15.0 KB)
apps/api/src/object-storage.ts (14.7 KB)
apps/api/src/openapi-router-bijection.test.ts (4.9 KB)
apps/api/src/openapi.test.ts (16.3 KB)
apps/api/src/openapi.ts (100.5 KB)
apps/api/src/paid-client.test.ts (12.2 KB)
apps/api/src/paid-client.ts (6.6 KB)
apps/api/src/paid-handlers.test.ts (34.9 KB)
apps/api/src/paid-handlers.ts (23.4 KB)
apps/api/src/paid-integration-resilience.test.ts (2.4 KB)
apps/api/src/paid-live-canary.e2e.test.ts (7.2 KB)
apps/api/src/payment-required-contract.test.ts (11.2 KB)
apps/api/src/prepare-purchasing-preview.test.ts (1.7 KB)
apps/api/src/prepare-purchasing.test.ts (31.3 KB)
apps/api/src/production-startup.test.ts (9.4 KB)
apps/api/src/program-outputs-registry.test.ts (1.1 KB)
apps/api/src/programs-billing.test.ts (12.9 KB)
apps/api/src/projects-handlers.test.ts (13.3 KB)
apps/api/src/projects-handlers.ts (4.8 KB)
apps/api/src/purchasing-readiness-analysis.test.ts (18.9 KB)
apps/api/src/purchasing-readiness-analysis.ts (12.6 KB)
apps/api/src/quota-guardrails.test.ts (10.2 KB)
apps/api/src/quota.test.ts (4.5 KB)
apps/api/src/rate-limit-integration.test.ts (3.2 KB)
apps/api/src/rate-limiter.test.ts (16.9 KB)
apps/api/src/rate-limiter.ts (8.4 KB)
apps/api/src/readbody-gzip.test.ts (1.3 KB)
apps/api/src/record-usage-resilience.test.ts (6.6 KB)
apps/api/src/request-limits.test.ts (4.1 KB)
apps/api/src/resolve-stage-resilience.test.ts (4.6 KB)
apps/api/src/router-branches.test.ts (12.5 KB)
apps/api/src/router.test.ts (17.2 KB)
apps/api/src/router.ts (24.3 KB)
apps/api/src/scan-diff-secrets.test.ts (7.0 KB)
apps/api/src/search-api.test.ts (14.4 KB)
apps/api/src/security.test.ts (7.1 KB)
apps/api/src/server-lifecycle.test.ts (7.0 KB)
apps/api/src/server-routes.test.ts (6.3 KB)
apps/api/src/server.ts (22.4 KB)
apps/api/src/snapshot-auth.test.ts (15.7 KB)
apps/api/src/snapshot-double-charge.test.ts (6.9 KB)
apps/api/src/speech-to-text-lite.test.ts (4.8 KB)
apps/api/src/speech-to-text.test.ts (16.6 KB)
apps/api/src/speech-to-text.ts (20.9 KB)
apps/api/src/strategic-docs-honesty.test.ts (2.6 KB)
apps/api/src/stripe-branches.test.ts (40.6 KB)
apps/api/src/stripe.test.ts (37.5 KB)
apps/api/src/stripe.ts (28.8 KB)
apps/api/src/test-helpers.ts (1.2 KB)
apps/api/src/text-to-speech.test.ts (11.6 KB)
apps/api/src/text-to-speech.ts (18.6 KB)
apps/api/src/url-guard.test.ts (4.1 KB)
apps/api/src/url-guard.ts (6.6 KB)
apps/api/src/usage-timeseries.test.ts (7.3 KB)
apps/api/src/validation.test.ts (8.0 KB)
apps/api/src/vector-db.test.ts (12.8 KB)
apps/api/src/vector-db.ts (16.9 KB)
apps/api/src/vector-engineer.test.ts (3.4 KB)
apps/api/src/vector-engineer.ts (5.5 KB)
apps/api/src/versions.test.ts (15.3 KB)
apps/api/src/versions.ts (5.8 KB)
apps/api/src/voice.test.ts (3.1 KB)
apps/api/src/voice.ts (5.8 KB)
apps/api/src/web-fetch-sovereign.test.ts (4.4 KB)
apps/api/src/web-fetch-sovereign.ts (17.4 KB)
apps/api/src/web-research-crawl-pool-failure.test.ts (3.6 KB)
apps/api/src/web-research-crawl-pricing.test.ts (3.9 KB)
apps/api/src/web-research-scrape-cache.test.ts (4.8 KB)
apps/api/src/web-research-sovereign.test.ts (15.5 KB)
apps/api/src/web-research-sovereign.ts (5.3 KB)
apps/api/src/web-research.test.ts (37.8 KB)
apps/api/src/web-research.ts (5.5 KB)
apps/api/src/web-search.test.ts (13.0 KB)
apps/api/src/web-search.ts (20.7 KB)
apps/api/src/webhook-branches.test.ts (16.4 KB)
apps/api/src/webhooks.test.ts (13.7 KB)
apps/api/src/webhooks.ts (5.5 KB)
apps/api/src/well-known-handlers.test.ts (32.4 KB)
apps/api/src/x402-onboarding-cta.test.ts (3.3 KB)
apps/api/tsconfig.json (0.2 KB)
apps/cli/README.md (3.8 KB)
apps/cli/build.mjs (12.8 KB)
apps/cli/package.json (1.2 KB)
apps/cli/src/cli-auth.test.ts (7.6 KB)
apps/cli/src/cli-commands.test.ts (9.0 KB)
apps/cli/src/cli-docs-parity.test.ts (6.1 KB)
apps/cli/src/cli-edge-cases.test.ts (15.5 KB)
apps/cli/src/cli-export.test.ts (8.7 KB)
apps/cli/src/cli-pipeline.test.ts (9.3 KB)
apps/cli/src/cli-status.test.ts (11.1 KB)
apps/cli/src/cli.test.ts (14.4 KB)
apps/cli/src/cli.ts (19.2 KB)
apps/cli/src/credential-store.test.ts (8.4 KB)
apps/cli/src/credential-store.ts (3.2 KB)
apps/cli/src/determinism.test.ts (8.6 KB)
apps/cli/src/runner.test.ts (10.6 KB)
apps/cli/src/runner.ts (13.0 KB)
apps/cli/src/scanner.test.ts (4.7 KB)
apps/cli/src/scanner.ts (6.8 KB)
apps/cli/src/status.ts (3.8 KB)
apps/cli/src/writer.ts (1.1 KB)
apps/cli/src/zip.ts (4.6 KB)
apps/cli/tsconfig.json (0.4 KB)
apps/web/index.html (8.6 KB)
apps/web/package.json (0.5 KB)
apps/web/public/robots.txt (0.8 KB)
apps/web/src/App.tsx (33.7 KB)
apps/web/src/api.test.ts (68.0 KB)
apps/web/src/api.ts (66.3 KB)
apps/web/src/app-routing.test.tsx (54.8 KB)
apps/web/src/badge-utils.test.ts (1.4 KB)
apps/web/src/badge-utils.ts (1.5 KB)
apps/web/src/components/ArtifactExplorer.test.tsx (13.5 KB)
apps/web/src/components/ArtifactExplorer.tsx (18.4 KB)
apps/web/src/components/AuthButtons.tsx (5.1 KB)
apps/web/src/components/AxisIcons.tsx (8.9 KB)
apps/web/src/components/CommandPalette.test.tsx (3.4 KB)
apps/web/src/components/CommandPalette.tsx (8.6 KB)
apps/web/src/components/DangerButton.tsx (3.2 KB)
apps/web/src/components/DiffViewer.test.tsx (6.1 KB)
apps/web/src/components/DiffViewer.tsx (9.0 KB)
apps/web/src/components/FilesTab.test.tsx (3.5 KB)
apps/web/src/components/FilesTab.tsx (5.8 KB)
apps/web/src/components/GraphTab.tsx (4.8 KB)
apps/web/src/components/Icon.tsx (5.4 KB)
apps/web/src/components/LiveDemoTeaser.test.tsx (5.2 KB)
apps/web/src/components/LiveDemoTeaser.tsx (4.6 KB)
apps/web/src/components/OverviewTab.tsx (8.8 KB)
apps/web/src/config.ts (3.4 KB)
apps/web/src/heading-structure.test.tsx (11.1 KB)
apps/web/src/index.css (52.5 KB)
apps/web/src/main.tsx (0.3 KB)
apps/web/src/pages.test.tsx (33.9 KB)
apps/web/src/routes.test.tsx (13.5 KB)
apps/web/src/routes.tsx (38.2 KB)
apps/web/src/theme-toggle.test.tsx (3.0 KB)
apps/web/src/theme.css (14.3 KB)
apps/web/src/upload-utils-zip.test.ts (9.0 KB)
apps/web/src/upload-utils.test.ts (8.4 KB)
apps/web/src/upload-utils.ts (6.1 KB)
apps/web/src/useFocusRetention.test.tsx (2.1 KB)
apps/web/src/useFocusRetention.ts (1.0 KB)
apps/web/src/useHashRoute.ts (3.3 KB)
apps/web/src/useTabList.test.tsx (4.1 KB)
apps/web/src/useTabList.ts (2.6 KB)
apps/web/src/version.ts (0.1 KB)
apps/web/src/vite-env.d.ts (0.2 KB)
apps/web/tsconfig.json (0.5 KB)
apps/web/vite.config.ts (0.2 KB)
automated remedial action.yaml (7.5 KB)
axis_all_tools.yaml (23.8 KB)
axis_master_blueprint.yaml (9.6 KB)
begin.yaml (23.0 KB)
canvas-pack.md (9.7 KB)
capability_inventory.yaml (31.8 KB)
cloudflare-pages.md (2.6 KB)
competitive-gap-matrix.yaml (31.4 KB)
coverage-full.txt (249.9 KB)
daily-maintenance-runbook.yaml (6.2 KB)
docker-ci-run3.txt (24.3 KB)
docker-compose.yml (0.7 KB)
docs/AGENTIC_ASSET_STRATEGY.md (7.2 KB)
docs/FAILURE_MODES.md (5.8 KB)
docs/FAULT_INJECTION_GAUNTLET.md (7.9 KB)
docs/MCP_PAID_ACCESS_DESIGN.md (11.5 KB)
docs/MERCHANT_INTEGRATION_DOGFOODING.md (8.5 KB)
docs/RUNBOOK_ROLLBACK.md (9.8 KB)
docs/SECURITY_ROTATION.md (8.1 KB)
docs/agentic-asset/CONSTITUTION.md (6.0 KB)
docs/agentic-asset/EXECUTION_PLAN.md (9.0 KB)
docs/agentic-asset/README.md (2.7 KB)
docs/agentic-asset/WORK_ORDERS.yaml (57.2 KB)
docs/archive/SESSION_COOKIE_CUTOVER.md (2.6 KB)
docs/archive/e2e_ui_audit.yaml (39.4 KB)
docs/archive/e2e_wiring_audit.yaml (31.6 KB)
docs/archive/snapshot_protocol.yaml (8.4 KB)
docs/archive/static_analysis_phase.yaml (65.5 KB)
docs/build-plan/WO-01-billing-tiers-4.md (14.3 KB)
docs/build-plan/WO-02-inband-phase2.md (11.8 KB)
docs/build-plan/WO-03-live-collection-fix.md (11.4 KB)
docs/build-plan/WO-04-paid-rail-integration.md (16.4 KB)
docs/build-plan/WO-05-compliance-grader-real.md (11.4 KB)
docs/build-plan/WO-06-sca-exemption-engine.md (12.1 KB)
docs/build-plan/WO-07-ap2-tap-ucp-adapters.md (17.1 KB)
docs/build-plan/WO-08-dispute-lifecycle.md (14.0 KB)
docs/build-plan/WO-09-dispute-win-model.md (13.0 KB)
docs/build-plan/WO-10-readiness-real-analysis.md (14.1 KB)
docs/build-plan/WO-11-sovereign-embeddings.md (14.2 KB)
docs/build-plan/WO-12-sovereign-web-research.md (14.4 KB)
docs/build-plan/WO-13-commerce-engines-as-mcp-tools.md (16.2 KB)
docs/build-plan/WO-14-network-tokenization.md (15.8 KB)
docs/build-plan/WO-15-perf-benchmark.md (11.3 KB)
docs/build-plan/WO-16-axis-iliad-cli.md (13.3 KB)
docs/build-plan/WO-17-assetforge-prove.md (17.0 KB)
docs/build-plan/WO-18-ce3-evidence-assembler.md (4.7 KB)
docs/build-plan/WO-19-revenue-mrr-tracker.md (6.8 KB)
docs/build-plan/WO-20-charge-integrity-hybrid.md (6.0 KB)
docs/github-app-plan/BUILD_PLAN.md (13.1 KB)
docs/payment-gates.md (9.4 KB)
docs/runbooks/live-collection-verification.md (6.4 KB)
docs/web-plan/AUDIT-api.md (13.5 KB)
docs/web-plan/AUDIT-design.md (10.3 KB)
docs/web-plan/AUDIT-pages.md (12.8 KB)
docs/web-plan/BUILD-PLAN.md (32.8 KB)
docs/web-plan/GROK-HANDOFF.md (7.9 KB)
docs/webhook-replay-matrix.md (5.7 KB)
docs/x402/CONTRACT.md (6.3 KB)
docs/x402/PAYMENTS_COMPLIANCE.md (4.5 KB)
docs/x402/STRATEGY.md (16.8 KB)
e2e_full_human_ai_x402.mjs (53.1 KB)
ecosystem.registry.yaml (2.4 KB)
eslint-suppressions.json (11.3 KB)
eslint.config.js (5.4 KB)
examples/01-paid-platform/README.md (0.9 KB)
examples/01-paid-platform/generated/AGENTS.md (1.9 KB)
examples/01-paid-platform/generated/CLAUDE.md (0.9 KB)
examples/02-axis-scalpel/README.md (0.7 KB)
examples/02-axis-scalpel/generated/AGENTS.md (1.4 KB)
examples/02-axis-scalpel/generated/CLAUDE.md (0.8 KB)
examples/03-spacey/README.md (0.7 KB)
examples/04-slate-certification/README.md (0.7 KB)
examples/05-ruuuun/README.md (0.8 KB)
examples/README.json (9.1 KB)
examples/README.md (5.6 KB)
generate-keys.js (0.6 KB)
generated-posts.json (2.3 KB)
glama.json (0.1 KB)
human user audt.yaml (24.9 KB)
hygiene and memory.yaml (8.7 KB)
iliad-agentic-platform-strategy.yaml (29.5 KB)
launch-checklist.md (3.8 KB)
launch-content.md (6.1 KB)
llms.txt (0.8 KB)
ls-coverage.txt (250.3 KB)
marketing-pack.md (9.8 KB)
mcp-config.json (12.9 KB)
mcp/README.md (1.9 KB)
mcp/build-artifacts.md (1.0 KB)
mcp/core-implementation-artifacts.md (16.5 KB)
mcp/fintech-domain-schema.yaml (2.9 KB)
mcp/fintech-mcp-surface-package.md (8.6 KB)
mcp/monorepo-structure.md (3.2 KB)
mcp/package-json.package.template.json (0.6 KB)
mcp/package-json.root.template.json (0.7 KB)
mcp/project-setup.md (0.9 KB)
mcp/testing-documentation-polish-artifacts.md (2.0 KB)
mcp/tsconfig.package.template.json (0.7 KB)
mcp/tsconfig.root.template.json (1.1 KB)
memory generator.yaml (7.6 KB)
obsidian-vault-pack.md (9.3 KB)
package.json (2.0 KB)
packages/agentic-compliance/package.json (1.4 KB)
packages/agentic-compliance/tsconfig.json (0.2 KB)
packages/ap2/README.md (3.9 KB)
packages/ap2/package.json (0.9 KB)
packages/ap2/tsconfig.json (0.2 KB)
packages/context-engine/package.json (0.9 KB)
packages/context-engine/tsconfig.json (0.2 KB)
packages/generator-core/package.json (1.1 KB)
packages/generator-core/perf-results.json (1.9 KB)
packages/generator-core/tsconfig.json (0.2 KB)
packages/iliad-md/README.md (2.7 KB)
packages/iliad-md/package.json (0.9 KB)
packages/iliad-md/tsconfig.json (0.2 KB)
packages/mpp/README.md (9.0 KB)
packages/mpp/package.json (0.9 KB)
packages/mpp/tsconfig.json (0.2 KB)
packages/paid-client/README.md (2.5 KB)
packages/paid-client/package.json (0.9 KB)
packages/paid-client/tsconfig.json (0.2 KB)
packaging/README.md (1.6 KB)
packaging/manifests/dockerhub-repository.md (1.4 KB)
packaging/manifests/github-marketplace-listing.md (4.0 KB)
packaging/manifests/vscode-extension.json (0.5 KB)
packaging/trust-fabric/attestation.json (2.1 KB)
packaging/trust-fabric/merkle-proof.json (3.5 KB)
pnpm-lock.yaml (0.0 KB)
pnpm-workspace.yaml (0.1 KB)
rebrand-rollout-checklist.md (1.7 KB)
remotion-pack.md (9.1 KB)
render.yaml (5.8 KB)
repo-run-stats.json (2.7 KB)
repo_snapshot.yaml (80.7 KB)
rules to compile snapshot.yaml (19.4 KB)
scripts/README.md (3.0 KB)
scripts/check-artifact-freshness.ts (6.1 KB)
scripts/generate-posts.js (12.1 KB)
scripts/live-probe.mjs (8.0 KB)
scripts/post-content.js (5.2 KB)
scripts/regenerate.ps1 (3.5 KB)
scripts/regenerate.sh (2.6 KB)
scripts/scan-diff-secrets.mjs (7.2 KB)
scripts/setup-posting.js (2.4 KB)
scripts/test-ci-mirror.mjs (1.2 KB)
scripts/test-webhook-server.js (1.5 KB)
search/schemas/context-map.schema.json (10.9 KB)
search/schemas/repo-profile.schema.yaml (6.7 KB)
seo-distribution-playbook.md (3.4 KB)
server.json (3.2 KB)
stalling fix.txt (2.6 KB)
superpowers-pack.md (9.8 KB)
test_output.txt (12.3 KB)
tsconfig.base.json (0.5 KB)
vitest-full.txt (252.5 KB)
vitest-output.txt (254.1 KB)
vitest.config.ts (1.1 KB)
vitest.setup.ts (0.7 KB)
vitest_requested_output.txt (151.4 KB)
```

## Entry Points (Source)

### `apps/api/src/server.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";
import { Router, createApp } from "./router.js";
import { startAlerting } from "./alerting.js";
import {
  handleCreateSnapshot,
  handleGetSnapshot,
  handleGetContext,
  handleGetGeneratedFiles,
  handleGetGeneratedFile,
  handleSearchExport,
  handleSkillsGenerate,
  handleDebugAnalyze,
  handleFrontendAudit,
  handleSeoAnalyze,
  handleOptimizationAnalyze,
  handleThemeGenerate,
  handleBrandGenerate,
  handleSuperpowersGenerate,
  handleMarketingGenerate,
  handleNotebookGenerate,
  handleObsidianAnalyze,
  handleMcpProvision,
  handleArtifactsGenerate,
  handleRemotionGenerate,
  handleCanvasGenerate,
  handleAlgorithmicGenerate,
  handleAgenticPurchasingGenerate,
  handleCloserGenerate,
  handleDeployGenerate,
  handleGitHubAnalyze,
... (522 more lines)
```

### `apps/web/src/App.tsx`

```tsx
import { useState, useCallback, useEffect, useMemo, useRef, Fragment, Component, Suspense, type ReactNode } from "react";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal, type SignUpTrigger } from "./components/SignUpModal.tsx";
import { Icon } from "./components/Icon.tsx";
import { PageFooter } from "./components/primitives/PageFooter.tsx";
import { getAdminStats, migrateLegacyKey, logoutSession, getProjectContext, getGeneratedFiles, rememberReturnTo, consumeReturnTo, ApiError, type SnapshotResponse } from "./api.ts";
import { APP_VERSION } from "./version.ts";
import {
  ROUTES,
  NAV_GROUPS,
  AUTH_ONLY_PAGES,
  routeForPage,
  isRouteVisible,
  navLabelFor,
  tabLabelFor,
  ownsShortcut,
  routeForShortcut,
  visibleRailRoutes,
  visibleGroupRoutes,
  hashForPage,
  matchHash,
  type NavContext,
  type PageId,
  type RouteContext,
  type RouteDef,
  type RouteParams,
} from "./routes.tsx";
import { useHashRoute, isOAuthCallback } from "./useHashRoute.ts";
... (686 more lines)
```

### `apps/web/src/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./theme.css"; // generated design-system contract (app copy) — must load before index.css
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

```

## Configuration Files

### `.prettierrc.json`

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}

```

### `package.json`

```json
{
  "name": "axis-iliad",
  "version": "0.5.3",
  "private": true,
  "type": "module",
  "description": "Axis' Iliad - one API call that turns any codebase into 142 deterministic AI-agent-ready artifacts (AGENTS.md, CLAUDE.md, design tokens, Visa CE 3.0 compliance kit, MCP configs, and more)",
  "keywords": [
    "ai",
    "agents",
    "mcp",
    "codebase-analysis",
    "artifact-generation",
    "agents-md",
    "claude-md",
    "cursorrules",
    "llm-context",
    "visa-compliance",
    "x402",
    "ap2",
    "agentic-commerce"
  ],
  "license": "MIT",
  "packageManager": "pnpm@10.33.0",
  "repository": {
    "type": "git",
... (43 more lines)
```

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noUnusedLocals": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "exclude": ["node_modules", "dist"]
}

```

### `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    environment: "node",
    pool: "threads",
    // The Postgres-backed suite (Phase 6 of the Neon migration) shares one test
    // database, so test files must not run concurrently (they truncate tables
    // between tests). Within a file, tests already run sequentially.
    fileParallelism: false,
    maxWorkers: process.env.CI ? 4 : undefined,
    hookTimeout: 300_000,
    environmentOptions: {
      happyDom: {},
    },
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.bench.ts",
        "**/*.d.ts",
        "**/node_modules/**",
... (14 more lines)
```

### `mcp/tsconfig.package.template.json`

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/.tsbuildinfo",
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": [
      "ES2022"
    ],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "baseUrl": ".",
    "paths": {
      "@packages/*": [
        "../*/src"
      ]
... (11 more lines)
```

### `mcp/tsconfig.root.template.json`

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": [
      "ES2022"
    ],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "baseUrl": ".",
    "paths": {
      "@apps/*": [
        "apps/*/src"
... (35 more lines)
```

### `apps/api/package.json`

```json
{
  "name": "@axis/api",
  "version": "0.5.3",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "npx tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "echo skipped — run vitest from root"
  },
  "dependencies": {
    "@axis/agentic-compliance": "workspace:*",
    "@axis/ap2": "workspace:*",
    "@axis/context-engine": "workspace:*",
    "@axis/generator-core": "workspace:*",
    "@axis/mpp": "workspace:*",
    "@axis/paid-client": "workspace:*",
    "@axis/repo-parser": "workspace:*",
    "@axis/snapshots": "workspace:*",
    "dockerode": "^5.0.1",
    "ffmpeg-static": "^5.3.0",
    "jsonwebtoken": "^9.0.3",
    "mammoth": "^1.12.0",
    "mppx": "^0.5.12",
... (13 more lines)
```

### `apps/api/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}

```

### `packages/agentic-compliance/package.json`

```json
{
  "name": "@axis/agentic-compliance",
  "version": "0.5.3",
  "private": true,
  "type": "module",
  "description": "Deterministic, transparent engines backing the visa_compliance_kit claims (CE 3.0 evidence assembly, dispute win-probability scoring, and the rail-agnostic dispute lifecycle: state machine, representment builder, Stripe dispute client live today, VROL/RDR/CDRN integration-ready behind AXIS_ENABLE_VROL) — pure engines plus injectable-fetch clients, no black-box scores, no runtime deps.",
  "keywords": [
    "compliance",
    "visa",
    "ce3",
    "compelling-evidence",
    "dispute-win-probability",
    "ap2",
    "dispute",
    "chargeback",
    "representment",
    "visa-compliance",
    "vrol",
    "rdr",
    "cdrn",
    "agentic-commerce",
    "mcp"
  ],
  "license": "MIT",
  "repository": {
... (23 more lines)
```

### `packages/agentic-compliance/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}

```

### `apps/cli/package.json`

```json
{
  "name": "axis-iliad",
  "version": "1.0.0",
  "type": "module",
  "description": "Axis' Iliad CLI — fully-offline codebase analysis that turns any repository into deterministic AI-agent-ready artifacts (AGENTS.md, CLAUDE.md, .cursorrules, debug playbooks, and 100+ more)",
  "keywords": [
    "ai",
    "agents",
    "cli",
    "codebase-analysis",
    "agents-md",
    "claude-md",
    "cursorrules",
    "llm-context",
    "artifact-generation"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/lastmanupinc-hub/axis-iliad.git",
    "directory": "apps/cli"
  },
  "bin": {
    "axis-iliad": "./bin/axis.js",
    "axis": "./bin/axis.js"
... (26 more lines)
```

### `apps/cli/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}

```

### `packages/ap2/package.json`

```json
{
  "name": "@axis/ap2",
  "version": "0.5.3",
  "type": "module",
  "description": "AP2 mandate / TAP token-lifecycle / UCP settlement codecs — schema-validating, EdDSA-signed message encode/decode/validate/sign/verify for agentic-commerce interop",
  "keywords": [
    "ap2",
    "tap",
    "ucp",
    "agentic-commerce",
    "mandate",
    "jws",
    "ed25519",
    "jcs",
    "canonicalization",
    "visa-compliance"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/lastmanupinc-hub/axis-iliad.git",
    "directory": "packages/ap2"
  },
  "exports": {
    ".": {
... (15 more lines)
```

### `packages/ap2/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/__fixtures__"]
}

```

### `apps/web/package.json`

```json
{
  "name": "@axis/web",
  "private": true,
  "version": "0.5.3",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "jszip": "^3.10.1",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "@vitejs/plugin-react": "^4.5.2",
    "typescript": "~5.7.0",
    "vite": "^6.4.3"
  }
}

```

### `apps/web/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"]
}

```

### `apps/web/vite.config.ts`

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/v1": "http://localhost:4000",
    },
  },
});

```

### `packages/context-engine/package.json`

```json
{
  "name": "@axis/context-engine",
  "version": "0.5.3",
  "type": "module",
  "description": "Context map and repo profile builders — transforms parsed code into structured LLM context",
  "keywords": ["codebase", "context", "ai", "llm", "repo-profile", "context-map", "mcp", "agent"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/lastmanupinc-hub/axis-iliad.git",
    "directory": "packages/context-engine"
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc",
    "test": "echo skipped — run vitest from root"
  },
  "dependencies": {
    "@axis/snapshots": "workspace:*",
... (8 more lines)
```

### `packages/context-engine/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}

```

### `packages/generator-core/package.json`

```json
{
  "name": "@axis/generator-core",
  "version": "0.5.3",
  "type": "module",
  "description": "142 generators across 20 programs - produces AGENTS.md, CLAUDE.md, .cursorrules, design tokens, Visa compliance artifacts, and more structured AI-agent files from any codebase",
  "keywords": ["codegen", "ai", "agents", "mcp", "llm", "agents-md", "cursorrules", "design-tokens", "compliance", "visa", "ap2", "artifact-generation"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/lastmanupinc-hub/axis-iliad.git",
    "directory": "packages/generator-core"
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
... (12 more lines)
```

### `packages/generator-core/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}

```

### `packages/iliad-md/package.json`

```json
{
  "name": "iliad-md",
  "version": "0.1.0",
  "type": "module",
  "description": "Generate and maintain AGENTS.md, CLAUDE.md, .cursorrules, .github/copilot-instructions.md, and GEMINI.md from static repository analysis. Deterministic, zero runtime dependencies.",
  "keywords": [
    "agents-md",
    "claude-md",
    "cursorrules",
    "copilot-instructions",
    "gemini-md",
    "llm-context",
    "codebase-analysis",
    "cli"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/lastmanupinc-hub/axis-iliad.git",
    "directory": "packages/iliad-md"
  },
  "bin": {
    "iliad": "./dist/cli.js"
  },
  "files": [
... (17 more lines)
```

### `packages/iliad-md/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/*.test-helper.ts"]
}

```

*... 4 more files omitted for brevity*
---
*Generated by Axis Search — 1970-01-01*


---

## ⟳ Continue the loop

- **You are here:** `architecture-summary.md` — agent step 1 of 71.
- **Next:** `AGENTS.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
