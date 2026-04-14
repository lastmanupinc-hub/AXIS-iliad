# A/B Test Plan — axis-toolbox

Generated: 2026-04-14T03:53:42.824Z

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 500 files across 20 top-level directories. It defines 152 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Test Framework Setup

**Recommended**: Client-side feature flag with cookie persistence
- Set variant on first visit, persist in cookie
- Read variant cookie before rendering

## Priority Tests

### Test 1: Landing Page Hero

| Parameter | Value |
|-----------|-------|
| Target page | / |
| Hypothesis | A benefit-driven headline increases signup rate |
| Primary metric | Signup conversion rate |
| Secondary metric | Time on page, scroll depth |
| Sample size | Min. 1,000 visitors per variant |
| Duration | 14 days minimum |
| Confidence | 95% statistical significance |

| Variant | Description |
|---------|-------------|
| Control | Current hero copy |
| A | Feature-focused: "axis-toolbox analyzes your codebase in seconds" |
| B | Outcome-focused: "Ship faster with AI that understands your code" |

### Test 2: Primary CTA

| Parameter | Value |
|-----------|-------|
| Target | All pages with CTA |
| Hypothesis | Action-specific CTA text outperforms generic |
| Primary metric | Click-through rate |
| Sample size | Min. 500 exposures per variant |
| Duration | 7 days |

| Variant | CTA Text | Color |
|---------|----------|-------|
| Control | "Get Started" | Primary |
| A | "Analyze My Repo" | Primary |
| B | "Try axis-toolbox Free" | Accent |

### Test 3: Pricing Page Layout

| Parameter | Value |
|-----------|-------|
| Target page | /pricing |
| Hypothesis | Highlighting popular plan increases conversions |
| Primary metric | Plan selection rate |
| Secondary metric | Revenue per visitor |

| Variant | Description |
|---------|-------------|
| Control | Equal-weight plan cards |
| A | "Most Popular" badge on mid-tier plan |
| B | Feature comparison table below cards |

## Experiment Guardrails

- **Never test on authenticated flows** without rollback plan
- **Minimum sample size**: 500 per variant before reading results
- **Kill criteria**: If error rate increases >1% in any variant, stop test
- **One test per page**: Never run overlapping experiments on same surface
- **Document everything**: Record hypothesis, variants, results, and learnings

## Metrics Collection

| Event | Trigger | Properties |
|-------|---------|------------|
| `experiment_viewed` | Page load with active test | variant_id, test_id |
| `experiment_converted` | Primary action completed | variant_id, test_id, value |
| `experiment_bounced` | Left without action | variant_id, test_id, time_on_page |

## Existing Test Infrastructure

Found 131 test files — leverage this infrastructure for experiment validation.
