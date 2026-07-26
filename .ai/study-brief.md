# Study Brief — axis-iliad

> Structured learning guide for understanding this codebase

## Prerequisites

Before diving into this codebase, you should be comfortable with:

- **TypeScript** — the primary language
- **React** — used framework
- **Build tools**: vite, make

## Recommended Reading Order

### Phase 1: Orientation

1. Read the project README and any CONTRIBUTING.md
2. Understand the top-level directory structure:

   - `apps` — monorepo_apps (295 files)
   - `docs` — documentation (48 files)
   - `packages` — monorepo_packages (19 files)
   - `mcp` — project_directory (12 files)
   - `examples` — project_directory (11 files)
   - `scripts` — build_scripts (11 files)
   - `.github` — project_directory (10 files)
   - `packaging` — project_directory (6 files)

### Phase 2: Entry Points

Start with these files to understand the application flow:

- `apps/api/src/server.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/main.tsx`

### Phase 3: Core Domain Models

These are the core data structures that define what the system works with:

| Model | Kind | Fields | File |
|-------|------|--------|------|
| `AlertThresholds` | interface | 2 | `apps/api/src/alerting.ts` |
| `Counters` | type_alias | 2 | `apps/api/src/alerting.ts` |
| `DebounceState` | interface | 2 | `apps/api/src/alerting.ts` |
| `WindowResult` | interface | 4 | `apps/api/src/alerting.ts` |
| `AnalyticsCountByBucketResult` | interface | 3 | `apps/api/src/analytics.ts` |
| `AnalyticsCountByBucketRow` | interface | 2 | `apps/api/src/analytics.ts` |
| `AnalyticsCountByEventResult` | interface | 2 | `apps/api/src/analytics.ts` |
| `AnalyticsCountByEventRow` | interface | 2 | `apps/api/src/analytics.ts` |
| `AnalyticsCountResult` | interface | 2 | `apps/api/src/analytics.ts` |
| `AnalyticsDistinctUsersResult` | interface | 2 | `apps/api/src/analytics.ts` |
| *(+268 more)* | | | |

### Phase 4: Data Flow

Trace the flow of data through the system:

Key routes to trace:

- `GET /health` → `docs/archive/e2e_ui_audit.yaml`
- `GET /v1/health` → `docs/archive/e2e_ui_audit.yaml`
- `POST /v1/accounts` → `apps/api/src/server.ts`
- `GET /v1/account` → `apps/api/src/server.ts`
- `PATCH /v1/account` → `apps/api/src/server.ts`

### Phase 5: Testing

Test framework: **vitest**

- Run the test suite to verify your environment
- Read test files — they're the best documentation of expected behavior
- Modify one test, break it, fix it — confirm your understanding

## Study Questions

Answer these to confirm understanding:

1. What is the primary purpose of axis-iliad?
2. What happens when a request enters the system?
3. Where is state stored and how is it managed?
4. What are the key boundaries between modules?
5. What would break if you renamed the primary entry point?
6. Trace the lifecycle of a `ContextMap` from creation to storage. What touches it?
7. Which domain model has the most dependencies? Is that appropriate?

## Dependency-Based Reading Order

Read the codebase **bottom-up**: the modules the most other files depend on first (they define the shared vocabulary — types, core utilities), and the orchestrators that wire everything together last. Derived from the actual import graph:

| # | Module | Depended-on by | Depends on | Role |
|---|--------|----------------|------------|------|
| 1 | `apps/api/src/router.ts` | 113 | 4 | foundational |
| 2 | `apps/api/src/test-helpers.ts` | 54 | 1 | foundational |
| 3 | `apps/api/src/rate-limiter.ts` | 46 | 2 | foundational |
| 4 | `apps/api/src/billing.ts` | 44 | 3 | foundational |
| 5 | `apps/api/src/logger.ts` | 34 | 0 | foundational |
| 6 | `apps/api/src/mpp.ts` | 19 | 1 | foundational |
| 7 | `apps/web/src/api.ts` | 17 | 1 | foundational |
| 8 | `apps/api/src/counts.ts` | 16 | 0 | foundational |

## Key Files to Read

## Entry Point Source

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
... (532 more lines)
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
... (696 more lines)
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

## Configuration Overview

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


---

## ⟳ Continue the loop

- **You are here:** `study-brief.md` — agent step 26 of 71.
- **Next:** `research-threads.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
