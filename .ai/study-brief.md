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

   - `apps` — monorepo_apps (235 files)
   - `packages` — monorepo_packages (93 files)
   - `docs` — documentation (21 files)
   - `examples` — project_directory (17 files)
   - `mcp` — project_directory (16 files)
   - `.github` — project_directory (8 files)
   - `algorithmic` — project_directory (4 files)
   - `artifacts` — project_directory (4 files)

### Phase 2: Entry Points

Identify the main entry point by checking package.json `main` or `bin` fields.

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
| *(+232 more)* | | | |

### Phase 4: Data Flow

Trace the flow of data through the system:

Key routes to trace:

- `GET /v1/health` → `apps/api/src/admin.test.ts`
- `POST /v1/accounts` → `apps/api/src/admin.test.ts`
- `POST /v1/snapshots` → `apps/api/src/admin.test.ts`
- `GET /v1/admin/stats` → `apps/api/src/admin.test.ts`
- `GET /v1/admin/accounts` → `apps/api/src/admin.test.ts`

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
| 1 | `apps/api/src/router.ts` | 96 | 4 | foundational |
| 2 | `apps/api/src/test-helpers.ts` | 41 | 1 | foundational |
| 3 | `apps/api/src/rate-limiter.ts` | 36 | 2 | foundational |
| 4 | `apps/api/src/billing.ts` | 28 | 3 | foundational |
| 5 | `apps/api/src/logger.ts` | 25 | 0 | foundational |
| 6 | `packages/generator-core/src/generate.ts` | 30 | 6 | foundational |
| 7 | `apps/web/src/api.ts` | 19 | 0 | foundational |
| 8 | `apps/api/src/counts.ts` | 12 | 0 | foundational |

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
... (477 more lines)
```

### `apps/web/src/App.tsx`

```tsx
import { useState, useCallback, useEffect, useRef, useMemo, Component, type ReactNode } from "react";
import { UploadPage } from "./pages/UploadPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { PlansPage } from "./pages/PlansPage.tsx";
import { AccountPage } from "./pages/AccountPage.tsx";
import { DocsPage } from "./pages/DocsPage.tsx";
import { HelpPage } from "./pages/HelpPage.tsx";
import { QAPage } from "./pages/QAPage.tsx";
import { ProgramsPage } from "./pages/ProgramsPage.tsx";
import { TermsPage } from "./pages/TermsPage.tsx";
import { ForAgentsPage } from "./pages/ForAgentsPage.tsx";
import { ExamplesPage } from "./pages/ExamplesPage.tsx";
import { InstallPage } from "./pages/InstallPage.tsx";
import { PaidCheckoutPage } from "./pages/PaidCheckoutPage.tsx";
import { AdminPage } from "./pages/AdminPage.tsx";
import { MyAnalyticsPage } from "./pages/MyAnalyticsPage.tsx";
import { ToolsIndexPage } from "./pages/ToolsIndexPage.tsx";
import { WebResearchPage } from "./pages/tools/WebResearchPage.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
... (559 more lines)
```

### `apps/web/src/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
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


---

## ⟳ Continue the loop

- **You are here:** `study-brief.md` — agent step 26 of 70.
- **Next:** `research-threads.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
