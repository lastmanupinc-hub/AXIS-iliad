# Notebook Summary — axis-toolbox

> Research and knowledge notebook for a monorepo (TypeScript)

## Project Synopsis

axis-toolbox is a monorepo built with TypeScript using React. It contains 466 files across 21 top-level directories. It defines 146 domain models.

## Architecture Overview

- **Files**: 466 files across 65 directories
- **Lines of Code**: 107,233
- **Primary Language**: TypeScript
- **Frameworks**: React
- **Patterns**: monorepo, containerized
- **Separation Score**: 0.64/10

## Key Concepts

- **`AuthContext`** — interface (3 fields in `apps/api/src/billing.ts`)
- **`EnvSpec`** — interface (5 fields in `apps/api/src/env.ts`)
- **`ValidationError`** — interface (2 fields in `apps/api/src/env.ts`)
- **`ValidationResult`** — interface (3 fields in `apps/api/src/env.ts`)
- **`ZipEntry`** — interface (4 fields in `apps/api/src/export.ts`)
- **`IntentCapture`** — interface (5 fields in `apps/api/src/mcp-server.ts`)
- **`JsonRpcRequest`** — interface (4 fields in `apps/api/src/mcp-server.ts`)
- **`McpCallCounters`** — interface (5 fields in `apps/api/src/mcp-server.ts`)
- **`RpcError`** — interface (5 fields in `apps/api/src/mcp-server.ts`)
- **`RpcSuccess`** — interface (3 fields in `apps/api/src/mcp-server.ts`)

## Conventions

- TypeScript strict mode
- pnpm workspaces

## Warnings & Notes

- ⚠ No lockfile found — dependency versions may be inconsistent

## Dependency Snapshot

Total external dependencies: **20**

| Package | Version |
|---------|---------|
| @axis/context-engine | workspace:* |
| @axis/generator-core | workspace:* |
| @axis/repo-parser | workspace:* |
| @axis/snapshots | workspace:* |
| mppx | ^0.5.12 |
| jszip | ^3.10.1 |
| react | ^19.1.0 |
| react-dom | ^19.1.0 |
| better-sqlite3 | ^12.8.0 |
| uuid | ^11.1.0 |
| ... | +10 more |

## Entry Point Source

| File | Exports |
|------|---------|
| `apps/api/src/server.ts` | export const app = ... |
| `apps/web/src/App.tsx` | export function App() { ... } |
| `apps/web/src/main.tsx` | default |
| `packages/context-engine/src/index.ts` | export type { ... }, export { ... } |
| `packages/generator-core/src/index.ts` | export type { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... } |
| `packages/repo-parser/src/index.ts` | export type { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export type { ... }, export { ... }, export type { ... } |

## Configuration Files

### `apps/api/package.json`

```json
{
  "name": "@axis/api",
  "version": "0.4.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "node --test dist/**/*.test.js"
  },
  "dependencies": {
    "@axis/context-engine": "workspace:*",
    "@axis/generator-core": "workspace:*",
    "@axis/repo-parser": "workspace:*",
... (11 more lines)
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

### `apps/cli/package.json`

```json
{
  "name": "@axis/cli",
  "version": "0.4.0",
  "private": true,
  "type": "module",
  "bin": {
    "axis": "./bin/axis.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/cli.js"
  },
  "dependencies": {
    "@axis/snapshots": "workspace:*",
    "@axis/repo-parser": "workspace:*",
... (8 more lines)
```
