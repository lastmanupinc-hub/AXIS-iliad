# Content Audit — axis-iliad

> Automated analysis of content structure, metadata coverage, and SEO readiness

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Project Type Assessment

| Attribute | Value |
|-----------|-------|
| Project Type | monorepo |
| Primary Language | TypeScript |
| Frameworks | React |
| Total Files | 500 |
| Total LOC | 115124 |

## SEO & Engineering Readiness Score

**70/100**

> Blends deployed-site SEO signals (SSR, route detection) with project-health signals (TypeScript, CI, README, tests, layering). A high score needs the SSR/route checks below to pass — engineering hygiene alone won't index a client-only SPA.

| Check | Status | Weight |
|-------|--------|--------|
| Server-Side Rendering | FAIL | 3 |
| Route Detection | PASS | 2 |
| Has TypeScript | PASS | 1 |
| Has CI/CD | PASS | 1 |
| Has README | PASS | 1 |
| Has Tests | PASS | 1 |
| Architecture Layers | PASS | 1 |

## Content Files Analysis

- **Content files (md/mdx/html):** 117
- **Template files (tsx/jsx/vue/svelte):** 35
- **Total source files:** 500

## Page Components

These files likely render as individual pages:

| File | Language | LOC | SEO Action |
|------|----------|-----|------------|
| `apps/web/src/pages/AccountPage.tsx` | TypeScript | 567 | Needs meta tags |
| `apps/web/src/pages/AdminPage.tsx` | TypeScript | 320 | Needs meta tags |
| `apps/web/src/pages/DashboardPage.tsx` | TypeScript | 176 | Needs meta tags |
| `apps/web/src/pages/DocsPage.tsx` | TypeScript | 1249 | Needs meta tags |
| `apps/web/src/pages/ExamplesPage.tsx` | TypeScript | 634 | Needs meta tags |
| `apps/web/src/pages/ForAgentsPage.tsx` | TypeScript | 188 | Needs meta tags |
| `apps/web/src/pages/HelpPage.tsx` | TypeScript | 735 | Needs meta tags |
| `apps/web/src/pages/InstallPage.tsx` | TypeScript | 186 | Needs meta tags |
| `apps/web/src/pages/MyAnalyticsPage.tsx` | TypeScript | 218 | Needs meta tags |
| `apps/web/src/pages/PaidCheckoutPage.tsx` | TypeScript | 149 | Needs meta tags |
| `apps/web/src/pages/PlansPage.tsx` | TypeScript | 237 | Needs meta tags |
| `apps/web/src/pages/ProgramsPage.tsx` | TypeScript | 309 | Needs meta tags |
| `apps/web/src/pages/QAPage.tsx` | TypeScript | 372 | Needs meta tags |
| `apps/web/src/pages/TermsPage.tsx` | TypeScript | 331 | Needs meta tags |
| `apps/web/src/pages/ToolsIndexPage.tsx` | TypeScript | 185 | Needs meta tags |
| `apps/web/src/pages/UploadPage.tsx` | TypeScript | 582 | Needs meta tags |
| `apps/web/src/pages/tools/WebResearchPage.tsx` | TypeScript | 198 | Needs meta tags |

## Recommendations

- **CRITICAL:** No SSR framework detected. Client-only rendering hurts SEO. Consider Next.js, Nuxt, or SvelteKit.
- **WARNING:** 17 page components found but no SSR. These pages may not be indexed.

## Core Web Vitals Checklist

- [ ] Largest Contentful Paint (LCP) < 2.5s
- [ ] First Input Delay (FID) < 100ms
- [ ] Cumulative Layout Shift (CLS) < 0.1
- [ ] Enable image optimization (WebP/AVIF, lazy loading)
- [ ] Minify CSS and JavaScript bundles
- [ ] Use font-display: swap for web fonts
- [ ] Preload critical resources

## Detected Meta-Tag Gaps (deterministic)

> Static per-page scan — grep + a fixed rule table, **no AI**. `ERROR` = missing a crawl/SERP essential (title, description); `WARNING` = missing a social/duplicate-content signal (canonical, Open Graph).

| Class | Count |
|-------|-------|
| ERROR | 26 |
| WARNING | 34 |

| Page | Category | Class | Note |
|------|----------|-------|------|
| `apps/web/src/pages/AccountPage.tsx` | no-description | ERROR | no meta description signal — add one (≤160 chars) |
| `apps/web/src/pages/AccountPage.tsx` | no-title | ERROR | no <title>/metadata signal — page needs a unique title |
| `apps/web/src/pages/AdminPage.tsx` | no-description | ERROR | no meta description signal — add one (≤160 chars) |
| `apps/web/src/pages/AdminPage.tsx` | no-title | ERROR | no <title>/metadata signal — page needs a unique title |
| `apps/web/src/pages/DashboardPage.tsx` | no-description | ERROR | no meta description signal — add one (≤160 chars) |
| `apps/web/src/pages/DashboardPage.tsx` | no-title | ERROR | no <title>/metadata signal — page needs a unique title |
| `apps/web/src/pages/ExamplesPage.tsx` | no-description | ERROR | no meta description signal — add one (≤160 chars) |
| `apps/web/src/pages/ExamplesPage.tsx` | no-title | ERROR | no <title>/metadata signal — page needs a unique title |
| `apps/web/src/pages/ForAgentsPage.tsx` | no-description | ERROR | no meta description signal — add one (≤160 chars) |
| `apps/web/src/pages/ForAgentsPage.tsx` | no-title | ERROR | no <title>/metadata signal — page needs a unique title |
| `apps/web/src/pages/HelpPage.tsx` | no-description | ERROR | no meta description signal — add one (≤160 chars) |
| `apps/web/src/pages/HelpPage.tsx` | no-title | ERROR | no <title>/metadata signal — page needs a unique title |
| `apps/web/src/pages/InstallPage.tsx` | no-description | ERROR | no meta description signal — add one (≤160 chars) |
| `apps/web/src/pages/InstallPage.tsx` | no-title | ERROR | no <title>/metadata signal — page needs a unique title |
| `apps/web/src/pages/MyAnalyticsPage.tsx` | no-description | ERROR | no meta description signal — add one (≤160 chars) |
| `apps/web/src/pages/MyAnalyticsPage.tsx` | no-title | ERROR | no <title>/metadata signal — page needs a unique title |
| `apps/web/src/pages/PaidCheckoutPage.tsx` | no-description | ERROR | no meta description signal — add one (≤160 chars) |
| `apps/web/src/pages/PaidCheckoutPage.tsx` | no-title | ERROR | no <title>/metadata signal — page needs a unique title |
| `apps/web/src/pages/PlansPage.tsx` | no-description | ERROR | no meta description signal — add one (≤160 chars) |
| `apps/web/src/pages/PlansPage.tsx` | no-title | ERROR | no <title>/metadata signal — page needs a unique title |
| `apps/web/src/pages/ProgramsPage.tsx` | no-description | ERROR | no meta description signal — add one (≤160 chars) |
| `apps/web/src/pages/ProgramsPage.tsx` | no-title | ERROR | no <title>/metadata signal — page needs a unique title |
| `apps/web/src/pages/ToolsIndexPage.tsx` | no-description | ERROR | no meta description signal — add one (≤160 chars) |
| `apps/web/src/pages/ToolsIndexPage.tsx` | no-title | ERROR | no <title>/metadata signal — page needs a unique title |
| `apps/web/src/pages/UploadPage.tsx` | no-description | ERROR | no meta description signal — add one (≤160 chars) |
| `apps/web/src/pages/UploadPage.tsx` | no-title | ERROR | no <title>/metadata signal — page needs a unique title |
| `apps/web/src/pages/AccountPage.tsx` | no-canonical | WARNING | no canonical URL signal — set one to avoid duplicate-content dilution |
| `apps/web/src/pages/AccountPage.tsx` | no-og | WARNING | no Open Graph / Twitter card signal — poor social sharing preview |
| `apps/web/src/pages/AdminPage.tsx` | no-canonical | WARNING | no canonical URL signal — set one to avoid duplicate-content dilution |
| `apps/web/src/pages/AdminPage.tsx` | no-og | WARNING | no Open Graph / Twitter card signal — poor social sharing preview |
| `apps/web/src/pages/DashboardPage.tsx` | no-canonical | WARNING | no canonical URL signal — set one to avoid duplicate-content dilution |
| `apps/web/src/pages/DashboardPage.tsx` | no-og | WARNING | no Open Graph / Twitter card signal — poor social sharing preview |
| `apps/web/src/pages/DocsPage.tsx` | no-canonical | WARNING | no canonical URL signal — set one to avoid duplicate-content dilution |
| `apps/web/src/pages/DocsPage.tsx` | no-og | WARNING | no Open Graph / Twitter card signal — poor social sharing preview |
| `apps/web/src/pages/ExamplesPage.tsx` | no-canonical | WARNING | no canonical URL signal — set one to avoid duplicate-content dilution |
| `apps/web/src/pages/ExamplesPage.tsx` | no-og | WARNING | no Open Graph / Twitter card signal — poor social sharing preview |
| `apps/web/src/pages/ForAgentsPage.tsx` | no-canonical | WARNING | no canonical URL signal — set one to avoid duplicate-content dilution |
| `apps/web/src/pages/ForAgentsPage.tsx` | no-og | WARNING | no Open Graph / Twitter card signal — poor social sharing preview |
| `apps/web/src/pages/HelpPage.tsx` | no-canonical | WARNING | no canonical URL signal — set one to avoid duplicate-content dilution |
| `apps/web/src/pages/HelpPage.tsx` | no-og | WARNING | no Open Graph / Twitter card signal — poor social sharing preview |
| … | | | +20 more |

## Detected Content Files

- `.github/actions/context-freshness/README.md` (131 lines)
- `ACTIVATION_TRACKER.md` (100 lines)
- `AGENTS.md` (195 lines)
- `AXIS_Board_Pitch.md` (504 lines)
- `AXIS_DEMO_REPORT.md` (274 lines)
- `CHANGELOG.md` (93 lines)
- `CLAUDE.md` (231 lines)
- `CONTRIBUTING.md` (164 lines)
- `DEPLOY_OFF_ACTIONS_RUNBOOK.md` (189 lines)
- `DISTRIBUTABLE.md` (29 lines)
- `E5_LIVING_ARCHITECTURE_DESIGN.md` (62 lines)
- `E9_COMMERCE_INTEGRATION_DESIGN.md` (38 lines)

## Page Component Analysis

| Component | Has Meta | Lines |
|-----------|----------|-------|
| `apps/web/src/components/ToolPage.tsx` | Yes | 189 |
| `apps/web/src/pages/AccountPage.tsx` | **Missing** | 599 |
| `apps/web/src/pages/AdminPage.tsx` | **Missing** | 334 |
| `apps/web/src/pages/DashboardPage.tsx` | **Missing** | 197 |
| `apps/web/src/pages/DocsPage.tsx` | Yes | 1293 |
| `apps/web/src/pages/ExamplesPage.tsx` | Yes | 679 |
| `apps/web/src/pages/ForAgentsPage.tsx` | **Missing** | 206 |
| `apps/web/src/pages/HelpPage.tsx` | Yes | 770 |
| `apps/web/src/pages/InstallPage.tsx` | **Missing** | 205 |
| `apps/web/src/pages/MyAnalyticsPage.tsx` | **Missing** | 241 |
| `apps/web/src/pages/PaidCheckoutPage.tsx` | **Missing** | 177 |
| `apps/web/src/pages/PlansPage.tsx` | **Missing** | 257 |
| `apps/web/src/pages/ProgramsPage.tsx` | **Missing** | 343 |
| `apps/web/src/pages/QAPage.tsx` | Yes | 397 |
| `apps/web/src/pages/TermsPage.tsx` | Yes | 372 |


---

## ⟳ Continue the loop

- **You are here:** `content-audit.md` — agent step 11 of 70.
- **Next:** `optimization-rules.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
