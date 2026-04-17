# Artifact Specification — axis-iliad

Generated: 2026-04-17T13:25:42.706Z

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 163 domain models.

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

- **TypeScript**: 73.3% ███████████████ (262 files, 82527 LOC)
- **JSON**: 10% ██ (63 files, 11291 LOC)
- **YAML**: 7.6% ██ (55 files, 8549 LOC)
- **Markdown**: 7% █ (95 files, 7878 LOC)
- **JavaScript**: 1.2% █ (6 files, 1302 LOC)
- **CSS**: 0.8% █ (2 files, 849 LOC)
- **HTML**: 0.1% █ (1 files, 120 LOC)
- **Dockerfile**: 0% █ (1 files, 53 LOC)

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
| `apps/web/src/App.tsx` | 1 | 17 | 0.9 |
| `apps/web/src/api.ts` | 17 | 0 | 0.8 |
| `apps/web/src/pages.test.tsx` | 0 | 15 | 0.8 |
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
- `@axis/repo-parser` @ workspace:*
- `@axis/snapshots` @ workspace:*
- `@jmondi/oauth2-server` @ ^4.2.2
- `jsonwebtoken` @ ^9.0.3
- `mppx` @ ^0.5.12
- `jszip` @ ^3.10.1
- `react` @ ^19.1.0
- `react-dom` @ ^19.1.0

## Source Entry Points

| File | Exports |
|------|---------|
| `apps/api/src/server.ts` | export const app = ... |
| `apps/web/src/App.tsx` | export function App() { ... } |
| `apps/web/src/main.tsx` | default |
| `packages/context-engine/src/index.ts` | export type { ... }, export { ... } |
| `packages/generator-core/src/index.ts` | export type { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... } |
| `packages/repo-parser/src/index.ts` | export type { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export type { ... }, export { ... }, export type { ... } |
| `packages/sdk/src/index.ts` | export interface AxisClientOptions { ... }, export interface FileEntry { ... }, export interface AnalyzeFilesInput { ... }, export interface AnalyzeRepoInput { ... }, export interface ArtifactEntry { ... }, export interface SnapshotResult { ... }, export interface HealthResponse { ... }, export interface McpToolCallResult { ... }, export interface OpenApiSpec { ... }, export class AxisClient { ... } |
| `packages/snapshots/src/index.ts` | export type { ... }, export { ... }, export { ... }, export type { ... }, export type { ... }, export { ... }, export type { ... }, export { ... }, export type { ... }, export type { ... }, export { ... }, export { ... }, export type { ... }, export { ... }, export type { ... }, export { ... }, export type { ... }, export { ... }, export { ... }, export type { ... }, export { ... }, export type { ... }, export { ... }, export type { ... }, export { ... }, export type { ... }, export { ... }, export type { ... }, export { ... }, export type { ... } |

## Reference Entry Point

### `packages/generator-core/src/index.ts`

```typescript
export type { GeneratedFile, GeneratorInput, GeneratorResult, SourceFile } from "./types.js";
export { generateFiles, listAvailableGenerators } from "./generate.js";
export { generateContextMapJSON, generateRepoProfileYAML, generateArchitectureSummary, generateDependencyHotspots } from "./generators-search.js";
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
export { generateMcpConfig, generateConnectorMap, generateCapabilityRegistry, generateServerManifest } from "./generators-mcp.js";
export { generateComponent, generateDashboardWidget, generateEmbedSnippet, generateArtifactSpec, generateComponentLibrary } from "./generators-artifacts.js";
export { generateRemotionScript, generateScenePlan, generateRenderConfig, generateAssetChecklist, generateStoryboard } from "./generators-remotion.js";
export { generateCanvasSpec, generateSocialPack, generatePosterLayouts, generateCanvasAssetGuidelines, generateBrandBoard } from "./generators-canvas.js";
export { generateGenerativeSketch, generateParameterPack, generateCollectionMap, generateExportManifest, generateVariationMatrix } from "./generators-algorithmic.js";
export { generateAgentPurchasingPlaybook, generateProductSchema, generateCheckoutFlow, generateNegotiationRules, generateCommerceRegistry } from "./generators-agentic-purchasing.js";

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
