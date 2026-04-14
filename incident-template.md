# Incident Report — axis-toolbox

## Environment

| Item | Value |
|------|-------|
| Project | axis-toolbox (monorepo) |
| Language | TypeScript |
| Stack | React ^19.1.0 |
| Deployment | docker |

## Summary

**Date:** YYYY-MM-DD
**Severity:** P0 / P1 / P2 / P3
**Status:** investigating / identified / resolved
**Reporter:**

## Description

<!-- What happened? What was the expected behavior? -->

## Reproduction Steps

1. 
2. 
3. 

## Impact

- **Users affected:**
- **Features affected:**
- **Data impact:**

### Affected Layers

- [ ] **presentation** — apps, frontend

## Root Cause

<!-- What went wrong? Which file/function? -->

### Likely Suspect Files (by coupling risk)

- [ ] `apps/web/src/App.tsx` — 1 inbound, 17 outbound (risk 90%)
- [ ] `apps/web/src/api.ts` — 16 inbound, 0 outbound (risk 80%)
- [ ] `apps/web/src/pages/DashboardPage.tsx` — 1 inbound, 9 outbound (risk 50%)
- [ ] `apps/web/src/components/Toast.tsx` — 3 inbound, 0 outbound (risk 15%)
- [ ] `apps/web/src/components/AxisIcons.tsx` — 3 inbound, 0 outbound (risk 15%)
- [ ] `apps/web/src/upload-utils.ts` — 3 inbound, 0 outbound (risk 15%)

### Domain Entities to Check

- [ ] `AuthContext` (interface, 3 fields) — apps/api/src/billing.ts
- [ ] `EnvSpec` (interface, 5 fields) — apps/api/src/env.ts
- [ ] `ValidationError` (interface, 2 fields) — apps/api/src/env.ts
- [ ] `ValidationResult` (interface, 3 fields) — apps/api/src/env.ts
- [ ] `ZipEntry` (interface, 4 fields) — apps/api/src/export.ts
- [ ] `IntentCapture` (interface, 5 fields) — apps/api/src/mcp-server.ts
- [ ] `JsonRpcRequest` (interface, 4 fields) — apps/api/src/mcp-server.ts
- [ ] `McpCallCounters` (interface, 5 fields) — apps/api/src/mcp-server.ts
- [ ] `RpcError` (interface, 5 fields) — apps/api/src/mcp-server.ts
- [ ] `RpcSuccess` (interface, 3 fields) — apps/api/src/mcp-server.ts
- [ ] `HistogramEntry` (interface, 3 fields) — apps/api/src/metrics.ts
- [ ] `AgentBudget` (interface, 5 fields) — apps/api/src/mpp.ts
- [ ] `CacheKey` (type_alias, 2 fields) — apps/api/src/mpp.ts
- [ ] `ChargeOptions` (type_alias, 5 fields) — apps/api/src/mpp.ts
- [ ] `MppResult` (type_alias, 1 fields) — apps/api/src/mpp.ts
- [ ] `PricingTier` (interface, 4 fields) — apps/api/src/mpp.ts
- [ ] `OpenApiSpec` (interface, 6 fields) — apps/api/src/openapi.ts
- [ ] `WindowEntry` (interface, 2 fields) — apps/api/src/rate-limiter.ts
- [ ] `AppHandle` (interface, 3 fields) — apps/api/src/router.ts
- [ ] `Route` (interface, 4 fields) — apps/api/src/router.ts
- [ ] `CliArgs` (interface, 5 fields) — apps/cli/src/cli.ts
- [ ] `AxisConfig` (interface, 2 fields) — apps/cli/src/credential-store.ts
- [ ] `RunResult` (interface, 4 fields) — apps/cli/src/runner.ts
- [ ] `ScanResult` (interface, 3 fields) — apps/cli/src/scanner.ts
- [ ] `WriteResult` (interface, 3 fields) — apps/cli/src/writer.ts
- [ ] `Account` (interface, 5 fields) — apps/web/src/api.ts
- [ ] `ApiKeyInfo` (interface, 5 fields) — apps/web/src/api.ts
- [ ] `ContextMap` (interface, 8 fields) — apps/web/src/api.ts
- [ ] `GeneratedFile` (interface, 5 fields) — apps/web/src/api.ts
- [ ] `GeneratedFilesResponse` (interface, 6 fields) — apps/web/src/api.ts
- [ ] `PlanDefinition` (interface, 6 fields) — apps/web/src/api.ts
- [ ] `PlanFeature` (interface, 4 fields) — apps/web/src/api.ts
- [ ] `RepoProfile` (interface, 4 fields) — apps/web/src/api.ts
- [ ] `SearchResponse` (interface, 5 fields) — apps/web/src/api.ts
- [ ] `SearchResult` (interface, 4 fields) — apps/web/src/api.ts
- [ ] `Seat` (interface, 7 fields) — apps/web/src/api.ts
- [ ] `SnapshotPayload` (interface, 6 fields) — apps/web/src/api.ts
- [ ] `SnapshotResponse` (interface, 8 fields) — apps/web/src/api.ts
- [ ] `SubscriptionInfo` (interface, 11 fields) — apps/web/src/api.ts
- [ ] `SymbolResult` (interface, 5 fields) — apps/web/src/api.ts
- [ ] `SymbolsResponse` (interface, 3 fields) — apps/web/src/api.ts
- [ ] `UpgradePrompt` (interface, 9 fields) — apps/web/src/api.ts
- [ ] `UsageSummary` (interface, 5 fields) — apps/web/src/api.ts
- [ ] `IconProps` (interface, 5 fields) — apps/web/src/components/AxisIcons.tsx
- [ ] `PaletteAction` (interface, 6 fields) — apps/web/src/components/CommandPalette.tsx
- [ ] `Props` (interface, 1 fields) — apps/web/src/components/CommandPalette.tsx
- [ ] `Props` (interface, 1 fields) — apps/web/src/components/FilesTab.tsx
- [ ] `Props` (interface, 2 fields) — apps/web/src/components/GeneratedTab.tsx
- [ ] `Props` (interface, 1 fields) — apps/web/src/components/GraphTab.tsx
- [ ] `Props` (interface, 2 fields) — apps/web/src/components/OverviewTab.tsx
- [ ] `ProgramDef` (interface, 5 fields) — apps/web/src/components/ProgramLauncher.tsx
- [ ] `Props` (interface, 3 fields) — apps/web/src/components/ProgramLauncher.tsx
- [ ] `Props` (interface, 1 fields) — apps/web/src/components/SearchTab.tsx
- [ ] `Props` (interface, 3 fields) — apps/web/src/components/SignUpModal.tsx
- [ ] `Props` (interface, 2 fields) — apps/web/src/components/StatusBar.tsx
- [ ] `Toast` (interface, 4 fields) — apps/web/src/components/Toast.tsx
- [ ] `ToastContextValue` (interface, 1 fields) — apps/web/src/components/Toast.tsx
- [ ] `Props` (interface, 2 fields) — apps/web/src/pages/DashboardPage.tsx
- [ ] `ProgramDoc` (interface, 13 fields) — apps/web/src/pages/DocsPage.tsx
- [ ] `Example` (interface, 7 fields) — apps/web/src/pages/ExamplesPage.tsx
- [ ] `Step` (interface, 4 fields) — apps/web/src/pages/HelpPage.tsx
- [ ] `TroubleshootItem` (interface, 2 fields) — apps/web/src/pages/HelpPage.tsx
- [ ] `Props` (interface, 2 fields) — apps/web/src/pages/PlansPage.tsx
- [ ] `ProgramDef` (interface, 7 fields) — apps/web/src/pages/ProgramsPage.tsx
- [ ] `Props` (interface, 1 fields) — apps/web/src/pages/ProgramsPage.tsx
- [ ] `QAItem` (interface, 3 fields) — apps/web/src/pages/QAPage.tsx
- [ ] `Section` (interface, 2 fields) — apps/web/src/pages/TermsPage.tsx
- [ ] `Props` (interface, 1 fields) — apps/web/src/pages/UploadPage.tsx
- [ ] `ImportMeta` (interface, 1 fields) — apps/web/src/vite-env.d.ts
- [ ] `ImportMetaEnv` (interface, 1 fields) — apps/web/src/vite-env.d.ts
- [ ] `ContextMap` (interface, 10 fields) — packages/context-engine/src/types.ts
- [ ] `RepoProfile` (interface, 12 fields) — packages/context-engine/src/types.ts
- [ ] `CommerceSignals` (interface, 10 fields) — packages/generator-core/src/generators-agentic-purchasing.ts
- [ ] `Edge` (interface, 3 fields) — packages/generator-core/src/generators-algorithmic.ts
- [ ] `Node` (interface, 7 fields) — packages/generator-core/src/generators-algorithmic.ts
- [ ] `DashboardData` (interface, 6 fields) — packages/generator-core/src/generators-artifacts.ts
- [ ] `MyComponentProps` (interface, 2 fields) — packages/generator-core/src/generators-frontend.ts
- [ ] `RemotionTheme` (interface, 4 fields) — packages/generator-core/src/generators-remotion.ts
- [ ] `GeneratedFile` (interface, 5 fields) — packages/generator-core/src/types.ts
- [ ] `GeneratorInput` (interface, 4 fields) — packages/generator-core/src/types.ts
- [ ] `GeneratorResult` (interface, 6 fields) — packages/generator-core/src/types.ts
- [ ] `SourceFile` (interface, 3 fields) — packages/generator-core/src/types.ts
- [ ] `DomainModel` (interface, 5 fields) — packages/repo-parser/src/domain-extractor.ts
- [ ] `FrameworkRule` (interface, 4 fields) — packages/repo-parser/src/framework-detector.ts
- [ ] `DepGroups` (interface, 3 fields) — packages/repo-parser/src/parser.ts
- [ ] `CreateUserRequest` (interface, 3 fields) — packages/repo-parser/src/perf.bench.ts
- [ ] `SQLTable` (interface, 5 fields) — packages/repo-parser/src/sql-extractor.ts
- [ ] `DependencyInfo` (interface, 3 fields) — packages/repo-parser/src/types.ts
- [ ] `FileAnnotation` (interface, 5 fields) — packages/repo-parser/src/types.ts
- [ ] `FrameworkDetection` (interface, 4 fields) — packages/repo-parser/src/types.ts
- [ ] `ImportEdge` (interface, 2 fields) — packages/repo-parser/src/types.ts
- [ ] `LanguageStats` (interface, 4 fields) — packages/repo-parser/src/types.ts
- [ ] `ParseResult` (interface, 13 fields) — packages/repo-parser/src/types.ts
- [ ] `AccountSummary` (interface, 7 fields) — packages/snapshots/src/billing-store.ts
- [ ] `QuotaCheck` (interface, 6 fields) — packages/snapshots/src/billing-store.ts
- [ ] `RecentActivity` (interface, 5 fields) — packages/snapshots/src/billing-store.ts
- [ ] `SystemStats` (interface, 7 fields) — packages/snapshots/src/billing-store.ts
- [ ] `Account` (interface, 5 fields) — packages/snapshots/src/billing-types.ts
- [ ] `ApiKey` (interface, 6 fields) — packages/snapshots/src/billing-types.ts
- [ ] `PersistenceCreditRecord` (interface, 7 fields) — packages/snapshots/src/billing-types.ts
- [ ] `ProgramEntitlement` (interface, 3 fields) — packages/snapshots/src/billing-types.ts
- [ ] `TierLimits` (interface, 5 fields) — packages/snapshots/src/billing-types.ts
- [ ] `UsageRecord` (interface, 8 fields) — packages/snapshots/src/billing-types.ts
- [ ] `UsageSummary` (interface, 5 fields) — packages/snapshots/src/billing-types.ts
- [ ] `DbMaintenanceResult` (interface, 3 fields) — packages/snapshots/src/db.ts
- [ ] `Migration` (interface, 3 fields) — packages/snapshots/src/db.ts
- [ ] `EmailDelivery` (interface, 10 fields) — packages/snapshots/src/email-store.ts
- [ ] `EmailMessage` (interface, 4 fields) — packages/snapshots/src/email-store.ts
- [ ] `FunnelMetrics` (interface, 8 fields) — packages/snapshots/src/funnel-store.ts
- [ ] `FunnelEvent` (interface, 6 fields) — packages/snapshots/src/funnel-types.ts
- [ ] `PlanDefinition` (interface, 6 fields) — packages/snapshots/src/funnel-types.ts
- [ ] `PlanFeature` (interface, 4 fields) — packages/snapshots/src/funnel-types.ts
- [ ] `Seat` (interface, 8 fields) — packages/snapshots/src/funnel-types.ts
- [ ] `UpgradePrompt` (interface, 9 fields) — packages/snapshots/src/funnel-types.ts
- [ ] `GitHubToken` (interface, 10 fields) — packages/snapshots/src/github-token-store.ts
- [ ] `GitHubFetchResult` (interface, 6 fields) — packages/snapshots/src/github.ts
- [ ] `ParsedGitHubUrl` (interface, 3 fields) — packages/snapshots/src/github.ts
- [ ] `TarParseResult` (interface, 3 fields) — packages/snapshots/src/github.ts
- [ ] `GitHubTokenResponse` (interface, 3 fields) — packages/snapshots/src/oauth-store.ts
- [ ] `GitHubUser` (interface, 4 fields) — packages/snapshots/src/oauth-store.ts
- [ ] `ReferralCode` (interface, 3 fields) — packages/snapshots/src/referral-store.ts
- [ ] `ReferralConversion` (interface, 4 fields) — packages/snapshots/src/referral-store.ts
- [ ] `ReferralCredits` (interface, 6 fields) — packages/snapshots/src/referral-store.ts
- [ ] `CodeSymbol` (interface, 6 fields) — packages/snapshots/src/search-store.ts
- [ ] `SearchIndexEntry` (interface, 3 fields) — packages/snapshots/src/search-store.ts
- [ ] `SearchResult` (interface, 4 fields) — packages/snapshots/src/search-store.ts
- [ ] `SymbolSearchResult` (interface, 5 fields) — packages/snapshots/src/search-store.ts
- [ ] `StripeSubscription` (interface, 12 fields) — packages/snapshots/src/stripe-store.ts
- [ ] `ProrationResult` (interface, 6 fields) — packages/snapshots/src/tier-audit.ts
- [ ] `TierChange` (interface, 8 fields) — packages/snapshots/src/tier-audit.ts
- [ ] `FileEntry` (interface, 3 fields) — packages/snapshots/src/types.ts
- [ ] `SnapshotInput` (interface, 4 fields) — packages/snapshots/src/types.ts
- [ ] `SnapshotManifest` (interface, 10 fields) — packages/snapshots/src/types.ts
- [ ] `SnapshotRecord` (interface, 10 fields) — packages/snapshots/src/types.ts
- [ ] `FileDiff` (interface, 4 fields) — packages/snapshots/src/version-store.ts
- [ ] `GenerationVersion` (interface, 7 fields) — packages/snapshots/src/version-store.ts
- [ ] `VersionDiff` (interface, 8 fields) — packages/snapshots/src/version-store.ts
- [ ] `VersionFile` (interface, 2 fields) — packages/snapshots/src/version-store.ts
- [ ] `VersionRow` (interface, 7 fields) — packages/snapshots/src/version-store.ts
- [ ] `RetryCandidate` (interface, 5 fields) — packages/snapshots/src/webhook-store.ts
- [ ] `Webhook` (interface, 8 fields) — packages/snapshots/src/webhook-store.ts
- [ ] `WebhookDelivery` (interface, 11 fields) — packages/snapshots/src/webhook-store.ts
- [ ] `WebhookRow` (interface, 8 fields) — packages/snapshots/src/webhook-store.ts
- [ ] `averypayplatformConfig` (interface, 2 fields) — payment-processing-output/generated-component.tsx
- [ ] `Edge` (interface, 3 fields) — payment-processing-output/generative-sketch.ts
- [ ] `Node` (interface, 7 fields) — payment-processing-output/generative-sketch.ts

## Fix

- **Commit:**
- **PR:**
- **Test added:** yes / no

## Timeline

| Time | Event |
|------|-------|
| | Issue reported |
| | Investigation started |
| | Root cause identified |
| | Fix deployed |
| | Verified resolved |

## Follow-up

- [ ] Post-mortem completed
- [ ] Monitoring added
- [ ] Documentation updated
- [ ] Regression test added (vitest)

---
*Generated by Axis Debug*

## Suspect File Excerpts

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
import { ForAgentsPage } from "./pages/ForAgentsPage.tsx";
import { ExamplesPage } from "./pages/ExamplesPage.tsx";
import { InstallPage } from "./pages/InstallPage.tsx";
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
... (293 more lines)
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

function NextStepsCard({ fileCount, onDownload, downloading }: { fileCount: number; onDownload: () => void; downloading: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || fileCount === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: "3px solid var(--accent)", padding: "16px 20px" }}>
... (155 more lines)
```

## Entry Point Excerpts

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
... (301 more lines)
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
import { ForAgentsPage } from "./pages/ForAgentsPage.tsx";
import { ExamplesPage } from "./pages/ExamplesPage.tsx";
import { InstallPage } from "./pages/InstallPage.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import type { SnapshotResponse } from "./api.ts";

// ─── Error Boundary ─────────────────────────────────────────────
... (298 more lines)
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
