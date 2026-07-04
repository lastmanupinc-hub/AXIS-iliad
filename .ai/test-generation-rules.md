# Test Generation Rules — axis-iliad

> Testing conventions and generation rules for a monorepo

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

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
import type { AlertThresholds } from '..';

describe('AlertThresholds', () => {
  let alertThresholds: AlertThresholds;

  beforeEach(() => {
    alertThresholds = makeAlertThresholds();
  });

  it('should <expected behavior> when <condition>', () => {
    // Arrange
    const input = makeAlertThresholds({ /* override fields */ });

    // Act
    const result = processAlertThresholds(input);

    // Assert
    expect(result).toEqual(expected);
  });
});
```

## Domain Model Test Targets

These models were detected in the codebase. Each should have factory helpers and unit tests:

| Model | Kind | Fields | Source |
|-------|------|--------|--------|
| `AlertThresholds` | interface | 2 | `apps/api/src/alerting.ts` |
| `Counters` | type_alias | 2 | `apps/api/src/alerting.ts` |
| `DebounceState` | interface | 2 | `apps/api/src/alerting.ts` |
| `WindowResult` | interface | 4 | `apps/api/src/alerting.ts` |
| `AnalyticsCountByBucketResult` | interface | 3 | `apps/api/src/analytics.ts` |
| `AnalyticsCountByBucketRow` | interface | 2 | `apps/api/src/analytics.ts` |
| `AnalyticsCountByEventResult` | interface | 2 | `apps/api/src/analytics.ts` |
| `AnalyticsCountByEventRow` | interface | 2 | `apps/api/src/analytics.ts` |
| `AnalyticsCountResult` | interface | 2 | `apps/api/src/analytics.ts` |
| `AnalyticsDistinctUsersResult` | interface | 2 | `apps/api/src/analytics.ts` |
| `AnalyticsEvent` | interface | 4 | `apps/api/src/analytics.ts` |
| `AnalyticsQuery` | interface | 8 | `apps/api/src/analytics.ts` |
| `WhereClause` | interface | 2 | `apps/api/src/analytics.ts` |
| `DriftDeps` | interface | 5 | `apps/api/src/architecture-drift-webhook.ts` |
| `DriftOutcome` | interface | 3 | `apps/api/src/architecture-drift-webhook.ts` |
| *... and 227 more* | | | |

### Factory Helper Pattern

Create a factory file (`test-factories.ts`) with sensible defaults for each model:

```typescript
export function makeAlertThresholds(overrides: Partial<AlertThresholds> = {}): AlertThresholds {
  return {
    // fill in required fields with sensible test defaults
    ...overrides,
  };
}

export function makeCounters(overrides: Partial<Counters> = {}): Counters {
  return {
    // fill in required fields with sensible test defaults
    ...overrides,
  };
}

export function makeDebounceState(overrides: Partial<DebounceState> = {}): DebounceState {
  return {
    // fill in required fields with sensible test defaults
    ...overrides,
  };
}

```

### High-Complexity Models (prioritize edge-case coverage)

- **`ContextMap`** (69 fields) — test with partial input, null fields, and boundary values
- **`ContextMap`** (61 fields) — test with partial input, null fields, and boundary values
- **`ResellCapability`** (29 fields) — test with partial input, null fields, and boundary values
- **`RepoProfile`** (26 fields) — test with partial input, null fields, and boundary values
- **`RepoProfile`** (21 fields) — test with partial input, null fields, and boundary values

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
| `apps/api/src/admin.test.ts` | 336 |
| `apps/api/src/agent-discovery.test.ts` | 597 |
| `apps/api/src/alerting.test.ts` | 77 |
| `apps/api/src/analytics.test.ts` | 327 |
| `apps/api/src/analyze-repo-success.test.ts` | 138 |
| `apps/api/src/analyze.test.ts` | 487 |
| `apps/api/src/api-branches.test.ts` | 606 |
| `apps/api/src/api-layer5.test.ts` | 284 |
| `apps/api/src/api.test.ts` | 463 |
| `apps/api/src/architecture-drift-webhook.test.ts` | 96 |
| `apps/api/src/architecture-drift.test.ts` | 105 |
| `apps/api/src/attestation.test.ts` | 99 |

## Reference Test

### `apps/api/src/alerting.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { evalErrorRate, decideFire } from "./alerting.js";

const T = { errorRatePct: 5, minSample: 20 };

describe("evalErrorRate", () => {
  it("is not breached below the min sample, even at a high rate", () => {
    const r = evalErrorRate({ requestCount: 0, errorCount: 0 }, { requestCount: 10, errorCount: 10 }, T);
    expect(r.sample).toBe(10);
    expect(r.errorRatePct).toBe(100);
    expect(r.breached).toBe(false); // 10 < minSample 20
  });

  it("breaches above the threshold with enough sample", () => {
    const r = evalErrorRate({ requestCount: 0, errorCount: 0 }, { requestCount: 100, errorCount: 10 }, T);
    expect(r.sample).toBe(100);
    expect(r.errors).toBe(10);
    expect(r.errorRatePct).toBe(10);
    expect(r.breached).toBe(true);
  });

  it("does not breach when the rate is under the threshold", () => {
    const r = evalErrorRate({ requestCount: 0, errorCount: 0 }, { requestCount: 100, errorCount: 2 }, T);
    expect(r.errorRatePct).toBe(2);
    expect(r.breached).toBe(false);
  });

  it("returns 0% (not breached) when no requests landed in the window", () => {
    const r = evalErrorRate({ requestCount: 50, errorCount: 1 }, { requestCount: 50, errorCount: 1 }, T);
    expect(r.sample).toBe(0);
    expect(r.errorRatePct).toBe(0);
    expect(r.breached).toBe(false);
  });

  it("clamps to 0 if the counters reset (curr < prev)", () => {
    const r = evalErrorRate({ requestCount: 100, errorCount: 5 }, { requestCount: 10, errorCount: 0 }, T);
    expect(r.sample).toBe(0);
    expect(r.errors).toBe(0);
    expect(r.breached).toBe(false);
  });
... (37 more lines)
```

## Untested Exports

These source files export functions without matching test files:

- `apps/api/src/counts.ts` — export const ARTIFACT_COUNT = ..., export const PROGRAM_COUNT = ..., export const MCP_TOOL_COUNT = ..., export const ENDPOINT_COUNT = ..., export const API_VERSION = ...
- `apps/api/src/credit-pack-handlers.ts` — export async function handleListCreditPacks(, export async function handleCreateCreditTopup(, export async function handleListMyPurchases(
- `apps/api/src/funnel.ts` — export async function handleGetPlans(, export async function handleInviteSeat(, export async function handleListSeats(, export async function handleAcceptSeat(, export async function handleRevokeSeat(, export async function handleGetUpgradePrompt(, export async function handleDismissUpgradePrompt(, export async function handleGetFunnelStatus(, export async function handleGetFunnelMetrics(, export async function handleTrackAnalyticsEvent(
- `apps/api/src/handlers.ts` — export async function assertSnapshotAccess(req: IncomingMessage, res: ServerResponse, snapshot: { ... }, export const PROGRAM_OUTPUTS: Record<string, string[]> = ..., export function makeProgramHandler(program: string, defaultOutputs: string[]) { ... }, export const handleDebugAnalyze = ..., export const handleFrontendAudit = ..., export const handleSeoAnalyze = ..., export const handleOptimizationAnalyze = ..., export const handleThemeGenerate = ..., export const handleBrandGenerate = ..., export const handleSuperpowersGenerate = ..., export const handleMarketingGenerate = ..., export const handleNotebookGenerate = ..., export const handleObsidianAnalyze = ..., export const handleMcpProvision = ..., export const handleArtifactsGenerate = ..., export const handleRemotionGenerate = ..., export const handleCanvasGenerate = ..., export const handleAlgorithmicGenerate = ..., export const handleAgenticPurchasingGenerate = ..., export const handleCloserGenerate = ..., export const handleDeployGenerate = ..., export async function handleCreateSnapshot(, export async function handleGetSnapshot(, export async function handleDeleteSnapshot(, export async function handleDeleteProject(, export async function handleGetContext(, export async function handleGetGeneratedFiles(, export async function handleHealthCheck(, export async function handleDbStats(, export async function handleDbMaintenance(
- `apps/api/src/intent.ts` — export type ProbeClass = ..., export function classifyProbe(userAgent: string): ProbeClass { ... }, export function detectMcpSource(userAgent: string): string { ... }, export function captureIntent(tool: string, intent: string | null, userAgent: string): void { ... }, export function getIntentLog(): IntentCapture[] { ... }
- `apps/api/src/mcp-runtime.ts` — export const REGISTRY_DISPLAY_NAME = ..., export const SERVER_SLUG = ..., export const REGISTRY_VERSION = ..., export const RPC_PARSE_ERROR = ..., export const RPC_INVALID_REQUEST = ..., export const RPC_METHOD_NOT_FOUND = ..., export const RPC_INVALID_PARAMS = ..., export const RPC_INTERNAL_ERROR = ..., export interface RpcSuccess { ... }, export interface RpcError { ... }, export function rpcOk(id: string | number | null, result: unknown): RpcSuccess { ... }, export function rpcErr(, export function toolOk(text: string) { ... }, export function toolErr(text: string) { ... }, export type ErrorCategory = ..., export function categorizeError(msg: string): { ... }, export { ... }, export type MeteredMcpTool = ..., export async function authorizeMcpToolCredits(, export async function captureMcpToolCredits(, export async function meterMcpToolCredits(, export function readIdempotencyKey(req: IncomingMessage): string | null { ... }, export function hashToolRequest(tool: string, args: Record<string, unknown>): string { ... }
- `apps/api/src/mcp-tool-impls.ts` — export function runPlannedCapability(capability: PlannedCapability): string { ... }, export async function runObjectStorage(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runTransactionalEmail(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... , export async function runEmbeddings(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runVectorDatabase(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runAnalytics(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runLlmInference(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runDocumentParsingDispatch(args: Record<string, unknown>, req: IncomingMessage): Promise<string> {, export async function runWebSearch(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runTextToSpeech(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runSpeechToText(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runCodeSandbox(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runWebResearch(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runWebResearchCrawl(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export function runPreparePurchasingPreview(args: Record<string, unknown>): string { ... }, export async function runHygiene(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runAnalyzeFiles(, export async function runAnalyzeRepo(, export function runSearchTools(args: Record<string, unknown>): string { ... }, export function runDiscoverAgenticCommerceTools(): string { ... }, export async function runImproveMyAgent(, export function runDiscoverAgenticPurchasingNeeds(args: Record<string, unknown>): string { ... }, export async function runGetReferralCode(req: IncomingMessage): Promise<string> { ... }, export async function runCheckReferralCredits(req: IncomingMessage): Promise<string> { ... }, export function runListPrograms(): string { ... }, export async function runGetSnapshot(, export async function runGetArtifact(, export async function runCloser(, export async function runDeploy(, export async function runPreparePurchasing(
- `apps/api/src/mcp-tools.ts` — export interface PlannedCapability { ... }, export const PLANNED_CAPABILITIES: readonly PlannedCapability[] = ..., export const PLANNED_CAPABILITY_NAMES: ReadonlySet<string> = ..., export const MCP_TOOLS = ...
- `apps/api/src/oauth-server.ts` — export async function handleOAuthAuthorize(req: IncomingMessage, res: ServerResponse): Promise<void> { ... }, export async function handleOAuthToken(req: IncomingMessage, res: ServerResponse): Promise<void> { ... }, export async function handleOAuthJwks(_req: IncomingMessage, res: ServerResponse): Promise<void> { ... }, export async function handleOAuthIntrospect(req: IncomingMessage, res: ServerResponse): Promise<void> { ... }, export async function requireBearerToken(req: IncomingMessage, res: ServerResponse): Promise<boolean> { ... }, export async function createOAuthClient(name: string, redirectUris: string[], scopes: string[] = ...
- `apps/api/src/server.ts` — export const app = ...
- *… and 42 more untested*


---

## ⟳ Continue the loop

- **You are here:** `test-generation-rules.md` — agent step 19 of 70.
- **Next:** `refactor-checklist.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
