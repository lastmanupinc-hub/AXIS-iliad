# Poster Layouts — axis-iliad

Generated: 2026-05-22T21:39:10.753Z

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
- Dependencies: 27

**Language Breakdown**
- TypeScript: 76.4% (93343 LOC)
- YAML: 8.1% (9885 LOC)
- JSON: 6.6% (8079 LOC)
- Markdown: 6.5% (8000 LOC)
- JavaScript: 1.7% (2093 LOC)
- CSS: 0.6% (675 LOC)
- HTML: 0.1% (158 LOC)
- Dockerfile: 0% (21 LOC)

**Architecture Diagram**
- Patterns: monorepo, containerized
- presentation: apps, frontend

**Framework Badges**
- React ^19.1.0

**Domain Models**
- AuthContext (interface, 3 fields)
- EmbeddingsConfig (interface, 2 fields)
- EmbeddingsResult (interface, 4 fields)
- OpenAIEmbeddingResponse (interface, 5 fields)
- OpenAIErrorResponse (interface, 3 fields)
- EnvSpec (interface, 5 fields)

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
