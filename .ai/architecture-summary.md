# Architecture Summary: axis-iliad

> > **Axis' Iliad — The modern epic that shapes raw codebases into canonical, agent-ready artifacts. Axis' Iliad authors the definitive foundation for the next era of natural-language workspace development.**

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Overview

- **Primary Language:** TypeScript
- **Project Type:** monorepo
- **Files:** 500 (115124 LOC)
- **Directories:** 57

## Frameworks & Libraries

- **React** ^19.1.0 (95% confidence)

## Architecture Patterns

- `monorepo`
- `containerized`
- **Separation Score:** 0.65

## Layer Boundaries

| Layer | Directories |
|-------|------------|
| presentation | apps, frontend |

## Routes

| Method | Path | Source |
|--------|------|--------|
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
| POST | `/v1/debug/analyze` | apps/api/src/api-branches.test.ts |
| GET | `/v1/docs` | apps/api/src/api-branches.test.ts |
| GET | `/v1/programs` | apps/api/src/api-branches.test.ts |
| POST | `/v1/account/seats` | apps/api/src/api-branches.test.ts |
| GET | `/v1/account/seats` | apps/api/src/api-branches.test.ts |
| POST | `/v1/account/seats/:seat_id/accept` | apps/api/src/api-branches.test.ts |
| POST | `/v1/account/seats/:seat_id/revoke` | apps/api/src/api-branches.test.ts |
| GET | `/v1/account/upgrade-prompt` | apps/api/src/api-branches.test.ts |
| *… 500 more* | | |

## Directory Layout

- `apps/` — monorepo_apps (235 files)
- `packages/` — monorepo_packages (93 files)
- `docs/` — documentation (21 files)
- `examples/` — project_directory (17 files)
- `mcp/` — project_directory (16 files)
- `.github/` — project_directory (8 files)
- `algorithmic/` — project_directory (4 files)
- `artifacts/` — project_directory (4 files)
- `brand/` — project_directory (4 files)
- `canvas/` — project_directory (4 files)
- `debug/` — project_directory (4 files)
- `frontend/` — project_directory (4 files)
- `marketing/` — project_directory (4 files)
- `notebook/` — project_directory (4 files)
- `obsidian/` — project_directory (4 files)
- `optimization/` — project_directory (4 files)

## Dependency Hotspots

| File | Inbound | Outbound | Risk |
|------|---------|----------|------|
| apps/api/src/router.ts | 96 | 4 | 100% |
| apps/api/src/test-helpers.ts | 41 | 1 | 100% |
| apps/api/src/billing.ts | 28 | 3 | 100% |
| apps/api/src/handlers.ts | 23 | 14 | 100% |
| apps/api/src/rate-limiter.ts | 36 | 2 | 100% |
| apps/api/src/logger.ts | 25 | 0 | 100% |
| apps/api/src/server.ts | 1 | 35 | 100% |
| apps/web/src/App.tsx | 1 | 24 | 100% |
| packages/generator-core/src/generate.ts | 30 | 6 | 100% |
| apps/api/src/mcp-tool-impls.ts | 0 | 24 | 100% |
| apps/api/src/mcp-server.ts | 11 | 8 | 95% |
| apps/web/src/api.ts | 19 | 0 | 95% |
| apps/web/src/pages.test.tsx | 0 | 18 | 90% |
| apps/api/src/counts.ts | 12 | 0 | 60% |
| apps/web/src/pages/DashboardPage.tsx | 1 | 10 | 55% |
| apps/api/src/metrics.ts | 9 | 1 | 50% |
| apps/api/src/env.ts | 10 | 0 | 50% |
| apps/api/src/export.ts | 6 | 3 | 45% |
| apps/api/src/architecture-drift-webhook.ts | 2 | 6 | 40% |
| apps/cli/src/scanner.ts | 8 | 0 | 40% |

## Domain Models

Detected 242 domain models:

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
| `DriftDeps` | interface | 5 | apps/api/src/architecture-drift-webhook.ts |
| `DriftOutcome` | interface | 3 | apps/api/src/architecture-drift-webhook.ts |
| `DriftResult` | interface | 3 | apps/api/src/architecture-drift.ts |
| `PushInfo` | interface | 7 | apps/api/src/architecture-drift.ts |
| `Attestation` | interface | 12 | apps/api/src/attestation.ts |
| `AttestationInput` | interface | 3 | apps/api/src/attestation.ts |
| `AttestationOutput` | interface | 3 | apps/api/src/attestation.ts |
| `ChainLink` | interface | 3 | apps/api/src/attestation.ts |
| `AuthContext` | interface | 3 | apps/api/src/billing.ts |
| `NotConfiguredResult` | interface | 4 | apps/api/src/code-sandbox.ts |
| `SandboxOptions` | interface | 4 | apps/api/src/code-sandbox.ts |
| `SandboxResult` | interface | 6 | apps/api/src/code-sandbox.ts |
| *… 217 more* | | | |

> **High-complexity models** (8+ fields): `AnalyticsQuery`, `Attestation`, `OpenDriftPrParams`, `PullRequestPayload`, `PushPayload`, `HygieneReport`, `ClaimEvidence`, `CompletionOptions`, `PlannedCapability`, `OpenApiSpec`, `CreateCheckoutInput`, `WhisperJsonShape`, `AdminRevenue`, `ContextMap`, `CreditsInfo`, `FunnelMetrics`, `McpUsageResponse`, `MyAnalyticsSummary`, `RepoProfile`, `ScrapeResult`, `SnapshotPayload`, `SnapshotResponse`, `SubscriptionInfo`, `UpgradePrompt`, `ToolPageProps`, `ProgramDoc`, `rules`, `Example`, `ToolCatalogEntry`, `ContextMap`, `RepoProfile`, `CommerceSignals`, `ResellCapability`, `ProjectSignals` — consider splitting if they grow further.

## Tooling

- **Build:** vite, make
- **Test:** vitest
- **CI:** github_actions
- **Deploy:** docker

## Conventions

- TypeScript strict mode
- Linter configured
- Formatter configured
- Makefile build

## Warnings

- ⚠️ No lockfile found — dependency versions may be inconsistent

## File Tree

```
.github/actions/compliance-check/action.yml (12.3 KB)
.github/actions/context-freshness/README.md (5.3 KB)
.github/actions/context-freshness/action.yml (6.0 KB)
.github/app-manifest.json (0.9 KB)
.github/workflows/ci.yml (8.5 KB)
.github/workflows/compliance-check.yml (0.7 KB)
.github/workflows/context-freshness.yml (0.9 KB)
.github/workflows/release.yml (0.6 KB)
.gitignore (0.6 KB)
.prettierrc.json (0.1 KB)
.tmp-vitest.json (68.7 KB)
ACTIVATION_TRACKER.md (7.6 KB)
AGENTS.md (7.0 KB)
AXIS_Board_Pitch.md (30.7 KB)
AXIS_DEMO_REPORT.md (12.3 KB)
CHANGELOG.md (7.8 KB)
CLAUDE.md (7.0 KB)
CONTRIBUTING.md (6.4 KB)
DEPLOY_OFF_ACTIONS_RUNBOOK.md (10.6 KB)
DISTRIBUTABLE.md (0.6 KB)
Dockerfile (0.9 KB)
E5_LIVING_ARCHITECTURE_DESIGN.md (4.7 KB)
E9_COMMERCE_INTEGRATION_DESIGN.md (4.0 KB)
ENV_ROUTING_MAP.md (10.5 KB)
FRONTEND_DEEP_DIVE.md (19.1 KB)
HARDENING_AUDIT.md (8.8 KB)
ILIAD_PRODUCT_READINESS_SCORECARD.yaml (13.9 KB)
LAUNCH_CLAIMS.yaml (4.2 KB)
LAUNCH_RUNBOOK.md (14.9 KB)
Makefile (0.4 KB)
NEON_MIGRATION_PLAN.md (8.8 KB)
PRIVACY_POLICY.md (9.4 KB)
ProgramPipeline.js (11.3 KB)
README.md (17.4 KB)
ROUTING_GO_LIVE_RUNBOOK.md (5.1 KB)
SECURITY.md (2.2 KB)
SESSION_COOKIE_CUTOVER.md (2.4 KB)
SETUP_PAID_STRIPE_MCP.md (12.9 KB)
SHARED_PAID_CLIENT_PLAN.md (3.6 KB)
STRIPE_CHANGES_REQUIRED.md (9.5 KB)
TERMS_OF_SERVICE.md (7.7 KB)
V1_LAUNCH_TODO.md (13.2 KB)
V1_ROI_CANDIDATES.md (40.7 KB)
algorithmic-pack.json (7.9 KB)
algorithmic/MEMORY.yaml (2.9 KB)
algorithmic/begin.yaml (1.8 KB)
algorithmic/continuation.yaml (2.4 KB)
algorithmic/schemas/output-contract.schema.json (1.8 KB)
apps/api/check-table.js (0.3 KB)
apps/api/gen-keys.js (0.3 KB)
apps/api/keys.env (4.3 KB)
apps/api/mcp-server.json (10.4 KB)
apps/api/package.json (1.0 KB)
apps/api/src/admin.test.ts (13.2 KB)
apps/api/src/admin.ts (4.8 KB)
apps/api/src/agent-discovery.test.ts (22.6 KB)
apps/api/src/alerting.test.ts (2.9 KB)
apps/api/src/alerting.ts (5.7 KB)
apps/api/src/analytics.test.ts (12.1 KB)
apps/api/src/analytics.ts (15.5 KB)
apps/api/src/analyze-repo-success.test.ts (5.1 KB)
apps/api/src/analyze.test.ts (19.2 KB)
apps/api/src/api-branches.test.ts (22.1 KB)
apps/api/src/api-layer5.test.ts (10.7 KB)
apps/api/src/api.test.ts (20.7 KB)
apps/api/src/architecture-drift-webhook.test.ts (3.8 KB)
apps/api/src/architecture-drift-webhook.ts (8.4 KB)
apps/api/src/architecture-drift.test.ts (4.6 KB)
apps/api/src/architecture-drift.ts (4.4 KB)
apps/api/src/attestation.test.ts (4.7 KB)
apps/api/src/attestation.ts (8.5 KB)
apps/api/src/b-grade-upgrade.test.ts (8.6 KB)
apps/api/src/billing-flow.test.ts (26.9 KB)
apps/api/src/billing.test.ts (12.8 KB)
apps/api/src/billing.ts (28.5 KB)
apps/api/src/boot-resilience.test.ts (3.6 KB)
apps/api/src/budget-probe.test.ts (41.3 KB)
apps/api/src/checkout-email.test.ts (12.7 KB)
apps/api/src/code-sandbox.test.ts (9.6 KB)
apps/api/src/code-sandbox.ts (17.9 KB)
apps/api/src/commerce-integration.test.ts (6.8 KB)
apps/api/src/commerce-integration.ts (18.1 KB)
apps/api/src/count-honesty.test.ts (6.3 KB)
apps/api/src/counts-consistency.test.ts (2.0 KB)
apps/api/src/counts.ts (1.8 KB)
apps/api/src/crash-resilience.test.ts (4.7 KB)
apps/api/src/credit-pack-handlers.ts (5.7 KB)
apps/api/src/credits-api.test.ts (10.9 KB)
apps/api/src/db-endpoints.test.ts (5.9 KB)
apps/api/src/deletion.test.ts (9.8 KB)
apps/api/src/deliverability.test.ts (3.5 KB)
apps/api/src/deliverability.ts (5.3 KB)
apps/api/src/deployment.test.ts (6.7 KB)
apps/api/src/design-judge.test.ts (5.1 KB)
apps/api/src/design-judge.ts (3.5 KB)
apps/api/src/document-engineer.test.ts (2.8 KB)
apps/api/src/document-engineer.ts (4.1 KB)
apps/api/src/document-ocr.test.ts (1.9 KB)
apps/api/src/document-ocr.ts (2.4 KB)
apps/api/src/document-parsing.test.ts (9.7 KB)
apps/api/src/document-parsing.ts (18.7 KB)
apps/api/src/e2e-flows.test.ts (23.8 KB)
apps/api/src/e2e-smoke.test.ts (4.5 KB)
apps/api/src/email.test.ts (9.1 KB)
apps/api/src/email.ts (5.7 KB)
apps/api/src/embeddings-engineer.test.ts (3.9 KB)
apps/api/src/embeddings-engineer.ts (4.1 KB)
apps/api/src/embeddings.test.ts (7.5 KB)
apps/api/src/embeddings.ts (5.7 KB)
apps/api/src/env.test.ts (8.2 KB)
apps/api/src/env.ts (11.8 KB)
apps/api/src/export-edge-cases.test.ts (12.9 KB)
apps/api/src/export.test.ts (29.6 KB)
apps/api/src/export.ts (10.1 KB)
apps/api/src/fleet-handlers.test.ts (10.8 KB)
apps/api/src/fleet-handlers.ts (4.0 KB)
apps/api/src/funnel-api.test.ts (29.9 KB)
apps/api/src/funnel.ts (11.7 KB)
apps/api/src/github-pr.test.ts (4.3 KB)
apps/api/src/github-pr.ts (4.9 KB)
apps/api/src/github-webhook.test.ts (22.1 KB)
apps/api/src/github-webhook.ts (15.1 KB)
apps/api/src/github.test.ts (6.0 KB)
apps/api/src/github.ts (0.2 KB)
apps/api/src/handler-edge-cases.test.ts (11.8 KB)
apps/api/src/handler-shutdown.test.ts (2.8 KB)
apps/api/src/handler-validation.test.ts (11.4 KB)
apps/api/src/handlers-deep.test.ts (18.8 KB)
apps/api/src/handlers.ts (182.5 KB)
apps/api/src/hygiene.test.ts (11.3 KB)
apps/api/src/hygiene.ts (25.9 KB)
apps/api/src/idempotency-dispatch.test.ts (3.3 KB)
apps/api/src/intent.ts (2.7 KB)
apps/api/src/interpret-readiness.test.ts (1.5 KB)
apps/api/src/json-schema-validate.test.ts (5.3 KB)
apps/api/src/json-schema-validate.ts (6.7 KB)
apps/api/src/latency-histogram.test.ts (9.2 KB)
apps/api/src/launch-claims.test.ts (10.7 KB)
apps/api/src/living-architecture.test.ts (10.9 KB)
apps/api/src/living-architecture.ts (16.1 KB)
apps/api/src/llm-inference.test.ts (6.7 KB)
apps/api/src/llm-inference.ts (9.6 KB)
apps/api/src/logger.test.ts (3.7 KB)
apps/api/src/logger.ts (3.1 KB)
apps/api/src/logging.test.ts (8.5 KB)
apps/api/src/mcp-runtime.ts (8.2 KB)
apps/api/src/mcp-server.test.ts (105.4 KB)
apps/api/src/mcp-server.ts (23.6 KB)
apps/api/src/mcp-tool-impls.ts (134.5 KB)
apps/api/src/mcp-tools.ts (91.2 KB)
apps/api/src/memory-handlers.test.ts (10.8 KB)
apps/api/src/memory-handlers.ts (5.7 KB)
apps/api/src/metrics-branches.test.ts (2.7 KB)
apps/api/src/metrics.test.ts (4.3 KB)
apps/api/src/metrics.ts (6.8 KB)
apps/api/src/mpp.test.ts (12.6 KB)
apps/api/src/mpp.ts (6.4 KB)
apps/api/src/multi-tenancy.test.ts (20.0 KB)
apps/api/src/oauth-server.ts (8.8 KB)
apps/api/src/oauth.test.ts (17.0 KB)
apps/api/src/oauth.ts (10.8 KB)
apps/api/src/object-storage.test.ts (15.0 KB)
apps/api/src/object-storage.ts (14.7 KB)
apps/api/src/openapi.test.ts (15.0 KB)
apps/api/src/openapi.ts (87.1 KB)
apps/api/src/paid-client.test.ts (12.2 KB)
apps/api/src/paid-client.ts (4.5 KB)
apps/api/src/paid-handlers.test.ts (26.1 KB)
apps/api/src/paid-handlers.ts (16.4 KB)
apps/api/src/paid-integration-resilience.test.ts (2.4 KB)
apps/api/src/prepare-purchasing-preview.test.ts (1.7 KB)
apps/api/src/prepare-purchasing.test.ts (20.4 KB)
apps/api/src/production-startup.test.ts (8.9 KB)
apps/api/src/program-outputs-registry.test.ts (1.1 KB)
apps/api/src/programs-billing.test.ts (12.9 KB)
apps/api/src/quota-guardrails.test.ts (8.0 KB)
apps/api/src/quota.test.ts (4.5 KB)
apps/api/src/rate-limit-integration.test.ts (3.2 KB)
apps/api/src/rate-limiter.test.ts (14.8 KB)
apps/api/src/rate-limiter.ts (7.5 KB)
apps/api/src/readbody-gzip.test.ts (1.3 KB)
apps/api/src/request-limits.test.ts (4.1 KB)
apps/api/src/router-branches.test.ts (12.5 KB)
apps/api/src/router.test.ts (15.0 KB)
apps/api/src/router.ts (19.7 KB)
apps/api/src/search-api.test.ts (14.4 KB)
apps/api/src/security.test.ts (7.1 KB)
apps/api/src/server-lifecycle.test.ts (7.0 KB)
apps/api/src/server-routes.test.ts (5.9 KB)
apps/api/src/server.ts (19.8 KB)
apps/api/src/snapshot-auth.test.ts (15.7 KB)
apps/api/src/speech-to-text.test.ts (7.9 KB)
apps/api/src/speech-to-text.ts (17.5 KB)
apps/api/src/strategic-docs-honesty.test.ts (2.6 KB)
apps/api/src/stripe-branches.test.ts (40.5 KB)
apps/api/src/stripe.test.ts (10.2 KB)
apps/api/src/stripe.ts (22.0 KB)
apps/api/src/test-helpers.ts (1.2 KB)
apps/api/src/text-to-speech.test.ts (11.4 KB)
apps/api/src/text-to-speech.ts (17.1 KB)
apps/api/src/url-guard.test.ts (4.1 KB)
apps/api/src/url-guard.ts (6.6 KB)
apps/api/src/validation.test.ts (8.0 KB)
apps/api/src/vector-db.test.ts (8.2 KB)
apps/api/src/vector-db.ts (16.9 KB)
apps/api/src/vector-engineer.test.ts (3.4 KB)
apps/api/src/vector-engineer.ts (5.5 KB)
apps/api/src/versions.test.ts (14.3 KB)
apps/api/src/versions.ts (4.1 KB)
apps/api/src/voice.test.ts (3.1 KB)
apps/api/src/voice.ts (5.8 KB)
apps/api/src/web-research.test.ts (10.9 KB)
apps/api/src/web-research.ts (4.3 KB)
apps/api/src/web-search.test.ts (13.0 KB)
apps/api/src/web-search.ts (20.7 KB)
apps/api/src/webhook-branches.test.ts (16.4 KB)
apps/api/src/webhooks.test.ts (13.7 KB)
apps/api/src/webhooks.ts (5.5 KB)
apps/api/src/well-known-handlers.test.ts (23.8 KB)
apps/api/tsconfig.json (0.2 KB)
apps/cli/package.json (0.5 KB)
apps/cli/src/cli-auth.test.ts (7.6 KB)
apps/cli/src/cli-commands.test.ts (9.0 KB)
apps/cli/src/cli-edge-cases.test.ts (15.5 KB)
apps/cli/src/cli-pipeline.test.ts (9.3 KB)
apps/cli/src/cli.test.ts (14.4 KB)
apps/cli/src/cli.ts (10.2 KB)
apps/cli/src/credential-store.test.ts (8.4 KB)
apps/cli/src/credential-store.ts (3.2 KB)
apps/cli/src/determinism.test.ts (8.6 KB)
apps/cli/src/runner.test.ts (10.6 KB)
apps/cli/src/runner.ts (13.0 KB)
apps/cli/src/scanner.ts (4.6 KB)
apps/cli/src/writer.ts (0.9 KB)
apps/cli/tsconfig.json (0.4 KB)
apps/web/index.html (8.1 KB)
apps/web/package.json (0.5 KB)
apps/web/public/robots.txt (0.8 KB)
apps/web/src/App.tsx (30.5 KB)
apps/web/src/api.test.ts (30.9 KB)
apps/web/src/api.ts (30.0 KB)
apps/web/src/components/AuthButtons.tsx (5.1 KB)
apps/web/src/components/AxisIcons.tsx (8.9 KB)
apps/web/src/components/CommandPalette.tsx (6.6 KB)
apps/web/src/components/FilesTab.tsx (4.7 KB)
apps/web/src/components/GeneratedTab.tsx (4.1 KB)
apps/web/src/components/GraphTab.tsx (4.8 KB)
apps/web/src/components/Icon.tsx (4.4 KB)
apps/web/src/components/OverviewTab.tsx (8.8 KB)
apps/web/src/components/ProgramLauncher.tsx (7.9 KB)
apps/web/src/components/SearchTab.tsx (11.1 KB)
apps/web/src/components/SignUpModal.tsx (1.0 KB)
apps/web/src/components/StatusBar.tsx (2.4 KB)
apps/web/src/components/Toast.tsx (3.8 KB)
apps/web/src/components/ToolPage.tsx (6.4 KB)
apps/web/src/components/UpsellModal.tsx (2.8 KB)
apps/web/src/index.css (40.0 KB)
apps/web/src/main.tsx (0.2 KB)
apps/web/src/pages.test.tsx (13.0 KB)
apps/web/src/pages/AccountPage.tsx (23.1 KB)
apps/web/src/pages/AdminPage.tsx (10.7 KB)
apps/web/src/pages/DashboardPage.tsx (8.0 KB)
apps/web/src/pages/DocsPage.tsx (71.7 KB)
apps/web/src/pages/ExamplesPage.tsx (35.0 KB)
apps/web/src/pages/ForAgentsPage.tsx (7.4 KB)
apps/web/src/pages/HelpPage.tsx (43.1 KB)
apps/web/src/pages/InstallPage.tsx (9.0 KB)
apps/web/src/pages/MyAnalyticsPage.tsx (8.1 KB)
apps/web/src/pages/PaidCheckoutPage.tsx (6.7 KB)
apps/web/src/pages/PlansPage.tsx (10.3 KB)
apps/web/src/pages/ProgramsPage.tsx (15.3 KB)
apps/web/src/pages/QAPage.tsx (24.8 KB)
apps/web/src/pages/TermsPage.tsx (19.9 KB)
apps/web/src/pages/ToolsIndexPage.tsx (9.8 KB)
apps/web/src/pages/UploadPage.tsx (29.3 KB)
apps/web/src/pages/tools/WebResearchPage.tsx (8.3 KB)
apps/web/src/upload-utils-zip.test.ts (9.0 KB)
apps/web/src/upload-utils.test.ts (5.8 KB)
apps/web/src/upload-utils.ts (4.1 KB)
apps/web/src/version.ts (0.1 KB)
apps/web/src/vite-env.d.ts (0.2 KB)
apps/web/tsconfig.json (0.5 KB)
apps/web/vite.config.ts (0.2 KB)
artifacts/MEMORY.yaml (3.1 KB)
artifacts/begin.yaml (1.8 KB)
artifacts/continuation.yaml (2.4 KB)
artifacts/schemas/output-contract.schema.json (1.8 KB)
automated remedial action.yaml (7.5 KB)
axis_all_tools.yaml (23.6 KB)
axis_master_blueprint.yaml (9.6 KB)
begin.yaml (17.6 KB)
brand/MEMORY.yaml (3.0 KB)
brand/begin.yaml (1.8 KB)
brand/continuation.yaml (2.4 KB)
brand/schemas/output-contract.schema.json (1.8 KB)
canvas-pack.md (9.7 KB)
canvas/MEMORY.yaml (2.8 KB)
canvas/begin.yaml (1.8 KB)
canvas/continuation.yaml (2.4 KB)
canvas/schemas/output-contract.schema.json (1.8 KB)
capability_inventory.yaml (31.7 KB)
cloudflare-pages.md (2.6 KB)
competitive-gap-matrix.yaml (31.4 KB)
coverage-full.txt (249.9 KB)
daily-maintenance-runbook.yaml (6.2 KB)
debug/MEMORY.yaml (5.5 KB)
debug/begin.yaml (3.6 KB)
debug/continuation.yaml (2.4 KB)
debug/schemas/output-contract.schema.json (1.8 KB)
docker-ci-run3.txt (24.3 KB)
docker-compose.yml (0.7 KB)
docs/AGENTIC_ASSET_STRATEGY.md (7.2 KB)
docs/FAILURE_MODES.md (5.8 KB)
docs/FAULT_INJECTION_GAUNTLET.md (7.9 KB)
docs/MCP_PAID_ACCESS_DESIGN.md (4.1 KB)
docs/MERCHANT_INTEGRATION_DOGFOODING.md (8.5 KB)
docs/agentic-asset/CONSTITUTION.md (6.0 KB)
docs/agentic-asset/EXECUTION_PLAN.md (9.0 KB)
docs/agentic-asset/README.md (2.7 KB)
docs/agentic-asset/WORK_ORDERS.yaml (57.2 KB)
docs/agentic-asset/specs/SPEC-01-delta.md (4.3 KB)
docs/agentic-asset/specs/SPEC-02-persistence-metering.md (2.9 KB)
docs/agentic-asset/specs/SPEC-03-usage-funnel.md (3.0 KB)
docs/agentic-asset/specs/SPEC-04-watchtower-digest.md (2.6 KB)
docs/agentic-asset/specs/SPEC-05-project-memory.md (9.6 KB)
docs/agentic-asset/specs/SPEC-06-kpi-events.md (4.4 KB)
docs/agentic-asset/specs/SPEC-07-memory-weave.md (6.2 KB)
docs/agentic-asset/specs/SPEC-08-review-remediation.md (8.1 KB)
docs/agentic-asset/specs/SPEC-09-fleet-report.md (9.0 KB)
docs/agentic-asset/specs/SPEC-10-tail-remediation.md (14.3 KB)
docs/agentic-asset/specs/SPEC-11-watchtower-analysis-on-push.md (5.3 KB)
docs/agentic-asset/specs/SPEC-12-launch-claims-fact-pass.md (7.7 KB)
e2e_full_human_ai_x402.mjs (52.8 KB)
e2e_round2.mjs (15.1 KB)
e2e_ui_audit.yaml (39.3 KB)
e2e_wiring_audit.mjs (46.9 KB)
e2e_wiring_audit.yaml (31.5 KB)
eslint.config.js (0.2 KB)
examples/01-paid-platform/README.md (0.9 KB)
examples/01-paid-platform/generated/AGENTS.md (1.9 KB)
examples/01-paid-platform/generated/CLAUDE.md (0.9 KB)
examples/02-axis-scalpel/README.md (0.7 KB)
examples/02-axis-scalpel/generated/AGENTS.md (1.4 KB)
examples/02-axis-scalpel/generated/CLAUDE.md (0.8 KB)
examples/03-spacey/README.md (0.7 KB)
examples/03-spacey/generated/AGENTS.md (1.4 KB)
examples/03-spacey/generated/CLAUDE.md (0.8 KB)
examples/04-slate-certification/README.md (0.7 KB)
examples/04-slate-certification/generated/AGENTS.md (1.7 KB)
examples/04-slate-certification/generated/CLAUDE.md (0.7 KB)
examples/05-ruuuun/README.md (0.8 KB)
examples/05-ruuuun/generated/AGENTS.md (1.8 KB)
examples/05-ruuuun/generated/CLAUDE.md (0.8 KB)
examples/README.json (6.0 KB)
examples/README.md (4.3 KB)
frontend/MEMORY.yaml (5.8 KB)
frontend/begin.yaml (3.6 KB)
frontend/continuation.yaml (2.4 KB)
frontend/schemas/output-contract.schema.json (1.8 KB)
generate-keys.js (0.6 KB)
generated-posts.json (2.3 KB)
generative-sketch.js (8.3 KB)
glama.json (0.1 KB)
human user audt.yaml (24.9 KB)
hygiene and memory.yaml (8.7 KB)
iliad-agentic-platform-strategy.yaml (29.4 KB)
launch-checklist.md (3.9 KB)
launch-content.md (6.1 KB)
llms.txt (0.8 KB)
ls-coverage.txt (250.3 KB)
marketing-pack.md (9.8 KB)
marketing/MEMORY.yaml (2.8 KB)
marketing/begin.yaml (1.8 KB)
marketing/continuation.yaml (2.4 KB)
marketing/schemas/output-contract.schema.json (1.8 KB)
mcp-config.json (12.9 KB)
mcp/MEMORY.yaml (2.7 KB)
mcp/README.md (1.9 KB)
mcp/begin.yaml (1.8 KB)
mcp/build-artifacts.md (1.0 KB)
mcp/continuation.yaml (2.4 KB)
mcp/core-implementation-artifacts.md (16.5 KB)
mcp/fintech-domain-schema.yaml (2.9 KB)
mcp/fintech-mcp-surface-package.md (8.6 KB)
mcp/monorepo-structure.md (3.2 KB)
mcp/package-json.package.template.json (0.6 KB)
mcp/package-json.root.template.json (0.7 KB)
mcp/project-setup.md (0.9 KB)
mcp/schemas/output-contract.schema.json (2.1 KB)
mcp/testing-documentation-polish-artifacts.md (2.0 KB)
mcp/tsconfig.package.template.json (0.7 KB)
mcp/tsconfig.root.template.json (1.1 KB)
memory generator.yaml (7.6 KB)
notebook/MEMORY.yaml (2.9 KB)
notebook/begin.yaml (1.8 KB)
notebook/continuation.yaml (2.4 KB)
notebook/schemas/output-contract.schema.json (1.8 KB)
obsidian-vault-pack.md (9.3 KB)
obsidian/MEMORY.yaml (2.8 KB)
obsidian/begin.yaml (1.8 KB)
obsidian/continuation.yaml (2.4 KB)
obsidian/schemas/output-contract.schema.json (1.8 KB)
optimization/MEMORY.yaml (3.7 KB)
optimization/begin.yaml (2.5 KB)
optimization/continuation.yaml (2.4 KB)
optimization/schemas/output-contract.schema.json (1.8 KB)
package.json (1.7 KB)
packages/context-engine/package.json (0.9 KB)
packages/context-engine/src/engine-branches.test.ts (27.5 KB)
packages/context-engine/src/engine-branches2.test.ts (7.6 KB)
packages/context-engine/src/engine-branches3.test.ts (7.5 KB)
packages/context-engine/src/engine-edge.test.ts (8.7 KB)
packages/context-engine/src/engine.test.ts (13.8 KB)
packages/context-engine/src/engine.ts (19.7 KB)
packages/context-engine/src/index.ts (0.1 KB)
packages/context-engine/src/types.ts (2.7 KB)
packages/context-engine/tsconfig.json (0.2 KB)
packages/generator-core/package.json (1.1 KB)
packages/generator-core/src/autonomy-loop.test.ts (6.1 KB)
packages/generator-core/src/autonomy-loop.ts (13.6 KB)
packages/generator-core/src/cap-utils.ts (1.6 KB)
packages/generator-core/src/counts-consistency.test.ts (1.5 KB)
packages/generator-core/src/delta-report.test.ts (9.0 KB)
packages/generator-core/src/delta-report.ts (12.3 KB)
packages/generator-core/src/determinism.test.ts (5.1 KB)
packages/generator-core/src/file-excerpt-utils.ts (7.8 KB)
packages/generator-core/src/fleet-report.test.ts (12.2 KB)
packages/generator-core/src/fleet-report.ts (8.1 KB)
packages/generator-core/src/fw-helpers.ts (0.6 KB)
packages/generator-core/src/generate-programs.test.ts (14.6 KB)
packages/generator-core/src/generate-symbol-index.test.ts (10.2 KB)
packages/generator-core/src/generate-validation.test.ts (8.7 KB)
packages/generator-core/src/generate.test.ts (68.1 KB)
packages/generator-core/src/generate.ts (21.7 KB)
packages/generator-core/src/generator-alt-profiles.test.ts (16.9 KB)
packages/generator-core/src/generator-branches.test.ts (218.4 KB)
packages/generator-core/src/generator-sourcefile-branches.test.ts (21.3 KB)
packages/generator-core/src/generator-sourcefile-branches10.test.ts (34.0 KB)
packages/generator-core/src/generator-sourcefile-branches11.test.ts (21.8 KB)
packages/generator-core/src/generator-sourcefile-branches12.test.ts (16.3 KB)
packages/generator-core/src/generator-sourcefile-branches13.test.ts (10.7 KB)
packages/generator-core/src/generator-sourcefile-branches14.test.ts (12.5 KB)
packages/generator-core/src/generator-sourcefile-branches15.test.ts (9.2 KB)
packages/generator-core/src/generator-sourcefile-branches16.test.ts (22.4 KB)
packages/generator-core/src/generator-sourcefile-branches17.test.ts (16.3 KB)
packages/generator-core/src/generator-sourcefile-branches18.test.ts (29.0 KB)
packages/generator-core/src/generator-sourcefile-branches19.test.ts (12.6 KB)
packages/generator-core/src/generator-sourcefile-branches2.test.ts (23.8 KB)
packages/generator-core/src/generator-sourcefile-branches20.test.ts (9.5 KB)
packages/generator-core/src/generator-sourcefile-branches3.test.ts (30.9 KB)
packages/generator-core/src/generator-sourcefile-branches4.test.ts (24.7 KB)
packages/generator-core/src/generator-sourcefile-branches5.test.ts (29.0 KB)
packages/generator-core/src/generator-sourcefile-branches6.test.ts (25.9 KB)
packages/generator-core/src/generator-sourcefile-branches7.test.ts (36.6 KB)
packages/generator-core/src/generator-sourcefile-branches8.test.ts (49.0 KB)
packages/generator-core/src/generator-sourcefile-branches9.test.ts (33.7 KB)
packages/generator-core/src/generators-agentic-purchasing-develop.test.ts (4.4 KB)
packages/generator-core/src/generators-agentic-purchasing-harden2.test.ts (3.5 KB)
packages/generator-core/src/generators-agentic-purchasing-injection.test.ts (5.4 KB)
packages/generator-core/src/generators-agentic-purchasing-polish.test.ts (3.4 KB)
packages/generator-core/src/generators-agentic-purchasing.test.ts (54.8 KB)
packages/generator-core/src/generators-agentic-purchasing.ts (66.2 KB)
packages/generator-core/src/generators-algorithmic-develop.test.ts (3.3 KB)
packages/generator-core/src/generators-algorithmic-harden2.test.ts (3.0 KB)
packages/generator-core/src/generators-algorithmic-injection.test.ts (5.1 KB)
packages/generator-core/src/generators-algorithmic-polish.test.ts (4.1 KB)
packages/generator-core/src/generators-algorithmic.ts (27.9 KB)
packages/generator-core/src/generators-artifacts-develop.test.ts (4.2 KB)
packages/generator-core/src/generators-artifacts-harden2.test.ts (4.3 KB)
packages/generator-core/src/generators-artifacts-injection.test.ts (9.6 KB)
packages/generator-core/src/generators-artifacts-polish.test.ts (4.0 KB)
packages/generator-core/src/generators-artifacts.ts (105.4 KB)
packages/generator-core/src/generators-brand-develop.test.ts (4.9 KB)
packages/generator-core/src/generators-brand-injection.test.ts (7.6 KB)
packages/generator-core/src/generators-brand-polish.test.ts (3.2 KB)
packages/generator-core/src/generators-brand.ts (38.8 KB)
packages/generator-core/src/generators-canvas-develop.test.ts (3.6 KB)
packages/generator-core/src/generators-canvas-harden2.test.ts (3.1 KB)
packages/generator-core/src/generators-canvas-injection.test.ts (5.2 KB)
packages/generator-core/src/generators-canvas-polish.test.ts (2.6 KB)
packages/generator-core/src/generators-canvas.ts (29.3 KB)
packages/generator-core/src/generators-closer-develop.test.ts (6.7 KB)
packages/generator-core/src/generators-closer-harden2.test.ts (4.0 KB)
packages/generator-core/src/generators-closer-injection.test.ts (8.8 KB)
packages/generator-core/src/generators-closer-polish.test.ts (5.2 KB)
packages/generator-core/src/generators-closer.test.ts (7.7 KB)
packages/generator-core/src/generators-closer.ts (54.7 KB)
packages/generator-core/src/generators-debug-failure-surface.test.ts (7.7 KB)
packages/generator-core/src/generators-debug-injection.test.ts (7.7 KB)
packages/generator-core/src/generators-debug-polish.test.ts (3.8 KB)
packages/generator-core/src/generators-debug.ts (56.6 KB)
packages/generator-core/src/generators-decontamination.test.ts (4.5 KB)
packages/generator-core/src/generators-deploy-develop.test.ts (5.7 KB)
packages/generator-core/src/generators-deploy-harden2.test.ts (4.5 KB)
packages/generator-core/src/generators-deploy-injection.test.ts (8.7 KB)
packages/generator-core/src/generators-deploy-polish.test.ts (4.3 KB)
packages/generator-core/src/generators-deploy.ts (41.2 KB)
packages/generator-core/src/generators-frontend-develop.test.ts (4.5 KB)
packages/generator-core/src/generators-frontend-injection.test.ts (8.8 KB)
packages/generator-core/src/generators-frontend-polish.test.ts (3.8 KB)
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
... (467 more lines)
```

### `apps/web/src/App.tsx`

```tsx
import { useState, useCallback, useEffect, useRef, useMemo, Component, type ReactNode } from "react";
import { UploadPage } from "./pages/UploadPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { PlansPage } from "./pages/PlansPage.tsx";
import { AccountPage } from "./pages/AccountPage.tsx";
import { DocsPage } from "./pages/DocsPage.tsx";
import { HelpPage } from "./pages/HelpPage.tsx";
import { QAPage } from "./pages/QAPage.tsx";
import { ProgramsPage } from "./pages/ProgramsPage.tsx";
import { TermsPage } from "./pages/TermsPage.tsx";
import { ForAgentsPage } from "./pages/ForAgentsPage.tsx";
import { ExamplesPage } from "./pages/ExamplesPage.tsx";
import { InstallPage } from "./pages/InstallPage.tsx";
import { PaidCheckoutPage } from "./pages/PaidCheckoutPage.tsx";
import { AdminPage } from "./pages/AdminPage.tsx";
import { MyAnalyticsPage } from "./pages/MyAnalyticsPage.tsx";
import { ToolsIndexPage } from "./pages/ToolsIndexPage.tsx";
import { WebResearchPage } from "./pages/tools/WebResearchPage.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import { Icon } from "./components/Icon.tsx";
import { getAdminStats, migrateLegacyKey, logoutSession, type SnapshotResponse } from "./api.ts";
import { APP_VERSION } from "./version.ts";

// ─── Error Boundary ─────────────────────────────────────────────
// React requires a class for getDerivedStateFromError; this thin wrapper
// keeps the rest of the codebase class-free per .cursorrules.

... (549 more lines)
```

### `apps/web/src/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

```

### `packages/context-engine/src/index.ts`

```typescript
export type { ContextMap, RepoProfile } from "./types.js";
export { buildContextMap, buildRepoProfile } from "./engine.js";

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
    "test": "echo skipped â€” run vitest from root"
  },
  "dependencies": {
    "@axis/context-engine": "workspace:*",
    "@axis/generator-core": "workspace:*",
    "@axis/mpp": "workspace:*",
    "@axis/paid-client": "workspace:*",
    "@axis/repo-parser": "workspace:*",
    "@axis/snapshots": "workspace:*",
    "@jmondi/oauth2-server": "^4.2.2",
    "dockerode": "^4.0.12",
    "ffmpeg-static": "^5.3.0",
    "jsonwebtoken": "^9.0.3",
    "mammoth": "^1.12.0",
    "mppx": "^0.5.12",
    "node-llama-cpp": "^3.18.1",
... (12 more lines)
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

### `apps/cli/package.json`

```json
{
  "name": "@axis/cli",
  "version": "0.5.3",
  "private": true,
  "type": "module",
  "bin": {
    "axis": "./bin/axis.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/cli.js"
  },
  "dependencies": {
    "@axis/snapshots": "workspace:*",
    "@axis/repo-parser": "workspace:*",
    "@axis/context-engine": "workspace:*",
    "@axis/generator-core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}

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

### `package.json`

```json
{
  "name": "axis-iliad",
  "version": "0.5.3",
  "private": true,
  "type": "module",
  "description": "Axis' Iliad â€” one API call that turns any codebase into 99 deterministic AI-agent-ready artifacts (AGENTS.md, CLAUDE.md, design tokens, Visa CE 3.0 compliance kit, MCP configs, and more)",
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
... (36 more lines)
```

### `packages/context-engine/package.json`

```json
{
  "name": "@axis/context-engine",
  "version": "0.5.3",
  "type": "module",
  "description": "Context map and repo profile builders â€” transforms parsed code into structured LLM context",
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
    "test": "echo skipped â€” run vitest from root"
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
  "description": "102 generators across 18 programs â€” produces AGENTS.md, CLAUDE.md, .cursorrules, design tokens, Visa compliance artifacts, and 99 more structured AI-agent files from any codebase",
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
... (9 more lines)
```

---
*Generated by Axis Search — 1970-01-01*


---

## ⟳ Continue the loop

- **You are here:** `architecture-summary.md` — agent step 1 of 70.
- **Next:** `AGENTS.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
