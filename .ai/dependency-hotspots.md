# Dependency Hotspots — axis-iliad

Generated: 1970-01-01T00:00:00.000Z

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Risk Summary

| Severity | Count |
|----------|-------|
| High (>70%) | 13 |
| Medium (40–70%) | 5 |
| Low (≤40%) | 2 |
| **Total** | **20** |

## Hotspot Files

| File | Risk | Inbound | Outbound | Total Connections |
|------|------|---------|----------|-------------------|
| `apps/api/src/router.ts` | 🔴 100% | 96 | 4 | 100 |
| `apps/api/src/test-helpers.ts` | 🔴 100% | 41 | 1 | 42 |
| `apps/api/src/billing.ts` | 🔴 100% | 28 | 3 | 31 |
| `apps/api/src/handlers.ts` | 🔴 100% | 23 | 14 | 37 |
| `apps/api/src/rate-limiter.ts` | 🔴 100% | 36 | 2 | 38 |
| `apps/api/src/logger.ts` | 🔴 100% | 25 | 0 | 25 |
| `apps/api/src/server.ts` | 🔴 100% | 1 | 35 | 36 |
| `apps/web/src/App.tsx` | 🔴 100% | 1 | 24 | 25 |
| `packages/generator-core/src/generate.ts` | 🔴 100% | 30 | 6 | 36 |
| `apps/api/src/mcp-tool-impls.ts` | 🔴 100% | 0 | 24 | 24 |
| `apps/api/src/mcp-server.ts` | 🔴 95% | 11 | 8 | 19 |
| `apps/web/src/api.ts` | 🔴 95% | 19 | 0 | 19 |
| `apps/web/src/pages.test.tsx` | 🔴 90% | 0 | 18 | 18 |
| `apps/api/src/counts.ts` | 🟡 60% | 12 | 0 | 12 |
| `apps/web/src/pages/DashboardPage.tsx` | 🟡 55% | 1 | 10 | 11 |
| `apps/api/src/metrics.ts` | 🟡 50% | 9 | 1 | 10 |
| `apps/api/src/env.ts` | 🟡 50% | 10 | 0 | 10 |
| `apps/api/src/export.ts` | 🟡 45% | 6 | 3 | 9 |
| `apps/api/src/architecture-drift-webhook.ts` | 🟢 40% | 2 | 6 | 8 |
| `apps/cli/src/scanner.ts` | 🟢 40% | 8 | 0 | 8 |

## Coupling Analysis

### `apps/api/src/router.ts`

- **Risk Score**: 100%
- **Inbound**: 96 files depend on this
- **Outbound**: 4 dependencies
- **Refactor Priority**: HIGH — extract interface or split module

### `apps/api/src/test-helpers.ts`

- **Risk Score**: 100%
- **Inbound**: 41 files depend on this
- **Outbound**: 1 dependencies
- **Refactor Priority**: HIGH — extract interface or split module

### `apps/api/src/billing.ts`

- **Risk Score**: 100%
- **Inbound**: 28 files depend on this
- **Outbound**: 3 dependencies
- **Refactor Priority**: HIGH — extract interface or split module

### `apps/api/src/handlers.ts`

- **Risk Score**: 100%
- **Inbound**: 23 files depend on this
- **Outbound**: 14 dependencies
- **Refactor Priority**: HIGH — extract interface or split module

### `apps/api/src/rate-limiter.ts`

- **Risk Score**: 100%
- **Inbound**: 36 files depend on this
- **Outbound**: 2 dependencies
- **Refactor Priority**: HIGH — extract interface or split module

## External Dependency Risk

| Package | Version | Risk Factor |
|---------|---------|-------------|
| @axis/context-engine | workspace:* | Internal workspace package |
| @axis/generator-core | workspace:* | Internal workspace package |
| @axis/mpp | workspace:* | Internal workspace package |
| @axis/paid-client | workspace:* | Internal workspace package |
| @axis/repo-parser | workspace:* | Internal workspace package |
| @axis/snapshots | workspace:* | Internal workspace package |
| @jmondi/oauth2-server | ^4.2.2 | Stable |
| dockerode | ^4.0.12 | Stable |
| ffmpeg-static | ^5.3.0 | Stable |
| jsonwebtoken | ^9.0.3 | Stable |
| mammoth | ^1.12.0 | Stable |
| mppx | ^0.5.12 | Pre-1.0 — unstable API |
| node-llama-cpp | ^3.18.1 | Stable |
| pdfjs-dist | ^4.10.38 | Stable |
| tesseract.js | ^7.0.0 | Stable |

## Recommendations

1. **Extract interfaces** for files with >70% risk score to reduce direct coupling
2. **Introduce facade pattern** where inbound count exceeds 5
3. **Monitor medium-risk files** — add import lint rules to prevent further coupling
4. **Review circular dependencies** in the import graph

## Hotspot Export Surface

### `apps/api/src/billing.ts`

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
- `export async function handleGetUsage(`
- `export async function handleGetAnalyticsSummary(`

### `apps/api/src/handlers.ts`

- `export async function assertSnapshotAccess(req: IncomingMessage, res: ServerResponse, snapshot: { ... }`
- `export const PROGRAM_OUTPUTS: Record<string, string[]> = ...`
- `export function makeProgramHandler(program: string, defaultOutputs: string[]) { ... }`
- `export const handleDebugAnalyze = ...`
- `export const handleFrontendAudit = ...`
- `export const handleSeoAnalyze = ...`
- `export const handleOptimizationAnalyze = ...`
- `export const handleThemeGenerate = ...`
- `export const handleBrandGenerate = ...`
- `export const handleSuperpowersGenerate = ...`
- `export const handleMarketingGenerate = ...`
- `export const handleNotebookGenerate = ...`

### `apps/api/src/router.ts`

- `export class Router { ... }`
- `export function sendJSON(res: ServerResponse, status: number, data: unknown) { ... }`
- `export function sendError(`
- `export async function readBody(req: IncomingMessage): Promise<string> { ... }`
- `export interface AppHandle { ... }`
- `export function isShuttingDown(): boolean { ... }`
- `export function scheduleBootMigrations(`
- `export function createApp(router: Router, port: number): Server { ... }`

### `apps/api/src/test-helpers.ts`

- `export interface TestServer { ... }`
- `export async function startTestServer(router: Router): Promise<TestServer> { ... }`

## Hotspot File Excerpts

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

### `apps/api/src/handlers.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";
import { chargeMpp, parseAgentBudget, resolveAgentMode, negotiatePrice, build402NegotiationBody, getPricingTier } from "./mpp.js";
import type { AgentBudget } from "./mpp.js";
import { classifyProbe, captureIntent } from "./intent.js";
import {
  createSnapshot,
  getSnapshot,
  updateSnapshotStatus,
  getProjectSnapshots,
  getProjectOwner,
  deleteSnapshot,
  deleteProject,
  saveContextMap,
  getContextMap,
  saveRepoProfile,
  getRepoProfile,
  saveGeneratorResult,
  getGeneratorResult,
  recordUsage,
  checkQuota,
  trackEvent,
  resolveStage,
  TIER_LIMITS,
  ALL_PROGRAMS,
  isProgramEnabled,
... (3800 more lines)
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

- **You are here:** `dependency-hotspots.md` — agent step 50 of 70.
- **Next:** `root-cause-checklist.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
