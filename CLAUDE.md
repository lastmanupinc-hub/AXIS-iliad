# CLAUDE.md — axis-iliad

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 15 top-level directories. It defines 368 domain models.

## Commands

- **Install:** `npm install`
- **Build:** `npm run build`
- **Test:** `npm test`
- **Dev:** `npm run dev`

## Stack

- React ^19.1.0
- CI: github_actions
- Deploy: docker

## Structure

- apps/ (monorepo_apps)
- packages/ (monorepo_packages)
- examples/ (project_directory)
- mcp/ (project_directory)
- .github/ (project_directory)
- algorithmic/ (project_directory)
- artifacts/ (project_directory)
- brand/ (project_directory)

## Conventions

- TypeScript strict mode
- Linter configured
- Formatter configured
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

## Warnings

- No lockfile found — dependency versions may be inconsistent

## Key Source Files

### `apps/api/src/server.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";
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
  handleArtifactsGenerate,
  handleRemotionGenerate,
  handleCanvasGenerate,
  handleAlgorithmicGenerate,
  handleAgenticPurchasingGenerate,
  handleCloserGenerate,
  handleDeployGenerate,
  handleGitHubAnalyze,
  handleAnalyze,
... (430 more lines)
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
import { AdminPage } from "./pages/AdminPage.tsx";
import { MyAnalyticsPage } from "./pages/MyAnalyticsPage.tsx";
import { ToolsIndexPage } from "./pages/ToolsIndexPage.tsx";
import { WebResearchPage } from "./pages/tools/WebResearchPage.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import { getAdminStats, ApiError, type SnapshotResponse } from "./api.ts";

// ─── Error Boundary ─────────────────────────────────────────────
// React requires a class for getDerivedStateFromError; this thin wrapper
// keeps the rest of the codebase class-free per .cursorrules.

class ErrorCatcher extends Component<{ children: ReactNode; fallback: (error: Error, reset: () => void) => ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
... (457 more lines)
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

### `packages/context-engine/src/index.ts`

```typescript
export type { ContextMap, RepoProfile } from "./types.js";
export { buildContextMap, buildRepoProfile } from "./engine.js";

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
    "@axis/repo-parser": "workspace:*",
    "@axis/snapshots": "workspace:*",
    "@jmondi/oauth2-server": "^4.2.2",
    "dockerode": "^4.0.12",
    "ffmpeg-static": "^5.3.0",
... (16 more lines)
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
