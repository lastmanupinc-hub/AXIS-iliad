# Collection Map — axis-iliad

Generated: 1970-01-01T00:00:00.000Z

## Collection Overview

A curated set of generative art pieces derived from the structure,
metrics, and architecture of axis-iliad.

## Project Summary

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 9 top-level directories. It defines 278 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Pieces

### 1. Dependency Network

- **Type**: Force-directed graph
- **Nodes**: 40 (derived: entry points ×3 + hotspots ×2)
- **Edges**: Based on import graph density
- **Color mapping**: Language → hue
- **Animation**: Continuous force simulation
- **Source**: generative-sketch.ts

### 2. Language Ring

- **Type**: Concentric ring visualization
- **Rings**: One per language, radius ∝ LOC percentage
  - TypeScript: 72% → radius 216px
  - YAML: 12.6% → radius 38px
  - Markdown: 8.8% → radius 26px
  - JSON: 2.9% → radius 9px
  - JavaScript: 1.8% → radius 5px
  - CSS: 1.7% → radius 5px
  - HTML: 0.2% → radius 2px
  - PowerShell: 0% → radius 2px
  - Shell: 0% → radius 2px
  - Dockerfile: 0% → radius 2px
- **Animation**: Slow rotation, pulse on interaction

### 3. Architecture Terrain

- **Type**: Topographic height map
- **Elevation**: Architecture score 64/100 → height multiplier
- **Ridges**: monorepo, containerized
- **Strata**:
  - presentation: apps
- **Animation**: Perlin noise drift

### 4. Hotspot Constellation

- **Type**: Star field / particle system
- **Stars**: 20 hotspot files
- **Brightest stars (highest risk)**:
  - `apps/api/src/router.ts` (risk: 1.0, connections: 117)
  - `apps/api/src/test-helpers.ts` (risk: 1.0, connections: 55)
  - `apps/api/src/billing.ts` (risk: 1.0, connections: 47)
  - `apps/api/src/handlers.ts` (risk: 1.0, connections: 57)
  - `apps/api/src/rate-limiter.ts` (risk: 1.0, connections: 48)
- **Brightness**: risk_score mapped to luminosity
- **Size**: inbound + outbound connections
- **Animation**: Twinkling, slow drift

## Collection Metadata

| Property | Value |
|----------|-------|
| Total Pieces | 4 |
| Source Project | axis-iliad |
| Data Points | 32 |
| Domain Models | 278 |
| Routes | 174 |
| Total Files | 500 |
| Total LOC | 108805 |
| Render Target | Canvas 2D / WebGL |
| Parameter Pack | parameter-pack.json |

## Source File Tree

```
.github/actions/compliance-check/action.yml (13.0 KB)
.github/actions/context-freshness/README.md (5.3 KB)
.github/actions/context-freshness/action.yml (6.0 KB)
.github/app-manifest.json (1.0 KB)
.github/dependabot.yml (1.6 KB)
.github/workflows/ci.yml (11.0 KB)
.github/workflows/compliance-check.yml (1.7 KB)
.github/workflows/context-freshness.yml (0.9 KB)
.github/workflows/release.yml (1.9 KB)
.github/workflows/synthetic.yml (3.6 KB)
.gitignore (1.2 KB)
.prettierrc.json (0.1 KB)
.tmp-vitest.json (68.7 KB)
ACTIVATION_TRACKER.md (7.9 KB)
AGENTS.md (7.0 KB)
AXIS_Board_Pitch.md (30.7 KB)
AXIS_DEMO_REPORT.md (12.4 KB)
CHANGELOG.md (7.8 KB)
CLAUDE.md (7.9 KB)
CODE_TO_DOCS_BUILD_STRATEGY.md (11.1 KB)
COMPLIANCE_KIT_BUILD_SPEC.md (10.9 KB)
CONTRIBUTING.md (6.4 KB)
DEPLOY_OFF_ACTIONS_RUNBOOK.md (10.6 KB)
DISTRIBUTABLE.md (0.6 KB)
Dockerfile (0.9 KB)
… 475 more entries omitted
```


---

## ⟳ Continue the loop

- **You are here:** `collection-map.md` — agent step 49 of 71.
- **Next:** `dependency-hotspots.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
