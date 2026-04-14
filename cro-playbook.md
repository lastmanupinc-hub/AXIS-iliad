# CRO Playbook — axis-toolbox

> Conversion Rate Optimization playbook based on detected routes and architecture

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 500 files across 20 top-level directories. It defines 152 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Core Conversion Events

| Event | Description | Priority |
|-------|------------|----------|
| First Install | User installs/clones for the first time | Critical |
| First Run | User runs the tool successfully | Critical |
| First Value | User generates useful output | High |
| Return Usage | User comes back within 7 days | High |
| Share/Recommend | User shares or recommends | Medium |
| Contribute | User opens issue or PR | Medium |

## Route Optimization Opportunities

Detected routes that are candidates for conversion optimization:

| Route | Method | CRO Action |
|-------|--------|-----------|
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/snapshots` | POST | Track API adoption rate per endpoint |
| `/v1/admin/stats` | GET | Track API adoption rate per endpoint |
| `/v1/admin/accounts` | GET | Track API adoption rate per endpoint |
| `/v1/admin/activity` | GET | Track API adoption rate per endpoint |
| `/llms.txt` | GET | Monitor usage metrics |
| `/.well-known/skills/index.json` | GET | Monitor usage metrics |
| `/v1/docs.md` | GET | Track API adoption rate per endpoint |
| `/.well-known/axis.json` | GET | Monitor usage metrics |
| `/for-agents` | GET | Monitor usage metrics |
| `/v1/install` | GET | Track API adoption rate per endpoint |
| `/v1/install/:platform` | GET | Track API adoption rate per endpoint |
| `/probe-intent` | POST | Monitor usage metrics |
| `/v1/analyze` | POST | Track API adoption rate per endpoint |
| `/.well-known/axis.json` | GET | Monitor usage metrics |
| `/v1/snapshots` | POST | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/context` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/generated-files` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/generated-files/:file_path` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/db/stats` | GET | Track API adoption rate per endpoint |
| `/v1/db/maintenance` | POST | Track API adoption rate per endpoint |
| `/v1/search/index` | POST | Track API adoption rate per endpoint |
| `/v1/search/query` | POST | Track API adoption rate per endpoint |
| `/v1/search/:snapshot_id/stats` | GET | Track API adoption rate per endpoint |
| `/v1/debug/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/docs` | GET | Track API adoption rate per endpoint |
| `/v1/programs` | GET | Track API adoption rate per endpoint |
| `/v1/account/seats` | POST | Track API adoption rate per endpoint |
| `/v1/account/seats` | GET | Track API adoption rate per endpoint |
| `/v1/account/seats/:seat_id/accept` | POST | Track API adoption rate per endpoint |
| `/v1/account/seats/:seat_id/revoke` | POST | Track API adoption rate per endpoint |
| `/v1/account/upgrade-prompt` | GET | Track API adoption rate per endpoint |
| `/v1/account/upgrade-prompt/dismiss` | POST | Track API adoption rate per endpoint |
| `/v1/account/funnel` | GET | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/account/webhooks` | POST | Track API adoption rate per endpoint |
| `/v1/account/webhooks` | GET | Track API adoption rate per endpoint |
| `/v1/account/webhooks/:webhook_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/account/webhooks/:webhook_id/toggle` | POST | Track API adoption rate per endpoint |
| `/v1/account/webhooks/:webhook_id/deliveries` | GET | Track API adoption rate per endpoint |
| `/v1/search/query` | POST | Track API adoption rate per endpoint |
| `/v1/account/programs` | POST | Track API adoption rate per endpoint |
| `/v1/account/github-token` | POST | Track API adoption rate per endpoint |
| `/v1/account/seats` | POST | Track API adoption rate per endpoint |
| `/v1/admin/stats` | GET | Track API adoption rate per endpoint |
| `/v1/admin/accounts` | GET | Track API adoption rate per endpoint |
| `/v1/admin/activity` | GET | Track API adoption rate per endpoint |
| `/health` | GET | Monitor usage metrics |
| `/v1/snapshots` | POST | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/context` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/generated-files` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/generated-files/:file_path` | GET | Track API adoption rate per endpoint |
| `/v1/search/export` | POST | Track API adoption rate per endpoint |
| `/v1/skills/generate` | POST | Track API adoption rate per endpoint |
| `/v1/debug/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/frontend/audit` | POST | Track API adoption rate per endpoint |
| `/v1/seo/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/optimization/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/theme/generate` | POST | Track API adoption rate per endpoint |
| `/v1/brand/generate` | POST | Track API adoption rate per endpoint |
| `/v1/superpowers/generate` | POST | Track API adoption rate per endpoint |
| `/v1/marketing/generate` | POST | Track API adoption rate per endpoint |
| `/v1/notebook/generate` | POST | Track API adoption rate per endpoint |
| `/v1/obsidian/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/mcp/provision` | POST | Track API adoption rate per endpoint |
| `/v1/artifacts/generate` | POST | Track API adoption rate per endpoint |
| `/v1/remotion/generate` | POST | Track API adoption rate per endpoint |
| `/v1/canvas/generate` | POST | Track API adoption rate per endpoint |
| `/v1/algorithmic/generate` | POST | Track API adoption rate per endpoint |
| `/v1/agentic-purchasing/generate` | POST | Track API adoption rate per endpoint |
| `/v1/github/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/account/tier` | POST | Track API adoption rate per endpoint |
| `/v1/account/github-token` | POST | Track API adoption rate per endpoint |
| `/v1/account/github-token` | GET | Track API adoption rate per endpoint |
| `/v1/account/github-token/:token_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/billing/history` | GET | Track API adoption rate per endpoint |
| `/v1/billing/proration` | GET | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots` | POST | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/context` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/generated-files` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/generated-files/:file_path*` | GET | Track API adoption rate per endpoint |
| `/v1/search/export` | POST | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/export` | GET | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/account` | GET | Track API adoption rate per endpoint |
| `/v1/account/keys` | POST | Track API adoption rate per endpoint |
| `/v1/account/keys` | GET | Track API adoption rate per endpoint |
| `/v1/account/keys/:key_id/revoke` | POST | Track API adoption rate per endpoint |
| `/v1/account/usage` | GET | Track API adoption rate per endpoint |
| `/v1/account/tier` | POST | Track API adoption rate per endpoint |
| `/v1/account/programs` | POST | Track API adoption rate per endpoint |
| `/v1/account/credits` | GET | Track API adoption rate per endpoint |
| `/v1/plans` | GET | Track API adoption rate per endpoint |
| `/v1/account/seats` | POST | Track API adoption rate per endpoint |
| `/v1/account/seats` | GET | Track API adoption rate per endpoint |
| `/v1/account/seats/:seat_id/accept` | POST | Track API adoption rate per endpoint |
| `/v1/account/seats/:seat_id/revoke` | POST | Track API adoption rate per endpoint |
| `/for-agents` | GET | Monitor usage metrics |
| `/probe-intent` | POST | Monitor usage metrics |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/account/seats` | POST | Track API adoption rate per endpoint |
| `/v1/account/seats` | GET | Track API adoption rate per endpoint |
| `/v1/plans` | GET | Track API adoption rate per endpoint |
| `/v1/webhooks/stripe` | POST | Track API adoption rate per endpoint |
| `/v1/checkout` | POST | Track API adoption rate per endpoint |
| `/v1/account/subscription` | GET | Track API adoption rate per endpoint |
| `/v1/account/subscription/cancel` | POST | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/account` | GET | Track API adoption rate per endpoint |
| `/v1/account/keys` | POST | Track API adoption rate per endpoint |
| `/v1/account/tier` | POST | Track API adoption rate per endpoint |
| `/v1/account/credits` | GET | Track API adoption rate per endpoint |
| `/v1/account/credits` | POST | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/db/stats` | GET | Track API adoption rate per endpoint |
| `/v1/db/maintenance` | POST | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/projects/:project_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/health/live` | GET | Track API adoption rate per endpoint |
| `/v1/health/ready` | GET | Track API adoption rate per endpoint |
| `/v1/metrics` | GET | Track API adoption rate per endpoint |
| `/v1/db/stats` | GET | Track API adoption rate per endpoint |
| `/v1/db/maintenance` | POST | Track API adoption rate per endpoint |
| `/v1/snapshots` | POST | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id/versions` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id/versions/:version_number` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id/diff` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/context` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/generated-files` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/generated-files/:file_path` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/export` | GET | Track API adoption rate per endpoint |
| `/v1/search/export` | POST | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/account` | GET | Track API adoption rate per endpoint |
| `/v1/account/keys` | POST | Track API adoption rate per endpoint |
| `/v1/account/keys` | GET | Track API adoption rate per endpoint |
| `/v1/account/keys/:key_id/revoke` | POST | Track API adoption rate per endpoint |
| `/v1/account/usage` | GET | Track API adoption rate per endpoint |
| `/v1/account/quota` | GET | Track API adoption rate per endpoint |
| `/v1/admin/stats` | GET | Track API adoption rate per endpoint |
| `/v1/admin/accounts` | GET | Track API adoption rate per endpoint |
| `/v1/admin/activity` | GET | Track API adoption rate per endpoint |
| `/v1/account/webhooks` | POST | Track API adoption rate per endpoint |
| `/v1/account/webhooks` | GET | Track API adoption rate per endpoint |
| `/v1/account/webhooks/:webhook_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/account/webhooks/:webhook_id/toggle` | POST | Track API adoption rate per endpoint |
| `/v1/account/webhooks/:webhook_id/deliveries` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/export` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/export` | GET | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/account` | GET | Track API adoption rate per endpoint |
| `/v1/account/keys` | POST | Track API adoption rate per endpoint |
| `/v1/account/tier` | POST | Track API adoption rate per endpoint |
| `/v1/plans` | GET | Track API adoption rate per endpoint |
| `/v1/account/seats` | POST | Track API adoption rate per endpoint |
| `/v1/account/seats` | GET | Track API adoption rate per endpoint |
| `/v1/account/seats/:seat_id/accept` | POST | Track API adoption rate per endpoint |
| `/v1/account/seats/:seat_id/revoke` | POST | Track API adoption rate per endpoint |
| `/v1/account/upgrade-prompt` | GET | Track API adoption rate per endpoint |
| `/v1/account/upgrade-prompt/dismiss` | POST | Track API adoption rate per endpoint |
| `/v1/account/funnel` | GET | Track API adoption rate per endpoint |
| `/v1/funnel/metrics` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots` | POST | Track API adoption rate per endpoint |
| `/health` | GET | Monitor usage metrics |
| `/v1/projects/:project_id/context` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/generated-files` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/generated-files/:file_path` | GET | Track API adoption rate per endpoint |
| `/v1/debug/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/snapshots` | POST | Track API adoption rate per endpoint |
| `/v1/debug/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/snapshots` | POST | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/projects/:project_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/generated-files/:file_path` | GET | Track API adoption rate per endpoint |
| `/v1/search/export` | POST | Track API adoption rate per endpoint |
| `/v1/skills/generate` | POST | Track API adoption rate per endpoint |
| `/v1/github/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/debug/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/health/live` | GET | Track API adoption rate per endpoint |
| `/v1/metrics` | GET | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots` | POST | Track API adoption rate per endpoint |
| `/mcp` | POST | Monitor usage metrics |
| `/mcp` | GET | Monitor usage metrics |
| `/v1/mcp/server.json` | GET | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/account/keys` | POST | Track API adoption rate per endpoint |
| `/v1/stats` | GET | Track API adoption rate per endpoint |
| `/ping` | GET | Monitor usage metrics |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/health/live` | GET | Track API adoption rate per endpoint |
| `/v1/health/ready` | GET | Track API adoption rate per endpoint |
| `/v1/metrics` | GET | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots` | POST | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/projects/:project_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/context` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/generated-files` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/generated-files/:file_path*` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/export` | GET | Track API adoption rate per endpoint |
| `/v1/search/index` | POST | Track API adoption rate per endpoint |
| `/v1/search/query` | POST | Track API adoption rate per endpoint |
| `/v1/search/:snapshot_id/stats` | GET | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/account` | GET | Track API adoption rate per endpoint |
| `/v1/account/keys` | POST | Track API adoption rate per endpoint |
| `/v1/account/keys` | GET | Track API adoption rate per endpoint |
| `/v1/account/keys/:key_id/revoke` | POST | Track API adoption rate per endpoint |
| `/v1/account/usage` | GET | Track API adoption rate per endpoint |
| `/v1/account/tier` | POST | Track API adoption rate per endpoint |
| `/v1/account/programs` | POST | Track API adoption rate per endpoint |
| `/v1/auth/github` | GET | Reduce friction — minimize required fields |
| `/v1/auth/github/callback` | GET | Reduce friction — minimize required fields |
| `/v1/prepare-for-agentic-purchasing` | POST | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/programs` | GET | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/account` | GET | Track API adoption rate per endpoint |
| `/v1/account/keys` | POST | Track API adoption rate per endpoint |
| `/v1/account/usage` | GET | Track API adoption rate per endpoint |
| `/v1/account/tier` | POST | Track API adoption rate per endpoint |
| `/v1/account/programs` | POST | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/account/quota` | GET | Track API adoption rate per endpoint |
| `/v1/test/fast` | GET | Track API adoption rate per endpoint |
| `/v1/test/slow` | GET | Track API adoption rate per endpoint |
| `/slow` | GET | Monitor usage metrics |
| `/throw-string` | GET | Monitor usage metrics |
| `/throw-after-end` | GET | Monitor usage metrics |
| `/null-error` | GET | Monitor usage metrics |
| `/array-error` | GET | Monitor usage metrics |
| `/ok` | GET | Monitor usage metrics |
| `/manual-500` | GET | Monitor usage metrics |
| `/manual-422` | GET | Monitor usage metrics |
| `/health` | GET | Monitor usage metrics |
| `/up` | GET | Monitor usage metrics |
| `/echo` | GET | Monitor usage metrics |
| `/echo` | POST | Monitor usage metrics |
| `/items/:id` | GET | Monitor usage metrics |
| `/users/:userId/posts/:postId` | GET | Monitor usage metrics |
| `/files/:path*` | GET | Monitor usage metrics |
| `/throws` | GET | Monitor usage metrics |
| `/status/:code` | POST | Monitor usage metrics |
| `/error-shape` | GET | Monitor usage metrics |
| `/` | GET | Monitor usage metrics |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots` | POST | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/` | GET | Monitor usage metrics |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/health/live` | GET | Track API adoption rate per endpoint |
| `/v1/health/ready` | GET | Track API adoption rate per endpoint |
| `/v1/metrics` | GET | Track API adoption rate per endpoint |
| `/v1/db/stats` | GET | Track API adoption rate per endpoint |
| `/v1/db/maintenance` | POST | Track API adoption rate per endpoint |
| `/v1/docs` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots` | POST | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id/versions` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id/versions/:version_number` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id/diff` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/context` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/generated-files` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/generated-files/:file_path*` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/search/export` | POST | Track API adoption rate per endpoint |
| `/v1/skills/generate` | POST | Track API adoption rate per endpoint |
| `/v1/debug/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/frontend/audit` | POST | Track API adoption rate per endpoint |
| `/v1/seo/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/optimization/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/theme/generate` | POST | Track API adoption rate per endpoint |
| `/v1/brand/generate` | POST | Track API adoption rate per endpoint |
| `/v1/superpowers/generate` | POST | Track API adoption rate per endpoint |
| `/v1/marketing/generate` | POST | Track API adoption rate per endpoint |
| `/v1/notebook/generate` | POST | Track API adoption rate per endpoint |
| `/v1/obsidian/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/mcp/provision` | POST | Track API adoption rate per endpoint |
| `/v1/artifacts/generate` | POST | Track API adoption rate per endpoint |
| `/v1/remotion/generate` | POST | Track API adoption rate per endpoint |
| `/v1/canvas/generate` | POST | Track API adoption rate per endpoint |
| `/v1/algorithmic/generate` | POST | Track API adoption rate per endpoint |
| `/v1/agentic-purchasing/generate` | POST | Track API adoption rate per endpoint |
| `/v1/prepare-for-agentic-purchasing` | POST | Track API adoption rate per endpoint |
| `/v1/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/github/analyze` | POST | Track API adoption rate per endpoint |
| `/.well-known/axis.json` | GET | Monitor usage metrics |
| `/.well-known/capabilities.json` | GET | Monitor usage metrics |
| `/.well-known/mcp.json` | GET | Monitor usage metrics |
| `/robots.txt` | GET | Monitor usage metrics |
| `/llms.txt` | GET | Monitor usage metrics |
| `/.well-known/skills/index.json` | GET | Monitor usage metrics |
| `/v1/docs.md` | GET | Track API adoption rate per endpoint |
| `/for-agents` | GET | Monitor usage metrics |
| `/probe-intent` | POST | Monitor usage metrics |
| `/v1/install` | GET | Track API adoption rate per endpoint |
| `/v1/install/:platform` | GET | Track API adoption rate per endpoint |
| `/v1/search/index` | POST | Track API adoption rate per endpoint |
| `/v1/search/query` | POST | Track API adoption rate per endpoint |
| `/v1/search/:snapshot_id/stats` | GET | Track API adoption rate per endpoint |
| `/v1/search/:snapshot_id/symbols` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/export` | GET | Track API adoption rate per endpoint |
| `/v1/programs` | GET | Track API adoption rate per endpoint |
| `/mcp` | POST | Monitor usage metrics |
| `/mcp` | GET | Monitor usage metrics |
| `/v1/stats` | GET | Track API adoption rate per endpoint |
| `/v1/mcp/server.json` | GET | Track API adoption rate per endpoint |
| `/v1/mcp/tools` | GET | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/account` | GET | Track API adoption rate per endpoint |
| `/v1/account/keys` | POST | Track API adoption rate per endpoint |
| `/v1/account/keys` | GET | Track API adoption rate per endpoint |
| `/v1/account/keys/:key_id/revoke` | POST | Track API adoption rate per endpoint |
| `/v1/account/usage` | GET | Track API adoption rate per endpoint |
| `/v1/account/quota` | GET | Track API adoption rate per endpoint |
| `/v1/account/tier` | POST | Track API adoption rate per endpoint |
| `/v1/account/programs` | POST | Track API adoption rate per endpoint |
| `/v1/account/github-token` | POST | Track API adoption rate per endpoint |
| `/v1/account/github-token` | GET | Track API adoption rate per endpoint |
| `/v1/account/github-token/:token_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/billing/history` | GET | Track API adoption rate per endpoint |
| `/v1/billing/proration` | GET | Track API adoption rate per endpoint |
| `/v1/account/credits` | GET | Track API adoption rate per endpoint |
| `/v1/account/credits` | POST | Track API adoption rate per endpoint |
| `/v1/plans` | GET | Track API adoption rate per endpoint |
| `/v1/account/seats` | POST | Track API adoption rate per endpoint |
| `/v1/account/seats` | GET | Track API adoption rate per endpoint |
| `/v1/account/seats/:seat_id/accept` | POST | Track API adoption rate per endpoint |
| `/v1/account/seats/:seat_id/revoke` | POST | Track API adoption rate per endpoint |
| `/v1/account/upgrade-prompt` | GET | Track API adoption rate per endpoint |
| `/v1/account/upgrade-prompt/dismiss` | POST | Track API adoption rate per endpoint |
| `/v1/account/funnel` | GET | Track API adoption rate per endpoint |
| `/v1/funnel/metrics` | GET | Track API adoption rate per endpoint |
| `/v1/admin/stats` | GET | Track API adoption rate per endpoint |
| `/v1/admin/accounts` | GET | Track API adoption rate per endpoint |
| `/v1/admin/activity` | GET | Track API adoption rate per endpoint |
| `/v1/auth/github` | GET | Reduce friction — minimize required fields |
| `/v1/auth/github/callback` | GET | Reduce friction — minimize required fields |
| `/v1/account/webhooks` | POST | Track API adoption rate per endpoint |
| `/v1/account/webhooks` | GET | Track API adoption rate per endpoint |
| `/v1/account/webhooks/:webhook_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/account/webhooks/:webhook_id/toggle` | POST | Track API adoption rate per endpoint |
| `/v1/account/webhooks/:webhook_id/deliveries` | GET | Track API adoption rate per endpoint |
| `/v1/webhooks/stripe` | POST | Track API adoption rate per endpoint |
| `/v1/checkout` | POST | Track API adoption rate per endpoint |
| `/v1/account/subscription` | GET | Track API adoption rate per endpoint |
| `/v1/account/subscription/cancel` | POST | Track API adoption rate per endpoint |
| `/v1/snapshots` | POST | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | GET | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/account/tier` | POST | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/webhooks/stripe` | POST | Track API adoption rate per endpoint |
| `/v1/checkout` | POST | Track API adoption rate per endpoint |
| `/v1/account/subscription` | GET | Track API adoption rate per endpoint |
| `/v1/account/subscription/cancel` | POST | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/webhooks/stripe` | POST | Track API adoption rate per endpoint |
| `/v1/account/subscription` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots` | POST | Track API adoption rate per endpoint |
| `/v1/search/export` | POST | Track API adoption rate per endpoint |
| `/v1/skills/generate` | POST | Track API adoption rate per endpoint |
| `/v1/debug/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/account/tier` | POST | Track API adoption rate per endpoint |
| `/v1/account/programs` | POST | Track API adoption rate per endpoint |
| `/v1/account/seats` | POST | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id/versions` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id/versions/:version_number` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id/diff` | GET | Track API adoption rate per endpoint |
| `/v1/account/webhooks` | POST | Track API adoption rate per endpoint |
| `/v1/account/webhooks` | GET | Track API adoption rate per endpoint |
| `/v1/account/webhooks/:webhook_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/account/webhooks/:webhook_id/toggle` | POST | Track API adoption rate per endpoint |
| `/v1/account/webhooks/:webhook_id/deliveries` | GET | Track API adoption rate per endpoint |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/account/webhooks` | POST | Track API adoption rate per endpoint |
| `/v1/account/webhooks` | GET | Track API adoption rate per endpoint |
| `/v1/account/webhooks/:webhook_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/account/webhooks/:webhook_id/toggle` | POST | Track API adoption rate per endpoint |
| `/v1/account/webhooks/:webhook_id/deliveries` | GET | Track API adoption rate per endpoint |
| `/health` | GET | Monitor usage metrics |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/api/health` | GET | Track API adoption rate per endpoint |
| `/api/users` | POST | Track API adoption rate per endpoint |
| `/api/users` | GET | Track API adoption rate per endpoint |
| `/api/users` | POST | Track API adoption rate per endpoint |
| `/api/users/:id` | DELETE | Track API adoption rate per endpoint |
| `/api/health` | GET | Track API adoption rate per endpoint |
| `/api/users` | GET | Track API adoption rate per endpoint |
| `/api/users` | POST | Track API adoption rate per endpoint |
| `/` | GET | Monitor usage metrics |
| `/health` | GET | Monitor usage metrics |
| `/api/health` | GET | Track API adoption rate per endpoint |
| `/webhook` | POST | Monitor usage metrics |
| `/users/:id` | GET | Monitor usage metrics |
| `/users` | POST | Monitor usage metrics |

## Optimization Experiments

### Experiment 1: Authentication Flow

- **Route**: `GET /v1/auth/github`, `GET /v1/auth/github/callback`, `GET /v1/auth/github`, `GET /v1/auth/github/callback`
- **Hypothesis**: Social OAuth login will increase conversion by 30%
- **Metric**: Login success rate, abandonment rate
- **Variants**: A: Email/password only | B: OAuth (GitHub, Google) as primary
- **Duration**: 2 weeks

### Experiment 2: Pricing Page

- **Route**: `GET /v1/plans`, `GET /v1/plans`, `GET /v1/plans`, `GET /v1/plans`
- **Hypothesis**: Highlighting the most popular plan will increase paid conversion by 15%
- **Metric**: Plan selection rate, paid conversion
- **Variants**: A: Equal weight pricing table | B: "Most Popular" badge on mid-tier
- **Duration**: 2 weeks

### Experiment 3: API First-Call Success

- **Routes**: `GET /v1/health`, `POST /v1/accounts`, `POST /v1/snapshots`
- **Hypothesis**: An interactive API playground will increase developer activation by 40%
- **Metric**: Time to first successful API call, developer satisfaction
- **Variants**: A: Static API docs | B: Live try-it-now console in docs
- **Duration**: 4 weeks

### Experiment 4: Documentation Navigation

- **Route**: `GET /v1/docs.md`, `GET /v1/docs`, `GET /v1/docs`, `GET /v1/docs.md`
- **Hypothesis**: Task-oriented docs will reduce support issues by 30%
- **Metric**: Issue creation rate for how-to questions, docs bounce rate
- **Variants**: A: Current structure | B: Task-oriented guides ("How to X" pattern)
- **Duration**: 4 weeks

### Experiment 5: Onboarding Flow

- **Hypothesis**: A guided first-run wizard will increase first-value moment by 35%
- **Metric**: Features used in first session, time to first successful output
- **Context**: 429 API endpoints — users need a path through the complexity
- **Variants**: A: Self-discovery | B: Step-by-step first-run guide with progress indicator
- **Duration**: 3 weeks

## Metrics to Track

| Metric | Source | Target |
|--------|--------|--------|
| Install rate | npm/registry analytics | +20% MoM |
| First-run success rate | Telemetry (opt-in) | > 90% |
| Time to first value | Telemetry (opt-in) | < 5 minutes |
| 7-day retention | Telemetry (opt-in) | > 40% |
| GitHub star rate | GitHub API | +10% MoM |
| Issue response time | GitHub API | < 24 hours |
| Documentation bounce rate | Analytics | < 40% |

## Detected Landing/Conversion Pages

- `apps/web/index.html`
- `apps/web/src/pages/AccountPage.tsx`
- `apps/web/src/pages/DashboardPage.tsx`
- `apps/web/src/pages/DocsPage.tsx`
- `apps/web/src/pages/ExamplesPage.tsx`
- `apps/web/src/pages/ForAgentsPage.tsx`
