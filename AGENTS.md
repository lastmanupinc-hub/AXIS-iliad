# AGENTS.md — axis-iliad

## Project Context

This is a **monorepo** built with **TypeScript**.

### Stack

- React ^19.1.0

### Architecture

- monorepo
- containerized

### Conventions

- TypeScript strict mode
- Linter configured
- Formatter configured
- Makefile build

### Key Directories

- apps/ (monorepo_apps)
- packages/ (monorepo_packages)
- examples/ (project_directory)
- mcp/ (project_directory)
- .github/ (project_directory)
- algorithmic/ (project_directory)
- artifacts/ (project_directory)
- brand/ (project_directory)

### Routes

- `GET /` → apps/api/src/server.ts
- `GET /v1/health` → apps/api/src/server.ts
- `GET /v1/health/live` → apps/api/src/server.ts
- `GET /v1/health/ready` → apps/api/src/server.ts
- `GET /v1/metrics` → apps/api/src/server.ts
- `GET /performance` → apps/api/src/server.ts
- `GET /performance/reputation` → apps/api/src/server.ts
- `GET /v1/db/stats` → apps/api/src/server.ts
- `POST /v1/db/maintenance` → apps/api/src/server.ts
- `GET /v1/docs` → apps/api/src/server.ts
- `POST /v1/snapshots` → apps/api/src/server.ts
- `GET /v1/snapshots/:snapshot_id` → apps/api/src/server.ts
- `DELETE /v1/snapshots/:snapshot_id` → apps/api/src/server.ts
- `GET /v1/snapshots/:snapshot_id/versions` → apps/api/src/server.ts
- `GET /v1/snapshots/:snapshot_id/versions/:version_number` → apps/api/src/server.ts
- `GET /v1/snapshots/:snapshot_id/diff` → apps/api/src/server.ts
- `GET /v1/projects/:project_id/context` → apps/api/src/server.ts
- `GET /v1/projects/:project_id/generated-files` → apps/api/src/server.ts
- `GET /v1/projects/:project_id/generated-files/:file_path*` → apps/api/src/server.ts
- `DELETE /v1/projects/:project_id` → apps/api/src/server.ts
- `POST /v1/search/export` → apps/api/src/server.ts
- `POST /v1/skills/generate` → apps/api/src/server.ts
- `POST /v1/debug/analyze` → apps/api/src/server.ts
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
- `POST /v1/closer/generate` → apps/api/src/server.ts
- `POST /v1/deploy/generate` → apps/api/src/server.ts
- `POST /v1/prepare-for-agentic-purchasing` → apps/api/src/server.ts
- `POST /v1/analyze` → apps/api/src/server.ts
- `POST /v1/github/analyze` → apps/api/src/server.ts
- `POST /v1/github/webhook` → apps/api/src/server.ts
- `POST /v1/research/scrape` → apps/api/src/server.ts
- `POST /v1/research/crawl` → apps/api/src/server.ts
- `GET /.well-known/axis.json` → apps/api/src/server.ts
- `GET /.well-known/capabilities.json` → apps/api/src/server.ts
- `GET /.well-known/mcp.json` → apps/api/src/server.ts
- `GET /.well-known/security.txt` → apps/api/src/server.ts
- *… 101 more (see OpenAPI spec or `/v1/docs`)*

### Domain Models

| Model | Kind | Fields | Source |
|-------|------|--------|--------|
| `AnalyticsCountByBucketResult` | interface | 3 | apps/api/src/analytics.ts |
| `AnalyticsCountByBucketRow` | interface | 2 | apps/api/src/analytics.ts |
| `AnalyticsCountByEventResult` | interface | 2 | apps/api/src/analytics.ts |
| `AnalyticsCountByEventRow` | interface | 2 | apps/api/src/analytics.ts |
| `AnalyticsCountResult` | interface | 2 | apps/api/src/analytics.ts |
| `AnalyticsDistinctUsersResult` | interface | 2 | apps/api/src/analytics.ts |
| `AnalyticsEvent` | interface | 4 | apps/api/src/analytics.ts |
| `AnalyticsQuery` | interface | 7 | apps/api/src/analytics.ts |
| `WhereClause` | interface | 2 | apps/api/src/analytics.ts |
| `AuthContext` | interface | 3 | apps/api/src/billing.ts |
| `NotConfiguredResult` | interface | 4 | apps/api/src/code-sandbox.ts |
| `SandboxOptions` | interface | 4 | apps/api/src/code-sandbox.ts |
| `SandboxResult` | interface | 6 | apps/api/src/code-sandbox.ts |
| `DocxExtractResult` | interface | 2 | apps/api/src/document-parsing.ts |
| `NotConfiguredResult` | interface | 5 | apps/api/src/document-parsing.ts |
| `ParseOptions` | interface | 3 | apps/api/src/document-parsing.ts |
| `ParseResult` | interface | 6 | apps/api/src/document-parsing.ts |
| `PdfExtractResult` | interface | 2 | apps/api/src/document-parsing.ts |
| `EmailConfig` | interface | 2 | apps/api/src/email.ts |
| `ResendErrorResponse` | interface | 3 | apps/api/src/email.ts |
| *… 265 more* | | | |

When modifying domain models, update all downstream consumers (handlers, validators, tests).

## Agent Instructions

When working in this codebase:

- Use strict TypeScript. Avoid `any` types.
- Prefer functional components with hooks over class components.
- Run tests with vitest before committing.

## Known Issues

- No lockfile found — dependency versions may be inconsistent

## Architecture Boundaries

Respect these layer separations:

- **presentation**: apps, frontend

## Key Entry Points

- **`apps/api/src/server.ts`**: `export const app = ...`
- **`apps/web/src/App.tsx`**: `export function App() { ... }`
- `apps/web/src/main.tsx`
- **`packages/context-engine/src/index.ts`**: `export type { ... }`, `export { ... }`
- **`packages/generator-core/src/index.ts`**: `export type { ... }`, `export { ... }`, `export { ... }`, `export { ... }`
- **`packages/mpp/src/index.ts`**: `export type ChargeOptions = ...`, `export type MppResult = ...`, `export interface AgentBudget { ... }`, `export interface PricingTier { ... }`
- *... and 2 more*

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
... (21 more lines)
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

<!-- Generated by axis-iliad skills program. Regenerate after significant code changes. -->
