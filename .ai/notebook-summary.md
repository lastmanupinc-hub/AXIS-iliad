# Notebook Summary — axis-iliad

> Research and knowledge notebook for a monorepo (TypeScript)

## Project Synopsis

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

## Architecture Overview

- **Files**: 500 files across 57 directories
- **Lines of Code**: 115,124
- **Primary Language**: TypeScript
- **Frameworks**: React
- **Patterns**: monorepo, containerized
- **Separation Score**: 0.65 / 1.0

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

## Conventions

- TypeScript strict mode
- Linter configured
- Formatter configured
- Makefile build

## Warnings & Notes

- ⚠ No lockfile found — dependency versions may be inconsistent

## Dependency Snapshot

Total external dependencies: **32**

| Package | Version |
|---------|---------|
| @axis/context-engine | workspace:* |
| @axis/generator-core | workspace:* |
| @axis/mpp | workspace:* |
| @axis/paid-client | workspace:* |
| @axis/repo-parser | workspace:* |
| @axis/snapshots | workspace:* |
| @jmondi/oauth2-server | ^4.2.2 |
| dockerode | ^4.0.12 |
| ffmpeg-static | ^5.3.0 |
| jsonwebtoken | ^9.0.3 |
| ... | +22 more |

## Entry Point Source

| File | Exports |
|------|---------|
| `apps/api/src/server.ts` | export const app = ... |
| `apps/web/src/App.tsx` | export function App() { ... } |
| `apps/web/src/main.tsx` | default |
| `packages/context-engine/src/index.ts` | export type { ... }, export { ... } |

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

### `apps/api/package.json`

```json
{
  "name": "@axis/api",
  "version": "0.5.3",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "npx tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "echo skipped â€” run vitest from root"
  },
  "dependencies": {
    "@axis/context-engine": "workspace:*",
    "@axis/generator-core": "workspace:*",
    "@axis/mpp": "workspace:*",
... (22 more lines)
```

### `apps/api/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}

```


---

## ⟳ Continue the loop

- **You are here:** `notebook-summary.md` — agent step 25 of 70.
- **Next:** `study-brief.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
