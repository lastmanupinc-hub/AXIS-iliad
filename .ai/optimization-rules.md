# Optimization Rules — axis-iliad

> Prompt and context efficiency guidelines for a monorepo (TypeScript)

## Context Window Budget

| Metric | Value |
|--------|-------|
| Total files | 500 |
| Total LOC | 108,805 |
| Average LOC / file | 218 |
| Estimated token count | ~489,623 |

**Warning:** This project exceeds most context windows. Use selective context loading.

## High-Value Files

Include these files first when constructing prompts — they carry the most architectural signal:

### Dependency Hotspots

| File | Inbound | Outbound | Risk |
|------|---------|----------|------|
| `apps/api/src/router.ts` | 113 | 4 | 1.0 |
| `apps/api/src/test-helpers.ts` | 54 | 1 | 1.0 |
| `apps/api/src/billing.ts` | 44 | 3 | 1.0 |
| `apps/api/src/handlers.ts` | 36 | 21 | 1.0 |
| `apps/api/src/rate-limiter.ts` | 46 | 2 | 1.0 |
| `apps/api/src/mcp-tool-impls.ts` | 18 | 27 | 1.0 |
| `apps/api/src/mpp.ts` | 19 | 1 | 1.0 |
| `apps/api/src/logger.ts` | 34 | 0 | 1.0 |
| `apps/api/src/mcp-server.ts` | 17 | 15 | 1.0 |
| `apps/api/src/server.ts` | 2 | 35 | 1.0 |

### Entry Points

- `apps/api/src/server.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/main.tsx`

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

- `.gitignore`
- `.prettierrc.json`
- `.tmp-vitest.json`
- `docker-compose.yml`
- `package.json`
- `tsconfig.base.json`
- `vitest.config.ts`
- `.github/app-manifest.json`
- `.github/dependabot.yml`
- `mcp/tsconfig.package.template.json`
- *… 31 more (see context-map.json)*

### React Projects

1. Include component files and their direct imports (1 hop)
2. Include shared type definitions and utility modules
3. Include CSS/styling config (tailwind.config, theme files) for style-aware generation

## Conventions to Embed in Prompts

Include these as system-level constraints when generating code:

- TypeScript strict mode
- Linter configured
- Formatter configured
- pnpm workspaces
- Makefile build

## Architecture Patterns

Reference these patterns in prompts for architectural consistency:

- monorepo
- containerized

## Context Bloat (deterministic)

> Static scan of the uploaded files — grep + a rule table, **no AI**. These low-signal files inflate prompt token cost; exclude them from context.

**Excluding these 3 low-signal file(s) removes ~127,841 tokens (7% of the ~1,802,937 total) — safe to drop from prompts.**

| File | ~Tokens | Reason |
|------|---------|--------|
| `ls-coverage.txt` | 63,970 | generated/build output |
| `coverage-full.txt` | 63,866 | generated/build output |
| `pnpm-lock.yaml` | 5 | dependency lockfile |

### Oversized source files (review — don't blindly exclude)

These are large but likely real source. Include them SELECTIVELY (only when relevant) or split them — don't drop needed logic just to save tokens.

| File | ~Tokens |
|------|---------|
| `vitest-output.txt` | 64,941 |
| `vitest-full.txt` | 64,537 |
| `apps/api/src/handlers.ts` | 62,866 |
| `apps/api/src/mcp-tool-impls.ts` | 49,217 |
| `vitest_requested_output.txt` | 37,942 |
| `apps/api/src/mcp-server.test.ts` | 35,354 |
| `apps/api/src/mcp-tools.ts` | 32,528 |
| `apps/api/src/openapi.ts` | 25,619 |
| `repo_snapshot.yaml` | 20,627 |
| `.tmp-vitest.json` | 17,490 |
| `apps/web/src/api.test.ts` | 16,652 |
| `apps/web/src/api.ts` | 16,244 |
| `docs/archive/static_analysis_phase.yaml` | 16,005 |
| `docs/agentic-asset/WORK_ORDERS.yaml` | 14,566 |
| `apps/web/src/app-routing.test.tsx` | 13,819 |
| *… 37 more* | |

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

### `package.json`

```json
{
  "name": "axis-iliad",
  "version": "0.5.3",
  "private": true,
  "type": "module",
  "description": "Axis' Iliad - one API call that turns any codebase into 142 deterministic AI-agent-ready artifacts (AGENTS.md, CLAUDE.md, design tokens, Visa CE 3.0 compliance kit, MCP configs, and more)",
  "keywords": [
    "ai",
    "agents",
    "mcp",
    "codebase-analysis",
    "artifact-generation",
    "agents-md",
    "claude-md",
    "cursorrules",
    "llm-context",
    "visa-compliance",
    "x402",
    "ap2",
    "agentic-commerce"
... (48 more lines)
```

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noUnusedLocals": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "exclude": ["node_modules", "dist"]
}

```

### `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    environment: "node",
    pool: "threads",
    // The Postgres-backed suite (Phase 6 of the Neon migration) shares one test
    // database, so test files must not run concurrently (they truncate tables
    // between tests). Within a file, tests already run sequentially.
    fileParallelism: false,
    maxWorkers: process.env.CI ? 4 : undefined,
    hookTimeout: 300_000,
    environmentOptions: {
      happyDom: {},
    },
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
... (19 more lines)
```

## File Tree

```
.github/actions/compliance-check/action.yml (13.0 KB)
.github/actions/context-freshness/README.md (5.3 KB)
.github/actions/context-freshness/action.yml (6.0 KB)
.github/app-manifest.json (1.0 KB)
.github/dependabot.yml (1.6 KB)
.github/workflows/ci.yml (11.0 KB)
.github/workflows/compliance-check.yml (1.7 KB)
.github/workflows/context-freshness.yml (0.9 KB)
.github/workflows/release.yml (1.9 KB)
.github/workflows/synthetic.yml (3.6 KB)
.gitignore (1.2 KB)
.prettierrc.json (0.1 KB)
.tmp-vitest.json (68.7 KB)
ACTIVATION_TRACKER.md (7.9 KB)
AGENTS.md (7.0 KB)
AXIS_Board_Pitch.md (30.7 KB)
AXIS_DEMO_REPORT.md (12.4 KB)
CHANGELOG.md (7.8 KB)
CLAUDE.md (7.9 KB)
CODE_TO_DOCS_BUILD_STRATEGY.md (11.1 KB)
COMPLIANCE_KIT_BUILD_SPEC.md (10.9 KB)
CONTRIBUTING.md (6.4 KB)
DEPLOY_OFF_ACTIONS_RUNBOOK.md (10.6 KB)
DISTRIBUTABLE.md (0.6 KB)
Dockerfile (0.9 KB)
E5_LIVING_ARCHITECTURE_DESIGN.md (4.7 KB)
E9_COMMERCE_INTEGRATION_DESIGN.md (4.0 KB)
ENV_ROUTING_MAP.md (10.5 KB)
HARDENING_AUDIT.md (8.8 KB)
ILIAD_PRODUCT_READINESS_SCORECARD.yaml (13.9 KB)
LAUNCH_CLAIMS.yaml (4.6 KB)
LAUNCH_RUNBOOK.md (17.7 KB)
Makefile (0.4 KB)
NEON_MIGRATION_PLAN.md (8.8 KB)
PRIVACY_POLICY.md (9.8 KB)
README.md (19.2 KB)
ROUTING_GO_LIVE_RUNBOOK.md (5.1 KB)
SECURITY.md (2.3 KB)
SETUP_PAID_STRIPE_MCP.md (13.6 KB)
SHARED_PAID_CLIENT_PLAN.md (3.6 KB)
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

- **You are here:** `optimization-rules.md` — agent step 12 of 71.
- **Next:** `prompt-diff-report.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
