import type { IncomingMessage, ServerResponse } from "node:http";
import { Router, createApp } from "./router.js";
import { startAlerting } from "./alerting.js";
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
  handleCloserGenerate,
  handleDeployGenerate,
  handleGitHubAnalyze,
  handleAnalyze,
  handleFirecrawlScrape,
  handleFirecrawlCrawl,
  handlePreparePurchasing,
  handleWellKnown,
  handleCapabilities,
  handleLlmsTxt,
  handleRobotsTxt,
  handleSkillsIndex,
  handleDocsMd,
  handleForAgents,
  handleInstall,
  handleProbeIntent,
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
  handleSecurityTxt,
  handleGlamaJson,
  handleAgentJson,
  handleOAuthAuthorizationServer,
  handleAiPlugin,
  handleOAuthProtectedResource,
  handleHealthRedirect,
  handleDocsRedirect,
  handlePricingLanding,
  handleOpenApiJson,
  handleSitemapXml,
  handlePerformance,
  handlePerformanceReputation,
} from "./handlers.js";
import {
  handleCreateAccount,
  handleGetAccount,
  handleCreateApiKey,
  handleListApiKeys,
  handleRevokeApiKey,
  handleGetUsage,
  handleGetUsageTimeseries,
  handleGetAnalyticsSummary,
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
  handleTrackAnalyticsEvent,
} from "./funnel.js";
import { handleExportZip } from "./export.js";
import { handleMcpPost, handleMcpGet, handleMcpDocs, handleMcpServerJson, runSearchTools, getMcpCallCounters } from "./mcp-server.js";
import { buildOpenApiSpec } from "./openapi.js";
import { handleLiveness, handleReadiness, handleMetrics } from "./metrics.js";
import { handleAdminStats, handleAdminAccounts, handleAdminActivity, handleAdminMcpUsage, handleAdminRevenue } from "./admin.js";
import { handleCreateWebhook, handleListWebhooks, handleDeleteWebhook, handleToggleWebhook, handleWebhookDeliveries } from "./webhooks.js";
import { handleListVersions, handleGetVersion, handleDiffVersions } from "./versions.js";
import { handleListMemory, handleAddMemory } from "./memory-handlers.js";
import { handleGetFleet } from "./fleet-handlers.js";
import { handleListProjects, handleListProjectSnapshots } from "./projects-handlers.js";
import { handleGitHubOAuthStart, handleGitHubOAuthCallback, handleGoogleOAuthStart, handleGoogleOAuthCallback, handleOAuthExchange, handleOAuthLogout, handleCreateSession } from "./oauth.js";
import { handleOAuthAuthorize, handleOAuthToken, handleOAuthJwks, handleOAuthIntrospect } from "./oauth-server.js";
import { handleStripeWebhook, handleCreateCheckout, handleGetSubscription, handleCancelSubscription } from "./stripe.js";
import { handleGitHubWebhook } from "./github-webhook.js";
import { handleArchitectureDriftWebhook } from "./architecture-drift-webhook.js";
import { handlePaidSubscribe, handlePaidConfig, handlePaidWebhook } from "./paid-handlers.js";
import { handleListCreditPacks, handleCreateCreditTopup, handleListMyPurchases } from "./credit-pack-handlers.js";
import { validateEnv } from "./env.js";
import { log } from "./logger.js";
import { ARTIFACT_COUNT, PROGRAM_COUNT, ENDPOINT_COUNT, API_VERSION } from "./counts.js";

// â”€â”€â”€ Startup env validation (fail-fast) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/* v8 ignore start â€” server.ts startup block not imported by tests */
const envResult = validateEnv();
if (!envResult.valid) {
  for (const err of envResult.errors) {
    console.error(`[env] ${err.message}`);
  }
  process.exitCode = 1;
}
/* v8 ignore stop */

const router = new Router();

// Root â€” API landing page for probes, crawlers, and humans
router.get("/", async (_req, res) => {
  const { sendJSON } = await import("./router.js");
  sendJSON(res, 200, {
    name: "Axis' Iliad API",
    version: API_VERSION,
    docs: "/v1/docs",
    health: "/v1/health",
    llms: "/llms.txt",
    mcp: "/mcp",
    endpoints: ENDPOINT_COUNT,
    programs: PROGRAM_COUNT,
    generators: ARTIFACT_COUNT,
  });
});

// Health
router.get("/v1/health", handleHealthCheck);
router.get("/v1/health/live", handleLiveness);
router.get("/v1/health/ready", handleReadiness);
router.get("/v1/metrics", handleMetrics);

// Performance monitoring (AgentSEO/trust signals)
router.get("/performance", handlePerformance);
router.get("/performance/reputation", handlePerformanceReputation);

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

// Projects list (WO-A1 — CRITICAL PATH for the web Dashboard/Projects pages)
router.get("/v1/projects", handleListProjects);

// Project context endpoints
router.get("/v1/projects/:project_id/snapshots", handleListProjectSnapshots);
router.get("/v1/projects/:project_id/context", handleGetContext);
router.get("/v1/projects/:project_id/generated-files", handleGetGeneratedFiles);
router.get("/v1/projects/:project_id/generated-files/:file_path*", handleGetGeneratedFile);
router.get("/v1/projects/:project_id/memory", handleListMemory);
router.post("/v1/projects/:project_id/memory", handleAddMemory);
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
router.post("/v1/closer/generate", handleCloserGenerate);
router.post("/v1/deploy/generate", handleDeployGenerate);
router.post("/v1/prepare-for-agentic-purchasing", handlePreparePurchasing);

// Unified one-call analysis endpoint
router.post("/v1/analyze", handleAnalyze);

// GitHub URL intake
router.post("/v1/github/analyze", handleGitHubAnalyze);

// GitHub App webhook (push / pull_request / installation events)
router.post("/v1/github/webhook", handleGitHubWebhook);

// E5 Living Architecture: push-triggered architecture-drift PR mode
router.post("/v1/github/architecture-drift", handleArchitectureDriftWebhook);

// Firecrawl proxy â€” web research (Phase 1)
router.post("/v1/research/scrape", handleFirecrawlScrape);
router.post("/v1/research/crawl", handleFirecrawlCrawl);

// Agent discovery manifest
router.get("/.well-known/axis.json", handleWellKnown);
router.get("/.well-known/capabilities.json", handleCapabilities);
router.get("/.well-known/mcp.json", handleMcpServerJson);
router.get("/.well-known/security.txt", handleSecurityTxt);
router.get("/.well-known/glama.json", handleGlamaJson);
router.get("/.well-known/agent.json", handleAgentJson);
router.get("/.well-known/oauth-authorization-server", handleOAuthAuthorizationServer);
router.get("/.well-known/oauth-protected-resource", handleOAuthProtectedResource);
router.get("/.well-known/ai-plugin.json", handleAiPlugin);

// Root-level discovery aliases probed by crawlers that skip the .well-known prefix
router.get("/agents.json", handleAgentJson);

// MCP discovery under prefixed paths (for compatibility)
router.get("/mcp/.well-known/mcp.json", handleMcpServerJson);
router.get("/mcp/.well-known/agent.json", handleAgentJson);

// Crawler + agent probe directives
router.get("/robots.txt", handleRobotsTxt);
router.get("/sitemap.xml", handleSitemapXml);

// Scanner-friendly root-level aliases
router.get("/health", handleHealthRedirect);
router.get("/docs", handleDocsRedirect);
router.get("/pricing", handlePricingLanding);
router.get("/openapi.json", handleOpenApiJson);

// AI tool discovery standards (llmstxt.org + agentskills.io)
router.get("/llms.txt", handleLlmsTxt);
router.get("/.well-known/skills/index.json", handleSkillsIndex);

// Plain-text API docs (Stripe-style .md suffix)
router.get("/v1/docs.md", handleDocsMd);

// Agent onboarding â€” machine-readable manifest + install configs
router.get("/for-agents", handleForAgents);
router.post("/probe-intent", handleProbeIntent);
router.get("/v1/install", handleInstall);
router.get("/v1/install/:platform", handleInstall);

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

// MCP Server â€” Streamable HTTP transport (2025-03-26)
const handleMcpEntrypoint = async (req: IncomingMessage, res: ServerResponse) => {
  // Parse once here and pass pre-read JSON to handleMcpPost.
  // Auth is enforced inside MCP tool handlers so clients get JSON-RPC/tool
  // errors instead of a transport-level HTTP 401.
  const { readBody } = await import("./router.js");
  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    const { sendJSON } = await import("./router.js");
    sendJSON(res, 400, { error: "Request body too large" });
    return;
  }

  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    const { sendJSON } = await import("./router.js");
    sendJSON(res, 400, { error: "Invalid JSON" });
    return;
  }

  // Pass route params placeholder and parsed body to avoid double-parsing
  return handleMcpPost(req, res, {}, msg);
};

router.post("/mcp", handleMcpEntrypoint);
router.post("/mcp/", handleMcpEntrypoint);
router.post("/v1/mcp", handleMcpEntrypoint);
router.post("/v1/mcp/", handleMcpEntrypoint);
router.get("/mcp", handleMcpGet);
router.get("/mcp/", handleMcpGet);
router.get("/v1/mcp", handleMcpGet);
router.get("/v1/mcp/", handleMcpGet);
router.get("/mcp/docs", handleMcpDocs);

// Keep browsers quiet: favicon requests hit API hosts too.
router.get("/favicon.ico", async (_req, res) => {
  res.writeHead(204, { "Cache-Control": "public, max-age=86400" });
  res.end();
});

// Clean 404/405 handlers for SSE and sub-path noise
router.get("/mcp/sse", async (_req, res) => {
  const { sendJSON } = await import("./router.js");
  sendJSON(res, 404, { error: "SSE endpoint not available. Use POST /mcp for MCP protocol." });
});
router.post("/mcp/sse", async (_req, res) => {
  const { sendJSON } = await import("./router.js");
  sendJSON(res, 405, { error: "Method not allowed. Use POST /mcp for MCP protocol." });
});
router.get("/mcp/mcp/*", async (_req, res) => {
  const { sendJSON } = await import("./router.js");
  sendJSON(res, 404, { error: "Invalid MCP sub-path. Use /mcp for MCP protocol." });
});
router.post("/mcp/mcp/*", async (_req, res) => {
  const { sendJSON } = await import("./router.js");
  sendJSON(res, 404, { error: "Invalid MCP sub-path. Use /mcp for MCP protocol." });
});
router.delete("/mcp/mcp/*", async (_req, res) => {
  const { sendJSON } = await import("./router.js");
  sendJSON(res, 404, { error: "Invalid MCP sub-path. Use /mcp for MCP protocol." });
});

// Anonymous call stats (no auth required)
router.get("/v1/stats", async (_req, res) => {
  const { sendJSON } = await import("./router.js");
  const c = getMcpCallCounters();
  sendJSON(res, 200, {
    mcp_calls_today: c.today,
    mcp_calls_total: c.total,
    top_tools: Object.entries(c.byTool)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool, count]) => ({ tool, count })),
    process_started_at: c.startedAt,
    date: c.todayDate,
  });
});

// MCP registry metadata â€” for mcp-publisher CLI and registry crawlers
router.get("/v1/mcp/server.json", handleMcpServerJson);

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
// Backward-compatible alias for clients that call unversioned account creation.
router.post("/accounts", handleCreateAccount);
const handleAccountsMethodHint = async (_req: IncomingMessage, res: ServerResponse) => {
  const { sendJSON } = await import("./router.js");
  sendJSON(res, 405, {
    error: "Method not allowed",
    message: "Use POST /v1/accounts (or POST /accounts) to create an account.",
    allowed_methods: ["POST"],
  });
};
router.get("/v1/accounts", handleAccountsMethodHint);
router.get("/v1/accounts/", handleAccountsMethodHint);
router.get("/accounts", handleAccountsMethodHint);
router.get("/accounts/", handleAccountsMethodHint);
router.get("/v1/account", handleGetAccount);
router.post("/v1/account/keys", handleCreateApiKey);
router.get("/v1/account/keys", handleListApiKeys);
router.post("/v1/account/keys/:key_id/revoke", handleRevokeApiKey);
router.get("/v1/account/usage", handleGetUsage);
router.get("/v1/account/usage/timeseries", handleGetUsageTimeseries);
router.get("/v1/account/analytics/summary", handleGetAnalyticsSummary);
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

// Fleet (E6 — cross-project intelligence, paid/suite only)
router.get("/v1/account/fleet", handleGetFleet);

// Credit-pack top-ups (paid persistence-credit purchases via PAI'D)
router.get("/v1/credits/packs", handleListCreditPacks);
router.post("/v1/credits/topup", handleCreateCreditTopup);
router.get("/v1/credits/purchases", handleListMyPurchases);

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
router.post("/v1/account/analytics/events", handleTrackAnalyticsEvent);

// Admin
router.get("/v1/admin/stats", handleAdminStats);
router.get("/v1/admin/accounts", handleAdminAccounts);
router.get("/v1/admin/activity", handleAdminActivity);
router.get("/v1/admin/mcp-usage", handleAdminMcpUsage);
router.get("/v1/admin/revenue", handleAdminRevenue);

// OAuth
router.get("/v1/auth/github", handleGitHubOAuthStart);
router.get("/v1/auth/github/callback", handleGitHubOAuthCallback);
router.get("/v1/auth/google", handleGoogleOAuthStart);
router.get("/v1/auth/google/callback", handleGoogleOAuthCallback);
router.post("/v1/auth/exchange", handleOAuthExchange);
router.post("/v1/auth/session", handleCreateSession);
router.post("/v1/auth/logout", handleOAuthLogout);

// OAuth 2.0 Authorization Server
router.get("/oauth/authorize", handleOAuthAuthorize);
router.post("/oauth/token", handleOAuthToken);
router.get("/oauth/jwks", handleOAuthJwks);
router.post("/oauth/introspect", handleOAuthIntrospect);

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

// PAI'D payment processor (subscriptions + config probe + webhook)
router.post("/portal/api/subscribe", handlePaidSubscribe);
router.get("/portal/api/paid/config", handlePaidConfig);
router.post("/portal/api/paid/webhook", handlePaidWebhook);

/* v8 ignore next â€” server.ts is never imported by test suites */
const port = parseInt(process.env.PORT ?? "4000", 10);
/* v8 ignore next */
export const app = createApp(router, port);

// Opt-in threshold alerting on the metrics already emitted (no-op without ALERT_WEBHOOK_URL).
/* v8 ignore next */
startAlerting();
