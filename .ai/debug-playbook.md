# Debug Playbook — axis-toolbox

> Structured debugging guide for a monorepo built with TypeScript

> AI-native development operating system. Upload or point at any codebase — get 86 generated artifacts across 18 specialized programs: context maps, debug playbooks, governance files, design tokens, SEO analysis, brand systems, and more.

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 500 files across 20 top-level directories. It defines 151 domain models.

## Quick Reference

| Item | Value |
|------|-------|
| Language | TypeScript |
| Frameworks | React ^19.1.0 (95%) |
| Test Runner | vitest |
| Build Tools | vite |
| CI | github_actions |
| Deploy Target | docker |
| Package Manager | pnpm |
| Files | 500 files, 114,124 LOC |
| Separation Score | 0.64/1.0 |

## Language Distribution

| Language | Files | LOC | % |
|----------|-------|-----|---|
| TypeScript | 249 | 78,349 | 69.5% |
| JSON | 63 | 12,501 | 11.1% |
| YAML | 68 | 10,876 | 9.7% |
| Markdown | 107 | 9,249 | 8.2% |
| CSS | 2 | 849 | 0.8% |
| JavaScript | 3 | 673 | 0.6% |
| HTML | 1 | 116 | 0.1% |
| Dockerfile | 1 | 49 | 0% |
| PowerShell | 1 | 21 | 0% |
| Shell | 1 | 14 | 0% |

## Detected Stack (with evidence)

### React v^19.1.0 — 95% confidence

- package.json: react@^19.1.0

## Project Structure

- packages/ (monorepo_packages)
- apps/ (monorepo_apps)
- payment-processing-output/ (project_directory)
- examples/ (project_directory)
- search/ (project_directory)
- algorithmic/ (project_directory)
- artifacts/ (project_directory)
- brand/ (project_directory)

## Triage Steps

### 1. Reproduce

```bash
pnpm install
pnpm test           # run existing tests (vitest)
pnpm run dev         # start dev server
```

### 2. Isolate

Check these files first based on the dependency graph:


### High-Risk Files (Dependency Hotspots)

These files have many inbound or outbound imports — changes here cascade:

| File | Inbound | Outbound | Risk |
|------|---------|----------|------|
| `apps/web/src/App.tsx` | 1 | 17 | 90% |
| `apps/web/src/api.ts` | 16 | 0 | 80% |
| `apps/web/src/pages/DashboardPage.tsx` | 1 | 9 | 50% |
| `apps/web/src/components/Toast.tsx` | 3 | 0 | 15% |
| `apps/web/src/components/AxisIcons.tsx` | 3 | 0 | 15% |
| `apps/web/src/upload-utils.ts` | 3 | 0 | 15% |

### 3. Framework-Specific Debugging

#### React

- **State bugs:** Check for stale closures in `useEffect` and `useCallback`
- **Re-render loops:** Add `React.StrictMode` (already on if using Next.js)
- **Props drilling:** Check component hierarchy for unnecessary prop chains

## Domain Model Inventory

Key entities — bugs often involve state transitions or relationship integrity:

| Model | Kind | Language | Fields | Source |
|-------|------|----------|--------|--------|
| AuthContext | interface | TypeScript | 3 | `apps/api/src/billing.ts` |
| EnvSpec | interface | TypeScript | 5 | `apps/api/src/env.ts` |
| ValidationError | interface | TypeScript | 2 | `apps/api/src/env.ts` |
| ValidationResult | interface | TypeScript | 3 | `apps/api/src/env.ts` |
| ZipEntry | interface | TypeScript | 4 | `apps/api/src/export.ts` |
| IntentCapture | interface | TypeScript | 5 | `apps/api/src/mcp-server.ts` |
| JsonRpcRequest | interface | TypeScript | 4 | `apps/api/src/mcp-server.ts` |
| McpCallCounters | interface | TypeScript | 5 | `apps/api/src/mcp-server.ts` |
| RpcError | interface | TypeScript | 5 | `apps/api/src/mcp-server.ts` |
| RpcSuccess | interface | TypeScript | 3 | `apps/api/src/mcp-server.ts` |
| HistogramEntry | interface | TypeScript | 3 | `apps/api/src/metrics.ts` |
| AgentBudget | interface | TypeScript | 5 | `apps/api/src/mpp.ts` |
| CacheKey | type_alias | TypeScript | 2 | `apps/api/src/mpp.ts` |
| ChargeOptions | type_alias | TypeScript | 5 | `apps/api/src/mpp.ts` |
| MppResult | type_alias | TypeScript | 1 | `apps/api/src/mpp.ts` |
| PricingTier | interface | TypeScript | 4 | `apps/api/src/mpp.ts` |
| OpenApiSpec | interface | TypeScript | 6 | `apps/api/src/openapi.ts` |
| WindowEntry | interface | TypeScript | 2 | `apps/api/src/rate-limiter.ts` |
| AppHandle | interface | TypeScript | 3 | `apps/api/src/router.ts` |
| Route | interface | TypeScript | 4 | `apps/api/src/router.ts` |
| CliArgs | interface | TypeScript | 5 | `apps/cli/src/cli.ts` |
| AxisConfig | interface | TypeScript | 2 | `apps/cli/src/credential-store.ts` |
| RunResult | interface | TypeScript | 4 | `apps/cli/src/runner.ts` |
| ScanResult | interface | TypeScript | 3 | `apps/cli/src/scanner.ts` |
| WriteResult | interface | TypeScript | 3 | `apps/cli/src/writer.ts` |
| Account | interface | TypeScript | 5 | `apps/web/src/api.ts` |
| ApiKeyInfo | interface | TypeScript | 5 | `apps/web/src/api.ts` |
| ContextMap | interface | TypeScript | 8 | `apps/web/src/api.ts` |
| GeneratedFile | interface | TypeScript | 5 | `apps/web/src/api.ts` |
| GeneratedFilesResponse | interface | TypeScript | 6 | `apps/web/src/api.ts` |
| PlanDefinition | interface | TypeScript | 6 | `apps/web/src/api.ts` |
| PlanFeature | interface | TypeScript | 4 | `apps/web/src/api.ts` |
| RepoProfile | interface | TypeScript | 4 | `apps/web/src/api.ts` |
| SearchResponse | interface | TypeScript | 5 | `apps/web/src/api.ts` |
| SearchResult | interface | TypeScript | 4 | `apps/web/src/api.ts` |
| Seat | interface | TypeScript | 7 | `apps/web/src/api.ts` |
| SnapshotPayload | interface | TypeScript | 6 | `apps/web/src/api.ts` |
| SnapshotResponse | interface | TypeScript | 8 | `apps/web/src/api.ts` |
| SubscriptionInfo | interface | TypeScript | 11 | `apps/web/src/api.ts` |
| SymbolResult | interface | TypeScript | 5 | `apps/web/src/api.ts` |
| SymbolsResponse | interface | TypeScript | 3 | `apps/web/src/api.ts` |
| UpgradePrompt | interface | TypeScript | 9 | `apps/web/src/api.ts` |
| UsageSummary | interface | TypeScript | 5 | `apps/web/src/api.ts` |
| IconProps | interface | TypeScript | 5 | `apps/web/src/components/AxisIcons.tsx` |
| PaletteAction | interface | TypeScript | 6 | `apps/web/src/components/CommandPalette.tsx` |
| Props | interface | TypeScript | 1 | `apps/web/src/components/CommandPalette.tsx` |
| Props | interface | TypeScript | 1 | `apps/web/src/components/FilesTab.tsx` |
| Props | interface | TypeScript | 2 | `apps/web/src/components/GeneratedTab.tsx` |
| Props | interface | TypeScript | 1 | `apps/web/src/components/GraphTab.tsx` |
| Props | interface | TypeScript | 2 | `apps/web/src/components/OverviewTab.tsx` |
| ProgramDef | interface | TypeScript | 5 | `apps/web/src/components/ProgramLauncher.tsx` |
| Props | interface | TypeScript | 3 | `apps/web/src/components/ProgramLauncher.tsx` |
| Props | interface | TypeScript | 1 | `apps/web/src/components/SearchTab.tsx` |
| Props | interface | TypeScript | 3 | `apps/web/src/components/SignUpModal.tsx` |
| Props | interface | TypeScript | 2 | `apps/web/src/components/StatusBar.tsx` |
| Toast | interface | TypeScript | 4 | `apps/web/src/components/Toast.tsx` |
| ToastContextValue | interface | TypeScript | 1 | `apps/web/src/components/Toast.tsx` |
| Props | interface | TypeScript | 2 | `apps/web/src/pages/DashboardPage.tsx` |
| ProgramDoc | interface | TypeScript | 13 | `apps/web/src/pages/DocsPage.tsx` |
| Example | interface | TypeScript | 7 | `apps/web/src/pages/ExamplesPage.tsx` |
| Step | interface | TypeScript | 4 | `apps/web/src/pages/HelpPage.tsx` |
| TroubleshootItem | interface | TypeScript | 2 | `apps/web/src/pages/HelpPage.tsx` |
| Props | interface | TypeScript | 2 | `apps/web/src/pages/PlansPage.tsx` |
| ProgramDef | interface | TypeScript | 7 | `apps/web/src/pages/ProgramsPage.tsx` |
| Props | interface | TypeScript | 1 | `apps/web/src/pages/ProgramsPage.tsx` |
| QAItem | interface | TypeScript | 3 | `apps/web/src/pages/QAPage.tsx` |
| Section | interface | TypeScript | 2 | `apps/web/src/pages/TermsPage.tsx` |
| Props | interface | TypeScript | 1 | `apps/web/src/pages/UploadPage.tsx` |
| ImportMeta | interface | TypeScript | 1 | `apps/web/src/vite-env.d.ts` |
| ImportMetaEnv | interface | TypeScript | 1 | `apps/web/src/vite-env.d.ts` |
| DashboardData | interface | TypeScript | 6 | `dashboard-widget.tsx` |
| axistoolboxProps | interface | TypeScript | 3 | `generated-component.tsx` |
| PaletteAction | interface | TypeScript | 0 | `generated-component.tsx` |
| Edge | interface | TypeScript | 3 | `generative-sketch.ts` |
| Node | interface | TypeScript | 7 | `generative-sketch.ts` |
| ContextMap | interface | TypeScript | 10 | `packages/context-engine/src/types.ts` |
| RepoProfile | interface | TypeScript | 12 | `packages/context-engine/src/types.ts` |
| CommerceSignals | interface | TypeScript | 10 | `packages/generator-core/src/generators-agentic-purchasing.ts` |
| Edge | interface | TypeScript | 3 | `packages/generator-core/src/generators-algorithmic.ts` |
| Node | interface | TypeScript | 7 | `packages/generator-core/src/generators-algorithmic.ts` |
| DashboardData | interface | TypeScript | 6 | `packages/generator-core/src/generators-artifacts.ts` |
| MyComponentProps | interface | TypeScript | 2 | `packages/generator-core/src/generators-frontend.ts` |
| RemotionTheme | interface | TypeScript | 4 | `packages/generator-core/src/generators-remotion.ts` |
| GeneratedFile | interface | TypeScript | 5 | `packages/generator-core/src/types.ts` |
| GeneratorInput | interface | TypeScript | 4 | `packages/generator-core/src/types.ts` |
| GeneratorResult | interface | TypeScript | 6 | `packages/generator-core/src/types.ts` |
| SourceFile | interface | TypeScript | 3 | `packages/generator-core/src/types.ts` |
| DomainModel | interface | TypeScript | 5 | `packages/repo-parser/src/domain-extractor.ts` |
| FrameworkRule | interface | TypeScript | 4 | `packages/repo-parser/src/framework-detector.ts` |
| DepGroups | interface | TypeScript | 3 | `packages/repo-parser/src/parser.ts` |
| CreateUserRequest | interface | TypeScript | 3 | `packages/repo-parser/src/perf.bench.ts` |
| SQLTable | interface | TypeScript | 5 | `packages/repo-parser/src/sql-extractor.ts` |
| DependencyInfo | interface | TypeScript | 3 | `packages/repo-parser/src/types.ts` |
| FileAnnotation | interface | TypeScript | 5 | `packages/repo-parser/src/types.ts` |
| FrameworkDetection | interface | TypeScript | 4 | `packages/repo-parser/src/types.ts` |
| ImportEdge | interface | TypeScript | 2 | `packages/repo-parser/src/types.ts` |
| LanguageStats | interface | TypeScript | 4 | `packages/repo-parser/src/types.ts` |
| ParseResult | interface | TypeScript | 13 | `packages/repo-parser/src/types.ts` |
| AccountSummary | interface | TypeScript | 7 | `packages/snapshots/src/billing-store.ts` |
| QuotaCheck | interface | TypeScript | 6 | `packages/snapshots/src/billing-store.ts` |
| RecentActivity | interface | TypeScript | 5 | `packages/snapshots/src/billing-store.ts` |
| SystemStats | interface | TypeScript | 7 | `packages/snapshots/src/billing-store.ts` |
| Account | interface | TypeScript | 5 | `packages/snapshots/src/billing-types.ts` |
| ApiKey | interface | TypeScript | 6 | `packages/snapshots/src/billing-types.ts` |
| PersistenceCreditRecord | interface | TypeScript | 7 | `packages/snapshots/src/billing-types.ts` |
| ProgramEntitlement | interface | TypeScript | 3 | `packages/snapshots/src/billing-types.ts` |
| TierLimits | interface | TypeScript | 5 | `packages/snapshots/src/billing-types.ts` |
| UsageRecord | interface | TypeScript | 8 | `packages/snapshots/src/billing-types.ts` |
| UsageSummary | interface | TypeScript | 5 | `packages/snapshots/src/billing-types.ts` |
| DbMaintenanceResult | interface | TypeScript | 3 | `packages/snapshots/src/db.ts` |
| Migration | interface | TypeScript | 3 | `packages/snapshots/src/db.ts` |
| EmailDelivery | interface | TypeScript | 10 | `packages/snapshots/src/email-store.ts` |
| EmailMessage | interface | TypeScript | 4 | `packages/snapshots/src/email-store.ts` |
| FunnelMetrics | interface | TypeScript | 8 | `packages/snapshots/src/funnel-store.ts` |
| FunnelEvent | interface | TypeScript | 6 | `packages/snapshots/src/funnel-types.ts` |
| PlanDefinition | interface | TypeScript | 6 | `packages/snapshots/src/funnel-types.ts` |
| PlanFeature | interface | TypeScript | 4 | `packages/snapshots/src/funnel-types.ts` |
| Seat | interface | TypeScript | 8 | `packages/snapshots/src/funnel-types.ts` |
| UpgradePrompt | interface | TypeScript | 9 | `packages/snapshots/src/funnel-types.ts` |
| GitHubToken | interface | TypeScript | 10 | `packages/snapshots/src/github-token-store.ts` |
| GitHubFetchResult | interface | TypeScript | 6 | `packages/snapshots/src/github.ts` |
| ParsedGitHubUrl | interface | TypeScript | 3 | `packages/snapshots/src/github.ts` |
| TarParseResult | interface | TypeScript | 3 | `packages/snapshots/src/github.ts` |
| GitHubTokenResponse | interface | TypeScript | 3 | `packages/snapshots/src/oauth-store.ts` |
| GitHubUser | interface | TypeScript | 4 | `packages/snapshots/src/oauth-store.ts` |
| ReferralCode | interface | TypeScript | 3 | `packages/snapshots/src/referral-store.ts` |
| ReferralConversion | interface | TypeScript | 4 | `packages/snapshots/src/referral-store.ts` |
| ReferralCredits | interface | TypeScript | 6 | `packages/snapshots/src/referral-store.ts` |
| CodeSymbol | interface | TypeScript | 6 | `packages/snapshots/src/search-store.ts` |
| SearchIndexEntry | interface | TypeScript | 3 | `packages/snapshots/src/search-store.ts` |
| SearchResult | interface | TypeScript | 4 | `packages/snapshots/src/search-store.ts` |
| SymbolSearchResult | interface | TypeScript | 5 | `packages/snapshots/src/search-store.ts` |
| StripeSubscription | interface | TypeScript | 12 | `packages/snapshots/src/stripe-store.ts` |
| ProrationResult | interface | TypeScript | 6 | `packages/snapshots/src/tier-audit.ts` |
| TierChange | interface | TypeScript | 8 | `packages/snapshots/src/tier-audit.ts` |
| FileEntry | interface | TypeScript | 3 | `packages/snapshots/src/types.ts` |
| SnapshotInput | interface | TypeScript | 4 | `packages/snapshots/src/types.ts` |
| SnapshotManifest | interface | TypeScript | 10 | `packages/snapshots/src/types.ts` |
| SnapshotRecord | interface | TypeScript | 10 | `packages/snapshots/src/types.ts` |
| FileDiff | interface | TypeScript | 4 | `packages/snapshots/src/version-store.ts` |
| GenerationVersion | interface | TypeScript | 7 | `packages/snapshots/src/version-store.ts` |
| VersionDiff | interface | TypeScript | 8 | `packages/snapshots/src/version-store.ts` |
| VersionFile | interface | TypeScript | 2 | `packages/snapshots/src/version-store.ts` |
| VersionRow | interface | TypeScript | 7 | `packages/snapshots/src/version-store.ts` |
| RetryCandidate | interface | TypeScript | 5 | `packages/snapshots/src/webhook-store.ts` |
| Webhook | interface | TypeScript | 8 | `packages/snapshots/src/webhook-store.ts` |
| WebhookDelivery | interface | TypeScript | 11 | `packages/snapshots/src/webhook-store.ts` |
| WebhookRow | interface | TypeScript | 8 | `packages/snapshots/src/webhook-store.ts` |
| averypayplatformConfig | interface | TypeScript | 2 | `payment-processing-output/generated-component.tsx` |
| Edge | interface | TypeScript | 3 | `payment-processing-output/generative-sketch.ts` |
| Node | interface | TypeScript | 7 | `payment-processing-output/generative-sketch.ts` |

## Route Map

| Method | Path | Source |
|--------|------|--------|
| GET | `/v1/health` | apps/api/src/admin.test.ts |
| POST | `/v1/accounts` | apps/api/src/admin.test.ts |
| POST | `/v1/snapshots` | apps/api/src/admin.test.ts |
| GET | `/v1/admin/stats` | apps/api/src/admin.test.ts |
| GET | `/v1/admin/accounts` | apps/api/src/admin.test.ts |
| GET | `/v1/admin/activity` | apps/api/src/admin.test.ts |
| GET | `/llms.txt` | apps/api/src/agent-discovery.test.ts |
| GET | `/.well-known/skills/index.json` | apps/api/src/agent-discovery.test.ts |
| GET | `/v1/docs.md` | apps/api/src/agent-discovery.test.ts |
| GET | `/.well-known/axis.json` | apps/api/src/agent-discovery.test.ts |
| GET | `/for-agents` | apps/api/src/agent-discovery.test.ts |
| GET | `/v1/install` | apps/api/src/agent-discovery.test.ts |
| GET | `/v1/install/:platform` | apps/api/src/agent-discovery.test.ts |
| POST | `/probe-intent` | apps/api/src/agent-discovery.test.ts |
| POST | `/v1/analyze` | apps/api/src/analyze.test.ts |
| GET | `/.well-known/axis.json` | apps/api/src/analyze.test.ts |
| POST | `/v1/snapshots` | apps/api/src/api-branches.test.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/api-branches.test.ts |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/api-branches.test.ts |
| GET | `/v1/projects/:project_id/context` | apps/api/src/api-branches.test.ts |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/api-branches.test.ts |
| GET | `/v1/projects/:project_id/generated-files/:file_path` | apps/api/src/api-branches.test.ts |
| DELETE | `/v1/projects/:project_id` | apps/api/src/api-branches.test.ts |
| GET | `/v1/health` | apps/api/src/api-branches.test.ts |
| GET | `/v1/db/stats` | apps/api/src/api-branches.test.ts |
| POST | `/v1/db/maintenance` | apps/api/src/api-branches.test.ts |
| POST | `/v1/search/index` | apps/api/src/api-branches.test.ts |
| POST | `/v1/search/query` | apps/api/src/api-branches.test.ts |
| GET | `/v1/search/:snapshot_id/stats` | apps/api/src/api-branches.test.ts |
| POST | `/v1/debug/analyze` | apps/api/src/api-branches.test.ts |
| GET | `/v1/docs` | apps/api/src/api-branches.test.ts |
| GET | `/v1/programs` | apps/api/src/api-branches.test.ts |
| POST | `/v1/account/seats` | apps/api/src/api-branches.test.ts |
| GET | `/v1/account/seats` | apps/api/src/api-branches.test.ts |
| POST | `/v1/account/seats/:seat_id/accept` | apps/api/src/api-branches.test.ts |
| POST | `/v1/account/seats/:seat_id/revoke` | apps/api/src/api-branches.test.ts |
| GET | `/v1/account/upgrade-prompt` | apps/api/src/api-branches.test.ts |
| POST | `/v1/account/upgrade-prompt/dismiss` | apps/api/src/api-branches.test.ts |
| GET | `/v1/account/funnel` | apps/api/src/api-branches.test.ts |
| GET | `/v1/health` | apps/api/src/api-layer5.test.ts |
| POST | `/v1/accounts` | apps/api/src/api-layer5.test.ts |
| POST | `/v1/account/webhooks` | apps/api/src/api-layer5.test.ts |
| GET | `/v1/account/webhooks` | apps/api/src/api-layer5.test.ts |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/api-layer5.test.ts |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/api-layer5.test.ts |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/api-layer5.test.ts |
| POST | `/v1/search/query` | apps/api/src/api-layer5.test.ts |
| POST | `/v1/account/programs` | apps/api/src/api-layer5.test.ts |
| POST | `/v1/account/github-token` | apps/api/src/api-layer5.test.ts |
| POST | `/v1/account/seats` | apps/api/src/api-layer5.test.ts |
| GET | `/v1/admin/stats` | apps/api/src/api-layer5.test.ts |
| GET | `/v1/admin/accounts` | apps/api/src/api-layer5.test.ts |
| GET | `/v1/admin/activity` | apps/api/src/api-layer5.test.ts |
| GET | `/health` | apps/api/src/api.test.ts |
| POST | `/v1/snapshots` | apps/api/src/api.test.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/api.test.ts |
| GET | `/v1/projects/:project_id/context` | apps/api/src/api.test.ts |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/api.test.ts |
| GET | `/v1/projects/:project_id/generated-files/:file_path` | apps/api/src/api.test.ts |
| POST | `/v1/search/export` | apps/api/src/api.test.ts |
| POST | `/v1/skills/generate` | apps/api/src/api.test.ts |
| POST | `/v1/debug/analyze` | apps/api/src/api.test.ts |
| POST | `/v1/frontend/audit` | apps/api/src/api.test.ts |
| POST | `/v1/seo/analyze` | apps/api/src/api.test.ts |
| POST | `/v1/optimization/analyze` | apps/api/src/api.test.ts |
| POST | `/v1/theme/generate` | apps/api/src/api.test.ts |
| POST | `/v1/brand/generate` | apps/api/src/api.test.ts |
| POST | `/v1/superpowers/generate` | apps/api/src/api.test.ts |
| POST | `/v1/marketing/generate` | apps/api/src/api.test.ts |
| POST | `/v1/notebook/generate` | apps/api/src/api.test.ts |
| POST | `/v1/obsidian/analyze` | apps/api/src/api.test.ts |
| POST | `/v1/mcp/provision` | apps/api/src/api.test.ts |
| POST | `/v1/artifacts/generate` | apps/api/src/api.test.ts |
| POST | `/v1/remotion/generate` | apps/api/src/api.test.ts |
| POST | `/v1/canvas/generate` | apps/api/src/api.test.ts |
| POST | `/v1/algorithmic/generate` | apps/api/src/api.test.ts |
| POST | `/v1/agentic-purchasing/generate` | apps/api/src/api.test.ts |
| POST | `/v1/github/analyze` | apps/api/src/api.test.ts |
| POST | `/v1/accounts` | apps/api/src/b-grade-upgrade.test.ts |
| POST | `/v1/account/tier` | apps/api/src/b-grade-upgrade.test.ts |
| POST | `/v1/account/github-token` | apps/api/src/b-grade-upgrade.test.ts |
| GET | `/v1/account/github-token` | apps/api/src/b-grade-upgrade.test.ts |
| DELETE | `/v1/account/github-token/:token_id` | apps/api/src/b-grade-upgrade.test.ts |
| GET | `/v1/billing/history` | apps/api/src/b-grade-upgrade.test.ts |
| GET | `/v1/billing/proration` | apps/api/src/b-grade-upgrade.test.ts |
| GET | `/v1/health` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/snapshots` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/projects/:project_id/context` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/projects/:project_id/generated-files/:file_path*` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/search/export` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/projects/:project_id/export` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/accounts` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/account` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/keys` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/account/keys` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/keys/:key_id/revoke` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/account/usage` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/tier` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/programs` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/account/credits` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/plans` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/seats` | apps/api/src/billing-flow.test.ts |
| GET | `/v1/account/seats` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/seats/:seat_id/accept` | apps/api/src/billing-flow.test.ts |
| POST | `/v1/account/seats/:seat_id/revoke` | apps/api/src/billing-flow.test.ts |
| GET | `/for-agents` | apps/api/src/budget-probe.test.ts |
| POST | `/probe-intent` | apps/api/src/budget-probe.test.ts |
| POST | `/v1/accounts` | apps/api/src/checkout-email.test.ts |
| POST | `/v1/account/seats` | apps/api/src/checkout-email.test.ts |
| GET | `/v1/account/seats` | apps/api/src/checkout-email.test.ts |
| GET | `/v1/plans` | apps/api/src/checkout-email.test.ts |
| POST | `/v1/webhooks/stripe` | apps/api/src/checkout-email.test.ts |
| POST | `/v1/checkout` | apps/api/src/checkout-email.test.ts |
| GET | `/v1/account/subscription` | apps/api/src/checkout-email.test.ts |
| POST | `/v1/account/subscription/cancel` | apps/api/src/checkout-email.test.ts |
| GET | `/v1/health` | apps/api/src/crash-resilience.test.ts |
| GET | `/v1/health` | apps/api/src/crash-resilience.test.ts |
| GET | `/v1/health` | apps/api/src/credits-api.test.ts |
| POST | `/v1/accounts` | apps/api/src/credits-api.test.ts |
| GET | `/v1/account` | apps/api/src/credits-api.test.ts |
| POST | `/v1/account/keys` | apps/api/src/credits-api.test.ts |
| POST | `/v1/account/tier` | apps/api/src/credits-api.test.ts |
| GET | `/v1/account/credits` | apps/api/src/credits-api.test.ts |
| POST | `/v1/account/credits` | apps/api/src/credits-api.test.ts |
| GET | `/v1/health` | apps/api/src/db-endpoints.test.ts |
| GET | `/v1/db/stats` | apps/api/src/db-endpoints.test.ts |
| POST | `/v1/db/maintenance` | apps/api/src/db-endpoints.test.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/deletion.test.ts |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/deletion.test.ts |
| DELETE | `/v1/projects/:project_id` | apps/api/src/deletion.test.ts |
| GET | `/v1/health` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/health/live` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/health/ready` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/metrics` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/db/stats` | apps/api/src/e2e-flows.test.ts |
| POST | `/v1/db/maintenance` | apps/api/src/e2e-flows.test.ts |
| POST | `/v1/snapshots` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/e2e-flows.test.ts |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/snapshots/:snapshot_id/versions` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/snapshots/:snapshot_id/versions/:version_number` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/snapshots/:snapshot_id/diff` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/projects/:project_id/context` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/projects/:project_id/generated-files/:file_path` | apps/api/src/e2e-flows.test.ts |
| DELETE | `/v1/projects/:project_id` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/projects/:project_id/export` | apps/api/src/e2e-flows.test.ts |
| POST | `/v1/search/export` | apps/api/src/e2e-flows.test.ts |
| POST | `/v1/accounts` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/account` | apps/api/src/e2e-flows.test.ts |
| POST | `/v1/account/keys` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/account/keys` | apps/api/src/e2e-flows.test.ts |
| POST | `/v1/account/keys/:key_id/revoke` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/account/usage` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/account/quota` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/admin/stats` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/admin/accounts` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/admin/activity` | apps/api/src/e2e-flows.test.ts |
| POST | `/v1/account/webhooks` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/account/webhooks` | apps/api/src/e2e-flows.test.ts |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/e2e-flows.test.ts |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/e2e-flows.test.ts |
| GET | `/v1/projects/:project_id/export` | apps/api/src/export-edge-cases.test.ts |
| GET | `/v1/projects/:project_id/export` | apps/api/src/export.test.ts |
| POST | `/v1/accounts` | apps/api/src/funnel-api.test.ts |
| GET | `/v1/account` | apps/api/src/funnel-api.test.ts |
| POST | `/v1/account/keys` | apps/api/src/funnel-api.test.ts |
| POST | `/v1/account/tier` | apps/api/src/funnel-api.test.ts |
| GET | `/v1/plans` | apps/api/src/funnel-api.test.ts |
| POST | `/v1/account/seats` | apps/api/src/funnel-api.test.ts |
| GET | `/v1/account/seats` | apps/api/src/funnel-api.test.ts |
| POST | `/v1/account/seats/:seat_id/accept` | apps/api/src/funnel-api.test.ts |
| POST | `/v1/account/seats/:seat_id/revoke` | apps/api/src/funnel-api.test.ts |
| GET | `/v1/account/upgrade-prompt` | apps/api/src/funnel-api.test.ts |
| POST | `/v1/account/upgrade-prompt/dismiss` | apps/api/src/funnel-api.test.ts |
| GET | `/v1/account/funnel` | apps/api/src/funnel-api.test.ts |
| GET | `/v1/funnel/metrics` | apps/api/src/funnel-api.test.ts |
| POST | `/v1/snapshots` | apps/api/src/handler-edge-cases.test.ts |
| GET | `/health` | apps/api/src/handler-edge-cases.test.ts |
| GET | `/v1/projects/:project_id/context` | apps/api/src/handler-edge-cases.test.ts |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/handler-edge-cases.test.ts |
| GET | `/v1/projects/:project_id/generated-files/:file_path` | apps/api/src/handler-edge-cases.test.ts |
| POST | `/v1/debug/analyze` | apps/api/src/handler-edge-cases.test.ts |
| POST | `/v1/snapshots` | apps/api/src/handler-validation.test.ts |
| POST | `/v1/debug/analyze` | apps/api/src/handler-validation.test.ts |
| POST | `/v1/snapshots` | apps/api/src/handlers-deep.test.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/handlers-deep.test.ts |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/handlers-deep.test.ts |
| DELETE | `/v1/projects/:project_id` | apps/api/src/handlers-deep.test.ts |
| GET | `/v1/projects/:project_id/generated-files/:file_path` | apps/api/src/handlers-deep.test.ts |
| POST | `/v1/search/export` | apps/api/src/handlers-deep.test.ts |
| POST | `/v1/skills/generate` | apps/api/src/handlers-deep.test.ts |
| POST | `/v1/github/analyze` | apps/api/src/handlers-deep.test.ts |
| POST | `/v1/debug/analyze` | apps/api/src/handlers-deep.test.ts |
| GET | `/v1/health/live` | apps/api/src/latency-histogram.test.ts |
| GET | `/v1/metrics` | apps/api/src/latency-histogram.test.ts |
| GET | `/v1/health` | apps/api/src/logging.test.ts |
| POST | `/v1/snapshots` | apps/api/src/logging.test.ts |
| POST | `/mcp` | apps/api/src/mcp-server.test.ts |
| GET | `/mcp` | apps/api/src/mcp-server.test.ts |
| GET | `/v1/mcp/server.json` | apps/api/src/mcp-server.test.ts |
| POST | `/v1/accounts` | apps/api/src/mcp-server.test.ts |
| POST | `/v1/account/keys` | apps/api/src/mcp-server.test.ts |
| GET | `/v1/stats` | apps/api/src/mcp-server.test.ts |
| GET | `/ping` | apps/api/src/mcp-server.test.ts |
| GET | `/v1/health` | apps/api/src/metrics.test.ts |
| GET | `/v1/health/live` | apps/api/src/metrics.test.ts |
| GET | `/v1/health/ready` | apps/api/src/metrics.test.ts |
| GET | `/v1/metrics` | apps/api/src/metrics.test.ts |
| GET | `/v1/health` | apps/api/src/multi-tenancy.test.ts |
| POST | `/v1/snapshots` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/multi-tenancy.test.ts |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/multi-tenancy.test.ts |
| DELETE | `/v1/projects/:project_id` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/projects/:project_id/context` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/projects/:project_id/generated-files/:file_path*` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/projects/:project_id/export` | apps/api/src/multi-tenancy.test.ts |
| POST | `/v1/search/index` | apps/api/src/multi-tenancy.test.ts |
| POST | `/v1/search/query` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/search/:snapshot_id/stats` | apps/api/src/multi-tenancy.test.ts |
| POST | `/v1/accounts` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/account` | apps/api/src/multi-tenancy.test.ts |
| POST | `/v1/account/keys` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/account/keys` | apps/api/src/multi-tenancy.test.ts |
| POST | `/v1/account/keys/:key_id/revoke` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/account/usage` | apps/api/src/multi-tenancy.test.ts |
| POST | `/v1/account/tier` | apps/api/src/multi-tenancy.test.ts |
| POST | `/v1/account/programs` | apps/api/src/multi-tenancy.test.ts |
| GET | `/v1/auth/github` | apps/api/src/oauth.test.ts |
| GET | `/v1/auth/github/callback` | apps/api/src/oauth.test.ts |
| POST | `/v1/prepare-for-agentic-purchasing` | apps/api/src/prepare-purchasing.test.ts |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts |
| GET | `/v1/health` | apps/api/src/production-startup.test.ts |
| GET | `/v1/programs` | apps/api/src/programs-billing.test.ts |
| POST | `/v1/accounts` | apps/api/src/programs-billing.test.ts |
| GET | `/v1/account` | apps/api/src/programs-billing.test.ts |
| POST | `/v1/account/keys` | apps/api/src/programs-billing.test.ts |
| GET | `/v1/account/usage` | apps/api/src/programs-billing.test.ts |
| POST | `/v1/account/tier` | apps/api/src/programs-billing.test.ts |
| POST | `/v1/account/programs` | apps/api/src/programs-billing.test.ts |
| GET | `/v1/health` | apps/api/src/quota.test.ts |
| POST | `/v1/accounts` | apps/api/src/quota.test.ts |
| GET | `/v1/account/quota` | apps/api/src/quota.test.ts |
| GET | `/v1/test/fast` | apps/api/src/request-limits.test.ts |
| GET | `/v1/test/slow` | apps/api/src/request-limits.test.ts |
| GET | `/slow` | apps/api/src/router-branches.test.ts |
| GET | `/throw-string` | apps/api/src/router-branches.test.ts |
| GET | `/throw-after-end` | apps/api/src/router-branches.test.ts |
| GET | `/null-error` | apps/api/src/router-branches.test.ts |
| GET | `/array-error` | apps/api/src/router-branches.test.ts |
| GET | `/ok` | apps/api/src/router-branches.test.ts |
| GET | `/manual-500` | apps/api/src/router-branches.test.ts |
| GET | `/manual-422` | apps/api/src/router-branches.test.ts |
| GET | `/health` | apps/api/src/router-branches.test.ts |
| GET | `/up` | apps/api/src/router-branches.test.ts |
| GET | `/echo` | apps/api/src/router.test.ts |
| POST | `/echo` | apps/api/src/router.test.ts |
| GET | `/items/:id` | apps/api/src/router.test.ts |
| GET | `/users/:userId/posts/:postId` | apps/api/src/router.test.ts |
| GET | `/files/:path*` | apps/api/src/router.test.ts |
| GET | `/throws` | apps/api/src/router.test.ts |
| POST | `/status/:code` | apps/api/src/router.test.ts |
| GET | `/error-shape` | apps/api/src/router.test.ts |
| GET | `/` | apps/api/src/router.test.ts |
| GET | `/v1/health` | apps/api/src/security.test.ts |
| POST | `/v1/snapshots` | apps/api/src/security.test.ts |
| GET | `/v1/health` | apps/api/src/server-lifecycle.test.ts |
| GET | `/v1/health` | apps/api/src/server-lifecycle.test.ts |
| GET | `/` | apps/api/src/server.ts |
| GET | `/v1/health` | apps/api/src/server.ts |
| GET | `/v1/health/live` | apps/api/src/server.ts |
| GET | `/v1/health/ready` | apps/api/src/server.ts |
| GET | `/v1/metrics` | apps/api/src/server.ts |
| GET | `/v1/db/stats` | apps/api/src/server.ts |
| POST | `/v1/db/maintenance` | apps/api/src/server.ts |
| GET | `/v1/docs` | apps/api/src/server.ts |
| POST | `/v1/snapshots` | apps/api/src/server.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/server.ts |
| DELETE | `/v1/snapshots/:snapshot_id` | apps/api/src/server.ts |
| GET | `/v1/snapshots/:snapshot_id/versions` | apps/api/src/server.ts |
| GET | `/v1/snapshots/:snapshot_id/versions/:version_number` | apps/api/src/server.ts |
| GET | `/v1/snapshots/:snapshot_id/diff` | apps/api/src/server.ts |
| GET | `/v1/projects/:project_id/context` | apps/api/src/server.ts |
| GET | `/v1/projects/:project_id/generated-files` | apps/api/src/server.ts |
| GET | `/v1/projects/:project_id/generated-files/:file_path*` | apps/api/src/server.ts |
| DELETE | `/v1/projects/:project_id` | apps/api/src/server.ts |
| POST | `/v1/search/export` | apps/api/src/server.ts |
| POST | `/v1/skills/generate` | apps/api/src/server.ts |
| POST | `/v1/debug/analyze` | apps/api/src/server.ts |
| POST | `/v1/frontend/audit` | apps/api/src/server.ts |
| POST | `/v1/seo/analyze` | apps/api/src/server.ts |
| POST | `/v1/optimization/analyze` | apps/api/src/server.ts |
| POST | `/v1/theme/generate` | apps/api/src/server.ts |
| POST | `/v1/brand/generate` | apps/api/src/server.ts |
| POST | `/v1/superpowers/generate` | apps/api/src/server.ts |
| POST | `/v1/marketing/generate` | apps/api/src/server.ts |
| POST | `/v1/notebook/generate` | apps/api/src/server.ts |
| POST | `/v1/obsidian/analyze` | apps/api/src/server.ts |
| POST | `/v1/mcp/provision` | apps/api/src/server.ts |
| POST | `/v1/artifacts/generate` | apps/api/src/server.ts |
| POST | `/v1/remotion/generate` | apps/api/src/server.ts |
| POST | `/v1/canvas/generate` | apps/api/src/server.ts |
| POST | `/v1/algorithmic/generate` | apps/api/src/server.ts |
| POST | `/v1/agentic-purchasing/generate` | apps/api/src/server.ts |
| POST | `/v1/prepare-for-agentic-purchasing` | apps/api/src/server.ts |
| POST | `/v1/analyze` | apps/api/src/server.ts |
| POST | `/v1/github/analyze` | apps/api/src/server.ts |
| GET | `/.well-known/axis.json` | apps/api/src/server.ts |
| GET | `/.well-known/capabilities.json` | apps/api/src/server.ts |
| GET | `/robots.txt` | apps/api/src/server.ts |
| GET | `/llms.txt` | apps/api/src/server.ts |
| GET | `/.well-known/skills/index.json` | apps/api/src/server.ts |
| GET | `/v1/docs.md` | apps/api/src/server.ts |
| GET | `/for-agents` | apps/api/src/server.ts |
| POST | `/probe-intent` | apps/api/src/server.ts |
| GET | `/v1/install` | apps/api/src/server.ts |
| GET | `/v1/install/:platform` | apps/api/src/server.ts |
| POST | `/v1/search/index` | apps/api/src/server.ts |
| POST | `/v1/search/query` | apps/api/src/server.ts |
| GET | `/v1/search/:snapshot_id/stats` | apps/api/src/server.ts |
| GET | `/v1/search/:snapshot_id/symbols` | apps/api/src/server.ts |
| GET | `/v1/projects/:project_id/export` | apps/api/src/server.ts |
| GET | `/v1/programs` | apps/api/src/server.ts |
| POST | `/mcp` | apps/api/src/server.ts |
| GET | `/mcp` | apps/api/src/server.ts |
| GET | `/v1/stats` | apps/api/src/server.ts |
| GET | `/v1/mcp/server.json` | apps/api/src/server.ts |
| GET | `/v1/mcp/tools` | apps/api/src/server.ts |
| POST | `/v1/accounts` | apps/api/src/server.ts |
| GET | `/v1/account` | apps/api/src/server.ts |
| POST | `/v1/account/keys` | apps/api/src/server.ts |
| GET | `/v1/account/keys` | apps/api/src/server.ts |
| POST | `/v1/account/keys/:key_id/revoke` | apps/api/src/server.ts |
| GET | `/v1/account/usage` | apps/api/src/server.ts |
| GET | `/v1/account/quota` | apps/api/src/server.ts |
| POST | `/v1/account/tier` | apps/api/src/server.ts |
| POST | `/v1/account/programs` | apps/api/src/server.ts |
| POST | `/v1/account/github-token` | apps/api/src/server.ts |
| GET | `/v1/account/github-token` | apps/api/src/server.ts |
| DELETE | `/v1/account/github-token/:token_id` | apps/api/src/server.ts |
| GET | `/v1/billing/history` | apps/api/src/server.ts |
| GET | `/v1/billing/proration` | apps/api/src/server.ts |
| GET | `/v1/account/credits` | apps/api/src/server.ts |
| POST | `/v1/account/credits` | apps/api/src/server.ts |
| GET | `/v1/plans` | apps/api/src/server.ts |
| POST | `/v1/account/seats` | apps/api/src/server.ts |
| GET | `/v1/account/seats` | apps/api/src/server.ts |
| POST | `/v1/account/seats/:seat_id/accept` | apps/api/src/server.ts |
| POST | `/v1/account/seats/:seat_id/revoke` | apps/api/src/server.ts |
| GET | `/v1/account/upgrade-prompt` | apps/api/src/server.ts |
| POST | `/v1/account/upgrade-prompt/dismiss` | apps/api/src/server.ts |
| GET | `/v1/account/funnel` | apps/api/src/server.ts |
| GET | `/v1/funnel/metrics` | apps/api/src/server.ts |
| GET | `/v1/admin/stats` | apps/api/src/server.ts |
| GET | `/v1/admin/accounts` | apps/api/src/server.ts |
| GET | `/v1/admin/activity` | apps/api/src/server.ts |
| GET | `/v1/auth/github` | apps/api/src/server.ts |
| GET | `/v1/auth/github/callback` | apps/api/src/server.ts |
| POST | `/v1/account/webhooks` | apps/api/src/server.ts |
| GET | `/v1/account/webhooks` | apps/api/src/server.ts |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/server.ts |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/server.ts |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/server.ts |
| POST | `/v1/webhooks/stripe` | apps/api/src/server.ts |
| POST | `/v1/checkout` | apps/api/src/server.ts |
| GET | `/v1/account/subscription` | apps/api/src/server.ts |
| POST | `/v1/account/subscription/cancel` | apps/api/src/server.ts |
| POST | `/v1/snapshots` | apps/api/src/snapshot-auth.test.ts |
| GET | `/v1/snapshots/:snapshot_id` | apps/api/src/snapshot-auth.test.ts |
| POST | `/v1/accounts` | apps/api/src/snapshot-auth.test.ts |
| POST | `/v1/account/tier` | apps/api/src/snapshot-auth.test.ts |
| POST | `/v1/accounts` | apps/api/src/stripe-branches.test.ts |
| POST | `/v1/webhooks/stripe` | apps/api/src/stripe-branches.test.ts |
| POST | `/v1/checkout` | apps/api/src/stripe-branches.test.ts |
| GET | `/v1/account/subscription` | apps/api/src/stripe-branches.test.ts |
| POST | `/v1/account/subscription/cancel` | apps/api/src/stripe-branches.test.ts |
| POST | `/v1/accounts` | apps/api/src/stripe.test.ts |
| POST | `/v1/webhooks/stripe` | apps/api/src/stripe.test.ts |
| GET | `/v1/account/subscription` | apps/api/src/stripe.test.ts |
| POST | `/v1/snapshots` | apps/api/src/validation.test.ts |
| POST | `/v1/search/export` | apps/api/src/validation.test.ts |
| POST | `/v1/skills/generate` | apps/api/src/validation.test.ts |
| POST | `/v1/debug/analyze` | apps/api/src/validation.test.ts |
| POST | `/v1/accounts` | apps/api/src/validation.test.ts |
| POST | `/v1/account/tier` | apps/api/src/validation.test.ts |
| POST | `/v1/account/programs` | apps/api/src/validation.test.ts |
| POST | `/v1/account/seats` | apps/api/src/validation.test.ts |
| GET | `/v1/health` | apps/api/src/versions.test.ts |
| GET | `/v1/snapshots/:snapshot_id/versions` | apps/api/src/versions.test.ts |
| GET | `/v1/snapshots/:snapshot_id/versions/:version_number` | apps/api/src/versions.test.ts |
| GET | `/v1/snapshots/:snapshot_id/diff` | apps/api/src/versions.test.ts |
| POST | `/v1/account/webhooks` | apps/api/src/webhook-branches.test.ts |
| GET | `/v1/account/webhooks` | apps/api/src/webhook-branches.test.ts |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/webhook-branches.test.ts |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/webhook-branches.test.ts |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/webhook-branches.test.ts |
| GET | `/v1/health` | apps/api/src/webhooks.test.ts |
| POST | `/v1/accounts` | apps/api/src/webhooks.test.ts |
| POST | `/v1/account/webhooks` | apps/api/src/webhooks.test.ts |
| GET | `/v1/account/webhooks` | apps/api/src/webhooks.test.ts |
| DELETE | `/v1/account/webhooks/:webhook_id` | apps/api/src/webhooks.test.ts |
| POST | `/v1/account/webhooks/:webhook_id/toggle` | apps/api/src/webhooks.test.ts |
| GET | `/v1/account/webhooks/:webhook_id/deliveries` | apps/api/src/webhooks.test.ts |
| GET | `/health` | e2e_ui_audit.yaml |
| GET | `/v1/health` | e2e_ui_audit.yaml |
| GET | `/api/health` | packages/context-engine/src/engine-branches.test.ts |
| POST | `/api/users` | packages/context-engine/src/engine-branches.test.ts |
| GET | `/api/users` | packages/context-engine/src/engine-edge.test.ts |
| POST | `/api/users` | packages/context-engine/src/engine-edge.test.ts |
| DELETE | `/api/users/:id` | packages/context-engine/src/engine-edge.test.ts |
| GET | `/api/health` | packages/generator-core/src/generator-branches.test.ts |
| GET | `/api/users` | packages/generator-core/src/generator-branches.test.ts |
| POST | `/api/users` | packages/generator-core/src/generator-branches.test.ts |
| GET | `/` | packages/generator-core/src/generator-branches.test.ts |
| GET | `/health` | packages/generator-core/src/generator-sourcefile-branches.test.ts |
| GET | `/api/health` | packages/generator-core/src/generator-sourcefile-branches6.test.ts |
| POST | `/webhook` | packages/generator-core/src/generators-agentic-purchasing.test.ts |
| GET | `/users/:id` | packages/repo-parser/src/perf.bench.ts |
| POST | `/users` | packages/repo-parser/src/perf.bench.ts |

## Architecture Layer Boundaries

> ⚡ **Moderate separation (0.64)** — some coupling exists between layers.

Bugs often occur at layer boundaries. Verify data flow between:

- **presentation**: apps, frontend

**Architecture patterns:** monorepo, containerized

## Deployment Debugging

- **Container crashes:** Check `docker logs <container>` for OOM kills or startup failures
- **Network issues:** Verify container port mapping and inter-service DNS resolution
- **Volume mounts:** Ensure persistent data paths match Dockerfile WORKDIR
- **Build caching:** Clear Docker cache with `docker builder prune` if stale layers suspected

## Common Traps

- ✅ TypeScript strict mode
- ✅ pnpm workspaces
- ⚠️ No linter configured
- ⚠️ No formatter configured

## Production Dependencies

10 production dependencies. Key packages:

- `@axis/context-engine` @ workspace:*
- `@axis/generator-core` @ workspace:*
- `@axis/repo-parser` @ workspace:*
- `@axis/snapshots` @ workspace:*
- `mppx` @ ^0.5.12
- `jszip` @ ^3.10.1
- `react` @ ^19.1.0
- `react-dom` @ ^19.1.0
- `better-sqlite3` @ ^12.8.0
- `uuid` @ ^11.1.0

## Entry Point Source (for tracing)

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
  handleAgenticPurchasingGenerate,
... (296 more lines)
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
// React requires a class for getDerivedStateFromError; this thin wrapper
// keeps the rest of the codebase class-free per .cursorrules.

class ErrorCatcher extends Component<{ children: ReactNode; fallback: (error: Error, reset: () => void) => ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
... (301 more lines)
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

---
*Generated by Axis Debug*
