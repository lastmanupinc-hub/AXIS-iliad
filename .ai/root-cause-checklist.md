# Root Cause Checklist — axis-iliad

> monorepo | TypeScript | 500 files | 108,805 LOC

**Stack:** React ^19.1.0

## Failure Surface — Fix Checklist

> Deterministic static scan (no AI). Fix `SILENT` / `TYPE_HOLE` first — the type/test net won't catch them; `OBSERVABILITY` = make it queryable; `REVIEW` = confirm intent; `ACCEPTABLE` = deliberate.

- [ ] `SILENT` `apps/api/src/billing.ts:379` — swallowed-async-error: side-effect failure is invisible
- [ ] `SILENT` `apps/api/src/cashier.ts:384` — empty-catch: side-effect failure is invisible
- [ ] `SILENT` `apps/api/src/mcp-server.ts:256` — empty-catch: side-effect failure is invisible
- [ ] `SILENT` `apps/api/src/mcp-server.ts:691` — swallowed-async-error: side-effect failure is invisible
- [ ] `SILENT` `apps/api/src/mcp-tool-impls.ts:4046` — empty-catch: side-effect failure is invisible
- [ ] `SILENT` `apps/api/src/mcp-tool-impls.ts:4081` — empty-catch: side-effect failure is invisible
- [ ] `SILENT` `apps/api/src/paid-handlers.ts:468` — swallowed-async-error: side-effect failure is invisible
- [ ] `SILENT` `apps/api/src/rate-limiter.ts:90` — empty-catch: side-effect failure is invisible
- [ ] `SILENT` `apps/api/src/router.ts:422` — empty-catch: side-effect failure is invisible
- [ ] `SILENT` `apps/api/src/server.ts:409` — empty-catch: side-effect failure is invisible
- [ ] `TYPE_HOLE` `apps/api/src/mpp.ts:227` — type-hole: as any suppresses the type net
- [ ] `OBSERVABILITY` `apps/api/src/mcp-server.ts:145` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/api/src/mpp.ts:174` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/api/src/mpp.ts:230` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/api/src/mpp.ts:237` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/api/src/mpp.ts:241` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/api/src/server.ts:133` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/web/src/App.tsx:39` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/web/src/api.ts:538` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `apps/web/src/api.ts:587` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `generate-keys.js:14` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `generate-keys.js:15` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `OBSERVABILITY` `generate-keys.js:16` — unstructured-log: console.* — prefer a structured logger for correlation
- [ ] `REVIEW` `apps/api/src/billing.ts:275` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/billing.ts:425` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/billing.ts:447` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/billing.ts:701` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/billing.ts:753` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/billing.ts:759` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/cashier.ts:254` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/code-sandbox.ts:458` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/code-sandbox.ts:477` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/credit-pack-handlers.ts:129` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/disputes.ts:172` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/document-parsing.ts:211` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/email.ts:146` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/embeddings.ts:152` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/export.ts:175` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/export.ts:177` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/export.ts:188` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/export.ts:192` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/export.ts:209` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/fleet-handlers.ts:67` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/fleet-handlers.ts:86` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/funnel.ts:269` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/funnel.ts:286` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/funnel.ts:292` — empty-catch: empty catch — confirm intent
- [ ] `REVIEW` `apps/api/src/github-webhook.ts:259` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/github-webhook.ts:264` — swallowed-async-error: swallowed — confirm intent
- [ ] `REVIEW` `apps/api/src/handlers.ts:764` — empty-catch: empty catch — confirm intent
- [ ] … +61 more (fix the 50 above first)

## Triage Workflow

```
1. Reproduce → 2. Isolate → 3. Trace → 4. Root Cause → 5. Fix → 6. Verify → 7. Prevent
```

## Step 1: Reproduction

- [ ] Can you reproduce the issue consistently?
- [ ] What is the minimum input/state to trigger it?
- [ ] Does it reproduce in all environments (dev, staging, prod)?
- [ ] Is it timing-dependent (race condition, timeout)?
- [ ] `pnpm test` — do existing tests pass? (vitest)

## Step 2: Isolation

Which layer does the error surface in?

- [ ] **presentation** — apps

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
- [ ] `ChallengeWindow` (interface, 2 fields) — `apps/api/src/anon-frontdoor.ts`
- [ ] `DriftDeps` (interface, 5 fields) — `apps/api/src/architecture-drift-webhook.ts`
- [ ] `DriftOutcome` (interface, 3 fields) — `apps/api/src/architecture-drift-webhook.ts`
- [ ] `DriftResult` (interface, 3 fields) — `apps/api/src/architecture-drift.ts`
- [ ] `PushInfo` (interface, 7 fields) — `apps/api/src/architecture-drift.ts`
- [ ] `Attestation` (interface, 12 fields) — `apps/api/src/attestation.ts`
- [ ] `AttestationInput` (interface, 3 fields) — `apps/api/src/attestation.ts`
- [ ] `AttestationOutput` (interface, 3 fields) — `apps/api/src/attestation.ts`
- [ ] `ChainLink` (interface, 3 fields) — `apps/api/src/attestation.ts`
- [ ] `AuthContext` (interface, 3 fields) — `apps/api/src/billing.ts`
- [ ] `SettleOptions` (interface, 4 fields) — `apps/api/src/cashier.ts`
- [ ] `NotConfiguredResult` (interface, 6 fields) — `apps/api/src/code-sandbox.ts`
- [ ] `SandboxOptions` (interface, 4 fields) — `apps/api/src/code-sandbox.ts`
- [ ] `SandboxResult` (interface, 6 fields) — `apps/api/src/code-sandbox.ts`
- [ ] `CommerceArtifact` (interface, 3 fields) — `apps/api/src/commerce-integration.ts`
- [ ] `DisputeReadiness` (interface, 5 fields) — `apps/api/src/commerce-integration.ts`
- [ ] `NetworkToken` (interface, 6 fields) — `apps/api/src/commerce-integration.ts`
- [ ] *… 248 more entities*

## Step 5: Suspect Files (by coupling)

High-coupling files are more likely to be involved in cross-cutting bugs:

| File | Risk | Inbound | Outbound |
|------|------|---------|----------|
| `apps/api/src/router.ts` | 100% | 113 | 4 |
| `apps/api/src/test-helpers.ts` | 100% | 54 | 1 |
| `apps/api/src/billing.ts` | 100% | 44 | 3 |
| `apps/api/src/handlers.ts` | 100% | 36 | 21 |
| `apps/api/src/rate-limiter.ts` | 100% | 46 | 2 |
| `apps/api/src/mcp-tool-impls.ts` | 100% | 18 | 27 |
| `apps/api/src/mpp.ts` | 100% | 19 | 1 |
| `apps/api/src/logger.ts` | 100% | 34 | 0 |
| `apps/api/src/mcp-server.ts` | 100% | 17 | 15 |
| `apps/api/src/server.ts` | 100% | 2 | 35 |

## Step 6: Verification

- [ ] Does the fix resolve the original reproduction case?
- [ ] Do all existing tests still pass? (`pnpm test`)
- [ ] Is a new test added for this specific failure mode?
- [ ] Has the fix been reviewed for side effects on the 10 coupled hotspot files listed above?
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
... (527 more lines)
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
... (691 more lines)
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

## Suspect File Excerpts (for Step 5)

### `apps/api/src/billing.ts` exports

- `export interface AuthContext { ... }`
- `export const SESSION_COOKIE = ...`
- `export async function resolveAuth(req: IncomingMessage): Promise<AuthContext> { ... }`
- `export async function requireAuth(req: IncomingMessage, res: ServerResponse): Promise<AuthContext | null> { ... }`
- `export function constantTimeEqual(a: string, b: string): boolean { ... }`
- `export async function handleCreateAccount(`
- `export async function handleGetAccount(`
- `export async function handlePatchAccount(`
- `export async function handleDeleteAccount(`
- `export async function handleCreateApiKey(`

### `apps/api/src/router.ts` exports

- `export class Router { ... }`
- `export function sendJSON(res: ServerResponse, status: number, data: unknown) { ... }`
- `export function sendError(`
- `export const DEFAULT_MAX_BODY_BYTES = ...`
- `export function getMaxBodyBytes(): number { ... }`
- `export async function readBody(req: IncomingMessage, maxSizeOverride?: number): Promise<string> { ... }`
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
  updateAccountProfile,
  deleteAccount,
  updateAccountTier,
  getAccountPaidPlanId,
  createApiKey,
  revokeApiKey,
  listApiKeys,
  enableProgram,
  disableProgram,
  getEntitlements,
  checkQuota,
  getUsageSummary,
  getUsageByDay,
  getApiCallSummary,
  trackEvent,
... (1032 more lines)
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
  rawPath: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];

... (542 more lines)
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

- **You are here:** `root-cause-checklist.md` — agent step 51 of 71.
- **Next:** `workflow-pack.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
