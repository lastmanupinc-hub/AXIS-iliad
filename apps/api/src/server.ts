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
  handleAgenticPurchasingGenerate,
  handleGitHubAnalyze,
  handleAnalyze,
  handlePreparePurchasing,
  handleWellKnown,
  handleHealthCheck,
  handleSearchIndex,
  handleSearchQuery,
  handleSearchStats,
  handleSearchSymbols,
  handleDbStats,
  handleDbMaintenance,
  handleDeleteSnapshot,
  handleDeleteProject,
  makeProgramHandler,
  PROGRAM_OUTPUTS,
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
  handleGetQuota,
  handleSaveGitHubToken,
  handleListGitHubTokens,
  handleDeleteGitHubToken,
  handleBillingHistory,
  handleProrationPreview,
  handleGetCredits,
  handleAddCredits,
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
import { handleExportZip } from "./export.js";
import { handleMcpPost, handleMcpGet, runSearchTools } from "./mcp-server.js";
import { buildOpenApiSpec } from "./openapi.js";
import { handleLiveness, handleReadiness, handleMetrics } from "./metrics.js";
import { handleAdminStats, handleAdminAccounts, handleAdminActivity } from "./admin.js";
import { handleCreateWebhook, handleListWebhooks, handleDeleteWebhook, handleToggleWebhook, handleWebhookDeliveries } from "./webhooks.js";
import { handleListVersions, handleGetVersion, handleDiffVersions } from "./versions.js";
import { handleGitHubOAuthStart, handleGitHubOAuthCallback } from "./oauth.js";
import { handleStripeWebhook, handleCreateCheckout, handleGetSubscription, handleCancelSubscription } from "./stripe.js";
import { validateEnv } from "./env.js";
import { log } from "./logger.js";

// ─── Startup env validation (fail-fast) ─────────────────────────
/* v8 ignore start — server.ts startup block not imported by tests */
const envResult = validateEnv();
if (!envResult.valid) {
  for (const err of envResult.errors) {
    console.error(`[env] ${err.message}`);
  }
  process.exitCode = 1;
}
/* v8 ignore stop */

const router = new Router();

// Health
router.get("/v1/health", handleHealthCheck);
router.get("/v1/health/live", handleLiveness);
router.get("/v1/health/ready", handleReadiness);
router.get("/v1/metrics", handleMetrics);

// Database maintenance
router.get("/v1/db/stats", handleDbStats);
router.post("/v1/db/maintenance", handleDbMaintenance);

// OpenAPI docs
router.get("/v1/docs", async (_req, res) => {
  const { sendJSON } = await import("./router.js");
  sendJSON(res, 200, buildOpenApiSpec());
});

// Snapshot endpoints (per axis_all_tools.yaml api_architecture)
router.post("/v1/snapshots", handleCreateSnapshot);
router.get("/v1/snapshots/:snapshot_id", handleGetSnapshot);
router.delete("/v1/snapshots/:snapshot_id", handleDeleteSnapshot);

// Generation version history & diff
router.get("/v1/snapshots/:snapshot_id/versions", handleListVersions);
router.get("/v1/snapshots/:snapshot_id/versions/:version_number", handleGetVersion);
router.get("/v1/snapshots/:snapshot_id/diff", handleDiffVersions);

// Project context endpoints
router.get("/v1/projects/:project_id/context", handleGetContext);
router.get("/v1/projects/:project_id/generated-files", handleGetGeneratedFiles);
router.get("/v1/projects/:project_id/generated-files/:file_path*", handleGetGeneratedFile);
router.delete("/v1/projects/:project_id", handleDeleteProject);

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
router.post("/v1/agentic-purchasing/generate", handleAgenticPurchasingGenerate);
router.post("/v1/prepare-for-agentic-purchasing", handlePreparePurchasing);

// Unified one-call analysis endpoint
router.post("/v1/analyze", handleAnalyze);

// GitHub URL intake
router.post("/v1/github/analyze", handleGitHubAnalyze);

// Agent discovery manifest
router.get("/.well-known/axis.json", handleWellKnown);

// File Content Search
router.post("/v1/search/index", handleSearchIndex);
router.post("/v1/search/query", handleSearchQuery);
router.get("/v1/search/:snapshot_id/stats", handleSearchStats);
router.get("/v1/search/:snapshot_id/symbols", handleSearchSymbols);

// Export
router.get("/v1/projects/:project_id/export", handleExportZip);

// Programs listing
router.get("/v1/programs", async (_req, res) => {
  const { sendJSON } = await import("./router.js");
  const { listAvailableGenerators } = await import("@axis/generator-core");
  const generators = listAvailableGenerators();
  const programMap = new Map<string, string[]>();
  for (const g of generators) {
    const list = programMap.get(g.program) ?? [];
    list.push(g.path);
    programMap.set(g.program, list);
  }
  const programs = Array.from(programMap.entries()).map(([name, outputs]) => ({
    name,
    outputs,
    generator_count: outputs.length,
  }));
  sendJSON(res, 200, { programs, total_generators: generators.length });
});

// MCP Server — Streamable HTTP transport (2025-03-26)
router.post("/mcp", handleMcpPost);
router.get("/mcp", handleMcpGet);

// MCP tool discovery via REST
router.get("/v1/mcp/tools", async (req, res) => {
  const { sendJSON } = await import("./router.js");
  const url = new URL(req.url ?? "/", "http://localhost");
  const q = url.searchParams.get("q") ?? undefined;
  const program = url.searchParams.get("program") ?? undefined;
  const result = runSearchTools({ q, program });
  sendJSON(res, 200, JSON.parse(result));
});

// Billing & Account management
router.post("/v1/accounts", handleCreateAccount);
router.get("/v1/account", handleGetAccount);
router.post("/v1/account/keys", handleCreateApiKey);
router.get("/v1/account/keys", handleListApiKeys);
router.post("/v1/account/keys/:key_id/revoke", handleRevokeApiKey);
router.get("/v1/account/usage", handleGetUsage);
router.get("/v1/account/quota", handleGetQuota);
router.post("/v1/account/tier", handleUpdateTier);
router.post("/v1/account/programs", handleUpdatePrograms);

// GitHub Token Management
router.post("/v1/account/github-token", handleSaveGitHubToken);
router.get("/v1/account/github-token", handleListGitHubTokens);
router.delete("/v1/account/github-token/:token_id", handleDeleteGitHubToken);

// Billing
router.get("/v1/billing/history", handleBillingHistory);
router.get("/v1/billing/proration", handleProrationPreview);

// Persistence Credits
router.get("/v1/account/credits", handleGetCredits);
router.post("/v1/account/credits", handleAddCredits);

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

// Admin
router.get("/v1/admin/stats", handleAdminStats);
router.get("/v1/admin/accounts", handleAdminAccounts);
router.get("/v1/admin/activity", handleAdminActivity);

// OAuth
router.get("/v1/auth/github", handleGitHubOAuthStart);
router.get("/v1/auth/github/callback", handleGitHubOAuthCallback);

// Webhooks
router.post("/v1/account/webhooks", handleCreateWebhook);
router.get("/v1/account/webhooks", handleListWebhooks);
router.delete("/v1/account/webhooks/:webhook_id", handleDeleteWebhook);
router.post("/v1/account/webhooks/:webhook_id/toggle", handleToggleWebhook);
router.get("/v1/account/webhooks/:webhook_id/deliveries", handleWebhookDeliveries);

// Lemon Squeezy Payments
router.post("/v1/webhooks/stripe", handleStripeWebhook);
router.post("/v1/checkout", handleCreateCheckout);
router.get("/v1/account/subscription", handleGetSubscription);
router.post("/v1/account/subscription/cancel", handleCancelSubscription);

/* v8 ignore next — server.ts is never imported by test suites */
const port = parseInt(process.env.PORT ?? "4000", 10);
/* v8 ignore next */
export const app = createApp(router, port);
