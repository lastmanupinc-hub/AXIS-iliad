# Test Generation Rules — axis-iliad

> Testing conventions and generation rules for a monorepo

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 163 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Test Framework

Detected: **vitest**

## File Naming Convention

- Test files: `<module>.test.ts` or `<module>.spec.ts`
- Co-locate with source: `src/store.ts` → `src/store.test.ts`
- Alternatively: `__tests__/<module>.test.ts`

## Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import type { AuthContext } from '..';

describe('AuthContext', () => {
  let authContext: AuthContext;

  beforeEach(() => {
    authContext = makeAuthContext();
  });

  it('should <expected behavior> when <condition>', () => {
    // Arrange
    const input = makeAuthContext({ /* override fields */ });

    // Act
    const result = processAuthContext(input);

    // Assert
    expect(result).toEqual(expected);
  });
});
```

## Domain Model Test Targets

These models were detected in the codebase. Each should have factory helpers and unit tests:

| Model | Kind | Fields | Source |
|-------|------|--------|--------|
| `AuthContext` | interface | 3 | `apps/api/src/billing.ts` |
| `EnvSpec` | interface | 5 | `apps/api/src/env.ts` |
| `ValidationError` | interface | 2 | `apps/api/src/env.ts` |
| `ValidationResult` | interface | 3 | `apps/api/src/env.ts` |
| `ZipEntry` | interface | 4 | `apps/api/src/export.ts` |
| `IntentCapture` | interface | 5 | `apps/api/src/mcp-server.ts` |
| `JsonRpcRequest` | interface | 4 | `apps/api/src/mcp-server.ts` |
| `McpCallCounters` | interface | 5 | `apps/api/src/mcp-server.ts` |
| `RpcError` | interface | 5 | `apps/api/src/mcp-server.ts` |
| `RpcSuccess` | interface | 3 | `apps/api/src/mcp-server.ts` |
| `HistogramEntry` | interface | 3 | `apps/api/src/metrics.ts` |
| `AgentBudget` | interface | 5 | `apps/api/src/mpp.ts` |
| `Build402Options` | interface | 2 | `apps/api/src/mpp.ts` |
| `CacheKey` | type_alias | 2 | `apps/api/src/mpp.ts` |
| `ChargeOptions` | type_alias | 5 | `apps/api/src/mpp.ts` |
| *... and 148 more* | | | |

### Factory Helper Pattern

Create a factory file (`test-factories.ts`) with sensible defaults for each model:

```typescript
export function makeAuthContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    // fill in required fields with sensible test defaults
    ...overrides,
  };
}

export function makeEnvSpec(overrides: Partial<EnvSpec> = {}): EnvSpec {
  return {
    // fill in required fields with sensible test defaults
    ...overrides,
  };
}

export function makeValidationError(overrides: Partial<ValidationError> = {}): ValidationError {
  return {
    // fill in required fields with sensible test defaults
    ...overrides,
  };
}

```

### High-Complexity Models (prioritize edge-case coverage)

- **`ProgramDoc`** (13 fields) — test with partial input, null fields, and boundary values
- **`ParseResult`** (13 fields) — test with partial input, null fields, and boundary values
- **`RepoProfile`** (12 fields) — test with partial input, null fields, and boundary values
- **`StripeSubscription`** (12 fields) — test with partial input, null fields, and boundary values
- **`SubscriptionInfo`** (11 fields) — test with partial input, null fields, and boundary values

## Test Categories

### Unit Tests
- Test individual functions and methods in isolation
- Mock external dependencies (database, API, file system)
- Target: every exported function should have at least one unit test
- Speed: < 10ms per test

### Integration Tests
- Test module interactions with real dependencies where possible
- Use in-memory databases (SQLite :memory:) instead of mocks when available
- Test API endpoints with real HTTP requests
- Speed: < 500ms per test

### Component Tests
- Use @testing-library/react for component rendering
- Test user interactions, not implementation details
- Test accessibility: check roles, labels, keyboard navigation
- Avoid testing CSS classes — test visible behavior

## What to Test

### Always Test
- Public API surface (exported functions)
- Error handling paths
- Edge cases: empty input, null, boundary values
- Data transformations and calculations
- State transitions

### Skip Testing
- Private implementation details (test through public API)
- Third-party library behavior
- Simple type definitions
- Configuration files

## Assertion Patterns

| Pattern | When to Use | Example |
|---------|------------|---------|
| `toEqual` | Object/array equality | `expect(result).toEqual({ id: 1 })` |
| `toBe` | Primitive or reference equality | `expect(status).toBe('ready')` |
| `toContain` | Array/string inclusion | `expect(list).toContain('item')` |
| `toThrow` | Error handling | `expect(() => fn()).toThrow()` |
| `toBeGreaterThan` | Numeric bounds | `expect(count).toBeGreaterThan(0)` |
| `toBeTruthy` | Existence check | `expect(result).toBeTruthy()` |

## Detected Test Files

| File | Lines |
|------|-------|
| `apps/api/src/admin.test.ts` | 265 |
| `apps/api/src/agent-discovery.test.ts` | 559 |
| `apps/api/src/analyze-repo-success.test.ts` | 137 |
| `apps/api/src/analyze.test.ts` | 487 |
| `apps/api/src/api-branches.test.ts` | 606 |
| `apps/api/src/api-layer5.test.ts` | 284 |
| `apps/api/src/api.test.ts` | 464 |
| `apps/api/src/b-grade-upgrade.test.ts` | 228 |
| `apps/api/src/billing-flow.test.ts` | 548 |
| `apps/api/src/budget-probe.test.ts` | 833 |
| `apps/api/src/checkout-email.test.ts` | 308 |
| `apps/api/src/crash-resilience.test.ts` | 158 |

## Reference Test

### `apps/api/src/handler-shutdown.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

// ─── Mock router.js to control isShuttingDown ───────────────────
vi.mock("./router.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./router.js")>();
  return { ...orig, isShuttingDown: vi.fn(() => false) };
});

// ─── Mock @axis/snapshots to prevent real DB access on import ───
vi.mock("@axis/snapshots", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@axis/snapshots")>();
  return { ...orig, openMemoryDb: vi.fn(), closeDb: vi.fn() };
});

import { handleHealthCheck } from "./handlers.js";
import { isShuttingDown } from "./router.js";

// ─── Minimal res/req stubs ──────────────────────────────────────
function stubReq(): IncomingMessage {
  return { headers: {} } as unknown as IncomingMessage;
}

function stubRes(): ServerResponse & { _status: number; _body: string } {
  const res: Record<string, unknown> = {
    _status: 0,
    _body: "",
    _headers: {} as Record<string, string>,
    writeHead(status: number) { res._status = status; return res; },
    setHeader(k: string, v: string) { (res._headers as Record<string, string>)[k] = v; },
    end(body?: string) { res._body = body ?? ""; },
    getHeader() { return undefined; },
  };
  return res as unknown as ServerResponse & { _status: number; _body: string };
}

// ─── Tests ──────────────────────────────────────────────────────
describe("handleHealthCheck shutdown path", () => {
  beforeEach(() => {
    vi.mocked(isShuttingDown).mockReturnValue(false);
... (27 more lines)
```

## Untested Exports

These source files export functions without matching test files:

- `apps/api/src/counts.ts` — export const ARTIFACT_COUNT = ..., export const PROGRAM_COUNT = ..., export const MCP_TOOL_COUNT = ..., export const ENDPOINT_COUNT = ...
