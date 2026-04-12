# Collection Map — axis-toolbox

Generated: 2026-04-11T22:24:47.574Z

## Collection Overview

A curated set of generative art pieces derived from the structure,
metrics, and architecture of axis-toolbox.

## Project Summary

axis-toolbox is a monorepo built with TypeScript using React. It contains 432 files across 20 top-level directories. It defines 131 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Pieces

### 1. Dependency Network

- **Type**: Force-directed graph
- **Nodes**: 6 (entry points + hotspots)
- **Edges**: Based on import graph density
- **Color mapping**: Language → hue
- **Animation**: Continuous force simulation
- **Source**: generative-sketch.ts

### 2. Language Ring

- **Type**: Concentric ring visualization
- **Rings**: One per language, radius ∝ LOC percentage
  - TypeScript: 71.2% → radius 214px
  - YAML: 16% → radius 48px
  - JSON: 6.9% → radius 21px
  - Markdown: 4.2% → radius 13px
  - CSS: 0.9% → radius 3px
  - JavaScript: 0.7% → radius 2px
  - HTML: 0.1% → radius 0px
  - Dockerfile: 0.1% → radius 0px
- **Animation**: Slow rotation, pulse on interaction

### 3. Architecture Terrain

- **Type**: Topographic height map
- **Elevation**: Architecture score 0.64/100 → height multiplier
- **Ridges**: monorepo, containerized
- **Strata**:
  - presentation: apps, frontend
- **Animation**: Perlin noise drift

### 4. Hotspot Constellation

- **Type**: Star field / particle system
- **Stars**: 6 hotspot files
- **Brightest stars (highest risk)**:
  - `apps/web/src/api.ts` (risk: 0.8, connections: 16)
  - `apps/web/src/App.tsx` (risk: 0.8, connections: 15)
  - `apps/web/src/pages/DashboardPage.tsx` (risk: 0.5, connections: 10)
  - `apps/web/src/components/Toast.tsx` (risk: 0.1, connections: 3)
  - `apps/web/src/components/AxisIcons.tsx` (risk: 0.1, connections: 3)
- **Brightness**: risk_score mapped to luminosity
- **Size**: inbound + outbound connections
- **Animation**: Twinkling, slow drift

## Collection Metadata

| Property | Value |
|----------|-------|
| Total Pieces | 4 |
| Source Project | axis-toolbox |
| Data Points | 16 |
| Domain Models | 131 |
| Routes | 387 |
| Total Files | 432 |
| Total LOC | 95217 |
| Render Target | Canvas 2D / WebGL |
| Parameter Pack | parameter-pack.json |

## Source File Tree

```
.
g
i
t
i
g
n
o
r
e
 
(
0
.
1
 
K
B
)


A
G
E
N
T
```
