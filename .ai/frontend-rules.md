# AXIS Toolbox — Frontend + SEO Rules

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React | 19 |
| Bundler | Vite | 6 |
| Language | TypeScript | 5.7 strict |
| CSS | Vanilla CSS | Custom properties, dark theme |
| Testing | Vitest | 4.1 |
| Hosting | Cloudflare Pages | Static build |

## Design System

### Color Palette

| Role | Token | Value | Usage |
|------|-------|-------|-------|
| Background | `--ax-bg` | `#0d1117` | Page canvas |
| Surface | `--ax-surface` | `#161b22` | Cards, panels |
| Elevated | `--ax-elevated` | `#21262d` | Modals, dropdowns |
| Border | `--ax-border` | `#30363d` | Card borders, dividers |
| Text Primary | `--ax-text` | `#e6edf3` | Headlines, body |
| Text Secondary | `--ax-text-muted` | `#8b949e` | Labels, captions |
| Accent Cyan | `--ax-cyan` | `#58a6ff` | Links, interactive elements |
| Accent Orange | `--ax-orange` | `#d29922` | Warnings, signals, accent |
| Success | `--ax-success` | `#3fb950` | Pass states, confirmations |
| Danger | `--ax-danger` | `#f85149` | Errors, failures |

### Visual Themes (from axis_all_tools.yaml)
- **midnight_command**: Dark, command-center aesthetic — primary theme
- **precision_white**: Light variant for print/export contexts
- **Characteristics**: control_room_clarity, premium_restraint, modular_surfaces, disciplined_cyan_orange_signaling

### Typography
- System font stack: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`
- Monospace: `'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace`
- No custom web fonts — zero external font dependencies

## Application Structure

### Dashboard Tabs
| Tab | Component | API Endpoint | Purpose |
|-----|-----------|-------------|---------|
| Upload | `UploadForm.tsx` | POST /v1/snapshots | Repo upload (ZIP, GitHub URL) |
| Analytics | `AnalyticsView.tsx` | GET /v1/account/usage | Usage stats, quota |
| Files | `FilesView.tsx` | GET /v1/projects/:id/generated-files | Generated file browser with syntax highlight |
| Settings | `SettingsView.tsx` | /v1/account/keys, /v1/account/github-token | API keys, GitHub token, preferences |

### Key UI Components
- **CommandPalette** (`Ctrl+K`): Quick navigation across dashboard
- **FileViewer**: Syntax-highlighted code viewer for generated artifacts
- **ProgressIndicator**: Upload + generation progress
- **ToastNotifications**: Action feedback (success, error, info)

### File Viewer Behavior
- Syntax highlighting for: TypeScript, JavaScript, JSON, YAML, Markdown, CSS
- Tab navigation between generated files
- Download individual file or full ZIP (POST /v1/projects/:id/export)
- Version diff between snapshot generations

## Frontend Audit Findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| 1 | No Tailwind — vanilla CSS | Non-issue | By design. Maintains zero-framework CSS dependency |
| 2 | Dark theme only in dashboard | Minor | precision_white theme exists but not yet togglable in UI |
| 3 | No loading skeleton states | Minor | Add skeleton UI for File tab while generators run |
| 4 | Command palette is keyboard-only access | Minor | Add visible trigger button for discoverability |
| 5 | No responsive mobile layout documented | Medium | Dashboard is desktop-first; verify tablet/mobile breakpoints |
| 6 | File viewer memory on large repos | Medium | Consider virtualized list for repos with 80+ generated files |
| 7 | No WebSocket for live generation progress | Strategic | Currently polling. WebSocket would improve UX for long-running generations |

## SEO Analysis

### Current State
- **Hosting**: Cloudflare Pages (static React SPA)
- **SPA Rendering**: Client-side only (CSR)
- **Meta Tags**: Minimal — React Helmet or equivalent not observed
- **Sitemap**: None
- **robots.txt**: None
- **Schema.org**: None

### Critical Missing Elements

| Element | Status | Impact |
|---------|--------|--------|
| `<title>` per route | Missing | Browser tab shows generic title |
| `<meta name="description">` | Missing | No search snippet optimization |
| Open Graph tags | Missing | Social sharing shows blank preview |
| `<link rel="canonical">` | Missing | Duplicate content risk |
| sitemap.xml | Missing | Search engine crawl guidance |
| robots.txt | Missing | Crawl control |
| Schema.org JSON-LD | Missing | Rich snippet eligibility |
| SSR/SSG | Not implemented | SPA is invisible to crawlers without JS |

### Recommended Meta

```html
<title>AXIS Toolbox — The Operating System for AI-Native Development</title>
<meta name="description" content="Analyze any codebase and generate 87 structured artifacts across 18 programs. Make AI coding tools measurably more effective. Free tier available." />
<meta property="og:title" content="AXIS Toolbox" />
<meta property="og:description" content="87 generators. 18 programs. One upload. AI-native development intelligence." />
<meta property="og:type" content="website" />
<meta property="og:image" content="https://axis.domain.com/og-image.png" />
```

### Schema.org JSON-LD

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "AXIS Toolbox",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Web",
  "description": "AI-native development OS that analyzes repos and generates 87 structured artifacts across 18 programs",
  "offers": [
    { "@type": "Offer", "name": "Free Tier", "price": "0", "priceCurrency": "USD", "description": "Search, Skills, Debug — 13 generators" },
    { "@type": "Offer", "name": "Pro", "description": "All 18 programs — 87 generators" }
  ],
  "creator": { "@type": "Organization", "name": "Last Man Up Inc." }
}
```

### Route Priority Map

| Route | Priority | Change Frequency | Notes |
|-------|----------|-----------------|-------|
| `/` | 1.0 | Monthly | Landing / marketing page |
| `/dashboard` | 0.8 | Weekly | Main app surface (requires auth) |
| `/dashboard/upload` | 0.7 | Weekly | Upload entry point |
| `/dashboard/files` | 0.7 | Weekly | Generated file browser |
| `/docs` | 0.9 | Monthly | API documentation (OpenAPI 3.1) |
| `/pricing` | 0.8 | Monthly | Tier comparison |
| `/dashboard/settings` | 0.3 | Rarely | User settings |

### SEO Strategy Note
As a React SPA on Cloudflare Pages, the app is client-side rendered by default. For SEO to work, either:
1. Pre-render marketing pages at build time (recommended)
2. Use Cloudflare Workers for SSR on marketing routes
3. Maintain a separate static marketing site

The dashboard itself doesn't need SEO (authenticated, behind login). Focus SEO efforts on: landing page, pricing, docs, blog.
