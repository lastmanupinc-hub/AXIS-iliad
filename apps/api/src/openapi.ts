// ─── OpenAPI 3.1 Specification for AXIS Toolbox API ─────────────

export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
    contact: { name: string; url: string };
  };
  servers: Array<{ url: string; description: string }>;
  paths: Record<string, unknown>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, unknown>;
  };
}

export function buildOpenApiSpec(): OpenApiSpec {
  return {
    openapi: "3.1.0",
    info: {
      title: "AXIS Toolbox API",
      version: "0.4.0",
      description:
        "AXIS Toolbox provides AI-powered code analysis, context mapping, and multi-program file generation. " +
        "Submit a codebase snapshot and AXIS produces tailored configuration files, analysis reports, and generator outputs across 17+ programs.",
      contact: {
        name: "AXIS Platform",
        url: "https://github.com/no-fate-platform/axis-toolbox",
      },
    },
    servers: [
      { url: "http://localhost:4000", description: "Local development" },
    ],
    paths: {
      // ── Health ──
      "/v1/health": {
        get: {
          summary: "Health check",
          operationId: "getHealth",
          tags: ["Health"],
          responses: {
            200: { description: "Service is healthy", content: jsonContent(ref("HealthResponse")) },
            503: { description: "Service is shutting down" },
          },
        },
      },
      "/v1/health/live": {
        get: {
          summary: "Liveness probe",
          operationId: "getLiveness",
          tags: ["Health"],
          responses: {
            200: { description: "Service is alive", content: jsonContent({ type: "object", properties: { status: { type: "string", enum: ["alive"] } } }) },
          },
        },
      },
      "/v1/health/ready": {
        get: {
          summary: "Readiness probe",
          operationId: "getReadiness",
          tags: ["Health"],
          responses: {
            200: { description: "Service is ready", content: jsonContent(ref("ReadinessResponse")) },
            503: { description: "Service is not ready", content: jsonContent(ref("ReadinessResponse")) },
          },
        },
      },
      "/v1/metrics": {
        get: {
          summary: "Prometheus-format metrics",
          operationId: "getMetrics",
          tags: ["Health"],
          responses: {
            200: { description: "Metrics in Prometheus text format", content: { "text/plain": { schema: { type: "string" } } } },
          },
        },
      },

      // ── Snapshots ──
      "/v1/snapshots": {
        post: {
          summary: "Create a snapshot from uploaded files",
          operationId: "createSnapshot",
          tags: ["Snapshots"],
          requestBody: jsonBody(ref("CreateSnapshotRequest")),
          responses: {
            201: { description: "Snapshot created and processed", content: jsonContent(ref("SnapshotResponse")) },
            400: { description: "Validation error", content: jsonContent(ref("ErrorResponse")) },
            401: { description: "Invalid or revoked API key" },
            413: { description: "File count or size limit exceeded" },
            429: { description: "Rate limit or quota exceeded" },
          },
        },
      },
      "/v1/snapshots/{snapshot_id}": {
        get: {
          summary: "Get snapshot by ID",
          operationId: "getSnapshot",
          tags: ["Snapshots"],
          parameters: [pathParam("snapshot_id", "Snapshot identifier")],
          responses: {
            200: { description: "Snapshot details", content: jsonContent(ref("SnapshotDetail")) },
            404: { description: "Snapshot not found" },
          },
        },
        delete: {
          summary: "Delete a snapshot",
          operationId: "deleteSnapshot",
          tags: ["Snapshots"],
          parameters: [pathParam("snapshot_id", "Snapshot identifier")],
          responses: {
            200: { description: "Snapshot deleted", content: jsonContent({ type: "object", properties: { deleted: { type: "boolean" }, snapshot_id: { type: "string" } } }) },
            404: { description: "Snapshot not found" },
          },
        },
      },
      "/v1/snapshots/{snapshot_id}/versions": {
        get: {
          summary: "List generation versions for a snapshot",
          operationId: "listVersions",
          tags: ["Versions"],
          parameters: [pathParam("snapshot_id", "Snapshot identifier")],
          responses: {
            200: { description: "Version listing", content: jsonContent(ref("VersionListResponse")) },
            404: { description: "Snapshot not found" },
          },
        },
      },
      "/v1/snapshots/{snapshot_id}/versions/{version_number}": {
        get: {
          summary: "Get a specific generation version with files",
          operationId: "getVersion",
          tags: ["Versions"],
          parameters: [
            pathParam("snapshot_id", "Snapshot identifier"),
            pathParam("version_number", "Version number (positive integer)"),
          ],
          responses: {
            200: { description: "Version details with files", content: jsonContent(ref("VersionDetailResponse")) },
            400: { description: "Invalid version number" },
            404: { description: "Version not found" },
          },
        },
      },
      "/v1/snapshots/{snapshot_id}/diff": {
        get: {
          summary: "Diff two generation versions",
          operationId: "diffVersions",
          tags: ["Versions"],
          parameters: [
            pathParam("snapshot_id", "Snapshot identifier"),
            queryParam("old", "Old version number (positive integer)"),
            queryParam("new", "New version number (positive integer)"),
          ],
          responses: {
            200: { description: "Version diff", content: jsonContent(ref("VersionDiffResponse")) },
            400: { description: "Missing or invalid version parameters" },
            404: { description: "Version not found" },
          },
        },
      },

      // ── Projects ──
      "/v1/projects/{project_id}/context": {
        get: {
          summary: "Get context map and repo profile for latest project snapshot",
          operationId: "getProjectContext",
          tags: ["Projects"],
          parameters: [pathParam("project_id", "Project identifier")],
          responses: {
            200: { description: "Context and repo profile" },
            404: { description: "No snapshots for project" },
          },
        },
      },
      "/v1/projects/{project_id}/generated-files": {
        get: {
          summary: "Get all generated files for latest project snapshot",
          operationId: "getGeneratedFiles",
          tags: ["Projects"],
          parameters: [pathParam("project_id", "Project identifier")],
          responses: {
            200: { description: "Generated file listing" },
            404: { description: "No generated files available" },
          },
        },
      },
      "/v1/projects/{project_id}/generated-files/{file_path}": {
        get: {
          summary: "Get a specific generated file by path",
          operationId: "getGeneratedFile",
          tags: ["Projects"],
          parameters: [
            pathParam("project_id", "Project identifier"),
            pathParam("file_path", "File path within generated outputs"),
          ],
          responses: {
            200: { description: "Raw file content" },
            400: { description: "Invalid file path" },
            404: { description: "File not found" },
          },
        },
      },
      "/v1/projects/{project_id}/export": {
        get: {
          summary: "Export all generated files as a ZIP archive",
          operationId: "exportZip",
          tags: ["Projects"],
          parameters: [pathParam("project_id", "Project identifier")],
          responses: {
            200: { description: "ZIP archive", content: { "application/zip": { schema: { type: "string", format: "binary" } } } },
            404: { description: "No generated files" },
          },
        },
      },
      "/v1/projects/{project_id}": {
        delete: {
          summary: "Delete a project and all its snapshots",
          operationId: "deleteProject",
          tags: ["Projects"],
          parameters: [pathParam("project_id", "Project identifier")],
          responses: {
            200: { description: "Project deleted", content: jsonContent({ type: "object", properties: { deleted: { type: "boolean" }, project_id: { type: "string" }, deleted_snapshots: { type: "integer" } } }) },
            404: { description: "Project not found" },
          },
        },
      },

      // ── Programs ──
      ...programEndpoints(),

      // ── Analyze (unified one-call endpoint) ──
      "/v1/analyze": {
        post: {
          summary: "Analyze a codebase — one call returns all AI context files with adoption hints",
          operationId: "analyze",
          tags: ["Analyze"],
          requestBody: jsonBody(ref("AnalyzeRequest")),
          responses: {
            201: { description: "Analysis complete — files with content, placement, and adoption_hint", content: jsonContent(ref("AnalyzeResponse")) },
            400: { description: "Validation error", content: jsonContent(ref("ErrorResponse")) },
            401: { description: "Invalid or revoked API key" },
            413: { description: "File count or size limit exceeded" },
            422: { description: "No source files found" },
            429: { description: "Rate limit or quota exceeded" },
            502: { description: "GitHub upstream error" },
          },
        },
      },

      // ── GitHub ──
      "/v1/github/analyze": {
        post: {
          summary: "Create snapshot from a GitHub repository URL",
          operationId: "githubAnalyze",
          tags: ["GitHub"],
          requestBody: jsonBody(ref("GitHubAnalyzeRequest")),
          responses: {
            201: { description: "Snapshot created from GitHub repo" },
            400: { description: "Invalid GitHub URL" },
            404: { description: "Repository not found or inaccessible" },
          },
        },
      },

      // ── Agent discovery manifest ──
      "/.well-known/axis.json": {
        get: {
          summary: "Agent discovery manifest — describes how to use AXIS programmatically",
          operationId: "getWellKnown",
          tags: ["Discovery"],
          responses: {
            200: { description: "Machine-readable AXIS capability manifest" },
          },
        },
      },

      // ── Search ──
      "/v1/search/index": {
        post: {
          summary: "Build search index for a snapshot's file contents",
          operationId: "searchIndex",
          tags: ["Search"],
          requestBody: jsonBody({ type: "object", required: ["snapshot_id"], properties: { snapshot_id: { type: "string" } } }),
          responses: {
            200: { description: "Index built", content: jsonContent(ref("SearchIndexResponse")) },
            404: { description: "Snapshot not found" },
          },
        },
      },
      "/v1/search/query": {
        post: {
          summary: "Search indexed file contents for a snapshot",
          operationId: "searchQuery",
          tags: ["Search"],
          requestBody: jsonBody(ref("SearchQueryRequest")),
          responses: {
            200: { description: "Search results", content: jsonContent(ref("SearchQueryResponse")) },
            400: { description: "Missing or invalid query" },
          },
        },
      },
      "/v1/search/{snapshot_id}/stats": {
        get: {
          summary: "Get search index statistics for a snapshot",
          operationId: "searchStats",
          tags: ["Search"],
          parameters: [pathParam("snapshot_id", "Snapshot identifier")],
          responses: {
            200: { description: "Index stats", content: jsonContent(ref("SearchStatsResponse")) },
          },
        },
      },
      "/v1/search/export": {
        post: {
          summary: "Export search program results for a snapshot",
          operationId: "searchExport",
          tags: ["Search"],
          requestBody: jsonBody({ type: "object", required: ["snapshot_id"], properties: { snapshot_id: { type: "string" } } }),
          responses: { 200: { description: "Search export results" }, 404: { description: "No results" } },
        },
      },

      // ── MCP Server ──
      "/mcp": {
        post: {
          summary: "MCP Streamable HTTP endpoint (2025-03-26) — call AXIS as a native tool from any MCP-capable agent",
          operationId: "mcpPost",
          tags: ["MCP"],
          requestBody: jsonBody({
            type: "object",
            required: ["jsonrpc", "method"],
            properties: {
              jsonrpc: { type: "string", enum: ["2.0"] },
              method: { type: "string" },
              id: { type: ["string", "number", "null"] },
              params: { type: "object" },
            },
          }),
          responses: {
            200: { description: "JSON-RPC 2.0 response (result or error)" },
            202: { description: "Notification accepted — no body" },
            400: { description: "Parse error or invalid JSON-RPC 2.0 request" },
          },
        },
        get: {
          summary: "MCP SSE endpoint for server-initiated messages (stateless mode: ping + close)",
          operationId: "mcpGet",
          tags: ["MCP"],
          responses: {
            200: {
              description: "Server-sent events stream",
              content: { "text/event-stream": { schema: { type: "string" } } },
            },
          },
        },
      },

      // ── Programs listing ──
      "/v1/programs": {
        get: {
          summary: "List available programs and their outputs",
          operationId: "listPrograms",
          tags: ["Programs"],
          responses: {
            200: { description: "Program listing", content: jsonContent(ref("ProgramsListResponse")) },
          },
        },
      },

      // ── Account & Billing ──
      "/v1/accounts": {
        post: {
          summary: "Create a new account",
          operationId: "createAccount",
          tags: ["Billing"],
          requestBody: jsonBody(ref("CreateAccountRequest")),
          responses: { 201: { description: "Account created" }, 400: { description: "Validation error" } },
        },
      },
      "/v1/account": {
        get: {
          summary: "Get current account details (requires API key)",
          operationId: "getAccount",
          tags: ["Billing"],
          security: [{ apiKey: [] }],
          responses: { 200: { description: "Account details" }, 401: { description: "Invalid API key" } },
        },
      },
      "/v1/account/keys": {
        post: { summary: "Create a new API key", operationId: "createApiKey", tags: ["Billing"], responses: { 201: { description: "Key created" } } },
        get: { summary: "List API keys", operationId: "listApiKeys", tags: ["Billing"], responses: { 200: { description: "Key list" } } },
      },
      "/v1/account/keys/{key_id}/revoke": {
        post: {
          summary: "Revoke an API key",
          operationId: "revokeApiKey",
          tags: ["Billing"],
          parameters: [pathParam("key_id", "API key identifier")],
          responses: { 200: { description: "Key revoked" }, 404: { description: "Key not found" } },
        },
      },
      "/v1/account/usage": {
        get: { summary: "Get account usage summary", operationId: "getUsage", tags: ["Billing"], responses: { 200: { description: "Usage data" } } },
      },
      "/v1/account/quota": {
        get: {
          summary: "Get rate limit and resource quota status",
          operationId: "getQuota",
          tags: ["Billing"],
          responses: {
            200: { description: "Quota and rate-limit info", content: jsonContent(ref("QuotaResponse")) },
          },
        },
      },
      "/v1/account/tier": {
        post: { summary: "Update account tier", operationId: "updateTier", tags: ["Billing"], responses: { 200: { description: "Tier updated" } } },
      },
      "/v1/account/programs": {
        post: { summary: "Toggle program entitlements", operationId: "updatePrograms", tags: ["Billing"], responses: { 200: { description: "Programs updated" } } },
      },

      // ── Funnel & Seats ──
      "/v1/plans": {
        get: { summary: "List available plans and features", operationId: "getPlans", tags: ["Funnel"], responses: { 200: { description: "Plan listing" } } },
      },
      "/v1/account/seats": {
        post: { summary: "Invite a team member", operationId: "inviteSeat", tags: ["Funnel"], responses: { 201: { description: "Seat created" } } },
        get: { summary: "List team seats", operationId: "listSeats", tags: ["Funnel"], responses: { 200: { description: "Seat list" } } },
      },
      "/v1/account/seats/{seat_id}/accept": {
        post: { summary: "Accept a seat invitation", operationId: "acceptSeat", tags: ["Funnel"], parameters: [pathParam("seat_id", "Seat identifier")], responses: { 200: { description: "Seat accepted" } } },
      },
      "/v1/account/seats/{seat_id}/revoke": {
        post: { summary: "Revoke a seat", operationId: "revokeSeat", tags: ["Funnel"], parameters: [pathParam("seat_id", "Seat identifier")], responses: { 200: { description: "Seat revoked" } } },
      },
      "/v1/account/upgrade-prompt": {
        get: { summary: "Get personalized upgrade prompt", operationId: "getUpgradePrompt", tags: ["Funnel"], responses: { 200: { description: "Upgrade prompt data" } } },
      },
      "/v1/account/upgrade-prompt/dismiss": {
        post: { summary: "Dismiss upgrade prompt", operationId: "dismissUpgradePrompt", tags: ["Funnel"], responses: { 200: { description: "Dismissed" } } },
      },
      "/v1/account/funnel": {
        get: { summary: "Get funnel status for current account", operationId: "getFunnelStatus", tags: ["Funnel"], responses: { 200: { description: "Funnel status" } } },
      },
      "/v1/funnel/metrics": {
        get: { summary: "Get aggregate funnel metrics", operationId: "getFunnelMetrics", tags: ["Funnel"], responses: { 200: { description: "Funnel metrics" } } },
      },

      // ── Admin ──
      "/v1/admin/stats": {
        get: {
          summary: "Get platform-wide statistics",
          operationId: "adminStats",
          tags: ["Admin"],
          responses: {
            200: { description: "Platform stats", content: jsonContent(ref("AdminStatsResponse")) },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/v1/admin/accounts": {
        get: {
          summary: "List all accounts (paginated)",
          operationId: "adminAccounts",
          tags: ["Admin"],
          parameters: [
            queryParam("limit", "Max results (1-200, default 50)"),
            queryParam("offset", "Pagination offset (default 0)"),
          ],
          responses: {
            200: { description: "Account listing", content: jsonContent(ref("AdminAccountsResponse")) },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/v1/admin/activity": {
        get: {
          summary: "Get recent platform activity events",
          operationId: "adminActivity",
          tags: ["Admin"],
          parameters: [queryParam("limit", "Max results (1-200, default 50)")],
          responses: {
            200: { description: "Activity feed", content: jsonContent(ref("AdminActivityResponse")) },
            401: { description: "Unauthorized" },
          },
        },
      },

      // ── Webhooks ──
      "/v1/account/webhooks": {
        post: {
          summary: "Create a webhook subscription",
          operationId: "createWebhook",
          tags: ["Webhooks"],
          requestBody: jsonBody(ref("CreateWebhookRequest")),
          responses: {
            201: { description: "Webhook created", content: jsonContent(ref("WebhookResponse")) },
            400: { description: "Validation error" },
            401: { description: "Unauthorized" },
          },
        },
        get: {
          summary: "List webhook subscriptions",
          operationId: "listWebhooks",
          tags: ["Webhooks"],
          responses: {
            200: { description: "Webhook listing", content: jsonContent(ref("WebhookListResponse")) },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/v1/account/webhooks/{webhook_id}": {
        delete: {
          summary: "Delete a webhook subscription",
          operationId: "deleteWebhook",
          tags: ["Webhooks"],
          parameters: [pathParam("webhook_id", "Webhook identifier")],
          responses: {
            200: { description: "Webhook deleted", content: jsonContent({ type: "object", properties: { deleted: { type: "boolean" }, webhook_id: { type: "string" } } }) },
            404: { description: "Webhook not found" },
          },
        },
      },
      "/v1/account/webhooks/{webhook_id}/toggle": {
        post: {
          summary: "Enable or disable a webhook",
          operationId: "toggleWebhook",
          tags: ["Webhooks"],
          parameters: [pathParam("webhook_id", "Webhook identifier")],
          requestBody: jsonBody({ type: "object", required: ["active"], properties: { active: { type: "boolean" } } }),
          responses: {
            200: { description: "Webhook toggled", content: jsonContent({ type: "object", properties: { webhook_id: { type: "string" }, active: { type: "boolean" } } }) },
            404: { description: "Webhook not found" },
          },
        },
      },
      "/v1/account/webhooks/{webhook_id}/deliveries": {
        get: {
          summary: "List webhook delivery history",
          operationId: "getWebhookDeliveries",
          tags: ["Webhooks"],
          parameters: [
            pathParam("webhook_id", "Webhook identifier"),
            queryParam("limit", "Max results (1-100, default 20)"),
          ],
          responses: {
            200: { description: "Delivery history", content: jsonContent(ref("WebhookDeliveryListResponse")) },
            404: { description: "Webhook not found" },
          },
        },
      },

      // ── Database ──
      "/v1/db/stats": {
        get: {
          summary: "Get database size and table statistics",
          operationId: "dbStats",
          tags: ["Database"],
          responses: {
            200: { description: "Database stats", content: jsonContent(ref("DbStatsResponse")) },
            500: { description: "Database error" },
          },
        },
      },
      "/v1/db/maintenance": {
        post: {
          summary: "Run database maintenance (checkpoint, vacuum, purge)",
          operationId: "dbMaintenance",
          tags: ["Database"],
          responses: {
            200: { description: "Maintenance results", content: jsonContent(ref("DbMaintenanceResponse")) },
            500: { description: "Maintenance failed" },
          },
        },
      },

      // ── OAuth ──
      "/v1/auth/github": {
        get: {
          summary: "Start GitHub OAuth flow (redirects to GitHub)",
          operationId: "githubOAuthStart",
          tags: ["OAuth"],
          responses: {
            302: { description: "Redirect to GitHub authorization page" },
            503: { description: "GitHub OAuth not configured" },
          },
        },
      },
      "/v1/auth/github/callback": {
        get: {
          summary: "GitHub OAuth callback (exchanges code for token)",
          operationId: "githubOAuthCallback",
          tags: ["OAuth"],
          parameters: [
            queryParam("code", "Authorization code from GitHub"),
            queryParam("state", "CSRF state parameter"),
            queryParam("error", "Error code from GitHub if authorization was denied"),
          ],
          responses: {
            302: { description: "Redirect to web app with token" },
            400: { description: "Missing code or state parameter" },
            502: { description: "GitHub API error during token exchange" },
            503: { description: "GitHub OAuth not configured" },
          },
        },
      },

      // ── Stripe Payments ──
      "/v1/webhooks/stripe": {
        post: {
          summary: "Stripe webhook receiver (Stripe-Signature verified)",
          operationId: "stripeWebhook",
          tags: ["Payments"],
          requestBody: jsonBody(ref("StripeWebhookPayload")),
          responses: {
            200: { description: "Webhook processed", content: jsonContent(ref("WebhookAckResponse")) },
            400: { description: "Invalid payload" },
            401: { description: "Invalid webhook signature" },
            503: { description: "Webhook secret not configured" },
          },
        },
      },
      "/v1/checkout": {
        post: {
          summary: "Create a Stripe checkout session",
          operationId: "createCheckout",
          tags: ["Payments"],
          security: [{ apiKey: [] }],
          requestBody: jsonBody(ref("CreateCheckoutRequest")),
          responses: {
            201: { description: "Checkout URL created", content: jsonContent(ref("CheckoutResponse")) },
            400: { description: "Invalid tier" },
            401: { description: "Authentication required" },
            409: { description: "Account already has an active subscription" },
            503: { description: "Stripe not configured" },
          },
        },
      },
      "/v1/account/subscription": {
        get: {
          summary: "Get current subscription status",
          operationId: "getSubscription",
          tags: ["Payments"],
          security: [{ apiKey: [] }],
          responses: {
            200: { description: "Subscription details", content: jsonContent(ref("SubscriptionResponse")) },
            401: { description: "Authentication required" },
          },
        },
      },
      "/v1/account/subscription/cancel": {
        post: {
          summary: "Cancel the active subscription",
          operationId: "cancelSubscription",
          tags: ["Payments"],
          security: [{ apiKey: [] }],
          responses: {
            200: { description: "Cancellation requested", content: jsonContent(ref("CancellationResponse")) },
            401: { description: "Authentication required" },
            404: { description: "No active subscription" },
            502: { description: "Stripe API error" },
            503: { description: "Stripe not configured" },
          },
        },
      },

      // ── GitHub Token Management ──
      "/v1/account/github-token": {
        post: {
          summary: "Save a GitHub personal access token",
          operationId: "saveGitHubToken",
          tags: ["GitHub"],
          security: [{ apiKey: [] }],
          requestBody: jsonBody(ref("SaveGitHubTokenRequest")),
          responses: {
            201: { description: "Token saved" },
            400: { description: "Invalid token" },
            401: { description: "Authentication required" },
          },
        },
        get: {
          summary: "List stored GitHub tokens (masked)",
          operationId: "listGitHubTokens",
          tags: ["GitHub"],
          security: [{ apiKey: [] }],
          responses: {
            200: { description: "Token listing" },
            401: { description: "Authentication required" },
          },
        },
      },
      "/v1/account/github-token/{token_id}": {
        delete: {
          summary: "Delete a stored GitHub token",
          operationId: "deleteGitHubToken",
          tags: ["GitHub"],
          security: [{ apiKey: [] }],
          parameters: [pathParam("token_id", "GitHub token identifier")],
          responses: {
            200: { description: "Token deleted" },
            401: { description: "Authentication required" },
            404: { description: "Token not found" },
          },
        },
      },

      // ── Billing History ──
      "/v1/billing/history": {
        get: {
          summary: "Get billing/usage event history",
          operationId: "billingHistory",
          tags: ["Billing"],
          security: [{ apiKey: [] }],
          parameters: [
            queryParam("limit", "Max results (default 50)"),
            queryParam("offset", "Pagination offset (default 0)"),
          ],
          responses: {
            200: { description: "Billing history", content: jsonContent(ref("BillingHistoryResponse")) },
            401: { description: "Authentication required" },
          },
        },
      },
      "/v1/billing/proration": {
        get: {
          summary: "Preview proration for a tier change",
          operationId: "prorationPreview",
          tags: ["Billing"],
          security: [{ apiKey: [] }],
          parameters: [queryParam("target_tier", "Target tier to preview (paid | suite)")],
          responses: {
            200: { description: "Proration preview", content: jsonContent(ref("ProrationPreviewResponse")) },
            401: { description: "Authentication required" },
          },
        },
      },

      // ── Persistence Credits ──
      "/v1/account/credits": {
        get: {
          summary: "Get persistence credit balance and ledger",
          operationId: "getCredits",
          tags: ["Billing"],
          security: [{ apiKey: [] }],
          responses: {
            200: { description: "Credit balance and ledger", content: jsonContent(ref("CreditsResponse")) },
            401: { description: "Authentication required" },
          },
        },
        post: {
          summary: "Grant persistence credits to account",
          operationId: "addCredits",
          tags: ["Billing"],
          security: [{ apiKey: [] }],
          requestBody: { required: true, content: jsonContent(ref("AddCreditsRequest")) },
          responses: {
            200: { description: "Credits granted", content: jsonContent(ref("AddCreditsResponse")) },
            400: { description: "Invalid request" },
            401: { description: "Authentication required" },
            403: { description: "Paid/suite plan required" },
          },
        },
      },

      // ── OpenAPI Docs ──
      "/v1/docs": {
        get: {
          summary: "Get OpenAPI 3.1 specification",
          operationId: "getDocs",
          tags: ["Docs"],
          responses: {
            200: { description: "OpenAPI specification", content: jsonContent({ type: "object" }) },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "Authorization",
          description: "API key in Authorization header: `Bearer <api_key>`",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string", description: "Human-readable error message" },
            error_code: { type: "string", description: "Machine-readable error code" },
            request_id: { type: "string", description: "Unique request identifier" },
          },
          required: ["error", "error_code"],
        },
        HealthResponse: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["ok", "shutting_down"] },
            service: { type: "string" },
            version: { type: "string" },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        CreateSnapshotRequest: {
          type: "object",
          required: ["manifest", "files"],
          properties: {
            manifest: { $ref: "#/components/schemas/SnapshotManifest" },
            files: { type: "array", items: { $ref: "#/components/schemas/FileEntry" } },
            input_method: { type: "string", enum: ["api_submission", "github_url"] },
          },
        },
        SnapshotManifest: {
          type: "object",
          required: ["project_name", "project_type", "frameworks", "goals", "requested_outputs"],
          properties: {
            project_name: { type: "string" },
            project_type: { type: "string" },
            frameworks: { type: "array", items: { type: "string" } },
            goals: { type: "array", items: { type: "string" } },
            requested_outputs: { type: "array", items: { type: "string" } },
          },
        },
        FileEntry: {
          type: "object",
          required: ["path", "content"],
          properties: {
            path: { type: "string", description: "File path relative to project root" },
            content: { type: "string", description: "File content (UTF-8)" },
            size: { type: "integer", description: "File size in bytes (computed if omitted)" },
          },
        },
        SnapshotResponse: {
          type: "object",
          properties: {
            snapshot_id: { type: "string" },
            project_id: { type: "string" },
            status: { type: "string", enum: ["processing", "ready", "failed"] },
            context_map: { type: "object" },
            repo_profile: { type: "object" },
            generated_files: { type: "array", items: { type: "object", properties: { path: { type: "string" }, program: { type: "string" }, description: { type: "string" } } } },
          },
        },
        SnapshotDetail: {
          type: "object",
          properties: {
            snapshot_id: { type: "string" },
            project_id: { type: "string" },
            created_at: { type: "string", format: "date-time" },
            input_method: { type: "string" },
            manifest: { type: "object" },
            file_count: { type: "integer" },
            total_size_bytes: { type: "integer" },
            status: { type: "string" },
          },
        },
        GitHubAnalyzeRequest: {
          type: "object",
          required: ["github_url"],
          properties: {
            github_url: { type: "string", format: "uri", description: "GitHub repository URL (https://github.com/owner/repo)" },
          },
        },
        AnalyzeRequest: {
          type: "object",
          properties: {
            github_url: { type: "string", format: "uri", description: "Public GitHub repo URL. Provide this or files, not both." },
            files: {
              type: "array",
              items: { type: "object", required: ["path", "content"], properties: { path: { type: "string" }, content: { type: "string" }, size: { type: "integer" } } },
              description: "Source files array. Provide this or github_url, not both.",
            },
            programs: { type: "array", items: { type: "string" }, description: "Filter to specific programs. Omit for all entitled programs." },
            inline_content: { type: "boolean", default: true, description: "Include file content in response (default: true)" },
            token: { type: "string", description: "GitHub personal access token for private repos" },
          },
        },
        AnalyzeResponse: {
          type: "object",
          properties: {
            snapshot_id: { type: "string" },
            project_id: { type: "string" },
            status: { type: "string", enum: ["ready"] },
            analysis: {
              type: "object",
              properties: {
                project_name: { type: "string" },
                language: { type: "string" },
                frameworks: { type: "array", items: { type: "string" } },
                file_count: { type: "integer" },
                routes_detected: { type: "integer" },
                domain_models_detected: { type: "integer" },
                separation_score: { type: "number", minimum: 0, maximum: 1 },
              },
            },
            files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  program: { type: "string" },
                  description: { type: "string" },
                  placement: { type: "string" },
                  adoption_hint: { type: "string" },
                  content: { type: "string", description: "File content (present when inline_content is true)" },
                },
              },
            },
            programs_run: { type: "integer" },
            total_files: { type: "integer" },
            next_steps: { type: "array", items: { type: "string" }, description: "Top 3 highest-impact things to do with these files right now" },
            github: { type: "object", description: "Present only when github_url was used" },
          },
        },
        ProgramRequest: {
          type: "object",
          required: ["snapshot_id"],
          properties: {
            snapshot_id: { type: "string" },
            outputs: { type: "array", items: { type: "string" }, description: "Custom output file list (overrides defaults)" },
          },
        },
        SearchQueryRequest: {
          type: "object",
          required: ["snapshot_id", "query"],
          properties: {
            snapshot_id: { type: "string" },
            query: { type: "string", maxLength: 500 },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
        },
        SearchQueryResponse: {
          type: "object",
          properties: {
            snapshot_id: { type: "string" },
            query: { type: "string" },
            total_indexed_lines: { type: "integer" },
            total_indexed_files: { type: "integer" },
            results: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  file_path: { type: "string" },
                  line_number: { type: "integer" },
                  content: { type: "string" },
                  rank: { type: "integer" },
                },
              },
            },
          },
        },
        SearchIndexResponse: {
          type: "object",
          properties: {
            snapshot_id: { type: "string" },
            indexed_files: { type: "integer" },
            indexed_lines: { type: "integer" },
          },
        },
        SearchStatsResponse: {
          type: "object",
          properties: {
            snapshot_id: { type: "string" },
            file_count: { type: "integer" },
            line_count: { type: "integer" },
          },
        },
        ProgramsListResponse: {
          type: "object",
          properties: {
            programs: { type: "array", items: { type: "object", properties: { name: { type: "string" }, outputs: { type: "array", items: { type: "string" } }, generator_count: { type: "integer" } } } },
            total_generators: { type: "integer" },
          },
        },
        CreateAccountRequest: {
          type: "object",
          required: ["name", "email"],
          properties: {
            name: { type: "string" },
            email: { type: "string", format: "email" },
          },
        },
        ReadinessResponse: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["ready", "not_ready"] },
            checks: {
              type: "object",
              properties: {
                shutting_down: { type: "boolean" },
                database: { type: "string", enum: ["ok", "error"] },
              },
            },
          },
        },
        VersionListResponse: {
          type: "object",
          properties: {
            snapshot_id: { type: "string" },
            versions: { type: "array", items: { type: "object", properties: { version_id: { type: "string" }, snapshot_id: { type: "string" }, version_number: { type: "integer" }, program: { type: "string", nullable: true }, file_count: { type: "integer" }, created_at: { type: "string", format: "date-time" } } } },
            count: { type: "integer" },
          },
        },
        VersionDetailResponse: {
          type: "object",
          properties: {
            version: {
              type: "object",
              properties: {
                version_id: { type: "string" },
                snapshot_id: { type: "string" },
                version_number: { type: "integer" },
                program: { type: "string", nullable: true },
                files: { type: "array", items: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } } } },
                file_count: { type: "integer" },
                created_at: { type: "string", format: "date-time" },
              },
            },
          },
        },
        VersionDiffResponse: {
          type: "object",
          properties: {
            diff: {
              type: "object",
              properties: {
                old_version: { type: "integer" },
                new_version: { type: "integer" },
                snapshot_id: { type: "string" },
                files: { type: "array", items: { type: "object", properties: { path: { type: "string" }, status: { type: "string", enum: ["added", "removed", "modified", "unchanged"] }, old_content: { type: "string", nullable: true }, new_content: { type: "string", nullable: true } } } },
                summary: { type: "object", properties: { added: { type: "integer" }, removed: { type: "integer" }, modified: { type: "integer" }, unchanged: { type: "integer" } } },
              },
            },
          },
        },
        QuotaResponse: {
          type: "object",
          properties: {
            rate_limit: { type: "object", properties: { limit: { type: "integer" }, remaining: { type: "integer" }, count: { type: "integer" }, reset_in_seconds: { type: "number" }, window_ms: { type: "integer" } } },
            authenticated: { type: "boolean" },
            resource_quota: { type: "object", properties: { tier: { type: "string" }, snapshots_this_month: { type: "integer" }, max_snapshots_per_month: { type: "integer" }, project_count: { type: "integer" }, max_projects: { type: "integer" }, max_files_per_snapshot: { type: "integer" } } },
          },
        },
        AdminStatsResponse: {
          type: "object",
          properties: {
            total_accounts: { type: "integer" },
            accounts_by_tier: { type: "object", properties: { free: { type: "integer" }, paid: { type: "integer" }, suite: { type: "integer" } } },
            total_snapshots: { type: "integer" },
            total_projects: { type: "integer" },
            total_usage_records: { type: "integer" },
            total_api_keys: { type: "integer" },
            active_api_keys: { type: "integer" },
          },
        },
        AdminAccountsResponse: {
          type: "object",
          properties: {
            accounts: { type: "array", items: { type: "object", properties: { account_id: { type: "string" }, name: { type: "string" }, email: { type: "string" }, tier: { type: "string" }, created_at: { type: "string", format: "date-time" }, snapshot_count: { type: "integer" }, project_count: { type: "integer" } } } },
            total: { type: "integer" },
            limit: { type: "integer" },
            offset: { type: "integer" },
          },
        },
        AdminActivityResponse: {
          type: "object",
          properties: {
            events: { type: "array", items: { type: "object", properties: { event_id: { type: "string" }, account_id: { type: "string" }, event_type: { type: "string" }, stage: { type: "string" }, created_at: { type: "string", format: "date-time" } } } },
            count: { type: "integer" },
          },
        },
        CreateWebhookRequest: {
          type: "object",
          required: ["url", "events"],
          properties: {
            url: { type: "string", format: "uri", description: "Webhook delivery URL (https recommended)" },
            events: { type: "array", items: { type: "string", enum: ["snapshot.created", "snapshot.deleted", "project.deleted", "generation.completed"] } },
            secret: { type: "string", description: "Optional HMAC signing secret" },
          },
        },
        WebhookResponse: {
          type: "object",
          properties: {
            webhook: { type: "object", properties: { webhook_id: { type: "string" }, account_id: { type: "string" }, url: { type: "string" }, events: { type: "array", items: { type: "string" } }, secret: { type: "string", nullable: true }, active: { type: "boolean" }, created_at: { type: "string", format: "date-time" }, updated_at: { type: "string", format: "date-time" } } },
          },
        },
        WebhookListResponse: {
          type: "object",
          properties: {
            webhooks: { type: "array", items: { $ref: "#/components/schemas/WebhookResponse/properties/webhook" } },
            count: { type: "integer" },
          },
        },
        WebhookDeliveryListResponse: {
          type: "object",
          properties: {
            deliveries: { type: "array", items: { type: "object", properties: { delivery_id: { type: "string" }, webhook_id: { type: "string" }, event_type: { type: "string" }, success: { type: "boolean" }, status_code: { type: "integer", nullable: true }, attempt_number: { type: "integer" }, dead_lettered: { type: "boolean" }, created_at: { type: "string", format: "date-time" } } } },
            count: { type: "integer" },
          },
        },
        DbStatsResponse: {
          type: "object",
          properties: {
            action: { type: "string" },
            success: { type: "boolean" },
            details: { type: "object", properties: { size_bytes: { type: "integer" }, page_size: { type: "integer" }, page_count: { type: "integer" }, freelist_pages: { type: "integer" }, wal_pages: { type: "integer" }, tables: { type: "object", additionalProperties: { type: "integer" } } } },
          },
        },
        DbMaintenanceResponse: {
          type: "object",
          properties: {
            results: { type: "array", items: { type: "object", properties: { action: { type: "string" }, success: { type: "boolean" }, details: { type: "object" } } } },
            success: { type: "boolean" },
          },
        },
        StripeWebhookPayload: {
          type: "object",
          required: ["type", "data"],
          properties: {
            type: { type: "string", description: "Stripe event type (e.g. checkout.session.completed)" },
            data: { type: "object", properties: { object: { type: "object", description: "Stripe event object" } } },
          },
        },
        WebhookAckResponse: {
          type: "object",
          properties: {
            received: { type: "boolean" },
            event: { type: "string" },
            subscription_id: { type: "string" },
            status: { type: "string" },
            handled: { type: "boolean" },
          },
        },
        CreateCheckoutRequest: {
          type: "object",
          required: ["tier"],
          properties: {
            tier: { type: "string", enum: ["paid", "suite"], description: "Target subscription tier" },
          },
        },
        CheckoutResponse: {
          type: "object",
          properties: {
            checkout_url: { type: "string", format: "uri" },
            tier: { type: "string" },
            variant_id: { type: "string" },
          },
        },
        SubscriptionResponse: {
          type: "object",
          properties: {
            account_id: { type: "string" },
            tier: { type: "string" },
            has_active_subscription: { type: "boolean" },
            active_subscription: {
              type: "object",
              nullable: true,
              properties: {
                subscription_id: { type: "string" },
                status: { type: "string" },
                price_id: { type: "string" },
                current_period_start: { type: "string", nullable: true },
                current_period_end: { type: "string", nullable: true },
                card_brand: { type: "string", nullable: true },
                card_last_four: { type: "string", nullable: true },
                cancel_at: { type: "string", nullable: true },
              },
            },
            subscription_count: { type: "integer" },
          },
        },
        CancellationResponse: {
          type: "object",
          properties: {
            subscription_id: { type: "string" },
            status: { type: "string", enum: ["cancellation_requested"] },
            message: { type: "string" },
          },
        },
        SaveGitHubTokenRequest: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string", description: "GitHub personal access token" },
            label: { type: "string", description: "Optional label for the token" },
          },
        },
        BillingHistoryResponse: {
          type: "object",
          properties: {
            events: { type: "array", items: { type: "object", properties: { event_type: { type: "string" }, stage: { type: "string" }, metadata: { type: "object" }, created_at: { type: "string", format: "date-time" } } } },
            total: { type: "integer" },
            limit: { type: "integer" },
            offset: { type: "integer" },
          },
        },
        ProrationPreviewResponse: {
          type: "object",
          properties: {
            current_tier: { type: "string" },
            target_tier: { type: "string" },
            current_price: { type: "number" },
            target_price: { type: "number" },
            proration_amount: { type: "number" },
            effective_date: { type: "string", format: "date-time" },
          },
        },
        CreditsResponse: {
          type: "object",
          properties: {
            account_id: { type: "string" },
            tier: { type: "string" },
            balance: { type: "integer", description: "Current persistence credit balance" },
            credit_costs: { type: "object", description: "Credit cost per operation type" },
            credit_packs: { type: "array", items: { type: "object", properties: { pack_id: { type: "string" }, credits: { type: "integer" }, price_cents: { type: "integer" } } } },
            ledger: { type: "array", items: { type: "object", properties: { credit_id: { type: "string" }, credits_delta: { type: "integer" }, operation: { type: "string" }, snapshot_id: { type: "string" }, balance_after: { type: "integer" }, created_at: { type: "string", format: "date-time" } } } },
          },
        },
        AddCreditsRequest: {
          type: "object",
          required: ["credits"],
          properties: {
            credits: { type: "integer", minimum: 1, maximum: 10000, description: "Number of credits to add" },
            operation: { type: "string", default: "purchase", description: "Label for this credit grant (e.g. purchase, suite_monthly_grant)" },
          },
        },
        AddCreditsResponse: {
          type: "object",
          properties: {
            account_id: { type: "string" },
            credits_added: { type: "integer" },
            operation: { type: "string" },
            balance_after: { type: "integer" },
          },
        },
      },
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function ref(name: string) {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonContent(schema: unknown) {
  return { "application/json": { schema } };
}

function jsonBody(schema: unknown) {
  return { required: true, content: jsonContent(schema) };
}

function pathParam(name: string, description: string) {
  return { name, in: "path", required: true, schema: { type: "string" }, description };
}

function queryParam(name: string, description: string) {
  return { name, in: "query", required: false, schema: { type: "string" }, description };
}

function programEndpoints(): Record<string, unknown> {
  const programs: Array<{ path: string; name: string; summary: string }> = [
    { path: "/v1/search/export", name: "searchExport", summary: "Run search program" },
    { path: "/v1/skills/generate", name: "skillsGenerate", summary: "Generate skills files (AGENTS.md, CLAUDE.md, etc.)" },
    { path: "/v1/debug/analyze", name: "debugAnalyze", summary: "Run debug analysis program" },
    { path: "/v1/frontend/audit", name: "frontendAudit", summary: "Run frontend audit program" },
    { path: "/v1/seo/analyze", name: "seoAnalyze", summary: "Run SEO analysis program" },
    { path: "/v1/optimization/analyze", name: "optimizationAnalyze", summary: "Run optimization analysis program" },
    { path: "/v1/theme/generate", name: "themeGenerate", summary: "Generate design theme tokens" },
    { path: "/v1/brand/generate", name: "brandGenerate", summary: "Generate brand guidelines" },
    { path: "/v1/superpowers/generate", name: "superpowersGenerate", summary: "Generate superpower pack" },
    { path: "/v1/marketing/generate", name: "marketingGenerate", summary: "Generate marketing assets" },
    { path: "/v1/notebook/generate", name: "notebookGenerate", summary: "Generate notebook/research files" },
    { path: "/v1/obsidian/analyze", name: "obsidianAnalyze", summary: "Generate Obsidian vault files" },
    { path: "/v1/mcp/provision", name: "mcpProvision", summary: "Provision MCP server config" },
    { path: "/v1/artifacts/generate", name: "artifactsGenerate", summary: "Generate code artifacts" },
    { path: "/v1/remotion/generate", name: "remotionGenerate", summary: "Generate Remotion video scripts" },
    { path: "/v1/canvas/generate", name: "canvasGenerate", summary: "Generate canvas/poster designs" },
    { path: "/v1/algorithmic/generate", name: "algorithmicGenerate", summary: "Generate algorithmic art" },
    { path: "/v1/agentic-purchasing/generate", name: "agenticPurchasingGenerate", summary: "Generate agentic purchasing artifacts" },
  ];

  const endpoints: Record<string, unknown> = {};
  for (const p of programs) {
    endpoints[p.path] = {
      post: {
        summary: p.summary,
        operationId: p.name,
        tags: ["Programs"],
        requestBody: jsonBody(ref("ProgramRequest")),
        responses: {
          200: { description: "Program output files" },
          400: { description: "Validation error" },
          404: { description: "No context for snapshot" },
        },
      },
    };
  }
  return endpoints;
}
