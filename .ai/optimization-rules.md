# Optimization Rules — axis-iliad

> Prompt and context efficiency guidelines for a monorepo (TypeScript)

## Context Window Budget

| Metric | Value |
|--------|-------|
| Total files | 500 |
| Total LOC | 115,124 |
| Average LOC / file | 230 |
| Estimated token count | ~518,058 |

**Warning:** This project exceeds most context windows. Use selective context loading.

## High-Value Files

Include these files first when constructing prompts — they carry the most architectural signal:

### Dependency Hotspots

| File | Inbound | Outbound | Risk |
|------|---------|----------|------|
| `apps/api/src/router.ts` | 96 | 4 | 1.0 |
| `apps/api/src/test-helpers.ts` | 41 | 1 | 1.0 |
| `apps/api/src/billing.ts` | 28 | 3 | 1.0 |
| `apps/api/src/handlers.ts` | 23 | 14 | 1.0 |
| `apps/api/src/rate-limiter.ts` | 36 | 2 | 1.0 |
| `apps/api/src/logger.ts` | 25 | 0 | 1.0 |
| `apps/api/src/server.ts` | 1 | 35 | 1.0 |
| `apps/web/src/App.tsx` | 1 | 24 | 1.0 |
| `packages/generator-core/src/generate.ts` | 30 | 6 | 1.0 |
| `apps/api/src/mcp-tool-impls.ts` | 0 | 24 | 1.0 |

## Low-Value Files (Exclude from Prompts)

These file types add noise without architectural value:

- *.lock, *.lockb (dependency lockfiles)
- *.min.js, *.min.css (minified bundles)
- *.map (source maps)
- dist/, build/, .next/, out/ (build artifacts)
- node_modules/ (dependencies)
- .git/ (version control)
- *.svg, *.png, *.jpg (binary assets)
- coverage/ (test coverage reports)

## Prompt Strategy

Detected stack: `React`. Anchor every prompt in the real files below so generated code matches this project's actual setup and dependency versions.

### Always-include configuration (constrains generated code)

- `.github/actions/compliance-check/action.yml`
- `.github/actions/context-freshness/README.md`
- `.github/actions/context-freshness/action.yml`
- `.github/app-manifest.json`
- `.github/workflows/ci.yml`
- `.github/workflows/compliance-check.yml`
- `.github/workflows/context-freshness.yml`
- `.github/workflows/release.yml`
- `.gitignore`
- `.prettierrc.json`

### React Projects

1. Include component files and their direct imports (1 hop)
2. Include shared type definitions and utility modules
3. Include CSS/styling config (tailwind.config, theme files) for style-aware generation

## Conventions to Embed in Prompts

Include these as system-level constraints when generating code:

- TypeScript strict mode
- Linter configured
- Formatter configured
- Makefile build

## Architecture Patterns

Reference these patterns in prompts for architectural consistency:

- monorepo
- containerized

## Optimization Warnings

- ⚠️ No lockfile found — dependency versions may be inconsistent

## Context Bloat (deterministic)

> Static scan of the uploaded files — grep + a rule table, **no AI**. These low-signal files inflate prompt token cost; exclude them from context.

### Oversized source files (review — don't blindly exclude)

These are large but likely real source. Include them SELECTIVELY (only when relevant) or split them — don't drop needed logic just to save tokens.

| File | ~Tokens |
|------|---------|
| `packages/generator-core/src/generator-branches.test.ts` | 22,073 |
| `apps/api/src/handlers.ts` | 17,213 |
| `apps/api/src/mcp-tool-impls.ts` | 13,383 |
| `apps/api/src/mcp-server.test.ts` | 11,898 |
| `packages/generator-core/src/generators-artifacts.ts` | 9,774 |
| `apps/api/src/openapi.ts` | 8,919 |
| `apps/api/src/mcp-tools.ts` | 6,732 |
| `coverage-full.txt` | 6,647 |
| `ls-coverage.txt` | 6,543 |
| `packages/generator-core/src/generators-closer.ts` | 6,444 |
| `packages/generator-core/src/generate.test.ts` | 6,201 |
| `apps/web/src/index.css` | 6,071 |
| `packages/generator-core/src/generators-agentic-purchasing.ts` | 6,044 |

## Configuration Files (Include in Prompts)

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
    "@axis/paid-client": "workspace:*",
    "@axis/repo-parser": "workspace:*",
    "@axis/snapshots": "workspace:*",
    "@jmondi/oauth2-server": "^4.2.2",
    "dockerode": "^4.0.12",
... (17 more lines)
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
  "version": "0.5.3",
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

## File Tree

```
.github/actions/compliance-check/action.yml (12.3 KB)
.github/actions/context-freshness/README.md (5.3 KB)
.github/actions/context-freshness/action.yml (6.0 KB)
.github/app-manifest.json (0.9 KB)
.github/workflows/ci.yml (8.5 KB)
.github/workflows/compliance-check.yml (0.7 KB)
.github/workflows/context-freshness.yml (0.9 KB)
.github/workflows/release.yml (0.6 KB)
.gitignore (0.6 KB)
.prettierrc.json (0.1 KB)
.tmp-vitest.json (68.7 KB)
ACTIVATION_TRACKER.md (7.6 KB)
AGENTS.md (7.0 KB)
AXIS_Board_Pitch.md (30.7 KB)
AXIS_DEMO_REPORT.md (12.3 KB)
CHANGELOG.md (7.8 KB)
CLAUDE.md (7.0 KB)
CONTRIBUTING.md (6.4 KB)
DEPLOY_OFF_ACTIONS_RUNBOOK.md (10.6 KB)
DISTRIBUTABLE.md (0.6 KB)
Dockerfile (0.9 KB)
E5_LIVING_ARCHITECTURE_DESIGN.md (4.7 KB)
E9_COMMERCE_INTEGRATION_DESIGN.md (4.0 KB)
ENV_ROUTING_MAP.md (10.5 KB)
FRONTEND_DEEP_DIVE.md (19.1 KB)
HARDENING_AUDIT.md (8.8 KB)
ILIAD_PRODUCT_READINESS_SCORECARD.yaml (13.9 KB)
LAUNCH_CLAIMS.yaml (4.2 KB)
LAUNCH_RUNBOOK.md (14.9 KB)
Makefile (0.4 KB)
NEON_MIGRATION_PLAN.md (8.8 KB)
PRIVACY_POLICY.md (9.4 KB)
ProgramPipeline.js (11.3 KB)
README.md (17.4 KB)
ROUTING_GO_LIVE_RUNBOOK.md (5.1 KB)
SECURITY.md (2.2 KB)
SESSION_COOKIE_CUTOVER.md (2.4 KB)
SETUP_PAID_STRIPE_MCP.md (12.9 KB)
SHARED_PAID_CLIENT_PLAN.md (3.6 KB)
STRIPE_CHANGES_REQUIRED.md (9.5 KB)
... and 460 more files (see context-map.json for the full tree)
```

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

- **You are here:** `optimization-rules.md` — agent step 12 of 70.
- **Next:** `prompt-diff-report.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
