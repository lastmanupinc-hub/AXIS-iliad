# Superpower Pack — axis-iliad

> High-leverage development workflows for a monorepo (TypeScript)

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 9 top-level directories. It defines 278 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Quick Actions

Copy-paste-ready commands for common high-value operations:

### Build & Run

```bash
# Install dependencies
pnpm install

# Build
pnpm run build

# Dev server
pnpm run dev
```

### Testing

```bash
# Run all tests
npx vitest run

# Watch mode
npx vitest

# Single file
npx vitest run <file>

# Coverage
npx vitest run --coverage
```

### Debugging Workflow

1. **Reproduce** — Create a minimal test case that triggers the bug
2. **Isolate** — Use dependency hotspots to narrow the search area:

   - `apps/api/src/router.ts` (risk: 1.0, 113 inbound, 4 outbound)
   - `apps/api/src/test-helpers.ts` (risk: 1.0, 54 inbound, 1 outbound)
   - `apps/api/src/billing.ts` (risk: 1.0, 44 inbound, 3 outbound)
   - `apps/api/src/handlers.ts` (risk: 1.0, 36 inbound, 21 outbound)
   - `apps/api/src/rate-limiter.ts` (risk: 1.0, 46 inbound, 2 outbound)

3. **Trace** — Follow the import chain from entry point to failure
4. **Fix** — Make the smallest change that resolves the issue
5. **Verify** — Run the test case + full suite to confirm no regressions

## Code Review Checklist

- [ ] Types are correct and meaningful (no `any`, no untyped casts)
- [ ] Error paths are handled (not just the happy path)
- [ ] New code has test coverage
- [ ] No debug artifacts (console.log, TODO, commented code)
- [ ] Import graph doesn't create new circular dependencies
- [ ] Changes follow detected conventions:
  - TypeScript strict mode
  - Linter configured
  - Formatter configured
  - pnpm workspaces
  - Makefile build

## Planning Template

```markdown
## Task: [title]

### What
[One sentence describing the change]

### Why
[Business or technical reason]

### Files to Touch
- [ ] file1.ts — [what changes]
- [ ] file2.ts — [what changes]

### Tests
- [ ] [test case 1]
- [ ] [test case 2]

### Risks
- [potential issue and mitigation]
```

## Key Hotspot Files (for Debugging)

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
... (1037 more lines)
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
... (547 more lines)
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

- **You are here:** `superpower-pack.md` — agent step 18 of 71.
- **Next:** `test-generation-rules.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
