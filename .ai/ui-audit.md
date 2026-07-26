# UI Audit — axis-iliad

Generated: 1970-01-01T00:00:00.000Z

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 9 top-level directories. It defines 278 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## UI Stack Summary

| Aspect | Detected |
|--------|----------|
| UI Frameworks | React |
| Styling | CSS/SCSS/SASS/LESS |
| TypeScript | Yes |
| UI Libraries | None detected |
| Total Routes | 174 |
| Entry Points | 0 |

## Accessibility Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| Semantic HTML | ⚠️ Verify | Check for div-soup vs proper heading hierarchy |
| ARIA labels | ⚠️ Verify | Interactive elements need aria-label/aria-describedby |
| Keyboard navigation | ⚠️ Verify | Tab order, focus management, skip links |
| Color contrast | ⚠️ Verify | 4.5:1 ratio for text, 3:1 for large text |
| Screen reader | ⚠️ Verify | Test with VoiceOver/NVDA |
| Focus indicators | ⚠️ Verify | Visible focus rings on all interactive elements |
| Alt text | ⚠️ Verify | All images need descriptive alt attributes |

## Performance Audit

| Metric | Target | How to Measure |
|--------|--------|----------------|
| LCP (Largest Contentful Paint) | < 2.5s | Lighthouse, Web Vitals |
| FID (First Input Delay) | < 100ms | Lighthouse, Web Vitals |
| CLS (Cumulative Layout Shift) | < 0.1 | Lighthouse, Web Vitals |
| Bundle size | < 250KB gzip | Build output |
| Image optimization | WebP/AVIF | Check image formats |
| Font loading | font-display: swap | Verify CSS |

## Component Coverage

| Route | Has Component | Interactive | Needs Testing |
|-------|--------------|-------------|---------------|
| /health | ⚠️ Verify | ⚠️ Verify | Yes |
| /for-agents | ⚠️ Verify | ⚠️ Verify | Yes |
| /probe-intent | ⚠️ Verify | ⚠️ Verify | Yes |
| /purchase | ⚠️ Verify | ⚠️ Verify | Yes |
| / | ⚠️ Verify | ⚠️ Verify | Yes |
| /oauth/authorize | ⚠️ Verify | ⚠️ Verify | Yes |
| /oauth/token | ⚠️ Verify | ⚠️ Verify | Yes |
| /oauth/jwks | ⚠️ Verify | ⚠️ Verify | Yes |
| /oauth/introspect | ⚠️ Verify | ⚠️ Verify | Yes |
| /portal/api/subscribe | ⚠️ Verify | ⚠️ Verify | Yes |

## Audit Score

**Overall UI Readiness: 90/100**

| Factor | Score |
|--------|-------|
| Base | +50 |
| Framework detection | +15 |
| Styling system | +5 |
| TypeScript | +10 |
| UI component library | 0 |
| Route coverage | +10 |

## Detected UI Issues (deterministic)

> Static scan of component source — grep + a fixed rule table, **no AI**. `XSS` = injection risk; `A11Y` = accessibility gap; `TYPE` = type-net hole.

| Class | Count |
|-------|-------|
| A11Y | 2 |

| File | Line | Category | Class | Note |
|------|------|----------|-------|------|
| `apps/web/src/components/CommandPalette.tsx` | 113 | click-nonbutton | A11Y | onClick on a non-button element — use <button>/<a href> or add role + keyboard handlers |
| `apps/web/src/components/CommandPalette.tsx` | 194 | click-nonbutton | A11Y | onClick on a non-button element — use <button>/<a href> or add role + keyboard handlers |

## Detected UI Components

| Component | Exports | Lines |
|-----------|---------|-------|
| `apps/web/src/App.tsx` | export function App() { ... } | 716 |
| `apps/web/src/main.tsx` | default | 12 |
| `apps/web/src/routes.tsx` | export type PageId = ..., export type RouteParams = ..., export interface NavContext { ... }, export interface RouteContext extends NavContext { ... }, export type NavGroup = ..., export const NAV_GROUPS: readonly NavGroup[] = ..., export interface NavEntry { ... }, export interface RouteDef { ... }, export const ROUTES: RouteDef[] = ..., export const AUTH_ONLY_PAGES: ReadonlySet<PageId> = ..., export function routeForPage(page: PageId): RouteDef { ... }, export function matchPattern(pattern: string, hash: string): RouteParams \| null { ... }, export interface RouteMatch { ... }, export function matchHash(rawHash: string): RouteMatch \| null { ... }, export function hashForPage(page: PageId, params: RouteParams = ..., export function routeFromPathname(pathname: string): RouteDef \| null { ... }, export function isRouteVisible(route: RouteDef, ctx: NavContext): boolean { ... }, export function navLabelFor(route: RouteDef, ctx: NavContext): string { ... }, export function tabLabelFor(route: RouteDef, ctx: NavContext): string { ... }, export function routeForShortcut(digit: number, ctx: NavContext): RouteDef \| null { ... }, export function ownsShortcut(route: RouteDef, ctx: NavContext): boolean { ... }, export type NavRouteDef = ..., export function visibleNavRoutes(ctx: NavContext): NavRouteDef[] { ... }, export function visibleRailRoutes(ctx: NavContext): NavRouteDef[] { ... }, export function visibleGroupRoutes(group: NavGroup, ctx: NavContext): NavRouteDef[] { ... } | 875 |
| `apps/web/src/components/ArtifactExplorer.tsx` | export function ArtifactExplorer({ ... } | 471 |
| `apps/web/src/components/AuthButtons.tsx` | export function AuthButtons({ ... } | 101 |
| `apps/web/src/components/AxisIcons.tsx` | export function Icon({ ... } | 111 |
| `apps/web/src/components/CommandPalette.tsx` | export interface PaletteAction { ... }, export function CommandPalette({ ... } | 255 |
| `apps/web/src/components/DangerButton.tsx` | export function DangerButton({ ... } | 83 |
| `apps/web/src/components/DiffViewer.tsx` | export function computeLineDiff(oldText: string, newText: string): DiffLine[] { ... }, export interface DiffViewerProps { ... }, export function DiffViewer({ ... } | 227 |
| `apps/web/src/components/FilesTab.tsx` | export function FilesTab({ ... } | 157 |
| `apps/web/src/components/GraphTab.tsx` | export function GraphTab({ ... } | 128 |
| `apps/web/src/components/Icon.tsx` | export function Icon({ ... } | 63 |
| `apps/web/src/components/LiveDemoTeaser.tsx` | export function LiveDemoTeaser({ ... } | 118 |
| `apps/web/src/components/OverviewTab.tsx` | export function OverviewTab({ ... } | 223 |

## Detected Style Files

- `apps/web/src/index.css` (1635 lines)
- `apps/web/src/theme.css` (421 lines)


---

## ⟳ Continue the loop

- **You are here:** `ui-audit.md` — agent step 56 of 71.
- **Next:** `token-budget-plan.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
