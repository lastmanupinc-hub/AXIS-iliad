# Layout Patterns — axis-toolbox

Generated: 2026-04-11T22:24:48.025Z

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 432 files across 20 top-level directories. It defines 131 domain models.

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
| POST /v1/snapshots | DashboardLayout |
| GET /v1/snapshots/:snapshot_id | DashboardLayout |
| DELETE /v1/snapshots/:snapshot_id | DashboardLayout |
| GET /v1/projects/:project_id/context | DashboardLayout |
| GET /v1/projects/:project_id/generated-files | DashboardLayout |
| GET /v1/projects/:project_id/generated-files/:file_path | DashboardLayout |

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

## Detected Layout Files

| File | Exports |
|------|---------|
| `payment-processing-output/layout-patterns.md` | default |
| `payment-processing-output/poster-layouts.md` | default |
