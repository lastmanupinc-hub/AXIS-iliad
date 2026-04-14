# Brand Board — axis-toolbox

Generated: 2026-04-14T01:13:38.185Z

Comprehensive visual identity reference for all project-branded outputs.

## Project Summary

axis-toolbox is a monorepo built with TypeScript using React. It contains 500 files across 19 top-level directories. It defines 151 domain models.

## Color Palette

### Primary Colors

| Role | Hex | HSL | Usage |
|------|-----|-----|-------|
| Brand Primary | `#2563EB` | 217° 91% 53% | Headers, CTAs, primary actions |
| Brand Secondary | `#7C3AED` | 263° 83% 58% | Accents, secondary labels |
| Brand Accent | `#06B6D4` | 188° 95% 43% | Links, highlights, interactive |

### Semantic Colors

| Role | Light | Dark | Usage |
|------|-------|------|-------|
| Success | `#16A34A` | `#22C55E` | Passing tests, healthy metrics |
| Warning | `#D97706` | `#FBBF24` | Risk indicators, cautions |
| Error | `#DC2626` | `#EF4444` | Failures, critical hotspots |
| Info | `#2563EB` | `#60A5FA` | Neutral information |

### Neutrals

| Weight | Hex | Usage |
|--------|-----|-------|
| 50 | `#F8FAFC` | Page background |
| 100 | `#F1F5F9` | Card background |
| 300 | `#CBD5E1` | Borders |
| 500 | `#64748B` | Body text (secondary) |
| 700 | `#334155` | Body text (primary) |
| 900 | `#0F172A` | Headings |
| 950 | `#020617` | Dark mode background |

## Typography

| Role | Family | Weight | Size | Line Height |
|------|--------|--------|------|-------------|
| Display | Inter | 800 | 48px / 3rem | 1.1 |
| Heading 1 | Inter | 700 | 36px / 2.25rem | 1.2 |
| Heading 2 | Inter | 600 | 24px / 1.5rem | 1.3 |
| Heading 3 | Inter | 600 | 20px / 1.25rem | 1.4 |
| Body | Inter | 400 | 16px / 1rem | 1.6 |
| Small | Inter | 400 | 14px / 0.875rem | 1.5 |
| Code | JetBrains Mono | 400 | 14px / 0.875rem | 1.7 |
| Caption | Inter | 500 | 12px / 0.75rem | 1.5 |

## Logo & Mark

### Project: axis-toolbox

| Variant | Usage | Min Size | Clear Space |
|---------|-------|----------|-------------|
| Full Logo | Hero, splash, docs header | 120px wide | 1× mark height |
| Mark Only | Favicon, avatar, small UI | 24px | 0.5× mark width |
| Wordmark | Inline references, footer | 80px wide | 0.5× cap height |

**Forbidden**: Don't stretch, rotate, recolor, add effects, or place on busy backgrounds.

## Imagery & Illustration

### Style Keywords

`Clean` · `Technical` · `Precise` · `Structured` · `TypeScript` · `React`

### Visual Language

| Element | Guideline |
|---------|-----------|
| Diagrams | Use brand colors, 2px strokes, rounded corners (8px) |
| Screenshots | Full-bleed or device-framed, light + dark variants |
| Icons | Outline style, 24px base grid, 1.5px stroke |
| Charts | Brand-primary for primary series, secondary for comparisons |
| Code blocks | Dark theme (slate-950 bg), syntax highlighting with brand accent |

## Tech Identity Elements

### Stack Badge Bar

- `React`
- `TypeScript` — 67% of codebase
- `YAML` — 12% of codebase
- `JSON` — 11% of codebase

### Key Abstractions for Branding

- **packages/ (monorepo_packages)** — candidate for conceptual branding element
- **apps/ (monorepo_apps)** — candidate for conceptual branding element
- **payment-processing-output/ (project_directory)** — candidate for conceptual branding element
- **examples/ (project_directory)** — candidate for conceptual branding element
- **search/ (project_directory)** — candidate for conceptual branding element

### Domain Models

Consider domain-specific iconography for:

- **AuthContext** (interface) — 3 fields, from apps/api/src/billing.ts
- **EnvSpec** (interface) — 5 fields, from apps/api/src/env.ts
- **ValidationError** (interface) — 2 fields, from apps/api/src/env.ts
- **ValidationResult** (interface) — 3 fields, from apps/api/src/env.ts
- **ZipEntry** (interface) — 4 fields, from apps/api/src/export.ts
- **IntentCapture** (interface) — 5 fields, from apps/api/src/mcp-server.ts

### Brand Warnings

> ⚠ No CI/CD pipeline detected
> ⚠ No lockfile found — dependency versions may be inconsistent

## Spacing & Layout Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `space-xs` | 4px | Tight gaps, icon padding |
| `space-sm` | 8px | Inline spacing |
| `space-md` | 16px | Component padding |
| `space-lg` | 24px | Section gaps |
| `space-xl` | 32px | Layout margins |
| `space-2xl` | 48px | Page sections |
| `radius-sm` | 4px | Buttons, inputs |
| `radius-md` | 8px | Cards |
| `radius-lg` | 16px | Modals, panels |
| `radius-full` | 9999px | Avatars, badges |

## Social & OG Image Templates

| Template | Size | Elements |
|----------|------|----------|
| OG Image | 1200×630 | Brand bg, "axis-toolbox" heading, description, stack badges |
| Twitter Card | 1200×600 | Brand gradient, project mark, tagline |
| GitHub Social | 1280×640 | Minimal, mark + wordmark centered |
| LinkedIn Banner | 1584×396 | Brand gradient, wordmark left-aligned |

## Detected Brand Assets

- `apps/web/src/components/AxisIcons.tsx`
- `brand/begin.yaml`
- `brand/continuation.yaml`
- `brand/MEMORY.yaml`
- `brand/schemas/output-contract.schema.json`
- `brand-board.md`
- `brand-guidelines.md`
- `packages/generator-core/src/generators-brand.ts`
- `payment-processing-output/brand-board.md`
- `payment-processing-output/brand-guidelines.md`
