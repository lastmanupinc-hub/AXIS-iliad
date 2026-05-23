# Collection Map — axis-iliad

Generated: 2026-05-23T03:31:46.322Z

## Collection Overview

A curated set of generative art pieces derived from the structure,
metrics, and architecture of axis-iliad.

## Project Summary

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 17 top-level directories. It defines 264 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Pieces

### 1. Dependency Network

- **Type**: Force-directed graph
- **Nodes**: 7 (entry points + hotspots)
- **Edges**: Based on import graph density
- **Color mapping**: Language → hue
- **Animation**: Continuous force simulation
- **Source**: generative-sketch.ts

### 2. Language Ring

- **Type**: Concentric ring visualization
- **Rings**: One per language, radius ∝ LOC percentage
  - TypeScript: 76.5% → radius 230px
  - YAML: 8.1% → radius 24px
  - JSON: 6.6% → radius 20px
  - Markdown: 6.5% → radius 20px
  - JavaScript: 1.7% → radius 5px
  - CSS: 0.6% → radius 2px
  - HTML: 0.1% → radius 0px
  - Dockerfile: 0% → radius 0px
- **Animation**: Slow rotation, pulse on interaction

### 3. Architecture Terrain

- **Type**: Topographic height map
- **Elevation**: Architecture score 0.65/100 → height multiplier
- **Ridges**: monorepo, containerized
- **Strata**:
  - presentation: apps, frontend
- **Animation**: Perlin noise drift

### 4. Hotspot Constellation

- **Type**: Star field / particle system
- **Stars**: 7 hotspot files
- **Brightest stars (highest risk)**:
  - `apps/web/src/App.tsx` (risk: 1.0, connections: 22)
  - `apps/web/src/api.ts` (risk: 0.9, connections: 19)
  - `apps/web/src/pages.test.tsx` (risk: 0.8, connections: 17)
  - `apps/web/src/pages/DashboardPage.tsx` (risk: 0.6, connections: 11)
  - `apps/web/src/components/Toast.tsx` (risk: 0.2, connections: 4)
- **Brightness**: risk_score mapped to luminosity
- **Size**: inbound + outbound connections
- **Animation**: Twinkling, slow drift

## Collection Metadata

| Property | Value |
|----------|-------|
| Total Pieces | 4 |
| Source Project | axis-iliad |
| Data Points | 17 |
| Domain Models | 264 |
| Routes | 497 |
| Total Files | 500 |
| Total LOC | 133500 |
| Render Target | Canvas 2D / WebGL |
| Parameter Pack | parameter-pack.json |

## Source File Tree

```
.
g
i
t
h
u
b
/
a
c
t
i
o
n
s
/
c
o
m
p
l
i
a
n
c
```
