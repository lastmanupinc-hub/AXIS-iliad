import type { IncomingMessage, ServerResponse } from "node:http";
import { Router, createApp } from "./router.js";
import { startAlerting } from "./alerting.js";
import { startWatchDispatcher } from "./watch-dispatcher.js";
import { startPollScheduler } from "./watch-poll-tick.js";
import { log } from "./logger.js";
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
  handlePitchGenerate,
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
  handleEstateManifest,
  handleX402WellKnown,
  handleCapabilities,
  handleLlmsTxt,
  handleErrorCodes,
  handleRobotsTxt,
  handleSkillsIndex,
  handleDocsMd,
  handleChangelog,
  handleBeginYaml,
  handleContinuationYaml,
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
  handleSecurityTxt,
  handleGlamaJson,
  handleAgentJson,
  handleAgentCard,
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
import { handleNotebookAsk } from "./notebook-ask-handler.js";
import {
  handleCreateAccount,
  handleGetAccount,
  handlePatchAccount,
  handleDeleteAccount,
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
import { handleFeedback } from "./feedback.js";
import { handleMcpPost, handleMcpGet, handleMcpDocs, handleMcpServerJson, runSearchTools, getMcpCallCounters } from "./mcp-server.js";
import { handleMcpHostedPost } from "./mcp-hosted.js";
import { getPaymentFunnelStats, getSettledRevenue } from "@axis/snapshots";
import { buildOpenApiSpec } from "./openapi.js";
import { handleLiveness, handleReadiness, handleMetrics } from "./metrics.js";
import { handleAdminStats, handleAdminAccounts, handleAdminActivity, handleAdminMcpUsage, handleAdminRestUsage, handleAdminRevenue, handleListEntitlements, handleAdminGrantEntitlement } from "./admin.js";
import { handleCreateWebhook, handleListWebhooks, handleDeleteWebhook, handleToggleWebhook, handleWebhookDeliveries } from "./webhooks.js";
import { handleListVersions, handleGetVersion, handleDiffVersions } from "./versions.js";
import { handleListMemory, handleAddMemory } from "./memory-handlers.js";
import { handleGetFleet } from "./fleet-handlers.js";
import { handleListProjects, handleListProjectSnapshots } from "./projects-handlers.js";
import { handleGitHubOAuthStart, handleGitHubOAuthCallback, handleGoogleOAuthStart, handleGoogleOAuthCallback, handleLinkedInOAuthStart, handleLinkedInOAuthCallback, handleOAuthExchange, handleOAuthLogout, handleCreateSession, handleAdminSessionLogin, handleAdminSessionLogout } from "./oauth.js";
import { handleOAuthAuthorize, handleOAuthToken, handleOAuthJwks, handleOAuthIntrospect } from "./oauth-server.js";
import { handleStripeWebhook, handleGetSubscription, handleCancelSubscription } from "./stripe.js";
import { handleGitHubWebhook } from "./github-webhook.js";
import { handleSentryWebhook } from "./sentry-webhook.js";
import { handleSaveSentryConnection, handleListSentryConnections, handleDeleteSentryConnection } from "./sentry.js";
import { handleSaveProviderCredential, handleListProviderCredentials, handleDeleteProviderCredential } from "./provider-key.js";
import { handleArchitectureDriftWebhook } from "./architecture-drift-webhook.js";
import { handlePaidSubscribe, handlePaidConfig, handlePaidWebhook } from "./paid-handlers.js";
import { handleListCreditPacks, handleCreateCreditTopup, handleListMyPurchases } from "./credit-pack-handlers.js";
import { validateEnv } from "./env.js";
import { ARTIFACT_COUNT, PROGRAM_COUNT, ENDPOINT_COUNT, API_VERSION } from "./counts.js";

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

export const router = new Router();

// Root — API landing page for probes, crawlers, and humans
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

// Snapshot endpoints (originally per axis_all_tools.yaml's api_architecture,
// since demoted to a historical spec -- see continuation.yaml's boundary_truth)
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
router.post("/v1/pitch/generate", handlePitchGenerate);
router.post("/v1/optimization/analyze", handleOptimizationAnalyze);
router.post("/v1/theme/generate", handleThemeGenerate);
router.post("/v1/brand/generate", handleBrandGenerate);
router.post("/v1/superpowers/generate", handleSuperpowersGenerate);
router.post("/v1/marketing/generate", handleMarketingGenerate);
router.post("/v1/notebook/generate", handleNotebookGenerate);
router.post("/v1/notebook/ask", handleNotebookAsk);
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
// app_32: the debug program's W trigger — incidents in, watch jobs out
router.post("/v1/sentry/webhook", handleSentryWebhook);

// E5 Living Architecture: push-triggered architecture-drift PR mode
router.post("/v1/github/architecture-drift", handleArchitectureDriftWebhook);

// Firecrawl proxy — web research (Phase 1)
router.post("/v1/research/scrape", handleFirecrawlScrape);
router.post("/v1/research/crawl", handleFirecrawlCrawl);

// Agent discovery manifest
router.get("/.well-known/axis.json", handleWellKnown);
router.get("/.well-known/capabilities.json", handleCapabilities);
// est_01: sibling AXIS properties (PAI'D, Foundry, Launch, TrustFabric) —
// docs/ESTATE_FEDERATION_STRATEGY.md.
router.get("/.well-known/axis-estate.json", handleEstateManifest);
router.get("/.well-known/mcp.json", handleMcpServerJson);
router.get("/.well-known/security.txt", handleSecurityTxt);
router.get("/.well-known/glama.json", handleGlamaJson);
router.get("/.well-known/agent.json", handleAgentJson);
router.get("/.well-known/agent-card.json", handleAgentCard);
router.get("/.well-known/oauth-authorization-server", handleOAuthAuthorizationServer);
router.get("/.well-known/oauth-protected-resource", handleOAuthProtectedResource);
router.get("/.well-known/ai-plugin.json", handleAiPlugin);
// x402 discovery aid — real production traffic checks this path (verified via
// Render log review); see handleX402WellKnown's own docblock for the honesty
// note on why this isn't the x402 foundation's actual canonical mechanism.
router.get("/.well-known/x402", handleX402WellKnown);
router.get("/.well-known/x402.json", handleX402WellKnown);

// Root-level discovery aliases probed by crawlers that skip the .well-known prefix
router.get("/agents.json", handleAgentJson);

// Aliases added from Render production logs (2026-07-28). A single agent
// crawler walked ten discovery paths in one pass and took SEVEN 404s: it found
// /agents.json, /.well-known/mcp.json and /llms.txt, and missed everything
// below. Each 404 is a crawler that has our manifest sitting one path spelling
// away and gives up instead — the cheapest possible discovery failure to fix.
//
// These are pure aliases: same handlers, same payloads, no new information.
// Serving the content directly rather than 30x-redirecting because a crawler
// that does not follow redirects still gets a usable answer, and there is no
// canonical-URL cost on a JSON manifest.
//
// Singular/plural and directory spellings of the agent card.
router.get("/.well-known/agents.json", handleAgentJson);
router.get("/.well-known/agent-directory.json", handleAgentJson);
router.get("/agent-directory.json", handleAgentJson);
// MCP server card: we served /.well-known/mcp.json but not the bare-root or
// server-card spellings the same crawler tried.
router.get("/mcp.json", handleMcpServerJson);
router.get("/.well-known/mcp", handleMcpServerJson);
router.get("/.well-known/mcp/server-card.json", handleMcpServerJson);
// agents.txt is not a standard — llms.txt is — but crawlers probe it as the
// agent-flavoured spelling, so serve the same document rather than 404.
router.get("/agents.txt", handleLlmsTxt);

// MCP discovery under prefixed paths (for compatibility) — production logs
// showed real crawler/client traffic hitting these exact paths, so they stay
// even though (per the cycle 28 audit finding below) they are NOT the form
// RFC 8414/9728 actually specify.
router.get("/mcp/.well-known/mcp.json", handleMcpServerJson);
router.get("/mcp/.well-known/mcp", handleMcpServerJson);
router.get("/mcp/.well-known/agent.json", handleAgentJson);
router.get("/mcp/.well-known/oauth-authorization-server", handleOAuthAuthorizationServer);
router.get("/mcp/.well-known/oauth-protected-resource", handleOAuthProtectedResource);
// The ACTUAL RFC 8414 §3 / RFC 9728 §3.1 path-insertion form: the well-known
// suffix goes immediately after the host, and the resource's own path is
// APPENDED AFTER the suffix — i.e. /.well-known/{suffix}/mcp, not
// /mcp/.well-known/{suffix} (the mistake the two lines above make, caught by
// the cycle 28 audit agent, which fetched and read the RFC text directly
// rather than trusting the original commit's own claim). A genuinely
// spec-compliant client doing blind RFC 9728 discovery against the /mcp
// resource needs this exact form; same handlers, still static/side-effect-free.
router.get("/.well-known/oauth-authorization-server/mcp", handleOAuthAuthorizationServer);
router.get("/.well-known/oauth-protected-resource/mcp", handleOAuthProtectedResource);

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
// ext_01: cloudflare/agent-skills-discovery-rfc's checklist path is
// /.well-known/agent-skills/index.json, not the /.well-known/skills/
// path this repo shipped first. Added as an ALIAS to the same handler —
// the original path already has real consumers, so it is not moved, only
// duplicated onto the RFC's expected path.
router.get("/.well-known/agent-skills/index.json", handleSkillsIndex);

// Plain-text API docs (Stripe-style .md suffix)
router.get("/v1/docs.md", handleDocsMd);

// H4.2: generated error-code catalog (rest_error_codes + mcp_tool_error_categories)
router.get("/v1/error-codes", handleErrorCodes);

// Repo changelog, verbatim (WO-A4)
router.get("/v1/changelog", handleChangelog);

// AXIS's own begin-loop files, verbatim (H4.4) — root-level, alongside llms.txt/robots.txt
router.get("/begin.yaml", handleBeginYaml);
router.get("/continuation.yaml", handleContinuationYaml);

// Agent onboarding — machine-readable manifest + install configs
router.get("/for-agents", handleForAgents);
router.post("/probe-intent", handleProbeIntent);
// Public feedback / support ticket intake — no auth, so a customer blocked by
// a sign-in bug can still report it, and an agent can file a structured report
// about a tool call that misbehaved.
router.post("/v1/feedback", handleFeedback);
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

// MCP Server — Streamable HTTP transport (2025-03-26)
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

// app_20_mcp_hosted: per-account, per-repo hosted MCP endpoint. Account comes
// ONLY from Authorization (resolveAuth inside the handler) — the repo path
// alone never identifies who can read it.
router.post("/v1/mcp/hosted/:repo*", handleMcpHostedPost);

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
  // x402 onboarding program, Phase 0: the payment funnel, restart-durable.
  // Real settled cash lives in payment_receipts (getSettledRevenue); the
  // challenge count and the $0 ping_payment probe's settlements live in the
  // dedicated payment_funnel_events table (neither was persisted before).
  // Best-effort: a DB hiccup must never take down this public, no-auth endpoint.
  let x402ChallengesIssued = 0;
  let probeSettlements = 0;
  let paidSettlementsCount = 0;
  let paidSettlementsCents = 0;
  try {
    const [funnel, revenue] = await Promise.all([getPaymentFunnelStats(), getSettledRevenue()]);
    x402ChallengesIssued = funnel.x402_challenges_issued;
    probeSettlements = funnel.probe_settlements;
    paidSettlementsCount = revenue.all_time_count;
    paidSettlementsCents = revenue.all_time_cents;
  } catch {
    /* best-effort — stats stay at 0 rather than failing the endpoint */
  }
  sendJSON(res, 200, {
    mcp_calls_today: c.today,
    mcp_calls_total: c.total,
    protocol_calls: c.today,
    x402_challenges_issued: x402ChallengesIssued,
    // "including $0": the ping_payment probe's forced settlements count
    // alongside real cash settlements, same as real money always has.
    paid_settlements: paidSettlementsCount + probeSettlements,
    paid_settlements_cents: paidSettlementsCents,
    top_tools: Object.entries(c.byTool)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool, count]) => ({ tool, count })),
    process_started_at: c.startedAt,
    date: c.todayDate,
  });
});

// MCP registry metadata — for mcp-publisher CLI and registry crawlers
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
    message: "POST /v1/accounts (or POST /accounts) creates an account. To read the authenticated caller's own account, use GET /v1/account (singular) with Authorization: Bearer <api_key> instead.",
    allowed_methods: ["POST"],
    see_also: "/v1/account",
  });
};
router.get("/v1/accounts", handleAccountsMethodHint);
router.get("/v1/accounts/", handleAccountsMethodHint);
router.get("/accounts", handleAccountsMethodHint);
router.get("/accounts/", handleAccountsMethodHint);
router.get("/v1/account", handleGetAccount);
router.patch("/v1/account", handlePatchAccount);
router.delete("/v1/account", handleDeleteAccount);
router.post("/v1/account/keys", handleCreateApiKey);
router.get("/v1/account/keys", handleListApiKeys);
router.get("/v1/account/entitlements", handleListEntitlements);
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
// app_32: Sentry connect flow (debug → wired to real incidents)
router.post("/v1/account/sentry-token", handleSaveSentryConnection);
router.get("/v1/account/sentry-token", handleListSentryConnections);
router.delete("/v1/account/sentry-token/:token_id", handleDeleteSentryConnection);
// app_33: LLM provider-key connect flow (optimization → live cost meter)
router.post("/v1/account/provider-key", handleSaveProviderCredential);
router.get("/v1/account/provider-key", handleListProviderCredentials);
router.delete("/v1/account/provider-key/:credential_id", handleDeleteProviderCredential);

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
router.get("/v1/admin/rest-usage", handleAdminRestUsage);
router.get("/v1/admin/revenue", handleAdminRevenue);
router.post("/v1/admin/entitlements/grant", handleAdminGrantEntitlement);
router.post("/v1/admin/session", handleAdminSessionLogin);
router.delete("/v1/admin/session", handleAdminSessionLogout);

// OAuth
router.get("/v1/auth/github", handleGitHubOAuthStart);
router.get("/v1/auth/github/callback", handleGitHubOAuthCallback);
router.get("/v1/auth/google", handleGoogleOAuthStart);
router.get("/v1/auth/google/callback", handleGoogleOAuthCallback);
router.get("/v1/auth/linkedin", handleLinkedInOAuthStart);
router.get("/v1/auth/linkedin/callback", handleLinkedInOAuthCallback);
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
router.get("/v1/account/subscription", handleGetSubscription);
router.post("/v1/account/subscription/cancel", handleCancelSubscription);

// PAI'D payment processor (subscriptions + config probe + webhook)
router.post("/portal/api/subscribe", handlePaidSubscribe);
router.get("/portal/api/paid/config", handlePaidConfig);
router.post("/portal/api/paid/webhook", handlePaidWebhook);

/* v8 ignore next — server.ts is never imported by test suites */
const port = parseInt(process.env.PORT ?? "4000", 10);
/* v8 ignore next */
export const app = createApp(router, port);

// Opt-in threshold alerting on the metrics already emitted (no-op without ALERT_WEBHOOK_URL).
/* v8 ignore next */
startAlerting();

// Watch queue (app_01 substrate): ONE dispatcher registration fanning out to
// every program's processor (app_11 skills-refresh, app_12 theme-token-sync,
// ...). Caught, not awaited — a pg-boss startup hiccup must never block the
// HTTP server from listening, the same standard as startAlerting() above.
/* v8 ignore next 3 */
startWatchDispatcher().catch((err) => {
  log("error", "watch-dispatcher.start_failed", { error: err instanceof Error ? err.message : String(err) });
});

// Scheduled half of the Watch substrate (infra_04): one cron tick fanning
// out ordinary watch jobs for poll-driven products. Self-disabling while
// POLL_PRODUCTS is empty; same caught-not-awaited standard as above.
/* v8 ignore next 3 */
startPollScheduler().catch((err) => {
  log("error", "watch-poll-tick.start_failed", { error: err instanceof Error ? err.message : String(err) });
});
