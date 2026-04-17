# Poster Layouts — axis-iliad

Generated: 2026-04-17T13:25:42.759Z

## Layout A: Tech Overview (A4 Portrait)

### Zones
```
┌─────────────────────────┐
│      HERO ZONE          │  ← Project name, logo, tagline
│                         │
├─────────────────────────┤
│  STATS    │  LANGUAGE   │  ← Key metrics, language pie chart
│  GRID     │  BREAKDOWN  │
├─────────────────────────┤
│      ARCHITECTURE       │  ← Patterns, layers, score
│      DIAGRAM            │
├─────────────────────────┤
│  FRAMEWORK BADGES       │  ← Tech stack badges
├─────────────────────────┤
│      FOOTER             │  ← AXIS branding, date
└─────────────────────────┘
```

### Data for Zones

**Hero Zone**
- Title: axis-iliad
- Subtitle: null
- Type Badge: monorepo

**Stats Grid**
- Entry Points: 0
- Hotspots: 7
- Architecture Score: 0.65/100
- Dependencies: 26

**Language Breakdown**
- TypeScript: 73.3% (82527 LOC)
- JSON: 10% (11291 LOC)
- YAML: 7.6% (8549 LOC)
- Markdown: 7% (7878 LOC)
- JavaScript: 1.2% (1302 LOC)
- CSS: 0.8% (849 LOC)
- HTML: 0.1% (120 LOC)
- Dockerfile: 0% (53 LOC)

**Architecture Diagram**
- Patterns: monorepo, containerized
- presentation: apps, frontend

**Framework Badges**
- React ^19.1.0

**Domain Models**
- AuthContext (interface, 3 fields)
- EnvSpec (interface, 5 fields)
- ValidationError (interface, 2 fields)
- ValidationResult (interface, 3 fields)
- ZipEntry (interface, 4 fields)
- IntentCapture (interface, 5 fields)

## Layout B: Minimal Card (Landscape)

### Zones
```
┌──────────────────────────────────────────┐
│  LOGO  │  PROJECT NAME & TYPE  │  SCORE  │
│        │  Framework badges      │  ##/100 │
└──────────────────────────────────────────┘
```

- Name: axis-iliad
- Type: monorepo
- Score: 0.65/100
- Badges: React

## Layout C: Data Dashboard

### Zones
```
┌────────────┬────────────┬────────────┐
│  LANGUAGES │ FRAMEWORKS │  HOTSPOTS  │
│  pie chart │   list     │   table    │
├────────────┴────────────┴────────────┤
│         DEPENDENCY GRAPH              │
│         (node visualization)          │
└──────────────────────────────────────┘
```
