import { Router, createApp } from "./router.js";
import {
  handleCreateSnapshot,
  handleGetSnapshot,
  handleGetContext,
  handleGetGeneratedFiles,
  handleGetGeneratedFile,
  handleSearchExport,
  handleSkillsGenerate,
  handleDebugAnalyze,
  handleFrontendAudit,
  handleSeoAnalyze,
  handleOptimizationAnalyze,
  handleThemeGenerate,
  handleBrandGenerate,
  handleSuperpowersGenerate,
  handleMarketingGenerate,
  handleNotebookGenerate,
  handleObsidianAnalyze,
  handleMcpProvision,
  handleArtifactsGenerate,
  handleRemotionGenerate,
  handleCanvasGenerate,
  handleAlgorithmicGenerate,
  handleGitHubAnalyze,
  handleHealthCheck,
} from "./handlers.js";
import {
  handleCreateAccount,
  handleGetAccount,
  handleCreateApiKey,
  handleListApiKeys,
  handleRevokeApiKey,
  handleGetUsage,
  handleUpdateTier,
  handleUpdatePrograms,
} from "./billing.js";
import {
  handleGetPlans,
  handleInviteSeat,
  handleListSeats,
  handleAcceptSeat,
  handleRevokeSeat,
  handleGetUpgradePrompt,
  handleDismissUpgradePrompt,
  handleGetFunnelStatus,
  handleGetFunnelMetrics,
} from "./funnel.js";

const router = new Router();

// Health
router.get("/health", handleHealthCheck);

// Snapshot endpoints (per axis_all_tools.yaml api_architecture)
router.post("/v1/snapshots", handleCreateSnapshot);
router.get("/v1/snapshots/:snapshot_id", handleGetSnapshot);

// Project context endpoints
router.get("/v1/projects/:project_id/context", handleGetContext);
router.get("/v1/projects/:project_id/generated-files", handleGetGeneratedFiles);
router.get("/v1/projects/:project_id/generated-files/:file_path", handleGetGeneratedFile);

// Program endpoints (per axis_master_blueprint.yaml api_architecture)
router.post("/v1/search/export", handleSearchExport);
router.post("/v1/skills/generate", handleSkillsGenerate);
router.post("/v1/debug/analyze", handleDebugAnalyze);
router.post("/v1/frontend/audit", handleFrontendAudit);
router.post("/v1/seo/analyze", handleSeoAnalyze);
router.post("/v1/optimization/analyze", handleOptimizationAnalyze);
router.post("/v1/theme/generate", handleThemeGenerate);
router.post("/v1/brand/generate", handleBrandGenerate);
router.post("/v1/superpowers/generate", handleSuperpowersGenerate);
router.post("/v1/marketing/generate", handleMarketingGenerate);
router.post("/v1/notebook/generate", handleNotebookGenerate);
router.post("/v1/obsidian/analyze", handleObsidianAnalyze);
router.post("/v1/mcp/provision", handleMcpProvision);
router.post("/v1/artifacts/generate", handleArtifactsGenerate);
router.post("/v1/remotion/generate", handleRemotionGenerate);
router.post("/v1/canvas/generate", handleCanvasGenerate);
router.post("/v1/algorithmic/generate", handleAlgorithmicGenerate);

// GitHub URL intake
router.post("/v1/github/analyze", handleGitHubAnalyze);

// Billing & Account management
router.post("/v1/accounts", handleCreateAccount);
router.get("/v1/account", handleGetAccount);
router.post("/v1/account/keys", handleCreateApiKey);
router.get("/v1/account/keys", handleListApiKeys);
router.post("/v1/account/keys/:key_id/revoke", handleRevokeApiKey);
router.get("/v1/account/usage", handleGetUsage);
router.post("/v1/account/tier", handleUpdateTier);
router.post("/v1/account/programs", handleUpdatePrograms);

// Plans & Funnel
router.get("/v1/plans", handleGetPlans);
router.post("/v1/account/seats", handleInviteSeat);
router.get("/v1/account/seats", handleListSeats);
router.post("/v1/account/seats/:seat_id/accept", handleAcceptSeat);
router.post("/v1/account/seats/:seat_id/revoke", handleRevokeSeat);
router.get("/v1/account/upgrade-prompt", handleGetUpgradePrompt);
router.post("/v1/account/upgrade-prompt/dismiss", handleDismissUpgradePrompt);
router.get("/v1/account/funnel", handleGetFunnelStatus);
router.get("/v1/funnel/metrics", handleGetFunnelMetrics);

const port = parseInt(process.env.PORT ?? "4000", 10);
createApp(router, port);
