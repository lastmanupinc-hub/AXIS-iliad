# SEO Rules — axis-toolbox

> SEO guidelines for a monorepo built with TypeScript

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 500 files across 20 top-level directories. It defines 152 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Meta Tags & Head

- Every page MUST have a unique `<title>` (50–60 chars)
- Every page MUST have a unique `<meta name="description">` (120–160 chars)
- Use canonical URLs: `<link rel="canonical" href="...">` on every page
- Add `<meta name="robots" content="index, follow">` for public pages
- Add `<meta name="viewport" content="width=device-width, initial-scale=1">`

## Rendering Strategy

### React SPA Considerations

- **Warning:** Client-rendered React SPAs are not SEO-friendly by default
- Consider adding SSR (Next.js, Remix) or pre-rendering for public-facing pages
- Use `react-helmet-async` for dynamic `<head>` management
- If SPA is behind auth, SEO may not be a concern — mark pages as `noindex`

## Structured Data (JSON-LD)

- Add JSON-LD structured data to key pages
- Use `@type: WebSite` on the homepage
- Use `@type: WebApplication` or `@type: SoftwareApplication` for SaaS products
- Use `@type: BreadcrumbList` for navigation hierarchy
- Validate with [Google Rich Results Test](https://search.google.com/test/rich-results)

## Route SEO Audit

| Route | Method | SEO Action |
|-------|--------|------------|
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/snapshots` | POST | API route — exclude from sitemap |
| `/v1/admin/stats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/admin/accounts` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/admin/activity` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/llms.txt` | GET | Add WebPage schema · unique title + description required |
| `/.well-known/skills/index.json` | GET | Add WebPage schema · unique title + description required |
| `/v1/docs.md` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/.well-known/axis.json` | GET | Add WebPage schema · unique title + description required |
| `/for-agents` | GET | Add WebPage schema · unique title + description required |
| `/v1/install` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/install/:platform` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/probe-intent` | POST | API route — exclude from sitemap |
| `/v1/analyze` | POST | API route — exclude from sitemap |
| `/.well-known/axis.json` | GET | Add WebPage schema · unique title + description required |
| `/v1/snapshots` | POST | API route — exclude from sitemap |
| `/v1/snapshots/:snapshot_id` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots/:snapshot_id` | DELETE | API route — exclude from sitemap |
| `/v1/projects/:project_id/context` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/generated-files` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/generated-files/:file_path` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id` | DELETE | API route — exclude from sitemap |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/db/stats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/db/maintenance` | POST | API route — exclude from sitemap |
| `/v1/search/index` | POST | API route — exclude from sitemap |
| `/v1/search/query` | POST | API route — exclude from sitemap |
| `/v1/search/:snapshot_id/stats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/debug/analyze` | POST | API route — exclude from sitemap |
| `/v1/docs` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/programs` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/seats` | POST | API route — exclude from sitemap |
| `/v1/account/seats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/seats/:seat_id/accept` | POST | API route — exclude from sitemap |
| `/v1/account/seats/:seat_id/revoke` | POST | API route — exclude from sitemap |
| `/v1/account/upgrade-prompt` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/upgrade-prompt/dismiss` | POST | API route — exclude from sitemap |
| `/v1/account/funnel` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/account/webhooks` | POST | API route — exclude from sitemap |
| `/v1/account/webhooks` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/webhooks/:webhook_id` | DELETE | API route — exclude from sitemap |
| `/v1/account/webhooks/:webhook_id/toggle` | POST | API route — exclude from sitemap |
| `/v1/account/webhooks/:webhook_id/deliveries` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/search/query` | POST | API route — exclude from sitemap |
| `/v1/account/programs` | POST | API route — exclude from sitemap |
| `/v1/account/github-token` | POST | API route — exclude from sitemap |
| `/v1/account/seats` | POST | API route — exclude from sitemap |
| `/v1/admin/stats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/admin/accounts` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/admin/activity` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/health` | GET | Add WebPage schema · unique title + description required |
| `/v1/snapshots` | POST | API route — exclude from sitemap |
| `/v1/snapshots/:snapshot_id` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/context` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/generated-files` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/generated-files/:file_path` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/search/export` | POST | API route — exclude from sitemap |
| `/v1/skills/generate` | POST | API route — exclude from sitemap |
| `/v1/debug/analyze` | POST | API route — exclude from sitemap |
| `/v1/frontend/audit` | POST | API route — exclude from sitemap |
| `/v1/seo/analyze` | POST | API route — exclude from sitemap |
| `/v1/optimization/analyze` | POST | API route — exclude from sitemap |
| `/v1/theme/generate` | POST | API route — exclude from sitemap |
| `/v1/brand/generate` | POST | API route — exclude from sitemap |
| `/v1/superpowers/generate` | POST | API route — exclude from sitemap |
| `/v1/marketing/generate` | POST | API route — exclude from sitemap |
| `/v1/notebook/generate` | POST | API route — exclude from sitemap |
| `/v1/obsidian/analyze` | POST | API route — exclude from sitemap |
| `/v1/mcp/provision` | POST | API route — exclude from sitemap |
| `/v1/artifacts/generate` | POST | API route — exclude from sitemap |
| `/v1/remotion/generate` | POST | API route — exclude from sitemap |
| `/v1/canvas/generate` | POST | API route — exclude from sitemap |
| `/v1/algorithmic/generate` | POST | API route — exclude from sitemap |
| `/v1/agentic-purchasing/generate` | POST | API route — exclude from sitemap |
| `/v1/github/analyze` | POST | API route — exclude from sitemap |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/account/tier` | POST | API route — exclude from sitemap |
| `/v1/account/github-token` | POST | API route — exclude from sitemap |
| `/v1/account/github-token` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/github-token/:token_id` | DELETE | API route — exclude from sitemap |
| `/v1/billing/history` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/billing/proration` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots` | POST | API route — exclude from sitemap |
| `/v1/snapshots/:snapshot_id` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/context` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/generated-files` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/generated-files/:file_path*` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/search/export` | POST | API route — exclude from sitemap |
| `/v1/projects/:project_id/export` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/account` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/keys` | POST | API route — exclude from sitemap |
| `/v1/account/keys` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/keys/:key_id/revoke` | POST | API route — exclude from sitemap |
| `/v1/account/usage` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/tier` | POST | API route — exclude from sitemap |
| `/v1/account/programs` | POST | API route — exclude from sitemap |
| `/v1/account/credits` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/plans` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/seats` | POST | API route — exclude from sitemap |
| `/v1/account/seats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/seats/:seat_id/accept` | POST | API route — exclude from sitemap |
| `/v1/account/seats/:seat_id/revoke` | POST | API route — exclude from sitemap |
| `/for-agents` | GET | Add WebPage schema · unique title + description required |
| `/probe-intent` | POST | API route — exclude from sitemap |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/account/seats` | POST | API route — exclude from sitemap |
| `/v1/account/seats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/plans` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/webhooks/stripe` | POST | API route — exclude from sitemap |
| `/v1/checkout` | POST | API route — exclude from sitemap |
| `/v1/account/subscription` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/subscription/cancel` | POST | API route — exclude from sitemap |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/account` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/keys` | POST | API route — exclude from sitemap |
| `/v1/account/tier` | POST | API route — exclude from sitemap |
| `/v1/account/credits` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/credits` | POST | API route — exclude from sitemap |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/db/stats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/db/maintenance` | POST | API route — exclude from sitemap |
| `/v1/snapshots/:snapshot_id` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots/:snapshot_id` | DELETE | API route — exclude from sitemap |
| `/v1/projects/:project_id` | DELETE | API route — exclude from sitemap |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health/live` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health/ready` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/metrics` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/db/stats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/db/maintenance` | POST | API route — exclude from sitemap |
| `/v1/snapshots` | POST | API route — exclude from sitemap |
| `/v1/snapshots/:snapshot_id` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots/:snapshot_id` | DELETE | API route — exclude from sitemap |
| `/v1/snapshots/:snapshot_id/versions` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots/:snapshot_id/versions/:version_number` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots/:snapshot_id/diff` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/context` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/generated-files` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/generated-files/:file_path` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id` | DELETE | API route — exclude from sitemap |
| `/v1/projects/:project_id/export` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/search/export` | POST | API route — exclude from sitemap |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/account` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/keys` | POST | API route — exclude from sitemap |
| `/v1/account/keys` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/keys/:key_id/revoke` | POST | API route — exclude from sitemap |
| `/v1/account/usage` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/quota` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/admin/stats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/admin/accounts` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/admin/activity` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/webhooks` | POST | API route — exclude from sitemap |
| `/v1/account/webhooks` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/webhooks/:webhook_id` | DELETE | API route — exclude from sitemap |
| `/v1/account/webhooks/:webhook_id/toggle` | POST | API route — exclude from sitemap |
| `/v1/account/webhooks/:webhook_id/deliveries` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/export` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/export` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/account` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/keys` | POST | API route — exclude from sitemap |
| `/v1/account/tier` | POST | API route — exclude from sitemap |
| `/v1/plans` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/seats` | POST | API route — exclude from sitemap |
| `/v1/account/seats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/seats/:seat_id/accept` | POST | API route — exclude from sitemap |
| `/v1/account/seats/:seat_id/revoke` | POST | API route — exclude from sitemap |
| `/v1/account/upgrade-prompt` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/upgrade-prompt/dismiss` | POST | API route — exclude from sitemap |
| `/v1/account/funnel` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/funnel/metrics` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots` | POST | API route — exclude from sitemap |
| `/health` | GET | Add WebPage schema · unique title + description required |
| `/v1/projects/:project_id/context` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/generated-files` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/generated-files/:file_path` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/debug/analyze` | POST | API route — exclude from sitemap |
| `/v1/snapshots` | POST | API route — exclude from sitemap |
| `/v1/debug/analyze` | POST | API route — exclude from sitemap |
| `/v1/snapshots` | POST | API route — exclude from sitemap |
| `/v1/snapshots/:snapshot_id` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots/:snapshot_id` | DELETE | API route — exclude from sitemap |
| `/v1/projects/:project_id` | DELETE | API route — exclude from sitemap |
| `/v1/projects/:project_id/generated-files/:file_path` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/search/export` | POST | API route — exclude from sitemap |
| `/v1/skills/generate` | POST | API route — exclude from sitemap |
| `/v1/github/analyze` | POST | API route — exclude from sitemap |
| `/v1/debug/analyze` | POST | API route — exclude from sitemap |
| `/v1/health/live` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/metrics` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots` | POST | API route — exclude from sitemap |
| `/mcp` | POST | API route — exclude from sitemap |
| `/mcp` | GET | Add WebPage schema · unique title + description required |
| `/v1/mcp/server.json` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/account/keys` | POST | API route — exclude from sitemap |
| `/v1/stats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/ping` | GET | Add WebPage schema · unique title + description required |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health/live` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health/ready` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/metrics` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots` | POST | API route — exclude from sitemap |
| `/v1/snapshots/:snapshot_id` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots/:snapshot_id` | DELETE | API route — exclude from sitemap |
| `/v1/projects/:project_id` | DELETE | API route — exclude from sitemap |
| `/v1/projects/:project_id/context` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/generated-files` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/generated-files/:file_path*` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/export` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/search/index` | POST | API route — exclude from sitemap |
| `/v1/search/query` | POST | API route — exclude from sitemap |
| `/v1/search/:snapshot_id/stats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/account` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/keys` | POST | API route — exclude from sitemap |
| `/v1/account/keys` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/keys/:key_id/revoke` | POST | API route — exclude from sitemap |
| `/v1/account/usage` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/tier` | POST | API route — exclude from sitemap |
| `/v1/account/programs` | POST | API route — exclude from sitemap |
| `/v1/auth/github` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/auth/github/callback` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/prepare-for-agentic-purchasing` | POST | API route — exclude from sitemap |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/programs` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/account` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/keys` | POST | API route — exclude from sitemap |
| `/v1/account/usage` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/tier` | POST | API route — exclude from sitemap |
| `/v1/account/programs` | POST | API route — exclude from sitemap |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/account/quota` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/test/fast` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/test/slow` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/slow` | GET | Add WebPage schema · unique title + description required |
| `/throw-string` | GET | Add WebPage schema · unique title + description required |
| `/throw-after-end` | GET | Add WebPage schema · unique title + description required |
| `/null-error` | GET | Add WebPage schema · unique title + description required |
| `/array-error` | GET | Add WebPage schema · unique title + description required |
| `/ok` | GET | Add WebPage schema · unique title + description required |
| `/manual-500` | GET | Add WebPage schema · unique title + description required |
| `/manual-422` | GET | Add WebPage schema · unique title + description required |
| `/health` | GET | Add WebPage schema · unique title + description required |
| `/up` | GET | Add WebPage schema · unique title + description required |
| `/echo` | GET | Add WebPage schema · unique title + description required |
| `/echo` | POST | API route — exclude from sitemap |
| `/items/:id` | GET | Add WebPage schema · unique title + description required |
| `/users/:userId/posts/:postId` | GET | Add Article/BlogPosting schema · include in sitemap |
| `/files/:path*` | GET | Add WebPage schema · unique title + description required |
| `/throws` | GET | Add WebPage schema · unique title + description required |
| `/status/:code` | POST | API route — exclude from sitemap |
| `/error-shape` | GET | Add WebPage schema · unique title + description required |
| `/` | GET | Add WebSite + SearchAction schema · highest priority |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots` | POST | API route — exclude from sitemap |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/` | GET | Add WebSite + SearchAction schema · highest priority |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health/live` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health/ready` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/metrics` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/db/stats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/db/maintenance` | POST | API route — exclude from sitemap |
| `/v1/docs` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots` | POST | API route — exclude from sitemap |
| `/v1/snapshots/:snapshot_id` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots/:snapshot_id` | DELETE | API route — exclude from sitemap |
| `/v1/snapshots/:snapshot_id/versions` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots/:snapshot_id/versions/:version_number` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots/:snapshot_id/diff` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/context` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/generated-files` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/generated-files/:file_path*` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id` | DELETE | API route — exclude from sitemap |
| `/v1/search/export` | POST | API route — exclude from sitemap |
| `/v1/skills/generate` | POST | API route — exclude from sitemap |
| `/v1/debug/analyze` | POST | API route — exclude from sitemap |
| `/v1/frontend/audit` | POST | API route — exclude from sitemap |
| `/v1/seo/analyze` | POST | API route — exclude from sitemap |
| `/v1/optimization/analyze` | POST | API route — exclude from sitemap |
| `/v1/theme/generate` | POST | API route — exclude from sitemap |
| `/v1/brand/generate` | POST | API route — exclude from sitemap |
| `/v1/superpowers/generate` | POST | API route — exclude from sitemap |
| `/v1/marketing/generate` | POST | API route — exclude from sitemap |
| `/v1/notebook/generate` | POST | API route — exclude from sitemap |
| `/v1/obsidian/analyze` | POST | API route — exclude from sitemap |
| `/v1/mcp/provision` | POST | API route — exclude from sitemap |
| `/v1/artifacts/generate` | POST | API route — exclude from sitemap |
| `/v1/remotion/generate` | POST | API route — exclude from sitemap |
| `/v1/canvas/generate` | POST | API route — exclude from sitemap |
| `/v1/algorithmic/generate` | POST | API route — exclude from sitemap |
| `/v1/agentic-purchasing/generate` | POST | API route — exclude from sitemap |
| `/v1/prepare-for-agentic-purchasing` | POST | API route — exclude from sitemap |
| `/v1/analyze` | POST | API route — exclude from sitemap |
| `/v1/github/analyze` | POST | API route — exclude from sitemap |
| `/.well-known/axis.json` | GET | Add WebPage schema · unique title + description required |
| `/.well-known/capabilities.json` | GET | Add WebPage schema · unique title + description required |
| `/.well-known/mcp.json` | GET | Add WebPage schema · unique title + description required |
| `/robots.txt` | GET | Add WebPage schema · unique title + description required |
| `/llms.txt` | GET | Add WebPage schema · unique title + description required |
| `/.well-known/skills/index.json` | GET | Add WebPage schema · unique title + description required |
| `/v1/docs.md` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/for-agents` | GET | Add WebPage schema · unique title + description required |
| `/probe-intent` | POST | API route — exclude from sitemap |
| `/v1/install` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/install/:platform` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/search/index` | POST | API route — exclude from sitemap |
| `/v1/search/query` | POST | API route — exclude from sitemap |
| `/v1/search/:snapshot_id/stats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/search/:snapshot_id/symbols` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/export` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/programs` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/mcp` | POST | API route — exclude from sitemap |
| `/mcp` | GET | Add WebPage schema · unique title + description required |
| `/v1/stats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/mcp/server.json` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/mcp/tools` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/account` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/keys` | POST | API route — exclude from sitemap |
| `/v1/account/keys` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/keys/:key_id/revoke` | POST | API route — exclude from sitemap |
| `/v1/account/usage` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/quota` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/tier` | POST | API route — exclude from sitemap |
| `/v1/account/programs` | POST | API route — exclude from sitemap |
| `/v1/account/github-token` | POST | API route — exclude from sitemap |
| `/v1/account/github-token` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/github-token/:token_id` | DELETE | API route — exclude from sitemap |
| `/v1/billing/history` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/billing/proration` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/credits` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/credits` | POST | API route — exclude from sitemap |
| `/v1/plans` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/seats` | POST | API route — exclude from sitemap |
| `/v1/account/seats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/seats/:seat_id/accept` | POST | API route — exclude from sitemap |
| `/v1/account/seats/:seat_id/revoke` | POST | API route — exclude from sitemap |
| `/v1/account/upgrade-prompt` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/upgrade-prompt/dismiss` | POST | API route — exclude from sitemap |
| `/v1/account/funnel` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/funnel/metrics` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/admin/stats` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/admin/accounts` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/admin/activity` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/auth/github` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/auth/github/callback` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/webhooks` | POST | API route — exclude from sitemap |
| `/v1/account/webhooks` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/webhooks/:webhook_id` | DELETE | API route — exclude from sitemap |
| `/v1/account/webhooks/:webhook_id/toggle` | POST | API route — exclude from sitemap |
| `/v1/account/webhooks/:webhook_id/deliveries` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/webhooks/stripe` | POST | API route — exclude from sitemap |
| `/v1/checkout` | POST | API route — exclude from sitemap |
| `/v1/account/subscription` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/subscription/cancel` | POST | API route — exclude from sitemap |
| `/v1/snapshots` | POST | API route — exclude from sitemap |
| `/v1/snapshots/:snapshot_id` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/account/tier` | POST | API route — exclude from sitemap |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/webhooks/stripe` | POST | API route — exclude from sitemap |
| `/v1/checkout` | POST | API route — exclude from sitemap |
| `/v1/account/subscription` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/subscription/cancel` | POST | API route — exclude from sitemap |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/webhooks/stripe` | POST | API route — exclude from sitemap |
| `/v1/account/subscription` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots` | POST | API route — exclude from sitemap |
| `/v1/search/export` | POST | API route — exclude from sitemap |
| `/v1/skills/generate` | POST | API route — exclude from sitemap |
| `/v1/debug/analyze` | POST | API route — exclude from sitemap |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/account/tier` | POST | API route — exclude from sitemap |
| `/v1/account/programs` | POST | API route — exclude from sitemap |
| `/v1/account/seats` | POST | API route — exclude from sitemap |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots/:snapshot_id/versions` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots/:snapshot_id/versions/:version_number` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots/:snapshot_id/diff` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/webhooks` | POST | API route — exclude from sitemap |
| `/v1/account/webhooks` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/webhooks/:webhook_id` | DELETE | API route — exclude from sitemap |
| `/v1/account/webhooks/:webhook_id/toggle` | POST | API route — exclude from sitemap |
| `/v1/account/webhooks/:webhook_id/deliveries` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/account/webhooks` | POST | API route — exclude from sitemap |
| `/v1/account/webhooks` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/webhooks/:webhook_id` | DELETE | API route — exclude from sitemap |
| `/v1/account/webhooks/:webhook_id/toggle` | POST | API route — exclude from sitemap |
| `/v1/account/webhooks/:webhook_id/deliveries` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/health` | GET | Add WebPage schema · unique title + description required |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/api/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/api/users` | POST | API route — exclude from sitemap |
| `/api/users` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/api/users` | POST | API route — exclude from sitemap |
| `/api/users/:id` | DELETE | API route — exclude from sitemap |
| `/api/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/api/users` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/api/users` | POST | API route — exclude from sitemap |
| `/` | GET | Add WebSite + SearchAction schema · highest priority |
| `/health` | GET | Add WebPage schema · unique title + description required |
| `/api/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/webhook` | POST | API route — exclude from sitemap |
| `/users/:id` | GET | Add WebPage schema · unique title + description required |
| `/users` | POST | API route — exclude from sitemap |

## Domain Models as Content Entities

These domain models represent structured content — mapping them to schema types increases indexability:

| Model | Kind | Fields | Suggested Schema Type |
|-------|------|--------|-----------------------|
| `AuthContext` | interface | 3 | WebPage |
| `EnvSpec` | interface | 5 | WebPage |
| `ValidationError` | interface | 2 | WebPage |
| `ValidationResult` | interface | 3 | WebPage |
| `ZipEntry` | interface | 4 | WebPage |
| `IntentCapture` | interface | 5 | WebPage |
| `JsonRpcRequest` | interface | 4 | WebPage |
| `McpCallCounters` | interface | 5 | WebPage |
| `RpcError` | interface | 5 | WebPage |
| `RpcSuccess` | interface | 3 | WebPage |
| `HistogramEntry` | interface | 3 | WebPage |
| `AgentBudget` | interface | 5 | WebPage |
| `CacheKey` | type_alias | 2 | Thing |
| `ChargeOptions` | type_alias | 5 | Thing |
| `MppResult` | type_alias | 1 | Thing |

## Contact & Support Page SEO

- Use `ContactPage` schema with `areaServed`, `availableLanguage`, and `contactType` properties
- Include response time expectation in meta description (e.g. "We respond within 24 hours")
- `mailto:` and `tel:` links must have `aria-label` attributes for crawlability
- Contact forms should not be gated behind auth — allow discovery by crawlers
- Support/help pages: add FAQ schema (`FAQPage`) if content is Q&A format
- Feedback pages: `noindex` if form-only with no unique content value

## Technical SEO

- Ensure `robots.txt` exists at site root
- Generate and submit `sitemap.xml`
- Use clean, descriptive URLs — avoid query parameters for content pages
- Implement proper 301 redirects for moved pages
- Set appropriate cache headers for static assets
- Ensure `<img>` tags have `alt` attributes
- Ensure `<a>` tags have descriptive text (avoid "click here")
- Keep page load time under 3 seconds (Core Web Vitals)

## Accessibility (SEO Impact)

- Use semantic HTML (`<header>`, `<main>`, `<nav>`, `<article>`, `<footer>`)
- Use heading hierarchy (`h1` > `h2` > `h3`) — one `h1` per page
- Provide `aria-label` for interactive elements without visible text

## Detected SEO Files

- `apps/web/public/robots.txt` (26 lines)
- `export-manifest.yaml` (87 lines)
- `payment-processing-output/export-manifest.yaml` (87 lines)
- `payment-processing-output/server-manifest.yaml` (107 lines)

## SEO File Contents

### `apps/web/public/robots.txt`

```
# robots.txt for AXIS Toolbox
# Built specifically for agentic commerce and autonomous purchasing agents

User-agent: *
Allow: /

# Special directives for AI / MCP / agent probes
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: Google-Extended
User-agent: 402.ad-mcp-probe
User-agent: *
Disallow: /private/
Allow: /mcp
Allow: /for-agents
Allow: /v1/

# Helpful message for agents
# This is the AXIS Toolbox MCP server (io.github.lastmanupinc-hub/axis-toolbox)
# Primary tool: prepare_for_agentic_purchasing
... (6 more lines)
```

### `export-manifest.yaml`

```yaml
# Export Manifest
# Project: axis-toolbox
# Generated: 2026-04-14T03:15:00.674Z

manifest:
  project: "axis-toolbox"
  version: "1.0"
  total_artifacts: 4

  artifacts:
    - id: generative-sketch
      file: generative-sketch.ts
      type: code
      format: typescript
      description: Force-directed graph animation
      exports:
        - format: html
          resolution: 1920x1080
          self_contained: true
        - format: mp4
... (67 more lines)
```

### `payment-processing-output/export-manifest.yaml`

```yaml
# Export Manifest
# Project: avery-pay-platform
# Generated: 2026-04-05T07:37:21.799Z

manifest:
  project: "avery-pay-platform"
  version: "1.0"
  total_artifacts: 4

  artifacts:
    - id: generative-sketch
      file: generative-sketch.ts
      type: code
      format: typescript
      description: Force-directed graph animation
      exports:
        - format: html
          resolution: 1920x1080
          self_contained: true
        - format: mp4
... (67 more lines)
```

## Detected Page Files

| Page | Exports | Lines |
|------|---------|-------|
| `apps/web/index.html` | default | 128 |
| `apps/web/src/pages/AccountPage.tsx` | export function AccountPage({ ... } | 623 |
| `apps/web/src/pages/DashboardPage.tsx` | export function DashboardPage({ ... } | 180 |
| `apps/web/src/pages/DocsPage.tsx` | export function DocsPage() { ... } | 1292 |
| `apps/web/src/pages/ExamplesPage.tsx` | export function ExamplesPage() { ... } | 505 |
| `apps/web/src/pages/ForAgentsPage.tsx` | export function ForAgentsPage() { ... } | 896 |
| `apps/web/src/pages/HelpPage.tsx` | export function HelpPage() { ... } | 758 |
| `apps/web/src/pages/InstallPage.tsx` | export function InstallPage() { ... } | 204 |
| `apps/web/src/pages/PlansPage.tsx` | export function PlansPage({ ... } | 242 |
| `apps/web/src/pages/ProgramsPage.tsx` | export function ProgramsPage({ ... } | 313 |
| `apps/web/src/pages/QAPage.tsx` | export function QAPage() { ... } | 392 |
| `apps/web/src/pages/TermsPage.tsx` | export function TermsPage() { ... } | 357 |
