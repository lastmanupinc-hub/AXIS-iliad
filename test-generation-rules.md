# Test Generation Rules — axis-toolbox

> Testing conventions and generation rules for a monorepo

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 500 files across 20 top-level directories. It defines 152 domain models.

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
| `CacheKey` | type_alias | 2 | `apps/api/src/mpp.ts` |
| `ChargeOptions` | type_alias | 5 | `apps/api/src/mpp.ts` |
| `MppResult` | type_alias | 1 | `apps/api/src/mpp.ts` |
| *... and 137 more* | | | |

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
| `apps/api/src/analyze.test.ts` | 456 |
| `apps/api/src/api-branches.test.ts` | 606 |
| `apps/api/src/api-layer5.test.ts` | 284 |
| `apps/api/src/api.test.ts` | 464 |
| `apps/api/src/b-grade-upgrade.test.ts` | 228 |
| `apps/api/src/billing-flow.test.ts` | 548 |
| `apps/api/src/budget-probe.test.ts` | 809 |
| `apps/api/src/checkout-email.test.ts` | 308 |
| `apps/api/src/crash-resilience.test.ts` | 158 |
| `apps/api/src/credits-api.test.ts` | 262 |

## Reference Test

### `apps/api/src/logger.test.ts`

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { log } from "./logger.js";

describe("LOG_LEVEL filtering", () => {
  afterEach(() => {
    delete process.env.LOG_LEVEL;
    vi.restoreAllMocks();
  });

  it("writes info by default (LOG_LEVEL unset)", () => {
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    log("info", "test_msg");
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("test_msg");
  });

  it("writes error to stderr", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    log("error", "err_msg");
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("error");
  });

  it("writes warn to stdout", () => {
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    log("warn", "warn_msg");
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("warn");
  });

  it("writes debug when LOG_LEVEL=debug", () => {
    process.env.LOG_LEVEL = "debug";
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    log("debug", "debug_msg");
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
... (54 more lines)
```
