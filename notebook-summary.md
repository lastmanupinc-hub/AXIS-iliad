# Notebook Summary — axis-iliad

> Research and knowledge notebook for a monorepo (TypeScript)

## Project Synopsis

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 163 domain models.

## Architecture Overview

- **Files**: 500 files across 57 directories
- **Lines of Code**: 123,671
- **Primary Language**: TypeScript
- **Frameworks**: React
- **Patterns**: monorepo, containerized
- **Separation Score**: 0.65/10

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

## Warnings & Notes

- ⚠ No lockfile found — dependency versions may be inconsistent

## Dependency Snapshot

Total external dependencies: **26**

| Package | Version |
|---------|---------|
| @axis/context-engine | workspace:* |
| @axis/generator-core | workspace:* |
| @axis/repo-parser | workspace:* |
| @axis/snapshots | workspace:* |
| @jmondi/oauth2-server | ^4.2.2 |
| jsonwebtoken | ^9.0.3 |
| mppx | ^0.5.12 |
| jszip | ^3.10.1 |
| react | ^19.1.0 |
| react-dom | ^19.1.0 |
| ... | +16 more |

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
  "version": "0.5.2",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "npx tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "echo skipped — run vitest from root"
  },
  "dependencies": {
    "@axis/context-engine": "workspace:*",
    "@axis/generator-core": "workspace:*",
    "@axis/repo-parser": "workspace:*",
... (14 more lines)
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
  "version": "0.5.2",
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
