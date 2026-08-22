export type { GeneratedFile, GeneratorInput, GeneratorResult, SourceFile } from "./types.js";
export { generateFiles, listAvailableGenerators, TOTAL_GENERATORS, TOTAL_PROGRAMS } from "./generate.js";
export { GENERATOR_PROGRAMS, PROGRAM_ORDER, PROGRAM_OUTPUT_COUNTS } from "./program-manifest.js";
export { verifyGeneratedFiles } from "./verify-harness.js";
export type { ProgramVerifyResult, VerifyEvidence } from "./verify-harness.js";
export { PRODUCT_REGISTRY, PRODUCT_IDS, productIdForProgram, getProduct } from "./product-registry.js";
export type { Product } from "./product-registry.js";
// Package Quality Judge (deterministic floors). Lives here so BOTH the API and the
// fully-offline CLI can grade + append the quality report from the shared core.
export {
  gradePackage,
  applyQualityGate,
  buildQualityReport,
  appendQualityArtifacts,
  buildNeedsRemediationArtifact,
  scoreAssessmentValidity,
  scoreGrounding,
  scoreNeedsCoverage,
  distinctiveFactTerms,
  repoFactTerms,
  FLOORS,
} from "./package-quality.js";
export type {
  QualityFile,
  QualityArtifact,
  DimensionScore,
  DesignVerdict,
  QualityVerdict,
  QualityGateOutcome,
} from "./package-quality.js";
// Begin Loop — the self-referential autonomy control loop (begin.yaml + continuation.yaml
// + ⟳Continue footers). Appended at the surface like the quality gate; not a counted generator.
export { appendAutonomyLoop, buildBeginYaml, buildContinuationYaml, CONTINUE_FOOTER_MARKER } from "./autonomy-loop.js";
// Program Funnel — a deterministic "run these next" artifact that turns one analysis
// into a natural workflow through the program catalog. Appended at the surface too.
export { appendProgramFunnel, buildNextPrograms } from "./program-funnel.js";
// Delta Report — a deterministic narrative of change vs the previous snapshot.
// The first compounding surface; appended at the surface before the funnel/loop.
export { appendDeltaReport, buildDeltaReport } from "./delta-report.js";
// Memory Weave — reads the project brain (WO-05) back into generation output.
// Appended at the surface too, before appendDeltaReport/appendProgramFunnel.
export { appendMemoryWeave, buildMemorySection, MEMORY_WEAVE_LIMIT } from "./memory-weave.js";
export type { WovenMemoryEntry } from "./memory-weave.js";
// Shared inline-markdown sanitizer — collapses whitespace/newlines and escapes
// pipes + HTML-comment delimiters for safe interpolation of user/DB-sourced
// strings into markdown tables, headings, and list items (SPEC-10).
export { mdInline } from "./md-sanitize.js";
// Fleet Report — cross-project intelligence for accounts with >=2 projects (E6).
// Account-level surface, computed on demand — NOT a counted generator.
export { buildFleetReport, FLEET_MIN_PROJECTS, FLEET_MAX_PROJECTS } from "./fleet-report.js";
export type { FleetProjectInput } from "./fleet-report.js";
export { generateContextMapJSON, generateRepoProfileYAML, generateArchitectureSummary, generateDependencyHotspots, generateRepoRunStats } from "./generators-search.js";
export { generateAgentsMD, generateClaudeMD, generateCursorRules, generateWorkflowPack, generatePolicyPack } from "./generators-skills.js";
export { generateDebugPlaybook, generateIncidentTemplate, generateTracingRules, generateRootCauseChecklist } from "./generators-debug.js";
export { generateFrontendRules, generateComponentGuidelines, generateLayoutPatterns, generateUiAudit } from "./generators-frontend.js";
// analyzeUiSurface is exported for app_31: apps/api/src/frontend-components.ts runs
// GENERATED components back through the frontend program's own auditor before any of
// them can be applied. The program that writes the component is the program that
// judges it — and it is deterministic, so the gate holds with or without an LLM.
export { analyzeUiSurface, renderUiFindings, type UiFinding } from "./generators-frontend.js";
// spoke_06 — a spoke is the SAME generators with a narrowed program set. One
// resolver, shared by hub and spoke, so the two cannot fork.
export { outputsForPrograms, programsForProduct, outputsForProduct } from "./spoke-scope.js";
// spoke_05 — our own storefront, generated from PRODUCT_REGISTRY + the real
// manifest so a page can never drift from the product it sells.
export {
  generateStorefrontPage,
  generateStorefrontFavicon,
  // ext_02 — Cloudflare Agent Readiness: root-level robots.txt + llms.txt,
  // generated from the same registry as the pages, never hand-written.
  generateStorefrontRobots,
  generateStorefrontLlmsTxt,
  // theme/SEO hardening pass — sitemap.xml closes robots.txt's dangling
  // Sitemap: reference; metaDescription/structuredData are exported so the
  // Watch consumer (and tests) can validate the SAME data the page renders,
  // not a re-derived copy.
  generateStorefrontSitemap,
  metaDescription,
  structuredData,
  priceLine,
  isPurchasable,
  AVERIONICS,
  type StorefrontProduct,
  type StorefrontInput,
} from "./generators-storefront.js";
export { generateSeoRules, generateSchemaRecommendations, generateRoutePriorityMap, generateContentAudit, generateMetaTagAudit, generateSeoHeadTags } from "./generators-seo.js";
export { validateStructuredData, extractJsonLdBlocks, type StructuredDataResult, type StructuredDataIssue } from "./seo-structured-data.js";
export { generatePitchDeck, generatePitchDeckJson, generateSlideArtPrompts } from "./generators-pitch.js";
export { generateOptimizationRules, generatePromptDiffReport, generateCostEstimate, generateTokenBudgetPlan } from "./generators-optimization.js";
export { generateDesignTokens, generateThemeCss, generateThemeGuidelines, generateComponentThemeMap, generateDarkModeTokens } from "./generators-theme.js";
export { generateBrandGuidelines, generateVoiceAndTone, generateContentConstraints, generateMessagingSystem, generateChannelRulebook } from "./generators-brand.js";
export { generateSuperpowerPack, generateWorkflowRegistry, generateTestGenerationRules, generateRefactorChecklist, generateAutomationPipeline } from "./generators-superpowers.js";
export { generateVerifyGate, generateVerifyFull, generatePrePushHook } from "./generators-verify-gate.js";
export { generateRedundancySweepScript, generateRedundancySweepPlaybook } from "./generators-redundancy-sweep.js";
export { generateCampaignBrief, generateFunnelMap, generateSequencePack, generateCroPlaybook, generateAbTestPlan } from "./generators-marketing.js";
// app_42 — structured sequence data for the real send pipeline (apps/api's
// marketing-apply-watcher.ts), additive alongside the markdown generator above.
export {
  buildMarketingSequences,
  type MarketingSequenceStep,
  type MarketingSequenceDefinition,
} from "./generators-marketing.js";
export { generateNotebookSummary, generateSourceMap, generateStudyBrief, generateResearchThreads, generateCitationIndex } from "./generators-notebook.js";
export { generateObsidianSkillPack, generateVaultRules, generateGraphPromptMap, generateLinkingPolicy, generateTemplatePack } from "./generators-obsidian.js";
// app_35 — the actual vault, generated from the repo's real import graph.
export { generateVaultNotes, verifyVaultLinks, codeFileNote } from "./generators-obsidian.js";
export { generateMcpConfig, generateMcpRegistryMetadata, generateProtocolSpec, generateSpecTypes, generateMcpReadme, generateProjectSetupGuide, generateBuildArtifactsGuide, generateRootPackageJsonTemplate, generatePackagePackageJsonTemplate, generateRootTsconfigTemplate, generatePackageTsconfigTemplate, generateMonorepoStructureGuide, generateCoreImplementationArtifactsGuide, generateTestingDocumentationPolishArtifactsGuide, generateConnectorMap, generateCapabilityRegistry, generateServerManifest, generateFintechMcpSurfacePackage, generateFintechDomainSchema } from "./generators-mcp.js";
export { generateComponent, generateDashboardWidget, generateEmbedSnippet, generateArtifactSpec, generateComponentLibrary, generatePrd, generateDesignDoc, generateTasksMd, generateContextMd, generateIndexHtml, generateCapabilityMap } from "./generators-artifacts.js";
export { generateRemotionScript, generateScenePlan, generateRenderConfig, generateAssetChecklist, generateStoryboard } from "./generators-remotion.js";
export { generateCanvasSpec, generateSocialPack, generatePosterLayouts, generateCanvasAssetGuidelines, generateBrandBoard, generateArchitectureDiagram } from "./generators-canvas.js";
export { generateGenerativeSketch, generateParameterPack, generateCollectionMap, generateExportManifest, generateVariationMatrix } from "./generators-algorithmic.js";
export { generateAgentPurchasingPlaybook, generateProductSchema, generateCheckoutFlow, generateNegotiationRules, generateCommerceRegistry, generateAp2InteropSamples, computeComplianceGrade, gradeCompliance, detectCommerceSignals, decideScaExemption, traCapEur, renderScaExemptionMatrix, SCA_EXEMPTION_ORDER } from "./generators-agentic-purchasing.js";
// Reproducibility proofs for the commerce engines (WO-13) — canonical-JSON
// sha256 receipts attached to verified_decisions + the commerce MCP tools.
export { proofDigest } from "./commerce-engines.js";
export type { ReproProof } from "./commerce-engines.js";
export type { ComplianceGradeResult, ComplianceCheck, CheckStatus, CommerceSignals, ScaExemptionContext, ScaExemptionName, ScaExemptionRule, ScaDecision } from "./generators-agentic-purchasing.js";
export {
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
export {
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
