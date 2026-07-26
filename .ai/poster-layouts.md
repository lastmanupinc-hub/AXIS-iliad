# Poster Layouts — axis-iliad

Generated: 1970-01-01T00:00:00.000Z

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
- Subtitle: > **Axis' Iliad — The modern epic that shapes raw codebases into canonical, agent-ready artifacts. Axis' Iliad authors the definitive foundation for the next era of natural-language workspace development.**
- Type Badge: monorepo

**Stats Grid**
- Entry Points: 0
- Hotspots: 20
- Architecture Score: 64/100
- Dependencies: 41

**Language Breakdown**
- TypeScript: 72% (73592 LOC)
- YAML: 12.6% (12895 LOC)
- Markdown: 8.8% (8954 LOC)
- JSON: 2.9% (2991 LOC)
- JavaScript: 1.8% (1815 LOC)
- CSS: 1.7% (1744 LOC)
- HTML: 0.2% (172 LOC)
- PowerShell: 0% (39 LOC)
- Shell: 0% (38 LOC)
- Dockerfile: 0% (22 LOC)

**Architecture Diagram**
- Patterns: monorepo, containerized
- presentation: apps

**Framework Badges**
- React ^19.1.0

**Domain Models**
- AlertThresholds (interface, 2 fields)
- Counters (type_alias, 2 fields)
- DebounceState (interface, 2 fields)
- WindowResult (interface, 4 fields)
- AnalyticsCountByBucketResult (interface, 3 fields)
- AnalyticsCountByBucketRow (interface, 2 fields)
- …and 272 more

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
- Score: 64/100
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


---

## ⟳ Continue the loop

- **You are here:** `poster-layouts.md` — agent step 47 of 71.
- **Next:** `asset-guidelines.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
