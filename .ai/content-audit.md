# Content Audit — axis-iliad

> Automated analysis of content structure, metadata coverage, and SEO readiness

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 9 top-level directories. It defines 278 domain models.

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
| Total LOC | 108805 |

## SEO & Engineering Readiness Score

**70/100**

> Blends deployed-site SEO signals (SSR, route detection) with project-health signals (TypeScript, CI, README, tests, layering). A high score needs the SSR/route checks below to pass — engineering hygiene alone won't index a client-only SPA.

| Check | Status | Weight |
|-------|--------|--------|
| Server-Side Rendering | FAIL | 3 |
| Indexable Page Routes | PASS | 2 |
| Has TypeScript | PASS | 1 |
| Has CI/CD | PASS | 1 |
| Has README | PASS | 1 |
| Has Tests | PASS | 1 |
| Architecture Layers | PASS | 1 |

## Content Files Analysis

- **Content files (md/mdx/html):** 162
- **Template files (tsx/jsx/vue/svelte):** 26
- **Total source files:** 500

## Recommendations

- **CRITICAL:** No SSR framework detected. Client-only rendering hurts SEO. Consider Next.js, Nuxt, or SvelteKit.

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

_Every scanned page shows a title, description, canonical, and Open Graph signal._

## Detected Content Files

- `ACTIVATION_TRACKER.md` (105 lines)
- `AGENTS.md` (195 lines)
- `AXIS_Board_Pitch.md` (504 lines)
- `AXIS_DEMO_REPORT.md` (276 lines)
- `CHANGELOG.md` (93 lines)
- `CLAUDE.md` (235 lines)
- `CODE_TO_DOCS_BUILD_STRATEGY.md` (99 lines)
- `COMPLIANCE_KIT_BUILD_SPEC.md` (175 lines)
- `CONTRIBUTING.md` (164 lines)
- `DEPLOY_OFF_ACTIONS_RUNBOOK.md` (189 lines)
- `DISTRIBUTABLE.md` (29 lines)
- `E5_LIVING_ARCHITECTURE_DESIGN.md` (62 lines)


---

## ⟳ Continue the loop

- **You are here:** `content-audit.md` — agent step 11 of 71.
- **Next:** `optimization-rules.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
