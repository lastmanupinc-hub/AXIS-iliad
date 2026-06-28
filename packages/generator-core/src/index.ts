export type { GeneratedFile, GeneratorInput, GeneratorResult, SourceFile } from "./types.js";
export { generateFiles, listAvailableGenerators, TOTAL_GENERATORS, TOTAL_PROGRAMS } from "./generate.js";
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
export { appendAutonomyLoop, buildBeginYaml, buildContinuationYaml } from "./autonomy-loop.js";
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
export { generateAgentPurchasingPlaybook, generateProductSchema, generateCheckoutFlow, generateNegotiationRules, generateCommerceRegistry, computeComplianceGrade, detectCommerceSignals } from "./generators-agentic-purchasing.js";
export type { ComplianceGradeResult, CommerceSignals } from "./generators-agentic-purchasing.js";
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
