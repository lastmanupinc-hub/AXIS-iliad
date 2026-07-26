# Workflow Pack — axis-iliad

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
    action: Run `pnpm run build` then `pnpm test`
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

## Model Cascade

These workflows describe WHAT each step does. `model-cascade.md` maps WHO should run it — which capability tier (planner / executor / mechanical) fits each task type, derived from this repo's own detected signals.

## Detected Config Files

- `.prettierrc.json` (7 lines)
- `package.json` (68 lines)
- `tsconfig.base.json` (20 lines)
- `vitest.config.ts` (39 lines)
- `mcp/tsconfig.package.template.json` (36 lines)
- `mcp/tsconfig.root.template.json` (60 lines)
- `apps/api/package.json` (38 lines)
- `apps/api/tsconfig.json` (10 lines)
- `packages/agentic-compliance/package.json` (48 lines)
- `packages/agentic-compliance/tsconfig.json` (10 lines)

## Entry Points

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


---

## ⟳ Continue the loop

- **You are here:** `workflow-pack.md` — agent step 52 of 71.
- **Next:** `policy-pack.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
