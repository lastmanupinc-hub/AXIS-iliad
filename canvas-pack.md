# Axis' Iliad — Canvas Brand Board

## Board Specification

| Property | Value |
|----------|-------|
| Width | 1920px |
| Height | 1080px |
| Background | #0d1117 (midnight_command canvas) |
| Grid | 12-column, 24px gutter |
| Export Formats | PNG (presentation), SVG (scalable), PDF (print) |

---

## Layout Grid (12 Columns)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  HEADER: Axis' Iliad Wordmark + Tagline                        (cols 1-12)   │
│  ─────────────────────────────────────────────────────────────────────────     │
│                                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  COLOR       │  │  TYPOGRAPHY │  │  SIGNAL      │  │  PROGRAM GRID       │  │
│  │  PALETTE     │  │  SCALE      │  │  SYSTEM      │  │  17 × icons         │  │
│  │  (cols 1-3)  │  │  (cols 4-6) │  │  (cols 7-9)  │  │  (cols 10-12)       │  │
│  │              │  │              │  │              │  │                     │  │
│  │  #0d1117  ██ │  │  4xl  ████  │  │  Cyan  ●     │  │  [S][D][Sk]         │  │
│  │  #161b22  ██ │  │  3xl  ███   │  │  Action      │  │  [F][T][B]          │  │
│  │  #21262d  ██ │  │  2xl  ██    │  │              │  │  [N][Ar][Op]        │  │
│  │  #30363d  ██ │  │  xl   █     │  │  Orange ●    │  │  [Mk][MC][Ob]      │  │
│  │  #e6edf3  ██ │  │  base █     │  │  Signal      │  │  [Su][Re][Ca]      │  │
│  │  #58a6ff  ██ │  │  sm   ▪     │  │              │  │  [Al][P]            │  │
│  │  #d29922  ██ │  │  xs   ·     │  │  Green  ●    │  │                     │  │
│  │  #3fb950  ██ │  │              │  │  Pass        │  │                     │  │
│  │  #f85147  ██ │  │  JetBrains  │  │              │  │                     │  │
│  │              │  │  Mono (code) │  │  Red    ●    │  │                     │  │
│  │              │  │              │  │  Fail        │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                                                                               │
│  ┌──────────────────────────────┐  ┌──────────────────────────────────────┐   │
│  │  PIPELINE FLOW               │  │  KEY METRICS                         │   │
│  │  (cols 1-6)                  │  │  (cols 7-12)                         │   │
│  │                              │  │                                      │   │
│  │  Upload → Parse → Context    │  │  ┌────┐ ┌────┐ ┌────┐ ┌──────┐     │   │
│  │    → Generate → 152 Artifacts │  │  │ 20 │ │ 143 │ │3906│ │99.99%│     │   │
│  │                              │  │  │prog│ │ gen│ │test│ │ cov  │     │   │
│  └──────────────────────────────┘  │  └────┘ └────┘ └────┘ └──────┘     │   │
│                                     └──────────────────────────────────────┘   │
│                                                                               │
│  FOOTER: Last Man Up Inc. · v0.5.0 · "The OS for AI-native dev" (cols 1-12)  │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## CSS Custom Properties (for HTML/CSS Canvas)

```css
:root {
  /* Canvas */
  --board-width: 1920px;
  --board-height: 1080px;
  --board-bg: #0d1117;
  --board-padding: 48px;
  --grid-columns: 12;
  --grid-gutter: 24px;

  /* Palette — Backgrounds */
  --ax-canvas: #0d1117;
  --ax-surface: #161b22;
  --ax-elevated: #21262d;
  --ax-border: #30363d;
  --ax-inset: #010409;

  /* Palette — Text */
  --ax-text: #e6edf3;
  --ax-text-muted: #8b949e;
  --ax-text-disabled: #484f58;

  /* Palette — Signal */
  --ax-cyan: #58a6ff;
  --ax-cyan-hover: #79c0ff;
  --ax-cyan-muted: rgba(56, 139, 253, 0.15);
  --ax-orange: #d29922;
  --ax-orange-hover: #e3b341;
  --ax-orange-muted: rgba(210, 153, 34, 0.15);
  --ax-green: #3fb950;
  --ax-green-muted: rgba(63, 185, 80, 0.15);
  --ax-red: #f85147;
  --ax-red-muted: rgba(248, 81, 73, 0.15);

  /* Typography */
  --font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  --font-4xl: 2.25rem;
  --font-3xl: 1.875rem;
  --font-2xl: 1.5rem;
  --font-xl: 1.25rem;
  --font-base: 1rem;
  --font-sm: 0.875rem;
  --font-xs: 0.75rem;
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* Borders & Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 3px 6px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
  --shadow-glow-cyan: 0 0 20px rgba(88, 166, 255, 0.3);
  --shadow-glow-orange: 0 0 20px rgba(210, 153, 34, 0.3);
}
```

---

## Board Sections Detail

### Header (Row 1)
- **Wordmark**: "Axis'" (semibold, 4xl) + "Iliad" (normal, 4xl) in --ax-text
- **Tagline**: "The operating system for AI-native development" in --ax-text-muted, font-xl
- **Subtle cyan glow** behind wordmark: box-shadow: var(--shadow-glow-cyan)

### Color Palette (Cols 1-3, Row 2)
9 swatches arranged vertically:
| Swatch | Hex | Label |
|--------|-----|-------|
| ████████ | #0d1117 | Canvas |
| ████████ | #161b22 | Surface |
| ████████ | #21262d | Elevated |
| ████████ | #30363d | Border |
| ████████ | #e6edf3 | Text |
| ████████ | #58a6ff | Cyan |
| ████████ | #d29922 | Orange |
| ████████ | #3fb950 | Success |
| ████████ | #f85147 | Danger |

### Typography Scale (Cols 4-6, Row 2)
Display the font scale from 4xl to xs using the actual system font. Include mono sample in JetBrains Mono showing: `const axis = analyze(repo);`

### Signal System (Cols 7-9, Row 2)
4 signal dots with labels:
- **Cyan** ● → Interactive, linked, action
- **Orange** ● → Signal, warning, attention
- **Green** ● → Pass, success, Grade A
- **Red** ● → Fail, error, Grade F

Show a mini example: two buttons (one cyan hover state, one green confirmed state) and a toast notification with orange warning accent.

### Program Grid (Cols 10-12, Row 2)
6×3 grid of program icons/badges:
```
[ Search ] [ Debug  ] [ Skills ]    ← FREE (green border)
[Frontend] [ Theme  ] [ Brand  ]    ← PRO (cyan border)
[Notebook] [Artifact] [Optimize]
[Marketng] [  MCP   ] [Obsidian]
[ Super  ] [Remotion] [ Canvas ]
[ Algo   ] [Payment*]               * Grade F, red border
```
Corner badge on each: generator count.

### Pipeline Flow (Cols 1-6, Row 3)
Horizontal flow: 5 connected nodes with arrows:
```
[Upload] → [repo-parser] → [context-engine] → [generator-core] → [152 Artifacts]
```
Each node: surface-colored pill with cyan border. Arrow: cyan line with arrowhead. Below the arrow between generator-core and Artifacts: "deterministic" label in xs text.

### Key Metrics (Cols 7-12, Row 3)
4 metric cards in a row:
| Card | Value | Label | Accent |
|------|-------|-------|--------|
| 1 | 18 | Programs | Cyan |
| 2 | 102 | Generators | Cyan |
| 3 | 3,906 | Tests | Green |
| 4 | 99.99% | Coverage | Green |

Each card: surface background, large bold number (3xl), small label below (xs, muted), left accent stripe in indicated color.

### Footer (Row 4)
- Left: "Last Man Up Inc." in --ax-text-muted, font-sm
- Center: "v0.5.0" badge (elevated bg, border, sm text)
- Right: "The OS for AI-native development" in italic, --ax-text-muted, font-sm

---

## Export Configurations

| Format | DPI | Use Case |
|--------|-----|----------|
| PNG @1x | 72 | Web display, social media |
| PNG @2x | 144 | Retina displays |
| SVG | Vector | Documentation, presentations |
| PDF (CMYK) | 300 | Print materials |
| WebP | 72 | Landing page hero |
