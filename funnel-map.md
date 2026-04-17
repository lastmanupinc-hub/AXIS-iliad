# Funnel Map — axis-iliad

> User acquisition funnel from awareness to advocacy

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 163 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## 1. Awareness

**Goal**: Get the project in front of the target audience

### Touchpoints
- GitHub repository discovery (search, trending, explore)
- Technical blog posts and tutorials
- Social media mentions and threads
- Conference talks and meetup presentations
- Package registry listing (npm, PyPI, etc.)

### Metrics
- GitHub stars and forks
- Website/README page views
- Social media impressions

## 2. Interest

**Goal**: Convert awareness into active evaluation

### Touchpoints
- README quickstart section
- Documentation site / API reference
- Demo or playground environment
- Getting started guide

### Content Needs
- Architecture overview explaining design decisions
- Comparison table vs alternatives

### Metrics
- README read-through rate
- Documentation page views and time-on-page
- Clones and installs

## 3. Decision

**Goal**: Move from evaluation to first real usage

### Blockers to Address
- Clear installation instructions
- Minimum viable example that proves value in < 5 minutes
- Known limitations documented honestly
- Current known issues:
  - No lockfile found — dependency versions may be inconsistent

### Metrics
- First install to first successful run time
- Drop-off rate during onboarding
- Issue creation rate (signal of engagement)

## 4. Activation

**Goal**: User completes a meaningful action and sees value

### Key Activation Moments (by domain entity)
- Works with **AuthContext** (interface) for the first time
- Works with **EnvSpec** (interface) for the first time
- Works with **ValidationError** (interface) for the first time
- Works with **ValidationResult** (interface) for the first time
- Works with **ZipEntry** (interface) for the first time

### Action Triggers (POST routes)
- `POST /v1/accounts` — apps/api/src/admin.test.ts
- `POST /v1/snapshots` — apps/api/src/admin.test.ts
- `POST /probe-intent` — apps/api/src/agent-discovery.test.ts
- `POST /mcp` — apps/api/src/analyze-repo-success.test.ts
- `POST /v1/analyze` — apps/api/src/analyze.test.ts

### Metrics
- Feature usage depth (which features are used first)
- Return usage within 7 days
- Custom output generation (for generator tools)

## 5. Advocacy


### Triggers
- User shares on social media
- User opens a PR or contributes
- User creates content (blog post, video, tutorial)
- User recommends to team/peers

### Metrics
- Contributor count
- User-generated content pieces
- Referral installs
- NPS score

## Detected Product Entry Points

Map these to funnel stages — each is a potential conversion surface:

- `apps/api/src/server.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/main.tsx`
- `packages/context-engine/src/index.ts`
- `packages/generator-core/src/index.ts`
