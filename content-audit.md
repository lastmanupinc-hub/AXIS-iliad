# Content Audit — axis-toolbox

> Automated analysis of content structure, metadata coverage, and SEO readiness

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 500 files across 20 top-level directories. It defines 152 domain models.

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
| Total LOC | 114357 |

## SEO Readiness Score

**70/100**

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

- **Content files (md/mdx/html):** 174
- **Template files (tsx/jsx/vue/svelte):** 29
- **Total source files:** 500

## Page Components

These files likely render as individual pages:

| File | Language | LOC | SEO Action |
|------|----------|-----|------------|
| `apps/web/src/pages/AccountPage.tsx` | TypeScript | 591 | Needs meta tags |
| `apps/web/src/pages/DashboardPage.tsx` | TypeScript | 160 | Needs meta tags |
| `apps/web/src/pages/DocsPage.tsx` | TypeScript | 1248 | Needs meta tags |
| `apps/web/src/pages/ExamplesPage.tsx` | TypeScript | 479 | Needs meta tags |
| `apps/web/src/pages/ForAgentsPage.tsx` | TypeScript | 698 | Needs meta tags |
| `apps/web/src/pages/HelpPage.tsx` | TypeScript | 723 | Needs meta tags |
| `apps/web/src/pages/InstallPage.tsx` | TypeScript | 185 | Needs meta tags |
| `apps/web/src/pages/PlansPage.tsx` | TypeScript | 224 | Needs meta tags |
| `apps/web/src/pages/ProgramsPage.tsx` | TypeScript | 282 | Needs meta tags |
| `apps/web/src/pages/QAPage.tsx` | TypeScript | 367 | Needs meta tags |
| `apps/web/src/pages/TermsPage.tsx` | TypeScript | 318 | Needs meta tags |
| `apps/web/src/pages/UploadPage.tsx` | TypeScript | 486 | Needs meta tags |

## Recommendations

- **CRITICAL:** No SSR framework detected. Client-only rendering hurts SEO. Consider Next.js, Nuxt, or SvelteKit.
- **WARNING:** 12 page components found but no SSR. These pages may not be indexed.

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
- `AGENTS.md` (333 lines)
- `apps/web/index.html` (128 lines)
- `architecture-summary.md` (1603 lines)
- `artifact-spec.md` (136 lines)
- `asset-checklist.md` (50 lines)
- `asset-guidelines.md` (65 lines)
- `AXIS_Board_Pitch.md` (504 lines)
- `AXIS_DEMO_REPORT.md` (274 lines)
- `brand-board.md` (147 lines)
- `brand-guidelines.md` (93 lines)

## Page Component Analysis

| Component | Has Meta | Lines |
|-----------|----------|-------|
| `apps/web/src/pages/AccountPage.tsx` | **Missing** | 623 |
| `apps/web/src/pages/DashboardPage.tsx` | **Missing** | 180 |
| `apps/web/src/pages/DocsPage.tsx` | **Missing** | 1292 |
| `apps/web/src/pages/ExamplesPage.tsx` | Yes | 505 |
| `apps/web/src/pages/ForAgentsPage.tsx` | Yes | 896 |
| `apps/web/src/pages/HelpPage.tsx` | Yes | 758 |
| `apps/web/src/pages/InstallPage.tsx` | **Missing** | 204 |
| `apps/web/src/pages/PlansPage.tsx` | **Missing** | 242 |
| `apps/web/src/pages/ProgramsPage.tsx` | **Missing** | 313 |
| `apps/web/src/pages/QAPage.tsx` | Yes | 392 |
| `apps/web/src/pages/TermsPage.tsx` | Yes | 357 |
| `apps/web/src/pages/UploadPage.tsx` | **Missing** | 537 |
