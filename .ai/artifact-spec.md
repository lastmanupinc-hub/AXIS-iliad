# Artifact Specification — axis-iliad

Generated: 2026-05-22T21:39:10.668Z

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 17 top-level directories. It defines 259 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Project Identity

| Field | Value |
|-------|-------|
| Name | axis-iliad |
| Type | monorepo |
| Language | TypeScript |
| Frameworks | React |

## Language Distribution

- **TypeScript**: 76.4% ███████████████ (281 files, 93343 LOC)
- **YAML**: 8.1% ██ (57 files, 9885 LOC)
- **JSON**: 6.6% █ (60 files, 8079 LOC)
- **Markdown**: 6.5% █ (76 files, 8000 LOC)
- **JavaScript**: 1.7% █ (8 files, 2093 LOC)
- **CSS**: 0.6% █ (1 files, 675 LOC)
- **HTML**: 0.1% █ (1 files, 158 LOC)
- **Dockerfile**: 0% █ (1 files, 21 LOC)

## Architecture

### Patterns Detected
- monorepo
- containerized

### Layer Boundaries
- **presentation**: apps, frontend

## Entry Points

No entry points detected.

## Hotspots

| Path | Inbound | Outbound | Risk |
|------|---------|----------|------|
| `apps/web/src/App.tsx` | 1 | 21 | 1.0 |
| `apps/web/src/api.ts` | 19 | 0 | 0.9 |
| `apps/web/src/pages.test.tsx` | 0 | 17 | 0.8 |
| `apps/web/src/pages/DashboardPage.tsx` | 1 | 10 | 0.6 |
| `apps/web/src/components/Toast.tsx` | 4 | 0 | 0.2 |
| `apps/web/src/components/AxisIcons.tsx` | 4 | 0 | 0.2 |
| `apps/web/src/upload-utils.ts` | 3 | 0 | 0.1 |

## Artifact Generation Rules

When generating artifacts for this project:

1. **Component artifacts** should use React conventions
2. **Widget artifacts** should render project metrics from real data
3. **Embed snippets** should include all conventions and warnings
4. **File naming** should follow TypeScript conventions
5. **Architecture score**: 0.65/100

## Dependencies (Top 10)

- `@axis/context-engine` @ workspace:*
- `@axis/generator-core` @ workspace:*
- `@axis/mpp` @ workspace:*
- `@axis/repo-parser` @ workspace:*
- `@axis/snapshots` @ workspace:*
- `@jmondi/oauth2-server` @ ^4.2.2
- `jsonwebtoken` @ ^9.0.3
- `mppx` @ ^0.5.12
- `jszip` @ ^3.10.1
- `react` @ ^19.1.0

## Source Entry Points

| File | Exports |
|------|---------|
| `apps/api/src/server.ts` | export const app = ... |
| `apps/web/src/App.tsx` | export function App() { ... } |
| `apps/web/src/main.tsx` | default |
| `packages/context-engine/src/index.ts` | export type { ... }, export { ... } |
| `packages/generator-core/src/index.ts` | export type { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export type { ... }, export { ... } |
| `packages/mpp/src/index.ts` | export type ChargeOptions = ..., export type MppResult = ..., export interface AgentBudget { ... }, export interface PricingTier { ... }, export interface Build402Options { ... }, export const PRICING_TIERS: Record<string, PricingTier> = ..., export const LEGACY_TOOL_ALIASES: Record<string, string> = ..., export function getPricingTier(tool: string): PricingTier { ... }, export function negotiatePrice(, export function build402NegotiationBody(, export function parseAgentBudget(req: IncomingMessage): AgentBudget | undefined { ... }, export function resolveAgentMode(req: IncomingMessage): "standard" | "lite" { ... } |
| `packages/repo-parser/src/index.ts` | export type { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export type { ... }, export { ... }, export type { ... } |
| `packages/sdk/src/index.ts` | export interface AxisClientOptions { ... }, export interface FileEntry { ... }, export interface AnalyzeFilesInput { ... }, export interface AnalyzeRepoInput { ... }, export interface ArtifactEntry { ... }, export interface SnapshotResult { ... }, export interface HealthResponse { ... }, export interface McpToolCallResult { ... }, export interface OpenApiSpec { ... }, export class AxisClient { ... } |

## Reference Entry Point

### `packages/generator-core/src/index.ts`

```typescript
export type { GeneratedFile, GeneratorInput, GeneratorResult, SourceFile } from "./types.js";
export { generateFiles, listAvailableGenerators, TOTAL_GENERATORS, TOTAL_PROGRAMS } from "./generate.js";
export { generateContextMapJSON, generateRepoProfileYAML, generateArchitectureSummary, generateDependencyHotspots, generateRepoRunStats } from "./generators-search.js";
export { generateAgentsMD, generateClaudeMD, generateCursorRules, generateWorkflowPack, generatePolicyPack } from "./generators-skills.js";
export { generateDebugPlaybook, generateIncidentTemplate, generateTracingRules, generateRootCauseChecklist } from "./generators-debug.js";
export { generateFrontendRules, generateComponentGuidelines, generateLayoutPatterns, generateUiAudit } from "./generators-frontend.js";
export { generateSeoRules, generateSchemaRecommendations, generateRoutePriorityMap, generateContentAudit, generateMetaTagAudit } from "./generators-seo.js";
export { generateOptimizationRules, generatePromptDiffReport, generateCostEstimate, generateTokenBudgetPlan } from "./generators-optimization.js";
export { generateDesignTokens, generateThemeCss, generateThemeGuidelines, generateComponentThemeMap, generateDarkModeTokens } from "./generators-theme.js";
export { generateBrandGuidelines, generateVoiceAndTone, generateContentConstraints, generateMessagingSystem, generateChannelRulebook } from "./generators-brand.js";
export { generateSuperpowerPack, generateWorkflowRegistry, generateTestGenerationRules, generateRefactorChecklist, generateAutomationPipeline } from "./generators-superpowers.js";
export { generateCampaignBrief, generateFunnelMap, generateSequencePack, generateCroPlaybook, generateAbTestPlan } from "./generators-marketing.js";
export { generateNotebookSummary, generateSourceMap, generateStudyBrief, generateResearchThreads, generateCitationIndex } from "./generators-notebook.js";
export { generateObsidianSkillPack, generateVaultRules, generateGraphPromptMap, generateLinkingPolicy, generateTemplatePack } from "./generators-obsidian.js";
export { generateMcpConfig, generateMcpRegistryMetadata, generateProtocolSpec, generateSpecTypes, generateMcpReadme, generateProjectSetupGuide, generateBuildArtifactsGuide, generateRootPackageJsonTemplate, generatePackagePackageJsonTemplate, generateRootTsconfigTemplate, generatePackageTsconfigTemplate, generateMonorepoStructureGuide, generateCoreImplementationArtifactsGuide, generateTestingDocumentationPolishArtifactsGuide, generateConnectorMap, generateCapabilityRegistry, generateServerManifest, generateFintechMcpSurfacePackage, generateFintechDomainSchema } from "./generators-mcp.js";
export { generateComponent, generateDashboardWidget, generateEmbedSnippet, generateArtifactSpec, generateComponentLibrary, generatePrd, generateDesignDoc, generateTasksMd, generateContextMd, generateIndexHtml, generateCapabilityMap } from "./generators-artifacts.js";
export { generateRemotionScript, generateScenePlan, generateRenderConfig, generateAssetChecklist, generateStoryboard } from "./generators-remotion.js";
export { generateCanvasSpec, generateSocialPack, generatePosterLayouts, generateCanvasAssetGuidelines, generateBrandBoard } from "./generators-canvas.js";
export { generateGenerativeSketch, generateParameterPack, generateCollectionMap, generateExportManifest, generateVariationMatrix } from "./generators-algorithmic.js";
export { generateAgentPurchasingPlaybook, generateProductSchema, generateCheckoutFlow, generateNegotiationRules, generateCommerceRegistry, computeComplianceGrade } from "./generators-agentic-purchasing.js";
export type { ComplianceGradeResult } from "./generators-agentic-purchasing.js";
export {
	generatePackagingReadme,
	generatePackagingLicense,
	generateCloserDockerfile,
	generateCloserDockerCompose,
	generateCloserCiWorkflow,
	generateCloserReleaseWorkflow,
	generateCloserManifestNpm,
	generateCloserManifestUnreal,
... (10 more lines)
```

## Component Signatures

- `apps/web/src/App.tsx`: export function App() { ... }
- `apps/web/src/components/AxisIcons.tsx`: export function Icon({ ... }
- `apps/web/src/components/CommandPalette.tsx`: export interface PaletteAction { ... }, export function CommandPalette({ ... }
- `apps/web/src/components/FilesTab.tsx`: export function FilesTab({ ... }
- `apps/web/src/components/GeneratedTab.tsx`: export function GeneratedTab({ ... }
- `apps/web/src/components/GraphTab.tsx`: export function GraphTab({ ... }
- `apps/web/src/components/OverviewTab.tsx`: export function OverviewTab({ ... }
- `apps/web/src/components/ProgramLauncher.tsx`: export function ProgramLauncher({ ... }
- `apps/web/src/components/SearchTab.tsx`: export function SearchTab({ ... }
- `apps/web/src/components/SignUpModal.tsx`: export function SignUpModal({ ... }
