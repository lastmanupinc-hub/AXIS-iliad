# AGENTS.md — axis-iliad

## Project Context

This is a **monorepo** built with **TypeScript**.
\> **Axis' Iliad — The modern epic that shapes raw codebases into canonical, agent-ready artifacts. Axis' Iliad authors the definitive foundation for the next era of natural-language workspace development.**

### Stack

- React ^19.1.0

### Architecture

- monorepo
- containerized

### Conventions

- TypeScript strict mode
- Linter configured
- Formatter configured
- pnpm workspaces
- Makefile build

### Key Directories

- apps/ (monorepo_apps)
- docs/ (documentation)
- packages/ (monorepo_packages)
- mcp/ (project_directory)
- examples/ (project_directory)
- scripts/ (build_scripts)
- .github/ (project_directory)
- packaging/ (project_directory)

### Routes

- `GET /health` → docs/archive/e2e_ui_audit.yaml
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
- `GET /for-agents` → apps/api/src/server.ts
- `GET /v1/install` → apps/api/src/server.ts
- `GET /v1/install/:platform` → apps/api/src/server.ts
- `POST /probe-intent` → apps/api/src/server.ts
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
- *… 124 more (see OpenAPI spec or `/v1/docs`)*

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
| `ChallengeWindow` | interface | 2 | apps/api/src/anon-frontdoor.ts |
| `DriftDeps` | interface | 5 | apps/api/src/architecture-drift-webhook.ts |
| `DriftOutcome` | interface | 3 | apps/api/src/architecture-drift-webhook.ts |
| `DriftResult` | interface | 3 | apps/api/src/architecture-drift.ts |
| `PushInfo` | interface | 7 | apps/api/src/architecture-drift.ts |
| `Attestation` | interface | 12 | apps/api/src/attestation.ts |
| `AttestationInput` | interface | 3 | apps/api/src/attestation.ts |
| *… 258 more* | | | |

When modifying domain models, update all downstream consumers (handlers, validators, tests).

## Agent Instructions

When working in this codebase:

- Use strict TypeScript. Avoid `any` types.
- Prefer functional components with hooks over class components.
- Run tests with vitest before committing.
- Use `pnpm` for dependency management. Do not mix package managers.

## Architecture Boundaries

Respect these layer separations:

- **presentation**: apps

## Key Entry Points

- **`apps/api/src/server.ts`**: `export const router = ...`, `export const app = ...`
- **`apps/web/src/App.tsx`**: `export function App() { ... }`
- `apps/web/src/main.tsx`

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

<!-- Generated by axis-iliad skills program. Regenerate after significant code changes. -->


---

## ⟳ Continue the loop

- **You are here:** `AGENTS.md` — agent step 2 of 71.
- **Next:** `CLAUDE.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
