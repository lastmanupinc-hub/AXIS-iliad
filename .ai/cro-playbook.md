# CRO Playbook — axis-iliad

> Conversion Rate Optimization playbook based on detected routes and architecture

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 9 top-level directories. It defines 278 domain models.

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

Detected page routes that are candidates for conversion optimization:

| Route | Method | CRO Action |
|-------|--------|-----------|
| `/health` | GET | Monitor usage metrics |
| `/v1/health` | GET | Track API adoption rate per endpoint |
| `/v1/accounts` | POST | Track API adoption rate per endpoint |
| `/v1/account` | GET | Track API adoption rate per endpoint |
| `/v1/account` | PATCH | Track API adoption rate per endpoint |
| `/v1/account` | DELETE | Track API adoption rate per endpoint |
| `/v1/snapshots` | POST | Track API adoption rate per endpoint |
| `/v1/admin/stats` | GET | Track API adoption rate per endpoint |
| `/v1/admin/accounts` | GET | Track API adoption rate per endpoint |
| `/v1/admin/activity` | GET | Track API adoption rate per endpoint |
| `/v1/admin/mcp-usage` | GET | Track API adoption rate per endpoint |
| `/v1/admin/revenue` | GET | Track API adoption rate per endpoint |
| `/v1/docs.md` | GET | Track API adoption rate per endpoint |
| `/for-agents` | GET | Monitor usage metrics |
| `/v1/install` | GET | Track API adoption rate per endpoint |
| `/v1/install/:platform` | GET | Track API adoption rate per endpoint |
| `/probe-intent` | POST | Monitor usage metrics |
| `/v1/error-codes` | GET | Track API adoption rate per endpoint |
| `/mcp` | POST | Monitor usage metrics |
| `/v1/analyze` | POST | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | GET | Track API adoption rate per endpoint |
| `/v1/snapshots/:snapshot_id` | DELETE | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/context` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id/generated-files` | GET | Track API adoption rate per endpoint |
| `/v1/projects/:project_id` | DELETE | Track API adoption rate per endpoint |
| … | | +125 more |

## Optimization Experiments

### Experiment 1: Authentication Flow

- **Route**: `GET /v1/auth/github`, `GET /v1/auth/github/callback`, `GET /v1/auth/google`, `GET /v1/auth/google/callback`, `POST /v1/auth/exchange`, `POST /v1/auth/session`, `POST /v1/auth/logout`
- **Hypothesis**: Social OAuth login will increase conversion by 30%
- **Metric**: Login success rate, abandonment rate
- **Variants**: A: Email/password only | B: OAuth (GitHub, Google) as primary
- **Duration**: 2 weeks

### Experiment 2: Pricing Page

- **Route**: `GET /pricing`
- **Hypothesis**: Highlighting the most popular plan will increase paid conversion by 15%
- **Metric**: Plan selection rate, paid conversion
- **Variants**: A: Equal weight pricing table | B: "Most Popular" badge on mid-tier
- **Duration**: 2 weeks

### Experiment 3: API First-Call Success

- **Routes**: `GET /v1/health`, `POST /v1/accounts`, `GET /v1/account`
- **Hypothesis**: An interactive API playground will increase developer activation by 40%
- **Metric**: Time to first successful API call, developer satisfaction
- **Variants**: A: Static API docs | B: Live try-it-now console in docs
- **Duration**: 4 weeks

### Experiment 4: Documentation Navigation

- **Route**: `GET /mcp/docs`, `GET /docs`
- **Hypothesis**: Task-oriented docs will reduce support issues by 30%
- **Metric**: Issue creation rate for how-to questions, docs bounce rate
- **Variants**: A: Current structure | B: Task-oriented guides ("How to X" pattern)
- **Duration**: 4 weeks

### Experiment 5: Onboarding Flow

- **Hypothesis**: A guided first-run wizard will increase first-value moment by 35%
- **Metric**: Features used in first session, time to first successful output
- **Context**: 174 routes — users need a path through the complexity
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


---

## ⟳ Continue the loop

- **You are here:** `cro-playbook.md` — agent step 24 of 71.
- **Next:** `notebook-summary.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
