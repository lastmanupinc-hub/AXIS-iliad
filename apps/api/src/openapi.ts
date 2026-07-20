// ─── OpenAPI 3.1 Specification for Axis' Iliad API ─────────────
import { ARTIFACT_COUNT, PROGRAM_COUNT, API_VERSION } from "./counts.js";

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
      title: "Axis' Iliad API",
      version: API_VERSION,
      description:
        "Axis' Iliad provides AI-powered code analysis, context mapping, and multi-program file generation. " +
        `Submit a codebase snapshot and AXIS produces tailored configuration files, analysis reports, and generator outputs across ${PROGRAM_COUNT} programs (${ARTIFACT_COUNT} artifacts).`,
      contact: {
        name: "AXIS Platform",
        url: "https://github.com/no-fate-platform/axis-iliad",
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
      "/performance": {
        get: {
          summary: "Performance overview (uptime, MCP call volume, average latency)",
          operationId: "getPerformance",
          tags: ["Health"],
          responses: {
            200: { description: "Performance snapshot" },
          },
        },
      },
      "/performance/reputation": {
        get: {
          summary: "Reputation/trust signal summary for agents evaluating this service",
          operationId: "getPerformanceReputation",
          tags: ["Health"],
          responses: {
            200: { description: "Reputation score and component breakdown" },
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
            402: { description: "Persistence credits required (upgrade plan or purchase credits)" },
            404: { description: "Version not found" },
          },
        },
      },

      // ── Projects ──
      "/v1/projects": {
        get: {
          summary: "List the account's analyzed projects, newest-analyzed-first",
          operationId: "listProjects",
          tags: ["Projects"],
          security: [{ apiKey: [] }],
          parameters: [
            queryParam("limit", "Max projects to return (default 20, capped at 100)"),
            queryParam("offset", "Pagination offset (default 0)"),
          ],
          responses: {
            200: { description: "Project list", content: jsonContent(ref("ProjectsListResponse")) },
            401: { description: "Authentication required" },
          },
        },
      },
      "/v1/projects/{project_id}/snapshots": {
        get: {
          summary: "List every snapshot (analysis run) for a project, newest-first",
          operationId: "listProjectSnapshots",
          tags: ["Projects"],
          parameters: [pathParam("project_id", "Project identifier")],
          responses: {
            200: { description: "Snapshot list", content: jsonContent(ref("ProjectSnapshotsResponse")) },
            401: { description: "Authentication required (project has an owning account)" },
            404: { description: "Project not found" },
          },
        },
      },
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
      "/v1/projects/{project_id}/memory": {
        get: {
          summary: "List project memory entries (decisions, conventions, evidence, goals)",
          operationId: "listProjectMemory",
          tags: ["Memory"],
          security: [{ apiKey: [] }],
          parameters: [
            pathParam("project_id", "Project identifier"),
            queryParam("kind", "Filter by kind: decision, convention, evidence, or goal"),
            queryParam("limit", "Max entries to return (default 50, capped at 200)"),
          ],
          responses: {
            200: { description: "Memory entries, newest first", content: jsonContent(ref("MemoryListResponse")) },
            400: { description: "Invalid kind or limit" },
            401: { description: "Authentication required" },
            403: { description: "Project has no owning account" },
            404: { description: "Project not found" },
          },
        },
        post: {
          summary: "Append a project memory entry (append-only — no update/delete in v1)",
          operationId: "addProjectMemory",
          tags: ["Memory"],
          security: [{ apiKey: [] }],
          parameters: [pathParam("project_id", "Project identifier")],
          requestBody: jsonBody(ref("AddMemoryRequest")),
          responses: {
            201: { description: "Entry recorded", content: jsonContent(ref("MemoryEntryResponse")) },
            400: { description: "Invalid kind, content, or source" },
            401: { description: "Authentication required" },
            403: { description: "Project has no owning account" },
            404: { description: "Project not found" },
            409: { description: "Project memory is at its entry cap" },
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
          description:
            `Analyze any GitHub repo or uploaded codebase and return ${ARTIFACT_COUNT} structured AI artifacts across ${PROGRAM_COUNT} programs (AGENTS.md, CLAUDE.md, .cursorrules, MCP config, brand guidelines, debug playbooks, etc.). ` +
            "Free tier callers receive 3 programs (search, skills, debug). Full bundle requires Pro tier or a $0.50 per-call MPP credit. " +
            "If the caller lacks access, the server returns HTTP 402 with a machine-readable payment body containing payment_url, checkout_url, and retry_after_payment instructions. " +
            "**Agent flow**: (1) Call with API key. (2) If 402 received, present checkout_url to user or use autonomous payment if authorized. (3) After payment, retry the identical request — no extra steps. " +
            "Pass X-Agent-Budget header to negotiate lite mode ($0.15, 3 programs). Pass X-Agent-Mode: lite explicitly. " +
            "Response headers on every authenticated call: X-Axis-Tier, X-Axis-Quota-Remaining, X-Axis-Credits-Balance, X-Axis-Request-Cost.",
          operationId: "analyze",
          tags: ["Analyze"],
          "x-payment": {
            model: "stripe_x402",
            price_usd: "0.50",
            lite_price_usd: "0.15",
            free_programs: ["search", "skills", "debug"],
            description: "Returns HTTP 402 for free-tier callers requesting paid programs. Body contains payment_url (Stripe checkout), checkout_url, and retry_after_payment instructions. Agent should present checkout_url to user or use autonomous payment if authorized, then retry.",
            budget_header: "X-Agent-Budget: {\"budget_per_run_cents\": 50, \"spending_window\": \"per_call\"}",
            lite_mode_header: "X-Agent-Mode: lite",
            retry_pattern: "Re-send original request with same API key after payment — no extra steps.",
          },
          requestBody: jsonBody(ref("AnalyzeRequest")),
          responses: {
            201: { description: "Analysis complete — files with content, placement, and adoption_hint", content: jsonContent(ref("AnalyzeResponse")) },
            400: { description: "Validation error", content: jsonContent(ref("ErrorResponse")) },
            401: { description: "Invalid or revoked API key — authenticate first via POST /v1/accounts then POST /v1/account/keys" },
            402: {
              description: "Payment Required — free-tier caller requested paid programs. Response body contains payment_url, checkout_url, retry_after_payment, and full x402 negotiation block.",
              content: jsonContent({
                type: "object",
                properties: {
                  error: { type: "string", example: "Payment Required" },
                  price: { type: "string", example: "0.50" },
                  currency: { type: "string", example: "USD" },
                  payment_url: { type: "string", description: "AXIS billing page for the caller's account (PAI'D-hosted, not a Stripe-hosted URL)" },
                  checkout_url: { type: "string", description: "AXIS billing page, deep-linked to the Pro plan's PAI'D checkout section (PAI'D-hosted, not a direct Stripe checkout URL)" },
                  retry_after_payment: { type: "string", description: "Instructions to retry after payment completes" },
                  x402: { type: "object", description: "x402-compatible on-chain payment block (USDC)" },
                },
              }),
            },
            413: { description: "File count or size limit exceeded" },
            422: { description: "No source files found" },
            429: { description: "Rate limit or quota exceeded" },
            502: { description: "GitHub upstream error" },
          },
        },
      },
      "/v1/prepare-for-agentic-purchasing": {
        post: {
          summary: "Generate agentic purchasing readiness assessment — AP2/UCP/Visa compliance, negotiation playbook, autonomous checkout rules",
          description:
            "Full purchasing-readiness audit. Returns score 0-100, AP2/Visa compliance checklist, Compelling Evidence 3.0 dispute evidence requirements, SCA exemption paths, and autonomous checkout rules." +
            "Requires Pro tier or $0.50 MPP credit. HTTP 402 returned for free-tier callers with payment_url and retry instructions. " +
            "**Agent flow**: (1) Call with API key. (2) If 402, present checkout_url or pay autonomously. (3) Retry after payment.",
          operationId: "prepareForAgenticPurchasing",
          tags: ["Analyze", "Agentic Commerce"],
          "x-payment": {
            model: "stripe_x402",
            price_usd: "0.50",
            lite_price_usd: "0.25",
            description: "Returns HTTP 402 for free-tier callers. Body contains payment_url, checkout_url, and retry_after_payment.",
          },
          requestBody: jsonBody(ref("AnalyzeRequest")),
          responses: {
            201: { description: "Purchasing readiness score + compliance artifacts" },
            400: { description: "Validation error" },
            401: { description: "Invalid or revoked API key" },
            402: { description: "Payment Required — body contains payment_url, checkout_url, and retry_after_payment instructions" },
            429: { description: "Rate limit or quota exceeded" },
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

      // ── Firecrawl Web Research (Phase 1) ──
      "/v1/research/scrape": {
        post: {
          summary: "Scrape a single URL and return markdown content",
          description: "Proxy to Firecrawl /scrape. Returns markdown, metadata, and structured data. Requires authentication. Pricing: $0.10 standard, $0.05 lite per page.",
          operationId: "firecrawlScrape",
          tags: ["Web Research"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  properties: {
                    url: { type: "string", description: "URL to scrape" },
                    only_main_content: { type: "boolean", default: true, description: "Extract main content only" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Scrape successful" },
            400: { description: "Invalid URL or request" },
            401: { description: "Authentication required" },
            402: { description: "Payment required" },
            502: { description: "Firecrawl service error" },
          },
          "x-payment": {
            model: "per_call_with_lite_mode",
            price_usd: "$0.10",
            lite_price_usd: "$0.05",
            budget_header: "X-Agent-Budget",
            lite_mode_header: "X-Agent-Mode: lite",
            retry_pattern: "Retry with same body after paying",
          },
        },
      },

      "/v1/research/crawl": {
        post: {
          summary: "Crawl a domain and scrape multiple pages",
          // H-Phase-A cycle 8: price was stale by 12-25x ($0.25/$0.12 "per
          // page crawled") — the handler actually bills a flat $0.01 via
          // getPricingTier("iliad_web_research_crawl") (packages/mpp/src/
          // index.ts), same real price the MCP twin (iliad_web_research_crawl)
          // advertises. "Proxy to Firecrawl" stays accurate — unlike the MCP
          // tool, this REST endpoint has NOT been migrated to the sovereign
          // crawler (disclosed, tracked separately, not this fix's scope).
          description: "Proxy to Firecrawl /crawl. Crawls up to 100 pages and returns markdown for each. Requires authentication. Pricing: flat $0.01 per call (standard and lite), regardless of pages crawled.",
          operationId: "firecrawlCrawl",
          tags: ["Web Research"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  properties: {
                    url: { type: "string", description: "Domain/URL to crawl" },
                    limit: { type: "number", minimum: 1, maximum: 100, default: 10, description: "Max pages to crawl" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Crawl successful" },
            400: { description: "Invalid URL or request" },
            401: { description: "Authentication required" },
            402: { description: "Payment required" },
            502: { description: "Firecrawl service error" },
          },
          "x-payment": {
            model: "flat_per_call_with_lite_mode",
            price_usd: "$0.01",
            lite_price_usd: "$0.01",
            budget_header: "X-Agent-Budget",
            lite_mode_header: "X-Agent-Mode: lite",
            retry_pattern: "Retry with same body after paying",
          },
        },
      },

      // ── AI tool discovery standards ──
      "/llms.txt": {
        get: {
          summary: "Plain-text AI tool instructions (llmstxt.org standard)",
          operationId: "getLlmsTxt",
          tags: ["Discovery"],
          responses: {
            200: { description: "Plain-text AXIS API instructions for AI tools", content: { "text/plain": { schema: { type: "string" } } } },
          },
        },
      },
      "/.well-known/skills/index.json": {
        get: {
          summary: "Agent skills registry (agentskills.io standard)",
          operationId: "getSkillsIndex",
          tags: ["Discovery"],
          responses: {
            200: { description: "AXIS skill definitions for AI coding assistants" },
          },
        },
      },
      "/v1/docs.md": {
        get: {
          summary: "Plain-text API reference (Markdown)",
          operationId: "getDocsMd",
          tags: ["Discovery"],
          responses: {
            200: { description: "Markdown plain-text API summary", content: { "text/plain": { schema: { type: "string" } } } },
          },
        },
      },
      "/v1/error-codes": {
        get: {
          summary: "Generated error-code catalog with retry guidance",
          operationId: "getErrorCodes",
          tags: ["Discovery"],
          responses: {
            200: { description: "Every REST ErrorCode.* value plus the MCP tool-call error categories, each with HTTP status(es), retryable guidance, and a description", content: { "application/json": { schema: { type: "object" } } } },
          },
        },
      },
      "/v1/changelog": {
        get: {
          summary: "Repo CHANGELOG.md, verbatim",
          operationId: "getChangelog",
          tags: ["Discovery"],
          responses: {
            200: { description: "The project's CHANGELOG.md, unmodified", content: { "text/markdown": { schema: { type: "string" } } } },
          },
        },
      },
      "/begin.yaml": {
        get: {
          summary: "AXIS's own begin-loop head, verbatim (H4.4 — AXIS dogfoods the loop it generates)",
          operationId: "getBeginYaml",
          tags: ["Discovery"],
          responses: {
            200: { description: "AXIS's root begin.yaml, unmodified", content: { "application/yaml": { schema: { type: "string" } } } },
          },
        },
      },
      "/continuation.yaml": {
        get: {
          summary: "AXIS's own begin-loop state, verbatim (H4.4 — AXIS dogfoods the loop it generates)",
          operationId: "getContinuationYaml",
          tags: ["Discovery"],
          responses: {
            200: { description: "AXIS's root continuation.yaml, unmodified", content: { "application/yaml": { schema: { type: "string" } } } },
          },
        },
      },
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
      "/.well-known/capabilities.json": {
        get: {
          summary: "Machine-readable capability manifest with program list and MCP info",
          operationId: "getCapabilities",
          tags: ["Discovery"],
          responses: {
            200: { description: "Capabilities manifest" },
          },
        },
      },
      "/.well-known/security.txt": {
        get: {
          summary: "Security vulnerability disclosure policy (RFC 9116)",
          operationId: "getSecurityTxt",
          tags: ["Discovery"],
          responses: {
            200: { description: "RFC 9116 security.txt", content: { "text/plain": { schema: { type: "string" } } } },
          },
        },
      },
      "/.well-known/agent.json": {
        get: {
          summary: "Agent/scanner manifest with capabilities, monetization, and endpoints",
          operationId: "getAgentJson",
          tags: ["Discovery"],
          responses: {
            200: { description: "AgentSEO/MCP scanner manifest" },
          },
        },
      },
      "/agents.json": {
        get: {
          summary: "Root-level alias for /.well-known/agent.json",
          operationId: "getAgentsJsonAlias",
          tags: ["Discovery"],
          responses: {
            200: { description: "Same as /.well-known/agent.json — AgentSEO/MCP scanner manifest" },
          },
        },
      },
      "/.well-known/glama.json": {
        get: {
          summary: "Glama MCP directory listing manifest",
          operationId: "getGlamaJson",
          tags: ["Discovery"],
          responses: {
            200: { description: "Glama-format server manifest" },
          },
        },
      },
      "/.well-known/ai-plugin.json": {
        get: {
          summary: "OpenAI/ChatGPT plugin manifest (legacy plugin discovery format)",
          operationId: "getAiPluginJson",
          tags: ["Discovery"],
          responses: {
            200: { description: "AI plugin manifest" },
          },
        },
      },
      "/.well-known/oauth-authorization-server": {
        get: {
          summary: "OAuth 2.0 Authorization Server Metadata (RFC 8414)",
          operationId: "getOAuthAuthorizationServerMetadata",
          tags: ["Discovery", "OAuth"],
          responses: {
            200: { description: "Authorization server metadata document" },
          },
        },
      },
      "/.well-known/oauth-protected-resource": {
        get: {
          summary: "OAuth 2.0 Protected Resource Metadata (RFC 9728)",
          operationId: "getOAuthProtectedResourceMetadata",
          tags: ["Discovery", "OAuth"],
          responses: {
            200: { description: "Protected resource metadata document" },
          },
        },
      },
      "/robots.txt": {
        get: {
          summary: "Robots exclusion protocol with AI/MCP crawler directives",
          operationId: "getRobotsTxt",
          tags: ["Discovery"],
          responses: {
            200: { description: "Robots.txt with per-agent directives", content: { "text/plain": { schema: { type: "string" } } } },
          },
        },
      },
      "/sitemap.xml": {
        get: {
          summary: "XML sitemap listing all public discovery endpoints",
          operationId: "getSitemapXml",
          tags: ["Discovery"],
          responses: {
            200: { description: "XML sitemap", content: { "application/xml": { schema: { type: "string" } } } },
          },
        },
      },
      "/health": {
        get: {
          summary: "Root-level health alias (redirects to /v1/health detail)",
          operationId: "getHealthAlias",
          tags: ["Health"],
          responses: {
            200: { description: "Basic health status with version and uptime" },
          },
        },
      },
      "/docs": {
        get: {
          summary: "Root-level docs alias with links to full documentation",
          operationId: "getDocsAlias",
          tags: ["Discovery"],
          responses: {
            200: { description: "Docs navigation links" },
          },
        },
      },
      "/openapi.json": {
        get: {
          summary: "OpenAPI 3.1 specification (root-level alias for /v1/docs)",
          operationId: "getOpenApiJson",
          tags: ["Discovery"],
          responses: {
            200: { description: "Full OpenAPI specification" },
          },
        },
      },
      "/pricing": {
        get: {
          summary: "Pricing landing metadata for crawlers/agents",
          operationId: "getPricingLanding",
          tags: ["Discovery"],
          responses: {
            200: { description: "Pricing summary with links to /v1/plans and the web pricing page" },
          },
        },
      },

      // ── MCP tool discovery ──
      "/v1/mcp/tools": {
        get: {
          summary: "Search AXIS programs and generators by keyword or capability tag",
          operationId: "searchMcpTools",
          tags: ["MCP"],
          parameters: [
            { name: "q", in: "query", schema: { type: "string" }, description: "Search keyword (e.g. 'checkout', 'debug', 'mcp')" },
            { name: "program", in: "query", schema: { type: "string" }, description: "Filter by program name" },
          ],
          responses: {
            200: { description: "Ranked program and generator matches" },
          },
        },
      },

      // ── MCP registry metadata ──
      "/v1/mcp/server.json": {
        get: {
          summary: "MCP registry metadata for mcp-publisher CLI and registry crawlers",
          operationId: "getMcpServerJson",
          tags: ["MCP"],
          responses: {
            200: { description: "MCP server metadata including all tool schemas, endpoint, protocol version, and quickstart" },
          },
        },
      },
      "/.well-known/mcp.json": {
        get: {
          summary: "MCP server discovery manifest (alternate well-known path for registry crawlers)",
          operationId: "getWellKnownMcpJson",
          tags: ["MCP", "Discovery"],
          responses: {
            200: { description: "Same as /v1/mcp/server.json — MCP server metadata" },
          },
        },
      },
      "/mcp/docs": {
        get: {
          summary: "Human-readable MCP integration documentation page",
          operationId: "getMcpDocs",
          tags: ["MCP", "Discovery"],
          responses: {
            200: { description: "MCP documentation with tool list, usage examples, and install configs" },
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
      "/v1/search/{snapshot_id}/symbols": {
        get: {
          summary: "Get extracted symbols (functions, classes, exports) from a snapshot's search index",
          operationId: "searchSymbols",
          tags: ["Search"],
          parameters: [pathParam("snapshot_id", "Snapshot identifier")],
          responses: {
            200: { description: "Extracted symbols list" },
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
        get: { summary: "Method-not-allowed guidance (account creation is POST-only)", operationId: "getAccountsInfo", tags: ["Account"], responses: { 405: { description: "Method not allowed — use POST /v1/accounts" } } },
      },
      "/accounts": {
        post: {
          summary: "Create a new account (alias)",
          operationId: "createAccountAlias",
          tags: ["Billing"],
          requestBody: jsonBody(ref("CreateAccountRequest")),
          responses: { 201: { description: "Account created" }, 400: { description: "Validation error" } },
        },
        get: { summary: "Method-not-allowed guidance (account creation is POST-only)", operationId: "getAccountsAliasInfo", tags: ["Account"], responses: { 405: { description: "Method not allowed — use POST /accounts" } } },
      },
      "/v1/account": {
        get: {
          summary: "Get current account details (requires API key)",
          operationId: "getAccount",
          tags: ["Billing"],
          security: [{ apiKey: [] }],
          responses: { 200: { description: "Account details" }, 401: { description: "Invalid API key" } },
        },
        patch: {
          summary: "Update account name and/or email (WO-A5)",
          operationId: "patchAccount",
          tags: ["Billing"],
          security: [{ apiKey: [] }],
          responses: {
            200: { description: "Account updated" },
            400: { description: "Missing or invalid name/email" },
            401: { description: "Invalid API key" },
            409: { description: "Another account already owns this email" },
          },
        },
        delete: {
          summary: "Delete the authenticated account (WO-A5) — hard-deletes access surfaces and generated content, retains financial/audit records against an anonymized account shell",
          operationId: "deleteAccount",
          tags: ["Billing"],
          security: [{ apiKey: [] }],
          responses: { 200: { description: "Account deleted" }, 401: { description: "Invalid API key" } },
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
      "/v1/account/usage/timeseries": {
        get: {
          summary: "Get day-bucketed usage (runs, per-program breakdown, credits spent) for usage graphs",
          operationId: "getUsageTimeseries",
          tags: ["Billing"],
          security: [{ apiKey: [] }],
          parameters: [
            queryParam("bucket", "Bucket granularity — only 'day' is supported (default day)"),
            queryParam("since_days", "Window size in days (default 30, capped at 365)"),
          ],
          responses: {
            200: { description: "Day-bucketed usage", content: jsonContent(ref("UsageTimeseriesResponse")) },
            400: { description: "Unsupported bucket granularity" },
            401: { description: "Authentication required" },
          },
        },
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
          summary: "Admin: get database size and table statistics",
          operationId: "dbStats",
          tags: ["Database"],
          security: [{ apiKey: [] }],
          responses: {
            200: { description: "Database stats", content: jsonContent(ref("DbStatsResponse")) },
            401: { description: "Authentication required" },
            403: { description: "Admin access required" },
            500: { description: "Database error" },
          },
        },
      },
      "/v1/db/maintenance": {
        post: {
          summary: "Admin: run database maintenance (ANALYZE)",
          operationId: "dbMaintenance",
          tags: ["Database"],
          security: [{ apiKey: [] }],
          responses: {
            200: { description: "Maintenance results", content: jsonContent(ref("DbMaintenanceResponse")) },
            401: { description: "Authentication required" },
            403: { description: "Admin access required" },
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
      "/v1/auth/google": {
        get: {
          summary: "Start Google OAuth flow (redirects to Google)",
          operationId: "googleOAuthStart",
          tags: ["OAuth"],
          responses: {
            302: { description: "Redirect to Google authorization page" },
            503: { description: "Google OAuth not configured" },
          },
        },
      },
      "/v1/auth/google/callback": {
        get: {
          summary: "Google OAuth callback (exchanges code for token)",
          operationId: "googleOAuthCallback",
          tags: ["OAuth"],
          parameters: [
            queryParam("code", "Authorization code from Google"),
            queryParam("state", "CSRF state parameter"),
            queryParam("error", "Error code from Google if authorization was denied"),
          ],
          responses: {
            302: { description: "Redirect to web app with token" },
            400: { description: "Missing code or state parameter" },
            502: { description: "Google API error during token exchange" },
            503: { description: "Google OAuth not configured" },
          },
        },
      },

      // -- OAuth 2.0 authorization server (MCP client auth -- RFC 6749/8414) --
      "/oauth/authorize": {
        get: {
          summary: "OAuth 2.0 authorization endpoint (issues an auth code, redirects to redirect_uri)",
          operationId: "oauthAuthorize",
          tags: ["OAuth"],
          parameters: [
            queryParam("client_id", "Registered OAuth client id"),
            queryParam("redirect_uri", "Must exactly match a URI registered for this client"),
            queryParam("response_type", "Must be 'code'"),
            queryParam("scope", "Requested scope (default mcp:read)"),
            queryParam("state", "Opaque value echoed back to redirect_uri for CSRF protection"),
          ],
          responses: {
            302: { description: "Redirect to redirect_uri with a code (and state, if provided)" },
            400: { description: "Invalid request, unknown client_id, or unregistered redirect_uri" },
          },
        },
      },
      "/oauth/token": {
        post: {
          summary: "OAuth 2.0 token endpoint (exchanges an authorization code for an access token)",
          operationId: "oauthToken",
          tags: ["OAuth"],
          requestBody: {
            required: true,
            content: {
              "application/x-www-form-urlencoded": {
                schema: {
                  type: "object",
                  required: ["grant_type", "code", "client_id", "client_secret"],
                  properties: {
                    grant_type: { type: "string", enum: ["authorization_code"] },
                    code: { type: "string" },
                    client_id: { type: "string" },
                    client_secret: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "RS256-signed JWT access token (Bearer, 1h expiry)" },
            400: { description: "Invalid grant_type or missing fields" },
            401: { description: "Invalid client_id/client_secret" },
          },
        },
      },
      "/oauth/jwks": {
        get: {
          summary: "JSON Web Key Set for verifying tokens issued by /oauth/token",
          operationId: "oauthJwks",
          tags: ["OAuth"],
          responses: {
            200: { description: "JWKS document (RFC 7517)" },
          },
        },
      },
      "/oauth/introspect": {
        post: {
          summary: "OAuth 2.0 token introspection (RFC 7662)",
          operationId: "oauthIntrospect",
          tags: ["OAuth"],
          requestBody: jsonBody({ type: "object", required: ["token"], properties: { token: { type: "string" } } }),
          responses: {
            200: { description: "{ active: true, sub, client_id, scope, ... } or { active: false }" },
            400: { description: "Missing token" },
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

      // ── Convergence sweep: previously-undocumented public routes ──
      "/v1/account/analytics/summary": {
        get: { summary: "Per-account analytics summary", operationId: "getAccountAnalyticsSummary", tags: ["Account"], security: [{ apiKey: [] }], responses: { 200: { description: "Analytics summary" }, 401: { description: "Authentication required" } } },
      },
      "/v1/account/analytics/events": {
        post: { summary: "Record an analytics event for the account", operationId: "recordAccountAnalyticsEvent", tags: ["Account"], security: [{ apiKey: [] }], responses: { 200: { description: "Event recorded" }, 401: { description: "Authentication required" } } },
      },
      "/v1/credits/packs": {
        get: { summary: "List purchasable credit packs", operationId: "listCreditPacks", tags: ["Billing"], responses: { 200: { description: "Credit pack catalog" } } },
      },
      "/v1/credits/purchases": {
        get: { summary: "List the account's credit purchases", operationId: "listCreditPurchases", tags: ["Billing"], security: [{ apiKey: [] }], responses: { 200: { description: "Purchase history" }, 401: { description: "Authentication required" } } },
      },
      "/v1/credits/topup": {
        post: { summary: "Purchase a one-time credit top-up", operationId: "topupCredits", tags: ["Billing"], security: [{ apiKey: [] }], responses: { 200: { description: "Top-up initiated" }, 401: { description: "Authentication required" }, 402: { description: "Payment required" } } },
      },
      "/v1/admin/mcp-usage": {
        get: { summary: "Admin: MCP tool usage metrics", operationId: "getAdminMcpUsage", tags: ["Admin"], security: [{ apiKey: [] }], responses: { 200: { description: "MCP usage metrics" }, 403: { description: "Admin access required" } } },
      },
      "/v1/admin/revenue": {
        get: { summary: "Admin: revenue metrics", operationId: "getAdminRevenue", tags: ["Admin"], security: [{ apiKey: [] }], responses: { 200: { description: "Revenue metrics" }, 403: { description: "Admin access required" } } },
      },
      "/v1/auth/session": {
        post: { summary: "Establish an HttpOnly session cookie from an API key", operationId: "authSession", tags: ["Auth"], responses: { 200: { description: "Session established" }, 401: { description: "Invalid credentials" } } },
      },
      "/v1/auth/exchange": {
        post: { summary: "Exchange an OAuth code for a session", operationId: "authExchange", tags: ["Auth"], responses: { 200: { description: "Session established" }, 400: { description: "Invalid exchange" } } },
      },
      "/v1/auth/logout": {
        post: { summary: "Clear the session cookie", operationId: "authLogout", tags: ["Auth"], responses: { 200: { description: "Logged out" } } },
      },
      "/v1/github/webhook": {
        post: { summary: "GitHub push webhook (re-analysis trigger)", operationId: "githubWebhook", tags: ["GitHub"], responses: { 202: { description: "Accepted for processing" }, 401: { description: "Invalid signature" } } },
      },
      "/v1/github/architecture-drift": {
        post: { summary: "GitHub push webhook that opens a living-architecture drift PR", operationId: "githubArchitectureDrift", tags: ["GitHub"], responses: { 202: { description: "Accepted for processing" }, 401: { description: "Invalid signature" } } },
      },
      "/v1/deploy/generate": {
        post: { summary: "Generate deployment configuration artifacts", operationId: "generateDeploy", tags: ["Programs"], security: [{ apiKey: [] }], responses: { 200: { description: "Deployment artifacts" } } },
      },

      // ── PAI'D Payment Processor ──
      "/portal/api/subscribe": {
        post: {
          summary: "Create a PAI'D hosted checkout session (returns a redirect URL)",
          description:
            "Creates a PAI'D HOSTED checkout session for the Starter plan and returns its checkout_url. " +
            "The client redirects the buyer to that URL — PAI'D hosts the payment page (there is no inline " +
            "Stripe Elements / client_secret flow). Tier activation is webhook-driven after the payment completes.",
          operationId: "paidSubscribe",
          tags: ["Payments"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["plan", "email"],
                  properties: {
                    plan: { type: "string", enum: ["monthly", "annual"], description: "Billing cycle" },
                    email: { type: "string", format: "email" },
                    idempotency_key: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Hosted checkout session created",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      checkout_url: { type: "string", description: "PAI'D's hosted checkout page — redirect the buyer here" },
                      session_id: { type: "string" },
                      status: { type: "string" },
                    },
                  },
                },
              },
            },
            400: { description: "Invalid plan or email" },
            404: { description: "No account found for that email" },
            502: { description: "Payment processor rejected request" },
            503: { description: "Payment processor not configured (PAI'D env missing)" },
          },
        },
      },
      "/portal/api/paid/config": {
        get: {
          summary: "PAI'D checkout configuration probe (public, no auth)",
          description:
            "Reports whether the PAI'D payment rail can create a hosted checkout session: true when " +
            "PAID_API_BASE_URL + PAID_MERCHANT_ID + PAID_API_KEY are set. No Stripe publishable key is needed " +
            "(PAI'D hosts the page). No secret is ever exposed in the response.",
          operationId: "paidConfig",
          tags: ["Payments"],
          responses: {
            200: {
              description: "Configuration status",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      configured: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/portal/api/paid/webhook": {
        post: {
          summary: "PAI'D webhook receiver (Webhook-Signature verified)",
          operationId: "paidWebhook",
          tags: ["Payments"],
          responses: {
            200: { description: "Webhook processed" },
            400: { description: "Invalid payload" },
            401: { description: "Invalid webhook signature" },
            503: { description: "Webhook signing key not configured" },
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
          summary: "Preview the one-time cost of switching tiers",
          operationId: "prorationPreview",
          tags: ["Billing"],
          security: [{ apiKey: [] }],
          parameters: [queryParam("tier", "Target tier to preview (free | paid | suite)")],
          responses: {
            200: { description: "Tier-switch cost preview", content: jsonContent(ref("ProrationPreviewResponse")) },
            400: { description: "Missing or invalid tier query parameter" },
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
      "/v1/account/fleet": {
        get: {
          summary: "Cross-project fleet report (portfolio health + org CLAUDE.md) for accounts with >=2 analyzed projects",
          operationId: "getAccountFleet",
          tags: ["Fleet"],
          security: [{ apiKey: [] }],
          responses: {
            200: { description: "Fleet status and, when ready, the fleet-report.md/fleet-CLAUDE.md artifacts", content: jsonContent(ref("FleetResponse")) },
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

      // ── Agent Discovery ──
      "/for-agents": {
        get: {
          summary: "Agent onboarding manifest — tools, install configs, system prompts, and getting-started guide for autonomous agents",
          operationId: "getForAgents",
          tags: ["Discovery"],
          parameters: [
            { name: "intent", in: "query", schema: { type: "string" }, description: "Optional intent string — tools are sorted by relevance to the intent" },
          ],
          responses: {
            200: { description: "Complete agent onboarding payload with tools, install configs, and system prompts" },
          },
        },
      },
      "/v1/install": {
        get: {
          summary: "Install configs for every MCP-compatible IDE and agent (Cursor, Windsurf, Claude, VS Code, etc.)",
          operationId: "getInstallConfigs",
          tags: ["Discovery"],
          responses: {
            200: { description: "Platform-keyed install config objects ready to write to disk" },
          },
        },
      },
      "/v1/install/{platform}": {
        get: {
          summary: "Platform-specific install config (e.g. cursor, windsurf, claude-desktop, vscode)",
          operationId: "getInstallPlatform",
          tags: ["Discovery"],
          parameters: [pathParam("platform", "Target platform identifier (cursor, windsurf, claude-desktop, vscode, claude-code)")],
          responses: {
            200: { description: "Platform-specific install configuration" },
            404: { description: "Unknown platform" },
          },
        },
      },

      // ── Stats ──
      "/v1/stats": {
        get: {
          summary: "Anonymous MCP call counters — today/total calls, top tools, process uptime",
          operationId: "getStats",
          tags: ["Health"],
          responses: {
            200: { description: "Aggregated call statistics and top-tools ranking" },
          },
        },
      },

      // ── Root ──
      "/": {
        get: {
          summary: "API landing page — name, version, docs/health/mcp links, endpoint count",
          operationId: "getRoot",
          tags: ["Discovery"],
          responses: {
            200: { description: "API identity and navigation links" },
          },
        },
      },
      "/probe-intent": {
        post: {
          summary: "Lightweight intent probe — describe your commerce, compliance, or DevOps need and get tailored AXIS tool recommendations",
          operationId: "probeIntent",
          tags: ["Discovery"],
          requestBody: jsonBody({
            type: "object",
            required: ["intent"],
            properties: {
              intent: { type: "string", description: "Natural language description of what the agent needs (e.g. 'PCI-DSS checkout flow', 'debug flaky tests')" },
            },
          }),
          responses: {
            200: { description: "Ranked tool recommendations with relevance scores and next-step instructions" },
            400: { description: "Missing intent field" },
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
        ProjectsListResponse: {
          type: "object",
          properties: {
            projects: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  project_id: { type: "string" },
                  name: { type: "string" },
                  github_url: { type: "string", nullable: true },
                  created_at: { type: "string", format: "date-time" },
                  latest_snapshot: {
                    type: "object",
                    nullable: true,
                    properties: {
                      snapshot_id: { type: "string" },
                      status: { type: "string", enum: ["processing", "ready", "failed"] },
                      created_at: { type: "string", format: "date-time" },
                      file_count: { type: "integer" },
                      compliance_grade: { type: "object" },
                    },
                  },
                  snapshot_count: { type: "integer" },
                },
              },
            },
            total: { type: "integer" },
          },
        },
        ProjectSnapshotsResponse: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            snapshots: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  snapshot_id: { type: "string" },
                  status: { type: "string", enum: ["processing", "ready", "failed"] },
                  created_at: { type: "string", format: "date-time" },
                  file_count: { type: "integer" },
                  compliance_grade: { type: "object" },
                },
              },
            },
            count: { type: "integer" },
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
        UsageTimeseriesResponse: {
          type: "object",
          properties: {
            buckets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  date: { type: "string", format: "date", description: "UTC calendar date, YYYY-MM-DD" },
                  runs: { type: "integer" },
                  by_program: { type: "object", additionalProperties: { type: "integer" } },
                  credits_spent: { type: "integer" },
                },
              },
            },
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
          description:
            "PAI'D is one-time-charge only — there is no billing period to prorate within. proration_amount " +
            "is the full one-time price of to_tier (no credit for time remaining on from_tier).",
          properties: {
            current_tier: { type: "string" },
            target_tier: { type: "string" },
            from_tier: { type: "string" },
            to_tier: { type: "string" },
            proration_amount: { type: "number", description: "Full one-time price of to_tier, in cents." },
            direction: { type: "string", enum: ["upgrade", "downgrade", "none"] },
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
        FleetFile: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
            content_type: { type: "string" },
            program: { type: "string" },
            description: { type: "string" },
          },
        },
        FleetResponse: {
          type: "object",
          properties: {
            ready: { type: "boolean" },
            project_count: { type: "integer" },
            eligible_projects: { type: "integer" },
            reason: { type: "string", description: "Present only when ready is false" },
            projects: { type: "array", items: { type: "string" }, description: "Present only when ready is true" },
            files: { type: "array", items: ref("FleetFile"), description: "Present only when ready is true" },
          },
        },
        MemoryEntry: {
          type: "object",
          properties: {
            id: { type: "string" },
            project_id: { type: "string" },
            account_id: { type: "string" },
            kind: { type: "string", enum: ["decision", "convention", "evidence", "goal"] },
            content: { type: "string" },
            source: { type: "string" },
            created_at: { type: "string", format: "date-time" },
          },
        },
        AddMemoryRequest: {
          type: "object",
          required: ["kind", "content"],
          properties: {
            kind: { type: "string", enum: ["decision", "convention", "evidence", "goal"] },
            content: { type: "string", maxLength: 4000 },
            source: { type: "string", maxLength: 500 },
          },
        },
        MemoryListResponse: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            entries: { type: "array", items: ref("MemoryEntry") },
            count: { type: "integer" },
            total: { type: "integer" },
          },
        },
        MemoryEntryResponse: {
          type: "object",
          properties: {
            entry: ref("MemoryEntry"),
            total: { type: "integer" },
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
    { path: "/v1/closer/generate", name: "closerGenerate", summary: "Generate shipping and marketplace packaging assets" },
  ];

  const endpoints: Record<string, unknown> = {};
  for (const p of programs) {
    endpoints[p.path] = {
      post: {
        summary: p.summary,
        operationId: p.name,
        tags: ["Programs"],
        security: [{ apiKey: [] }],
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
