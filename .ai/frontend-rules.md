# Frontend Rules — axis-iliad

> UI engineering standards for this monorepo

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 9 top-level directories. It defines 278 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Component Conventions

- Use functional components with hooks
- Colocate component, types, and tests in the same directory
- Export one primary component per file
- Name files after the component: `DataTable.tsx` exports `DataTable`

## Styling

- Follow the project's established styling pattern
- Use CSS modules or scoped styles to avoid global namespace collisions

## State Management

- Local state: `useState` / `useReducer`
- Shared state: Context API or state library
- Server state: data-fetching library (SWR, React Query, etc.)

## Data Fetching

Available API routes:

- `GET /v1/health` → docs/archive/e2e_ui_audit.yaml
- `POST /v1/accounts` → apps/api/src/server.ts
- `GET /v1/account` → apps/api/src/server.ts
- `PATCH /v1/account` → apps/api/src/server.ts
- `DELETE /v1/account` → apps/api/src/server.ts
- `POST /v1/snapshots` → apps/api/src/server.ts
- `GET /v1/admin/stats` → apps/api/src/server.ts
- `GET /v1/admin/accounts` → apps/api/src/server.ts
- `GET /v1/admin/activity` → apps/api/src/server.ts
- `GET /v1/admin/mcp-usage` → apps/api/src/server.ts
- `GET /v1/admin/revenue` → apps/api/src/server.ts
- `GET /llms.txt` → apps/api/src/server.ts
- `GET /.well-known/skills/index.json` → apps/api/src/server.ts
- `GET /v1/docs.md` → apps/api/src/server.ts
- `GET /.well-known/axis.json` → apps/api/src/server.ts
- `GET /v1/install` → apps/api/src/server.ts
- `GET /v1/install/:platform` → apps/api/src/server.ts
- `GET /v1/error-codes` → apps/api/src/server.ts
- `POST /mcp` → apps/api/src/server.ts
- `POST /v1/analyze` → apps/api/src/server.ts
- `GET /v1/snapshots/:snapshot_id` → apps/api/src/server.ts
- `DELETE /v1/snapshots/:snapshot_id` → apps/api/src/server.ts
- `GET /v1/projects/:project_id/context` → apps/api/src/server.ts
- `GET /v1/projects/:project_id/generated-files` → apps/api/src/server.ts
- `DELETE /v1/projects/:project_id` → apps/api/src/server.ts
- `GET /v1/db/stats` → apps/api/src/server.ts
- `POST /v1/db/maintenance` → apps/api/src/server.ts
- `POST /v1/search/index` → apps/api/src/server.ts
- `POST /v1/search/query` → apps/api/src/server.ts
- `GET /v1/search/:snapshot_id/stats` → apps/api/src/server.ts
- `POST /v1/debug/analyze` → apps/api/src/server.ts
- `GET /v1/docs` → apps/api/src/server.ts
- `GET /v1/programs` → apps/api/src/server.ts
- `POST /v1/account/seats` → apps/api/src/server.ts
- `GET /v1/account/seats` → apps/api/src/server.ts
- `POST /v1/account/seats/:seat_id/accept` → apps/api/src/server.ts
- `POST /v1/account/seats/:seat_id/revoke` → apps/api/src/server.ts
- `GET /v1/account/upgrade-prompt` → apps/api/src/server.ts
- `POST /v1/account/upgrade-prompt/dismiss` → apps/api/src/server.ts
- `GET /v1/account/funnel` → apps/api/src/server.ts
- `POST /v1/account/webhooks` → apps/api/src/server.ts
- `GET /v1/account/webhooks` → apps/api/src/server.ts
- `DELETE /v1/account/webhooks/:webhook_id` → apps/api/src/server.ts
- `POST /v1/account/webhooks/:webhook_id/toggle` → apps/api/src/server.ts
- `GET /v1/account/webhooks/:webhook_id/deliveries` → apps/api/src/server.ts
- `POST /v1/account/programs` → apps/api/src/server.ts
- `POST /v1/account/github-token` → apps/api/src/server.ts
- `POST /v1/search/export` → apps/api/src/server.ts
- `POST /v1/skills/generate` → apps/api/src/server.ts
- `POST /v1/frontend/audit` → apps/api/src/server.ts
- `POST /v1/seo/analyze` → apps/api/src/server.ts
- `POST /v1/optimization/analyze` → apps/api/src/server.ts
- `POST /v1/theme/generate` → apps/api/src/server.ts
- `POST /v1/brand/generate` → apps/api/src/server.ts
- `POST /v1/superpowers/generate` → apps/api/src/server.ts
- `POST /v1/marketing/generate` → apps/api/src/server.ts
- `POST /v1/notebook/generate` → apps/api/src/server.ts
- `POST /v1/obsidian/analyze` → apps/api/src/server.ts
- `POST /v1/mcp/provision` → apps/api/src/server.ts
- `POST /v1/artifacts/generate` → apps/api/src/server.ts
- `POST /v1/remotion/generate` → apps/api/src/server.ts
- `POST /v1/canvas/generate` → apps/api/src/server.ts
- `POST /v1/algorithmic/generate` → apps/api/src/server.ts
- `POST /v1/agentic-purchasing/generate` → apps/api/src/server.ts
- `POST /v1/github/analyze` → apps/api/src/server.ts
- `POST /v1/github/architecture-drift` → apps/api/src/server.ts
- `POST /v1/account/tier` → apps/api/src/server.ts
- `GET /v1/account/github-token` → apps/api/src/server.ts
- `DELETE /v1/account/github-token/:token_id` → apps/api/src/server.ts
- `GET /v1/billing/history` → apps/api/src/server.ts
- `GET /v1/billing/proration` → apps/api/src/server.ts
- `GET /begin.yaml` → apps/api/src/server.ts
- `GET /continuation.yaml` → apps/api/src/server.ts
- `GET /v1/projects/:project_id/generated-files/:file_path*` → apps/api/src/server.ts
- `GET /v1/projects/:project_id/export` → apps/api/src/server.ts
- `POST /v1/account/keys` → apps/api/src/server.ts
- `GET /v1/account/keys` → apps/api/src/server.ts
- `POST /v1/account/keys/:key_id/revoke` → apps/api/src/server.ts
- `GET /v1/account/usage` → apps/api/src/server.ts
- `GET /v1/account/analytics/summary` → apps/api/src/server.ts
- `GET /v1/account/credits` → apps/api/src/server.ts
- `GET /v1/plans` → apps/api/src/server.ts
- `POST /v1/account/credits` → apps/api/src/server.ts
- `GET /v1/changelog` → apps/api/src/server.ts
- `POST /v1/webhooks/stripe` → apps/api/src/server.ts
- `GET /v1/account/subscription` → apps/api/src/server.ts
- `POST /v1/account/subscription/cancel` → apps/api/src/server.ts
- `POST /v1/prepare-for-agentic-purchasing` → apps/api/src/server.ts
- `GET /v1/credits/purchases` → apps/api/src/server.ts
- `GET /v1/health/live` → apps/api/src/server.ts
- `GET /v1/health/ready` → apps/api/src/server.ts
- `GET /v1/metrics` → apps/api/src/server.ts
- `GET /v1/snapshots/:snapshot_id/versions` → apps/api/src/server.ts
- `GET /v1/snapshots/:snapshot_id/versions/:version_number` → apps/api/src/server.ts
- `GET /v1/snapshots/:snapshot_id/diff` → apps/api/src/server.ts
- `GET /v1/account/quota` → apps/api/src/server.ts
- `POST /v1/research/scrape` → apps/api/src/server.ts
- `POST /v1/research/crawl` → apps/api/src/server.ts
- `GET /v1/account/fleet` → apps/api/src/server.ts
- `GET /v1/funnel/metrics` → apps/api/src/server.ts
- `POST /v1/account/analytics/events` → apps/api/src/server.ts
- `POST /v1/github/webhook` → apps/api/src/server.ts
- `GET /mcp` → apps/api/src/server.ts
- `GET /mcp/docs` → apps/api/src/server.ts
- `GET /v1/mcp/server.json` → apps/api/src/server.ts
- `GET /v1/stats` → apps/api/src/server.ts
- `GET /v1/projects/:project_id/memory` → apps/api/src/server.ts
- `POST /v1/projects/:project_id/memory` → apps/api/src/server.ts
- `GET /v1/auth/github` → apps/api/src/server.ts
- `GET /v1/auth/github/callback` → apps/api/src/server.ts
- `GET /v1/auth/google` → apps/api/src/server.ts
- `GET /v1/auth/google/callback` → apps/api/src/server.ts
- `POST /v1/auth/exchange` → apps/api/src/server.ts
- `POST /v1/auth/session` → apps/api/src/server.ts
- `POST /v1/auth/logout` → apps/api/src/server.ts
- `GET /v1/projects` → apps/api/src/server.ts
- `GET /v1/projects/:project_id/snapshots` → apps/api/src/server.ts
- `POST /v1/closer/generate` → apps/api/src/server.ts
- `POST /v1/deploy/generate` → apps/api/src/server.ts
- `GET /.well-known/capabilities.json` → apps/api/src/server.ts
- `GET /.well-known/mcp.json` → apps/api/src/server.ts
- `GET /.well-known/security.txt` → apps/api/src/server.ts
- `GET /.well-known/glama.json` → apps/api/src/server.ts
- `GET /.well-known/agent.json` → apps/api/src/server.ts
- `GET /.well-known/agent-card.json` → apps/api/src/server.ts
- `GET /.well-known/oauth-authorization-server` → apps/api/src/server.ts
- `GET /.well-known/oauth-protected-resource` → apps/api/src/server.ts
- `GET /.well-known/ai-plugin.json` → apps/api/src/server.ts
- `GET /.well-known/x402` → apps/api/src/server.ts
- `GET /.well-known/x402.json` → apps/api/src/server.ts
- `GET /agents.json` → apps/api/src/server.ts
- `GET /mcp/.well-known/mcp.json` → apps/api/src/server.ts
- `GET /mcp/.well-known/agent.json` → apps/api/src/server.ts
- `GET /robots.txt` → apps/api/src/server.ts
- `GET /sitemap.xml` → apps/api/src/server.ts
- `GET /openapi.json` → apps/api/src/server.ts
- `GET /v1/search/:snapshot_id/symbols` → apps/api/src/server.ts
- `POST /mcp/` → apps/api/src/server.ts
- `POST /v1/mcp` → apps/api/src/server.ts
- `POST /v1/mcp/` → apps/api/src/server.ts
- `GET /mcp/` → apps/api/src/server.ts
- `GET /v1/mcp` → apps/api/src/server.ts
- `GET /v1/mcp/` → apps/api/src/server.ts
- `GET /favicon.ico` → apps/api/src/server.ts
- `GET /mcp/sse` → apps/api/src/server.ts
- `POST /mcp/sse` → apps/api/src/server.ts
- `GET /mcp/mcp/*` → apps/api/src/server.ts
- `POST /mcp/mcp/*` → apps/api/src/server.ts
- `DELETE /mcp/mcp/*` → apps/api/src/server.ts
- `GET /v1/mcp/tools` → apps/api/src/server.ts
- `GET /v1/accounts` → apps/api/src/server.ts
- `GET /v1/accounts/` → apps/api/src/server.ts
- `GET /v1/account/usage/timeseries` → apps/api/src/server.ts
- `GET /v1/credits/packs` → apps/api/src/server.ts
- `POST /v1/credits/topup` → apps/api/src/server.ts


## UI Data Types

These domain models were detected in the codebase. Use their type names in component props and state:

| Type | Kind | Fields | Source |
|------|------|--------|--------|
| `AlertThresholds` | interface | 2 | `apps/api/src/alerting.ts` |
| `Counters` | type_alias | 2 | `apps/api/src/alerting.ts` |
| `DebounceState` | interface | 2 | `apps/api/src/alerting.ts` |
| `WindowResult` | interface | 4 | `apps/api/src/alerting.ts` |
| `AnalyticsCountByBucketResult` | interface | 3 | `apps/api/src/analytics.ts` |
| `AnalyticsCountByBucketRow` | interface | 2 | `apps/api/src/analytics.ts` |
| `AnalyticsCountByEventResult` | interface | 2 | `apps/api/src/analytics.ts` |
| `AnalyticsCountByEventRow` | interface | 2 | `apps/api/src/analytics.ts` |
| `AnalyticsCountResult` | interface | 2 | `apps/api/src/analytics.ts` |
| `AnalyticsDistinctUsersResult` | interface | 2 | `apps/api/src/analytics.ts` |
| `AnalyticsEvent` | interface | 4 | `apps/api/src/analytics.ts` |
| `AnalyticsQuery` | interface | 8 | `apps/api/src/analytics.ts` |
| *... and 266 more* | | | |

**Rule**: Component prop types must reference these detected types, not re-define them. Import from the canonical source file.

## Accessibility

- All interactive elements must be keyboard accessible
- Images require `alt` text
- Form inputs require associated `<label>` elements
- Use semantic HTML: `<nav>`, `<main>`, `<section>`, `<article>`
- Color contrast must meet WCAG 2.1 AA (4.5:1 minimum)

## Performance

- Minimize client-side JavaScript — prefer server rendering
- Avoid layout shift — specify dimensions for images and embeds

## Testing

- Unit test components with vitest
- Test user interactions, not implementation details
- Mock API responses at the network layer

## Project Components

- **`apps/web/src/App.tsx`**: `export function App() { ... }`
- `apps/web/src/app-routing.test.tsx`
- `apps/web/src/heading-structure.test.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/pages.test.tsx`
- `apps/web/src/routes.test.tsx`
- **`apps/web/src/routes.tsx`**: `export type PageId = ...`, `export type RouteParams = ...`, `export interface NavContext { ... }`
- `apps/web/src/theme-toggle.test.tsx`
- `apps/web/src/useFocusRetention.test.tsx`
- `apps/web/src/useTabList.test.tsx`
- *... and 16 more*

## Style Sources

### `apps/web/src/index.css`

```css
/* ==========================================================================
   AVERIONICS theme pack — Axis' Iliad
   A cockpit/instrument design system: HUD cyan accent, amber caution, precise
   panel borders, glow focus, monospace instrument labels. Full light + dark.
   :root = "daylight instrument" · dark = "night cockpit".

   Token bridge (WO-F1): canonical values live in theme.css — the app copy of
   the generated design-system contract (.ai/theme.css), imported before this
   file. The short names below are aliases onto that contract; add or change
   tokens there, not here. Dark mode comes from the contract too: OS
   preference via its media query, or an explicit data-theme override set by
   the in-app toggle.
   ========================================================================== */

:root {
  /* Surfaces */
  --bg: var(--surface-page);
  --bg-card: var(--surface-card);
  --bg-hover: var(--color-neutral-100);
  --bg-inset: var(--surface-inset);
... (1615 more lines)
```

### `apps/web/src/theme.css`

```css
/* ==========================================================================
   Theme — axis-iliad
   Auto-generated by Axis Theme. Edit tokens, not this file.

   App copy of the generated design-system contract (.ai/theme.css) — WO-F1
   design-token dogfood bridge. Kept byte-faithful to the generated file
   except for corrections where the app's shipped values are the source of
   truth (see AUDIT-design.md (a) and Honesty note H10 — feed these back
   into the theme generator):
     1. --font-sans / --font-mono → Inter / JetBrains Mono (app's real fonts)
     2. light --color-accent → #0a5a6b (WCAG AA on light tints, index.css)
     3. light --color-amber/--color-success/--color-warning/--color-error →
        the app's AA-deepened caution palette (>=4.5:1 as text on light
        surfaces; the generated values fail AA). Dark values already match.
   index.css imports after this file and aliases its short var names
   (--bg, --text, --accent, …) onto these tokens.
   ========================================================================== */

/* ─── Project Snapshot ──────────────────────────────────────
   Name:        axis-iliad
... (401 more lines)
```

---
*Generated by Axis Frontend*


---

## ⟳ Continue the loop

- **You are here:** `frontend-rules.md` — agent step 7 of 71.
- **Next:** `component-guidelines.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
