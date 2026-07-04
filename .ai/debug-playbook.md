# Debug Playbook — axis-iliad

> Structured debugging guide for a monorepo built with TypeScript

> > **Axis' Iliad — The modern epic that shapes raw codebases into canonical, agent-ready artifacts. Axis' Iliad authors the definitive foundation for the next era of natural-language workspace development.**

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

## Quick Reference

| Item | Value |
|------|-------|
| Language | TypeScript |
| Frameworks | React ^19.1.0 (95%) |
| Test Runner | vitest |
| Build Tools | vite, make |
| CI | github_actions |
| Deploy Target | docker |
| Package Manager | npm |
| Files | 500 files, 115,124 LOC |
| Separation Score | 0.65/1.0 |

## Language Distribution

| Language | Files | LOC | % |
|----------|-------|-----|---|
| TypeScript | 312 | 89,597 | 80% |
| YAML | 57 | 10,597 | 9.5% |
| Markdown | 77 | 6,295 | 5.6% |
| JavaScript | 9 | 2,273 | 2% |
| JSON | 34 | 1,922 | 1.7% |
| CSS | 1 | 1,149 | 1% |
| HTML | 1 | 158 | 0.1% |
| Dockerfile | 1 | 21 | 0% |

## Detected Stack (with evidence)

### React v^19.1.0 — 95% confidence

- package.json: react@^19.1.0

## Project Structure

- apps/ (monorepo_apps)
- packages/ (monorepo_packages)
- docs/ (documentation)
- examples/ (project_directory)
- mcp/ (project_directory)
- .github/ (project_directory)
- algorithmic/ (project_directory)
- artifacts/ (project_directory)

## Triage Steps

### 1. Reproduce

```bash
npm install
npm test           # run existing tests (vitest)
npm run dev         # start dev server
```

### 2. Isolate

Check these files first based on the dependency graph:


### High-Risk Files (Dependency Hotspots)

These files have many inbound or outbound imports — changes here cascade:

| File | Inbound | Outbound | Risk |
|------|---------|----------|------|
| `apps/api/src/router.ts` | 96 | 4 | 100% |
| `apps/api/src/test-helpers.ts` | 41 | 1 | 100% |
| `apps/api/src/billing.ts` | 28 | 3 | 100% |
| `apps/api/src/handlers.ts` | 23 | 14 | 100% |
| `apps/api/src/rate-limiter.ts` | 36 | 2 | 100% |
| `apps/api/src/logger.ts` | 25 | 0 | 100% |
| `apps/api/src/server.ts` | 1 | 35 | 100% |
| `apps/web/src/App.tsx` | 1 | 24 | 100% |
| `packages/generator-core/src/generate.ts` | 30 | 6 | 100% |
| `apps/api/src/mcp-tool-impls.ts` | 0 | 24 | 100% |

### 3. Framework-Specific Debugging

#### React

- **State bugs:** Check for stale closures in `useEffect` and `useCallback`
- **Re-render loops:** Add `React.StrictMode` (already on if using Next.js)
- **Props drilling:** Check component hierarchy for unnecessary prop chains

## Domain Model Inventory

Key entities — bugs often involve state transitions or relationship integrity:

| Model | Kind | Language | Fields | Source |
|-------|------|----------|--------|--------|
| AlertThresholds | interface | TypeScript | 2 | `apps/api/src/alerting.ts` |
| Counters | type_alias | TypeScript | 2 | `apps/api/src/alerting.ts` |
| DebounceState | interface | TypeScript | 2 | `apps/api/src/alerting.ts` |
| WindowResult | interface | TypeScript | 4 | `apps/api/src/alerting.ts` |
| AnalyticsCountByBucketResult | interface | TypeScript | 3 | `apps/api/src/analytics.ts` |
| AnalyticsCountByBucketRow | interface | TypeScript | 2 | `apps/api/src/analytics.ts` |
| AnalyticsCountByEventResult | interface | TypeScript | 2 | `apps/api/src/analytics.ts` |
| AnalyticsCountByEventRow | interface | TypeScript | 2 | `apps/api/src/analytics.ts` |
| AnalyticsCountResult | interface | TypeScript | 2 | `apps/api/src/analytics.ts` |
| AnalyticsDistinctUsersResult | interface | TypeScript | 2 | `apps/api/src/analytics.ts` |
| AnalyticsEvent | interface | TypeScript | 4 | `apps/api/src/analytics.ts` |
| AnalyticsQuery | interface | TypeScript | 8 | `apps/api/src/analytics.ts` |
| WhereClause | interface | TypeScript | 2 | `apps/api/src/analytics.ts` |
| DriftDeps | interface | TypeScript | 5 | `apps/api/src/architecture-drift-webhook.ts` |
| DriftOutcome | interface | TypeScript | 3 | `apps/api/src/architecture-drift-webhook.ts` |
| DriftResult | interface | TypeScript | 3 | `apps/api/src/architecture-drift.ts` |
| PushInfo | interface | TypeScript | 7 | `apps/api/src/architecture-drift.ts` |
| Attestation | interface | TypeScript | 12 | `apps/api/src/attestation.ts` |
| AttestationInput | interface | TypeScript | 3 | `apps/api/src/attestation.ts` |
| AttestationOutput | interface | TypeScript | 3 | `apps/api/src/attestation.ts` |
| ChainLink | interface | TypeScript | 3 | `apps/api/src/attestation.ts` |
| AuthContext | interface | TypeScript | 3 | `apps/api/src/billing.ts` |
| NotConfiguredResult | interface | TypeScript | 4 | `apps/api/src/code-sandbox.ts` |
| SandboxOptions | interface | TypeScript | 4 | `apps/api/src/code-sandbox.ts` |
| SandboxResult | interface | TypeScript | 6 | `apps/api/src/code-sandbox.ts` |
| CommerceArtifact | interface | TypeScript | 3 | `apps/api/src/commerce-integration.ts` |
| DisputeReadiness | interface | TypeScript | 5 | `apps/api/src/commerce-integration.ts` |
| PurchaseDeps | interface | TypeScript | 1 | `apps/api/src/commerce-integration.ts` |
| ReadinessDimension | interface | TypeScript | 4 | `apps/api/src/commerce-integration.ts` |
| DeliverabilityKit | interface | TypeScript | 7 | `apps/api/src/deliverability.ts` |
| *… 212 more* | | | | |

## Route Map

| Method | Path | Source |
|--------|------|--------|
| GET | `/v1/health` | apps/api/src/server.ts |
| POST | `/v1/accounts` | apps/api/src/server.ts |
| POST | `/v1/snapshots` | apps/api/src/server.ts |
| GET | `/v1/admin/stats` | apps/api/src/server.ts |
| GET | `/v1/admin/accounts` | apps/api/src/server.ts |
| GET | `/v1/admin/activity` | apps/api/src/server.ts |
| GET | `/v1/admin/mcp-usage` | apps/api/src/server.ts |
| GET | `/v1/admin/revenue` | apps/api/src/server.ts |
| GET | `/llms.txt` | apps/api/src/server.ts |
| GET | `/.well-known/skills/index.json` | apps/api/src/server.ts |
| GET | `/v1/docs.md` | apps/api/src/server.ts |
| GET | `/.well-known/axis.json` | apps/api/src/server.ts |
| GET | `/for-agents` | apps/api/src/server.ts |
| GET | `/v1/install` | apps/api/src/server.ts |
| GET | `/v1/install/:platform` | apps/api/src/server.ts |
| POST | `/probe-intent` | apps/api/src/server.ts |
| POST | `/mcp` | apps/api/src/server.ts |
| POST | `/v1/analyze` | apps/api/src/server.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/server.ts |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/server.ts |
| GET | `/v1/projects/:project_id/context` | apps/api/src/server.ts |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/server.ts |
| DELETE | `/v1/projects/:project_id` | apps/api/src/server.ts |
| GET | `/v1/db/stats` | apps/api/src/server.ts |
| POST | `/v1/db/maintenance` | apps/api/src/server.ts |
| POST | `/v1/search/index` | apps/api/src/server.ts |
| POST | `/v1/search/query` | apps/api/src/server.ts |
| GET | `/v1/search/:snapshot_id/stats` | apps/api/src/server.ts |
| POST | `/v1/debug/analyze` | apps/api/src/server.ts |
| GET | `/v1/docs` | apps/api/src/server.ts |
| GET | `/v1/programs` | apps/api/src/server.ts |
| POST | `/v1/account/seats` | apps/api/src/server.ts |
| GET | `/v1/account/seats` | apps/api/src/server.ts |
| POST | `/v1/account/seats/:seat_id/accept` | apps/api/src/server.ts |
| POST | `/v1/account/seats/:seat_id/revoke` | apps/api/src/server.ts |
| GET | `/v1/account/upgrade-prompt` | apps/api/src/server.ts |
| POST | `/v1/account/upgrade-prompt/dismiss` | apps/api/src/server.ts |
| GET | `/v1/account/funnel` | apps/api/src/server.ts |
| POST | `/v1/account/webhooks` | apps/api/src/server.ts |
| GET | `/v1/account/webhooks` | apps/api/src/server.ts |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/server.ts |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/server.ts |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/server.ts |
| POST | `/v1/account/programs` | apps/api/src/server.ts |
| POST | `/v1/account/github-token` | apps/api/src/server.ts |
| GET | `/health` | apps/api/src/server.ts |
| POST | `/v1/search/export` | apps/api/src/server.ts |
| POST | `/v1/skills/generate` | apps/api/src/server.ts |
| POST | `/v1/frontend/audit` | apps/api/src/server.ts |
| POST | `/v1/seo/analyze` | apps/api/src/server.ts |
| *… 113 more* | | |

## Architecture Layer Boundaries

> ⚡ **Moderate separation (0.65)** — some coupling exists between layers.

Bugs often occur at layer boundaries. Verify data flow between:

- **presentation**: apps, frontend

**Architecture patterns:** monorepo, containerized

## Deployment Debugging

- **Container crashes:** Check `docker logs <container>` for OOM kills or startup failures
- **Network issues:** Verify container port mapping and inter-service DNS resolution
- **Volume mounts:** Ensure persistent data paths match Dockerfile WORKDIR
- **Build caching:** Clear Docker cache with `docker builder prune` if stale layers suspected

## Common Traps

- ⚠️ No lockfile found — dependency versions may be inconsistent
- ✅ TypeScript strict mode
- ✅ Linter configured
- ✅ Formatter configured
- ✅ Makefile build

## Failure Surface (deterministic)

> Static failure-mode scan — grep + a fixed rule table, **no AI**. `SILENT` / `TYPE_HOLE` = a failure the type/test net won't catch; `OBSERVABILITY` = only reaches `console`; `REVIEW` = confirm intent; `ACCEPTABLE` = deliberate cleanup swallow.

| Class | Count |
|-------|-------|
| SILENT | 2 |
| TYPE_HOLE | 1 |
| OBSERVABILITY | 19 |
| REVIEW | 19 |
| ACCEPTABLE | 6 |

| File | Line | Category | Class | Note |
|------|------|----------|-------|------|
| `apps/api/src/mcp-server.ts` | 430 | swallowed-async-error | SILENT | side-effect failure is invisible |
| `apps/web/src/components/GeneratedTab.tsx` | 58 | empty-catch | SILENT | side-effect failure is invisible |
| `apps/api/src/mpp.ts` | 157 | type-hole | TYPE_HOLE | suppresses the type net |
| `apps/api/check-table.js` | 6 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `apps/api/check-table.js` | 8 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `apps/api/gen-keys.js` | 3 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `apps/api/gen-keys.js` | 4 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `apps/api/src/mcp-server.ts` | 123 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `apps/api/src/mcp-tools.ts` | 1105 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `apps/api/src/mpp.ts` | 160 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `apps/api/src/mpp.ts` | 167 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `apps/api/src/mpp.ts` | 171 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `apps/api/src/server.ts` | 125 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `apps/web/src/api.ts` | 424 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `apps/web/src/api.ts` | 454 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `apps/web/src/App.tsx` | 34 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `apps/web/src/pages/UploadPage.tsx` | 286 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `generate-keys.js` | 14 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `generate-keys.js` | 15 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `generate-keys.js` | 16 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `packages/generator-core/src/generators-artifacts.ts` | 118 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `packages/generator-core/src/generators-debug.ts` | 676 | unstructured-log | OBSERVABILITY | console.* — prefer a structured logger for correlation |
| `apps/api/src/document-parsing.ts` | 181 | empty-catch | REVIEW | empty catch — confirm intent |
| `apps/api/src/export.ts` | 175 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| `apps/api/src/export.ts` | 188 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| `apps/api/src/github-webhook.ts` | 259 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| `apps/api/src/github-webhook.ts` | 264 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| `apps/api/src/handlers.ts` | 944 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| `apps/api/src/handlers.ts` | 1438 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| `apps/api/src/handlers.ts` | 3337 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| `apps/api/src/handlers.ts` | 3351 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| `apps/api/src/handlers.ts` | 3352 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| `apps/api/src/handlers.ts` | 3419 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| `apps/api/src/mcp-tool-impls.ts` | 1415 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| `apps/api/src/paid-handlers.ts` | 409 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| `apps/api/src/speech-to-text.ts` | 489 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| `apps/api/src/text-to-speech.ts` | 482 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| `apps/web/src/components/ProgramLauncher.tsx` | 48 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| `apps/web/src/pages/AccountPage.tsx` | 81 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| `apps/web/src/pages/AccountPage.tsx` | 82 | swallowed-async-error | REVIEW | swallowed — confirm intent |
| … | | | | +7 more |

## Production Dependencies

18 production dependencies. Key packages:

- `@axis/context-engine` @ workspace:*
- `@axis/generator-core` @ workspace:*
- `@axis/mpp` @ workspace:*
- `@axis/paid-client` @ workspace:*
- `@axis/repo-parser` @ workspace:*
- `@axis/snapshots` @ workspace:*
- `@jmondi/oauth2-server` @ ^4.2.2
- `dockerode` @ ^4.0.12
- `ffmpeg-static` @ ^5.3.0
- `jsonwebtoken` @ ^9.0.3
- `mammoth` @ ^1.12.0
- `mppx` @ ^0.5.12
- `node-llama-cpp` @ ^3.18.1
- `pdfjs-dist` @ ^4.10.38
- `tesseract.js` @ ^7.0.0
- `jszip` @ ^3.10.1
- `react` @ ^19.1.0
- `react-dom` @ ^19.1.0

## Entry Point Source (for tracing)

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
... (472 more lines)
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
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import { Icon } from "./components/Icon.tsx";
import { getAdminStats, migrateLegacyKey, logoutSession, type SnapshotResponse } from "./api.ts";
import { APP_VERSION } from "./version.ts";
... (554 more lines)
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

---
*Generated by Axis Debug*


---

## ⟳ Continue the loop

- **You are here:** `debug-playbook.md` — agent step 4 of 70.
- **Next:** `incident-template.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
