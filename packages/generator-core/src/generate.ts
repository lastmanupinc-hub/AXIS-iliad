import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, GeneratorInput, GeneratorResult, SourceFile } from "./types.js";
import { generateContextMapJSON, generateRepoProfileYAML, generateArchitectureSummary, generateDependencyHotspots } from "./generators-search.js";
import { generateAgentsMD, generateClaudeMD, generateCursorRules, generateWorkflowPack, generatePolicyPack } from "./generators-skills.js";
import { generateDebugPlaybook, generateIncidentTemplate, generateTracingRules, generateRootCauseChecklist } from "./generators-debug.js";
import { generateFrontendRules, generateComponentGuidelines, generateLayoutPatterns, generateUiAudit } from "./generators-frontend.js";
import { generateSeoRules, generateSchemaRecommendations, generateRoutePriorityMap, generateContentAudit, generateMetaTagAudit } from "./generators-seo.js";
import { generateOptimizationRules, generatePromptDiffReport, generateCostEstimate, generateTokenBudgetPlan } from "./generators-optimization.js";
import { generateDesignTokens, generateThemeCss, generateThemeGuidelines, generateComponentThemeMap, generateDarkModeTokens } from "./generators-theme.js";
import { generateBrandGuidelines, generateVoiceAndTone, generateContentConstraints, generateMessagingSystem, generateChannelRulebook } from "./generators-brand.js";
import { generateSuperpowerPack, generateWorkflowRegistry, generateTestGenerationRules, generateRefactorChecklist, generateAutomationPipeline } from "./generators-superpowers.js";
import { generateCampaignBrief, generateFunnelMap, generateSequencePack, generateCroPlaybook, generateAbTestPlan } from "./generators-marketing.js";
import { generateNotebookSummary, generateSourceMap, generateStudyBrief, generateResearchThreads, generateCitationIndex } from "./generators-notebook.js";
import { generateObsidianSkillPack, generateVaultRules, generateGraphPromptMap, generateLinkingPolicy, generateTemplatePack } from "./generators-obsidian.js";
import { generateMcpConfig, generateConnectorMap, generateCapabilityRegistry, generateServerManifest } from "./generators-mcp.js";
import { generateComponent, generateDashboardWidget, generateEmbedSnippet, generateArtifactSpec, generateComponentLibrary } from "./generators-artifacts.js";
import { generateRemotionScript, generateScenePlan, generateRenderConfig, generateAssetChecklist, generateStoryboard } from "./generators-remotion.js";
import { generateCanvasSpec, generateSocialPack, generatePosterLayouts, generateCanvasAssetGuidelines, generateBrandBoard } from "./generators-canvas.js";
import { generateGenerativeSketch, generateParameterPack, generateCollectionMap, generateExportManifest, generateVariationMatrix } from "./generators-algorithmic.js";

type GeneratorFn = (ctx: ContextMap, profile: RepoProfile, files?: SourceFile[]) => GeneratedFile;

const REGISTRY: Record<string, GeneratorFn> = {
  ".ai/context-map.json": (ctx) => generateContextMapJSON(ctx),
  ".ai/repo-profile.yaml": (_ctx, profile) => generateRepoProfileYAML(profile),
  "architecture-summary.md": (ctx, _p, files) => generateArchitectureSummary(ctx, files),
  "AGENTS.md": (ctx, _p, files) => generateAgentsMD(ctx, files),
  "CLAUDE.md": (ctx, _p, files) => generateClaudeMD(ctx, files),
  ".cursorrules": (ctx, _p, files) => generateCursorRules(ctx, files),
  ".ai/debug-playbook.md": (ctx, _p, files) => generateDebugPlaybook(ctx, files),
  "incident-template.md": (ctx, _p, files) => generateIncidentTemplate(ctx, files),
  "tracing-rules.md": (ctx, _p, files) => generateTracingRules(ctx, files),
  ".ai/frontend-rules.md": (ctx, _p, files) => generateFrontendRules(ctx, files),
  "component-guidelines.md": (ctx, _p, files) => generateComponentGuidelines(ctx, files),
  ".ai/seo-rules.md": (ctx, _p, files) => generateSeoRules(ctx, files),
  "schema-recommendations.json": (ctx, _p, files) => generateSchemaRecommendations(ctx, files),
  "route-priority-map.md": (ctx, _p, files) => generateRoutePriorityMap(ctx, files),
  "content-audit.md": (ctx, _p, files) => generateContentAudit(ctx, files),
  ".ai/optimization-rules.md": (ctx, _p, files) => generateOptimizationRules(ctx, files),
  "prompt-diff-report.md": (ctx, profile) => generatePromptDiffReport(ctx, profile),
  "cost-estimate.json": (ctx, profile) => generateCostEstimate(ctx, profile),
  ".ai/design-tokens.json": (ctx) => generateDesignTokens(ctx),
  "theme.css": (ctx) => generateThemeCss(ctx),
  "theme-guidelines.md": (ctx) => generateThemeGuidelines(ctx),
  "component-theme-map.json": (ctx) => generateComponentThemeMap(ctx),
  "brand-guidelines.md": (ctx) => generateBrandGuidelines(ctx),
  "voice-and-tone.md": (ctx) => generateVoiceAndTone(ctx),
  "content-constraints.md": (ctx) => generateContentConstraints(ctx),
  "messaging-system.yaml": (ctx) => generateMessagingSystem(ctx),
  "superpower-pack.md": (ctx, _p, files) => generateSuperpowerPack(ctx, files),
  "workflow-registry.json": (ctx, profile) => generateWorkflowRegistry(ctx, profile),
  "test-generation-rules.md": (ctx, _p, files) => generateTestGenerationRules(ctx, files),
  "refactor-checklist.md": (ctx, _p, files) => generateRefactorChecklist(ctx, files),
  "campaign-brief.md": (ctx) => generateCampaignBrief(ctx),
  "funnel-map.md": (ctx) => generateFunnelMap(ctx),
  "sequence-pack.md": (ctx) => generateSequencePack(ctx),
  "cro-playbook.md": (ctx) => generateCroPlaybook(ctx),
  "notebook-summary.md": (ctx, _p, files) => generateNotebookSummary(ctx, files),
  "source-map.json": (ctx, _p, files) => generateSourceMap(ctx, files),
  "study-brief.md": (ctx, _p, files) => generateStudyBrief(ctx, files),
  "research-threads.md": (ctx, _p, files) => generateResearchThreads(ctx, files),
  "obsidian-skill-pack.md": (ctx) => generateObsidianSkillPack(ctx),
  "vault-rules.md": (ctx) => generateVaultRules(ctx),
  "graph-prompt-map.json": (ctx) => generateGraphPromptMap(ctx),
  "linking-policy.md": (ctx) => generateLinkingPolicy(ctx),
  "mcp-config.json": (ctx, profile, files) => generateMcpConfig(ctx, profile, files),
  "connector-map.yaml": (ctx, _p, files) => generateConnectorMap(ctx, files),
  "capability-registry.json": (ctx, _p, files) => generateCapabilityRegistry(ctx, files),
  "generated-component.tsx": (ctx, _p, files) => generateComponent(ctx, files),
  "dashboard-widget.tsx": (ctx, _p, files) => generateDashboardWidget(ctx, files),
  "embed-snippet.ts": (ctx, _p, files) => generateEmbedSnippet(ctx, files),
  "artifact-spec.md": (ctx, profile, files) => generateArtifactSpec(ctx, profile, files),
  "remotion-script.ts": (ctx) => generateRemotionScript(ctx),
  "scene-plan.md": (ctx) => generateScenePlan(ctx),
  "render-config.json": (ctx, profile) => generateRenderConfig(ctx, profile),
  "asset-checklist.md": (ctx) => generateAssetChecklist(ctx),
  "canvas-spec.json": (ctx, profile) => generateCanvasSpec(ctx, profile),
  "social-pack.md": (ctx) => generateSocialPack(ctx),
  "poster-layouts.md": (ctx) => generatePosterLayouts(ctx),
  "asset-guidelines.md": (ctx) => generateCanvasAssetGuidelines(ctx),
  "generative-sketch.ts": (ctx) => generateGenerativeSketch(ctx),
  "parameter-pack.json": (ctx) => generateParameterPack(ctx),
  "collection-map.md": (ctx) => generateCollectionMap(ctx),
  "export-manifest.yaml": (ctx, profile) => generateExportManifest(ctx, profile),
  // ─── depth generators ───────────────────────────────────────
  "dependency-hotspots.md": (ctx, _p, files) => generateDependencyHotspots(ctx, files),
  "root-cause-checklist.md": (ctx, _p, files) => generateRootCauseChecklist(ctx, files),
  "workflow-pack.md": (ctx) => generateWorkflowPack(ctx),
  "policy-pack.md": (ctx) => generatePolicyPack(ctx),
  "layout-patterns.md": (ctx, _p, files) => generateLayoutPatterns(ctx, files),
  "ui-audit.md": (ctx, _p, files) => generateUiAudit(ctx, files),
  "meta-tag-audit.json": (ctx, _p, files) => generateMetaTagAudit(ctx, files),
  "token-budget-plan.md": (ctx, profile) => generateTokenBudgetPlan(ctx, profile),
  "dark-mode-tokens.json": (ctx) => generateDarkModeTokens(ctx),
  "channel-rulebook.md": (ctx) => generateChannelRulebook(ctx),
  "ab-test-plan.md": (ctx) => generateAbTestPlan(ctx),
  "citation-index.json": (ctx, _p, files) => generateCitationIndex(ctx, files),
  "server-manifest.yaml": (ctx, profile, files) => generateServerManifest(ctx, profile, files),
  "template-pack.md": (ctx) => generateTemplatePack(ctx),
  "automation-pipeline.yaml": (ctx, profile) => generateAutomationPipeline(ctx, profile),
  "component-library.json": (ctx, _p, files) => generateComponentLibrary(ctx, files),
  "storyboard.md": (ctx) => generateStoryboard(ctx),
  "brand-board.md": (ctx) => generateBrandBoard(ctx),
  "variation-matrix.json": (ctx) => generateVariationMatrix(ctx),
};

// Aliases (user may request with different naming)
const ALIASES: Record<string, string> = {
  "CURSOR.md": ".cursorrules",
  "context-map.json": ".ai/context-map.json",
  "repo-profile.yaml": ".ai/repo-profile.yaml",
  ".ai/project-profile.yaml": ".ai/repo-profile.yaml",
  "debug-playbook.md": ".ai/debug-playbook.md",
  "frontend-rules.md": ".ai/frontend-rules.md",
  "seo-rules.md": ".ai/seo-rules.md",
  "optimization-rules.md": ".ai/optimization-rules.md",
  "design-tokens.json": ".ai/design-tokens.json",
};

/** Validate a GeneratedFile has all required non-empty string fields. Returns error message or null. */
function validateGeneratedFile(file: unknown, expected_path: string): string | null {
  if (typeof file !== "object" || file === null) return "Generator returned non-object";
  const f = file as Record<string, unknown>;
  if (typeof f.path !== "string" || f.path.length === 0) return "Missing or empty 'path'";
  if (typeof f.content !== "string" || f.content.length === 0) return `Empty content for ${expected_path}`;
  if (typeof f.content_type !== "string" || f.content_type.length === 0) return "Missing 'content_type'";
  if (typeof f.program !== "string" || f.program.length === 0) return "Missing 'program'";
  if (typeof f.description !== "string" || f.description.length === 0) return "Missing 'description'";
  return null;
}

export function generateFiles(input: GeneratorInput): GeneratorResult {
  const { context_map, repo_profile, requested_outputs, source_files } = input;
  const files: GeneratedFile[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];

  // Always include the core search outputs
  const outputSet = new Set(requested_outputs);
  outputSet.add(".ai/context-map.json");
  outputSet.add(".ai/repo-profile.yaml");
  outputSet.add("architecture-summary.md");

  for (const requested of outputSet) {
    const resolved = ALIASES[requested] ?? requested;
    const generator = REGISTRY[resolved];

    if (generator) {
      try {
        const file = generator(context_map, repo_profile, source_files);
        const validation = validateGeneratedFile(file, resolved);
        if (validation) {
          skipped.push({ path: resolved, reason: validation });
        } else {
          files.push(file);
        }
      } catch (err) {
        skipped.push({
          path: resolved,
          reason: `Generator error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else {
      skipped.push({ path: requested, reason: "No generator registered for this output" });
    }
  }

  // Deduplicate by path (in case aliases pointed to already-included outputs)
  const seen = new Set<string>();
  const deduped = files.filter(f => {
    if (seen.has(f.path)) return false;
    seen.add(f.path);
    return true;
  });

  return {
    snapshot_id: context_map.snapshot_id,
    project_id: context_map.project_id,
    generated_at: new Date().toISOString(),
    files: deduped,
    skipped,
  };
}

// ─── Program classification for each generator output ─────────
const GENERATOR_PROGRAMS: Record<string, string> = {
  ".ai/context-map.json": "search",
  ".ai/repo-profile.yaml": "search",
  "architecture-summary.md": "search",
  "dependency-hotspots.md": "search",
  "AGENTS.md": "skills",
  "CLAUDE.md": "skills",
  ".cursorrules": "skills",
  "workflow-pack.md": "skills",
  "policy-pack.md": "skills",
  ".ai/debug-playbook.md": "debug",
  "incident-template.md": "debug",
  "tracing-rules.md": "debug",
  "root-cause-checklist.md": "debug",
  ".ai/frontend-rules.md": "frontend",
  "component-guidelines.md": "frontend",
  "layout-patterns.md": "frontend",
  "ui-audit.md": "frontend",
  ".ai/seo-rules.md": "seo",
  "schema-recommendations.json": "seo",
  "route-priority-map.md": "seo",
  "content-audit.md": "seo",
  "meta-tag-audit.json": "seo",
  ".ai/optimization-rules.md": "optimization",
  "prompt-diff-report.md": "optimization",
  "cost-estimate.json": "optimization",
  "token-budget-plan.md": "optimization",
  ".ai/design-tokens.json": "theme",
  "theme.css": "theme",
  "theme-guidelines.md": "theme",
  "component-theme-map.json": "theme",
  "dark-mode-tokens.json": "theme",
  "brand-guidelines.md": "brand",
  "voice-and-tone.md": "brand",
  "content-constraints.md": "brand",
  "messaging-system.yaml": "brand",
  "channel-rulebook.md": "brand",
  "superpower-pack.md": "superpowers",
  "workflow-registry.json": "superpowers",
  "test-generation-rules.md": "superpowers",
  "refactor-checklist.md": "superpowers",
  "automation-pipeline.yaml": "superpowers",
  "campaign-brief.md": "marketing",
  "funnel-map.md": "marketing",
  "sequence-pack.md": "marketing",
  "cro-playbook.md": "marketing",
  "ab-test-plan.md": "marketing",
  "notebook-summary.md": "notebook",
  "source-map.json": "notebook",
  "study-brief.md": "notebook",
  "research-threads.md": "notebook",
  "citation-index.json": "notebook",
  "obsidian-skill-pack.md": "obsidian",
  "vault-rules.md": "obsidian",
  "graph-prompt-map.json": "obsidian",
  "linking-policy.md": "obsidian",
  "template-pack.md": "obsidian",
  "mcp-config.json": "mcp",
  "connector-map.yaml": "mcp",
  "capability-registry.json": "mcp",
  "server-manifest.yaml": "mcp",
  "generated-component.tsx": "artifacts",
  "dashboard-widget.tsx": "artifacts",
  "embed-snippet.ts": "artifacts",
  "artifact-spec.md": "artifacts",
  "component-library.json": "artifacts",
  "remotion-script.ts": "remotion",
  "scene-plan.md": "remotion",
  "render-config.json": "remotion",
  "asset-checklist.md": "remotion",
  "storyboard.md": "remotion",
  "canvas-spec.json": "canvas",
  "social-pack.md": "canvas",
  "poster-layouts.md": "canvas",
  "asset-guidelines.md": "canvas",
  "brand-board.md": "canvas",
  "generative-sketch.ts": "algorithmic",
  "parameter-pack.json": "algorithmic",
  "collection-map.md": "algorithmic",
  "export-manifest.yaml": "algorithmic",
  "variation-matrix.json": "algorithmic",
};

export function listAvailableGenerators(): Array<{ path: string; program: string }> {
  return Object.keys(REGISTRY).map(path => ({
    path,
    /* v8 ignore start — all paths have known programs; defensive fallback */
    program: GENERATOR_PROGRAMS[path] ?? "unknown",
    /* v8 ignore stop */
  }));
}
