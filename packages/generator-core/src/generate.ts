import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, GeneratorInput, GeneratorResult } from "./types.js";
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

type GeneratorFn = (ctx: ContextMap, profile: RepoProfile) => GeneratedFile;

const REGISTRY: Record<string, GeneratorFn> = {
  ".ai/context-map.json": (ctx) => generateContextMapJSON(ctx),
  ".ai/repo-profile.yaml": (_ctx, profile) => generateRepoProfileYAML(profile),
  "architecture-summary.md": (ctx) => generateArchitectureSummary(ctx),
  "AGENTS.md": (ctx) => generateAgentsMD(ctx),
  "CLAUDE.md": (ctx) => generateClaudeMD(ctx),
  ".cursorrules": (ctx) => generateCursorRules(ctx),
  ".ai/debug-playbook.md": (ctx) => generateDebugPlaybook(ctx),
  "incident-template.md": (ctx) => generateIncidentTemplate(ctx),
  "tracing-rules.md": (ctx) => generateTracingRules(ctx),
  ".ai/frontend-rules.md": (ctx) => generateFrontendRules(ctx),
  "component-guidelines.md": (ctx) => generateComponentGuidelines(ctx),
  ".ai/seo-rules.md": (ctx) => generateSeoRules(ctx),
  "schema-recommendations.json": (ctx) => generateSchemaRecommendations(ctx),
  "route-priority-map.md": (ctx) => generateRoutePriorityMap(ctx),
  "content-audit.md": (ctx) => generateContentAudit(ctx),
  ".ai/optimization-rules.md": (ctx) => generateOptimizationRules(ctx),
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
  "superpower-pack.md": (ctx) => generateSuperpowerPack(ctx),
  "workflow-registry.json": (ctx, profile) => generateWorkflowRegistry(ctx, profile),
  "test-generation-rules.md": (ctx) => generateTestGenerationRules(ctx),
  "refactor-checklist.md": (ctx) => generateRefactorChecklist(ctx),
  "campaign-brief.md": (ctx) => generateCampaignBrief(ctx),
  "funnel-map.md": (ctx) => generateFunnelMap(ctx),
  "sequence-pack.md": (ctx) => generateSequencePack(ctx),
  "cro-playbook.md": (ctx) => generateCroPlaybook(ctx),
  "notebook-summary.md": (ctx) => generateNotebookSummary(ctx),
  "source-map.json": (ctx) => generateSourceMap(ctx),
  "study-brief.md": (ctx) => generateStudyBrief(ctx),
  "research-threads.md": (ctx) => generateResearchThreads(ctx),
  "obsidian-skill-pack.md": (ctx) => generateObsidianSkillPack(ctx),
  "vault-rules.md": (ctx) => generateVaultRules(ctx),
  "graph-prompt-map.json": (ctx) => generateGraphPromptMap(ctx),
  "linking-policy.md": (ctx) => generateLinkingPolicy(ctx),
  "mcp-config.json": (ctx, profile) => generateMcpConfig(ctx, profile),
  "connector-map.yaml": (ctx) => generateConnectorMap(ctx),
  "capability-registry.json": (ctx) => generateCapabilityRegistry(ctx),
  "generated-component.tsx": (ctx) => generateComponent(ctx),
  "dashboard-widget.tsx": (ctx) => generateDashboardWidget(ctx),
  "embed-snippet.ts": (ctx) => generateEmbedSnippet(ctx),
  "artifact-spec.md": (ctx, profile) => generateArtifactSpec(ctx, profile),
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
  "dependency-hotspots.md": (ctx) => generateDependencyHotspots(ctx),
  "root-cause-checklist.md": (ctx) => generateRootCauseChecklist(ctx),
  "workflow-pack.md": (ctx) => generateWorkflowPack(ctx),
  "policy-pack.md": (ctx) => generatePolicyPack(ctx),
  "layout-patterns.md": (ctx) => generateLayoutPatterns(ctx),
  "ui-audit.md": (ctx) => generateUiAudit(ctx),
  "meta-tag-audit.json": (ctx) => generateMetaTagAudit(ctx),
  "token-budget-plan.md": (ctx, profile) => generateTokenBudgetPlan(ctx, profile),
  "dark-mode-tokens.json": (ctx) => generateDarkModeTokens(ctx),
  "channel-rulebook.md": (ctx) => generateChannelRulebook(ctx),
  "ab-test-plan.md": (ctx) => generateAbTestPlan(ctx),
  "citation-index.json": (ctx) => generateCitationIndex(ctx),
  "server-manifest.yaml": (ctx, profile) => generateServerManifest(ctx, profile),
  "template-pack.md": (ctx) => generateTemplatePack(ctx),
  "automation-pipeline.yaml": (ctx, profile) => generateAutomationPipeline(ctx, profile),
  "component-library.json": (ctx) => generateComponentLibrary(ctx),
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
  const { context_map, repo_profile, requested_outputs } = input;
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
        const file = generator(context_map, repo_profile);
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
    program: GENERATOR_PROGRAMS[path] ?? "unknown",
  }));
}
