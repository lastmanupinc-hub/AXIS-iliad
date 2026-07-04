# AGENTS.md — axis-iliad

## Project Context

This is a **monorepo** built with **TypeScript**.
> **Axis' Iliad — The modern epic that shapes raw codebases into canonical, agent-ready artifacts. Axis' Iliad authors the definitive foundation for the next era of natural-language workspace development.**

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
- docs/ (documentation)
- examples/ (project_directory)
- mcp/ (project_directory)
- .github/ (project_directory)
- algorithmic/ (project_directory)
- artifacts/ (project_directory)

### Routes

- `GET /v1/health` → apps/api/src/server.ts
- `POST /v1/accounts` → apps/api/src/server.ts
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
- `GET /for-agents` → apps/api/src/server.ts
- `GET /v1/install` → apps/api/src/server.ts
- `GET /v1/install/:platform` → apps/api/src/server.ts
- `POST /probe-intent` → apps/api/src/server.ts
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
- `GET /health` → apps/api/src/server.ts
- `POST /v1/search/export` → apps/api/src/server.ts
- `POST /v1/skills/generate` → apps/api/src/server.ts
- `POST /v1/frontend/audit` → apps/api/src/server.ts
- `POST /v1/seo/analyze` → apps/api/src/server.ts
- *… 113 more (see OpenAPI spec or `/v1/docs`)*

### Domain Models

| Model | Kind | Fields | Source |
|-------|------|--------|--------|
| `AlertThresholds` | interface | 2 | apps/api/src/alerting.ts |
| `Counters` | type_alias | 2 | apps/api/src/alerting.ts |
| `DebounceState` | interface | 2 | apps/api/src/alerting.ts |
| `WindowResult` | interface | 4 | apps/api/src/alerting.ts |
| `AnalyticsCountByBucketResult` | interface | 3 | apps/api/src/analytics.ts |
| `AnalyticsCountByBucketRow` | interface | 2 | apps/api/src/analytics.ts |
| `AnalyticsCountByEventResult` | interface | 2 | apps/api/src/analytics.ts |
| `AnalyticsCountByEventRow` | interface | 2 | apps/api/src/analytics.ts |
| `AnalyticsCountResult` | interface | 2 | apps/api/src/analytics.ts |
| `AnalyticsDistinctUsersResult` | interface | 2 | apps/api/src/analytics.ts |
| `AnalyticsEvent` | interface | 4 | apps/api/src/analytics.ts |
| `AnalyticsQuery` | interface | 8 | apps/api/src/analytics.ts |
| `WhereClause` | interface | 2 | apps/api/src/analytics.ts |
| `DriftDeps` | interface | 5 | apps/api/src/architecture-drift-webhook.ts |
| `DriftOutcome` | interface | 3 | apps/api/src/architecture-drift-webhook.ts |
| `DriftResult` | interface | 3 | apps/api/src/architecture-drift.ts |
| `PushInfo` | interface | 7 | apps/api/src/architecture-drift.ts |
| `Attestation` | interface | 12 | apps/api/src/attestation.ts |
| `AttestationInput` | interface | 3 | apps/api/src/attestation.ts |
| `AttestationOutput` | interface | 3 | apps/api/src/attestation.ts |
| *… 222 more* | | | |

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

<!-- Generated by axis-iliad skills program. Regenerate after significant code changes. -->


---

## ⟳ Continue the loop

- **You are here:** `AGENTS.md` — agent step 2 of 70.
- **Next:** `CLAUDE.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
