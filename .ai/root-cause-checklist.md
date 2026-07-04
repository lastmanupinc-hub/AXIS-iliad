# Root Cause Checklist — axis-iliad

> monorepo | TypeScript | 500 files | 115,124 LOC

**Stack:** React ^19.1.0

## Failure Surface — Fix Checklist

> Deterministic static scan (no AI). Fix `SILENT` / `TYPE_HOLE` first — the type/test net won't catch them; `OBSERVABILITY` = make it queryable; `REVIEW` = confirm intent; `ACCEPTABLE` = deliberate.

- [ ] `SILENT` `apps/api/src/mcp-server.ts:430` — swallowed-async-error: side-effect failure is invisible
- [ ] `SILENT` `apps/web/src/components/GeneratedTab.tsx:58` — empty-catch: side-effect failure is invisible
- [ ] `TYPE_HOLE` `apps/api/src/mpp.ts:157` — type-hole: suppresses the type net
- [ ] `OBSERVABILITY` `apps/api/check-table.js:6` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/api/check-table.js:8` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/api/gen-keys.js:3` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/api/gen-keys.js:4` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/api/src/mcp-server.ts:123` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/api/src/mcp-tools.ts:1105` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/api/src/mpp.ts:160` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/api/src/mpp.ts:167` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/api/src/mpp.ts:171` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/api/src/server.ts:125` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/web/src/api.ts:424` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/web/src/api.ts:454` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/web/src/App.tsx:34` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/web/src/pages/UploadPage.tsx:286` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `generate-keys.js:14` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `generate-keys.js:15` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `generate-keys.js:16` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `packages/generator-core/src/generators-artifacts.ts:118` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `packages/generator-core/src/generators-debug.ts:676` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `REVIEW` `apps/api/src/document-parsing.ts:181` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/export.ts:175` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/export.ts:188` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/github-webhook.ts:259` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/github-webhook.ts:264` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/handlers.ts:944` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/handlers.ts:1438` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/handlers.ts:3337` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/handlers.ts:3351` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/handlers.ts:3352` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/handlers.ts:3419` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/mcp-tool-impls.ts:1415` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/paid-handlers.ts:409` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/speech-to-text.ts:489` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/text-to-speech.ts:482` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/web/src/components/ProgramLauncher.tsx:48` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/web/src/pages/AccountPage.tsx:81` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/web/src/pages/AccountPage.tsx:82` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/web/src/pages/DashboardPage.tsx:53` — swallowed-async-error: swallowed — confirm intent
- [ ] `ACCEPTABLE` `apps/api/src/code-sandbox.ts:408` — swallowed-async-error: best-effort cleanup
- [ ] `ACCEPTABLE` `apps/api/src/speech-to-text.ts:172` — empty-catch: cleanup swallow
- [ ] `ACCEPTABLE` `apps/api/src/speech-to-text.ts:342` — empty-catch: cleanup swallow
- [ ] `ACCEPTABLE` `apps/api/src/text-to-speech.ts:159` — empty-catch: cleanup swallow
- [ ] `ACCEPTABLE` `apps/api/src/text-to-speech.ts:265` — empty-catch: cleanup swallow
- [ ] `ACCEPTABLE` `apps/api/src/text-to-speech.ts:300` — empty-catch: cleanup swallow

## Triage Workflow

```
1. Reproduce → 2. Isolate → 3. Trace → 4. Root Cause → 5. Fix → 6. Verify → 7. Prevent
```

## Step 1: Reproduction

- [ ] Can you reproduce the issue consistently?
- [ ] What is the minimum input/state to trigger it?
- [ ] Does it reproduce in all environments (dev, staging, prod)?
- [ ] Is it timing-dependent (race condition, timeout)?
- [ ] `npm test` — do existing tests pass? (vitest)

## Step 2: Isolation

Which layer does the error surface in?

- [ ] **presentation** — apps, frontend

- [ ] Which architectural pattern is involved? (Detected: monorepo, containerized)
- [ ] Can you remove middleware/plugins to narrow the source?
- [ ] Does the issue persist with mocked dependencies?

## Step 3: Trace

- [ ] Check React DevTools for component re-render loops (React ^19.1.0 detected)
- [ ] Check Network tab for failed API calls
- [ ] Check for hydration mismatches (SSR vs client)
- [ ] Add breakpoints in suspected code paths
- [ ] Check for unhandled promise rejections / panics
- [ ] Review recent git changes (`git log --oneline -20`)

## Step 4: Root Cause Categories

| Category | Check | Typical Fix |
|----------|-------|-------------|
| State mutation | Shared mutable state modified concurrently | Immutable updates, copy-on-write |
| Race condition | Async operations with unguarded order | Mutex, semaphore, serial queue |
| Type mismatch | Runtime type differs from expected | Input validation, zod/yup schema |
| Null reference | Accessing property of undefined | Optional chaining, null guards |
| Resource leak | Connections/handles not released | try/finally, disposal pattern |
| Configuration | Wrong env var, missing secret | Environment diff, config validation |
| Dependency | Breaking change in library update | Lock versions, review changelogs |
| Data integrity | Corrupt/stale data in store | Migration, cache invalidation |

### Domain Entity Integrity

Check these entities for state corruption or relationship violations:

- [ ] `AlertThresholds` (interface, 2 fields) — `apps/api/src/alerting.ts`
- [ ] `Counters` (type_alias, 2 fields) — `apps/api/src/alerting.ts`
- [ ] `DebounceState` (interface, 2 fields) — `apps/api/src/alerting.ts`
- [ ] `WindowResult` (interface, 4 fields) — `apps/api/src/alerting.ts`
- [ ] `AnalyticsCountByBucketResult` (interface, 3 fields) — `apps/api/src/analytics.ts`
- [ ] `AnalyticsCountByBucketRow` (interface, 2 fields) — `apps/api/src/analytics.ts`
- [ ] `AnalyticsCountByEventResult` (interface, 2 fields) — `apps/api/src/analytics.ts`
- [ ] `AnalyticsCountByEventRow` (interface, 2 fields) — `apps/api/src/analytics.ts`
- [ ] `AnalyticsCountResult` (interface, 2 fields) — `apps/api/src/analytics.ts`
- [ ] `AnalyticsDistinctUsersResult` (interface, 2 fields) — `apps/api/src/analytics.ts`
- [ ] `AnalyticsEvent` (interface, 4 fields) — `apps/api/src/analytics.ts`
- [ ] `AnalyticsQuery` (interface, 8 fields) — `apps/api/src/analytics.ts`
- [ ] `WhereClause` (interface, 2 fields) — `apps/api/src/analytics.ts`
- [ ] `DriftDeps` (interface, 5 fields) — `apps/api/src/architecture-drift-webhook.ts`
- [ ] `DriftOutcome` (interface, 3 fields) — `apps/api/src/architecture-drift-webhook.ts`
- [ ] `DriftResult` (interface, 3 fields) — `apps/api/src/architecture-drift.ts`
- [ ] `PushInfo` (interface, 7 fields) — `apps/api/src/architecture-drift.ts`
- [ ] `Attestation` (interface, 12 fields) — `apps/api/src/attestation.ts`
- [ ] `AttestationInput` (interface, 3 fields) — `apps/api/src/attestation.ts`
- [ ] `AttestationOutput` (interface, 3 fields) — `apps/api/src/attestation.ts`
- [ ] `ChainLink` (interface, 3 fields) — `apps/api/src/attestation.ts`
- [ ] `AuthContext` (interface, 3 fields) — `apps/api/src/billing.ts`
- [ ] `NotConfiguredResult` (interface, 4 fields) — `apps/api/src/code-sandbox.ts`
- [ ] `SandboxOptions` (interface, 4 fields) — `apps/api/src/code-sandbox.ts`
- [ ] `SandboxResult` (interface, 6 fields) — `apps/api/src/code-sandbox.ts`
- [ ] `CommerceArtifact` (interface, 3 fields) — `apps/api/src/commerce-integration.ts`
- [ ] `DisputeReadiness` (interface, 5 fields) — `apps/api/src/commerce-integration.ts`
- [ ] `PurchaseDeps` (interface, 1 fields) — `apps/api/src/commerce-integration.ts`
- [ ] `ReadinessDimension` (interface, 4 fields) — `apps/api/src/commerce-integration.ts`
- [ ] `DeliverabilityKit` (interface, 7 fields) — `apps/api/src/deliverability.ts`
- [ ] *… 212 more entities*

## Step 5: Suspect Files (by coupling)

High-coupling files are more likely to be involved in cross-cutting bugs:

| File | Risk | Inbound | Outbound |
|------|------|---------|----------|
| `apps/api/src/router.ts` | 100% | 96 | 4 |
| `apps/api/src/test-helpers.ts` | 100% | 41 | 1 |
| `apps/api/src/billing.ts` | 100% | 28 | 3 |
| `apps/api/src/handlers.ts` | 100% | 23 | 14 |
| `apps/api/src/rate-limiter.ts` | 100% | 36 | 2 |
| `apps/api/src/logger.ts` | 100% | 25 | 0 |
| `apps/api/src/server.ts` | 100% | 1 | 35 |
| `apps/web/src/App.tsx` | 100% | 1 | 24 |
| `packages/generator-core/src/generate.ts` | 100% | 30 | 6 |
| `apps/api/src/mcp-tool-impls.ts` | 100% | 0 | 24 |

## Step 6: Verification

- [ ] Does the fix resolve the original reproduction case?
- [ ] Do all existing tests still pass? (`npm test`)
- [ ] Is a new test added for this specific failure mode?
- [ ] Has the fix been reviewed for side effects on 20 coupled hotspot files?
- [ ] Does CI pass? (github_actions)

## Step 7: Prevention

- [ ] Add regression test
- [ ] Add monitoring/alerting for this failure class
- [ ] Update incident template if this is a new category
- [ ] Document root cause in team knowledge base

## Entry Point Source (for Step 2 Isolation)

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

## Suspect File Excerpts (for Step 5)

### `apps/api/src/billing.ts` exports

- `export interface AuthContext { ... }`
- `export const SESSION_COOKIE = ...`
- `export async function resolveAuth(req: IncomingMessage): Promise<AuthContext> { ... }`
- `export async function requireAuth(req: IncomingMessage, res: ServerResponse): Promise<AuthContext | null> { ... }`
- `export function constantTimeEqual(a: string, b: string): boolean { ... }`
- `export async function handleCreateAccount(`
- `export async function handleGetAccount(`
- `export async function handleCreateApiKey(`
- `export async function handleListApiKeys(`
- `export async function handleRevokeApiKey(`

### `apps/api/src/router.ts` exports

- `export class Router { ... }`
- `export function sendJSON(res: ServerResponse, status: number, data: unknown) { ... }`
- `export function sendError(`
- `export async function readBody(req: IncomingMessage): Promise<string> { ... }`
- `export interface AppHandle { ... }`
- `export function isShuttingDown(): boolean { ... }`
- `export function scheduleBootMigrations(`
- `export function createApp(router: Router, port: number): Server { ... }`

### `apps/api/src/test-helpers.ts` exports

- `export interface TestServer { ... }`
- `export async function startTestServer(router: Router): Promise<TestServer> { ... }`

## Suspect File Source

### `apps/api/src/billing.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { sendJSON, readBody, sendError } from "./router.js";
import { ErrorCode, log } from "./logger.js";
import { getClientWindow, getClientIp } from "./rate-limiter.js";
import {
  resolveApiKey,
  createAccount,
  getAccount,
  getAccountByEmail,
  updateAccountTier,
  createApiKey,
  revokeApiKey,
  listApiKeys,
  enableProgram,
  disableProgram,
  getEntitlements,
  checkQuota,
  getUsageSummary,
  getApiCallSummary,
  recordUsage,
  isProgramEnabled,
  trackEvent,
  saveGitHubToken,
  getGitHubTokens,
... (831 more lines)
```

### `apps/api/src/router.ts`

```typescript
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { Socket } from "node:net";
import { gzipSync, gunzipSync } from "node:zlib";
import { initRequest, getRequestId, getRequestStart, log, ErrorCode, type ErrorCodeValue } from "./logger.js";
import { checkRateLimit } from "./rate-limiter.js";
import { resolveAuth } from "./billing.js";
import { recordRequest, recordLatency } from "./metrics.js";
import { recordApiCall, checkQuota, getPersistenceBalance, runPgMigrations, closePool } from "@axis/snapshots";

// Store request reference on response for sendJSON gzip negotiation
const REQUEST_REF = new WeakMap<ServerResponse, IncomingMessage>();

type RouteHandler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];

  post(path: string, handler: RouteHandler) {
... (466 more lines)
```

### `apps/api/src/test-helpers.ts`

```typescript
// Shared test-server helper. Replaces the flaky `createApp(router, FIXED_PORT)`
// + `setTimeout(...)` readiness guess used across the api test suites, which
// raced under load (esp. `--coverage`) and produced intermittent
// `ECONNREFUSED`/"Server is not running" failures.
//
// startTestServer binds an OS-assigned ephemeral port (0) — no cross-worker
// port collisions — and resolves only once the socket is actually `listening`
// (rejecting on bind error). Deterministic readiness.
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, type Router } from "./router.js";

export interface TestServer {
  server: Server;
  port: number;
  baseUrl: string;
}

export async function startTestServer(router: Router): Promise<TestServer> {
  const server = createApp(router, 0);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    if (server.listening) resolve();
    else server.once("listening", () => resolve());
  });
... (5 more lines)
```


---

## ⟳ Continue the loop

- **You are here:** `root-cause-checklist.md` — agent step 51 of 70.
- **Next:** `workflow-pack.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
