# Architecture Summary: axis-toolbox

> AI-native development operating system. Upload or point at any codebase — get 87 generated artifacts across 18 specialized programs: context maps, debug playbooks, governance files, design tokens, SEO analysis, brand systems, and more.

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 432 files across 20 top-level directories. It defines 131 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Overview

- **Primary Language:** TypeScript
- **Project Type:** monorepo
- **Files:** 432 (95217 LOC)
- **Directories:** 53

## Frameworks & Libraries

- **React** ^19.1.0 (95% confidence)

## Architecture Patterns

- `monorepo`
- `containerized`
- **Separation Score:** 0.64

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
| POST | `/v1/account/tier` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/programs` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/account/credits` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/plans` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/seats` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/account/seats` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/seats/:seat_id/accept` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/seats/:seat_id/revoke` | apps/api/src/billing-flow.test.ts |
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
| GET | `/v1/health` | apps/api/src/quota.test.ts |
| POST | `/v1/accounts` | apps/api/src/quota.test.ts |
| GET | `/v1/account/quota` | apps/api/src/quota.test.ts |
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
| GET | `/v1/health` | apps/api/src/server.ts |
| GET | `/v1/health/live` | apps/api/src/server.ts |
| GET | `/v1/health/ready` | apps/api/src/server.ts |
| GET | `/v1/metrics` | apps/api/src/server.ts |
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
| POST | `/v1/github/analyze` | apps/api/src/server.ts |
| POST | `/v1/search/index` | apps/api/src/server.ts |
| POST | `/v1/search/query` | apps/api/src/server.ts |
| GET | `/v1/search/:snapshot_id/stats` | apps/api/src/server.ts |
| GET | `/v1/search/:snapshot_id/symbols` | apps/api/src/server.ts |
| GET | `/v1/projects/:project_id/export` | apps/api/src/server.ts |
| GET | `/v1/programs` | apps/api/src/server.ts |
| POST | `/v1/accounts` | apps/api/src/server.ts |
| GET | `/v1/account` | apps/api/src/server.ts |
| POST | `/v1/account/keys` | apps/api/src/server.ts |
| GET | `/v1/account/keys` | apps/api/src/server.ts |
| POST | `/v1/account/keys/:key_id/revoke` | apps/api/src/server.ts |
| GET | `/v1/account/usage` | apps/api/src/server.ts |
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
| GET | `/v1/admin/stats` | apps/api/src/server.ts |
| GET | `/v1/admin/accounts` | apps/api/src/server.ts |
| GET | `/v1/admin/activity` | apps/api/src/server.ts |
| GET | `/v1/auth/github` | apps/api/src/server.ts |
| GET | `/v1/auth/github/callback` | apps/api/src/server.ts |
| POST | `/v1/account/webhooks` | apps/api/src/server.ts |
| GET | `/v1/account/webhooks` | apps/api/src/server.ts |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/server.ts |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/server.ts |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/server.ts |
| POST | `/v1/webhooks/stripe` | apps/api/src/server.ts |
| POST | `/v1/checkout` | apps/api/src/server.ts |
| GET | `/v1/account/subscription` | apps/api/src/server.ts |
| POST | `/v1/account/subscription/cancel` | apps/api/src/server.ts |
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
| GET | `/users/:id` | packages/repo-parser/src/perf.bench.ts |
| POST | `/users` | packages/repo-parser/src/perf.bench.ts |

## Directory Layout

- `packages/` — monorepo_packages (126 files)
- `apps/` — monorepo_apps (114 files)
- `payment-processing-output/` — project_directory (72 files)
- `search/` — project_directory (6 files)
- `algorithmic/` — project_directory (4 files)
- `artifacts/` — project_directory (4 files)
- `brand/` — project_directory (4 files)
- `canvas/` — project_directory (4 files)
- `debug/` — project_directory (4 files)
- `frontend/` — project_directory (4 files)
- `marketing/` — project_directory (4 files)
- `mcp/` — project_directory (4 files)
- `notebook/` — project_directory (4 files)
- `obsidian/` — project_directory (4 files)
- `optimization/` — project_directory (4 files)
- `remotion/` — project_directory (4 files)
- `seo/` — project_directory (4 files)
- `skills/` — project_directory (4 files)
- `superpowers/` — project_directory (4 files)
- `theme/` — project_directory (4 files)

## Dependency Hotspots

| File | Inbound | Outbound | Risk |
|------|---------|----------|------|
| apps/web/src/api.ts | 16 | 0 | 80% |
| apps/web/src/App.tsx | 1 | 14 | 75% |
| apps/web/src/pages/DashboardPage.tsx | 1 | 9 | 50% |
| apps/web/src/components/Toast.tsx | 3 | 0 | 15% |
| apps/web/src/components/AxisIcons.tsx | 3 | 0 | 15% |
| apps/web/src/upload-utils.ts | 3 | 0 | 15% |

## Domain Models

Detected 131 domain models:

| Model | Kind | Fields | Source |
|-------|------|--------|--------|
| `AuthContext` | interface | 3 | apps/api/src/billing.ts |
| `EnvSpec` | interface | 5 | apps/api/src/env.ts |
| `ValidationError` | interface | 2 | apps/api/src/env.ts |
| `ValidationResult` | interface | 3 | apps/api/src/env.ts |
| `ZipEntry` | interface | 4 | apps/api/src/export.ts |
| `HistogramEntry` | interface | 3 | apps/api/src/metrics.ts |
| `OpenApiSpec` | interface | 6 | apps/api/src/openapi.ts |
| `WindowEntry` | interface | 2 | apps/api/src/rate-limiter.ts |
| `AppHandle` | interface | 3 | apps/api/src/router.ts |
| `Route` | interface | 4 | apps/api/src/router.ts |
| `CliArgs` | interface | 5 | apps/cli/src/cli.ts |
| `AxisConfig` | interface | 2 | apps/cli/src/credential-store.ts |
| `RunResult` | interface | 4 | apps/cli/src/runner.ts |
| `ScanResult` | interface | 3 | apps/cli/src/scanner.ts |
| `WriteResult` | interface | 3 | apps/cli/src/writer.ts |
| `Account` | interface | 5 | apps/web/src/api.ts |
| `ApiKeyInfo` | interface | 5 | apps/web/src/api.ts |
| `ContextMap` | interface | 8 | apps/web/src/api.ts |
| `GeneratedFile` | interface | 5 | apps/web/src/api.ts |
| `GeneratedFilesResponse` | interface | 6 | apps/web/src/api.ts |
| `PlanDefinition` | interface | 6 | apps/web/src/api.ts |
| `PlanFeature` | interface | 4 | apps/web/src/api.ts |
| `RepoProfile` | interface | 4 | apps/web/src/api.ts |
| `SearchResponse` | interface | 5 | apps/web/src/api.ts |
| `SearchResult` | interface | 4 | apps/web/src/api.ts |
| *… 106 more* | | | |

> **High-complexity models** (8+ fields): `ContextMap`, `SnapshotResponse`, `SubscriptionInfo`, `UpgradePrompt`, `ProgramDoc`, `ContextMap`, `RepoProfile`, `ParseResult`, `UsageRecord`, `EmailDelivery`, `FunnelMetrics`, `Seat`, `UpgradePrompt`, `GitHubToken`, `StripeSubscription`, `TierChange`, `SnapshotManifest`, `SnapshotRecord`, `VersionDiff`, `Webhook`, `WebhookDelivery`, `WebhookRow` — consider splitting if they grow further.

## Tooling

- **Build:** vite
- **Test:** vitest
- **Package Manager:** pnpm
- **Deploy:** docker

## Conventions

- TypeScript strict mode
- pnpm workspaces

## Warnings

- ⚠️ No CI/CD pipeline detected
- ⚠️ No lockfile found — dependency versions may be inconsistent

## File Tree

```
.gitignore (0.1 KB)
AGENTS.md (5.5 KB)
algorithmic-pack.json (7.9 KB)
algorithmic/begin.yaml (1.8 KB)
algorithmic/continuation.yaml (2.4 KB)
algorithmic/MEMORY.yaml (2.9 KB)
algorithmic/schemas/output-contract.schema.json (1.8 KB)
apps/api/package.json (0.6 KB)
apps/api/src/admin.test.ts (8.8 KB)
apps/api/src/admin.ts (2.0 KB)
apps/api/src/api-branches.test.ts (22.0 KB)
apps/api/src/api-layer5.test.ts (10.6 KB)
apps/api/src/api.test.ts (18.9 KB)
apps/api/src/b-grade-upgrade.test.ts (8.6 KB)
apps/api/src/billing-flow.test.ts (24.6 KB)
apps/api/src/billing.ts (20.9 KB)
apps/api/src/checkout-email.test.ts (11.7 KB)
apps/api/src/crash-resilience.test.ts (6.3 KB)
apps/api/src/credits-api.test.ts (10.9 KB)
apps/api/src/db-endpoints.test.ts (4.1 KB)
apps/api/src/deletion.test.ts (5.6 KB)
apps/api/src/deployment.test.ts (6.9 KB)
apps/api/src/e2e-flows.test.ts (22.4 KB)
apps/api/src/env.test.ts (8.3 KB)
apps/api/src/env.ts (5.5 KB)
apps/api/src/export-edge-cases.test.ts (9.9 KB)
apps/api/src/export.test.ts (13.4 KB)
apps/api/src/export.ts (6.7 KB)
apps/api/src/funnel-api.test.ts (28.0 KB)
apps/api/src/funnel.ts (8.9 KB)
apps/api/src/github.test.ts (6.0 KB)
apps/api/src/github.ts (0.2 KB)
apps/api/src/handler-edge-cases.test.ts (11.8 KB)
apps/api/src/handler-validation.test.ts (11.4 KB)
apps/api/src/handlers-deep.test.ts (18.7 KB)
apps/api/src/handlers.ts (33.7 KB)
apps/api/src/latency-histogram.test.ts (9.1 KB)
apps/api/src/logger.test.ts (3.5 KB)
apps/api/src/logger.ts (2.9 KB)
apps/api/src/logging.test.ts (8.5 KB)
apps/api/src/metrics-branches.test.ts (2.5 KB)
apps/api/src/metrics.test.ts (4.3 KB)
apps/api/src/metrics.ts (6.4 KB)
apps/api/src/multi-tenancy.test.ts (20.0 KB)
apps/api/src/oauth.test.ts (8.0 KB)
apps/api/src/oauth.ts (3.4 KB)
apps/api/src/openapi.test.ts (14.8 KB)
apps/api/src/openapi.ts (49.7 KB)
apps/api/src/production-startup.test.ts (8.5 KB)
apps/api/src/programs-billing.test.ts (12.8 KB)
apps/api/src/quota.test.ts (4.5 KB)
apps/api/src/rate-limiter.test.ts (13.8 KB)
apps/api/src/rate-limiter.ts (6.5 KB)
apps/api/src/request-limits.test.ts (3.9 KB)
apps/api/src/router-branches.test.ts (12.6 KB)
apps/api/src/router.test.ts (13.7 KB)
apps/api/src/router.ts (11.2 KB)
apps/api/src/search-api.test.ts (13.8 KB)
apps/api/src/security.test.ts (7.2 KB)
apps/api/src/server-lifecycle.test.ts (7.0 KB)
apps/api/src/server-routes.test.ts (5.2 KB)
apps/api/src/server.ts (8.9 KB)
apps/api/src/snapshot-auth.test.ts (12.4 KB)
apps/api/src/stripe-branches.test.ts (38.6 KB)
apps/api/src/stripe.test.ts (10.1 KB)
apps/api/src/stripe.ts (15.8 KB)
apps/api/src/validation.test.ts (8.1 KB)
apps/api/src/versions.test.ts (8.1 KB)
apps/api/src/versions.ts (2.5 KB)
apps/api/src/webhook-branches.test.ts (16.3 KB)
apps/api/src/webhooks.test.ts (13.6 KB)
apps/api/src/webhooks.ts (5.4 KB)
apps/api/tsconfig.json (0.2 KB)
apps/cli/package.json (0.5 KB)
apps/cli/src/cli-auth.test.ts (7.6 KB)
apps/cli/src/cli-commands.test.ts (8.7 KB)
apps/cli/src/cli-edge-cases.test.ts (14.4 KB)
apps/cli/src/cli-pipeline.test.ts (9.3 KB)
apps/cli/src/cli.test.ts (13.3 KB)
apps/cli/src/cli.ts (9.7 KB)
apps/cli/src/credential-store.test.ts (8.2 KB)
apps/cli/src/credential-store.ts (3.2 KB)
apps/cli/src/determinism.test.ts (5.0 KB)
apps/cli/src/runner.test.ts (6.5 KB)
apps/cli/src/runner.ts (11.2 KB)
apps/cli/src/scanner.ts (3.8 KB)
apps/cli/src/writer.ts (0.9 KB)
apps/cli/tsconfig.json (0.4 KB)
apps/web/index.html (6.4 KB)
apps/web/package.json (0.5 KB)
apps/web/src/api.test.ts (23.7 KB)
apps/web/src/api.ts (15.5 KB)
apps/web/src/App.tsx (13.5 KB)
apps/web/src/components/AxisIcons.tsx (8.9 KB)
apps/web/src/components/CommandPalette.tsx (6.6 KB)
apps/web/src/components/FilesTab.tsx (4.7 KB)
apps/web/src/components/GeneratedTab.tsx (4.1 KB)
apps/web/src/components/GraphTab.tsx (4.8 KB)
apps/web/src/components/OverviewTab.tsx (8.8 KB)
apps/web/src/components/ProgramLauncher.tsx (7.2 KB)
apps/web/src/components/SearchTab.tsx (11.1 KB)
apps/web/src/components/SignUpModal.tsx (3.9 KB)
apps/web/src/components/StatusBar.tsx (2.3 KB)
apps/web/src/components/Toast.tsx (3.8 KB)
apps/web/src/index.css (18.5 KB)
apps/web/src/main.tsx (0.2 KB)
apps/web/src/pages/AccountPage.tsx (21.6 KB)
apps/web/src/pages/DashboardPage.tsx (5.9 KB)
apps/web/src/pages/DocsPage.tsx (71.2 KB)
apps/web/src/pages/HelpPage.tsx (41.9 KB)
apps/web/src/pages/PlansPage.tsx (9.3 KB)
apps/web/src/pages/ProgramsPage.tsx (13.9 KB)
apps/web/src/pages/QAPage.tsx (23.6 KB)
apps/web/src/pages/TermsPage.tsx (19.4 KB)
apps/web/src/pages/UploadPage.tsx (22.6 KB)
apps/web/src/upload-utils-zip.test.ts (9.0 KB)
apps/web/src/upload-utils.test.ts (5.7 KB)
apps/web/src/upload-utils.ts (4.1 KB)
apps/web/src/vite-env.d.ts (0.2 KB)
apps/web/tsconfig.json (0.5 KB)
apps/web/vite.config.ts (0.2 KB)
architecture-summary.md (8.9 KB)
artifact-spec.md (1.6 KB)
artifacts/begin.yaml (1.8 KB)
artifacts/continuation.yaml (2.4 KB)
artifacts/MEMORY.yaml (3.1 KB)
artifacts/schemas/output-contract.schema.json (1.8 KB)
automated remedial action.yaml (7.5 KB)
axis_all_tools.yaml (22.6 KB)
AXIS_Board_Pitch.md (30.7 KB)
AXIS_DEMO_REPORT.md (12.3 KB)
axis_master_blueprint.yaml (9.6 KB)
begin.yaml (10.4 KB)
brand-guidelines.md (7.7 KB)
brand/begin.yaml (1.8 KB)
brand/continuation.yaml (2.4 KB)
brand/MEMORY.yaml (3.0 KB)
brand/schemas/output-contract.schema.json (1.8 KB)
canvas-pack.md (9.7 KB)
canvas/begin.yaml (1.8 KB)
canvas/continuation.yaml (2.4 KB)
canvas/MEMORY.yaml (2.8 KB)
canvas/schemas/output-contract.schema.json (1.8 KB)
capability_inventory.yaml (31.7 KB)
CHANGELOG.md (6.0 KB)
CLAUDE.md (1.1 KB)
cloudflare-pages.md (1.5 KB)
continuation.yaml (217.6 KB)
CONTRIBUTING.md (3.1 KB)
cov3.txt (19.3 KB)
cov5.txt (218.4 KB)
debug/begin.yaml (3.6 KB)
debug/continuation.yaml (2.4 KB)
debug/MEMORY.yaml (5.5 KB)
debug/schemas/output-contract.schema.json (1.8 KB)
dependency-hotspots.md (5.1 KB)
docker-compose.yml (2.0 KB)
Dockerfile (4.0 KB)
e2e_round2.mjs (15.1 KB)
e2e_ui_audit.yaml (39.3 KB)
frontend/begin.yaml (3.6 KB)
frontend/continuation.yaml (2.4 KB)
frontend/MEMORY.yaml (5.8 KB)
frontend/schemas/output-contract.schema.json (1.8 KB)
generative-sketch.js (8.3 KB)
human user audt.yaml (24.9 KB)
hygiene and memory.yaml (8.7 KB)
marketing-pack.md (9.7 KB)
marketing/begin.yaml (1.8 KB)
marketing/continuation.yaml (2.4 KB)
marketing/MEMORY.yaml (2.8 KB)
marketing/schemas/output-contract.schema.json (1.8 KB)
mcp-config.json (7.6 KB)
mcp/begin.yaml (1.8 KB)
mcp/continuation.yaml (2.4 KB)
mcp/MEMORY.yaml (2.7 KB)
mcp/schemas/output-contract.schema.json (1.8 KB)
memory generator.yaml (7.6 KB)
notebook-summary.md (9.9 KB)
notebook/begin.yaml (1.8 KB)
notebook/continuation.yaml (2.4 KB)
notebook/MEMORY.yaml (2.9 KB)
notebook/schemas/output-contract.schema.json (1.8 KB)
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
package.json (0.4 KB)
packages/context-engine/package.json (0.4 KB)
packages/context-engine/src/engine-branches.test.ts (27.5 KB)
packages/context-engine/src/engine-branches2.test.ts (7.6 KB)
packages/context-engine/src/engine-branches3.test.ts (7.5 KB)
packages/context-engine/src/engine-edge.test.ts (8.7 KB)
packages/context-engine/src/engine.test.ts (13.8 KB)
packages/context-engine/src/engine.ts (19.0 KB)
packages/context-engine/src/index.ts (0.1 KB)
packages/context-engine/src/types.ts (2.7 KB)
packages/context-engine/tsconfig.json (0.2 KB)
packages/generator-core/package.json (0.4 KB)
packages/generator-core/src/file-excerpt-utils.ts (5.4 KB)
packages/generator-core/src/fw-helpers.ts (0.5 KB)
packages/generator-core/src/generate-programs.test.ts (11.7 KB)
packages/generator-core/src/generate-symbol-index.test.ts (10.0 KB)
packages/generator-core/src/generate-validation.test.ts (10.9 KB)
packages/generator-core/src/generate.test.ts (42.2 KB)
packages/generator-core/src/generate.ts (16.1 KB)
packages/generator-core/src/generator-alt-profiles.test.ts (17.0 KB)
packages/generator-core/src/generator-branches.test.ts (217.7 KB)
packages/generator-core/src/generator-sourcefile-branches.test.ts (20.9 KB)
packages/generator-core/src/generator-sourcefile-branches10.test.ts (34.2 KB)
packages/generator-core/src/generator-sourcefile-branches11.test.ts (21.4 KB)
packages/generator-core/src/generator-sourcefile-branches12.test.ts (16.3 KB)
packages/generator-core/src/generator-sourcefile-branches13.test.ts (10.5 KB)
packages/generator-core/src/generator-sourcefile-branches14.test.ts (13.8 KB)
packages/generator-core/src/generator-sourcefile-branches15.test.ts (9.2 KB)
packages/generator-core/src/generator-sourcefile-branches16.test.ts (22.5 KB)
packages/generator-core/src/generator-sourcefile-branches17.test.ts (15.9 KB)
packages/generator-core/src/generator-sourcefile-branches18.test.ts (28.8 KB)
packages/generator-core/src/generator-sourcefile-branches19.test.ts (12.6 KB)
packages/generator-core/src/generator-sourcefile-branches2.test.ts (23.9 KB)
packages/generator-core/src/generator-sourcefile-branches20.test.ts (9.5 KB)
packages/generator-core/src/generator-sourcefile-branches3.test.ts (31.0 KB)
packages/generator-core/src/generator-sourcefile-branches4.test.ts (24.7 KB)
packages/generator-core/src/generator-sourcefile-branches5.test.ts (29.0 KB)
packages/generator-core/src/generator-sourcefile-branches6.test.ts (26.0 KB)
packages/generator-core/src/generator-sourcefile-branches7.test.ts (36.7 KB)
packages/generator-core/src/generator-sourcefile-branches8.test.ts (49.1 KB)
packages/generator-core/src/generator-sourcefile-branches9.test.ts (33.5 KB)
packages/generator-core/src/generators-algorithmic.ts (26.2 KB)
packages/generator-core/src/generators-artifacts.ts (28.2 KB)
packages/generator-core/src/generators-brand.ts (32.2 KB)
packages/generator-core/src/generators-canvas.ts (27.1 KB)
packages/generator-core/src/generators-debug.ts (42.0 KB)
packages/generator-core/src/generators-frontend.ts (27.6 KB)
packages/generator-core/src/generators-marketing.ts (35.4 KB)
packages/generator-core/src/generators-mcp.ts (26.7 KB)
packages/generator-core/src/generators-notebook.ts (24.9 KB)
packages/generator-core/src/generators-obsidian.ts (28.5 KB)
packages/generator-core/src/generators-optimization.ts (26.1 KB)
packages/generator-core/src/generators-remotion.ts (32.1 KB)
packages/generator-core/src/generators-search-funcs.test.ts (11.8 KB)
packages/generator-core/src/generators-search.ts (17.9 KB)
packages/generator-core/src/generators-seo.ts (35.8 KB)
packages/generator-core/src/generators-skills.ts (25.2 KB)
packages/generator-core/src/generators-superpowers.ts (37.4 KB)
packages/generator-core/src/generators-theme.ts (45.9 KB)
packages/generator-core/src/index.ts (2.7 KB)
packages/generator-core/src/pipeline.test.ts (9.7 KB)
packages/generator-core/src/types.ts (0.6 KB)
packages/generator-core/tsconfig.json (0.2 KB)
packages/repo-parser/package.json (0.4 KB)
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
packages/repo-parser/src/parser.test.ts (9.1 KB)
packages/repo-parser/src/parser.ts (14.5 KB)
packages/repo-parser/src/perf.bench.ts (6.1 KB)
packages/repo-parser/src/sql-extractor.test.ts (8.9 KB)
packages/repo-parser/src/sql-extractor.ts (4.3 KB)
packages/repo-parser/src/types.ts (2.0 KB)
packages/repo-parser/tsconfig.json (0.2 KB)
packages/snapshots/package.json (0.4 KB)
packages/snapshots/src/b-grade-upgrade.test.ts (8.4 KB)
packages/snapshots/src/billing-edge-cases.test.ts (14.5 KB)
packages/snapshots/src/billing-store.ts (13.1 KB)
packages/snapshots/src/billing-types.ts (3.9 KB)
packages/snapshots/src/billing.test.ts (12.2 KB)
packages/snapshots/src/coverage-gaps.test.ts (22.8 KB)
packages/snapshots/src/db-maintenance.test.ts (6.7 KB)
packages/snapshots/src/db.test.ts (15.7 KB)
packages/snapshots/src/db.ts (19.8 KB)
packages/snapshots/src/email-store.test.ts (10.7 KB)
packages/snapshots/src/email-store.ts (9.0 KB)
packages/snapshots/src/funnel-edge-cases.test.ts (10.7 KB)
packages/snapshots/src/funnel-store.test.ts (3.8 KB)
packages/snapshots/src/funnel-store.ts (15.1 KB)
packages/snapshots/src/funnel-types.ts (7.0 KB)
packages/snapshots/src/funnel.test.ts (17.4 KB)
packages/snapshots/src/github-http.test.ts (12.7 KB)
packages/snapshots/src/github-tarball.test.ts (13.2 KB)
packages/snapshots/src/github-token-branches.test.ts (3.8 KB)
packages/snapshots/src/github-token-store.ts (5.1 KB)
packages/snapshots/src/github.ts (7.7 KB)
packages/snapshots/src/index.ts (5.4 KB)
packages/snapshots/src/oauth-store.test.ts (8.5 KB)
packages/snapshots/src/oauth-store.ts (4.6 KB)
packages/snapshots/src/perf.bench.ts (6.9 KB)
packages/snapshots/src/persistence-metering.test.ts (9.9 KB)
packages/snapshots/src/persistence-metering.ts (4.9 KB)
packages/snapshots/src/search-store.test.ts (6.8 KB)
packages/snapshots/src/search-store.ts (9.7 KB)
packages/snapshots/src/search-symbols.test.ts (9.3 KB)
packages/snapshots/src/store-layer5.test.ts (4.0 KB)
packages/snapshots/src/store-validation.test.ts (15.6 KB)
packages/snapshots/src/store.test.ts (10.8 KB)
packages/snapshots/src/store.ts (9.3 KB)
packages/snapshots/src/stripe-store.test.ts (8.5 KB)
packages/snapshots/src/stripe-store.ts (5.1 KB)
packages/snapshots/src/tier-audit.ts (3.8 KB)
packages/snapshots/src/types.ts (1.1 KB)
packages/snapshots/src/version-store.ts (5.1 KB)
packages/snapshots/src/webhook-http.test.ts (13.3 KB)
packages/snapshots/src/webhook-retry.test.ts (16.6 KB)
packages/snapshots/src/webhook-store.ts (14.2 KB)
packages/snapshots/tsconfig.json (0.2 KB)
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
payment-processing-output/CLAUDE.md (0.9 KB)
payment-processing-output/collection-map.md (2.2 KB)
payment-processing-output/component-guidelines.md (0.8 KB)
payment-processing-output/component-library.json (5.6 KB)
payment-processing-output/component-theme-map.json (58.8 KB)
payment-processing-output/connector-map.yaml (0.9 KB)
payment-processing-output/content-audit.md (4.4 KB)
payment-processing-output/content-constraints.md (2.4 KB)
payment-processing-output/cost-estimate.json (6.5 KB)
payment-processing-output/cro-playbook.md (3.0 KB)
payment-processing-output/dark-mode-tokens.json (2.8 KB)
payment-processing-output/dashboard-widget.tsx (0.2 KB)
payment-processing-output/dependency-hotspots.md (2.3 KB)
payment-processing-output/embed-snippet.ts (1.4 KB)
payment-processing-output/export-manifest.yaml (2.2 KB)
payment-processing-output/funnel-map.md (2.2 KB)
payment-processing-output/generated-component.tsx (0.5 KB)
payment-processing-output/generative-sketch.ts (3.9 KB)
payment-processing-output/graph-prompt-map.json (4.2 KB)
payment-processing-output/incident-template.md (1.1 KB)
payment-processing-output/layout-patterns.md (1.8 KB)
payment-processing-output/linking-policy.md (3.0 KB)
payment-processing-output/mcp-config.json (2.7 KB)
payment-processing-output/messaging-system.yaml (1.5 KB)
payment-processing-output/meta-tag-audit.json (7.3 KB)
payment-processing-output/notebook-summary.md (1.2 KB)
payment-processing-output/obsidian-skill-pack.md (2.0 KB)
payment-processing-output/parameter-pack.json (2.2 KB)
payment-processing-output/policy-pack.md (1.4 KB)
payment-processing-output/poster-layouts.md (2.8 KB)
payment-processing-output/prompt-diff-report.md (1.4 KB)
payment-processing-output/refactor-checklist.md (2.0 KB)
payment-processing-output/remotion-script.ts (3.5 KB)
payment-processing-output/render-config.json (1.2 KB)
payment-processing-output/research-threads.md (2.3 KB)
payment-processing-output/root-cause-checklist.md (2.9 KB)
payment-processing-output/route-priority-map.md (1.0 KB)
payment-processing-output/scene-plan.md (2.1 KB)
payment-processing-output/schema-recommendations.json (0.5 KB)
payment-processing-output/sequence-pack.md (1.7 KB)
payment-processing-output/server-manifest.yaml (2.8 KB)
payment-processing-output/social-pack.md (1.6 KB)
payment-processing-output/source-map.json (4.8 KB)
payment-processing-output/storyboard.md (4.5 KB)
payment-processing-output/study-brief.md (2.4 KB)
payment-processing-output/superpower-pack.md (1.9 KB)
payment-processing-output/template-pack.md (2.1 KB)
payment-processing-output/test-generation-rules.md (2.0 KB)
payment-processing-output/theme-guidelines.md (5.6 KB)
payment-processing-output/theme.css (6.4 KB)
payment-processing-output/token-budget-plan.md (2.3 KB)
payment-processing-output/tracing-rules.md (1.4 KB)
payment-processing-output/ui-audit.md (2.2 KB)
payment-processing-output/variation-matrix.json (6.9 KB)
payment-processing-output/vault-rules.md (2.1 KB)
payment-processing-output/voice-and-tone.md (2.5 KB)
payment-processing-output/workflow-pack.md (2.0 KB)
payment-processing-output/workflow-registry.json (1.8 KB)
pnpm-workspace.yaml (0.1 KB)
ProgramPipeline.js (11.3 KB)
README.md (9.0 KB)
remotion-pack.md (9.2 KB)
remotion/begin.yaml (1.8 KB)
remotion/continuation.yaml (2.4 KB)
remotion/MEMORY.yaml (2.8 KB)
remotion/schemas/output-contract.schema.json (1.8 KB)
render.yaml (1.1 KB)
repo_snapshot.yaml (80.7 KB)
rules to compile snapshot.yaml (19.4 KB)
search/begin.yaml (3.7 KB)
search/continuation.yaml (2.4 KB)
search/MEMORY.yaml (5.9 KB)
search/schemas/context-map.schema.json (10.9 KB)
search/schemas/output-contract.schema.json (1.8 KB)
search/schemas/repo-profile.schema.yaml (6.7 KB)
seo/begin.yaml (3.6 KB)
seo/continuation.yaml (2.4 KB)
seo/MEMORY.yaml (5.8 KB)
seo/schemas/output-contract.schema.json (1.8 KB)
skills/begin.yaml (3.6 KB)
skills/continuation.yaml (2.4 KB)
skills/MEMORY.yaml (6.0 KB)
skills/schemas/output-contract.schema.json (1.8 KB)
snapshot_protocol.yaml (8.3 KB)
stalling fix.txt (2.6 KB)
static_analysis_phase.yaml (65.4 KB)
superpowers-pack.md (9.8 KB)
superpowers/begin.yaml (1.9 KB)
superpowers/continuation.yaml (2.5 KB)
superpowers/MEMORY.yaml (3.0 KB)
superpowers/schemas/output-contract.schema.json (1.8 KB)
theme/begin.yaml (1.8 KB)
theme/continuation.yaml (2.4 KB)
theme/MEMORY.yaml (3.0 KB)
theme/schemas/output-contract.schema.json (1.8 KB)
tsconfig.base.json (0.4 KB)
vitest.config.ts (0.6 KB)
workflow-pack.md (7.2 KB)
```

## Entry Points (Source)

### `apps/api/src/server.ts`

```typescript
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
  handleGitHubAnalyze,
  handleHealthCheck,
  handleSearchIndex,
  handleSearchQuery,
  handleSearchStats,
  handleSearchSymbols,
... (204 more lines)
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
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import type { SnapshotResponse } from "./api.ts";

// ─── Error Boundary ─────────────────────────────────────────────

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("UI crash:", error); }
  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ margin: 40, textAlign: "center", padding: 32 }}>
          <h2>Something went wrong</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{this.state.error.message}</p>
          <button className="btn btn-primary" onClick={() => { this.setState({ error: null }); location.hash = ""; }}>
            Reload
... (256 more lines)
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
export { generateFiles, listAvailableGenerators } from "./generate.js";
export { generateContextMapJSON, generateRepoProfileYAML, generateArchitectureSummary, generateDependencyHotspots } from "./generators-search.js";
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
export { generateMcpConfig, generateConnectorMap, generateCapabilityRegistry, generateServerManifest } from "./generators-mcp.js";
export { generateComponent, generateDashboardWidget, generateEmbedSnippet, generateArtifactSpec, generateComponentLibrary } from "./generators-artifacts.js";
export { generateRemotionScript, generateScenePlan, generateRenderConfig, generateAssetChecklist, generateStoryboard } from "./generators-remotion.js";
export { generateCanvasSpec, generateSocialPack, generatePosterLayouts, generateCanvasAssetGuidelines, generateBrandBoard } from "./generators-canvas.js";
export { generateGenerativeSketch, generateParameterPack, generateCollectionMap, generateExportManifest, generateVariationMatrix } from "./generators-algorithmic.js";

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
export type { QuotaCheck, SystemStats, AccountSummary, RecentActivity } from "./billing-store.js";
export { TIER_LIMITS, ALL_PROGRAMS, PERSISTENCE_CREDIT_COSTS, PERSISTENCE_CREDIT_PACKS, PERSISTENCE_MIN_TIER, SUITE_MONTHLY_PERSISTENCE_CREDITS } from "./billing-types.js";
export {
... (151 more lines)
```

## Configuration Files

### `apps/api/package.json`

```json
{
  "name": "@axis/api",
  "version": "0.4.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "node --test dist/**/*.test.js"
  },
  "dependencies": {
    "@axis/context-engine": "workspace:*",
    "@axis/generator-core": "workspace:*",
    "@axis/repo-parser": "workspace:*",
    "@axis/snapshots": "workspace:*"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^22.0.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.7.0"
  }
}

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
  "version": "0.4.0",
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
  "version": "0.4.0",
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
    "vite": "^6.3.5"
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
  "include": ["src"]
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

### `package.json`

```json
{
  "name": "axis-toolbox",
  "version": "0.4.0",
  "private": true,
  "description": "Axis — The operating system for AI-native development",
  "scripts": {
    "dev": "pnpm --filter @axis/api dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  },
  "engines": {
    "node": ">=20"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^4.1.2",
    "vitest": "^4.1.2"
  }
}

```

### `packages/context-engine/package.json`

```json
{
  "name": "@axis/context-engine",
  "version": "0.4.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "node --test dist/**/*.test.js"
  },
  "dependencies": {
    "@axis/snapshots": "workspace:*",
    "@axis/repo-parser": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}

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
  "version": "0.4.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "@axis/snapshots": "workspace:*",
    "@axis/repo-parser": "workspace:*",
    "@axis/context-engine": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}

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

### `packages/repo-parser/package.json`

```json
{
  "name": "@axis/repo-parser",
  "version": "0.4.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "node --test dist/**/*.test.js"
  },
  "dependencies": {
    "@axis/snapshots": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}

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

### `packages/snapshots/package.json`

```json
{
  "name": "@axis/snapshots",
  "version": "0.4.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "echo skipped — run vitest from root"
  },
  "dependencies": {
    "better-sqlite3": "^12.8.0",
    "uuid": "^11.1.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  }
}

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
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.bench.ts",
        "**/*.d.ts",
        "**/node_modules/**",
        "**/dist/**",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});

```

---
*Generated by Axis Search — 2026-04-11*
