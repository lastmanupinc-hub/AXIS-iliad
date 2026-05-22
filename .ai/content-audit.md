# Content Audit — axis-iliad

> Automated analysis of content structure, metadata coverage, and SEO readiness

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 17 top-level directories. It defines 249 domain models.

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
| Total LOC | 132543 |

## SEO Readiness Score

**60/100**

| Check | Status | Weight |
|-------|--------|--------|
| Server-Side Rendering | FAIL | 3 |
| Route Detection | PASS | 2 |
| Has TypeScript | PASS | 1 |
| Has CI/CD | PASS | 1 |
| Has README | FAIL | 1 |
| Has Tests | PASS | 1 |
| Architecture Layers | PASS | 1 |

## Content Files Analysis

- **Content files (md/mdx/html):** 155
- **Template files (tsx/jsx/vue/svelte):** 34
- **Total source files:** 500

## Page Components

These files likely render as individual pages:

| File | Language | LOC | SEO Action |
|------|----------|-----|------------|
| `apps/web/src/pages/AccountPage.tsx` | TypeScript | 597 | Needs meta tags |
| `apps/web/src/pages/AdminPage.tsx` | TypeScript | 194 | Needs meta tags |
| `apps/web/src/pages/DashboardPage.tsx` | TypeScript | 176 | Needs meta tags |
| `apps/web/src/pages/DocsPage.tsx` | TypeScript | 1249 | Needs meta tags |
| `apps/web/src/pages/ExamplesPage.tsx` | TypeScript | 479 | Needs meta tags |
| `apps/web/src/pages/ForAgentsPage.tsx` | TypeScript | 152 | Needs meta tags |
| `apps/web/src/pages/HelpPage.tsx` | TypeScript | 734 | Needs meta tags |
| `apps/web/src/pages/InstallPage.tsx` | TypeScript | 186 | Needs meta tags |
| `apps/web/src/pages/MyAnalyticsPage.tsx` | TypeScript | 218 | Needs meta tags |
| `apps/web/src/pages/PlansPage.tsx` | TypeScript | 231 | Needs meta tags |
| `apps/web/src/pages/ProgramsPage.tsx` | TypeScript | 300 | Needs meta tags |
| `apps/web/src/pages/QAPage.tsx` | TypeScript | 372 | Needs meta tags |
| `apps/web/src/pages/TermsPage.tsx` | TypeScript | 331 | Needs meta tags |
| `apps/web/src/pages/tools/WebResearchPage.tsx` | TypeScript | 198 | Needs meta tags |
| `apps/web/src/pages/ToolsIndexPage.tsx` | TypeScript | 185 | Needs meta tags |
| `apps/web/src/pages/UploadPage.tsx` | TypeScript | 582 | Needs meta tags |

## Recommendations

- **CRITICAL:** No SSR framework detected. Client-only rendering hurts SEO. Consider Next.js, Nuxt, or SvelteKit.
- **WARNING:** 16 page components found but no SSR. These pages may not be indexed.

## Core Web Vitals Checklist

- [ ] Largest Contentful Paint (LCP) < 2.5s
- [ ] First Input Delay (FID) < 100ms
- [ ] Cumulative Layout Shift (CLS) < 0.1
- [ ] Enable image optimization (WebP/AVIF, lazy loading)
- [ ] Minify CSS and JavaScript bundles
- [ ] Use font-display: swap for web fonts
- [ ] Preload critical resources

## Detected Content Files

- `ab-test-plan.md` (91 lines)
- `agent-purchasing-playbook.md` (443 lines)
- `AGENTS.md` (328 lines)
- `apps/web/index.html` (167 lines)
- `architecture-summary.md` (1947 lines)
- `artifact-spec.md` (146 lines)
- `asset-checklist.md` (50 lines)
- `asset-guidelines.md` (65 lines)
- `AXIS_Board_Pitch.md` (504 lines)
- `AXIS_DEMO_REPORT.md` (274 lines)
- `brand-board.md` (151 lines)
- `brand-guidelines.md` (92 lines)

## Page Component Analysis

| Component | Has Meta | Lines |
|-----------|----------|-------|
| `apps/web/src/components/ToolPage.tsx` | Yes | 189 |
| `apps/web/src/pages/AccountPage.tsx` | **Missing** | 630 |
| `apps/web/src/pages/AdminPage.tsx` | **Missing** | 206 |
| `apps/web/src/pages/DashboardPage.tsx` | **Missing** | 197 |
| `apps/web/src/pages/DocsPage.tsx` | Yes | 1293 |
| `apps/web/src/pages/ExamplesPage.tsx` | Yes | 505 |
| `apps/web/src/pages/ForAgentsPage.tsx` | **Missing** | 168 |
| `apps/web/src/pages/HelpPage.tsx` | Yes | 769 |
| `apps/web/src/pages/InstallPage.tsx` | **Missing** | 205 |
| `apps/web/src/pages/MyAnalyticsPage.tsx` | **Missing** | 241 |
| `apps/web/src/pages/PlansPage.tsx` | **Missing** | 249 |
| `apps/web/src/pages/ProgramsPage.tsx` | **Missing** | 333 |
| `apps/web/src/pages/QAPage.tsx` | Yes | 397 |
| `apps/web/src/pages/TermsPage.tsx` | Yes | 372 |
| `apps/web/src/pages/tools/WebResearchPage.tsx` | Yes | 223 |
