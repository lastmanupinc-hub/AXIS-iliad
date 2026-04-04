import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, GeneratorInput, GeneratorResult } from "./types.js";
import { generateContextMapJSON, generateRepoProfileYAML, generateArchitectureSummary } from "./generators-search.js";
import { generateAgentsMD, generateClaudeMD, generateCursorRules } from "./generators-skills.js";
import { generateDebugPlaybook, generateIncidentTemplate, generateTracingRules } from "./generators-debug.js";
import { generateFrontendRules, generateComponentGuidelines } from "./generators-frontend.js";
import { generateSeoRules, generateSchemaRecommendations, generateRoutePriorityMap, generateContentAudit } from "./generators-seo.js";
import { generateOptimizationRules, generatePromptDiffReport, generateCostEstimate } from "./generators-optimization.js";
import { generateDesignTokens, generateThemeCss, generateThemeGuidelines, generateComponentThemeMap } from "./generators-theme.js";
import { generateBrandGuidelines, generateVoiceAndTone, generateContentConstraints, generateMessagingSystem } from "./generators-brand.js";
import { generateSuperpowerPack, generateWorkflowRegistry, generateTestGenerationRules, generateRefactorChecklist } from "./generators-superpowers.js";
import { generateCampaignBrief, generateFunnelMap, generateSequencePack, generateCroPlaybook } from "./generators-marketing.js";
import { generateNotebookSummary, generateSourceMap, generateStudyBrief, generateResearchThreads } from "./generators-notebook.js";
import { generateObsidianSkillPack, generateVaultRules, generateGraphPromptMap, generateLinkingPolicy } from "./generators-obsidian.js";

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
      files.push(generator(context_map, repo_profile));
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

export function listAvailableGenerators(): Array<{ path: string; program: string }> {
  return Object.entries(REGISTRY).map(([path, fn]) => {
    // Call with null to get metadata — safe because we only read path/program
    const dummy = fn as unknown as { toString: () => string };
    return { path, program: path.startsWith(".ai/") || path === "architecture-summary.md" ? "search" : "skills" };
  });
}
