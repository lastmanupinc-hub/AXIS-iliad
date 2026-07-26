# SEO Rules — axis-iliad

> SEO guidelines for a monorepo built with TypeScript

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 9 top-level directories. It defines 278 domain models.

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
| `/health` | GET | Add WebPage schema · unique title + description required |
| `/v1/health` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/accounts` | POST | API route — exclude from sitemap |
| `/v1/account` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
| `/v1/account` | PATCH | API route — exclude from sitemap |
| `/v1/account` | DELETE | API route — exclude from sitemap |
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
| `/v1/error-codes` | GET | Exclude from sitemap · add `X-Robots-Tag: noindex` |
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
| *… 114 more* | | |

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
| `ChallengeWindow` | interface | 2 | WebPage |
| `DriftDeps` | interface | 5 | WebPage |

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
- `packaging/manifests/dockerhub-repository.md` (41 lines)
- `packaging/manifests/github-marketplace-listing.md` (80 lines)
- `packaging/manifests/vscode-extension.json` (24 lines)
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
  "description": "Runs AP2/Visa agentic-commerce compliance grading on every push and pull request and posts an 'Axis Compliance: <grade>' Check Run on the head commit. No workflow file or repository secret required — the App grades and reports via webhook once installed. (A standalone GitHub Action offering the same grading is available separately for repositories that prefer not to install an App.)",
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

### `packaging/manifests/dockerhub-repository.md`

````markdown
# Docker Hub Listing — axis-iliad

## Overview
Packaging and release kit for axis-iliad

## Tags
- `latest` — current stable build
- `1.0.0` — pinned semver

## Quick Start
```bash
docker run --rm -p ${PORT:-8080}:8080 <your-org>/axis-iliad:latest
```

## Environment
| Var | Default | Description |
|-----|---------|-------------|
| `PORT` | `8080` | HTTP listen port. Honored by the container entrypoint. |
| `NODE_ENV` | `production` | Runtime mode. Set to `development` for verbose logging. |

... (21 more lines)
````

### `packaging/manifests/github-marketplace-listing.md`

```markdown
# GitHub Marketplace Listing — Axis Iliad Compliance

**Status:** draft copy for the App listing (WO-G7). This file is submission content, not
executable config — the machine-readable source of truth for the App itself is
`.github/app-manifest.json`. Update both together if scope changes.

## Listing name

Axis Iliad Compliance

## Tagline (one line, shown in search results)

Automatic AP2/Visa agentic-commerce compliance grading on every push and pull request.

## Description

Axis Iliad Compliance watches your repository's `push` and `pull_request` events and posts an
"Axis Compliance: `<grade>`" Check Run on the head commit — no workflow file, no repository
secret, and no change to your CI required. Install it once; every commit after that gets graded
automatically.
... (60 more lines)
```

## Detected Page Files

| Page | Exports | Lines |
|------|---------|-------|
| `apps/web/index.html` | default | 181 |


---

## ⟳ Continue the loop

- **You are here:** `seo-rules.md` — agent step 9 of 71.
- **Next:** `route-priority-map.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
