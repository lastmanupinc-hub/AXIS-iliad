# Artifact Specification — axis-iliad

Generated: 1970-01-01T00:00:00.000Z

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

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

- **TypeScript**: 80% ████████████████ (312 files, 89597 LOC)
- **YAML**: 9.5% ██ (57 files, 10597 LOC)
- **Markdown**: 5.6% █ (77 files, 6295 LOC)
- **JavaScript**: 2% █ (9 files, 2273 LOC)
- **JSON**: 1.7% █ (34 files, 1922 LOC)
- **CSS**: 1% █ (1 files, 1149 LOC)
- **HTML**: 0.1% █ (1 files, 158 LOC)
- **Dockerfile**: 0% █ (1 files, 21 LOC)

## Architecture

### Patterns Detected
- monorepo
- containerized

### Layer Boundaries
- **presentation**: apps, frontend

## Entry Points

No entry points detected.

## Hotspots

| Path | Inbound | Outbound | Risk |
|------|---------|----------|------|
| `apps/api/src/router.ts` | 96 | 4 | 1.0 |
| `apps/api/src/test-helpers.ts` | 41 | 1 | 1.0 |
| `apps/api/src/billing.ts` | 28 | 3 | 1.0 |
| `apps/api/src/handlers.ts` | 23 | 14 | 1.0 |
| `apps/api/src/rate-limiter.ts` | 36 | 2 | 1.0 |
| `apps/api/src/logger.ts` | 25 | 0 | 1.0 |
| `apps/api/src/server.ts` | 1 | 35 | 1.0 |
| `apps/web/src/App.tsx` | 1 | 24 | 1.0 |
| `packages/generator-core/src/generate.ts` | 30 | 6 | 1.0 |
| `apps/api/src/mcp-tool-impls.ts` | 0 | 24 | 1.0 |

## Artifact Generation Rules

When generating artifacts for this project:

1. **Component artifacts** should use React conventions
2. **Widget artifacts** should render project metrics from real data
3. **Embed snippets** should include all conventions and warnings
4. **File naming** should follow TypeScript conventions
5. **Architecture score**: 65/100

## Dependencies (Top 10)

- `@axis/context-engine` @ workspace:*
- `@axis/generator-core` @ workspace:*
- `@axis/mpp` @ workspace:*
- `@axis/paid-client` @ workspace:*
- `@axis/repo-parser` @ workspace:*
- `@axis/snapshots` @ workspace:*
- `@jmondi/oauth2-server` @ ^4.2.2
- `dockerode` @ ^4.0.12
- `ffmpeg-static` @ ^5.3.0
- `jsonwebtoken` @ ^9.0.3

## Source Entry Points

| File | Exports |
|------|---------|
| `apps/api/src/server.ts` | export const app = ... |
| `apps/web/src/App.tsx` | export function App() { ... } |
| `apps/web/src/main.tsx` | default |
| `packages/context-engine/src/index.ts` | export type { ... }, export { ... } |

## Component Signatures

- `apps/web/src/App.tsx`: export function App() { ... }
- `apps/web/src/components/AuthButtons.tsx`: export function AuthButtons({ ... }
- `apps/web/src/components/AxisIcons.tsx`: export function Icon({ ... }
- `apps/web/src/components/CommandPalette.tsx`: export interface PaletteAction { ... }, export function CommandPalette({ ... }
- `apps/web/src/components/FilesTab.tsx`: export function FilesTab({ ... }
- `apps/web/src/components/GeneratedTab.tsx`: export function GeneratedTab({ ... }
- `apps/web/src/components/GraphTab.tsx`: export function GraphTab({ ... }
- `apps/web/src/components/Icon.tsx`: export function Icon({ ... }
- `apps/web/src/components/OverviewTab.tsx`: export function OverviewTab({ ... }
- `apps/web/src/components/ProgramLauncher.tsx`: export function ProgramLauncher({ ... }


---

## ⟳ Continue the loop

- **You are here:** `artifact-spec.md` — agent step 39 of 70.
- **Next:** `prd.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
