import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, GeneratorInput, GeneratorResult, SourceFile } from "./types.js";
import { GENERATOR_PROGRAMS } from "./program-manifest.js";
import { verifyGeneratedFiles } from "./verify-harness.js";
import { generateContextMapJSON, generateRepoProfileYAML, generateArchitectureSummary, generateDependencyHotspots, generateSymbolIndex, generateRepoRunStats } from "./generators-search.js";
import { generateAgentsMD, generateClaudeMD, generateCursorRules, generateWorkflowPack, generatePolicyPack, generateModelCascade } from "./generators-skills.js";
import { generateDebugPlaybook, generateIncidentTemplate, generateTracingRules, generateRootCauseChecklist } from "./generators-debug.js";
import { generateFrontendRules, generateComponentGuidelines, generateLayoutPatterns, generateUiAudit } from "./generators-frontend.js";
import { generateSeoRules, generateSchemaRecommendations, generateRoutePriorityMap, generateContentAudit, generateMetaTagAudit, generateSeoHeadTags } from "./generators-seo.js";
import { generateOptimizationRules, generatePromptDiffReport, generateCostEstimate, generateTokenBudgetPlan } from "./generators-optimization.js";
import { generateDesignTokens, generateThemeCss, generateThemeGuidelines, generateComponentThemeMap, generateDarkModeTokens } from "./generators-theme.js";
import { generateBrandGuidelines, generateVoiceAndTone, generateContentConstraints, generateMessagingSystem, generateChannelRulebook } from "./generators-brand.js";
import { generateSuperpowerPack, generateWorkflowRegistry, generateTestGenerationRules, generateRefactorChecklist, generateAutomationPipeline } from "./generators-superpowers.js";
import { generateVerifyGate, generateVerifyFull, generatePrePushHook } from "./generators-verify-gate.js";
import { generateCampaignBrief, generateFunnelMap, generateSequencePack, generateCroPlaybook, generateAbTestPlan } from "./generators-marketing.js";
import { generateNotebookSummary, generateSourceMap, generateStudyBrief, generateResearchThreads, generateCitationIndex } from "./generators-notebook.js";
import { generateObsidianSkillPack, generateVaultRules, generateGraphPromptMap, generateLinkingPolicy, generateTemplatePack } from "./generators-obsidian.js";
import { generateMcpConfig, generateMcpRegistryMetadata, generateProtocolSpec, generateSpecTypes, generateMcpReadme, generateProjectSetupGuide, generateBuildArtifactsGuide, generateRootPackageJsonTemplate, generatePackagePackageJsonTemplate, generateRootTsconfigTemplate, generatePackageTsconfigTemplate, generateMonorepoStructureGuide, generateCoreImplementationArtifactsGuide, generateTestingDocumentationPolishArtifactsGuide, generateConnectorMap, generateCapabilityRegistry, generateServerManifest, generateFintechMcpSurfacePackage, generateFintechDomainSchema } from "./generators-mcp.js";
import { generateComponent, generateDashboardWidget, generateEmbedSnippet, generateArtifactSpec, generateComponentLibrary, generatePrd, generateDesignDoc, generateTasksMd, generateContextMd, generateIndexHtml, generateCapabilityMap } from "./generators-artifacts.js";
import { generateRemotionScript, generateScenePlan, generateRenderConfig, generateAssetChecklist, generateStoryboard } from "./generators-remotion.js";
import { generateCanvasSpec, generateSocialPack, generatePosterLayouts, generateCanvasAssetGuidelines, generateBrandBoard, generateArchitectureDiagram } from "./generators-canvas.js";
import { generateGenerativeSketch, generateParameterPack, generateCollectionMap, generateExportManifest, generateVariationMatrix } from "./generators-algorithmic.js";
import { generateAgentPurchasingPlaybook, generateProductSchema, generateCheckoutFlow, generateNegotiationRules, generateCommerceRegistry, generateAp2InteropSamples } from "./generators-agentic-purchasing.js";
import {
  generatePackagingReadme,
  generatePackagingLicense,
  generateCloserDockerfile,
  generateCloserDockerCompose,
  generateCloserCiWorkflow,
  generateCloserReleaseWorkflow,
  generateCloserManifestNpm,
  generateCloserManifestUnreal,
  generateCloserManifestVsCode,
  generateCloserManifestDockerHub,
  generateCloserManifestGitHubMarketplace,
  generateCloserTrustAttestation,
  generateCloserMerkleProof,
  generateCloserPackagingReport,
  generateDistributableGuide,
  generateMakefileWithShipTarget,
} from "./generators-closer.js";
import {
  generateDeployDockerfile,
  generateDeployDockerignore,
  generateDeployComposeDev,
  generateDeployRenderBlueprint,
  generateDeployScriptBash,
  generateDeployScriptPwsh,
  generateDeployVSCodeLaunchTemplate,
  generateDeployWranglerPages,
  generateDeployWranglerContainers,
  generateDeployContainersWorker,
  generateDeployScriptCloudflareBash,
  generateDeployScriptCloudflarePwsh,
  generateDeployQualificationReport,
} from "./generators-deploy.js";

type GeneratorFn = (ctx: ContextMap, profile: RepoProfile, files?: SourceFile[]) => GeneratedFile;

const REGISTRY: Record<string, GeneratorFn> = {
  "context-map.json": (ctx, _p, files) => generateContextMapJSON(ctx, files),
  "repo-profile.yaml": (_ctx, profile, files) => generateRepoProfileYAML(profile, files),
  "architecture-summary.md": (ctx, _p, files) => generateArchitectureSummary(ctx, files),
  "AGENTS.md": (ctx, _p, files) => generateAgentsMD(ctx, files),
  "CLAUDE.md": (ctx, _p, files) => generateClaudeMD(ctx, files),
  ".cursorrules": (ctx, _p, files) => generateCursorRules(ctx, files),
  "debug-playbook.md": (ctx, _p, files) => generateDebugPlaybook(ctx, files),
  "incident-template.md": (ctx, _p, files) => generateIncidentTemplate(ctx, files),
  "tracing-rules.md": (ctx, _p, files) => generateTracingRules(ctx, files),
  "frontend-rules.md": (ctx, _p, files) => generateFrontendRules(ctx, files),
  "component-guidelines.md": (ctx, _p, files) => generateComponentGuidelines(ctx, files),
  "seo-rules.md": (ctx, _p, files) => generateSeoRules(ctx, files),
  "schema-recommendations.json": (ctx, _p, files) => generateSchemaRecommendations(ctx, files),
  "route-priority-map.md": (ctx, _p, files) => generateRoutePriorityMap(ctx, files),
  "content-audit.md": (ctx, _p, files) => generateContentAudit(ctx, files),
  "optimization-rules.md": (ctx, _p, files) => generateOptimizationRules(ctx, files),
  "prompt-diff-report.md": (ctx, profile, files) => generatePromptDiffReport(ctx, profile, files),
  "cost-estimate.json": (ctx, profile, files) => generateCostEstimate(ctx, profile, files),
  "design-tokens.json": (ctx, _p, files) => generateDesignTokens(ctx, files),
  "theme.css": (ctx, _p, files) => generateThemeCss(ctx, files),
  "theme-guidelines.md": (ctx, _p, files) => generateThemeGuidelines(ctx, files),
  "component-theme-map.json": (ctx, _p, files) => generateComponentThemeMap(ctx, files),
  "brand-guidelines.md": (ctx, _p, files) => generateBrandGuidelines(ctx, files),
  "voice-and-tone.md": (ctx, _p, files) => generateVoiceAndTone(ctx, files),
  "content-constraints.md": (ctx, _p, files) => generateContentConstraints(ctx, files),
  "messaging-system.yaml": (ctx, _p, files) => generateMessagingSystem(ctx, files),
  "superpower-pack.md": (ctx, _p, files) => generateSuperpowerPack(ctx, files),
  "workflow-registry.json": (ctx, profile, files) => generateWorkflowRegistry(ctx, profile, files),
  "test-generation-rules.md": (ctx, _p, files) => generateTestGenerationRules(ctx, files),
  "refactor-checklist.md": (ctx, _p, files) => generateRefactorChecklist(ctx, files),
  "campaign-brief.md": (ctx, _p, files) => generateCampaignBrief(ctx, files),
  "funnel-map.md": (ctx, _p, files) => generateFunnelMap(ctx, files),
  "sequence-pack.md": (ctx, _p, files) => generateSequencePack(ctx, files),
  "cro-playbook.md": (ctx, _p, files) => generateCroPlaybook(ctx, files),
  "notebook-summary.md": (ctx, _p, files) => generateNotebookSummary(ctx, files),
  "source-map.json": (ctx, _p, files) => generateSourceMap(ctx, files),
  "study-brief.md": (ctx, _p, files) => generateStudyBrief(ctx, files),
  "research-threads.md": (ctx, _p, files) => generateResearchThreads(ctx, files),
  "obsidian-skill-pack.md": (ctx, _p, files) => generateObsidianSkillPack(ctx, files),
  "vault-rules.md": (ctx, _p, files) => generateVaultRules(ctx, files),
  "graph-prompt-map.json": (ctx, _p, files) => generateGraphPromptMap(ctx, files),
  "linking-policy.md": (ctx, _p, files) => generateLinkingPolicy(ctx, files),
  "mcp-config.json": (ctx, profile, files) => generateMcpConfig(ctx, profile, files),
  "mcp-registry-metadata.json": (ctx, profile, files) => generateMcpRegistryMetadata(ctx, profile, files),
  "protocol-spec.md": (ctx, _p, _files) => generateProtocolSpec(ctx),
  "spec.types.ts": (ctx, _p, _files) => generateSpecTypes(ctx),
  "mcp/README.md": (ctx, profile, _files) => generateMcpReadme(ctx, profile),
  "mcp/project-setup.md": (ctx, _p, _files) => generateProjectSetupGuide(ctx),
  "mcp/build-artifacts.md": (ctx, _p, _files) => generateBuildArtifactsGuide(ctx),
  "mcp/package-json.root.template.json": (ctx, _p, _files) => generateRootPackageJsonTemplate(ctx),
  "mcp/package-json.package.template.json": (ctx, _p, _files) => generatePackagePackageJsonTemplate(ctx),
  "mcp/tsconfig.root.template.json": (ctx, _p, _files) => generateRootTsconfigTemplate(ctx),
  "mcp/tsconfig.package.template.json": (ctx, _p, _files) => generatePackageTsconfigTemplate(ctx),
  "mcp/monorepo-structure.md": (ctx, _p, _files) => generateMonorepoStructureGuide(ctx),
  "mcp/core-implementation-artifacts.md": (ctx, _p, _files) => generateCoreImplementationArtifactsGuide(ctx),
  "mcp/testing-documentation-polish-artifacts.md": (ctx, _p, _files) => generateTestingDocumentationPolishArtifactsGuide(ctx),
  "connector-map.yaml": (ctx, _p, files) => generateConnectorMap(ctx, files),
  "capability-registry.json": (ctx, _p, files) => generateCapabilityRegistry(ctx, files),
  "mcp/fintech-mcp-surface-package.md": (ctx, profile, files) => generateFintechMcpSurfacePackage(ctx, profile, files),
  "mcp/fintech-domain-schema.yaml": (ctx, profile, files) => generateFintechDomainSchema(ctx, profile, files),
  "generated-component.tsx": (ctx, _p, files) => generateComponent(ctx, files),
  "dashboard-widget.tsx": (ctx, _p, files) => generateDashboardWidget(ctx, files),
  "embed-snippet.ts": (ctx, _p, files) => generateEmbedSnippet(ctx, files),
  "artifact-spec.md": (ctx, profile, files) => generateArtifactSpec(ctx, profile, files),
  "prd.md": (ctx, profile, files) => generatePrd(ctx, profile, files),
  "design.md": (ctx, profile, files) => generateDesignDoc(ctx, profile, files),
  "tasks.md": (ctx, profile, files) => generateTasksMd(ctx, profile, files),
  "context.md": (ctx, profile, files) => generateContextMd(ctx, profile, files),
  "index.html": (ctx, profile, files) => generateIndexHtml(ctx, profile, files),
  "capability-map.yaml": (ctx, profile, files) => generateCapabilityMap(ctx, profile, files),
  "remotion-script.ts": (ctx, _p, files) => generateRemotionScript(ctx, files),
  "scene-plan.md": (ctx, _p, files) => generateScenePlan(ctx, files),
  "render-config.json": (ctx, profile, files) => generateRenderConfig(ctx, profile, files),
  "asset-checklist.md": (ctx, _p, files) => generateAssetChecklist(ctx, files),
  "canvas-spec.json": (ctx, profile, files) => generateCanvasSpec(ctx, profile, files),
  "social-pack.md": (ctx, _p, files) => generateSocialPack(ctx, files),
  "poster-layouts.md": (ctx, _p, files) => generatePosterLayouts(ctx, files),
  "asset-guidelines.md": (ctx, _p, files) => generateCanvasAssetGuidelines(ctx, files),
  "architecture-diagram.d2": (ctx, profile, files) => generateArchitectureDiagram(ctx, profile, files),
  "generative-sketch.ts": (ctx, _p, files) => generateGenerativeSketch(ctx, files),
  "parameter-pack.json": (ctx, _p, files) => generateParameterPack(ctx, files),
  "collection-map.md": (ctx, _p, files) => generateCollectionMap(ctx, files),
  "export-manifest.yaml": (ctx, profile, files) => generateExportManifest(ctx, profile, files),
  // ─── depth generators ───────────────────────────────────────
  "dependency-hotspots.md": (ctx, _p, files) => generateDependencyHotspots(ctx, files),
  "symbol-index.json": (ctx, _p, files) => generateSymbolIndex(files, ctx.generated_at),
  "repo-run-stats.json": (ctx, _p, files) => generateRepoRunStats(ctx, _p, files),
  "root-cause-checklist.md": (ctx, _p, files) => generateRootCauseChecklist(ctx, files),
  "workflow-pack.md": (ctx, _p, files) => generateWorkflowPack(ctx, files),
  "policy-pack.md": (ctx, _p, files) => generatePolicyPack(ctx, files),
  "model-cascade.md": (ctx, _p, files) => generateModelCascade(ctx, files),
  "layout-patterns.md": (ctx, _p, files) => generateLayoutPatterns(ctx, files),
  "ui-audit.md": (ctx, _p, files) => generateUiAudit(ctx, files),
  "meta-tag-audit.json": (ctx, _p, files) => generateMetaTagAudit(ctx, files),
  "seo-head-tags.html": (ctx, _p, files) => generateSeoHeadTags(ctx, files),
  "token-budget-plan.md": (ctx, profile, files) => generateTokenBudgetPlan(ctx, profile, files),
  "dark-mode-tokens.json": (ctx, _p, files) => generateDarkModeTokens(ctx, files),
  "channel-rulebook.md": (ctx, _p, files) => generateChannelRulebook(ctx, files),
  "ab-test-plan.md": (ctx, _p, files) => generateAbTestPlan(ctx, files),
  "citation-index.json": (ctx, _p, files) => generateCitationIndex(ctx, files),
  "server-manifest.yaml": (ctx, profile, files) => generateServerManifest(ctx, profile, files),
  "template-pack.md": (ctx, _p, files) => generateTemplatePack(ctx, files),
  "automation-pipeline.yaml": (ctx, profile, files) => generateAutomationPipeline(ctx, profile, files),
  "verify.sh": (ctx, profile, files) => generateVerifyGate(ctx, profile, files),
  "verify-full.sh": (ctx, profile, files) => generateVerifyFull(ctx, profile, files),
  ".githooks/pre-push": (ctx, profile, files) => generatePrePushHook(ctx, profile, files),
  "component-library.json": (ctx, _p, files) => generateComponentLibrary(ctx, files),
  "storyboard.md": (ctx, _p, files) => generateStoryboard(ctx, files),
  "brand-board.md": (ctx, _p, files) => generateBrandBoard(ctx, files),
  "variation-matrix.json": (ctx, _p, files) => generateVariationMatrix(ctx, files),
  // ─── agentic purchasing generators ─────────────────────────
  "agent-purchasing-playbook.md": (ctx, profile, files) => generateAgentPurchasingPlaybook(ctx, profile, files),
  "product-schema.json":          (ctx, profile, files) => generateProductSchema(ctx, profile, files),
  "checkout-flow.md":             (ctx, profile, files) => generateCheckoutFlow(ctx, profile, files),
  "negotiation-rules.md":         (ctx, profile, files) => generateNegotiationRules(ctx, profile, files),
  "commerce-registry.json":       (ctx, profile, files) => generateCommerceRegistry(ctx, profile, files),
  "ap2-interop-samples.json":     (ctx, profile, files) => generateAp2InteropSamples(ctx, profile, files),
  // ─── closer generators ─────────────────────────────────────
  "packaging/README.md": (ctx, profile, files) => generatePackagingReadme(ctx, profile, files),
  "packaging/LICENSE": (ctx, profile, files) => generatePackagingLicense(ctx, profile, files),
  "Dockerfile": (ctx, profile, files) => generateCloserDockerfile(ctx, profile, files),
  "docker-compose.yml": (ctx, profile, files) => generateCloserDockerCompose(ctx, profile, files),
  ".github/workflows/ci.yml": (ctx, profile, files) => generateCloserCiWorkflow(ctx, profile, files),
  ".github/workflows/release.yml": (ctx, profile, files) => generateCloserReleaseWorkflow(ctx, profile, files),
  "packaging/manifests/npm-package.json": (ctx, profile, files) => generateCloserManifestNpm(ctx, profile, files),
  "packaging/manifests/unreal.uplugin": (ctx, profile, files) => generateCloserManifestUnreal(ctx, profile, files),
  "packaging/manifests/vscode-extension.json": (ctx, profile, files) => generateCloserManifestVsCode(ctx, profile, files),
  "packaging/manifests/dockerhub-repository.md": (ctx, profile, files) => generateCloserManifestDockerHub(ctx, profile, files),
  "packaging/manifests/github-marketplace-listing.md": (ctx, profile, files) => generateCloserManifestGitHubMarketplace(ctx, profile, files),
  "packaging/trust-fabric/attestation.json": (ctx, profile, files) => generateCloserTrustAttestation(ctx, profile, files),
  "packaging/trust-fabric/merkle-proof.json": (ctx, profile, files) => generateCloserMerkleProof(ctx, profile, files),
  "packaging-report.md": (ctx, profile, files) => generateCloserPackagingReport(ctx, profile, files),
  "DISTRIBUTABLE.md": (ctx, profile, files) => generateDistributableGuide(ctx, profile, files),
  "Makefile": (ctx, profile, files) => generateMakefileWithShipTarget(ctx, profile, files),
  // ─── deploy generators (zero-pipeline-minutes Render existing-image flow) ──
  "deploy/Dockerfile": (ctx, profile, files) => generateDeployDockerfile(ctx, profile, files),
  "deploy/Dockerfile.dockerignore": (ctx, profile, files) => generateDeployDockerignore(ctx, profile, files),
  "deploy/docker-compose.dev.yml": (ctx, profile, files) => generateDeployComposeDev(ctx, profile, files),
  "deploy/render.yaml": (ctx, profile, files) => generateDeployRenderBlueprint(ctx, profile, files),
  "deploy/deploy.sh": (ctx, profile, files) => generateDeployScriptBash(ctx, profile, files),
  "deploy/deploy.ps1": (ctx, profile, files) => generateDeployScriptPwsh(ctx, profile, files),
  "deploy/vscode-launch.json.template": (ctx, profile, files) => generateDeployVSCodeLaunchTemplate(ctx, profile, files),
  "deploy/wrangler.pages.toml": (ctx, profile, files) => generateDeployWranglerPages(ctx, profile, files),
  "deploy/wrangler.containers.toml": (ctx, profile, files) => generateDeployWranglerContainers(ctx, profile, files),
  "deploy/worker.ts": (ctx, profile, files) => generateDeployContainersWorker(ctx, profile, files),
  "deploy/deploy-cloudflare.sh": (ctx, profile, files) => generateDeployScriptCloudflareBash(ctx, profile, files),
  "deploy/deploy-cloudflare.ps1": (ctx, profile, files) => generateDeployScriptCloudflarePwsh(ctx, profile, files),
  "deploy/deploy-qualification-report.md": (ctx, profile, files) => generateDeployQualificationReport(ctx, profile, files),
};

// Aliases (user may request with legacy `.ai/` prefix or other naming).
// Canonical paths are bare basenames — the writer/exporter prepends the
// output directory. Legacy `.ai/foo` requests resolve to the bare name.
const ALIASES: Record<string, string> = {
  "CURSOR.md": ".cursorrules",
  ".ai/context-map.json": "context-map.json",
  ".ai/repo-profile.yaml": "repo-profile.yaml",
  ".ai/project-profile.yaml": "repo-profile.yaml",
  ".ai/debug-playbook.md": "debug-playbook.md",
  ".ai/frontend-rules.md": "frontend-rules.md",
  ".ai/seo-rules.md": "seo-rules.md",
  ".ai/optimization-rules.md": "optimization-rules.md",
  ".ai/design-tokens.json": "design-tokens.json",
  ".ai/symbol-index.json": "symbol-index.json",
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
  outputSet.add("context-map.json");
  outputSet.add("repo-profile.yaml");
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
    // Snapshot-derived timestamp — same input must produce byte-identical output.
    generated_at: context_map.generated_at,
    files: deduped,
    skipped,
    verification: verifyGeneratedFiles(deduped),
  };
}

// ─── Program classification for each generator output ─────────

export function listAvailableGenerators(): Array<{ path: string; program: string }> {
  return Object.keys(REGISTRY).map(path => ({
    path,
    /* v8 ignore start — all paths have known programs; defensive fallback */
    program: GENERATOR_PROGRAMS[path] ?? "unknown",
    /* v8 ignore stop */
  }));
}

/** Canonical artifact count — derived from REGISTRY so it cannot drift. */
export const TOTAL_GENERATORS = Object.keys(REGISTRY).length;

/** Canonical program count — derived from GENERATOR_PROGRAMS so it cannot drift. */
export const TOTAL_PROGRAMS = new Set(Object.values(GENERATOR_PROGRAMS)).size;
