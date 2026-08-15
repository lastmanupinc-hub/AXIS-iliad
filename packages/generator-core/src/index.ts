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
export { generateSeoRules, generateSchemaRecommendations, generateRoutePriorityMap, generateContentAudit, generateMetaTagAudit, generateSeoHeadTags } from "./generators-seo.js";
export { validateStructuredData, extractJsonLdBlocks, type StructuredDataResult, type StructuredDataIssue } from "./seo-structured-data.js";
export { generatePitchDeck, generatePitchDeckJson, generateSlideArtPrompts } from "./generators-pitch.js";
export { generateOptimizationRules, generatePromptDiffReport, generateCostEstimate, generateTokenBudgetPlan } from "./generators-optimization.js";
export { generateDesignTokens, generateThemeCss, generateThemeGuidelines, generateComponentThemeMap, generateDarkModeTokens } from "./generators-theme.js";
export { generateBrandGuidelines, generateVoiceAndTone, generateContentConstraints, generateMessagingSystem, generateChannelRulebook } from "./generators-brand.js";
export { generateSuperpowerPack, generateWorkflowRegistry, generateTestGenerationRules, generateRefactorChecklist, generateAutomationPipeline } from "./generators-superpowers.js";
export { generateVerifyGate, generateVerifyFull, generatePrePushHook } from "./generators-verify-gate.js";
export { generateCampaignBrief, generateFunnelMap, generateSequencePack, generateCroPlaybook, generateAbTestPlan } from "./generators-marketing.js";
export { generateNotebookSummary, generateSourceMap, generateStudyBrief, generateResearchThreads, generateCitationIndex } from "./generators-notebook.js";
export { generateObsidianSkillPack, generateVaultRules, generateGraphPromptMap, generateLinkingPolicy, generateTemplatePack } from "./generators-obsidian.js";
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
