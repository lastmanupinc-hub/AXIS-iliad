# Architecture Summary: axis-iliad

> monorepo

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 17 top-level directories. It defines 252 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Overview

- **Primary Language:** TypeScript
- **Project Type:** monorepo
- **Files:** 500 (132800 LOC)
- **Directories:** 65

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
| POST | `/v1/account/upgrade-prompt/dismiss` | apps/api/src/api-branches.test.ts |
| GET | `/v1/account/funnel` | apps/api/src/api-branches.test.ts |
| GET | `/v1/health` | apps/api/src/api-layer5.test.ts |
| POST | `/v1/accounts` | apps/api/src/api-layer5.test.ts |
| POST | `/v1/account/webhooks` | apps/api/src/api-layer5.test.ts |
| GET | `/v1/account/webhooks` | apps/api/src/api-layer5.test.ts |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/api-layer5.test.ts |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/api-layer5.test.ts |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/api-layer5.test.ts |
| POST | `/v1/search/query` | apps/api/src/api-layer5.test.ts |
| POST | `/v1/account/programs` | apps/api/src/api-layer5.test.ts |
| POST | `/v1/account/github-token` | apps/api/src/api-layer5.test.ts |
| POST | `/v1/account/seats` | apps/api/src/api-layer5.test.ts |
| GET | `/v1/admin/stats` | apps/api/src/api-layer5.test.ts |
| GET | `/v1/admin/accounts` | apps/api/src/api-layer5.test.ts |
| GET | `/v1/admin/activity` | apps/api/src/api-layer5.test.ts |
| GET | `/health` | apps/api/src/api.test.ts |
| POST | `/v1/snapshots` | apps/api/src/api.test.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/api.test.ts |
| GET | `/v1/projects/:project_id/context` | apps/api/src/api.test.ts |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/api.test.ts |
| GET | `/v1/projects/:project_id/generated-files/:file_path` | apps/api/src/api.test.ts |
| POST | `/v1/search/export` | apps/api/src/api.test.ts |
| POST | `/v1/skills/generate` | apps/api/src/api.test.ts |
| POST | `/v1/debug/analyze` | apps/api/src/api.test.ts |
| POST | `/v1/frontend/audit` | apps/api/src/api.test.ts |
| POST | `/v1/seo/analyze` | apps/api/src/api.test.ts |
| POST | `/v1/optimization/analyze` | apps/api/src/api.test.ts |
| POST | `/v1/theme/generate` | apps/api/src/api.test.ts |
| POST | `/v1/brand/generate` | apps/api/src/api.test.ts |
| POST | `/v1/superpowers/generate` | apps/api/src/api.test.ts |
| POST | `/v1/marketing/generate` | apps/api/src/api.test.ts |
| POST | `/v1/notebook/generate` | apps/api/src/api.test.ts |
| POST | `/v1/obsidian/analyze` | apps/api/src/api.test.ts |
| POST | `/v1/mcp/provision` | apps/api/src/api.test.ts |
| POST | `/v1/artifacts/generate` | apps/api/src/api.test.ts |
| POST | `/v1/remotion/generate` | apps/api/src/api.test.ts |
| POST | `/v1/canvas/generate` | apps/api/src/api.test.ts |
| POST | `/v1/algorithmic/generate` | apps/api/src/api.test.ts |
| POST | `/v1/agentic-purchasing/generate` | apps/api/src/api.test.ts |
| POST | `/v1/github/analyze` | apps/api/src/api.test.ts |
| POST | `/v1/accounts` | apps/api/src/b-grade-upgrade.test.ts |
| POST | `/v1/account/tier` | apps/api/src/b-grade-upgrade.test.ts |
| POST | `/v1/account/github-token` | apps/api/src/b-grade-upgrade.test.ts |
| GET | `/v1/account/github-token` | apps/api/src/b-grade-upgrade.test.ts |
| DELETE | `/v1/account/github-token/:token_id` | apps/api/src/b-grade-upgrade.test.ts |
| GET | `/v1/billing/history` | apps/api/src/b-grade-upgrade.test.ts |
| GET | `/v1/billing/proration` | apps/api/src/b-grade-upgrade.test.ts |
| GET | `/v1/health` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/snapshots` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/projects/:project_id/context` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/projects/:project_id/generated-files/:file_path*` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/search/export` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/projects/:project_id/export` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/accounts` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/account` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/keys` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/account/keys` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/keys/:key_id/revoke` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/account/usage` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/account/analytics/summary` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/tier` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/programs` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/account/credits` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/plans` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/seats` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/account/seats` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/seats/:seat_id/accept` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/seats/:seat_id/revoke` | apps/api/src/billing-flow.test.ts |
| GET | `/for-agents` | apps/api/src/budget-probe.test.ts |
| POST | `/probe-intent` | apps/api/src/budget-probe.test.ts |
| POST | `/v1/accounts` | apps/api/src/checkout-email.test.ts |
| POST | `/v1/account/seats` | apps/api/src/checkout-email.test.ts |
| GET | `/v1/account/seats` | apps/api/src/checkout-email.test.ts |
| GET | `/v1/plans` | apps/api/src/checkout-email.test.ts |
| POST | `/v1/webhooks/stripe` | apps/api/src/checkout-email.test.ts |
| POST | `/v1/checkout` | apps/api/src/checkout-email.test.ts |
| GET | `/v1/account/subscription` | apps/api/src/checkout-email.test.ts |
| POST | `/v1/account/subscription/cancel` | apps/api/src/checkout-email.test.ts |
| GET | `/v1/health` | apps/api/src/crash-resilience.test.ts |
| GET | `/v1/health` | apps/api/src/crash-resilience.test.ts |
| GET | `/v1/health` | apps/api/src/credits-api.test.ts |
| POST | `/v1/accounts` | apps/api/src/credits-api.test.ts |
| GET | `/v1/account` | apps/api/src/credits-api.test.ts |
| POST | `/v1/account/keys` | apps/api/src/credits-api.test.ts |
| POST | `/v1/account/tier` | apps/api/src/credits-api.test.ts |
| GET | `/v1/account/credits` | apps/api/src/credits-api.test.ts |
| POST | `/v1/account/credits` | apps/api/src/credits-api.test.ts |
| GET | `/v1/health` | apps/api/src/db-endpoints.test.ts |
| GET | `/v1/db/stats` | apps/api/src/db-endpoints.test.ts |
| POST | `/v1/db/maintenance` | apps/api/src/db-endpoints.test.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/deletion.test.ts |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/deletion.test.ts |
| DELETE | `/v1/projects/:project_id` | apps/api/src/deletion.test.ts |
| GET | `/v1/health` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/health/live` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/health/ready` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/metrics` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/db/stats` | apps/api/src/e2e-flows.test.ts |
| POST | `/v1/db/maintenance` | apps/api/src/e2e-flows.test.ts |
| POST | `/v1/snapshots` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/e2e-flows.test.ts |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/snapshots/:snapshot_id/versions` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/snapshots/:snapshot_id/versions/:version_number` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/snapshots/:snapshot_id/diff` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/projects/:project_id/context` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/projects/:project_id/generated-files/:file_path` | apps/api/src/e2e-flows.test.ts |
| DELETE | `/v1/projects/:project_id` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/projects/:project_id/export` | apps/api/src/e2e-flows.test.ts |
| POST | `/v1/search/export` | apps/api/src/e2e-flows.test.ts |
| POST | `/v1/accounts` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/account` | apps/api/src/e2e-flows.test.ts |
| POST | `/v1/account/keys` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/account/keys` | apps/api/src/e2e-flows.test.ts |
| POST | `/v1/account/keys/:key_id/revoke` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/account/usage` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/account/quota` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/admin/stats` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/admin/accounts` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/admin/activity` | apps/api/src/e2e-flows.test.ts |
| POST | `/v1/account/webhooks` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/account/webhooks` | apps/api/src/e2e-flows.test.ts |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/e2e-flows.test.ts |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/projects/:project_id/export` | apps/api/src/export-edge-cases.test.ts |
| GET | `/v1/projects/:project_id/export` | apps/api/src/export.test.ts |
| POST | `/v1/accounts` | apps/api/src/funnel-api.test.ts |
| GET | `/v1/account` | apps/api/src/funnel-api.test.ts |
| POST | `/v1/account/keys` | apps/api/src/funnel-api.test.ts |
| POST | `/v1/account/tier` | apps/api/src/funnel-api.test.ts |
| GET | `/v1/plans` | apps/api/src/funnel-api.test.ts |
| POST | `/v1/account/seats` | apps/api/src/funnel-api.test.ts |
| GET | `/v1/account/seats` | apps/api/src/funnel-api.test.ts |
| POST | `/v1/account/seats/:seat_id/accept` | apps/api/src/funnel-api.test.ts |
| POST | `/v1/account/seats/:seat_id/revoke` | apps/api/src/funnel-api.test.ts |
| GET | `/v1/account/upgrade-prompt` | apps/api/src/funnel-api.test.ts |
| POST | `/v1/account/upgrade-prompt/dismiss` | apps/api/src/funnel-api.test.ts |
| GET | `/v1/account/funnel` | apps/api/src/funnel-api.test.ts |
| GET | `/v1/funnel/metrics` | apps/api/src/funnel-api.test.ts |
| POST | `/v1/account/analytics/events` | apps/api/src/funnel-api.test.ts |
| POST | `/v1/github/webhook` | apps/api/src/github-webhook.test.ts |
| POST | `/v1/snapshots` | apps/api/src/handler-edge-cases.test.ts |
| GET | `/health` | apps/api/src/handler-edge-cases.test.ts |
| GET | `/v1/projects/:project_id/context` | apps/api/src/handler-edge-cases.test.ts |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/handler-edge-cases.test.ts |
| GET | `/v1/projects/:project_id/generated-files/:file_path` | apps/api/src/handler-edge-cases.test.ts |
| POST | `/v1/debug/analyze` | apps/api/src/handler-edge-cases.test.ts |
| POST | `/v1/snapshots` | apps/api/src/handler-validation.test.ts |
| POST | `/v1/debug/analyze` | apps/api/src/handler-validation.test.ts |
| POST | `/v1/snapshots` | apps/api/src/handlers-deep.test.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/handlers-deep.test.ts |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/handlers-deep.test.ts |
| DELETE | `/v1/projects/:project_id` | apps/api/src/handlers-deep.test.ts |
| GET | `/v1/projects/:project_id/generated-files/:file_path` | apps/api/src/handlers-deep.test.ts |
| POST | `/v1/search/export` | apps/api/src/handlers-deep.test.ts |
| POST | `/v1/skills/generate` | apps/api/src/handlers-deep.test.ts |
| POST | `/v1/github/analyze` | apps/api/src/handlers-deep.test.ts |
| POST | `/v1/debug/analyze` | apps/api/src/handlers-deep.test.ts |
| GET | `/v1/health/live` | apps/api/src/latency-histogram.test.ts |
| GET | `/v1/metrics` | apps/api/src/latency-histogram.test.ts |
| GET | `/v1/health` | apps/api/src/logging.test.ts |
| POST | `/v1/snapshots` | apps/api/src/logging.test.ts |
| POST | `/mcp` | apps/api/src/mcp-server.test.ts |
| GET | `/mcp` | apps/api/src/mcp-server.test.ts |
| GET | `/mcp/docs` | apps/api/src/mcp-server.test.ts |
| GET | `/v1/mcp/server.json` | apps/api/src/mcp-server.test.ts |
| POST | `/v1/accounts` | apps/api/src/mcp-server.test.ts |
| POST | `/v1/account/keys` | apps/api/src/mcp-server.test.ts |
| GET | `/v1/stats` | apps/api/src/mcp-server.test.ts |
| GET | `/ping` | apps/api/src/mcp-server.test.ts |
| GET | `/` | apps/api/src/mcp-server.test.ts |
| GET | `/v1/health` | apps/api/src/metrics.test.ts |
| GET | `/v1/health/live` | apps/api/src/metrics.test.ts |
| GET | `/v1/health/ready` | apps/api/src/metrics.test.ts |
| GET | `/v1/metrics` | apps/api/src/metrics.test.ts |
| GET | `/v1/health` | apps/api/src/multi-tenancy.test.ts |
| POST | `/v1/snapshots` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/multi-tenancy.test.ts |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/multi-tenancy.test.ts |
| DELETE | `/v1/projects/:project_id` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/projects/:project_id/context` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/projects/:project_id/generated-files/:file_path*` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/projects/:project_id/export` | apps/api/src/multi-tenancy.test.ts |
| POST | `/v1/search/index` | apps/api/src/multi-tenancy.test.ts |
| POST | `/v1/search/query` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/search/:snapshot_id/stats` | apps/api/src/multi-tenancy.test.ts |
| POST | `/v1/accounts` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/account` | apps/api/src/multi-tenancy.test.ts |
| POST | `/v1/account/keys` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/account/keys` | apps/api/src/multi-tenancy.test.ts |
| POST | `/v1/account/keys/:key_id/revoke` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/account/usage` | apps/api/src/multi-tenancy.test.ts |
| POST | `/v1/account/tier` | apps/api/src/multi-tenancy.test.ts |
| POST | `/v1/account/programs` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/auth/github` | apps/api/src/oauth.test.ts |
| GET | `/v1/auth/github/callback` | apps/api/src/oauth.test.ts |
| POST | `/v1/accounts` | apps/api/src/paid-handlers.test.ts |
| POST | `/portal/api/subscribe` | apps/api/src/paid-handlers.test.ts |
| POST | `/portal/api/paid/webhook` | apps/api/src/paid-handlers.test.ts |
| POST | `/v1/prepare-for-agentic-purchasing` | apps/api/src/prepare-purchasing.test.ts |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts |
| GET | `/v1/programs` | apps/api/src/programs-billing.test.ts |
| POST | `/v1/accounts` | apps/api/src/programs-billing.test.ts |
| GET | `/v1/account` | apps/api/src/programs-billing.test.ts |
| POST | `/v1/account/keys` | apps/api/src/programs-billing.test.ts |
| GET | `/v1/account/usage` | apps/api/src/programs-billing.test.ts |
| POST | `/v1/account/tier` | apps/api/src/programs-billing.test.ts |
| POST | `/v1/account/programs` | apps/api/src/programs-billing.test.ts |
| POST | `/mcp` | apps/api/src/quota-guardrails.test.ts |
| GET | `/v1/health` | apps/api/src/quota.test.ts |
| POST | `/v1/accounts` | apps/api/src/quota.test.ts |
| GET | `/v1/account/quota` | apps/api/src/quota.test.ts |
| GET | `/v1/health` | apps/api/src/rate-limit-integration.test.ts |
| GET | `/v1/test/fast` | apps/api/src/request-limits.test.ts |
| GET | `/v1/test/slow` | apps/api/src/request-limits.test.ts |
| GET | `/slow` | apps/api/src/router-branches.test.ts |
| GET | `/throw-string` | apps/api/src/router-branches.test.ts |
| GET | `/throw-after-end` | apps/api/src/router-branches.test.ts |
| GET | `/null-error` | apps/api/src/router-branches.test.ts |
| GET | `/array-error` | apps/api/src/router-branches.test.ts |
| GET | `/ok` | apps/api/src/router-branches.test.ts |
| GET | `/manual-500` | apps/api/src/router-branches.test.ts |
| GET | `/manual-422` | apps/api/src/router-branches.test.ts |
| GET | `/health` | apps/api/src/router-branches.test.ts |
| GET | `/up` | apps/api/src/router-branches.test.ts |
| GET | `/echo` | apps/api/src/router.test.ts |
| POST | `/echo` | apps/api/src/router.test.ts |
| GET | `/items/:id` | apps/api/src/router.test.ts |
| GET | `/users/:userId/posts/:postId` | apps/api/src/router.test.ts |
| GET | `/files/:path*` | apps/api/src/router.test.ts |
| GET | `/throws` | apps/api/src/router.test.ts |
| POST | `/status/:code` | apps/api/src/router.test.ts |
| GET | `/error-shape` | apps/api/src/router.test.ts |
| GET | `/` | apps/api/src/router.test.ts |
| GET | `/v1/health` | apps/api/src/security.test.ts |
| POST | `/v1/snapshots` | apps/api/src/security.test.ts |
| GET | `/v1/health` | apps/api/src/server-lifecycle.test.ts |
| GET | `/v1/health` | apps/api/src/server-lifecycle.test.ts |
| GET | `/` | apps/api/src/server.ts |
| GET | `/v1/health` | apps/api/src/server.ts |
| GET | `/v1/health/live` | apps/api/src/server.ts |
| GET | `/v1/health/ready` | apps/api/src/server.ts |
| GET | `/v1/metrics` | apps/api/src/server.ts |
| GET | `/performance` | apps/api/src/server.ts |
| GET | `/performance/reputation` | apps/api/src/server.ts |
| GET | `/v1/db/stats` | apps/api/src/server.ts |
| POST | `/v1/db/maintenance` | apps/api/src/server.ts |
| GET | `/v1/docs` | apps/api/src/server.ts |
| POST | `/v1/snapshots` | apps/api/src/server.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/server.ts |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/server.ts |
| GET | `/v1/snapshots/:snapshot_id/versions` | apps/api/src/server.ts |
| GET | `/v1/snapshots/:snapshot_id/versions/:version_number` | apps/api/src/server.ts |
| GET | `/v1/snapshots/:snapshot_id/diff` | apps/api/src/server.ts |
| GET | `/v1/projects/:project_id/context` | apps/api/src/server.ts |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/server.ts |
| GET | `/v1/projects/:project_id/generated-files/:file_path*` | apps/api/src/server.ts |
| DELETE | `/v1/projects/:project_id` | apps/api/src/server.ts |
| POST | `/v1/search/export` | apps/api/src/server.ts |
| POST | `/v1/skills/generate` | apps/api/src/server.ts |
| POST | `/v1/debug/analyze` | apps/api/src/server.ts |
| POST | `/v1/frontend/audit` | apps/api/src/server.ts |
| POST | `/v1/seo/analyze` | apps/api/src/server.ts |
| POST | `/v1/optimization/analyze` | apps/api/src/server.ts |
| POST | `/v1/theme/generate` | apps/api/src/server.ts |
| POST | `/v1/brand/generate` | apps/api/src/server.ts |
| POST | `/v1/superpowers/generate` | apps/api/src/server.ts |
| POST | `/v1/marketing/generate` | apps/api/src/server.ts |
| POST | `/v1/notebook/generate` | apps/api/src/server.ts |
| POST | `/v1/obsidian/analyze` | apps/api/src/server.ts |
| POST | `/v1/mcp/provision` | apps/api/src/server.ts |
| POST | `/v1/artifacts/generate` | apps/api/src/server.ts |
| POST | `/v1/remotion/generate` | apps/api/src/server.ts |
| POST | `/v1/canvas/generate` | apps/api/src/server.ts |
| POST | `/v1/algorithmic/generate` | apps/api/src/server.ts |
| POST | `/v1/agentic-purchasing/generate` | apps/api/src/server.ts |
| POST | `/v1/closer/generate` | apps/api/src/server.ts |
| POST | `/v1/prepare-for-agentic-purchasing` | apps/api/src/server.ts |
| POST | `/v1/analyze` | apps/api/src/server.ts |
| POST | `/v1/github/analyze` | apps/api/src/server.ts |
| POST | `/v1/github/webhook` | apps/api/src/server.ts |
| POST | `/v1/research/scrape` | apps/api/src/server.ts |
| POST | `/v1/research/crawl` | apps/api/src/server.ts |
| GET | `/.well-known/axis.json` | apps/api/src/server.ts |
| GET | `/.well-known/capabilities.json` | apps/api/src/server.ts |
| GET | `/.well-known/mcp.json` | apps/api/src/server.ts |
| GET | `/.well-known/security.txt` | apps/api/src/server.ts |
| GET | `/.well-known/glama.json` | apps/api/src/server.ts |
| GET | `/.well-known/agent.json` | apps/api/src/server.ts |
| GET | `/.well-known/oauth-authorization-server` | apps/api/src/server.ts |
| GET | `/mcp/.well-known/mcp.json` | apps/api/src/server.ts |
| GET | `/mcp/.well-known/agent.json` | apps/api/src/server.ts |
| GET | `/robots.txt` | apps/api/src/server.ts |
| GET | `/sitemap.xml` | apps/api/src/server.ts |
| GET | `/health` | apps/api/src/server.ts |
| GET | `/docs` | apps/api/src/server.ts |
| GET | `/pricing` | apps/api/src/server.ts |
| GET | `/openapi.json` | apps/api/src/server.ts |
| GET | `/llms.txt` | apps/api/src/server.ts |
| GET | `/.well-known/skills/index.json` | apps/api/src/server.ts |
| GET | `/v1/docs.md` | apps/api/src/server.ts |
| GET | `/for-agents` | apps/api/src/server.ts |
| POST | `/probe-intent` | apps/api/src/server.ts |
| GET | `/v1/install` | apps/api/src/server.ts |
| GET | `/v1/install/:platform` | apps/api/src/server.ts |
| POST | `/v1/search/index` | apps/api/src/server.ts |
| POST | `/v1/search/query` | apps/api/src/server.ts |
| GET | `/v1/search/:snapshot_id/stats` | apps/api/src/server.ts |
| GET | `/v1/search/:snapshot_id/symbols` | apps/api/src/server.ts |
| GET | `/v1/projects/:project_id/export` | apps/api/src/server.ts |
| GET | `/v1/programs` | apps/api/src/server.ts |
| POST | `/mcp` | apps/api/src/server.ts |
| POST | `/mcp/` | apps/api/src/server.ts |
| POST | `/v1/mcp` | apps/api/src/server.ts |
| POST | `/v1/mcp/` | apps/api/src/server.ts |
| GET | `/mcp` | apps/api/src/server.ts |
| GET | `/mcp/` | apps/api/src/server.ts |
| GET | `/v1/mcp` | apps/api/src/server.ts |
| GET | `/v1/mcp/` | apps/api/src/server.ts |
| GET | `/mcp/docs` | apps/api/src/server.ts |
| GET | `/favicon.ico` | apps/api/src/server.ts |
| GET | `/mcp/sse` | apps/api/src/server.ts |
| POST | `/mcp/sse` | apps/api/src/server.ts |
| GET | `/mcp/mcp/*` | apps/api/src/server.ts |
| POST | `/mcp/mcp/*` | apps/api/src/server.ts |
| DELETE | `/mcp/mcp/*` | apps/api/src/server.ts |
| GET | `/v1/stats` | apps/api/src/server.ts |
| GET | `/v1/mcp/server.json` | apps/api/src/server.ts |
| GET | `/v1/mcp/tools` | apps/api/src/server.ts |
| POST | `/v1/accounts` | apps/api/src/server.ts |
| POST | `/accounts` | apps/api/src/server.ts |
| GET | `/v1/accounts` | apps/api/src/server.ts |
| GET | `/v1/accounts/` | apps/api/src/server.ts |
| GET | `/accounts` | apps/api/src/server.ts |
| GET | `/accounts/` | apps/api/src/server.ts |
| GET | `/v1/account` | apps/api/src/server.ts |
| POST | `/v1/account/keys` | apps/api/src/server.ts |
| GET | `/v1/account/keys` | apps/api/src/server.ts |
| POST | `/v1/account/keys/:key_id/revoke` | apps/api/src/server.ts |
| GET | `/v1/account/usage` | apps/api/src/server.ts |
| GET | `/v1/account/analytics/summary` | apps/api/src/server.ts |
| GET | `/v1/account/quota` | apps/api/src/server.ts |
| POST | `/v1/account/tier` | apps/api/src/server.ts |
| POST | `/v1/account/programs` | apps/api/src/server.ts |
| POST | `/v1/account/github-token` | apps/api/src/server.ts |
| GET | `/v1/account/github-token` | apps/api/src/server.ts |
| DELETE | `/v1/account/github-token/:token_id` | apps/api/src/server.ts |
| GET | `/v1/billing/history` | apps/api/src/server.ts |
| GET | `/v1/billing/proration` | apps/api/src/server.ts |
| GET | `/v1/account/credits` | apps/api/src/server.ts |
| POST | `/v1/account/credits` | apps/api/src/server.ts |
| GET | `/v1/plans` | apps/api/src/server.ts |
| POST | `/v1/account/seats` | apps/api/src/server.ts |
| GET | `/v1/account/seats` | apps/api/src/server.ts |
| POST | `/v1/account/seats/:seat_id/accept` | apps/api/src/server.ts |
| POST | `/v1/account/seats/:seat_id/revoke` | apps/api/src/server.ts |
| GET | `/v1/account/upgrade-prompt` | apps/api/src/server.ts |
| POST | `/v1/account/upgrade-prompt/dismiss` | apps/api/src/server.ts |
| GET | `/v1/account/funnel` | apps/api/src/server.ts |
| GET | `/v1/funnel/metrics` | apps/api/src/server.ts |
| POST | `/v1/account/analytics/events` | apps/api/src/server.ts |
| GET | `/v1/admin/stats` | apps/api/src/server.ts |
| GET | `/v1/admin/accounts` | apps/api/src/server.ts |
| GET | `/v1/admin/activity` | apps/api/src/server.ts |
| GET | `/v1/auth/github` | apps/api/src/server.ts |
| GET | `/v1/auth/github/callback` | apps/api/src/server.ts |
| GET | `/oauth/authorize` | apps/api/src/server.ts |
| POST | `/oauth/token` | apps/api/src/server.ts |
| GET | `/oauth/jwks` | apps/api/src/server.ts |
| POST | `/oauth/introspect` | apps/api/src/server.ts |
| POST | `/v1/account/webhooks` | apps/api/src/server.ts |
| GET | `/v1/account/webhooks` | apps/api/src/server.ts |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/server.ts |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/server.ts |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/server.ts |
| POST | `/v1/webhooks/stripe` | apps/api/src/server.ts |
| POST | `/v1/checkout` | apps/api/src/server.ts |
| GET | `/v1/account/subscription` | apps/api/src/server.ts |
| POST | `/v1/account/subscription/cancel` | apps/api/src/server.ts |
| POST | `/portal/api/subscribe` | apps/api/src/server.ts |
| POST | `/portal/api/paid/webhook` | apps/api/src/server.ts |
| POST | `/v1/snapshots` | apps/api/src/snapshot-auth.test.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/snapshot-auth.test.ts |
| POST | `/v1/accounts` | apps/api/src/snapshot-auth.test.ts |
| POST | `/v1/account/tier` | apps/api/src/snapshot-auth.test.ts |
| POST | `/v1/accounts` | apps/api/src/stripe-branches.test.ts |
| POST | `/v1/webhooks/stripe` | apps/api/src/stripe-branches.test.ts |
| POST | `/v1/checkout` | apps/api/src/stripe-branches.test.ts |
| GET | `/v1/account/subscription` | apps/api/src/stripe-branches.test.ts |
| POST | `/v1/account/subscription/cancel` | apps/api/src/stripe-branches.test.ts |
| POST | `/v1/accounts` | apps/api/src/stripe.test.ts |
| POST | `/v1/webhooks/stripe` | apps/api/src/stripe.test.ts |
| GET | `/v1/account/subscription` | apps/api/src/stripe.test.ts |
| POST | `/v1/snapshots` | apps/api/src/validation.test.ts |
| POST | `/v1/search/export` | apps/api/src/validation.test.ts |
| POST | `/v1/skills/generate` | apps/api/src/validation.test.ts |
| POST | `/v1/debug/analyze` | apps/api/src/validation.test.ts |
| POST | `/v1/accounts` | apps/api/src/validation.test.ts |
| POST | `/v1/account/tier` | apps/api/src/validation.test.ts |
| POST | `/v1/account/programs` | apps/api/src/validation.test.ts |
| POST | `/v1/account/seats` | apps/api/src/validation.test.ts |
| GET | `/v1/health` | apps/api/src/versions.test.ts |
| GET | `/v1/snapshots/:snapshot_id/versions` | apps/api/src/versions.test.ts |
| GET | `/v1/snapshots/:snapshot_id/versions/:version_number` | apps/api/src/versions.test.ts |
| GET | `/v1/snapshots/:snapshot_id/diff` | apps/api/src/versions.test.ts |
| POST | `/v1/account/webhooks` | apps/api/src/webhook-branches.test.ts |
| GET | `/v1/account/webhooks` | apps/api/src/webhook-branches.test.ts |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/webhook-branches.test.ts |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/webhook-branches.test.ts |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/webhook-branches.test.ts |
| GET | `/v1/health` | apps/api/src/webhooks.test.ts |
| POST | `/v1/accounts` | apps/api/src/webhooks.test.ts |
| POST | `/v1/account/webhooks` | apps/api/src/webhooks.test.ts |
| GET | `/v1/account/webhooks` | apps/api/src/webhooks.test.ts |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/webhooks.test.ts |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/webhooks.test.ts |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/webhooks.test.ts |
| GET | `/.well-known/agent.json` | apps/api/src/well-known-handlers.test.ts |
| GET | `/.well-known/glama.json` | apps/api/src/well-known-handlers.test.ts |
| GET | `/.well-known/security.txt` | apps/api/src/well-known-handlers.test.ts |
| GET | `/.well-known/capabilities.json` | apps/api/src/well-known-handlers.test.ts |
| GET | `/robots.txt` | apps/api/src/well-known-handlers.test.ts |
| GET | `/sitemap.xml` | apps/api/src/well-known-handlers.test.ts |
| GET | `/health` | apps/api/src/well-known-handlers.test.ts |
| GET | `/docs` | apps/api/src/well-known-handlers.test.ts |
| GET | `/openapi.json` | apps/api/src/well-known-handlers.test.ts |
| GET | `/performance` | apps/api/src/well-known-handlers.test.ts |
| GET | `/performance/reputation` | apps/api/src/well-known-handlers.test.ts |
| GET | `/health` | e2e_ui_audit.yaml |
| GET | `/v1/health` | e2e_ui_audit.yaml |
| GET | `/api/health` | packages/context-engine/src/engine-branches.test.ts |
| POST | `/api/users` | packages/context-engine/src/engine-branches.test.ts |
| GET | `/api/users` | packages/context-engine/src/engine-edge.test.ts |
| POST | `/api/users` | packages/context-engine/src/engine-edge.test.ts |
| DELETE | `/api/users/:id` | packages/context-engine/src/engine-edge.test.ts |
| GET | `/api/health` | packages/generator-core/src/generator-branches.test.ts |
| GET | `/api/users` | packages/generator-core/src/generator-branches.test.ts |
| POST | `/api/users` | packages/generator-core/src/generator-branches.test.ts |
| GET | `/` | packages/generator-core/src/generator-branches.test.ts |
| GET | `/health` | packages/generator-core/src/generator-sourcefile-branches.test.ts |
| GET | `/api/health` | packages/generator-core/src/generator-sourcefile-branches6.test.ts |
| POST | `/webhook` | packages/generator-core/src/generators-agentic-purchasing.test.ts |
| POST | `/v1/my-tool` | packages/mpp/README.md |
| POST | `/v1/my-tool` | packages/mpp/README.md |
| POST | `/v1/my-tool` | packages/mpp/README.md |
| GET | `/users/:id` | packages/repo-parser/src/perf.bench.ts |
| POST | `/users` | packages/repo-parser/src/perf.bench.ts |

## Directory Layout

- `apps/` — monorepo_apps (155 files)
- `packages/` — monorepo_packages (144 files)
- `examples/` — project_directory (17 files)
- `mcp/` — project_directory (16 files)
- `payment-processing-output/` — project_directory (14 files)
- `packaging/` — project_directory (7 files)
- `.github/` — project_directory (5 files)
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
| apps/web/src/App.tsx | 1 | 21 | 100% |
| apps/web/src/api.ts | 19 | 0 | 95% |
| apps/web/src/pages.test.tsx | 0 | 17 | 85% |
| apps/web/src/pages/DashboardPage.tsx | 1 | 10 | 55% |
| apps/web/src/components/Toast.tsx | 4 | 0 | 20% |
| apps/web/src/components/AxisIcons.tsx | 4 | 0 | 20% |
| apps/web/src/upload-utils.ts | 3 | 0 | 15% |

## Domain Models

Detected 252 domain models:

| Model | Kind | Fields | Source |
|-------|------|--------|--------|
| `AuthContext` | interface | 3 | apps/api/src/billing.ts |
| `EnvSpec` | interface | 5 | apps/api/src/env.ts |
| `ValidationError` | interface | 2 | apps/api/src/env.ts |
| `ValidationResult` | interface | 3 | apps/api/src/env.ts |
| `ZipEntry` | interface | 4 | apps/api/src/export.ts |
| `PullRequestPayload` | interface | 5 | apps/api/src/github-webhook.ts |
| `PushPayload` | interface | 7 | apps/api/src/github-webhook.ts |
| `SnapshotTarget` | interface | 5 | apps/api/src/github-webhook.ts |
| `FirecrawlCrawlRequest` | interface | 5 | apps/api/src/handlers.ts |
| `FirecrawlCrawlResponse` | interface | 4 | apps/api/src/handlers.ts |
| `FirecrawlScrapeRequest` | interface | 6 | apps/api/src/handlers.ts |
| `FirecrawlScrapeResponse` | interface | 5 | apps/api/src/handlers.ts |
| `IntentCapture` | interface | 5 | apps/api/src/mcp-server.ts |
| `JsonRpcRequest` | interface | 4 | apps/api/src/mcp-server.ts |
| `McpCallCounters` | interface | 5 | apps/api/src/mcp-server.ts |
| `PlannedCapability` | interface | 7 | apps/api/src/mcp-server.ts |
| `RpcError` | interface | 5 | apps/api/src/mcp-server.ts |
| `RpcSuccess` | interface | 3 | apps/api/src/mcp-server.ts |
| `HistogramEntry` | interface | 3 | apps/api/src/metrics.ts |
| `CacheKey` | type_alias | 2 | apps/api/src/mpp.ts |
| `OAuthClientRow` | interface | 3 | apps/api/src/oauth-server-simple.ts |
| `PresignOptions` | interface | 5 | apps/api/src/object-storage.ts |
| `PresignResult` | interface | 5 | apps/api/src/object-storage.ts |
| `R2Config` | interface | 4 | apps/api/src/object-storage.ts |
| `OpenApiSpec` | interface | 6 | apps/api/src/openapi.ts |
| *… 227 more* | | | |

> **High-complexity models** (8+ fields): `ContextMap`, `FunnelMetrics`, `MyAnalyticsSummary`, `SnapshotResponse`, `SubscriptionInfo`, `UpgradePrompt`, `ToolPageProps`, `ProgramDoc`, `ToolCatalogEntry`, `ContextMap`, `RepoProfile`, `CommerceSignals`, `ResellCapability`, `ProjectSignals`, `ParseResult`, `UsageRecord`, `EmailDelivery`, `FunnelMetrics`, `Seat`, `UpgradePrompt`, `GitHubToken`, `ReferralCredits`, `StripeSubscription`, `TierChange`, `SnapshotManifest`, `SnapshotRecord`, `VersionDiff`, `Webhook`, `WebhookDelivery`, `WebhookRow` — consider splitting if they grow further.

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
.github/app-manifest.json (0.9 KB)
.github/workflows/ci.yml (4.7 KB)
.github/workflows/compliance-check.yml (0.7 KB)
.github/workflows/release.yml (0.6 KB)
.gitignore (0.5 KB)
.prettierrc.json (0.1 KB)
.tmp-vitest.json (68.7 KB)
ab-test-plan.md (2.8 KB)
agent-purchasing-playbook.md (16.9 KB)
AGENTS.md (14.4 KB)
algorithmic-pack.json (7.9 KB)
algorithmic/begin.yaml (1.8 KB)
algorithmic/continuation.yaml (2.4 KB)
algorithmic/MEMORY.yaml (2.9 KB)
algorithmic/schemas/output-contract.schema.json (1.8 KB)
apps/api/check-table.js (0.3 KB)
apps/api/gen-keys.js (0.3 KB)
apps/api/keys.env (4.3 KB)
apps/api/mcp-server.json (10.4 KB)
apps/api/package.json (0.7 KB)
apps/api/src/admin.test.ts (10.0 KB)
apps/api/src/admin.ts (2.8 KB)
apps/api/src/agent-discovery.test.ts (21.0 KB)
apps/api/src/analyze-repo-success.test.ts (5.0 KB)
apps/api/src/analyze.test.ts (19.1 KB)
apps/api/src/api-branches.test.ts (22.0 KB)
apps/api/src/api-layer5.test.ts (10.6 KB)
apps/api/src/api.test.ts (20.7 KB)
apps/api/src/b-grade-upgrade.test.ts (8.6 KB)
apps/api/src/billing-flow.test.ts (26.8 KB)
apps/api/src/billing.ts (23.8 KB)
apps/api/src/budget-probe.test.ts (34.3 KB)
apps/api/src/checkout-email.test.ts (12.6 KB)
apps/api/src/counts-consistency.test.ts (0.9 KB)
apps/api/src/counts.ts (0.7 KB)
apps/api/src/crash-resilience.test.ts (6.3 KB)
apps/api/src/credits-api.test.ts (10.9 KB)
apps/api/src/db-endpoints.test.ts (4.1 KB)
apps/api/src/deletion.test.ts (5.6 KB)
apps/api/src/deployment.test.ts (6.9 KB)
apps/api/src/e2e-flows.test.ts (22.8 KB)
apps/api/src/e2e-smoke.test.ts (4.5 KB)
apps/api/src/env.test.ts (8.3 KB)
apps/api/src/env.ts (8.8 KB)
apps/api/src/export-edge-cases.test.ts (9.9 KB)
apps/api/src/export.test.ts (13.4 KB)
apps/api/src/export.ts (6.7 KB)
apps/api/src/funnel-api.test.ts (29.7 KB)
apps/api/src/funnel.ts (11.0 KB)
apps/api/src/github-webhook.test.ts (9.7 KB)
apps/api/src/github-webhook.ts (10.5 KB)
apps/api/src/github.test.ts (6.0 KB)
apps/api/src/github.ts (0.2 KB)
apps/api/src/handler-edge-cases.test.ts (11.8 KB)
apps/api/src/handler-shutdown.test.ts (2.8 KB)
apps/api/src/handler-validation.test.ts (11.4 KB)
apps/api/src/handlers-deep.test.ts (18.7 KB)
apps/api/src/handlers.ts (176.0 KB)
apps/api/src/latency-histogram.test.ts (9.1 KB)
apps/api/src/logger.test.ts (3.7 KB)
apps/api/src/logger.ts (3.1 KB)
apps/api/src/logging.test.ts (8.5 KB)
apps/api/src/mcp-server.test.ts (82.2 KB)
apps/api/src/mcp-server.ts (140.8 KB)
apps/api/src/metrics-branches.test.ts (2.5 KB)
apps/api/src/metrics.test.ts (4.3 KB)
apps/api/src/metrics.ts (6.5 KB)
apps/api/src/mpp.test.ts (8.5 KB)
apps/api/src/mpp.ts (6.4 KB)
apps/api/src/multi-tenancy.test.ts (20.0 KB)
apps/api/src/oauth-server-simple.ts (5.8 KB)
apps/api/src/oauth-server.ts (8.1 KB)
apps/api/src/oauth.test.ts (8.0 KB)
apps/api/src/oauth.ts (3.4 KB)
apps/api/src/object-storage.test.ts (7.3 KB)
apps/api/src/object-storage.ts (8.1 KB)
apps/api/src/openapi.test.ts (15.3 KB)
apps/api/src/openapi.ts (75.9 KB)
apps/api/src/paid-client.test.ts (6.8 KB)
apps/api/src/paid-client.ts (5.6 KB)
apps/api/src/paid-handlers.test.ts (8.3 KB)
apps/api/src/paid-handlers.ts (6.9 KB)
apps/api/src/prepare-purchasing.test.ts (19.4 KB)
apps/api/src/production-startup.test.ts (8.5 KB)
apps/api/src/programs-billing.test.ts (12.8 KB)
apps/api/src/quota-guardrails.test.ts (7.4 KB)
apps/api/src/quota.test.ts (4.5 KB)
apps/api/src/rate-limit-integration.test.ts (3.2 KB)
apps/api/src/rate-limiter.test.ts (13.8 KB)
apps/api/src/rate-limiter.ts (6.5 KB)
apps/api/src/request-limits.test.ts (3.9 KB)
apps/api/src/router-branches.test.ts (12.5 KB)
apps/api/src/router.test.ts (15.0 KB)
apps/api/src/router.ts (17.0 KB)
apps/api/src/search-api.test.ts (13.8 KB)
apps/api/src/security.test.ts (7.1 KB)
apps/api/src/server-lifecycle.test.ts (7.0 KB)
apps/api/src/server-routes.test.ts (5.9 KB)
apps/api/src/server.ts (17.6 KB)
apps/api/src/snapshot-auth.test.ts (13.4 KB)
apps/api/src/stripe-branches.test.ts (39.8 KB)
apps/api/src/stripe.test.ts (10.1 KB)
apps/api/src/stripe.ts (21.1 KB)
apps/api/src/validation.test.ts (8.1 KB)
apps/api/src/versions.test.ts (8.1 KB)
apps/api/src/versions.ts (2.5 KB)
apps/api/src/webhook-branches.test.ts (16.3 KB)
apps/api/src/webhooks.test.ts (13.6 KB)
apps/api/src/webhooks.ts (5.4 KB)
apps/api/src/well-known-handlers.test.ts (19.2 KB)
apps/api/tsconfig.json (0.2 KB)
apps/cli/package.json (0.5 KB)
apps/cli/src/cli-auth.test.ts (7.6 KB)
apps/cli/src/cli-commands.test.ts (8.7 KB)
apps/cli/src/cli-edge-cases.test.ts (14.4 KB)
apps/cli/src/cli-pipeline.test.ts (9.3 KB)
apps/cli/src/cli.test.ts (13.9 KB)
apps/cli/src/cli.ts (9.9 KB)
apps/cli/src/credential-store.test.ts (8.4 KB)
apps/cli/src/credential-store.ts (3.2 KB)
apps/cli/src/determinism.test.ts (6.9 KB)
apps/cli/src/runner.test.ts (6.5 KB)
apps/cli/src/runner.ts (11.2 KB)
apps/cli/src/scanner.ts (4.3 KB)
apps/cli/src/writer.ts (0.9 KB)
apps/cli/tsconfig.json (0.4 KB)
apps/web/index.html (8.2 KB)
apps/web/package.json (0.5 KB)
apps/web/public/robots.txt (0.8 KB)
apps/web/src/api.test.ts (24.1 KB)
apps/web/src/api.ts (23.5 KB)
apps/web/src/App.tsx (22.1 KB)
apps/web/src/components/AxisIcons.tsx (8.9 KB)
apps/web/src/components/CommandPalette.tsx (6.6 KB)
apps/web/src/components/FilesTab.tsx (4.7 KB)
apps/web/src/components/GeneratedTab.tsx (4.1 KB)
apps/web/src/components/GraphTab.tsx (4.8 KB)
apps/web/src/components/OverviewTab.tsx (8.8 KB)
apps/web/src/components/ProgramLauncher.tsx (7.4 KB)
apps/web/src/components/SearchTab.tsx (11.1 KB)
apps/web/src/components/SignUpModal.tsx (3.9 KB)
apps/web/src/components/StatusBar.tsx (2.3 KB)
apps/web/src/components/Toast.tsx (3.8 KB)
apps/web/src/components/ToolPage.tsx (6.2 KB)
apps/web/src/components/UpsellModal.tsx (5.2 KB)
apps/web/src/index.css (18.5 KB)
apps/web/src/main.tsx (0.2 KB)
apps/web/src/pages.test.tsx (5.6 KB)
apps/web/src/pages/AccountPage.tsx (24.1 KB)
apps/web/src/pages/AdminPage.tsx (6.1 KB)
apps/web/src/pages/DashboardPage.tsx (8.2 KB)
apps/web/src/pages/DocsPage.tsx (71.7 KB)
apps/web/src/pages/ExamplesPage.tsx (24.1 KB)
apps/web/src/pages/ForAgentsPage.tsx (5.4 KB)
apps/web/src/pages/HelpPage.tsx (42.9 KB)
apps/web/src/pages/InstallPage.tsx (8.6 KB)
apps/web/src/pages/MyAnalyticsPage.tsx (8.3 KB)
apps/web/src/pages/PlansPage.tsx (10.0 KB)
apps/web/src/pages/ProgramsPage.tsx (14.9 KB)
apps/web/src/pages/QAPage.tsx (24.5 KB)
apps/web/src/pages/TermsPage.tsx (20.3 KB)
apps/web/src/pages/tools/WebResearchPage.tsx (8.1 KB)
apps/web/src/pages/ToolsIndexPage.tsx (9.5 KB)
apps/web/src/pages/UploadPage.tsx (29.3 KB)
apps/web/src/upload-utils-zip.test.ts (9.0 KB)
apps/web/src/upload-utils.test.ts (5.8 KB)
apps/web/src/upload-utils.ts (4.1 KB)
apps/web/src/vite-env.d.ts (0.2 KB)
apps/web/tsconfig.json (0.5 KB)
apps/web/vite.config.ts (0.2 KB)
architecture-summary.md (80.1 KB)
artifact-spec.md (8.8 KB)
artifacts/begin.yaml (1.8 KB)
artifacts/continuation.yaml (2.4 KB)
artifacts/MEMORY.yaml (3.1 KB)
artifacts/schemas/output-contract.schema.json (1.8 KB)
asset-checklist.md (1.3 KB)
asset-guidelines.md (1.7 KB)
automated remedial action.yaml (7.5 KB)
automation-pipeline.yaml (3.1 KB)
axis_all_tools.yaml (23.6 KB)
AXIS_Board_Pitch.md (30.7 KB)
AXIS_DEMO_REPORT.md (12.3 KB)
axis_master_blueprint.yaml (9.6 KB)
axis-analyze-results.json (1.1 KB)
begin.yaml (17.6 KB)
brand-board.md (5.1 KB)
brand-guidelines.md (3.0 KB)
brand/begin.yaml (1.8 KB)
brand/continuation.yaml (2.4 KB)
brand/MEMORY.yaml (3.0 KB)
brand/schemas/output-contract.schema.json (1.8 KB)
campaign-brief.md (2.3 KB)
canvas-pack.md (9.7 KB)
canvas-spec.json (3.8 KB)
canvas/begin.yaml (1.8 KB)
canvas/continuation.yaml (2.4 KB)
canvas/MEMORY.yaml (2.8 KB)
canvas/schemas/output-contract.schema.json (1.8 KB)
capability_inventory.yaml (31.7 KB)
capability-registry.json (2.5 KB)
CHANGELOG.md (7.8 KB)
channel-rulebook.md (3.6 KB)
checkout-flow.md (10.5 KB)
citation-index.json (6.7 KB)
CLAUDE.md (10.0 KB)
cloudflare-pages.md (1.5 KB)
collection-map.md (2.4 KB)
commerce-registry.json (6.3 KB)
competitive-gap-matrix.yaml (31.4 KB)
component-guidelines.md (3.3 KB)
component-library.json (7.9 KB)
component-theme-map.json (9.5 KB)
connector-map.yaml (6.6 KB)
content-audit.md (3.8 KB)
content-constraints.md (2.9 KB)
CONTRIBUTING.md (6.4 KB)
cost-estimate.json (5.7 KB)
cov.txt (210.1 KB)
cov2.txt (212.0 KB)
cov3.txt (9.6 KB)
cov5.txt (218.4 KB)
cov6.txt (218.4 KB)
cov7.txt (219.0 KB)
cov8.txt (219.5 KB)
coverage-full.txt (249.9 KB)
cro-playbook.md (36.5 KB)
daily-maintenance-runbook.yaml (6.2 KB)
dark-mode-tokens.json (3.2 KB)
dashboard-widget.tsx (3.7 KB)
debug/begin.yaml (3.6 KB)
debug/continuation.yaml (2.4 KB)
debug/MEMORY.yaml (5.5 KB)
debug/schemas/output-contract.schema.json (1.8 KB)
dependency-hotspots.md (8.1 KB)
DISTRIBUTABLE.md (0.6 KB)
docker-ci-run3.txt (24.3 KB)
docker-compose.yml (0.5 KB)
Dockerfile (0.9 KB)
e2e_full_human_ai_x402.mjs (52.8 KB)
e2e_round2.mjs (15.1 KB)
e2e_ui_audit.yaml (39.3 KB)
e2e_wiring_audit.mjs (46.9 KB)
e2e_wiring_audit.yaml (31.5 KB)
embed-snippet.ts (2.2 KB)
eslint.config.js (0.2 KB)
examples/01-paid-platform/generated/AGENTS.md (1.9 KB)
examples/01-paid-platform/generated/CLAUDE.md (0.9 KB)
examples/01-paid-platform/README.md (0.9 KB)
examples/02-axis-scalpel/generated/AGENTS.md (1.4 KB)
examples/02-axis-scalpel/generated/CLAUDE.md (0.8 KB)
examples/02-axis-scalpel/README.md (0.7 KB)
examples/03-spacey/generated/AGENTS.md (1.4 KB)
examples/03-spacey/generated/CLAUDE.md (0.8 KB)
examples/03-spacey/README.md (0.7 KB)
examples/04-slate-certification/generated/AGENTS.md (1.7 KB)
examples/04-slate-certification/generated/CLAUDE.md (0.7 KB)
examples/04-slate-certification/README.md (0.7 KB)
examples/05-ruuuun/generated/AGENTS.md (1.8 KB)
examples/05-ruuuun/generated/CLAUDE.md (0.8 KB)
examples/05-ruuuun/README.md (0.8 KB)
examples/README.json (6.0 KB)
examples/README.md (4.3 KB)
export-manifest.yaml (2.2 KB)
FRONTEND_DEEP_DIVE.md (19.1 KB)
frontend/begin.yaml (3.6 KB)
frontend/continuation.yaml (2.4 KB)
frontend/MEMORY.yaml (5.8 KB)
frontend/schemas/output-contract.schema.json (1.8 KB)
funnel-map.md (3.0 KB)
generate-keys.js (0.6 KB)
generated-component.tsx (1.6 KB)
generated-posts.json (2.3 KB)
generative-sketch.js (8.3 KB)
generative-sketch.ts (4.1 KB)
glama.json (0.1 KB)
graph-prompt-map.json (61.6 KB)
human user audt.yaml (24.9 KB)
hygiene and memory.yaml (8.7 KB)
iliad-agentic-platform-strategy.yaml (29.4 KB)
incident-template.md (24.7 KB)
launch-checklist.md (3.9 KB)
launch-content.md (6.0 KB)
layout-patterns.md (2.4 KB)
linking-policy.md (3.7 KB)
llms.txt (0.8 KB)
ls-coverage.txt (250.3 KB)
Makefile (0.4 KB)
marketing-pack.md (9.7 KB)
marketing/begin.yaml (1.8 KB)
marketing/continuation.yaml (2.4 KB)
marketing/MEMORY.yaml (2.8 KB)
marketing/schemas/output-contract.schema.json (1.8 KB)
mcp-config.json (12.9 KB)
mcp-registry-metadata.json (0.6 KB)
mcp/begin.yaml (1.8 KB)
mcp/build-artifacts.md (1.0 KB)
mcp/continuation.yaml (2.4 KB)
mcp/core-implementation-artifacts.md (16.5 KB)
mcp/fintech-domain-schema.yaml (2.9 KB)
mcp/fintech-mcp-surface-package.md (8.6 KB)
mcp/MEMORY.yaml (2.7 KB)
mcp/monorepo-structure.md (3.2 KB)
mcp/package-json.package.template.json (0.6 KB)
mcp/package-json.root.template.json (0.7 KB)
mcp/project-setup.md (0.9 KB)
mcp/README.md (1.9 KB)
mcp/schemas/output-contract.schema.json (2.1 KB)
mcp/testing-documentation-polish-artifacts.md (2.0 KB)
mcp/tsconfig.package.template.json (0.7 KB)
mcp/tsconfig.root.template.json (1.1 KB)
memory generator.yaml (7.6 KB)
messaging-system.yaml (2.5 KB)
meta-tag-audit.json (24.5 KB)
negotiation-rules.md (7.6 KB)
notebook-summary.md (4.0 KB)
notebook/begin.yaml (1.8 KB)
notebook/continuation.yaml (2.4 KB)
notebook/MEMORY.yaml (2.9 KB)
notebook/schemas/output-contract.schema.json (1.8 KB)
obsidian-skill-pack.md (3.2 KB)
obsidian-vault-pack.md (9.3 KB)
obsidian/begin.yaml (1.8 KB)
obsidian/continuation.yaml (2.4 KB)
obsidian/MEMORY.yaml (2.8 KB)
obsidian/schemas/output-contract.schema.json (1.8 KB)
optimization-rules.md (6.3 KB)
optimization/begin.yaml (2.5 KB)
optimization/continuation.yaml (2.4 KB)
optimization/MEMORY.yaml (3.7 KB)
optimization/schemas/output-contract.schema.json (1.8 KB)
package.json (1.5 KB)
packages/context-engine/package.json (0.9 KB)
packages/context-engine/src/engine-branches.test.ts (27.5 KB)
packages/context-engine/src/engine-branches2.test.ts (7.6 KB)
packages/context-engine/src/engine-branches3.test.ts (7.5 KB)
packages/context-engine/src/engine-edge.test.ts (8.7 KB)
packages/context-engine/src/engine.test.ts (13.8 KB)
packages/context-engine/src/engine.ts (19.0 KB)
packages/context-engine/src/index.ts (0.1 KB)
packages/context-engine/src/types.ts (2.7 KB)
packages/context-engine/tsconfig.json (0.2 KB)
packages/generator-core/package.json (1.1 KB)
packages/generator-core/src/counts-consistency.test.ts (1.9 KB)
packages/generator-core/src/file-excerpt-utils.ts (5.4 KB)
packages/generator-core/src/fw-helpers.ts (0.5 KB)
packages/generator-core/src/generate-programs.test.ts (13.0 KB)
packages/generator-core/src/generate-symbol-index.test.ts (10.0 KB)
packages/generator-core/src/generate-validation.test.ts (8.7 KB)
packages/generator-core/src/generate.test.ts (68.0 KB)
packages/generator-core/src/generate.ts (24.0 KB)
packages/generator-core/src/generator-alt-profiles.test.ts (16.9 KB)
packages/generator-core/src/generator-branches.test.ts (217.6 KB)
packages/generator-core/src/generator-sourcefile-branches.test.ts (21.3 KB)
packages/generator-core/src/generator-sourcefile-branches10.test.ts (34.0 KB)
packages/generator-core/src/generator-sourcefile-branches11.test.ts (21.4 KB)
packages/generator-core/src/generator-sourcefile-branches12.test.ts (16.3 KB)
packages/generator-core/src/generator-sourcefile-branches13.test.ts (10.5 KB)
packages/generator-core/src/generator-sourcefile-branches14.test.ts (13.8 KB)
packages/generator-core/src/generator-sourcefile-branches15.test.ts (9.2 KB)
packages/generator-core/src/generator-sourcefile-branches16.test.ts (22.4 KB)
packages/generator-core/src/generator-sourcefile-branches17.test.ts (15.9 KB)
packages/generator-core/src/generator-sourcefile-branches18.test.ts (28.9 KB)
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
packages/generator-core/src/generators-agentic-purchasing.test.ts (52.9 KB)
packages/generator-core/src/generators-agentic-purchasing.ts (61.9 KB)
packages/generator-core/src/generators-algorithmic.ts (26.2 KB)
packages/generator-core/src/generators-artifacts.ts (104.8 KB)
packages/generator-core/src/generators-brand.ts (32.2 KB)
packages/generator-core/src/generators-canvas.ts (27.1 KB)
packages/generator-core/src/generators-closer.test.ts (7.3 KB)
packages/generator-core/src/generators-closer.ts (51.8 KB)
packages/generator-core/src/generators-debug.ts (42.0 KB)
packages/generator-core/src/generators-frontend.ts (27.6 KB)
packages/generator-core/src/generators-marketing.ts (35.4 KB)
packages/generator-core/src/generators-mcp.ts (120.3 KB)
packages/generator-core/src/generators-notebook.ts (24.9 KB)
packages/generator-core/src/generators-obsidian.ts (28.5 KB)
packages/generator-core/src/generators-optimization.ts (26.1 KB)
packages/generator-core/src/generators-remotion.ts (32.1 KB)
packages/generator-core/src/generators-search-funcs.test.ts (11.8 KB)
packages/generator-core/src/generators-search.ts (26.1 KB)
packages/generator-core/src/generators-seo.ts (35.8 KB)
packages/generator-core/src/generators-skills.ts (43.0 KB)
packages/generator-core/src/generators-superpowers.ts (37.4 KB)
packages/generator-core/src/generators-theme.ts (49.9 KB)
packages/generator-core/src/index.ts (4.1 KB)
packages/generator-core/src/pipeline.test.ts (9.6 KB)
packages/generator-core/src/types.ts (0.6 KB)
packages/generator-core/tsconfig.json (0.2 KB)
packages/mpp/package.json (0.9 KB)
packages/mpp/README.md (8.8 KB)
packages/mpp/src/index.ts (13.7 KB)
packages/mpp/tsconfig.json (0.2 KB)
packages/repo-parser/package.json (0.9 KB)
packages/repo-parser/src/domain-extractor.test.ts (7.7 KB)
packages/repo-parser/src/domain-extractor.ts (6.7 KB)
packages/repo-parser/src/framework-detector.test.ts (13.7 KB)
packages/repo-parser/src/framework-detector.ts (7.7 KB)
packages/repo-parser/src/import-resolver.test.ts (8.6 KB)
packages/repo-parser/src/import-resolver.ts (3.8 KB)
packages/repo-parser/src/index.ts (0.6 KB)
packages/repo-parser/src/language-detector.test.ts (3.7 KB)
packages/repo-parser/src/language-detector.ts (1.7 KB)
packages/repo-parser/src/parser-branches.test.ts (13.2 KB)
packages/repo-parser/src/parser-branches2.test.ts (7.1 KB)
packages/repo-parser/src/parser-branches3.test.ts (10.1 KB)
packages/repo-parser/src/parser.test.ts (9.7 KB)
packages/repo-parser/src/parser.ts (15.2 KB)
packages/repo-parser/src/perf.bench.ts (6.1 KB)
packages/repo-parser/src/sql-extractor.test.ts (8.9 KB)
packages/repo-parser/src/sql-extractor.ts (4.3 KB)
packages/repo-parser/src/types.ts (2.0 KB)
packages/repo-parser/tsconfig.json (0.2 KB)
packages/sdk/package.json (0.4 KB)
packages/sdk/src/index.test.ts (13.2 KB)
packages/sdk/src/index.ts (7.4 KB)
packages/sdk/tsconfig.json (0.2 KB)
packages/snapshots/package.json (0.9 KB)
packages/snapshots/src/b-grade-upgrade.test.ts (8.4 KB)
packages/snapshots/src/billing-edge-cases.test.ts (14.5 KB)
packages/snapshots/src/billing-store.ts (16.1 KB)
packages/snapshots/src/billing-types.ts (4.0 KB)
packages/snapshots/src/billing.test.ts (12.2 KB)
packages/snapshots/src/coverage-gaps.test.ts (22.8 KB)
packages/snapshots/src/db-maintenance.test.ts (6.7 KB)
packages/snapshots/src/db.test.ts (16.0 KB)
packages/snapshots/src/db.ts (25.2 KB)
packages/snapshots/src/email-store.test.ts (10.7 KB)
packages/snapshots/src/email-store.ts (9.0 KB)
packages/snapshots/src/funnel-edge-cases.test.ts (10.7 KB)
packages/snapshots/src/funnel-store.test.ts (3.8 KB)
packages/snapshots/src/funnel-store.ts (15.1 KB)
packages/snapshots/src/funnel-types.ts (6.6 KB)
packages/snapshots/src/funnel.test.ts (18.1 KB)
packages/snapshots/src/github-http.test.ts (12.7 KB)
packages/snapshots/src/github-tarball.test.ts (14.1 KB)
packages/snapshots/src/github-token-branches.test.ts (3.8 KB)
packages/snapshots/src/github-token-store.ts (5.1 KB)
packages/snapshots/src/github.ts (8.9 KB)
packages/snapshots/src/index.ts (6.3 KB)
packages/snapshots/src/oauth-store.test.ts (8.5 KB)
packages/snapshots/src/oauth-store.ts (4.6 KB)
packages/snapshots/src/perf.bench.ts (6.9 KB)
packages/snapshots/src/persistence-metering.test.ts (9.9 KB)
packages/snapshots/src/persistence-metering.ts (4.9 KB)
packages/snapshots/src/referral-e2e.test.ts (10.3 KB)
packages/snapshots/src/referral-store.test.ts (10.6 KB)
packages/snapshots/src/referral-store.ts (10.9 KB)
packages/snapshots/src/search-store.test.ts (6.8 KB)
packages/snapshots/src/search-store.ts (9.7 KB)
packages/snapshots/src/search-symbols.test.ts (9.3 KB)
packages/snapshots/src/store-layer5.test.ts (4.0 KB)
packages/snapshots/src/store-validation.test.ts (15.6 KB)
packages/snapshots/src/store.test.ts (10.8 KB)
packages/snapshots/src/store.ts (9.3 KB)
packages/snapshots/src/stripe-store.test.ts (8.5 KB)
packages/snapshots/src/stripe-store.ts (6.2 KB)
packages/snapshots/src/tier-audit.ts (3.8 KB)
packages/snapshots/src/types.ts (1.1 KB)
packages/snapshots/src/usage-credit-metering.test.ts (2.6 KB)
packages/snapshots/src/usage-credit-metering.ts (5.6 KB)
packages/snapshots/src/version-store.ts (5.1 KB)
packages/snapshots/src/webhook-http.test.ts (13.3 KB)
packages/snapshots/src/webhook-retry.test.ts (16.6 KB)
packages/snapshots/src/webhook-store.ts (14.2 KB)
packages/snapshots/tsconfig.json (0.2 KB)
packaging-report.md (1.3 KB)
packaging/manifests/dockerhub-repository.md (0.3 KB)
packaging/manifests/github-marketplace-listing.md (0.5 KB)
packaging/manifests/npm-package.json (0.4 KB)
packaging/manifests/vscode-extension.json (0.4 KB)
packaging/README.md (1.2 KB)
packaging/trust-fabric/attestation.json (2.8 KB)
packaging/trust-fabric/merkle-proof.json (5.2 KB)
parameter-pack.json (2.2 KB)
payment-processing-output/ab-test-plan.md (2.4 KB)
payment-processing-output/AGENTS.md (2.0 KB)
payment-processing-output/architecture-summary.md (3.2 KB)
payment-processing-output/artifact-spec.md (2.2 KB)
payment-processing-output/asset-checklist.md (1.2 KB)
payment-processing-output/asset-guidelines.md (1.7 KB)
payment-processing-output/automation-pipeline.yaml (2.1 KB)
payment-processing-output/brand-board.md (4.0 KB)
payment-processing-output/brand-guidelines.md (2.5 KB)
payment-processing-output/campaign-brief.md (1.6 KB)
payment-processing-output/canvas-spec.json (3.5 KB)
payment-processing-output/capability-registry.json (1.8 KB)
payment-processing-output/channel-rulebook.md (2.6 KB)
payment-processing-output/citation-index.json (2.6 KB)
```

## Entry Points (Source)

### `apps/api/src/server.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";
import { Router, createApp } from "./router.js";
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
  handleGitHubAnalyze,
  handleAnalyze,
  handleFirecrawlScrape,
... (428 more lines)
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
import { AdminPage } from "./pages/AdminPage.tsx";
import { MyAnalyticsPage } from "./pages/MyAnalyticsPage.tsx";
import { ToolsIndexPage } from "./pages/ToolsIndexPage.tsx";
import { WebResearchPage } from "./pages/tools/WebResearchPage.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import { getAdminStats, ApiError, type SnapshotResponse } from "./api.ts";

// ─── Error Boundary ─────────────────────────────────────────────
// React requires a class for getDerivedStateFromError; this thin wrapper
// keeps the rest of the codebase class-free per .cursorrules.

class ErrorCatcher extends Component<{ children: ReactNode; fallback: (error: Error, reset: () => void) => ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
... (460 more lines)
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

### `packages/generator-core/src/index.ts`

```typescript
export type { GeneratedFile, GeneratorInput, GeneratorResult, SourceFile } from "./types.js";
export { generateFiles, listAvailableGenerators, TOTAL_GENERATORS, TOTAL_PROGRAMS } from "./generate.js";
export { generateContextMapJSON, generateRepoProfileYAML, generateArchitectureSummary, generateDependencyHotspots, generateRepoRunStats } from "./generators-search.js";
export { generateAgentsMD, generateClaudeMD, generateCursorRules, generateWorkflowPack, generatePolicyPack } from "./generators-skills.js";
export { generateDebugPlaybook, generateIncidentTemplate, generateTracingRules, generateRootCauseChecklist } from "./generators-debug.js";
export { generateFrontendRules, generateComponentGuidelines, generateLayoutPatterns, generateUiAudit } from "./generators-frontend.js";
export { generateSeoRules, generateSchemaRecommendations, generateRoutePriorityMap, generateContentAudit, generateMetaTagAudit } from "./generators-seo.js";
export { generateOptimizationRules, generatePromptDiffReport, generateCostEstimate, generateTokenBudgetPlan } from "./generators-optimization.js";
export { generateDesignTokens, generateThemeCss, generateThemeGuidelines, generateComponentThemeMap, generateDarkModeTokens } from "./generators-theme.js";
export { generateBrandGuidelines, generateVoiceAndTone, generateContentConstraints, generateMessagingSystem, generateChannelRulebook } from "./generators-brand.js";
export { generateSuperpowerPack, generateWorkflowRegistry, generateTestGenerationRules, generateRefactorChecklist, generateAutomationPipeline } from "./generators-superpowers.js";
export { generateCampaignBrief, generateFunnelMap, generateSequencePack, generateCroPlaybook, generateAbTestPlan } from "./generators-marketing.js";
export { generateNotebookSummary, generateSourceMap, generateStudyBrief, generateResearchThreads, generateCitationIndex } from "./generators-notebook.js";
export { generateObsidianSkillPack, generateVaultRules, generateGraphPromptMap, generateLinkingPolicy, generateTemplatePack } from "./generators-obsidian.js";
export { generateMcpConfig, generateMcpRegistryMetadata, generateProtocolSpec, generateSpecTypes, generateMcpReadme, generateProjectSetupGuide, generateBuildArtifactsGuide, generateRootPackageJsonTemplate, generatePackagePackageJsonTemplate, generateRootTsconfigTemplate, generatePackageTsconfigTemplate, generateMonorepoStructureGuide, generateCoreImplementationArtifactsGuide, generateTestingDocumentationPolishArtifactsGuide, generateConnectorMap, generateCapabilityRegistry, generateServerManifest, generateFintechMcpSurfacePackage, generateFintechDomainSchema } from "./generators-mcp.js";
export { generateComponent, generateDashboardWidget, generateEmbedSnippet, generateArtifactSpec, generateComponentLibrary, generatePrd, generateDesignDoc, generateTasksMd, generateContextMd, generateIndexHtml, generateCapabilityMap } from "./generators-artifacts.js";
export { generateRemotionScript, generateScenePlan, generateRenderConfig, generateAssetChecklist, generateStoryboard } from "./generators-remotion.js";
export { generateCanvasSpec, generateSocialPack, generatePosterLayouts, generateCanvasAssetGuidelines, generateBrandBoard } from "./generators-canvas.js";
export { generateGenerativeSketch, generateParameterPack, generateCollectionMap, generateExportManifest, generateVariationMatrix } from "./generators-algorithmic.js";
export { generateAgentPurchasingPlaybook, generateProductSchema, generateCheckoutFlow, generateNegotiationRules, generateCommerceRegistry, computeComplianceGrade } from "./generators-agentic-purchasing.js";
export type { ComplianceGradeResult } from "./generators-agentic-purchasing.js";
export {
	generatePackagingReadme,
	generatePackagingLicense,
	generateCloserDockerfile,
	generateCloserDockerCompose,
	generateCloserCiWorkflow,
	generateCloserReleaseWorkflow,
	generateCloserManifestNpm,
	generateCloserManifestUnreal,
... (10 more lines)
```

### `packages/mpp/src/index.ts`

```typescript
/**
 * @axis/mpp — Machine Payments Protocol (MPP) utilities
 *
 * Pure-protocol layer for x402/MPP budget negotiation. Drop this into any
 * Node.js HTTP server to speak the Axis agent-commerce protocol:
 *
 *   1. Parse incoming X-Agent-Budget / X-Agent-Mode headers
 *   2. Negotiate a price the agent can afford
 *   3. Build a 402 body the agent can parse and act on
 *
 * For Stripe/crypto charging, use the server-side `chargeMpp()` in `@axis/api`
 * (which depends on the `mppx` runtime library).
 *
 * @example
 * ```ts
 * import { parseAgentBudget, negotiatePrice, build402NegotiationBody } from "@axis/mpp";
 *
 * const budget = parseAgentBudget(req);
 * const { amount_cents, mode, accepted } = negotiatePrice(budget ?? {}, "analyze_repo");
 * if (!accepted) {
 *   res.writeHead(402, { "Content-Type": "application/json" });
 *   res.end(JSON.stringify(build402NegotiationBody("analyze_repo", budget)));
 * }
 * ```
 */

import type { IncomingMessage } from "node:http";

// ─── Types ────────────────────────────────────────────────────────

... (295 more lines)
```

### `packages/repo-parser/src/index.ts`

```typescript
export type { ParseResult, LanguageStats, FrameworkDetection, FileAnnotation, DependencyInfo, ImportEdge } from "./types.js";
export { parseRepo } from "./parser.js";
export { detectLanguage, countLines } from "./language-detector.js";
export { detectFrameworks } from "./framework-detector.js";
export { extractImports } from "./import-resolver.js";
export { extractSQLSchema } from "./sql-extractor.js";
export type { SQLTable } from "./sql-extractor.js";
export { extractDomainModels } from "./domain-extractor.js";
export type { DomainModel } from "./domain-extractor.js";

```

### `packages/sdk/src/index.ts`

```typescript
/**
 * @axis/sdk — Typed TypeScript client for the Axis' Iliad API.
 *
 * Usage:
 *   import { AxisClient } from "@axis/sdk";
 *   const axis = new AxisClient({ apiKey: "ax_..." });
 *   const snap = await axis.analyzeFiles({ ... });
 *   const artifact = await axis.getArtifact(snap.snapshot_id, "AGENTS.md");
 */

// ─── Types ──────────────────────────────────────────────────────

export interface AxisClientOptions {
  /** API base URL. Defaults to production. */
  baseUrl?: string;
  /** API key (ax_...). Required for authenticated endpoints. */
  apiKey?: string;
  /** Request timeout in ms. Default 30000. */
  timeout?: number;
}

export interface FileEntry {
  path: string;
  content: string;
}

export interface AnalyzeFilesInput {
  project_name: string;
  project_type: string;
  frameworks: string[];
... (199 more lines)
```

### `packages/snapshots/src/index.ts`

```typescript
export type { SnapshotInput, SnapshotRecord, SnapshotManifest, FileEntry, InputMethod, SnapshotStatus } from "./types.js";
export {
  createSnapshot,
  getSnapshot,
  updateSnapshotStatus,
  getProjectSnapshots,
  getProjectOwner,
  deleteSnapshot,
  deleteProject,
  saveContextMap,
  getContextMap,
  saveRepoProfile,
  getRepoProfile,
  saveGeneratorResult,
  getGeneratorResult,
} from "./store.js";
export { getDb, openMemoryDb, closeDb, runMigrations, getSchemaVersion, walCheckpoint, vacuum, integrityCheck, getDbStats, purgeStaleData, runMaintenance } from "./db.js";
export type { DbMaintenanceResult } from "./db.js";

// Search
export type { SearchIndexEntry, SearchResult, CodeSymbol, SymbolSearchResult, SymbolType } from "./search-store.js";
export { indexSnapshotContent, searchSnapshotContent, clearSearchIndex, getSearchIndexStats, indexSymbols, searchSymbols, clearSymbols, getSymbolStats, extractSymbols } from "./search-store.js";
export type { GitHubFetchResult, ParsedGitHubUrl } from "./github.js";
export { parseGitHubUrl, fetchGitHubRepo } from "./github.js";

// Billing
export type { Account, ApiKey, BillingTier, ProgramEntitlement, UsageRecord, UsageSummary, TierLimits, ProgramName, PersistenceOp, PersistenceCreditRecord, PersistencePackId } from "./billing-types.js";
export type { QuotaCheck, SystemStats, AccountSummary, RecentActivity, ApiEndpointUsage, ApiStatusUsage, AccountApiAnalyticsSummary } from "./billing-store.js";
export { TIER_LIMITS, ALL_PROGRAMS, PERSISTENCE_CREDIT_COSTS, PERSISTENCE_CREDIT_PACKS, PERSISTENCE_MIN_TIER, SUITE_MONTHLY_PERSISTENCE_CREDITS } from "./billing-types.js";
export {
... (181 more lines)
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
    "@axis/repo-parser": "workspace:*",
    "@axis/snapshots": "workspace:*",
    "@jmondi/oauth2-server": "^4.2.2",
    "jsonwebtoken": "^9.0.3",
    "mppx": "^0.5.12"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/jsonwebtoken": "^9.0.10",
    "@types/node": "^22.0.0",
... (5 more lines)
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
    "vite": "^6.4.2"
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
  "repository": {
    "type": "git",
    "url": "https://github.com/lastmanupinc-hub/axis-iliad.git"
... (33 more lines)
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

### `packages/mpp/package.json`

```json
{
  "name": "@axis/mpp",
  "version": "0.5.3",
  "type": "module",
  "description": "Machine Payments Protocol (MPP) â€” x402 budget negotiation and AP2 pricing utilities for MCP/AI agent servers",
  "keywords": [
    "mpp",
    "x402",
    "machine-payments",
    "agent-commerce",
    "budget-negotiation",
    "mcp",
    "ai-agents",
    "agentic-commerce",
    "payment-protocol"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/lastmanupinc-hub/axis-iliad.git",
    "directory": "packages/mpp"
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
... (14 more lines)
```

### `packages/mpp/tsconfig.json`

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

### `packages/repo-parser/package.json`

```json
{
  "name": "@axis/repo-parser",
  "version": "0.5.3",
  "type": "module",
  "description": "Language/framework detection, import graph, domain model extraction â€” the analysis core of Axis' Iliad",
  "keywords": ["codebase", "analysis", "ai", "context", "language-detection", "framework-detection", "import-graph", "mcp", "llm"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/lastmanupinc-hub/axis-iliad.git",
    "directory": "packages/repo-parser"
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
    "@axis/snapshots": "workspace:*"
... (7 more lines)
```

### `packages/repo-parser/tsconfig.json`

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

### `packages/sdk/package.json`

```json
{
  "name": "@axis/sdk",
  "version": "0.5.3",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}

```

### `packages/sdk/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}

```

### `packages/snapshots/package.json`

```json
{
  "name": "@axis/snapshots",
  "version": "0.5.3",
  "type": "module",
  "description": "Versioned codebase snapshot store with SQLite persistence, diff support, billing types, and funnel tracking â€” the storage layer for Axis' Iliad",
  "keywords": ["snapshot", "versioning", "sqlite", "codebase", "diff", "ai", "agent"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/lastmanupinc-hub/axis-iliad.git",
    "directory": "packages/snapshots"
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
    "better-sqlite3": "^12.8.0",
... (9 more lines)
```

### `packages/snapshots/tsconfig.json`

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

### `packaging/manifests/npm-package.json`

```json
{
  "name": "axis-iliad",
  "version": "1.0.0",
  "description": "Production-grade axis-iliad packaging and release kit",
  "license": "SEE LICENSE IN packaging/LICENSE",
  "repository": {
    "type": "git",
    "url": "https://github.com/owner/repo"
  },
  "homepage": "https://example.com",
  "keywords": [
    "marketplace",
    "packaged",
    "production",
    "certified"
  ]
}
```

---
*Generated by Axis Search — 2026-05-22*
