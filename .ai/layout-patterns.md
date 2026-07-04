# Layout Patterns — axis-iliad

Generated: 1970-01-01T00:00:00.000Z

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Page Layout Architecture

### React SPA Layout Pattern

```
src/
├── layouts/
│   ├── RootLayout.tsx      ← App shell (nav, sidebar, footer)
│   ├── DashboardLayout.tsx ← Authed layout with sidebar
│   └── AuthLayout.tsx      ← Centered card layout
├── pages/
│   └── ...                 ← Page components rendered in layout
└── components/
    └── ...                 ← Shared UI primitives
```

## Layout Components

| Layout | Use Case | Contains |
|--------|----------|----------|
| RootLayout | All pages | Theme provider, global nav, font loading |
| DashboardLayout | Authenticated views | Sidebar, breadcrumbs, user menu |
| AuthLayout | Login/signup | Centered card, minimal chrome |
| MarketingLayout | Public pages | Hero nav, CTA footer, social proof |
| SettingsLayout | User settings | Tab nav, form sections |

## Responsive Breakpoints

| Breakpoint | Width | Layout Behavior |
|------------|-------|-----------------|
| Mobile | < 640px | Single column, stacked |
| Tablet | 640–1024px | Collapsible sidebar |
| Desktop | > 1024px | Full multi-column |

## Route-to-Layout Mapping

| Route | Suggested Layout |
|-------|-----------------|
| GET /v1/health | DashboardLayout |
| POST /v1/accounts | DashboardLayout |
| POST /v1/snapshots | DashboardLayout |
| GET /v1/admin/stats | DashboardLayout |
| GET /v1/admin/accounts | DashboardLayout |
| GET /v1/admin/activity | DashboardLayout |
| GET /v1/admin/mcp-usage | DashboardLayout |
| GET /v1/admin/revenue | DashboardLayout |
| GET /llms.txt | DashboardLayout |
| GET /.well-known/skills/index.json | DashboardLayout |
| GET /v1/docs.md | DashboardLayout |
| GET /.well-known/axis.json | DashboardLayout |

## Grid System

```css
/* Standard 12-column grid */
.grid-layout {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-4, 16px);
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 var(--space-4, 16px);
}
```


---

## ⟳ Continue the loop

- **You are here:** `layout-patterns.md` — agent step 54 of 70.
- **Next:** `ui-audit.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
