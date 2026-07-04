# Collection Map — axis-iliad

Generated: 1970-01-01T00:00:00.000Z

## Collection Overview

A curated set of generative art pieces derived from the structure,
metrics, and architecture of axis-iliad.

## Project Summary

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Pieces

### 1. Dependency Network

- **Type**: Force-directed graph
- **Nodes**: 20 (entry points + hotspots)
- **Edges**: Based on import graph density
- **Color mapping**: Language → hue
- **Animation**: Continuous force simulation
- **Source**: generative-sketch.ts

### 2. Language Ring

- **Type**: Concentric ring visualization
- **Rings**: One per language, radius ∝ LOC percentage
  - TypeScript: 80% → radius 240px
  - YAML: 9.5% → radius 29px
  - Markdown: 5.6% → radius 17px
  - JavaScript: 2% → radius 6px
  - JSON: 1.7% → radius 5px
  - CSS: 1% → radius 3px
  - HTML: 0.1% → radius 0px
  - Dockerfile: 0% → radius 0px
- **Animation**: Slow rotation, pulse on interaction

### 3. Architecture Terrain

- **Type**: Topographic height map
- **Elevation**: Architecture score 65/100 → height multiplier
- **Ridges**: monorepo, containerized
- **Strata**:
  - presentation: apps, frontend
- **Animation**: Perlin noise drift

### 4. Hotspot Constellation

- **Type**: Star field / particle system
- **Stars**: 20 hotspot files
- **Brightest stars (highest risk)**:
  - `apps/api/src/router.ts` (risk: 1.0, connections: 100)
  - `apps/api/src/test-helpers.ts` (risk: 1.0, connections: 42)
  - `apps/api/src/billing.ts` (risk: 1.0, connections: 31)
  - `apps/api/src/handlers.ts` (risk: 1.0, connections: 37)
  - `apps/api/src/rate-limiter.ts` (risk: 1.0, connections: 38)
- **Brightness**: risk_score mapped to luminosity
- **Size**: inbound + outbound connections
- **Animation**: Twinkling, slow drift

## Collection Metadata

| Property | Value |
|----------|-------|
| Total Pieces | 4 |
| Source Project | axis-iliad |
| Data Points | 30 |
| Domain Models | 242 |
| Routes | 163 |
| Total Files | 500 |
| Total LOC | 115124 |
| Render Target | Canvas 2D / WebGL |
| Parameter Pack | parameter-pack.json |

## Source File Tree

```
.github/actions/compliance-check/action.yml (12.3 KB)
.github/actions/context-freshness/README.md (5.3 KB)
.github/actions/context-freshness/action.yml (6.0 KB)
.github/app-manifest.json (0.9 KB)
.github/workflows/ci.yml (8.5 KB)
.github/workflows/compliance-check.yml (0.7 KB)
.github/workflows/context-freshness.yml (0.9 KB)
.github/workflows/release.yml (0.6 KB)
.gitignore (0.6 KB)
.prettierrc.json (0.1 KB)
.tmp-vitest.json (68.7 KB)
ACTIVATION_TRACKER.md (7.6 KB)
AGENTS.md (7.0 KB)
AXIS_Board_Pitch.md (30.7 KB)
AXIS_DEMO_REPORT.md (12.3 KB)
CHANGELOG.md (7.8 KB)
CLAUDE.md (7.0 KB)
CONTRIBUTING.md (6.4 KB)
DEPLOY_OFF_ACTIONS_RUNBOOK.md (10.6 KB)
DISTRIBUTABLE.md (0.6 KB)
Dockerfile (0.9 KB)
E5_LIVING_ARCHITECTURE_DESIGN.md (4.7 KB)
E9_COMMERCE_INTEGRATION_DESIGN.md (4.0 KB)
ENV_ROUTING_MAP.md (10.5 KB)
FRONTEND_DEEP_DIVE.md (19.1 KB)
```


---

## ⟳ Continue the loop

- **You are here:** `collection-map.md` — agent step 49 of 70.
- **Next:** `dependency-hotspots.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
