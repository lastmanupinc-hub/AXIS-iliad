# Test Generation Rules — axis-iliad

> Testing conventions and generation rules for a monorepo

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 9 top-level directories. It defines 278 domain models.

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
| `ChallengeWindow` | interface | 2 | `apps/api/src/anon-frontdoor.ts` |
| `DriftDeps` | interface | 5 | `apps/api/src/architecture-drift-webhook.ts` |
| *... and 263 more* | | | |

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

- **`ContextMap`** (61 fields) — test with partial input, null fields, and boundary values
- **`AdminRevenue`** (29 fields) — test with partial input, null fields, and boundary values
- **`RepoProfile`** (26 fields) — test with partial input, null fields, and boundary values
- **`AnalyzeQuickResponse`** (24 fields) — test with partial input, null fields, and boundary values
- **`RouteContext`** (24 fields) — test with partial input, null fields, and boundary values

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
| `apps/api/src/account-lifecycle.test.ts` | 226 |
| `apps/api/src/admin.test.ts` | 352 |
| `apps/api/src/agent-discovery.test.ts` | 910 |
| `apps/api/src/alerting.test.ts` | 136 |
| `apps/api/src/analytics.test.ts` | 327 |
| `apps/api/src/analyze-repo-success.test.ts` | 138 |
| `apps/api/src/analyze.test.ts` | 656 |
| `apps/api/src/anon-frontdoor.test.ts` | 126 |
| `apps/api/src/api-branches.test.ts` | 606 |
| `apps/api/src/api-layer5.test.ts` | 284 |
| `apps/api/src/api.test.ts` | 466 |
| `apps/api/src/architecture-drift-webhook.test.ts` | 270 |
| *… and 165 more* | |

## Reference Test

### `apps/api/src/attestation.test.ts`

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { attestRun, verifyAttestation, verifyChainLink, hashInput, hashOutput, resetChainForTests, resetKeyForTests, type Attestation } from "./attestation.js";

const input = { language: "python", code: "print(1)", stdin: "" };
const output = { stdout: "1\n", stderr: "", exit_code: 0 };

beforeEach(() => {
  resetChainForTests();
  resetKeyForTests();
  delete process.env.AXIS_ATTESTATION_PRIVATE_KEY;
});

describe("hashInput / hashOutput", () => {
  it("are deterministic and input-sensitive", () => {
    expect(hashInput(input)).toBe(hashInput(input));
    expect(hashInput(input)).not.toBe(hashInput({ ...input, code: "print(2)" }));
    expect(hashInput(input)).not.toBe(hashInput({ ...input, language: "node" }));
  });

  it("has unambiguous field boundaries (no code/stdin separator collision)", () => {
    expect(hashInput({ language: "python", code: "a", stdin: "b c" })).not.toBe(
      hashInput({ language: "python", code: "a b", stdin: "c" }),
    );
  });

  it("output hash covers only stdout/stderr/exit_code (duration/image ignored)", () => {
    const withNoise = { ...output, duration_ms: 999, image: "img" } as unknown as typeof output;
    expect(hashOutput(output)).toBe(hashOutput(withNoise));
    expect(hashOutput(output)).not.toBe(hashOutput({ ...output, exit_code: 1 }));
  });
});

describe("attestRun / verifyAttestation", () => {
  it("produces a self-verifying attestation bound to the input + output", () => {
    const att = attestRun(input, output, "acc-1");
    expect(att.version).toBe("axis-attestation/1");
    expect(att.code_sha256).toBe(hashInput(input));
    expect(att.output_sha256).toBe(hashOutput(output));
    expect(att.key_source).toBe("ephemeral"); // no env key in tests
    expect(verifyAttestation(att)).toBe(true);
... (59 more lines)
```

## Untested Exports

These source files export functions without matching test files:

- `eslint.config.js` — export default [
- `vitest.config.ts` — export default defineConfig({ ... }
- `apps/web/vite.config.ts` — export default defineConfig({ ... }
- `apps/api/src/cashier.ts` — export interface SettleOptions { ... }, export function centsToFabricCredits(cents: number): number { ... }, export function isOwnerEntityAccount(accountId: string): boolean { ... }, export async function settleOverageViaPaidWallet(, export async function settleOverageCash(
- `apps/api/src/counts.ts` — export const ARTIFACT_COUNT = ..., export const PROGRAM_COUNT = ..., export const MCP_TOOL_COUNT = ..., export const ENDPOINT_COUNT = ..., export const API_VERSION = ...
- `apps/api/src/credit-pack-handlers.ts` — export async function handleListCreditPacks(, export async function handleCreateCreditTopup(, export async function handleListMyPurchases(
- `apps/api/src/funnel.ts` — export async function handleGetPlans(, export async function handleInviteSeat(, export async function handleListSeats(, export async function handleAcceptSeat(, export async function handleRevokeSeat(, export async function handleGetUpgradePrompt(, export async function handleDismissUpgradePrompt(, export async function handleGetFunnelStatus(, export async function handleGetFunnelMetrics(, export async function handleTrackAnalyticsEvent(
- `apps/api/src/handlers.ts` — export async function assertSnapshotAccess(req: IncomingMessage, res: ServerResponse, snapshot: { ... }, export async function assertProjectAccess(req: IncomingMessage, res: ServerResponse, project_id: string): Promise<boolea, export const PROGRAM_OUTPUTS: Record<string, string[]> = ..., export function makeProgramHandler(program: string, defaultOutputs: string[]) { ... }, export const handleDebugAnalyze = ..., export const handleFrontendAudit = ..., export const handleSeoAnalyze = ..., export const handleOptimizationAnalyze = ..., export const handleThemeGenerate = ..., export const handleBrandGenerate = ..., export const handleSuperpowersGenerate = ..., export const handleMarketingGenerate = ..., export const handleNotebookGenerate = ..., export const handleObsidianAnalyze = ..., export const handleMcpProvision = ..., export const handleArtifactsGenerate = ..., export const handleRemotionGenerate = ..., export const handleCanvasGenerate = ..., export const handleAlgorithmicGenerate = ..., export const handleAgenticPurchasingGenerate = ..., export const handleCloserGenerate = ..., export const handleDeployGenerate = ..., export async function handleCreateSnapshot(, export async function handleGetSnapshot(, export async function handleDeleteSnapshot(, export async function handleDeleteProject(, export async function handleGetContext(, export async function handleGetGeneratedFiles(, export async function handleHealthCheck(, export async function handleDbStats(
- `apps/api/src/intent.ts` — export type ProbeClass = ..., export function classifyProbe(userAgent: string): ProbeClass { ... }, export function detectMcpSource(userAgent: string): string { ... }, export function captureIntent(tool: string, intent: string | null, userAgent: string): void { ... }, export function getIntentLog(): IntentCapture[] { ... }
- `apps/api/src/mcp-tool-impls.ts` — export function runPlannedCapability(capability: PlannedCapability): string { ... }, export async function runObjectStorage(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runTransactionalEmail(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... , export async function runEmbeddings(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export const LITE_VECTOR_NAMESPACE_MAX_VECTORS = ..., export async function runVectorDatabase(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runAnalytics(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runLlmInference(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runNetworkTokenization(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ..., export const LITE_DOC_INPUT_MAX_BYTES = ..., export const LITE_DOC_MARKDOWN_MAX_CHARS = ..., export async function runDocumentParsingDispatch(args: Record<string, unknown>, req: IncomingMessage): Promise<string> {, export async function runWebSearch(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runTextToSpeech(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runSpeechToText(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runCodeSandbox(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runWebResearch(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runWebResearchCrawl(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export function runPreparePurchasingPreview(args: Record<string, unknown>): string { ... }, export async function runHygiene(args: Record<string, unknown>, req: IncomingMessage): Promise<string> { ... }, export async function runAnalyzeFiles(, export async function runAnalyzeRepo(, export const FREE_MCP_TOOL_COUNT = ..., export function runSearchTools(args: Record<string, unknown>): string { ... }, export interface McpToolCatalogEntry { ... }, export function deriveMcpToolCatalog(): McpToolCatalogEntry[] { ... }, export function runDiscoverAgenticCommerceTools(): string { ... }, export async function runImproveMyAgent(, export function runDiscoverAgenticPurchasingNeeds(args: Record<string, unknown>): string { ... }, export async function runGetReferralCode(req: IncomingMessage): Promise<string> { ... }
- *… and 12 more untested*
- *(scanned the first 150 of 155 source files; files past that weren't checked)*


---

## ⟳ Continue the loop

- **You are here:** `test-generation-rules.md` — agent step 19 of 71.
- **Next:** `refactor-checklist.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
