import { describe, it, expect } from "vitest";
import { buildOpenApiSpec } from "./openapi.js";

describe("buildOpenApiSpec", () => {
  const spec = buildOpenApiSpec();

  it("returns valid OpenAPI 3.1 spec", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("AXIS Toolbox API");
    expect(spec.info.version).toBe("0.5.0");
  });

  it("includes all major route groups", () => {
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/v1/health");
    expect(paths).toContain("/v1/snapshots");
    expect(paths).toContain("/v1/snapshots/{snapshot_id}");
    expect(paths).toContain("/v1/github/analyze");
    expect(paths).toContain("/v1/programs");
    expect(paths).toContain("/v1/accounts");
    expect(paths).toContain("/v1/plans");
  });

  it("includes search endpoints", () => {
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/v1/search/index");
    expect(paths).toContain("/v1/search/query");
    expect(paths).toContain("/v1/search/{snapshot_id}/stats");
  });

  it("includes all 18 program endpoints", () => {
    const paths = Object.keys(spec.paths);
    const programPaths = paths.filter(
      (p) =>
        p.includes("/debug/") ||
        p.includes("/frontend/") ||
        p.includes("/seo/") ||
        p.includes("/optimization/") ||
        p.includes("/theme/") ||
        p.includes("/brand/") ||
        p.includes("/superpowers/") ||
        p.includes("/marketing/") ||
        p.includes("/notebook/") ||
        p.includes("/obsidian/") ||
        p.includes("/mcp/") ||
        p.includes("/artifacts/") ||
        p.includes("/remotion/") ||
        p.includes("/canvas/") ||
        p.includes("/algorithmic/") ||
        p.includes("/v1/skills/") ||
        (p.includes("/search/export"))
    );
    expect(programPaths.length).toBe(20);
  });

  it("includes billing endpoints", () => {
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/v1/account");
    expect(paths).toContain("/v1/account/keys");
    expect(paths).toContain("/v1/account/usage");
    expect(paths).toContain("/v1/account/tier");
    expect(paths).toContain("/v1/account/programs");
  });

  it("includes funnel endpoints", () => {
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/v1/account/seats");
    expect(paths).toContain("/v1/account/upgrade-prompt");
    expect(paths).toContain("/v1/account/funnel");
    expect(paths).toContain("/v1/funnel/metrics");
  });

  it("defines apiKey security scheme", () => {
    expect(spec.components.securitySchemes.apiKey).toBeDefined();
    const scheme = spec.components.securitySchemes.apiKey as Record<string, unknown>;
    expect(scheme.type).toBe("apiKey");
    expect(scheme.in).toBe("header");
  });

  it("defines core schemas", () => {
    const schemas = Object.keys(spec.components.schemas);
    expect(schemas).toContain("ErrorResponse");
    expect(schemas).toContain("HealthResponse");
    expect(schemas).toContain("CreateSnapshotRequest");
    expect(schemas).toContain("SnapshotManifest");
    expect(schemas).toContain("FileEntry");
    expect(schemas).toContain("SnapshotResponse");
    expect(schemas).toContain("SearchQueryRequest");
    expect(schemas).toContain("SearchQueryResponse");
    expect(schemas).toContain("ProgramRequest");
  });

  it("has valid JSON structure (serializable)", () => {
    const json = JSON.stringify(spec);
    expect(json.length).toBeGreaterThan(1000);
    const parsed = JSON.parse(json);
    expect(parsed.openapi).toBe("3.1.0");
  });

  it("includes project and export endpoints", () => {
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/v1/projects/{project_id}/context");
    expect(paths).toContain("/v1/projects/{project_id}/generated-files");
    expect(paths).toContain("/v1/projects/{project_id}/export");
    expect(paths).toContain("/v1/projects/{project_id}");
    const proj = spec.paths["/v1/projects/{project_id}"] as Record<string, unknown>;
    expect(proj.delete).toBeDefined();
  });

  it("includes health probes and metrics", () => {
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/v1/health/live");
    expect(paths).toContain("/v1/health/ready");
    expect(paths).toContain("/v1/metrics");
  });

  it("includes version endpoints", () => {
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/v1/snapshots/{snapshot_id}/versions");
    expect(paths).toContain("/v1/snapshots/{snapshot_id}/versions/{version_number}");
    expect(paths).toContain("/v1/snapshots/{snapshot_id}/diff");
  });

  it("includes snapshot delete operation", () => {
    const snap = spec.paths["/v1/snapshots/{snapshot_id}"] as Record<string, unknown>;
    expect(snap.get).toBeDefined();
    expect(snap.delete).toBeDefined();
  });

  it("includes quota endpoint", () => {
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/v1/account/quota");
  });

  it("includes admin endpoints", () => {
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/v1/admin/stats");
    expect(paths).toContain("/v1/admin/accounts");
    expect(paths).toContain("/v1/admin/activity");
  });

  it("includes webhook endpoints", () => {
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/v1/account/webhooks");
    expect(paths).toContain("/v1/account/webhooks/{webhook_id}");
    expect(paths).toContain("/v1/account/webhooks/{webhook_id}/toggle");
    expect(paths).toContain("/v1/account/webhooks/{webhook_id}/deliveries");
    const wh = spec.paths["/v1/account/webhooks"] as Record<string, unknown>;
    expect(wh.post).toBeDefined();
    expect(wh.get).toBeDefined();
  });

  it("includes database endpoints", () => {
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/v1/db/stats");
    expect(paths).toContain("/v1/db/maintenance");
  });

  it("defines new schemas for added endpoints", () => {
    const schemas = Object.keys(spec.components.schemas);
    expect(schemas).toContain("ReadinessResponse");
    expect(schemas).toContain("VersionListResponse");
    expect(schemas).toContain("VersionDetailResponse");
    expect(schemas).toContain("VersionDiffResponse");
    expect(schemas).toContain("QuotaResponse");
    expect(schemas).toContain("AdminStatsResponse");
    expect(schemas).toContain("AdminAccountsResponse");
    expect(schemas).toContain("AdminActivityResponse");
    expect(schemas).toContain("CreateWebhookRequest");
    expect(schemas).toContain("WebhookResponse");
    expect(schemas).toContain("WebhookListResponse");
    expect(schemas).toContain("WebhookDeliveryListResponse");
    expect(schemas).toContain("DbStatsResponse");
    expect(schemas).toContain("DbMaintenanceResponse");
  });

  it("all paths start with /v1/ or are root-level MCP paths", () => {
    const NON_V1_PATHS = new Set(["/", "/mcp", "/.well-known/axis.json", "/.well-known/capabilities.json", "/.well-known/security.txt", "/.well-known/agent.json", "/.well-known/mcp.json", "/.well-known/skills/index.json", "/llms.txt", "/robots.txt", "/sitemap.xml", "/for-agents", "/probe-intent", "/health", "/docs", "/openapi.json", "/mcp/docs"]);
    for (const path of Object.keys(spec.paths)) {
      expect(path.startsWith("/v1/") || NON_V1_PATHS.has(path)).toBe(true);
    }
  });

  it("every operation has an operationId", () => {
    for (const [_path, methods] of Object.entries(spec.paths)) {
      const ops = methods as Record<string, Record<string, unknown>>;
      for (const [method, op] of Object.entries(ops)) {
        if (["get", "post", "put", "delete", "patch"].includes(method)) {
          expect(op.operationId, `${method.toUpperCase()} ${_path}`).toBeDefined();
        }
      }
    }
  });

  it("every operation has at least one tag", () => {
    for (const [_path, methods] of Object.entries(spec.paths)) {
      const ops = methods as Record<string, Record<string, unknown>>;
      for (const [method, op] of Object.entries(ops)) {
        if (["get", "post", "put", "delete", "patch"].includes(method)) {
          expect((op.tags as string[])?.length, `${method.toUpperCase()} ${_path}`).toBeGreaterThan(0);
        }
      }
    }
  });

  // ── eq_175: OAuth, Payments, GitHub Tokens, Billing paths ─────

  it("includes OAuth endpoints", () => {
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/v1/auth/github");
    expect(paths).toContain("/v1/auth/github/callback");
    const start = spec.paths["/v1/auth/github"] as Record<string, Record<string, unknown>>;
    expect(start.get).toBeDefined();
    expect(start.get.operationId).toBe("githubOAuthStart");
    const cb = spec.paths["/v1/auth/github/callback"] as Record<string, Record<string, unknown>>;
    expect(cb.get).toBeDefined();
    expect(cb.get.operationId).toBe("githubOAuthCallback");
  });

  it("includes Stripe payment endpoints", () => {
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/v1/webhooks/stripe");
    expect(paths).toContain("/v1/checkout");
    expect(paths).toContain("/v1/account/subscription");
    expect(paths).toContain("/v1/account/subscription/cancel");
  });

  it("Stripe webhook endpoint has correct responses", () => {
    const wh = spec.paths["/v1/webhooks/stripe"] as Record<string, Record<string, unknown>>;
    expect(wh.post).toBeDefined();
    const responses = wh.post.responses as Record<string, unknown>;
    expect(responses["200"]).toBeDefined();
    expect(responses["400"]).toBeDefined();
    expect(responses["401"]).toBeDefined();
    expect(responses["503"]).toBeDefined();
  });

  it("checkout endpoint requires authentication", () => {
    const co = spec.paths["/v1/checkout"] as Record<string, Record<string, unknown>>;
    expect(co.post.security).toBeDefined();
  });

  it("includes GitHub token management endpoints", () => {
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/v1/account/github-token");
    expect(paths).toContain("/v1/account/github-token/{token_id}");
    const tok = spec.paths["/v1/account/github-token"] as Record<string, Record<string, unknown>>;
    expect(tok.post).toBeDefined();
    expect(tok.get).toBeDefined();
    const del = spec.paths["/v1/account/github-token/{token_id}"] as Record<string, Record<string, unknown>>;
    expect(del.delete).toBeDefined();
  });

  it("includes billing history and proration endpoints", () => {
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/v1/billing/history");
    expect(paths).toContain("/v1/billing/proration");
  });

  it("includes /v1/docs endpoint", () => {
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/v1/docs");
  });

  it("defines new payment/token schemas", () => {
    const schemas = Object.keys(spec.components.schemas);
    expect(schemas).toContain("StripeWebhookPayload");
    expect(schemas).toContain("WebhookAckResponse");
    expect(schemas).toContain("CreateCheckoutRequest");
    expect(schemas).toContain("CheckoutResponse");
    expect(schemas).toContain("SubscriptionResponse");
    expect(schemas).toContain("CancellationResponse");
    expect(schemas).toContain("SaveGitHubTokenRequest");
    expect(schemas).toContain("BillingHistoryResponse");
    expect(schemas).toContain("ProrationPreviewResponse");
  });

  // ── Route-spec parity: every server.ts route has a spec path ──

  it("every registered route has a corresponding OpenAPI path", () => {
    // All routes from server.ts (normalized to OpenAPI path params)
    const serverRoutes = [
      "GET /v1/health",
      "GET /v1/health/live",
      "GET /v1/health/ready",
      "GET /v1/metrics",
      "GET /v1/db/stats",
      "POST /v1/db/maintenance",
      "GET /v1/docs",
      "POST /v1/snapshots",
      "GET /v1/snapshots/{snapshot_id}",
      "DELETE /v1/snapshots/{snapshot_id}",
      "GET /v1/snapshots/{snapshot_id}/versions",
      "GET /v1/snapshots/{snapshot_id}/versions/{version_number}",
      "GET /v1/snapshots/{snapshot_id}/diff",
      "GET /v1/projects/{project_id}/context",
      "GET /v1/projects/{project_id}/generated-files",
      "GET /v1/projects/{project_id}/generated-files/{file_path}",
      "GET /v1/projects/{project_id}/export",
      "DELETE /v1/projects/{project_id}",
      "POST /v1/search/export",
      "POST /v1/skills/generate",
      "POST /v1/debug/analyze",
      "POST /v1/frontend/audit",
      "POST /v1/seo/analyze",
      "POST /v1/optimization/analyze",
      "POST /v1/theme/generate",
      "POST /v1/brand/generate",
      "POST /v1/superpowers/generate",
      "POST /v1/marketing/generate",
      "POST /v1/notebook/generate",
      "POST /v1/obsidian/analyze",
      "POST /v1/mcp/provision",
      "POST /v1/artifacts/generate",
      "POST /v1/remotion/generate",
      "POST /v1/canvas/generate",
      "POST /v1/algorithmic/generate",
      "POST /v1/github/analyze",
      "POST /v1/search/index",
      "POST /v1/search/query",
      "GET /v1/search/{snapshot_id}/stats",
      "GET /v1/programs",
      "POST /v1/accounts",
      "GET /v1/account",
      "POST /v1/account/keys",
      "GET /v1/account/keys",
      "POST /v1/account/keys/{key_id}/revoke",
      "GET /v1/account/usage",
      "GET /v1/account/quota",
      "POST /v1/account/tier",
      "POST /v1/account/programs",
      "POST /v1/account/github-token",
      "GET /v1/account/github-token",
      "DELETE /v1/account/github-token/{token_id}",
      "GET /v1/billing/history",
      "GET /v1/billing/proration",
      "GET /v1/plans",
      "POST /v1/account/seats",
      "GET /v1/account/seats",
      "POST /v1/account/seats/{seat_id}/accept",
      "POST /v1/account/seats/{seat_id}/revoke",
      "GET /v1/account/upgrade-prompt",
      "POST /v1/account/upgrade-prompt/dismiss",
      "GET /v1/account/funnel",
      "GET /v1/funnel/metrics",
      "GET /v1/admin/stats",
      "GET /v1/admin/accounts",
      "GET /v1/admin/activity",
      "GET /v1/auth/github",
      "GET /v1/auth/github/callback",
      "POST /v1/account/webhooks",
      "GET /v1/account/webhooks",
      "DELETE /v1/account/webhooks/{webhook_id}",
      "POST /v1/account/webhooks/{webhook_id}/toggle",
      "GET /v1/account/webhooks/{webhook_id}/deliveries",
      "POST /v1/webhooks/stripe",
      "POST /v1/checkout",
      "GET /v1/account/subscription",
      "POST /v1/account/subscription/cancel",
    ];

    const specPaths = spec.paths as Record<string, Record<string, unknown>>;
    const missing: string[] = [];

    for (const route of serverRoutes) {
      const [method, path] = route.split(" ");
      const methodLower = method.toLowerCase();
      const specPath = specPaths[path];
      if (!specPath || !specPath[methodLower]) {
        missing.push(route);
      }
    }

    expect(missing, `Missing OpenAPI paths: ${missing.join(", ")}`).toEqual([]);
  });

  it("spec path count matches expected total", () => {
    const paths = Object.keys(spec.paths);
    // 57 unique paths (some have multiple methods combined)
    expect(paths.length).toBeGreaterThanOrEqual(55);
  });
});
