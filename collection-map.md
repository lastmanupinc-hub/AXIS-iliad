# Collection Map — axis-toolbox

Generated: 2026-04-15T19:53:55.593Z

## Collection Overview

A curated set of generative art pieces derived from the structure,
metrics, and architecture of axis-toolbox.

## Project Summary

axis-toolbox is a monorepo built with TypeScript using React. It contains 550+ files across 17 top-level directories. It defines 128 domain models.

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
  - TypeScript: 70.9% → radius 213px
  - JSON: 10.5% → radius 32px
  - YAML: 9.1% → radius 27px
  - Markdown: 7.3% → radius 22px
  - JavaScript: 1.3% → radius 4px
  - CSS: 0.7% → radius 2px
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
  - `apps/web/src/App.tsx` (risk: 0.9, connections: 18)
  - `apps/web/src/api.ts` (risk: 0.8, connections: 17)
  - `apps/web/src/pages.test.tsx` (risk: 0.8, connections: 15)
  - `apps/web/src/pages/DashboardPage.tsx` (risk: 0.5, connections: 10)
  - `apps/web/src/components/Toast.tsx` (risk: 0.2, connections: 4)
- **Brightness**: risk_score mapped to luminosity
- **Size**: inbound + outbound connections
- **Animation**: Twinkling, slow drift

## Collection Metadata

| Property | Value |
|----------|-------|
| Total Pieces | 4 |
| Source Project | axis-toolbox |
| Data Points | 17 |
| Domain Models | 162 |
| Routes | 449 |
| Total Files | 500 |
| Total LOC | 116097 |
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
w
o
r
k
f
l
o
w
s
/
c
i
.
y
m
l
 
```
