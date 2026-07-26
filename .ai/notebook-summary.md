# Notebook Summary — axis-iliad

> Research and knowledge notebook for a monorepo (TypeScript)

## Project Synopsis

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 9 top-level directories. It defines 278 domain models.

## Architecture Overview

- **Files**: 500 files across 45 directories
- **Lines of Code**: 108,805
- **Primary Language**: TypeScript
- **Frameworks**: React
- **Patterns**: monorepo, containerized
- **Separation Score**: 0.64 / 1.0

## Key Concepts

- **`AlertThresholds`** — interface (2 fields in `apps/api/src/alerting.ts`)
- **`Counters`** — type_alias (2 fields in `apps/api/src/alerting.ts`)
- **`DebounceState`** — interface (2 fields in `apps/api/src/alerting.ts`)
- **`WindowResult`** — interface (4 fields in `apps/api/src/alerting.ts`)
- **`AnalyticsCountByBucketResult`** — interface (3 fields in `apps/api/src/analytics.ts`)
- **`AnalyticsCountByBucketRow`** — interface (2 fields in `apps/api/src/analytics.ts`)
- **`AnalyticsCountByEventResult`** — interface (2 fields in `apps/api/src/analytics.ts`)
- **`AnalyticsCountByEventRow`** — interface (2 fields in `apps/api/src/analytics.ts`)
- **`AnalyticsCountResult`** — interface (2 fields in `apps/api/src/analytics.ts`)
- **`AnalyticsDistinctUsersResult`** — interface (2 fields in `apps/api/src/analytics.ts`)
- *(+268 more)*

## Conventions

- TypeScript strict mode
- Linter configured
- Formatter configured
- pnpm workspaces
- Makefile build

## Dependency Snapshot

Total external dependencies: **41**

| Package | Version |
|---------|---------|
| @axis/agentic-compliance | workspace:* |
| @axis/ap2 | workspace:* |
| @axis/context-engine | workspace:* |
| @axis/generator-core | workspace:* |
| @axis/mpp | workspace:* |
| @axis/paid-client | workspace:* |
| @axis/repo-parser | workspace:* |
| @axis/snapshots | workspace:* |
| dockerode | ^5.0.1 |
| ffmpeg-static | ^5.3.0 |
| ... | +31 more |

## Entry Point Source

| File | Exports |
|------|---------|
| `apps/api/src/server.ts` | export const router = ..., export const app = ... |
| `apps/web/src/App.tsx` | export function App() { ... } |
| `apps/web/src/main.tsx` | (no exports) |

## Configuration Files

### `.prettierrc.json`

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}

```

### `package.json`

```json
{
  "name": "axis-iliad",
  "version": "0.5.3",
  "private": true,
  "type": "module",
  "description": "Axis' Iliad - one API call that turns any codebase into 142 deterministic AI-agent-ready artifacts (AGENTS.md, CLAUDE.md, design tokens, Visa CE 3.0 compliance kit, MCP configs, and more)",
  "keywords": [
    "ai",
    "agents",
    "mcp",
    "codebase-analysis",
    "artifact-generation",
    "agents-md",
    "claude-md",
    "cursorrules",
... (53 more lines)
```

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noUnusedLocals": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist",
... (5 more lines)
```


---

## ⟳ Continue the loop

- **You are here:** `notebook-summary.md` — agent step 25 of 71.
- **Next:** `study-brief.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
