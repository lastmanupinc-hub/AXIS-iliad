# Tracing Rules — axis-iliad

## Purpose

Define which code paths should be traced, logged, or monitored in this monorepo (TypeScript).

## Stack

- React ^19.1.0 (95%)

## Trace Points

### API Routes

All API routes should log: request method, path, status code, duration (ms).

| Method | Path | Source | Trace Priority |
|--------|------|--------|----------------|
| GET | `/v1/health` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/accounts` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/snapshots` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/admin/stats` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/admin/accounts` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/admin/activity` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/admin/mcp-usage` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/admin/revenue` | apps/api/src/server.ts | NORMAL |
| GET | `/llms.txt` | apps/api/src/server.ts | NORMAL |
| GET | `/.well-known/skills/index.json` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/docs.md` | apps/api/src/server.ts | NORMAL |
| GET | `/.well-known/axis.json` | apps/api/src/server.ts | NORMAL |
| GET | `/for-agents` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/install` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/install/:platform` | apps/api/src/server.ts | NORMAL |
| POST | `/probe-intent` | apps/api/src/server.ts | NORMAL |
| POST | `/mcp` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/analyze` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/server.ts | NORMAL |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/projects/:project_id/context` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/server.ts | NORMAL |
| DELETE | `/v1/projects/:project_id` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/db/stats` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/db/maintenance` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/search/index` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/search/query` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/search/:snapshot_id/stats` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/debug/analyze` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/docs` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/programs` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/seats` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account/seats` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/seats/:seat_id/accept` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/seats/:seat_id/revoke` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account/upgrade-prompt` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/upgrade-prompt/dismiss` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account/funnel` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/webhooks` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account/webhooks` | apps/api/src/server.ts | NORMAL |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/server.ts | NORMAL |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/programs` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/account/github-token` | apps/api/src/server.ts | NORMAL |
| GET | `/health` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/search/export` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/skills/generate` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/frontend/audit` | apps/api/src/server.ts | NORMAL |
| POST | `/v1/seo/analyze` | apps/api/src/server.ts | NORMAL |
| *… 113 more* | | | |

### Domain Model Watch List

State transitions on these entities should be logged:

- `AlertThresholds` (interface, 2 fields) — `apps/api/src/alerting.ts`
- `Counters` (type_alias, 2 fields) — `apps/api/src/alerting.ts`
- `DebounceState` (interface, 2 fields) — `apps/api/src/alerting.ts`
- `WindowResult` (interface, 4 fields) — `apps/api/src/alerting.ts`
- `AnalyticsCountByBucketResult` (interface, 3 fields) — `apps/api/src/analytics.ts`
- `AnalyticsCountByBucketRow` (interface, 2 fields) — `apps/api/src/analytics.ts`
- `AnalyticsCountByEventResult` (interface, 2 fields) — `apps/api/src/analytics.ts`
- `AnalyticsCountByEventRow` (interface, 2 fields) — `apps/api/src/analytics.ts`
- `AnalyticsCountResult` (interface, 2 fields) — `apps/api/src/analytics.ts`
- `AnalyticsDistinctUsersResult` (interface, 2 fields) — `apps/api/src/analytics.ts`
- `AnalyticsEvent` (interface, 4 fields) — `apps/api/src/analytics.ts`
- `AnalyticsQuery` (interface, 8 fields) — `apps/api/src/analytics.ts`
- `WhereClause` (interface, 2 fields) — `apps/api/src/analytics.ts`
- `DriftDeps` (interface, 5 fields) — `apps/api/src/architecture-drift-webhook.ts`
- `DriftOutcome` (interface, 3 fields) — `apps/api/src/architecture-drift-webhook.ts`
- `DriftResult` (interface, 3 fields) — `apps/api/src/architecture-drift.ts`
- `PushInfo` (interface, 7 fields) — `apps/api/src/architecture-drift.ts`
- `Attestation` (interface, 12 fields) — `apps/api/src/attestation.ts`
- `AttestationInput` (interface, 3 fields) — `apps/api/src/attestation.ts`
- `AttestationOutput` (interface, 3 fields) — `apps/api/src/attestation.ts`
- `ChainLink` (interface, 3 fields) — `apps/api/src/attestation.ts`
- `AuthContext` (interface, 3 fields) — `apps/api/src/billing.ts`
- `NotConfiguredResult` (interface, 4 fields) — `apps/api/src/code-sandbox.ts`
- `SandboxOptions` (interface, 4 fields) — `apps/api/src/code-sandbox.ts`
- `SandboxResult` (interface, 6 fields) — `apps/api/src/code-sandbox.ts`
- `CommerceArtifact` (interface, 3 fields) — `apps/api/src/commerce-integration.ts`
- `DisputeReadiness` (interface, 5 fields) — `apps/api/src/commerce-integration.ts`
- `PurchaseDeps` (interface, 1 fields) — `apps/api/src/commerce-integration.ts`
- `ReadinessDimension` (interface, 4 fields) — `apps/api/src/commerce-integration.ts`
- `DeliverabilityKit` (interface, 7 fields) — `apps/api/src/deliverability.ts`
- *… 212 more entities*

### Hotspot Monitoring

These high-connectivity files should be monitored for regressions:

- `apps/api/src/router.ts` — 96 inbound, 4 outbound — watch for: import changes, export signature changes
- `apps/api/src/test-helpers.ts` — 41 inbound, 1 outbound — watch for: import changes, export signature changes
- `apps/api/src/billing.ts` — 28 inbound, 3 outbound — watch for: import changes, export signature changes
- `apps/api/src/handlers.ts` — 23 inbound, 14 outbound — watch for: import changes, export signature changes
- `apps/api/src/rate-limiter.ts` — 36 inbound, 2 outbound — watch for: import changes, export signature changes
- `apps/api/src/logger.ts` — 25 inbound, 0 outbound — watch for: import changes, export signature changes
- `apps/api/src/server.ts` — 1 inbound, 35 outbound — watch for: import changes, export signature changes
- `apps/web/src/App.tsx` — 1 inbound, 24 outbound — watch for: import changes, export signature changes

### Layer Boundary Rules

Separation score: **0.65**/1.0

Monitor for layer violations:

- **presentation** (apps, frontend): Should not import from data layer directly

## Log Format

```
[TIMESTAMP] [LEVEL] [TRACE_ID] [COMPONENT] message
```

## Retention

- **Debug logs:** 7 days
- **Info logs:** 30 days
- **Error logs:** 90 days
- **Audit logs:** 1 year

---
*Generated by Axis Debug*

## Trace-Ready Entry Points

| Entry Point | Exports |
|-------------|---------|
| `apps/api/src/server.ts` | export const app = ... |
| `apps/web/src/App.tsx` | export function App() { ... } |
| `apps/web/src/main.tsx` | default |
| `packages/context-engine/src/index.ts` | export type { ... }, export { ... } |

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

## Hotspot Files to Instrument

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
... (836 more lines)
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
... (471 more lines)
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
... (10 more lines)
```


---

## ⟳ Continue the loop

- **You are here:** `tracing-rules.md` — agent step 6 of 70.
- **Next:** `frontend-rules.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
