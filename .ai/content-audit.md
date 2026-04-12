# Content Audit — axis-toolbox

> Automated analysis of content structure, metadata coverage, and SEO readiness

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 432 files across 20 top-level directories. It defines 131 domain models.

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
| Total Files | 432 |
| Total LOC | 95217 |

## SEO Readiness Score

**60/100**

| Check | Status | Weight |
|-------|--------|--------|
| Server-Side Rendering | FAIL | 3 |
| Route Detection | PASS | 2 |
| Has TypeScript | PASS | 1 |
| Has CI/CD | FAIL | 1 |
| Has README | PASS | 1 |
| Has Tests | PASS | 1 |
| Architecture Layers | PASS | 1 |

## Content Files Analysis

- **Content files (md/mdx/html):** 121
- **Template files (tsx/jsx/vue/svelte):** 24
- **Total source files:** 432

## Page Components

These files likely render as individual pages:

| File | Language | LOC | SEO Action |
|------|----------|-----|------------|
| `apps/web/src/pages/AccountPage.tsx` | TypeScript | 542 | Needs meta tags |
| `apps/web/src/pages/DashboardPage.tsx` | TypeScript | 141 | Needs meta tags |
| `apps/web/src/pages/DocsPage.tsx` | TypeScript | 1248 | Needs meta tags |
| `apps/web/src/pages/HelpPage.tsx` | TypeScript | 723 | Needs meta tags |
| `apps/web/src/pages/PlansPage.tsx` | TypeScript | 224 | Needs meta tags |
| `apps/web/src/pages/ProgramsPage.tsx` | TypeScript | 282 | Needs meta tags |
| `apps/web/src/pages/QAPage.tsx` | TypeScript | 367 | Needs meta tags |
| `apps/web/src/pages/TermsPage.tsx` | TypeScript | 318 | Needs meta tags |
| `apps/web/src/pages/UploadPage.tsx` | TypeScript | 470 | Needs meta tags |

## Recommendations

- **CRITICAL:** No SSR framework detected. Client-only rendering hurts SEO. Consider Next.js, Nuxt, or SvelteKit.
- **WARNING:** 9 page components found but no SSR. These pages may not be indexed.

## Core Web Vitals Checklist

- [ ] Largest Contentful Paint (LCP) < 2.5s
- [ ] First Input Delay (FID) < 100ms
- [ ] Cumulative Layout Shift (CLS) < 0.1
- [ ] Enable image optimization (WebP/AVIF, lazy loading)
- [ ] Minify CSS and JavaScript bundles
- [ ] Use font-display: swap for web fonts
- [ ] Preload critical resources

## Detected Content Files

- `AGENTS.md` (128 lines)
- `apps/web/index.html` (121 lines)
- `architecture-summary.md` (136 lines)
- `artifact-spec.md` (39 lines)
- `AXIS_Board_Pitch.md` (504 lines)
- `AXIS_DEMO_REPORT.md` (273 lines)
- `brand-guidelines.md` (190 lines)
- `canvas-pack.md` (215 lines)
- `CHANGELOG.md` (73 lines)
- `CLAUDE.md` (13 lines)
- `cloudflare-pages.md` (34 lines)
- `CONTRIBUTING.md` (93 lines)

## Page Component Analysis

| Component | Has Meta | Lines |
|-----------|----------|-------|
| `apps/web/src/pages/AccountPage.tsx` | **Missing** | 573 |
| `apps/web/src/pages/DashboardPage.tsx` | **Missing** | 158 |
| `apps/web/src/pages/DocsPage.tsx` | **Missing** | 1292 |
| `apps/web/src/pages/HelpPage.tsx` | Yes | 758 |
| `apps/web/src/pages/PlansPage.tsx` | **Missing** | 242 |
| `apps/web/src/pages/ProgramsPage.tsx` | **Missing** | 313 |
| `apps/web/src/pages/QAPage.tsx` | Yes | 392 |
| `apps/web/src/pages/TermsPage.tsx` | Yes | 357 |
| `apps/web/src/pages/UploadPage.tsx` | **Missing** | 520 |
