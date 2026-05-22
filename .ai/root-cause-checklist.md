# Root Cause Checklist — axis-iliad

> monorepo | TypeScript | 500 files | 133,098 LOC

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
- [ ] `npm test` — do existing tests pass? (vitest)

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
- [ ] `PullRequestPayload` (interface, 5 fields) — `apps/api/src/github-webhook.ts`
- [ ] `PushPayload` (interface, 7 fields) — `apps/api/src/github-webhook.ts`
- [ ] `SnapshotTarget` (interface, 5 fields) — `apps/api/src/github-webhook.ts`
- [ ] `FirecrawlCrawlRequest` (interface, 5 fields) — `apps/api/src/handlers.ts`
- [ ] `FirecrawlCrawlResponse` (interface, 4 fields) — `apps/api/src/handlers.ts`
- [ ] `FirecrawlScrapeRequest` (interface, 6 fields) — `apps/api/src/handlers.ts`
- [ ] `FirecrawlScrapeResponse` (interface, 5 fields) — `apps/api/src/handlers.ts`
- [ ] `IntentCapture` (interface, 5 fields) — `apps/api/src/mcp-server.ts`
- [ ] `JsonRpcRequest` (interface, 4 fields) — `apps/api/src/mcp-server.ts`
- [ ] `McpCallCounters` (interface, 5 fields) — `apps/api/src/mcp-server.ts`
- [ ] `PlannedCapability` (interface, 7 fields) — `apps/api/src/mcp-server.ts`
- [ ] `RpcError` (interface, 5 fields) — `apps/api/src/mcp-server.ts`
- [ ] `RpcSuccess` (interface, 3 fields) — `apps/api/src/mcp-server.ts`
- [ ] `HistogramEntry` (interface, 3 fields) — `apps/api/src/metrics.ts`
- [ ] `CacheKey` (type_alias, 2 fields) — `apps/api/src/mpp.ts`
- [ ] `OAuthClientRow` (interface, 3 fields) — `apps/api/src/oauth-server-simple.ts`
- [ ] `PresignOptions` (interface, 5 fields) — `apps/api/src/object-storage.ts`
- [ ] `PresignResult` (interface, 5 fields) — `apps/api/src/object-storage.ts`
- [ ] `R2Config` (interface, 4 fields) — `apps/api/src/object-storage.ts`
- [ ] `OpenApiSpec` (interface, 6 fields) — `apps/api/src/openapi.ts`
- [ ] `CreateIntentInput` (interface, 3 fields) — `apps/api/src/paid-client.ts`
- [ ] `CreateSubscriptionInput` (interface, 3 fields) — `apps/api/src/paid-client.ts`
- [ ] `PaidConfig` (interface, 6 fields) — `apps/api/src/paid-client.ts`
- [ ] `PaymentIntent` (interface, 6 fields) — `apps/api/src/paid-client.ts`
- [ ] `Subscription` (interface, 4 fields) — `apps/api/src/paid-client.ts`
- [ ] `VerifyWebhookOptions` (interface, 4 fields) — `apps/api/src/paid-client.ts`
- [ ] `WindowEntry` (interface, 2 fields) — `apps/api/src/rate-limiter.ts`
- [ ] `AppHandle` (interface, 3 fields) — `apps/api/src/router.ts`
- [ ] `Route` (interface, 4 fields) — `apps/api/src/router.ts`
- [ ] `QueryOptions` (interface, 3 fields) — `apps/api/src/vector-db.ts`
- [ ] `VectorMatch` (interface, 3 fields) — `apps/api/src/vector-db.ts`
- [ ] `VectorRecord` (interface, 3 fields) — `apps/api/src/vector-db.ts`
- [ ] `CliArgs` (interface, 5 fields) — `apps/cli/src/cli.ts`
- [ ] `AxisConfig` (interface, 2 fields) — `apps/cli/src/credential-store.ts`
- [ ] `RunResult` (interface, 4 fields) — `apps/cli/src/runner.ts`
- [ ] `ScanResult` (interface, 3 fields) — `apps/cli/src/scanner.ts`
- [ ] `WriteResult` (interface, 3 fields) — `apps/cli/src/writer.ts`
- [ ] `Account` (interface, 5 fields) — `apps/web/src/api.ts`
- [ ] `AdminAccountsResponse` (interface, 4 fields) — `apps/web/src/api.ts`
- [ ] `AdminAccountSummary` (interface, 5 fields) — `apps/web/src/api.ts`
- [ ] `AdminActivityEvent` (interface, 6 fields) — `apps/web/src/api.ts`
- [ ] `AdminActivityResponse` (interface, 2 fields) — `apps/web/src/api.ts`
- [ ] `AdminStats` (interface, 5 fields) — `apps/web/src/api.ts`
- [ ] `ApiEndpointUsage` (interface, 4 fields) — `apps/web/src/api.ts`
- [ ] `ApiKeyInfo` (interface, 5 fields) — `apps/web/src/api.ts`
- [ ] `ApiStatusUsage` (interface, 2 fields) — `apps/web/src/api.ts`
- [ ] `ContextMap` (interface, 8 fields) — `apps/web/src/api.ts`
- [ ] `CrawlPage` (interface, 3 fields) — `apps/web/src/api.ts`
- [ ] `CrawlResult` (interface, 4 fields) — `apps/web/src/api.ts`
- [ ] `CreditsInfo` (interface, 7 fields) — `apps/web/src/api.ts`
- [ ] `FunnelMetrics` (interface, 8 fields) — `apps/web/src/api.ts`
- [ ] `GeneratedFile` (interface, 5 fields) — `apps/web/src/api.ts`
- [ ] `GeneratedFilesResponse` (interface, 6 fields) — `apps/web/src/api.ts`
- [ ] `MyAnalyticsSummary` (interface, 11 fields) — `apps/web/src/api.ts`
- [ ] `PlanDefinition` (interface, 6 fields) — `apps/web/src/api.ts`
- [ ] `PlanFeature` (interface, 6 fields) — `apps/web/src/api.ts`
- [ ] `RepoProfile` (interface, 4 fields) — `apps/web/src/api.ts`
- [ ] `ScrapeResult` (interface, 4 fields) — `apps/web/src/api.ts`
- [ ] `SearchResponse` (interface, 5 fields) — `apps/web/src/api.ts`
- [ ] `SearchResult` (interface, 4 fields) — `apps/web/src/api.ts`
- [ ] `Seat` (interface, 7 fields) — `apps/web/src/api.ts`
- [ ] `SnapshotPayload` (interface, 6 fields) — `apps/web/src/api.ts`
- [ ] `SnapshotResponse` (interface, 8 fields) — `apps/web/src/api.ts`
- [ ] `SubscriptionInfo` (interface, 12 fields) — `apps/web/src/api.ts`
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
- [ ] `ToolPageProps` (interface, 11 fields) — `apps/web/src/components/ToolPage.tsx`
- [ ] `ToolPricing` (interface, 5 fields) — `apps/web/src/components/ToolPage.tsx`
- [ ] `Props` (interface, 4 fields) — `apps/web/src/components/UpsellModal.tsx`
- [ ] `Props` (interface, 2 fields) — `apps/web/src/pages/DashboardPage.tsx`
- [ ] `ProgramDoc` (interface, 13 fields) — `apps/web/src/pages/DocsPage.tsx`
- [ ] `Example` (interface, 7 fields) — `apps/web/src/pages/ExamplesPage.tsx`
- [ ] `Step` (interface, 4 fields) — `apps/web/src/pages/HelpPage.tsx`
- [ ] `TroubleshootItem` (interface, 2 fields) — `apps/web/src/pages/HelpPage.tsx`
- [ ] `StrategyItem` (interface, 3 fields) — `apps/web/src/pages/MyAnalyticsPage.tsx`
- [ ] `Props` (interface, 2 fields) — `apps/web/src/pages/PlansPage.tsx`
- [ ] `ProgramDef` (interface, 7 fields) — `apps/web/src/pages/ProgramsPage.tsx`
- [ ] `Props` (interface, 1 fields) — `apps/web/src/pages/ProgramsPage.tsx`
- [ ] `QAItem` (interface, 3 fields) — `apps/web/src/pages/QAPage.tsx`
- [ ] `Section` (interface, 2 fields) — `apps/web/src/pages/TermsPage.tsx`
- [ ] `Props` (interface, 1 fields) — `apps/web/src/pages/tools/WebResearchPage.tsx`
- [ ] `Props` (interface, 1 fields) — `apps/web/src/pages/ToolsIndexPage.tsx`
- [ ] `ToolCatalogEntry` (interface, 8 fields) — `apps/web/src/pages/ToolsIndexPage.tsx`
- [ ] `Props` (interface, 1 fields) — `apps/web/src/pages/UploadPage.tsx`
- [ ] `ImportMeta` (interface, 1 fields) — `apps/web/src/vite-env.d.ts`
- [ ] `ImportMetaEnv` (interface, 1 fields) — `apps/web/src/vite-env.d.ts`
- [ ] `DashboardData` (interface, 6 fields) — `dashboard-widget.tsx`
- [ ] `AgentBudget` (interface, 0 fields) — `embed-snippet.ts`
- [ ] `Build402Options` (interface, 0 fields) — `embed-snippet.ts`
- [ ] `PricingTier` (interface, 0 fields) — `embed-snippet.ts`
- [ ] `axisiliadProps` (interface, 3 fields) — `generated-component.tsx`
- [ ] `PaletteAction` (interface, 0 fields) — `generated-component.tsx`
- [ ] `Edge` (interface, 3 fields) — `generative-sketch.ts`
- [ ] `Node` (interface, 7 fields) — `generative-sketch.ts`
- [ ] `ContextMap` (interface, 10 fields) — `packages/context-engine/src/types.ts`
- [ ] `RepoProfile` (interface, 12 fields) — `packages/context-engine/src/types.ts`
- [ ] `CommerceSignals` (interface, 10 fields) — `packages/generator-core/src/generators-agentic-purchasing.ts`
- [ ] `ComplianceGradeResult` (interface, 3 fields) — `packages/generator-core/src/generators-agentic-purchasing.ts`
- [ ] `Edge` (interface, 3 fields) — `packages/generator-core/src/generators-algorithmic.ts`
- [ ] `Node` (interface, 7 fields) — `packages/generator-core/src/generators-algorithmic.ts`
- [ ] `DashboardData` (interface, 6 fields) — `packages/generator-core/src/generators-artifacts.ts`
- [ ] `Entry` (type_alias, 2 fields) — `packages/generator-core/src/generators-artifacts.ts`
- [ ] `Model` (type_alias, 4 fields) — `packages/generator-core/src/generators-artifacts.ts`
- [ ] `ResellCapability` (interface, 10 fields) — `packages/generator-core/src/generators-artifacts.ts`
- [ ] `ResellProvider` (interface, 3 fields) — `packages/generator-core/src/generators-artifacts.ts`
- [ ] `Route` (type_alias, 3 fields) — `packages/generator-core/src/generators-artifacts.ts`
- [ ] `BrandingConfig` (interface, 3 fields) — `packages/generator-core/src/generators-closer.ts`
- [ ] `MerkleBundle` (interface, 3 fields) — `packages/generator-core/src/generators-closer.ts`
- [ ] `ProjectSignals` (interface, 10 fields) — `packages/generator-core/src/generators-closer.ts`
- [ ] `MyComponentProps` (interface, 2 fields) — `packages/generator-core/src/generators-frontend.ts`
- [ ] `CancelParams` (interface, 1 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `CancelRequest` (type_alias, 2 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `CapabilityAdvertisement` (interface, 5 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ClientInfo` (interface, 2 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `InitializeParams` (interface, 3 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `InitializeResult` (interface, 3 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `InitializeResult` (type_alias, 4 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `JsonRpcError` (type_alias, 5 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `JsonRpcErrorObject` (interface, 3 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `JsonRpcErrorResponse` (interface, 3 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `JsonRpcRequest` (type_alias, 4 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `JsonRpcSuccess` (type_alias, 3 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ProgressNotification` (type_alias, 4 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ProgressParams` (interface, 3 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `PromptArgument` (interface, 3 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `PromptDefinition` (interface, 3 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `PromptGetParams` (interface, 2 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `PromptGetResult` (interface, 1 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `PromptMessage` (interface, 2 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `RegisteredSchema` (interface, 3 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ResourceContent` (interface, 4 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ResourceDefinition` (interface, 4 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ResourceReadParams` (interface, 1 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ResourceReadResult` (interface, 1 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ResourcesListResult` (interface, 2 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ResourceTemplate` (interface, 4 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ServerInfo` (interface, 2 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `SessionContext` (interface, 4 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `StandardSchemaV1` (interface, 3 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `StandardSchemaV1` (type_alias, 6 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ToolCall` (type_alias, 2 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ToolCallResult` (interface, 3 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ToolContentBlock` (interface, 4 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ToolDefinition` (interface, 4 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ToolDefinition` (type_alias, 4 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ToolSchema` (interface, 4 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `ToolsListResult` (interface, 1 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `TransportAdapter` (interface, 0 fields) — `packages/generator-core/src/generators-mcp.ts`
- [ ] `RemotionTheme` (interface, 4 fields) — `packages/generator-core/src/generators-remotion.ts`
- [ ] `GeneratedFile` (interface, 5 fields) — `packages/generator-core/src/types.ts`
- [ ] `GeneratorInput` (interface, 4 fields) — `packages/generator-core/src/types.ts`
- [ ] `GeneratorResult` (interface, 6 fields) — `packages/generator-core/src/types.ts`
- [ ] `SourceFile` (interface, 3 fields) — `packages/generator-core/src/types.ts`
- [ ] `AgentBudget` (interface, 5 fields) — `packages/mpp/src/index.ts`
- [ ] `Build402Options` (interface, 2 fields) — `packages/mpp/src/index.ts`
- [ ] `ChargeOptions` (type_alias, 5 fields) — `packages/mpp/src/index.ts`
- [ ] `MppResult` (type_alias, 1 fields) — `packages/mpp/src/index.ts`
- [ ] `PricingTier` (interface, 4 fields) — `packages/mpp/src/index.ts`
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
- [ ] `AnalyzeFilesInput` (interface, 5 fields) — `packages/sdk/src/index.ts`
- [ ] `AnalyzeRepoInput` (interface, 1 fields) — `packages/sdk/src/index.ts`
- [ ] `ArtifactEntry` (interface, 3 fields) — `packages/sdk/src/index.ts`
- [ ] `AxisClientOptions` (interface, 3 fields) — `packages/sdk/src/index.ts`
- [ ] `FileEntry` (interface, 2 fields) — `packages/sdk/src/index.ts`
- [ ] `HealthResponse` (interface, 4 fields) — `packages/sdk/src/index.ts`
- [ ] `McpToolCallResult` (interface, 5 fields) — `packages/sdk/src/index.ts`
- [ ] `OpenApiSpec` (interface, 4 fields) — `packages/sdk/src/index.ts`
- [ ] `SnapshotResult` (interface, 7 fields) — `packages/sdk/src/index.ts`
- [ ] `AccountApiAnalyticsSummary` (interface, 7 fields) — `packages/snapshots/src/billing-store.ts`
- [ ] `AccountSummary` (interface, 7 fields) — `packages/snapshots/src/billing-store.ts`
- [ ] `ApiEndpointUsage` (interface, 4 fields) — `packages/snapshots/src/billing-store.ts`
- [ ] `ApiStatusUsage` (interface, 2 fields) — `packages/snapshots/src/billing-store.ts`
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
- [ ] `PlanFeature` (interface, 6 fields) — `packages/snapshots/src/funnel-types.ts`
- [ ] `Seat` (interface, 8 fields) — `packages/snapshots/src/funnel-types.ts`
- [ ] `UpgradePrompt` (interface, 9 fields) — `packages/snapshots/src/funnel-types.ts`
- [ ] `GitHubToken` (interface, 10 fields) — `packages/snapshots/src/github-token-store.ts`
- [ ] `GitHubFetchResult` (interface, 6 fields) — `packages/snapshots/src/github.ts`
- [ ] `ParsedGitHubUrl` (interface, 3 fields) — `packages/snapshots/src/github.ts`
- [ ] `TarParseResult` (interface, 3 fields) — `packages/snapshots/src/github.ts`
- [ ] `GitHubTokenResponse` (interface, 3 fields) — `packages/snapshots/src/oauth-store.ts`
- [ ] `GitHubUser` (interface, 4 fields) — `packages/snapshots/src/oauth-store.ts`
- [ ] `ReferralCode` (interface, 3 fields) — `packages/snapshots/src/referral-store.ts`
- [ ] `ReferralConversion` (interface, 4 fields) — `packages/snapshots/src/referral-store.ts`
- [ ] `ReferralCredits` (interface, 8 fields) — `packages/snapshots/src/referral-store.ts`
- [ ] `ReferralTokenUsageModifier` (interface, 3 fields) — `packages/snapshots/src/referral-store.ts`
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
- [ ] `UsageCreditChargeResult` (interface, 5 fields) — `packages/snapshots/src/usage-credit-metering.ts`
- [ ] `UsageCreditSummary` (interface, 6 fields) — `packages/snapshots/src/usage-credit-metering.ts`
- [ ] `FileDiff` (interface, 4 fields) — `packages/snapshots/src/version-store.ts`
- [ ] `GenerationVersion` (interface, 7 fields) — `packages/snapshots/src/version-store.ts`
- [ ] `VersionDiff` (interface, 8 fields) — `packages/snapshots/src/version-store.ts`
- [ ] `VersionFile` (interface, 2 fields) — `packages/snapshots/src/version-store.ts`
- [ ] `VersionRow` (interface, 7 fields) — `packages/snapshots/src/version-store.ts`
- [ ] `RetryCandidate` (interface, 5 fields) — `packages/snapshots/src/webhook-store.ts`
- [ ] `Webhook` (interface, 8 fields) — `packages/snapshots/src/webhook-store.ts`
- [ ] `WebhookDelivery` (interface, 11 fields) — `packages/snapshots/src/webhook-store.ts`
- [ ] `WebhookRow` (interface, 8 fields) — `packages/snapshots/src/webhook-store.ts`

## Step 5: Suspect Files (by coupling)

High-coupling files are more likely to be involved in cross-cutting bugs:

| File | Risk | Inbound | Outbound |
|------|------|---------|----------|
| `apps/web/src/App.tsx` | 100% | 1 | 21 |
| `apps/web/src/api.ts` | 95% | 19 | 0 |
| `apps/web/src/pages.test.tsx` | 85% | 0 | 17 |
| `apps/web/src/pages/DashboardPage.tsx` | 55% | 1 | 10 |
| `apps/web/src/components/Toast.tsx` | 20% | 4 | 0 |
| `apps/web/src/components/AxisIcons.tsx` | 20% | 4 | 0 |
| `apps/web/src/upload-utils.ts` | 15% | 3 | 0 |

## Step 6: Verification

- [ ] Does the fix resolve the original reproduction case?
- [ ] Do all existing tests still pass? (`npm test`)
- [ ] Is a new test added for this specific failure mode?
- [ ] Has the fix been reviewed for side effects on 7 coupled hotspot files?
- [ ] Does CI pass? (github_actions)

## Step 7: Prevention

- [ ] Add regression test
- [ ] Add monitoring/alerting for this failure class
- [ ] Update incident template if this is a new category
- [ ] Document root cause in team knowledge base

## Entry Point Source (for Step 2 Isolation)

### `apps/api/src/server.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";
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
... (433 more lines)
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
import { AdminPage } from "./pages/AdminPage.tsx";
import { MyAnalyticsPage } from "./pages/MyAnalyticsPage.tsx";
import { ToolsIndexPage } from "./pages/ToolsIndexPage.tsx";
import { WebResearchPage } from "./pages/tools/WebResearchPage.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import { getAdminStats, ApiError, type SnapshotResponse } from "./api.ts";

// ─── Error Boundary ─────────────────────────────────────────────
// React requires a class for getDerivedStateFromError; this thin wrapper
... (465 more lines)
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

## Suspect File Source

### `apps/web/src/api.ts`

```typescript
const PROD_API_BASE = "https://axis-api-6c7z.onrender.com";
const isLocalHost =
  typeof window === "undefined" ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";
const API_BASE = import.meta.env.VITE_API_URL ?? (isLocalHost ? "" : PROD_API_BASE);

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
... (696 more lines)
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
import { AdminPage } from "./pages/AdminPage.tsx";
import { MyAnalyticsPage } from "./pages/MyAnalyticsPage.tsx";
import { ToolsIndexPage } from "./pages/ToolsIndexPage.tsx";
import { WebResearchPage } from "./pages/tools/WebResearchPage.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import { getAdminStats, ApiError, type SnapshotResponse } from "./api.ts";

// ─── Error Boundary ─────────────────────────────────────────────
// React requires a class for getDerivedStateFromError; this thin wrapper
... (465 more lines)
```

### `apps/web/src/pages.test.tsx`

```tsx
/**
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// ─── Zero-prop page smoke tests ─────────────────────────────────
// Each test renders the page and verifies it mounts without throwing.

import { DocsPage } from "./pages/DocsPage";
import { ExamplesPage } from "./pages/ExamplesPage";
import { ForAgentsPage } from "./pages/ForAgentsPage";
import { HelpPage } from "./pages/HelpPage";
import { InstallPage } from "./pages/InstallPage";
import { QAPage } from "./pages/QAPage";
import { TermsPage } from "./pages/TermsPage";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith("/v1/plans")) {
      return {
        ok: true,
... (137 more lines)
```
