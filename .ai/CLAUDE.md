# CLAUDE.md — axis-toolbox

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 432 files across 20 top-level directories. It defines 131 domain models.

## Commands

- **Install:** `pnpm install`
- **Build:** `pnpm run build`
- **Test:** `pnpm test`
- **Dev:** `pnpm run dev`

## Stack

- React ^19.1.0
- Deploy: docker

## Structure

- packages/ (monorepo_packages)
- apps/ (monorepo_apps)
- payment-processing-output/ (project_directory)
- search/ (project_directory)
- algorithmic/ (project_directory)
- artifacts/ (project_directory)
- brand/ (project_directory)
- canvas/ (project_directory)

## Conventions

- TypeScript strict mode
- pnpm workspaces

## Do NOT

- Do not add dependencies without discussion
- Do not change the framework or architecture pattern
- Do not bypass TypeScript strict mode
- Do not use class components

## Data Models

Detected domain model contracts:

| Model | Kind | Fields | Source |
|-------|------|--------|--------|
| `AuthContext` | interface | 3 | apps/api/src/billing.ts |
| `EnvSpec` | interface | 5 | apps/api/src/env.ts |
| `ValidationError` | interface | 2 | apps/api/src/env.ts |
| `ValidationResult` | interface | 3 | apps/api/src/env.ts |
| `ZipEntry` | interface | 4 | apps/api/src/export.ts |
| `HistogramEntry` | interface | 3 | apps/api/src/metrics.ts |
| `OpenApiSpec` | interface | 6 | apps/api/src/openapi.ts |
| `WindowEntry` | interface | 2 | apps/api/src/rate-limiter.ts |
| `AppHandle` | interface | 3 | apps/api/src/router.ts |
| `Route` | interface | 4 | apps/api/src/router.ts |
| `CliArgs` | interface | 5 | apps/cli/src/cli.ts |
| `AxisConfig` | interface | 2 | apps/cli/src/credential-store.ts |
| `RunResult` | interface | 4 | apps/cli/src/runner.ts |
| `ScanResult` | interface | 3 | apps/cli/src/scanner.ts |
| `WriteResult` | interface | 3 | apps/cli/src/writer.ts |
| `Account` | interface | 5 | apps/web/src/api.ts |
| `ApiKeyInfo` | interface | 5 | apps/web/src/api.ts |
| `ContextMap` | interface | 8 | apps/web/src/api.ts |
| `GeneratedFile` | interface | 5 | apps/web/src/api.ts |
| `GeneratedFilesResponse` | interface | 6 | apps/web/src/api.ts |
| *… 111 more* | | | |

## Warnings

- No CI/CD pipeline detected
- No lockfile found — dependency versions may be inconsistent

## Key Source Files

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
  handleArtifactsGenerate,
  handleRemotionGenerate,
  handleCanvasGenerate,
  handleAlgorithmicGenerate,
  handleGitHubAnalyze,
  handleHealthCheck,
  handleSearchIndex,
  handleSearchQuery,
  handleSearchStats,
  handleSearchSymbols,
... (204 more lines)
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
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("UI crash:", error); }
  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ margin: 40, textAlign: "center", padding: 32 }}>
          <h2>Something went wrong</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{this.state.error.message}</p>
          <button className="btn btn-primary" onClick={() => { this.setState({ error: null }); location.hash = ""; }}>
            Reload
... (256 more lines)
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
    "@axis/snapshots": "workspace:*"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^22.0.0",
... (5 more lines)
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
    "@axis/context-engine": "workspace:*",
    "@axis/generator-core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
... (3 more lines)
```

---
*Generated by Axis Skills*
