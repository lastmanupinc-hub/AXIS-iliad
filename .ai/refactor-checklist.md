# Refactor Checklist — axis-iliad

> Systematic refactoring guide based on codebase analysis

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Risk Assessment

| Risk Level | Files | Action |
|-----------|-------|--------|
| High (>70%) | 13 | Refactor with full test coverage first |
| Medium (40–70%) | 5 | Refactor when touching for features |
| Low (≤40%) | 2 | Refactor opportunistically |

### High-Risk Files

- **`apps/api/src/router.ts`** — risk 100% (96 inbound, 4 outbound)
  - Break into smaller modules if possible
  - Add comprehensive tests before modifying
- **`apps/api/src/test-helpers.ts`** — risk 100% (41 inbound, 1 outbound)
  - Break into smaller modules if possible
  - Add comprehensive tests before modifying
- **`apps/api/src/billing.ts`** — risk 100% (28 inbound, 3 outbound)
  - Break into smaller modules if possible
  - Add comprehensive tests before modifying
- **`apps/api/src/handlers.ts`** — risk 100% (23 inbound, 14 outbound)
  - Break into smaller modules if possible
  - Add comprehensive tests before modifying
- **`apps/api/src/rate-limiter.ts`** — risk 100% (36 inbound, 2 outbound)
  - Break into smaller modules if possible
  - Add comprehensive tests before modifying

## Pre-Refactor Checklist

Before starting any refactor:

- [ ] Existing tests pass (run full suite)
- [ ] The refactor target has test coverage (add tests if not)
- [ ] The goal is clear: what improves and what stays the same
- [ ] A branch has been created for the refactor
- [ ] No other in-progress work touches the same files

## Refactoring Patterns

### Extract Function
- **When:** A block of code inside a function does one distinct thing
- **How:** Move the block to a named function, pass needed values as parameters
- **Test:** Existing tests still pass + new unit test for extracted function

### Extract Module
- **When:** A file has multiple unrelated responsibilities
- **How:** Move related functions/types to a new file, update imports
- **Test:** All existing imports resolve, no circular dependencies introduced

### Simplify Conditionals
- **When:** Nested if/else chains or complex boolean expressions
- **How:** Extract conditions to named booleans, use early returns, use lookup tables
- **Test:** Cover all branches before and after

### Replace Magic Values
- **When:** Hardcoded strings, numbers, or config values in business logic
- **How:** Extract to named constants or config
- **Test:** Behavior unchanged, constants are importable

## Domain Model Complexity

Models with a high field count are strong candidates for decomposition or value-object extraction:

| Model | Kind | Fields | Source |
|-------|------|--------|--------|
| `ContextMap` | interface | 69 ⚠️ large | `packages/context-engine/src/types.ts` |
| `ContextMap` | interface | 61 ⚠️ large | `apps/web/src/api.ts` |
| `ResellCapability` | interface | 29 ⚠️ large | `packages/generator-core/src/generators-artifacts.ts` |
| `RepoProfile` | interface | 26 ⚠️ large | `apps/web/src/api.ts` |
| `RepoProfile` | interface | 21 ⚠️ large | `packages/context-engine/src/types.ts` |
| `AdminRevenue` | interface | 20 ⚠️ large | `apps/web/src/api.ts` |
| `McpUsageResponse` | interface | 18 ⚠️ large | `apps/web/src/api.ts` |
| `MyAnalyticsSummary` | interface | 18 ⚠️ large | `apps/web/src/api.ts` |
| `SubscriptionInfo` | interface | 14 ⚠️ large | `apps/web/src/api.ts` |
| `PlannedCapability` | interface | 13 ⚠️ large | `apps/api/src/mcp-tools.ts` |
| *... and 232 more* | | | |

### Decomposition Candidates

- **`ContextMap`** (69 fields) — consider extracting related field groups into value objects
- **`ContextMap`** (61 fields) — consider extracting related field groups into value objects
- **`ResellCapability`** (29 fields) — consider extracting related field groups into value objects
- **`RepoProfile`** (26 fields) — consider extracting related field groups into value objects
- **`RepoProfile`** (21 fields) — consider extracting related field groups into value objects

## Architecture Alignment

Detected patterns to preserve during refactoring:

- monorepo
- containerized

Layer boundaries (do not violate during refactoring):

- **presentation**: apps, frontend

## Post-Refactor Checklist

- [ ] All tests pass
- [ ] No new circular dependencies (check import graph)
- [ ] Build succeeds with no new warnings
- [ ] No dead code left behind (unused imports, unreachable branches)
- [ ] Type coverage maintained or improved
- [ ] Commit message describes what changed and why

## High-Risk File Export Surface

Use these exports to identify module split boundaries:

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
- `export const handleDebugAnalyze        = ...`
- `export const handleFrontendAudit       = ...`
- `export const handleSeoAnalyze          = ...`
- `export const handleOptimizationAnalyze = ...`
- `export const handleThemeGenerate       = ...`
- `export const handleBrandGenerate       = ...`
- `export const handleSuperpowersGenerate = ...`
- `export const handleMarketingGenerate   = ...`
- `export const handleNotebookGenerate    = ...`

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

## High-Risk File Source

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

- **You are here:** `refactor-checklist.md` — agent step 20 of 70.
- **Next:** `campaign-brief.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
