# Workflow Pack — axis-toolbox

Reusable AI-assisted workflows for common development tasks.

## Workflow: Feature Development

```yaml
name: feature-development
trigger: "New feature request"
steps:
  - name: analyze_scope
    action: Review architecture-summary.md for affected layers
  - name: plan_implementation
    action: Identify files to modify using dependency-hotspots.md
  - name: write_code
    action: Follow conventions from React
  - name: write_tests
    action: Add tests using vitest
  - name: validate
    action: Run vite
  - name: review
    action: Check against component-guidelines.md and frontend-rules.md
```

## Workflow: Bug Fix

```yaml
name: bug-fix
trigger: "Bug report or failing test"
steps:
  - name: reproduce
    action: Follow root-cause-checklist.md Step 1
  - name: isolate
    action: Use debug-playbook.md triage section
  - name: trace
    action: Check tracing-rules.md for log points
  - name: fix
    action: Apply minimal change in isolated scope
  - name: regression_test
    action: Add test covering the exact failure case
  - name: verify
    action: Run full test suite
```

## Workflow: Code Review

```yaml
name: code-review
trigger: "Pull request opened"
steps:
  - name: architecture_check
    action: Verify changes respect layer boundaries from architecture-summary.md
  - name: convention_check
    action: Validate against TypeScript conventions
  - name: test_coverage
    action: Ensure new code has tests
  - name: dependency_check
    action: Check dependency-hotspots.md for coupling increase
  - name: ci_check
    action: Verify github_actions pipeline passes
```

## Workflow: Refactor

```yaml
name: refactor
trigger: "Scheduled improvement or tech debt review"
steps:
  - name: identify_targets
    action: Use refactor-checklist.md and dependency-hotspots.md
  - name: plan_scope
    action: Define clear boundaries — one concern per refactor
  - name: baseline_tests
    action: Ensure existing tests pass before any changes
  - name: execute
    action: Apply changes incrementally with working tests at each step
  - name: validate
    action: Run full suite, check for regressions
```

## Detected Config Files

- `apps/api/package.json` (26 lines)
- `apps/api/tsconfig.json` (10 lines)
- `apps/cli/package.json` (23 lines)
- `apps/cli/tsconfig.json` (18 lines)
- `apps/web/package.json` (24 lines)
- `apps/web/tsconfig.json` (19 lines)
- `apps/web/vite.config.ts` (13 lines)
- `package.json` (28 lines)
- `packages/context-engine/package.json` (22 lines)
- `packages/context-engine/tsconfig.json` (10 lines)

## Entry Points

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
... (301 more lines)
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
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import type { SnapshotResponse } from "./api.ts";

// ─── Error Boundary ─────────────────────────────────────────────
... (306 more lines)
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
