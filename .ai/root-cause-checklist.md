# Root Cause Checklist — axis-toolbox

> monorepo | TypeScript | 432 files | 95,217 LOC

**Stack:** React ^19.1.0

## Triage Workflow

```
1. Reproduce → 2. Isolate → 3. Trace → 4. Root Cause → 5. Fix → 6. Verify → 7. Prevent
```

## Step 1: Reproduction

- [ ] Can you reproduce the issue consistently?
- [ ] What is the minimum input/state to trigger it?
- [ ] Does it reproduce in all environments (dev, staging, prod)?
- [ ] Is it timing-dependent (race condition, timeout)?
- [ ] `pnpm test` — do existing tests pass? (vitest)

## Step 2: Isolation

Which layer does the error surface in?

- [ ] **presentation** — apps, frontend

- [ ] Which architectural pattern is involved? (Detected: monorepo, containerized)
- [ ] Can you remove middleware/plugins to narrow the source?
- [ ] Does the issue persist with mocked dependencies?

## Step 3: Trace

- [ ] Check React DevTools for component re-render loops (React ^19.1.0 detected)
- [ ] Check Network tab for failed API calls
- [ ] Check for hydration mismatches (SSR vs client)
- [ ] Add breakpoints in suspected code paths
- [ ] Check for unhandled promise rejections / panics
- [ ] Review recent git changes (`git log --oneline -20`)

## Step 4: Root Cause Categories

| Category | Check | Typical Fix |
|----------|-------|-------------|
| State mutation | Shared mutable state modified concurrently | Immutable updates, copy-on-write |
| Race condition | Async operations with unguarded order | Mutex, semaphore, serial queue |
| Type mismatch | Runtime type differs from expected | Input validation, zod/yup schema |
| Null reference | Accessing property of undefined | Optional chaining, null guards |
| Resource leak | Connections/handles not released | try/finally, disposal pattern |
| Configuration | Wrong env var, missing secret | Environment diff, config validation |
| Dependency | Breaking change in library update | Lock versions, review changelogs |
| Data integrity | Corrupt/stale data in store | Migration, cache invalidation |

### Domain Entity Integrity

Check these entities for state corruption or relationship violations:

- [ ] `AuthContext` (interface, 3 fields) — `apps/api/src/billing.ts`
- [ ] `EnvSpec` (interface, 5 fields) — `apps/api/src/env.ts`
- [ ] `ValidationError` (interface, 2 fields) — `apps/api/src/env.ts`
- [ ] `ValidationResult` (interface, 3 fields) — `apps/api/src/env.ts`
- [ ] `ZipEntry` (interface, 4 fields) — `apps/api/src/export.ts`
- [ ] `HistogramEntry` (interface, 3 fields) — `apps/api/src/metrics.ts`
- [ ] `OpenApiSpec` (interface, 6 fields) — `apps/api/src/openapi.ts`
- [ ] `WindowEntry` (interface, 2 fields) — `apps/api/src/rate-limiter.ts`
- [ ] `AppHandle` (interface, 3 fields) — `apps/api/src/router.ts`
- [ ] `Route` (interface, 4 fields) — `apps/api/src/router.ts`
- [ ] `CliArgs` (interface, 5 fields) — `apps/cli/src/cli.ts`
- [ ] `AxisConfig` (interface, 2 fields) — `apps/cli/src/credential-store.ts`
- [ ] `RunResult` (interface, 4 fields) — `apps/cli/src/runner.ts`
- [ ] `ScanResult` (interface, 3 fields) — `apps/cli/src/scanner.ts`
- [ ] `WriteResult` (interface, 3 fields) — `apps/cli/src/writer.ts`
- [ ] `Account` (interface, 5 fields) — `apps/web/src/api.ts`
- [ ] `ApiKeyInfo` (interface, 5 fields) — `apps/web/src/api.ts`
- [ ] `ContextMap` (interface, 8 fields) — `apps/web/src/api.ts`
- [ ] `GeneratedFile` (interface, 5 fields) — `apps/web/src/api.ts`
- [ ] `GeneratedFilesResponse` (interface, 6 fields) — `apps/web/src/api.ts`
- [ ] `PlanDefinition` (interface, 6 fields) — `apps/web/src/api.ts`
- [ ] `PlanFeature` (interface, 4 fields) — `apps/web/src/api.ts`
- [ ] `RepoProfile` (interface, 4 fields) — `apps/web/src/api.ts`
- [ ] `SearchResponse` (interface, 5 fields) — `apps/web/src/api.ts`
- [ ] `SearchResult` (interface, 4 fields) — `apps/web/src/api.ts`
- [ ] `Seat` (interface, 7 fields) — `apps/web/src/api.ts`
- [ ] `SnapshotPayload` (interface, 6 fields) — `apps/web/src/api.ts`
- [ ] `SnapshotResponse` (interface, 8 fields) — `apps/web/src/api.ts`
- [ ] `SubscriptionInfo` (interface, 11 fields) — `apps/web/src/api.ts`
- [ ] `SymbolResult` (interface, 5 fields) — `apps/web/src/api.ts`
- [ ] `SymbolsResponse` (interface, 3 fields) — `apps/web/src/api.ts`
- [ ] `UpgradePrompt` (interface, 9 fields) — `apps/web/src/api.ts`
- [ ] `UsageSummary` (interface, 5 fields) — `apps/web/src/api.ts`
- [ ] `IconProps` (interface, 5 fields) — `apps/web/src/components/AxisIcons.tsx`
- [ ] `PaletteAction` (interface, 6 fields) — `apps/web/src/components/CommandPalette.tsx`
- [ ] `Props` (interface, 1 fields) — `apps/web/src/components/CommandPalette.tsx`
- [ ] `Props` (interface, 1 fields) — `apps/web/src/components/FilesTab.tsx`
- [ ] `Props` (interface, 2 fields) — `apps/web/src/components/GeneratedTab.tsx`
- [ ] `Props` (interface, 1 fields) — `apps/web/src/components/GraphTab.tsx`
- [ ] `Props` (interface, 2 fields) — `apps/web/src/components/OverviewTab.tsx`
- [ ] `ProgramDef` (interface, 5 fields) — `apps/web/src/components/ProgramLauncher.tsx`
- [ ] `Props` (interface, 3 fields) — `apps/web/src/components/ProgramLauncher.tsx`
- [ ] `Props` (interface, 1 fields) — `apps/web/src/components/SearchTab.tsx`
- [ ] `Props` (interface, 3 fields) — `apps/web/src/components/SignUpModal.tsx`
- [ ] `Props` (interface, 2 fields) — `apps/web/src/components/StatusBar.tsx`
- [ ] `Toast` (interface, 4 fields) — `apps/web/src/components/Toast.tsx`
- [ ] `ToastContextValue` (interface, 1 fields) — `apps/web/src/components/Toast.tsx`
- [ ] `Props` (interface, 2 fields) — `apps/web/src/pages/DashboardPage.tsx`
- [ ] `ProgramDoc` (interface, 13 fields) — `apps/web/src/pages/DocsPage.tsx`
- [ ] `Step` (interface, 4 fields) — `apps/web/src/pages/HelpPage.tsx`
- [ ] `TroubleshootItem` (interface, 2 fields) — `apps/web/src/pages/HelpPage.tsx`
- [ ] `Props` (interface, 2 fields) — `apps/web/src/pages/PlansPage.tsx`
- [ ] `ProgramDef` (interface, 7 fields) — `apps/web/src/pages/ProgramsPage.tsx`
- [ ] `Props` (interface, 1 fields) — `apps/web/src/pages/ProgramsPage.tsx`
- [ ] `QAItem` (interface, 3 fields) — `apps/web/src/pages/QAPage.tsx`
- [ ] `Section` (interface, 2 fields) — `apps/web/src/pages/TermsPage.tsx`
- [ ] `Props` (interface, 1 fields) — `apps/web/src/pages/UploadPage.tsx`
- [ ] `ImportMeta` (interface, 1 fields) — `apps/web/src/vite-env.d.ts`
- [ ] `ImportMetaEnv` (interface, 1 fields) — `apps/web/src/vite-env.d.ts`
- [ ] `ContextMap` (interface, 10 fields) — `packages/context-engine/src/types.ts`
- [ ] `RepoProfile` (interface, 12 fields) — `packages/context-engine/src/types.ts`
- [ ] `Edge` (interface, 3 fields) — `packages/generator-core/src/generators-algorithmic.ts`
- [ ] `Node` (interface, 7 fields) — `packages/generator-core/src/generators-algorithmic.ts`
- [ ] `DashboardData` (interface, 6 fields) — `packages/generator-core/src/generators-artifacts.ts`
- [ ] `MyComponentProps` (interface, 2 fields) — `packages/generator-core/src/generators-frontend.ts`
- [ ] `RemotionTheme` (interface, 4 fields) — `packages/generator-core/src/generators-remotion.ts`
- [ ] `GeneratedFile` (interface, 5 fields) — `packages/generator-core/src/types.ts`
- [ ] `GeneratorInput` (interface, 4 fields) — `packages/generator-core/src/types.ts`
- [ ] `GeneratorResult` (interface, 6 fields) — `packages/generator-core/src/types.ts`
- [ ] `SourceFile` (interface, 3 fields) — `packages/generator-core/src/types.ts`
- [ ] `DomainModel` (interface, 5 fields) — `packages/repo-parser/src/domain-extractor.ts`
- [ ] `FrameworkRule` (interface, 4 fields) — `packages/repo-parser/src/framework-detector.ts`
- [ ] `DepGroups` (interface, 3 fields) — `packages/repo-parser/src/parser.ts`
- [ ] `CreateUserRequest` (interface, 3 fields) — `packages/repo-parser/src/perf.bench.ts`
- [ ] `SQLTable` (interface, 5 fields) — `packages/repo-parser/src/sql-extractor.ts`
- [ ] `DependencyInfo` (interface, 3 fields) — `packages/repo-parser/src/types.ts`
- [ ] `FileAnnotation` (interface, 5 fields) — `packages/repo-parser/src/types.ts`
- [ ] `FrameworkDetection` (interface, 4 fields) — `packages/repo-parser/src/types.ts`
- [ ] `ImportEdge` (interface, 2 fields) — `packages/repo-parser/src/types.ts`
- [ ] `LanguageStats` (interface, 4 fields) — `packages/repo-parser/src/types.ts`
- [ ] `ParseResult` (interface, 13 fields) — `packages/repo-parser/src/types.ts`
- [ ] `AccountSummary` (interface, 7 fields) — `packages/snapshots/src/billing-store.ts`
- [ ] `QuotaCheck` (interface, 6 fields) — `packages/snapshots/src/billing-store.ts`
- [ ] `RecentActivity` (interface, 5 fields) — `packages/snapshots/src/billing-store.ts`
- [ ] `SystemStats` (interface, 7 fields) — `packages/snapshots/src/billing-store.ts`
- [ ] `Account` (interface, 5 fields) — `packages/snapshots/src/billing-types.ts`
- [ ] `ApiKey` (interface, 6 fields) — `packages/snapshots/src/billing-types.ts`
- [ ] `PersistenceCreditRecord` (interface, 7 fields) — `packages/snapshots/src/billing-types.ts`
- [ ] `ProgramEntitlement` (interface, 3 fields) — `packages/snapshots/src/billing-types.ts`
- [ ] `TierLimits` (interface, 5 fields) — `packages/snapshots/src/billing-types.ts`
- [ ] `UsageRecord` (interface, 8 fields) — `packages/snapshots/src/billing-types.ts`
- [ ] `UsageSummary` (interface, 5 fields) — `packages/snapshots/src/billing-types.ts`
- [ ] `DbMaintenanceResult` (interface, 3 fields) — `packages/snapshots/src/db.ts`
- [ ] `Migration` (interface, 3 fields) — `packages/snapshots/src/db.ts`
- [ ] `EmailDelivery` (interface, 10 fields) — `packages/snapshots/src/email-store.ts`
- [ ] `EmailMessage` (interface, 4 fields) — `packages/snapshots/src/email-store.ts`
- [ ] `FunnelMetrics` (interface, 8 fields) — `packages/snapshots/src/funnel-store.ts`
- [ ] `FunnelEvent` (interface, 6 fields) — `packages/snapshots/src/funnel-types.ts`
- [ ] `PlanDefinition` (interface, 6 fields) — `packages/snapshots/src/funnel-types.ts`
- [ ] `PlanFeature` (interface, 4 fields) — `packages/snapshots/src/funnel-types.ts`
- [ ] `Seat` (interface, 8 fields) — `packages/snapshots/src/funnel-types.ts`
- [ ] `UpgradePrompt` (interface, 9 fields) — `packages/snapshots/src/funnel-types.ts`
- [ ] `GitHubToken` (interface, 10 fields) — `packages/snapshots/src/github-token-store.ts`
- [ ] `GitHubFetchResult` (interface, 6 fields) — `packages/snapshots/src/github.ts`
- [ ] `ParsedGitHubUrl` (interface, 3 fields) — `packages/snapshots/src/github.ts`
- [ ] `TarParseResult` (interface, 3 fields) — `packages/snapshots/src/github.ts`
- [ ] `GitHubTokenResponse` (interface, 3 fields) — `packages/snapshots/src/oauth-store.ts`
- [ ] `GitHubUser` (interface, 4 fields) — `packages/snapshots/src/oauth-store.ts`
- [ ] `CodeSymbol` (interface, 6 fields) — `packages/snapshots/src/search-store.ts`
- [ ] `SearchIndexEntry` (interface, 3 fields) — `packages/snapshots/src/search-store.ts`
- [ ] `SearchResult` (interface, 4 fields) — `packages/snapshots/src/search-store.ts`
- [ ] `SymbolSearchResult` (interface, 5 fields) — `packages/snapshots/src/search-store.ts`
- [ ] `StripeSubscription` (interface, 12 fields) — `packages/snapshots/src/stripe-store.ts`
- [ ] `ProrationResult` (interface, 6 fields) — `packages/snapshots/src/tier-audit.ts`
- [ ] `TierChange` (interface, 8 fields) — `packages/snapshots/src/tier-audit.ts`
- [ ] `FileEntry` (interface, 3 fields) — `packages/snapshots/src/types.ts`
- [ ] `SnapshotInput` (interface, 4 fields) — `packages/snapshots/src/types.ts`
- [ ] `SnapshotManifest` (interface, 10 fields) — `packages/snapshots/src/types.ts`
- [ ] `SnapshotRecord` (interface, 10 fields) — `packages/snapshots/src/types.ts`
- [ ] `FileDiff` (interface, 4 fields) — `packages/snapshots/src/version-store.ts`
- [ ] `GenerationVersion` (interface, 7 fields) — `packages/snapshots/src/version-store.ts`
- [ ] `VersionDiff` (interface, 8 fields) — `packages/snapshots/src/version-store.ts`
- [ ] `VersionFile` (interface, 2 fields) — `packages/snapshots/src/version-store.ts`
- [ ] `VersionRow` (interface, 7 fields) — `packages/snapshots/src/version-store.ts`
- [ ] `RetryCandidate` (interface, 5 fields) — `packages/snapshots/src/webhook-store.ts`
- [ ] `Webhook` (interface, 8 fields) — `packages/snapshots/src/webhook-store.ts`
- [ ] `WebhookDelivery` (interface, 11 fields) — `packages/snapshots/src/webhook-store.ts`
- [ ] `WebhookRow` (interface, 8 fields) — `packages/snapshots/src/webhook-store.ts`
- [ ] `averypayplatformConfig` (interface, 2 fields) — `payment-processing-output/generated-component.tsx`
- [ ] `Edge` (interface, 3 fields) — `payment-processing-output/generative-sketch.ts`
- [ ] `Node` (interface, 7 fields) — `payment-processing-output/generative-sketch.ts`

## Step 5: Suspect Files (by coupling)

High-coupling files are more likely to be involved in cross-cutting bugs:

| File | Risk | Inbound | Outbound |
|------|------|---------|----------|
| `apps/web/src/api.ts` | 80% | 16 | 0 |
| `apps/web/src/App.tsx` | 75% | 1 | 14 |
| `apps/web/src/pages/DashboardPage.tsx` | 50% | 1 | 9 |
| `apps/web/src/components/Toast.tsx` | 15% | 3 | 0 |
| `apps/web/src/components/AxisIcons.tsx` | 15% | 3 | 0 |
| `apps/web/src/upload-utils.ts` | 15% | 3 | 0 |

## Step 6: Verification

- [ ] Does the fix resolve the original reproduction case?
- [ ] Do all existing tests still pass? (`pnpm test`)
- [ ] Is a new test added for this specific failure mode?
- [ ] Has the fix been reviewed for side effects on 6 coupled hotspot files?

## Step 7: Prevention

- [ ] Add regression test
- [ ] Add monitoring/alerting for this failure class
- [ ] Update incident template if this is a new category
- [ ] Document root cause in team knowledge base
- [ ] ⚠️ **No CI detected** — consider adding automated checks to catch regressions

## Entry Point Source (for Step 2 Isolation)

### `apps/api/src/server.ts`

```typescript
import { Router, createApp } from "./router.js";
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
  handleAlgorithmicGenerate,
  handleGitHubAnalyze,
... (209 more lines)
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
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import type { SnapshotResponse } from "./api.ts";

// ─── Error Boundary ─────────────────────────────────────────────

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("UI crash:", error); }
  render() {
    if (this.state.error) {
      return (
... (261 more lines)
```

### `apps/web/src/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

```

## Suspect File Excerpts (for Step 5)

### `apps/web/src/api.ts` exports

- `export interface SnapshotPayload { ... }`
- `export interface SnapshotResponse { ... }`
- `export interface ContextMap { ... }`
- `export interface RepoProfile { ... }`
- `export interface GeneratedFile { ... }`
- `export interface GeneratedFilesResponse { ... }`
- `export type BillingTier = ...`
- `export interface Account { ... }`
- `export interface ApiKeyInfo { ... }`
- `export interface UsageSummary { ... }`

### `apps/web/src/App.tsx` exports

- `export function App() { ... }`

### `apps/web/src/pages/DashboardPage.tsx` exports

- `export function DashboardPage({ ... }`

## Suspect File Source

### `apps/web/src/api.ts`

```typescript
const API_BASE = import.meta.env.VITE_API_URL ?? "";

// ─── Snapshot types ─────────────────────────────────────────────

export interface SnapshotPayload {
  input_method: string;
  manifest: {
    project_name: string;
    project_type: string;
    frameworks: string[];
    goals: string[];
    requested_outputs: string[];
  };
  files: Array<{ path: string; content: string; size: number }>;
}

export interface SnapshotResponse {
  snapshot_id: string;
  project_id: string;
  status: string;
  context_map: ContextMap;
  repo_profile: RepoProfile;
  generated_files: Array<{ path: string; program: string; description: string }>;
}

... (446 more lines)
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
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import type { SnapshotResponse } from "./api.ts";

// ─── Error Boundary ─────────────────────────────────────────────

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("UI crash:", error); }
  render() {
    if (this.state.error) {
      return (
... (261 more lines)
```

### `apps/web/src/pages/DashboardPage.tsx`

```tsx
import { useState, useEffect } from "react";
import type { SnapshotResponse, GeneratedFile } from "../api.ts";
import { getGeneratedFiles, runProgram, downloadExport } from "../api.ts";
import { OverviewTab } from "../components/OverviewTab.tsx";
import { FilesTab } from "../components/FilesTab.tsx";
import { GraphTab } from "../components/GraphTab.tsx";
import { GeneratedTab } from "../components/GeneratedTab.tsx";
import { ProgramLauncher } from "../components/ProgramLauncher.tsx";
import { SearchTab } from "../components/SearchTab.tsx";
import { useToast } from "../components/Toast.tsx";

interface Props {
  result: SnapshotResponse;
  onGeneratedCountChange?: (count: number) => void;
}

const TABS = ["Overview", "Structure", "Dependencies", "Generated Files", "Programs", "Search"] as const;
type Tab = (typeof TABS)[number];

export function DashboardPage({ result, onGeneratedCountChange }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

... (133 more lines)
```
