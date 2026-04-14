# Artifact Specification — axis-toolbox

Generated: 2026-04-14T13:11:11.973Z

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 500 files across 20 top-level directories. It defines 152 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Project Identity

| Field | Value |
|-------|-------|
| Name | axis-toolbox |
| Type | monorepo |
| Language | TypeScript |
| Frameworks | React |

## Language Distribution

- **TypeScript**: 69.6% ██████████████ (250 files, 78844 LOC)
- **JSON**: 11.2% ██ (63 files, 12643 LOC)
- **YAML**: 9.6% ██ (68 files, 10876 LOC)
- **Markdown**: 8.1% ██ (106 files, 9235 LOC)
- **CSS**: 0.7% █ (2 files, 849 LOC)
- **JavaScript**: 0.6% █ (3 files, 673 LOC)
- **HTML**: 0.1% █ (1 files, 120 LOC)
- **Dockerfile**: 0% █ (1 files, 49 LOC)
- **PowerShell**: 0% █ (1 files, 21 LOC)
- **Shell**: 0% █ (1 files, 14 LOC)

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
| `apps/web/src/api.ts` | 16 | 0 | 0.8 |
| `apps/web/src/pages/DashboardPage.tsx` | 1 | 9 | 0.5 |
| `apps/web/src/components/Toast.tsx` | 3 | 0 | 0.1 |
| `apps/web/src/components/AxisIcons.tsx` | 3 | 0 | 0.1 |
| `apps/web/src/upload-utils.ts` | 3 | 0 | 0.1 |

## Artifact Generation Rules

When generating artifacts for this project:

1. **Component artifacts** should use React conventions
2. **Widget artifacts** should render project metrics from real data
3. **Embed snippets** should include all conventions and warnings
4. **File naming** should follow TypeScript conventions
5. **Architecture score**: 0.64/100

## Dependencies (Top 10)

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

## Source Entry Points

| File | Exports |
|------|---------|
| `apps/api/src/server.ts` | export const app = ... |
| `apps/web/src/App.tsx` | export function App() { ... } |
| `apps/web/src/main.tsx` | default |
| `packages/context-engine/src/index.ts` | export type { ... }, export { ... } |
| `packages/generator-core/src/index.ts` | export type { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... } |
| `packages/repo-parser/src/index.ts` | export type { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export type { ... }, export { ... }, export type { ... } |
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
