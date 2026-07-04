# SEO Rules — axis-iliad

> SEO guidelines for a monorepo built with TypeScript

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

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
| `/v1/admin/mcp-usage` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/admin/revenue` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/llms.txt` | GET | Add WebPage schema · unique title + description required |
| `/.well-known/skills/index.json` | GET | Add WebPage schema · unique title + description required |
| `/v1/docs.md` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/.well-known/axis.json` | GET | Add WebPage schema · unique title + description required |
| `/for-agents` | GET | Add WebPage schema · unique title + description required |
| `/v1/install` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/install/:platform` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/probe-intent` | POST | API route — exclude from sitemap |
| `/mcp` | POST | API route — exclude from sitemap |
| `/v1/analyze` | POST | API route — exclude from sitemap |
| `/v1/snapshots/:snapshot_id` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/snapshots/:snapshot_id` | DELETE | API route — exclude from sitemap |
| `/v1/projects/:project_id/context` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id/generated-files` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/projects/:project_id` | DELETE | API route — exclude from sitemap |
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
| `/v1/account/webhooks` | POST | API route — exclude from sitemap |
| `/v1/account/webhooks` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/webhooks/:webhook_id` | DELETE | API route — exclude from sitemap |
| `/v1/account/webhooks/:webhook_id/toggle` | POST | API route — exclude from sitemap |
| `/v1/account/webhooks/:webhook_id/deliveries` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account/programs` | POST | API route — exclude from sitemap |
| `/v1/account/github-token` | POST | API route — exclude from sitemap |
| `/health` | GET | Add WebPage schema · unique title + description required |
| `/v1/search/export` | POST | API route — exclude from sitemap |
| `/v1/skills/generate` | POST | API route — exclude from sitemap |
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
| *… 103 more* | | |

## Domain Models as Content Entities

These domain models represent structured content — mapping them to schema types increases indexability:

| Model | Kind | Fields | Suggested Schema Type |
|-------|------|--------|-----------------------|
| `AlertThresholds` | interface | 2 | WebPage |
| `Counters` | type_alias | 2 | Thing |
| `DebounceState` | interface | 2 | WebPage |
| `WindowResult` | interface | 4 | WebPage |
| `AnalyticsCountByBucketResult` | interface | 3 | WebPage |
| `AnalyticsCountByBucketRow` | interface | 2 | WebPage |
| `AnalyticsCountByEventResult` | interface | 2 | Event |
| `AnalyticsCountByEventRow` | interface | 2 | Event |
| `AnalyticsCountResult` | interface | 2 | WebPage |
| `AnalyticsDistinctUsersResult` | interface | 2 | Person |
| `AnalyticsEvent` | interface | 4 | Event |
| `AnalyticsQuery` | interface | 8 | WebPage |
| `WhereClause` | interface | 2 | WebPage |
| `DriftDeps` | interface | 5 | WebPage |
| `DriftOutcome` | interface | 3 | WebPage |

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

- `.github/app-manifest.json` (25 lines)
- `apps/web/public/robots.txt` (26 lines)

## SEO File Contents

### `.github/app-manifest.json`

```json
{
  "name": "Axis Iliad Compliance",
  "url": "https://iliad.trustfabric.ai",
  "hook_attributes": {
    "url": "https://axis-api-6c7z.onrender.com/v1/github/webhook",
    "active": true
  },
  "redirect_url": "https://iliad.trustfabric.ai/install/github/callback",
  "callback_urls": [
    "https://iliad.trustfabric.ai/install/github/callback"
  ],
  "description": "Runs AP2/Visa agentic-commerce compliance grading on every push and pull request. Installs the Axis' Iliad GitHub Action under .github/workflows/ and surfaces a 'Axis Compliance: <grade>' Check Run on the head commit. Snapshots prime the analyze cache so subsequent CLI / MCP calls return in <1s.",
  "public": true,
  "default_events": [
    "push",
    "pull_request"
  ],
  "default_permissions": {
    "checks": "write",
    "contents": "read",
... (5 more lines)
```

### `apps/web/public/robots.txt`

```
# robots.txt for Axis' Iliad
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
# This is the Axis' Iliad MCP server (io.github.lastmanupinc-hub/axis-iliad)
# Primary tool: prepare_agentic_purchasing
... (6 more lines)
```

## Detected Page Files

| Page | Exports | Lines |
|------|---------|-------|
| `apps/web/index.html` | default | 167 |
| `apps/web/src/components/ToolPage.tsx` | export interface ToolPricing { ... }, export interface ToolPageProps { ... }, export function ToolPage({ ... } | 189 |
| `apps/web/src/pages/AccountPage.tsx` | export function AccountPage({ ... } | 599 |
| `apps/web/src/pages/AdminPage.tsx` | export function AdminPage() { ... } | 334 |
| `apps/web/src/pages/DashboardPage.tsx` | export function DashboardPage({ ... } | 197 |
| `apps/web/src/pages/DocsPage.tsx` | export function DocsPage() { ... } | 1293 |
| `apps/web/src/pages/ExamplesPage.tsx` | export function ExamplesPage() { ... } | 679 |
| `apps/web/src/pages/ForAgentsPage.tsx` | export function ForAgentsPage() { ... } | 206 |
| `apps/web/src/pages/HelpPage.tsx` | export function HelpPage() { ... } | 770 |
| `apps/web/src/pages/InstallPage.tsx` | export function InstallPage() { ... } | 205 |
| `apps/web/src/pages/MyAnalyticsPage.tsx` | export function MyAnalyticsPage() { ... } | 241 |
| `apps/web/src/pages/PaidCheckoutPage.tsx` | export function PaidCheckoutPage() { ... } | 177 |


---

## ⟳ Continue the loop

- **You are here:** `seo-rules.md` — agent step 9 of 70.
- **Next:** `route-priority-map.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
