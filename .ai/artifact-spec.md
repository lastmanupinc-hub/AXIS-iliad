# Artifact Specification — axis-iliad

Generated: 1970-01-01T00:00:00.000Z

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 9 top-level directories. It defines 278 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Project Identity

| Field | Value |
|-------|-------|
| Name | axis-iliad |
| Type | monorepo |
| Language | TypeScript |
| Frameworks | React |

## Language Distribution

- **TypeScript**: 72% ██████████████ (284 files, 73592 LOC)
- **YAML**: 12.6% ███ (35 files, 12895 LOC)
- **Markdown**: 8.8% ██ (109 files, 8954 LOC)
- **JSON**: 2.9% █ (42 files, 2991 LOC)
- **JavaScript**: 1.8% █ (11 files, 1815 LOC)
- **CSS**: 1.7% █ (2 files, 1744 LOC)
- **HTML**: 0.2% █ (1 files, 172 LOC)
- **PowerShell**: 0% █ (1 files, 39 LOC)
- **Shell**: 0% █ (1 files, 38 LOC)
- **Dockerfile**: 0% █ (1 files, 22 LOC)

## Architecture

### Patterns Detected
- monorepo
- containerized

### Layer Boundaries
- **presentation**: apps

## Entry Points

No entry points detected.

## Hotspots

| Path | Inbound | Outbound | Risk |
|------|---------|----------|------|
| `apps/api/src/router.ts` | 113 | 4 | 1.0 |
| `apps/api/src/test-helpers.ts` | 54 | 1 | 1.0 |
| `apps/api/src/billing.ts` | 44 | 3 | 1.0 |
| `apps/api/src/handlers.ts` | 36 | 21 | 1.0 |
| `apps/api/src/rate-limiter.ts` | 46 | 2 | 1.0 |
| `apps/api/src/mcp-tool-impls.ts` | 18 | 27 | 1.0 |
| `apps/api/src/mpp.ts` | 19 | 1 | 1.0 |
| `apps/api/src/logger.ts` | 34 | 0 | 1.0 |
| `apps/api/src/mcp-server.ts` | 17 | 15 | 1.0 |
| `apps/api/src/server.ts` | 2 | 35 | 1.0 |

## Artifact Generation Rules

When generating artifacts for this project:

1. **Component artifacts** should use React conventions
2. **Widget artifacts** should render project metrics from real data
3. **Embed snippets** should include all conventions and warnings
4. **File naming** should follow TypeScript conventions
5. **Architecture score**: 64/100

## Dependencies (Top 10)

- `@axis/agentic-compliance` @ workspace:*
- `@axis/ap2` @ workspace:*
- `@axis/context-engine` @ workspace:*
- `@axis/generator-core` @ workspace:*
- `@axis/mpp` @ workspace:*
- `@axis/paid-client` @ workspace:*
- `@axis/repo-parser` @ workspace:*
- `@axis/snapshots` @ workspace:*
- `dockerode` @ ^5.0.1
- `ffmpeg-static` @ ^5.3.0

## Source Entry Points

| File | Exports |
|------|---------|
| `apps/api/src/server.ts` | export const router = ..., export const app = ... |
| `apps/web/src/App.tsx` | export function App() { ... } |
| `apps/web/src/main.tsx` | default |

## Component Signatures

- `apps/web/src/App.tsx`: export function App() { ... }
- `apps/web/src/routes.tsx`: export type PageId = ..., export type RouteParams = ..., export interface NavContext { ... }, export interface RouteContext extends NavContext { ... }, export type NavGroup = ..., export const NAV_GROUPS: readonly NavGroup[] = ..., export interface NavEntry { ... }, export interface RouteDef { ... }, export const ROUTES: RouteDef[] = ..., export const AUTH_ONLY_PAGES: ReadonlySet<PageId> = ..., export function routeForPage(page: PageId): RouteDef { ... }, export function matchPattern(pattern: string, hash: string): RouteParams | null { ... }, export interface RouteMatch { ... }, export function matchHash(rawHash: string): RouteMatch | null { ... }, export function hashForPage(page: PageId, params: RouteParams = ..., export function routeFromPathname(pathname: string): RouteDef | null { ... }, export function isRouteVisible(route: RouteDef, ctx: NavContext): boolean { ... }, export function navLabelFor(route: RouteDef, ctx: NavContext): string { ... }, export function tabLabelFor(route: RouteDef, ctx: NavContext): string { ... }, export function routeForShortcut(digit: number, ctx: NavContext): RouteDef | null { ... }, export function ownsShortcut(route: RouteDef, ctx: NavContext): boolean { ... }, export type NavRouteDef = ..., export function visibleNavRoutes(ctx: NavContext): NavRouteDef[] { ... }, export function visibleRailRoutes(ctx: NavContext): NavRouteDef[] { ... }, export function visibleGroupRoutes(group: NavGroup, ctx: NavContext): NavRouteDef[] { ... }
- `apps/web/src/components/ArtifactExplorer.tsx`: export function ArtifactExplorer({ ... }
- `apps/web/src/components/AuthButtons.tsx`: export function AuthButtons({ ... }
- `apps/web/src/components/AxisIcons.tsx`: export function Icon({ ... }
- `apps/web/src/components/CommandPalette.tsx`: export interface PaletteAction { ... }, export function CommandPalette({ ... }
- `apps/web/src/components/DangerButton.tsx`: export function DangerButton({ ... }
- `apps/web/src/components/DiffViewer.tsx`: export function computeLineDiff(oldText: string, newText: string): DiffLine[] { ... }, export interface DiffViewerProps { ... }, export function DiffViewer({ ... }
- `apps/web/src/components/FilesTab.tsx`: export function FilesTab({ ... }


---

## ⟳ Continue the loop

- **You are here:** `artifact-spec.md` — agent step 39 of 71.
- **Next:** `prd.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
