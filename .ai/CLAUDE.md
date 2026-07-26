# CLAUDE.md — axis-iliad

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 9 top-level directories. It defines 278 domain models.

## Commands

- **Install:** `pnpm install`
- **Build:** `pnpm run build`
- **Test:** `pnpm test`
- **Dev:** `pnpm run dev`

## Stack

- React ^19.1.0
- CI: github_actions
- Deploy: docker

## Structure

- apps/ (monorepo_apps)
- docs/ (documentation)
- packages/ (monorepo_packages)
- mcp/ (project_directory)
- examples/ (project_directory)
- scripts/ (build_scripts)
- .github/ (project_directory)
- packaging/ (project_directory)

## Conventions

- TypeScript strict mode
- Linter configured
- Formatter configured
- pnpm workspaces
- Makefile build

## Do NOT

- Do not add dependencies without discussion
- Do not change the framework or architecture pattern
- Do not bypass TypeScript strict mode
- Do not use class components

## Data Models

Detected domain model contracts:

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

## API Surface

HTTP routes detected in this codebase:

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
- *… 134 more (see the OpenAPI spec or `/v1/docs`)*

## Key Source Files

### `apps/api/src/server.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";
import { Router, createApp } from "./router.js";
import { startAlerting } from "./alerting.js";
import {
  handleCreateSnapshot,
  handleGetSnapshot,
  handleGetContext,
  handleGetGeneratedFiles,
  handleGetGeneratedFile,
  handleSearchExport,
  handleSkillsGenerate,
  handleDebugAnalyze,
  handleFrontendAudit,
  handleSeoAnalyze,
  handleOptimizationAnalyze,
  handleThemeGenerate,
  handleBrandGenerate,
  handleSuperpowersGenerate,
  handleMarketingGenerate,
  handleNotebookGenerate,
  handleObsidianAnalyze,
  handleMcpProvision,
  handleArtifactsGenerate,
  handleRemotionGenerate,
  handleCanvasGenerate,
  handleAlgorithmicGenerate,
  handleAgenticPurchasingGenerate,
  handleCloserGenerate,
  handleDeployGenerate,
  handleGitHubAnalyze,
... (522 more lines)
```

### `apps/web/src/App.tsx`

```tsx
import { useState, useCallback, useEffect, useMemo, useRef, Fragment, Component, Suspense, type ReactNode } from "react";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal, type SignUpTrigger } from "./components/SignUpModal.tsx";
import { Icon } from "./components/Icon.tsx";
import { PageFooter } from "./components/primitives/PageFooter.tsx";
import { getAdminStats, migrateLegacyKey, logoutSession, getProjectContext, getGeneratedFiles, rememberReturnTo, consumeReturnTo, ApiError, type SnapshotResponse } from "./api.ts";
import { APP_VERSION } from "./version.ts";
import {
  ROUTES,
  NAV_GROUPS,
  AUTH_ONLY_PAGES,
  routeForPage,
  isRouteVisible,
  navLabelFor,
  tabLabelFor,
  ownsShortcut,
  routeForShortcut,
  visibleRailRoutes,
  visibleGroupRoutes,
  hashForPage,
  matchHash,
  type NavContext,
  type PageId,
  type RouteContext,
  type RouteDef,
  type RouteParams,
} from "./routes.tsx";
import { useHashRoute, isOAuthCallback } from "./useHashRoute.ts";
... (686 more lines)
```

### `apps/web/src/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./theme.css"; // generated design-system contract (app copy) — must load before index.css
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

```

## Configuration

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
    "llm-context",
    "visa-compliance",
    "x402",
    "ap2",
    "agentic-commerce"
... (48 more lines)
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
    "rootDir": "src"
  },
  "exclude": ["node_modules", "dist"]
}

```

<!-- Generated by axis-iliad skills program. Regenerate after significant code changes. -->


---

## ⟳ Continue the loop

- **You are here:** `CLAUDE.md` — agent step 3 of 71.
- **Next:** `debug-playbook.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
