# Study Brief — axis-toolbox

> Structured learning guide for understanding this codebase

## Prerequisites

Before diving into this codebase, you should be comfortable with:

- **TypeScript** — the primary language
- **React** — used framework
- **Build tools**: vite

## Recommended Reading Order

### Phase 1: Orientation

1. Read the project README and any CONTRIBUTING.md
2. Understand the top-level directory structure:

   - `packages` — monorepo_packages (126 files)
   - `apps` — monorepo_apps (114 files)
   - `payment-processing-output` — project_directory (72 files)
   - `search` — project_directory (6 files)
   - `algorithmic` — project_directory (4 files)
   - `artifacts` — project_directory (4 files)
   - `brand` — project_directory (4 files)
   - `canvas` — project_directory (4 files)

### Phase 2: Entry Points

Identify the main entry point by checking package.json `main` or `bin` fields.

### Phase 3: Core Domain Models

These are the core data structures that define what the system works with:

| Model | Kind | Fields | File |
|-------|------|--------|------|
| `AuthContext` | interface | 3 | `apps/api/src/billing.ts` |
| `EnvSpec` | interface | 5 | `apps/api/src/env.ts` |
| `ValidationError` | interface | 2 | `apps/api/src/env.ts` |
| `ValidationResult` | interface | 3 | `apps/api/src/env.ts` |
| `ZipEntry` | interface | 4 | `apps/api/src/export.ts` |
| `HistogramEntry` | interface | 3 | `apps/api/src/metrics.ts` |
| `OpenApiSpec` | interface | 6 | `apps/api/src/openapi.ts` |
| `WindowEntry` | interface | 2 | `apps/api/src/rate-limiter.ts` |
| `AppHandle` | interface | 3 | `apps/api/src/router.ts` |
| `Route` | interface | 4 | `apps/api/src/router.ts` |
| *(+121 more)* | | | |

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

1. What is the primary purpose of axis-toolbox?
2. What happens when a request enters the system?
3. Where is state stored and how is it managed?
4. What are the key boundaries between modules?
5. What would break if you renamed the primary entry point?
6. Trace the lifecycle of a `ProgramDoc` from creation to storage. What touches it?
7. Which domain model has the most dependencies? Is that appropriate?

## Key Files to Read

## Entry Point Source

### `apps/api/src/server.ts`

```typescript
import { Router, createApp } from "./router.js";
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
... (214 more lines)
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
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import type { SnapshotResponse } from "./api.ts";

// ─── Error Boundary ─────────────────────────────────────────────

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
... (266 more lines)
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
... (10 more lines)
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
