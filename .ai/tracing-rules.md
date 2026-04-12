# Tracing Rules — axis-toolbox

## Purpose

Define which code paths should be traced, logged, or monitored in this monorepo (TypeScript).

## Stack

- React ^19.1.0 (95%)

## Trace Points

### API Routes

All API routes should log: request method, path, status code, duration (ms).

| Method | Path | Source | Trace Priority |
|--------|------|--------|----------------|
| GET | `/v1/health` | apps/api/src/admin.test.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/admin.test.ts | NORMAL |
| POST | `/v1/snapshots` | apps/api/src/admin.test.ts | NORMAL |
| GET | `/v1/admin/stats` | apps/api/src/admin.test.ts | NORMAL |
| GET | `/v1/admin/accounts` | apps/api/src/admin.test.ts | NORMAL |
| GET | `/v1/admin/activity` | apps/api/src/admin.test.ts | NORMAL |
| POST | `/v1/snapshots` | apps/api/src/api-branches.test.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/api-branches.test.ts | NORMAL |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/api-branches.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/context` | apps/api/src/api-branches.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/api-branches.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/generated-files/:file_path` | apps/api/src/api-branches.test.ts | NORMAL |
| DELETE | `/v1/projects/:project_id` | apps/api/src/api-branches.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/api-branches.test.ts | NORMAL |
| GET | `/v1/db/stats` | apps/api/src/api-branches.test.ts | NORMAL |
| POST | `/v1/db/maintenance` | apps/api/src/api-branches.test.ts | NORMAL |
| POST | `/v1/search/index` | apps/api/src/api-branches.test.ts | NORMAL |
| POST | `/v1/search/query` | apps/api/src/api-branches.test.ts | NORMAL |
| GET | `/v1/search/:snapshot_id/stats` | apps/api/src/api-branches.test.ts | NORMAL |
| POST | `/v1/debug/analyze` | apps/api/src/api-branches.test.ts | NORMAL |
| GET | `/v1/docs` | apps/api/src/api-branches.test.ts | NORMAL |
| GET | `/v1/programs` | apps/api/src/api-branches.test.ts | NORMAL |
| POST | `/v1/account/seats` | apps/api/src/api-branches.test.ts | NORMAL |
| GET | `/v1/account/seats` | apps/api/src/api-branches.test.ts | NORMAL |
| POST | `/v1/account/seats/:seat_id/accept` | apps/api/src/api-branches.test.ts | NORMAL |
| POST | `/v1/account/seats/:seat_id/revoke` | apps/api/src/api-branches.test.ts | NORMAL |
| GET | `/v1/account/upgrade-prompt` | apps/api/src/api-branches.test.ts | NORMAL |
| POST | `/v1/account/upgrade-prompt/dismiss` | apps/api/src/api-branches.test.ts | NORMAL |
| GET | `/v1/account/funnel` | apps/api/src/api-branches.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/api-layer5.test.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/api-layer5.test.ts | NORMAL |
| POST | `/v1/account/webhooks` | apps/api/src/api-layer5.test.ts | NORMAL |
| GET | `/v1/account/webhooks` | apps/api/src/api-layer5.test.ts | NORMAL |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/api-layer5.test.ts | NORMAL |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/api-layer5.test.ts | NORMAL |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/api-layer5.test.ts | NORMAL |
| POST | `/v1/search/query` | apps/api/src/api-layer5.test.ts | NORMAL |
| POST | `/v1/account/programs` | apps/api/src/api-layer5.test.ts | NORMAL |
| POST | `/v1/account/github-token` | apps/api/src/api-layer5.test.ts | NORMAL |
| POST | `/v1/account/seats` | apps/api/src/api-layer5.test.ts | NORMAL |
| GET | `/v1/admin/stats` | apps/api/src/api-layer5.test.ts | NORMAL |
| GET | `/v1/admin/accounts` | apps/api/src/api-layer5.test.ts | NORMAL |
| GET | `/v1/admin/activity` | apps/api/src/api-layer5.test.ts | NORMAL |
| GET | `/health` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/snapshots` | apps/api/src/api.test.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/api.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/context` | apps/api/src/api.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/api.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/generated-files/:file_path` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/search/export` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/skills/generate` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/debug/analyze` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/frontend/audit` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/seo/analyze` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/optimization/analyze` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/theme/generate` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/brand/generate` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/superpowers/generate` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/marketing/generate` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/notebook/generate` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/obsidian/analyze` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/mcp/provision` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/artifacts/generate` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/remotion/generate` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/canvas/generate` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/algorithmic/generate` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/github/analyze` | apps/api/src/api.test.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/b-grade-upgrade.test.ts | NORMAL |
| POST | `/v1/account/tier` | apps/api/src/b-grade-upgrade.test.ts | NORMAL |
| POST | `/v1/account/github-token` | apps/api/src/b-grade-upgrade.test.ts | NORMAL |
| GET | `/v1/account/github-token` | apps/api/src/b-grade-upgrade.test.ts | NORMAL |
| DELETE | `/v1/account/github-token/:token_id` | apps/api/src/b-grade-upgrade.test.ts | NORMAL |
| GET | `/v1/billing/history` | apps/api/src/b-grade-upgrade.test.ts | NORMAL |
| GET | `/v1/billing/proration` | apps/api/src/b-grade-upgrade.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/billing-flow.test.ts | NORMAL |
| POST | `/v1/snapshots` | apps/api/src/billing-flow.test.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/billing-flow.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/context` | apps/api/src/billing-flow.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/billing-flow.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/generated-files/:file_path*` | apps/api/src/billing-flow.test.ts | NORMAL |
| POST | `/v1/search/export` | apps/api/src/billing-flow.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/export` | apps/api/src/billing-flow.test.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/billing-flow.test.ts | NORMAL |
| GET | `/v1/account` | apps/api/src/billing-flow.test.ts | NORMAL |
| POST | `/v1/account/keys` | apps/api/src/billing-flow.test.ts | NORMAL |
| GET | `/v1/account/keys` | apps/api/src/billing-flow.test.ts | NORMAL |
| POST | `/v1/account/keys/:key_id/revoke` | apps/api/src/billing-flow.test.ts | NORMAL |
| GET | `/v1/account/usage` | apps/api/src/billing-flow.test.ts | NORMAL |
| POST | `/v1/account/tier` | apps/api/src/billing-flow.test.ts | NORMAL |
| POST | `/v1/account/programs` | apps/api/src/billing-flow.test.ts | NORMAL |
| GET | `/v1/account/credits` | apps/api/src/billing-flow.test.ts | NORMAL |
| GET | `/v1/plans` | apps/api/src/billing-flow.test.ts | NORMAL |
| POST | `/v1/account/seats` | apps/api/src/billing-flow.test.ts | NORMAL |
| GET | `/v1/account/seats` | apps/api/src/billing-flow.test.ts | NORMAL |
| POST | `/v1/account/seats/:seat_id/accept` | apps/api/src/billing-flow.test.ts | NORMAL |
| POST | `/v1/account/seats/:seat_id/revoke` | apps/api/src/billing-flow.test.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/checkout-email.test.ts | NORMAL |
| POST | `/v1/account/seats` | apps/api/src/checkout-email.test.ts | NORMAL |
| GET | `/v1/account/seats` | apps/api/src/checkout-email.test.ts | NORMAL |
| GET | `/v1/plans` | apps/api/src/checkout-email.test.ts | NORMAL |
| POST | `/v1/webhooks/stripe` | apps/api/src/checkout-email.test.ts | NORMAL |
| POST | `/v1/checkout` | apps/api/src/checkout-email.test.ts | NORMAL |
| GET | `/v1/account/subscription` | apps/api/src/checkout-email.test.ts | NORMAL |
| POST | `/v1/account/subscription/cancel` | apps/api/src/checkout-email.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/crash-resilience.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/crash-resilience.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/credits-api.test.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/credits-api.test.ts | NORMAL |
| GET | `/v1/account` | apps/api/src/credits-api.test.ts | NORMAL |
| POST | `/v1/account/keys` | apps/api/src/credits-api.test.ts | NORMAL |
| POST | `/v1/account/tier` | apps/api/src/credits-api.test.ts | NORMAL |
| GET | `/v1/account/credits` | apps/api/src/credits-api.test.ts | NORMAL |
| POST | `/v1/account/credits` | apps/api/src/credits-api.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/db-endpoints.test.ts | NORMAL |
| GET | `/v1/db/stats` | apps/api/src/db-endpoints.test.ts | NORMAL |
| POST | `/v1/db/maintenance` | apps/api/src/db-endpoints.test.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/deletion.test.ts | NORMAL |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/deletion.test.ts | NORMAL |
| DELETE | `/v1/projects/:project_id` | apps/api/src/deletion.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/health/live` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/health/ready` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/metrics` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/db/stats` | apps/api/src/e2e-flows.test.ts | NORMAL |
| POST | `/v1/db/maintenance` | apps/api/src/e2e-flows.test.ts | NORMAL |
| POST | `/v1/snapshots` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/e2e-flows.test.ts | NORMAL |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id/versions` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id/versions/:version_number` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id/diff` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/context` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/generated-files/:file_path` | apps/api/src/e2e-flows.test.ts | NORMAL |
| DELETE | `/v1/projects/:project_id` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/export` | apps/api/src/e2e-flows.test.ts | NORMAL |
| POST | `/v1/search/export` | apps/api/src/e2e-flows.test.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/account` | apps/api/src/e2e-flows.test.ts | NORMAL |
| POST | `/v1/account/keys` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/account/keys` | apps/api/src/e2e-flows.test.ts | NORMAL |
| POST | `/v1/account/keys/:key_id/revoke` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/account/usage` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/account/quota` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/admin/stats` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/admin/accounts` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/admin/activity` | apps/api/src/e2e-flows.test.ts | NORMAL |
| POST | `/v1/account/webhooks` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/account/webhooks` | apps/api/src/e2e-flows.test.ts | NORMAL |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/e2e-flows.test.ts | NORMAL |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/e2e-flows.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/export` | apps/api/src/export-edge-cases.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/export` | apps/api/src/export.test.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/funnel-api.test.ts | NORMAL |
| GET | `/v1/account` | apps/api/src/funnel-api.test.ts | NORMAL |
| POST | `/v1/account/keys` | apps/api/src/funnel-api.test.ts | NORMAL |
| POST | `/v1/account/tier` | apps/api/src/funnel-api.test.ts | NORMAL |
| GET | `/v1/plans` | apps/api/src/funnel-api.test.ts | NORMAL |
| POST | `/v1/account/seats` | apps/api/src/funnel-api.test.ts | NORMAL |
| GET | `/v1/account/seats` | apps/api/src/funnel-api.test.ts | NORMAL |
| POST | `/v1/account/seats/:seat_id/accept` | apps/api/src/funnel-api.test.ts | NORMAL |
| POST | `/v1/account/seats/:seat_id/revoke` | apps/api/src/funnel-api.test.ts | NORMAL |
| GET | `/v1/account/upgrade-prompt` | apps/api/src/funnel-api.test.ts | NORMAL |
| POST | `/v1/account/upgrade-prompt/dismiss` | apps/api/src/funnel-api.test.ts | NORMAL |
| GET | `/v1/account/funnel` | apps/api/src/funnel-api.test.ts | NORMAL |
| GET | `/v1/funnel/metrics` | apps/api/src/funnel-api.test.ts | NORMAL |
| POST | `/v1/snapshots` | apps/api/src/handler-edge-cases.test.ts | NORMAL |
| GET | `/health` | apps/api/src/handler-edge-cases.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/context` | apps/api/src/handler-edge-cases.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/handler-edge-cases.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/generated-files/:file_path` | apps/api/src/handler-edge-cases.test.ts | NORMAL |
| POST | `/v1/debug/analyze` | apps/api/src/handler-edge-cases.test.ts | NORMAL |
| POST | `/v1/snapshots` | apps/api/src/handler-validation.test.ts | NORMAL |
| POST | `/v1/debug/analyze` | apps/api/src/handler-validation.test.ts | NORMAL |
| POST | `/v1/snapshots` | apps/api/src/handlers-deep.test.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/handlers-deep.test.ts | NORMAL |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/handlers-deep.test.ts | NORMAL |
| DELETE | `/v1/projects/:project_id` | apps/api/src/handlers-deep.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/generated-files/:file_path` | apps/api/src/handlers-deep.test.ts | NORMAL |
| POST | `/v1/search/export` | apps/api/src/handlers-deep.test.ts | NORMAL |
| POST | `/v1/skills/generate` | apps/api/src/handlers-deep.test.ts | NORMAL |
| POST | `/v1/github/analyze` | apps/api/src/handlers-deep.test.ts | NORMAL |
| POST | `/v1/debug/analyze` | apps/api/src/handlers-deep.test.ts | NORMAL |
| GET | `/v1/health/live` | apps/api/src/latency-histogram.test.ts | NORMAL |
| GET | `/v1/metrics` | apps/api/src/latency-histogram.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/logging.test.ts | NORMAL |
| POST | `/v1/snapshots` | apps/api/src/logging.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/metrics.test.ts | NORMAL |
| GET | `/v1/health/live` | apps/api/src/metrics.test.ts | NORMAL |
| GET | `/v1/health/ready` | apps/api/src/metrics.test.ts | NORMAL |
| GET | `/v1/metrics` | apps/api/src/metrics.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| POST | `/v1/snapshots` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| DELETE | `/v1/projects/:project_id` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/context` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/generated-files/:file_path*` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| GET | `/v1/projects/:project_id/export` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| POST | `/v1/search/index` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| POST | `/v1/search/query` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| GET | `/v1/search/:snapshot_id/stats` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| GET | `/v1/account` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| POST | `/v1/account/keys` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| GET | `/v1/account/keys` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| POST | `/v1/account/keys/:key_id/revoke` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| GET | `/v1/account/usage` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| POST | `/v1/account/tier` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| POST | `/v1/account/programs` | apps/api/src/multi-tenancy.test.ts | NORMAL |
| GET | `/v1/auth/github` | apps/api/src/oauth.test.ts | HIGH |
| GET | `/v1/auth/github/callback` | apps/api/src/oauth.test.ts | HIGH |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts | NORMAL |
| GET | `/v1/programs` | apps/api/src/programs-billing.test.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/programs-billing.test.ts | NORMAL |
| GET | `/v1/account` | apps/api/src/programs-billing.test.ts | NORMAL |
| POST | `/v1/account/keys` | apps/api/src/programs-billing.test.ts | NORMAL |
| GET | `/v1/account/usage` | apps/api/src/programs-billing.test.ts | NORMAL |
| POST | `/v1/account/tier` | apps/api/src/programs-billing.test.ts | NORMAL |
| POST | `/v1/account/programs` | apps/api/src/programs-billing.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/quota.test.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/quota.test.ts | NORMAL |
| GET | `/v1/account/quota` | apps/api/src/quota.test.ts | NORMAL |
| GET | `/v1/test/fast` | apps/api/src/request-limits.test.ts | NORMAL |
| GET | `/v1/test/slow` | apps/api/src/request-limits.test.ts | NORMAL |
| GET | `/slow` | apps/api/src/router-branches.test.ts | NORMAL |
| GET | `/throw-string` | apps/api/src/router-branches.test.ts | NORMAL |
| GET | `/throw-after-end` | apps/api/src/router-branches.test.ts | NORMAL |
| GET | `/null-error` | apps/api/src/router-branches.test.ts | NORMAL |
| GET | `/array-error` | apps/api/src/router-branches.test.ts | NORMAL |
| GET | `/ok` | apps/api/src/router-branches.test.ts | NORMAL |
| GET | `/manual-500` | apps/api/src/router-branches.test.ts | NORMAL |
| GET | `/manual-422` | apps/api/src/router-branches.test.ts | NORMAL |
| GET | `/health` | apps/api/src/router-branches.test.ts | NORMAL |
| GET | `/up` | apps/api/src/router-branches.test.ts | NORMAL |
| GET | `/echo` | apps/api/src/router.test.ts | NORMAL |
| POST | `/echo` | apps/api/src/router.test.ts | NORMAL |
| GET | `/items/:id` | apps/api/src/router.test.ts | NORMAL |
| GET | `/users/:userId/posts/:postId` | apps/api/src/router.test.ts | NORMAL |
| GET | `/files/:path*` | apps/api/src/router.test.ts | NORMAL |
| GET | `/throws` | apps/api/src/router.test.ts | NORMAL |
| POST | `/status/:code` | apps/api/src/router.test.ts | NORMAL |
| GET | `/error-shape` | apps/api/src/router.test.ts | NORMAL |
| GET | `/` | apps/api/src/router.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/security.test.ts | NORMAL |
| POST | `/v1/snapshots` | apps/api/src/security.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/server-lifecycle.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/server-lifecycle.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/health/live` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/health/ready` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/metrics` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/db/stats` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/db/maintenance` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/docs` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/snapshots` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/server.ts | NORMAL |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id/versions` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id/versions/:version_number` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id/diff` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/projects/:project_id/context` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/projects/:project_id/generated-files/:file_path*` | apps/api/src/server.ts | NORMAL |
| DELETE | `/v1/projects/:project_id` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/search/export` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/skills/generate` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/debug/analyze` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/frontend/audit` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/seo/analyze` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/optimization/analyze` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/theme/generate` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/brand/generate` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/superpowers/generate` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/marketing/generate` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/notebook/generate` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/obsidian/analyze` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/mcp/provision` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/artifacts/generate` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/remotion/generate` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/canvas/generate` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/algorithmic/generate` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/github/analyze` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/search/index` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/search/query` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/search/:snapshot_id/stats` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/search/:snapshot_id/symbols` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/projects/:project_id/export` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/programs` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/keys` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account/keys` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/keys/:key_id/revoke` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account/usage` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account/quota` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/tier` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/programs` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/github-token` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account/github-token` | apps/api/src/server.ts | NORMAL |
| DELETE | `/v1/account/github-token/:token_id` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/billing/history` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/billing/proration` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account/credits` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/credits` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/plans` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/seats` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account/seats` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/seats/:seat_id/accept` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/seats/:seat_id/revoke` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account/upgrade-prompt` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/upgrade-prompt/dismiss` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account/funnel` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/funnel/metrics` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/admin/stats` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/admin/accounts` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/admin/activity` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/auth/github` | apps/api/src/server.ts | HIGH |
| GET | `/v1/auth/github/callback` | apps/api/src/server.ts | HIGH |
| POST | `/v1/account/webhooks` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account/webhooks` | apps/api/src/server.ts | NORMAL |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/webhooks/stripe` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/checkout` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account/subscription` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/subscription/cancel` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/snapshots` | apps/api/src/snapshot-auth.test.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/snapshot-auth.test.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/snapshot-auth.test.ts | NORMAL |
| POST | `/v1/account/tier` | apps/api/src/snapshot-auth.test.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/stripe-branches.test.ts | NORMAL |
| POST | `/v1/webhooks/stripe` | apps/api/src/stripe-branches.test.ts | NORMAL |
| POST | `/v1/checkout` | apps/api/src/stripe-branches.test.ts | NORMAL |
| GET | `/v1/account/subscription` | apps/api/src/stripe-branches.test.ts | NORMAL |
| POST | `/v1/account/subscription/cancel` | apps/api/src/stripe-branches.test.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/stripe.test.ts | NORMAL |
| POST | `/v1/webhooks/stripe` | apps/api/src/stripe.test.ts | NORMAL |
| GET | `/v1/account/subscription` | apps/api/src/stripe.test.ts | NORMAL |
| POST | `/v1/snapshots` | apps/api/src/validation.test.ts | NORMAL |
| POST | `/v1/search/export` | apps/api/src/validation.test.ts | NORMAL |
| POST | `/v1/skills/generate` | apps/api/src/validation.test.ts | NORMAL |
| POST | `/v1/debug/analyze` | apps/api/src/validation.test.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/validation.test.ts | NORMAL |
| POST | `/v1/account/tier` | apps/api/src/validation.test.ts | NORMAL |
| POST | `/v1/account/programs` | apps/api/src/validation.test.ts | NORMAL |
| POST | `/v1/account/seats` | apps/api/src/validation.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/versions.test.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id/versions` | apps/api/src/versions.test.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id/versions/:version_number` | apps/api/src/versions.test.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id/diff` | apps/api/src/versions.test.ts | NORMAL |
| POST | `/v1/account/webhooks` | apps/api/src/webhook-branches.test.ts | NORMAL |
| GET | `/v1/account/webhooks` | apps/api/src/webhook-branches.test.ts | NORMAL |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/webhook-branches.test.ts | NORMAL |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/webhook-branches.test.ts | NORMAL |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/webhook-branches.test.ts | NORMAL |
| GET | `/v1/health` | apps/api/src/webhooks.test.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/webhooks.test.ts | NORMAL |
| POST | `/v1/account/webhooks` | apps/api/src/webhooks.test.ts | NORMAL |
| GET | `/v1/account/webhooks` | apps/api/src/webhooks.test.ts | NORMAL |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/webhooks.test.ts | NORMAL |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/webhooks.test.ts | NORMAL |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/webhooks.test.ts | NORMAL |
| GET | `/health` | e2e_ui_audit.yaml | NORMAL |
| GET | `/v1/health` | e2e_ui_audit.yaml | NORMAL |
| GET | `/api/health` | packages/context-engine/src/engine-branches.test.ts | NORMAL |
| POST | `/api/users` | packages/context-engine/src/engine-branches.test.ts | NORMAL |
| GET | `/api/users` | packages/context-engine/src/engine-edge.test.ts | NORMAL |
| POST | `/api/users` | packages/context-engine/src/engine-edge.test.ts | NORMAL |
| DELETE | `/api/users/:id` | packages/context-engine/src/engine-edge.test.ts | NORMAL |
| GET | `/api/health` | packages/generator-core/src/generator-branches.test.ts | NORMAL |
| GET | `/api/users` | packages/generator-core/src/generator-branches.test.ts | NORMAL |
| POST | `/api/users` | packages/generator-core/src/generator-branches.test.ts | NORMAL |
| GET | `/` | packages/generator-core/src/generator-branches.test.ts | NORMAL |
| GET | `/health` | packages/generator-core/src/generator-sourcefile-branches.test.ts | NORMAL |
| GET | `/api/health` | packages/generator-core/src/generator-sourcefile-branches6.test.ts | NORMAL |
| GET | `/users/:id` | packages/repo-parser/src/perf.bench.ts | NORMAL |
| POST | `/users` | packages/repo-parser/src/perf.bench.ts | NORMAL |

### Domain Model Watch List

State transitions on these entities should be logged:

- `AuthContext` (interface, 3 fields) — `apps/api/src/billing.ts`
- `EnvSpec` (interface, 5 fields) — `apps/api/src/env.ts`
- `ValidationError` (interface, 2 fields) — `apps/api/src/env.ts`
- `ValidationResult` (interface, 3 fields) — `apps/api/src/env.ts`
- `ZipEntry` (interface, 4 fields) — `apps/api/src/export.ts`
- `HistogramEntry` (interface, 3 fields) — `apps/api/src/metrics.ts`
- `OpenApiSpec` (interface, 6 fields) — `apps/api/src/openapi.ts`
- `WindowEntry` (interface, 2 fields) — `apps/api/src/rate-limiter.ts`
- `AppHandle` (interface, 3 fields) — `apps/api/src/router.ts`
- `Route` (interface, 4 fields) — `apps/api/src/router.ts`
- `CliArgs` (interface, 5 fields) — `apps/cli/src/cli.ts`
- `AxisConfig` (interface, 2 fields) — `apps/cli/src/credential-store.ts`
- `RunResult` (interface, 4 fields) — `apps/cli/src/runner.ts`
- `ScanResult` (interface, 3 fields) — `apps/cli/src/scanner.ts`
- `WriteResult` (interface, 3 fields) — `apps/cli/src/writer.ts`
- `Account` (interface, 5 fields) — `apps/web/src/api.ts`
- `ApiKeyInfo` (interface, 5 fields) — `apps/web/src/api.ts`
- `ContextMap` (interface, 8 fields) — `apps/web/src/api.ts`
- `GeneratedFile` (interface, 5 fields) — `apps/web/src/api.ts`
- `GeneratedFilesResponse` (interface, 6 fields) — `apps/web/src/api.ts`
- `PlanDefinition` (interface, 6 fields) — `apps/web/src/api.ts`
- `PlanFeature` (interface, 4 fields) — `apps/web/src/api.ts`
- `RepoProfile` (interface, 4 fields) — `apps/web/src/api.ts`
- `SearchResponse` (interface, 5 fields) — `apps/web/src/api.ts`
- `SearchResult` (interface, 4 fields) — `apps/web/src/api.ts`
- `Seat` (interface, 7 fields) — `apps/web/src/api.ts`
- `SnapshotPayload` (interface, 6 fields) — `apps/web/src/api.ts`
- `SnapshotResponse` (interface, 8 fields) — `apps/web/src/api.ts`
- `SubscriptionInfo` (interface, 11 fields) — `apps/web/src/api.ts`
- `SymbolResult` (interface, 5 fields) — `apps/web/src/api.ts`
- `SymbolsResponse` (interface, 3 fields) — `apps/web/src/api.ts`
- `UpgradePrompt` (interface, 9 fields) — `apps/web/src/api.ts`
- `UsageSummary` (interface, 5 fields) — `apps/web/src/api.ts`
- `IconProps` (interface, 5 fields) — `apps/web/src/components/AxisIcons.tsx`
- `PaletteAction` (interface, 6 fields) — `apps/web/src/components/CommandPalette.tsx`
- `Props` (interface, 1 fields) — `apps/web/src/components/CommandPalette.tsx`
- `Props` (interface, 1 fields) — `apps/web/src/components/FilesTab.tsx`
- `Props` (interface, 2 fields) — `apps/web/src/components/GeneratedTab.tsx`
- `Props` (interface, 1 fields) — `apps/web/src/components/GraphTab.tsx`
- `Props` (interface, 2 fields) — `apps/web/src/components/OverviewTab.tsx`
- `ProgramDef` (interface, 5 fields) — `apps/web/src/components/ProgramLauncher.tsx`
- `Props` (interface, 3 fields) — `apps/web/src/components/ProgramLauncher.tsx`
- `Props` (interface, 1 fields) — `apps/web/src/components/SearchTab.tsx`
- `Props` (interface, 3 fields) — `apps/web/src/components/SignUpModal.tsx`
- `Props` (interface, 2 fields) — `apps/web/src/components/StatusBar.tsx`
- `Toast` (interface, 4 fields) — `apps/web/src/components/Toast.tsx`
- `ToastContextValue` (interface, 1 fields) — `apps/web/src/components/Toast.tsx`
- `Props` (interface, 2 fields) — `apps/web/src/pages/DashboardPage.tsx`
- `ProgramDoc` (interface, 13 fields) — `apps/web/src/pages/DocsPage.tsx`
- `Step` (interface, 4 fields) — `apps/web/src/pages/HelpPage.tsx`
- `TroubleshootItem` (interface, 2 fields) — `apps/web/src/pages/HelpPage.tsx`
- `Props` (interface, 2 fields) — `apps/web/src/pages/PlansPage.tsx`
- `ProgramDef` (interface, 7 fields) — `apps/web/src/pages/ProgramsPage.tsx`
- `Props` (interface, 1 fields) — `apps/web/src/pages/ProgramsPage.tsx`
- `QAItem` (interface, 3 fields) — `apps/web/src/pages/QAPage.tsx`
- `Section` (interface, 2 fields) — `apps/web/src/pages/TermsPage.tsx`
- `Props` (interface, 1 fields) — `apps/web/src/pages/UploadPage.tsx`
- `ImportMeta` (interface, 1 fields) — `apps/web/src/vite-env.d.ts`
- `ImportMetaEnv` (interface, 1 fields) — `apps/web/src/vite-env.d.ts`
- `ContextMap` (interface, 10 fields) — `packages/context-engine/src/types.ts`
- `RepoProfile` (interface, 12 fields) — `packages/context-engine/src/types.ts`
- `Edge` (interface, 3 fields) — `packages/generator-core/src/generators-algorithmic.ts`
- `Node` (interface, 7 fields) — `packages/generator-core/src/generators-algorithmic.ts`
- `DashboardData` (interface, 6 fields) — `packages/generator-core/src/generators-artifacts.ts`
- `MyComponentProps` (interface, 2 fields) — `packages/generator-core/src/generators-frontend.ts`
- `RemotionTheme` (interface, 4 fields) — `packages/generator-core/src/generators-remotion.ts`
- `GeneratedFile` (interface, 5 fields) — `packages/generator-core/src/types.ts`
- `GeneratorInput` (interface, 4 fields) — `packages/generator-core/src/types.ts`
- `GeneratorResult` (interface, 6 fields) — `packages/generator-core/src/types.ts`
- `SourceFile` (interface, 3 fields) — `packages/generator-core/src/types.ts`
- `DomainModel` (interface, 5 fields) — `packages/repo-parser/src/domain-extractor.ts`
- `FrameworkRule` (interface, 4 fields) — `packages/repo-parser/src/framework-detector.ts`
- `DepGroups` (interface, 3 fields) — `packages/repo-parser/src/parser.ts`
- `CreateUserRequest` (interface, 3 fields) — `packages/repo-parser/src/perf.bench.ts`
- `SQLTable` (interface, 5 fields) — `packages/repo-parser/src/sql-extractor.ts`
- `DependencyInfo` (interface, 3 fields) — `packages/repo-parser/src/types.ts`
- `FileAnnotation` (interface, 5 fields) — `packages/repo-parser/src/types.ts`
- `FrameworkDetection` (interface, 4 fields) — `packages/repo-parser/src/types.ts`
- `ImportEdge` (interface, 2 fields) — `packages/repo-parser/src/types.ts`
- `LanguageStats` (interface, 4 fields) — `packages/repo-parser/src/types.ts`
- `ParseResult` (interface, 13 fields) — `packages/repo-parser/src/types.ts`
- `AccountSummary` (interface, 7 fields) — `packages/snapshots/src/billing-store.ts`
- `QuotaCheck` (interface, 6 fields) — `packages/snapshots/src/billing-store.ts`
- `RecentActivity` (interface, 5 fields) — `packages/snapshots/src/billing-store.ts`
- `SystemStats` (interface, 7 fields) — `packages/snapshots/src/billing-store.ts`
- `Account` (interface, 5 fields) — `packages/snapshots/src/billing-types.ts`
- `ApiKey` (interface, 6 fields) — `packages/snapshots/src/billing-types.ts`
- `PersistenceCreditRecord` (interface, 7 fields) — `packages/snapshots/src/billing-types.ts`
- `ProgramEntitlement` (interface, 3 fields) — `packages/snapshots/src/billing-types.ts`
- `TierLimits` (interface, 5 fields) — `packages/snapshots/src/billing-types.ts`
- `UsageRecord` (interface, 8 fields) — `packages/snapshots/src/billing-types.ts`
- `UsageSummary` (interface, 5 fields) — `packages/snapshots/src/billing-types.ts`
- `DbMaintenanceResult` (interface, 3 fields) — `packages/snapshots/src/db.ts`
- `Migration` (interface, 3 fields) — `packages/snapshots/src/db.ts`
- `EmailDelivery` (interface, 10 fields) — `packages/snapshots/src/email-store.ts`
- `EmailMessage` (interface, 4 fields) — `packages/snapshots/src/email-store.ts`
- `FunnelMetrics` (interface, 8 fields) — `packages/snapshots/src/funnel-store.ts`
- `FunnelEvent` (interface, 6 fields) — `packages/snapshots/src/funnel-types.ts`
- `PlanDefinition` (interface, 6 fields) — `packages/snapshots/src/funnel-types.ts`
- `PlanFeature` (interface, 4 fields) — `packages/snapshots/src/funnel-types.ts`
- `Seat` (interface, 8 fields) — `packages/snapshots/src/funnel-types.ts`
- `UpgradePrompt` (interface, 9 fields) — `packages/snapshots/src/funnel-types.ts`
- `GitHubToken` (interface, 10 fields) — `packages/snapshots/src/github-token-store.ts`
- `GitHubFetchResult` (interface, 6 fields) — `packages/snapshots/src/github.ts`
- `ParsedGitHubUrl` (interface, 3 fields) — `packages/snapshots/src/github.ts`
- `TarParseResult` (interface, 3 fields) — `packages/snapshots/src/github.ts`
- `GitHubTokenResponse` (interface, 3 fields) — `packages/snapshots/src/oauth-store.ts`
- `GitHubUser` (interface, 4 fields) — `packages/snapshots/src/oauth-store.ts`
- `CodeSymbol` (interface, 6 fields) — `packages/snapshots/src/search-store.ts`
- `SearchIndexEntry` (interface, 3 fields) — `packages/snapshots/src/search-store.ts`
- `SearchResult` (interface, 4 fields) — `packages/snapshots/src/search-store.ts`
- `SymbolSearchResult` (interface, 5 fields) — `packages/snapshots/src/search-store.ts`
- `StripeSubscription` (interface, 12 fields) — `packages/snapshots/src/stripe-store.ts`
- `ProrationResult` (interface, 6 fields) — `packages/snapshots/src/tier-audit.ts`
- `TierChange` (interface, 8 fields) — `packages/snapshots/src/tier-audit.ts`
- `FileEntry` (interface, 3 fields) — `packages/snapshots/src/types.ts`
- `SnapshotInput` (interface, 4 fields) — `packages/snapshots/src/types.ts`
- `SnapshotManifest` (interface, 10 fields) — `packages/snapshots/src/types.ts`
- `SnapshotRecord` (interface, 10 fields) — `packages/snapshots/src/types.ts`
- `FileDiff` (interface, 4 fields) — `packages/snapshots/src/version-store.ts`
- `GenerationVersion` (interface, 7 fields) — `packages/snapshots/src/version-store.ts`
- `VersionDiff` (interface, 8 fields) — `packages/snapshots/src/version-store.ts`
- `VersionFile` (interface, 2 fields) — `packages/snapshots/src/version-store.ts`
- `VersionRow` (interface, 7 fields) — `packages/snapshots/src/version-store.ts`
- `RetryCandidate` (interface, 5 fields) — `packages/snapshots/src/webhook-store.ts`
- `Webhook` (interface, 8 fields) — `packages/snapshots/src/webhook-store.ts`
- `WebhookDelivery` (interface, 11 fields) — `packages/snapshots/src/webhook-store.ts`
- `WebhookRow` (interface, 8 fields) — `packages/snapshots/src/webhook-store.ts`
- `averypayplatformConfig` (interface, 2 fields) — `payment-processing-output/generated-component.tsx`
- `Edge` (interface, 3 fields) — `payment-processing-output/generative-sketch.ts`
- `Node` (interface, 7 fields) — `payment-processing-output/generative-sketch.ts`

### Hotspot Monitoring

These high-connectivity files should be monitored for regressions:

- `apps/web/src/api.ts` — 16 inbound, 0 outbound — watch for: import changes, export signature changes
- `apps/web/src/App.tsx` — 1 inbound, 14 outbound — watch for: import changes, export signature changes
- `apps/web/src/pages/DashboardPage.tsx` — 1 inbound, 9 outbound — watch for: import changes, export signature changes
- `apps/web/src/components/Toast.tsx` — 3 inbound, 0 outbound — watch for: import changes, export signature changes
- `apps/web/src/components/AxisIcons.tsx` — 3 inbound, 0 outbound — watch for: import changes, export signature changes
- `apps/web/src/upload-utils.ts` — 3 inbound, 0 outbound — watch for: import changes, export signature changes

### Layer Boundary Rules

Separation score: **0.64**/1.0

Monitor for layer violations:

- **presentation** (apps, frontend): Should not import from data layer directly

## Log Format

```
[TIMESTAMP] [LEVEL] [TRACE_ID] [COMPONENT] message
```

## Retention

- **Debug logs:** 7 days
- **Info logs:** 30 days
- **Error logs:** 90 days
- **Audit logs:** 1 year

---
*Generated by Axis Debug*

## Trace-Ready Entry Points

| Entry Point | Exports |
|-------------|---------|
| `apps/api/src/server.ts` | export const app = ... |
| `apps/web/src/App.tsx` | export function App() { ... } |
| `apps/web/src/main.tsx` | default |
| `packages/context-engine/src/index.ts` | export type { ... }, export { ... } |
| `packages/generator-core/src/index.ts` | export type { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... } |
| `packages/repo-parser/src/index.ts` | export type { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export type { ... }, export { ... }, export type { ... } |

## Entry Point Source

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
... (209 more lines)
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
... (261 more lines)
```

## Hotspot Files to Instrument

### `apps/web/src/api.ts`

```typescript
const API_BASE = import.meta.env.VITE_API_URL ?? "";

// ─── Snapshot types ─────────────────────────────────────────────

export interface SnapshotPayload {
  input_method: string;
  manifest: {
    project_name: string;
    project_type: string;
    frameworks: string[];
    goals: string[];
    requested_outputs: string[];
  };
  files: Array<{ path: string; content: string; size: number }>;
}

export interface SnapshotResponse {
  snapshot_id: string;
  project_id: string;
  status: string;
... (451 more lines)
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
... (266 more lines)
```

### `apps/web/src/pages/DashboardPage.tsx`

```tsx
import { useState, useEffect } from "react";
import type { SnapshotResponse, GeneratedFile } from "../api.ts";
import { getGeneratedFiles, runProgram, downloadExport } from "../api.ts";
import { OverviewTab } from "../components/OverviewTab.tsx";
import { FilesTab } from "../components/FilesTab.tsx";
import { GraphTab } from "../components/GraphTab.tsx";
import { GeneratedTab } from "../components/GeneratedTab.tsx";
import { ProgramLauncher } from "../components/ProgramLauncher.tsx";
import { SearchTab } from "../components/SearchTab.tsx";
import { useToast } from "../components/Toast.tsx";

interface Props {
  result: SnapshotResponse;
  onGeneratedCountChange?: (count: number) => void;
}

const TABS = ["Overview", "Structure", "Dependencies", "Generated Files", "Programs", "Search"] as const;
type Tab = (typeof TABS)[number];

export function DashboardPage({ result, onGeneratedCountChange }: Props) {
... (138 more lines)
```
