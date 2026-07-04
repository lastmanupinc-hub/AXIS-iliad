import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { hasFw, getFw } from "./fw-helpers.js";
import { findFiles, findFile, findConfigs, renderExcerpts, extractExports, fileTree } from "./file-excerpt-utils.js";
import { mdText, mdCode, cssComment, yamlFlowScalar } from "./md-sanitize.js";
import { displayRoutes } from "./route-utils.js";
import { capNote, capMeta } from "./cap-utils.js";

// ─── mcp-config.json ────────────────────────────────────────────

export function generateMcpConfig(ctx: ContextMap, profile: RepoProfile, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const pkgManagers = ctx.detection.package_managers;

  const tools: Array<{ name: string; description: string; category: string; enabled: boolean }> = [];

  // File system tools
  tools.push({
    name: "read_file",
    description: "Read source files from the project",
    category: "filesystem",
    enabled: true,
  });
  tools.push({
    name: "list_directory",
    description: "List directory contents",
    category: "filesystem",
    enabled: true,
  });
  tools.push({
    name: "search_files",
    description: "Search for files by pattern",
    category: "filesystem",
    enabled: true,
  });

  // Build tools
  const pkgMgr = pkgManagers.includes("pnpm") ? "pnpm" : pkgManagers.includes("yarn") ? "yarn" : "npm";
  tools.push({
    name: "run_build",
    description: `Execute ${pkgMgr} build`,
    category: "build",
    enabled: true,
  });
  tools.push({
    name: "run_tests",
    description: `Execute test suite via ${ctx.detection.test_frameworks[0] ?? pkgMgr + " test"}`,
    category: "build",
    enabled: true,
  });
  tools.push({
    name: "type_check",
    description: "Run TypeScript type checking (tsc --noEmit)",
    category: "build",
    enabled: id.primary_language === "TypeScript" || id.primary_language === "JavaScript",
  });

  // Git tools
  tools.push({
    name: "git_status",
    description: "Check repository status",
    category: "git",
    enabled: true,
  });
  tools.push({
    name: "git_diff",
    description: "Show changes in working directory",
    category: "git",
    enabled: true,
  });
  tools.push({
    name: "git_log",
    description: "Show recent commit history",
    category: "git",
    enabled: true,
  });

  // Framework-specific tools
  if (hasFw(ctx, "Next.js")) {
    tools.push({
      name: "nextjs_dev_server",
      description: "Start Next.js development server",
      category: "framework",
      enabled: true,
    });
  }
  if (hasFw(ctx, "Prisma")) {
    tools.push({
      name: "prisma_studio",
      description: "Open Prisma Studio for database management",
      category: "framework",
      enabled: true,
    });
  }

  const truncated: Record<string, { shown: number; total: number }> = {};
  const dmMeta = capMeta(ctx.domain_models.length, 15);
  if (dmMeta) truncated.domain_models = dmMeta;
  const sqlMeta = ctx.sql_schema ? capMeta(ctx.sql_schema.length, 15) : undefined;
  if (sqlMeta) truncated.sql_schema = sqlMeta;

  const config = {
    mcpVersion: "1.0",
    project: id.name,
    generated_at: ctx.generated_at,
    project_summary: ctx.ai_context.project_summary || null,
    detected_stack: ctx.detection.frameworks.map(fw => ({
      name: fw.name,
      version: fw.version ?? null,
      confidence: fw.confidence,
    })),
    server: {
      name: `${id.name.toLowerCase().replace(/\s+/g, "-")}-mcp`,
      version: "0.1.0",
      description: `MCP server configuration for ${id.name}`,
    },
    capabilities: {
      tools: true,
      resources: true,
      prompts: true,
    },
    tools,
    resources: [
      {
        uri: `project://${id.name}/context-map`,
        name: "Context Map",
        description: "Full project context map with structure, detection, and AI context",
        mimeType: "application/json",
      },
      {
        uri: `project://${id.name}/repo-profile`,
        name: "Repository Profile",
        description: "Repository health profile with detection and goals",
        mimeType: "application/yaml",
      },
      ...ctx.domain_models.slice(0, 15).map(m => ({
        uri: `model://${id.name}/${m.name}`,
        name: m.name,
        description: `${m.kind} with ${m.field_count} field${m.field_count === 1 ? "" : "s"} (${m.source_file})`,
        mimeType: "application/json",
      })),
    ],
    prompts: [
      {
        name: "project-context",
        description: `Inject ${id.name} project context into the conversation`,
        arguments: [],
      },
      {
        name: "code-review",
        description: "Review code changes against project conventions",
        arguments: [{ name: "file_path", description: "Path to the file to review", required: true }],
      },
    ],
    security: {
      allowed_directories: ["."],
      denied_patterns: ["node_modules/**", ".env*", "*.key", "*.pem"],
      max_file_size_bytes: 1048576,
    },
    // ─── Domain Models ─────────────────────────────────────────
    domain_models: ctx.domain_models.length > 0
      ? ctx.domain_models.slice(0, 15).map(m => ({
          name: m.name,
          kind: m.kind,
          field_count: m.field_count,
          source_file: m.source_file,
          resource_uri: `model://${id.name}/${m.name}`,
        }))
      : null,
    // ─── Database Schema ──────────────────────────────────────
    sql_schema: ctx.sql_schema && ctx.sql_schema.length > 0
      ? ctx.sql_schema.slice(0, 15).map(t => ({
          table: t.name,
          columns: t.column_count,
          foreign_keys: t.foreign_key_count,
        }))
      : null,
    // ─── Source File Analysis ──────────────────────────────────
    detected_mcp_files: files && files.length > 0 ? (() => {
      const mcpFiles = findFiles(files, ["**/.mcp*", "**/mcp.config*", "**/mcp-server*", "**/server.*"]);
      return mcpFiles.slice(0, 6).map(f => ({
        path: f.path,
        exports: extractExports(f.content),
        size: f.size,
      }));
    })() : null,
    truncated: Object.keys(truncated).length > 0 ? truncated : undefined,
  };

  return {
    path: "mcp-config.json",
    content: JSON.stringify(config, null, 2),
    content_type: "application/json",
    program: "mcp",
    description: "MCP server configuration with tools, resources, prompts, and security settings",
  };
}

// ─── mcp-registry-metadata.json ───────────────────────────────

export function generateMcpRegistryMetadata(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const projectName = ctx.project_identity.name;
  let packageName: string | null = null;
  let packageVersion: string | null = null;
  let packageDescription: string | null = null;

  if (files && files.length > 0) {
    const pkg = findFile(files, "package.json");
    if (pkg) {
      try {
        const parsed = JSON.parse(pkg.content) as Record<string, unknown>;
        packageName = typeof parsed.name === "string" ? parsed.name : null;
        packageVersion = typeof parsed.version === "string" ? parsed.version : null;
        packageDescription = typeof parsed.description === "string" ? parsed.description : null;
      } catch {
        // Ignore malformed package.json and fall back to context-derived values.
      }
    }
  }

  const capabilities = [
    "tools",
    "resources",
    "prompts",
    ...(ctx.routes.length > 0 ? ["http_routes"] : []),
    ...(ctx.domain_models.length > 0 ? ["domain_models"] : []),
  ];

  const metadata = {
    schema_version: "1.0",
    generated_at: ctx.generated_at,
    registry: {
      name: packageName ?? `${projectName.toLowerCase().replace(/\s+/g, "-")}-mcp-server`,
      version: packageVersion ?? "0.1.0",
      description:
        packageDescription ??
        `MCP server metadata for ${projectName} publishing and discovery.`,
      capabilities,
    },
    mcp: {
      protocol_version: "2025-03-26",
      endpoint: "/mcp",
      transport: "streamable_http",
    },
    project: {
      name: projectName,
      type: ctx.project_identity.type,
      primary_language: ctx.project_identity.primary_language,
    },
  };

  return {
    path: "mcp-registry-metadata.json",
    content: JSON.stringify(metadata, null, 2),
    content_type: "application/json",
    program: "mcp",
    description:
      "Metadata for publishing to the MCP Registry (name, version, description, capabilities)",
  };
}

// ─── protocol-spec.md ─────────────────────────────────────────

export function generateProtocolSpec(ctx: ContextMap): GeneratedFile {
  const projectName = ctx.project_identity.name;
  const lines: string[] = [];

  lines.push(`# Protocol Specification — ${mdText(projectName)}`);
  lines.push("");
  lines.push(`Generated: ${ctx.generated_at}`);
  lines.push("");
  lines.push("## Purpose");
  lines.push("");
  lines.push(
    "Living specification for this MCP server protocol surface, covering transport, versioning, authentication, errors, and capability discovery.",
  );
  lines.push("");

  lines.push("## Versioning");
  lines.push("");
  lines.push("- JSON-RPC: `2.0`");
  lines.push("- MCP protocol target: `2025-03-26`");
  lines.push("- Server implementation version: semantic versioning (`MAJOR.MINOR.PATCH`).");
  lines.push("- Breaking changes require MAJOR increments and migration notes.");
  lines.push("- Additive fields/capabilities should prefer MINOR increments.");
  lines.push("- Backward-compatibility policy: additive-first; avoid breaking existing tool names and required fields.");
  lines.push("");

  lines.push("## Transport");
  lines.push("");
  lines.push("- Primary endpoint: `POST /mcp`");
  lines.push("- Discovery endpoints: `GET /.well-known/mcp.json`, `GET /v1/mcp/server.json`");
  lines.push("- Content-Type: `application/json`");
  lines.push("- Request envelope: JSON-RPC request object");
  lines.push("- Response envelope: JSON-RPC success or error object");
  lines.push("");

  lines.push("## JSON-RPC 2.0 Message Formats");
  lines.push("");
  lines.push("### Request");
  lines.push("");
  lines.push("```json");
  lines.push('{');
  lines.push('  "jsonrpc": "2.0",');
  lines.push('  "id": 1,');
  lines.push('  "method": "tools/call",');
  lines.push('  "params": {');
  lines.push('    "name": "list_programs",');
  lines.push('    "arguments": {}');
  lines.push('  }');
  lines.push('}');
  lines.push("```");
  lines.push("");

  lines.push("### Success Response");
  lines.push("");
  lines.push("```json");
  lines.push('{');
  lines.push('  "jsonrpc": "2.0",');
  lines.push('  "id": 1,');
  lines.push('  "result": {');
  lines.push('    "content": [{ "type": "text", "text": "..." }]');
  lines.push('  }');
  lines.push('}');
  lines.push("```");
  lines.push("");

  lines.push("### Error Response");
  lines.push("");
  lines.push("```json");
  lines.push('{');
  lines.push('  "jsonrpc": "2.0",');
  lines.push('  "id": 1,');
  lines.push('  "error": {');
  lines.push('    "code": -32602,');
  lines.push('    "message": "Invalid params"');
  lines.push('  }');
  lines.push('}');
  lines.push("```");
  lines.push("");

  lines.push("### Notification (no id)");
  lines.push("");
  lines.push("```json");
  lines.push('{');
  lines.push('  "jsonrpc": "2.0",');
  lines.push('  "method": "notifications/initialized",');
  lines.push('  "params": {}');
  lines.push('}');
  lines.push("```");
  lines.push("");
  lines.push("Notifications do not produce a response body.");
  lines.push("");

  lines.push("### Batch Request");
  lines.push("");
  lines.push("```json");
  lines.push('[');
  lines.push('  { "jsonrpc": "2.0", "id": 1, "method": "ping" },');
  lines.push('  { "jsonrpc": "2.0", "id": 2, "method": "tools/list" },');
  lines.push('  { "jsonrpc": "2.0", "method": "notifications/initialized", "params": {} }');
  lines.push(']');
  lines.push("```");
  lines.push("");
  lines.push("Batch response must include one entry per request that has an `id`.");
  lines.push("");

  lines.push("## Core Primitives");
  lines.push("");
  lines.push("### Tools");
  lines.push("");
  lines.push("Callable functions exposed by the server. Each tool MUST define an input schema so callers can validate arguments before execution.");
  lines.push("");
  lines.push("Example:");
  lines.push("```json");
  lines.push('{');
  lines.push('  "name": "analyze_repo",');
  lines.push('  "description": "Analyze a GitHub repository",');
  lines.push('  "inputSchema": {');
  lines.push('    "type": "object",');
  lines.push('    "required": ["github_url"],');
  lines.push('    "properties": {');
  lines.push('      "github_url": { "type": "string" }');
  lines.push('    }');
  lines.push('  }');
  lines.push('}');
  lines.push("```");
  lines.push("");

  lines.push("## Type Definitions / Core Types");
  lines.push("");
  lines.push("Canonical protocol types used across transports and handlers.");
  lines.push("");
  lines.push("### JsonRpcRequest");
  lines.push("");
  lines.push("```ts");
  lines.push("type JsonRpcRequest = {");
  lines.push("  jsonrpc: \"2.0\";");
  lines.push("  id?: string | number | null;");
  lines.push("  method: string;");
  lines.push("  params?: Record<string, unknown>;");
  lines.push("};");
  lines.push("```");
  lines.push("");

  lines.push("### JsonRpcSuccess | JsonRpcError");
  lines.push("");
  lines.push("```ts");
  lines.push("type JsonRpcSuccess = {");
  lines.push("  jsonrpc: \"2.0\";");
  lines.push("  id: string | number | null;");
  lines.push("  result: unknown;");
  lines.push("};");
  lines.push("");
  lines.push("type JsonRpcError = {");
  lines.push("  jsonrpc: \"2.0\";");
  lines.push("  id: string | number | null;");
  lines.push("  error: { code: number; message: string; data?: unknown };");
  lines.push("};");
  lines.push("```");
  lines.push("");

  lines.push("### InitializeRequest / InitializeResult");
  lines.push("");
  lines.push("```ts");
  lines.push("type InitializeRequest = JsonRpcRequest & {");
  lines.push("  method: \"initialize\";");
  lines.push("  params: {");
  lines.push("    protocolVersion: string;");
  lines.push("    capabilities: Record<string, unknown>;");
  lines.push("    clientInfo?: { name: string; version: string };");
  lines.push("  };\n};");
  lines.push("");
  lines.push("type InitializeResult = {");
  lines.push("  protocolVersion: string;");
  lines.push("  capabilities: Record<string, unknown>;");
  lines.push("  serverInfo: { name: string; version: string };");
  lines.push("};");
  lines.push("```");
  lines.push("");

  lines.push("### ToolDefinition / ToolCall");
  lines.push("");
  lines.push("```ts");
  lines.push("type StandardSchemaV1 = {");
  lines.push("  $schema: string;");
  lines.push("  version?: string;");
  lines.push("  type: string;");
  lines.push("  properties?: Record<string, unknown>;");
  lines.push("  required?: string[];");
  lines.push("  additionalProperties?: boolean;");
  lines.push("};");
  lines.push("");
  lines.push("type ToolDefinition = {");
  lines.push("  name: string;");
  lines.push("  description?: string;");
  lines.push("  inputSchema: StandardSchemaV1;");
  lines.push("  outputSchema?: StandardSchemaV1;");
  lines.push("};");
  lines.push("");
  lines.push("type ToolCall = {");
  lines.push("  name: string;");
  lines.push("  arguments?: Record<string, unknown>;");
  lines.push("};");
  lines.push("```");
  lines.push("");

  lines.push("### PaginationEnvelope");
  lines.push("");
  lines.push("```ts");
  lines.push("type PaginationEnvelope<T> = {");
  lines.push("  items: T[];");
  lines.push("  nextCursor?: string;");
  lines.push("  totalCount?: number;");
  lines.push("};");
  lines.push("```");
  lines.push("");

  lines.push("### CancelRequest / ProgressNotification");
  lines.push("");
  lines.push("```ts");
  lines.push("type CancelRequest = {");
  lines.push("  method: \"notifications/cancel\";");
  lines.push("  params: { requestId: string | number };");
  lines.push("};");
  lines.push("");
  lines.push("type ProgressNotification = {");
  lines.push("  method: \"notifications/progress\";");
  lines.push("  params: { requestId: string | number; progress: number; message?: string };");
  lines.push("};");
  lines.push("```");
  lines.push("");

  lines.push("### Resources");
  lines.push("");
  lines.push("Readable data endpoints identified by URIs. Resources are fetched (not executed) and return structured or text content.");
  lines.push("");
  lines.push("Example:");
  lines.push("```json");
  lines.push('{');
  lines.push('  "uri": "project://context-map",');
  lines.push('  "name": "Context Map",');
  lines.push('  "mimeType": "application/json"');
  lines.push('}');
  lines.push("```");
  lines.push("");

  lines.push("### Prompts");
  lines.push("");
  lines.push("Reusable templates that guide client behavior and can accept typed arguments.");
  lines.push("");
  lines.push("Example:");
  lines.push("```json");
  lines.push('{');
  lines.push('  "name": "code-review",');
  lines.push('  "description": "Review code using project conventions",');
  lines.push('  "arguments": [');
  lines.push('    { "name": "file_path", "required": true }');
  lines.push('  ]');
  lines.push('}');
  lines.push("```");
  lines.push("");

  lines.push("## Authentication");
  lines.push("");
  lines.push("- Primary: `Authorization: Bearer <api_key>`");
  lines.push("- Alternate: `x-axis-key: <api_key>`");
  lines.push("- Free tools may be called anonymously; paid tools require auth.");
  lines.push("");

  lines.push("## Capability Discovery");
  lines.push("");
  lines.push("- `tools/list` is the authoritative runtime capability listing.");
  lines.push("- `mcp-registry-metadata.json` describes publishing metadata for registries.");
  lines.push("- `capability-registry.json` exposes project-scoped generated capabilities.");
  lines.push("");

  lines.push("## Extensibility (SEPs)");
  lines.push("");
  lines.push("SEPs (Spec Extension Proposals) define forward-compatible protocol extensions.");
  lines.push("");
  lines.push("- Each SEP should include: id, title, status, motivation, wire format changes, and compatibility impact.");
  lines.push("- Capability negotiation should advertise supported SEP ids during handshake.");
  lines.push("- Experimental extensions should be opt-in and safely ignorable by unaware clients.");
  lines.push("- Accepted SEPs must include migration guidance and deprecation timelines.");
  lines.push("- Rejected or superseded SEPs should remain documented for implementer traceability.");
  lines.push("");

  lines.push("## Validation Schema Strategy");
  lines.push("");
  lines.push("- Tool input/output contracts SHOULD use Standard Schema-compatible JSON Schema representations.");
  lines.push("- Zod-authored schemas are acceptable when exported as JSON Schema-equivalent contracts for non-TypeScript clients.");
  lines.push("- Every tool should define at least an `inputSchema`; `outputSchema` is strongly recommended for typed clients.");
  lines.push("- Validation errors should map to JSON-RPC `-32602` (invalid params) with field-level details in `error.data`.");
  lines.push("- Schema identifiers should be stable (`$id`) to support caching and cross-language code generation.");
  lines.push("");

  lines.push("## Capabilities Advertisement (Handshake)");
  lines.push("");
  lines.push("Clients SHOULD call `initialize` first. Server responses SHOULD advertise supported primitives and protocol compatibility.");
  lines.push("");
  lines.push("Expected advertised capabilities:");
  lines.push("- `tools` (callable operations)");
  lines.push("- `resources` (readable context)");
  lines.push("- `prompts` (reusable templates)");
  lines.push("");
  lines.push("Server identity SHOULD include name and version for compatibility diagnostics.");
  lines.push("");

  lines.push("## Session Model");
  lines.push("");
  lines.push("- Session bootstraps at `initialize` and remains valid for subsequent calls.");
  lines.push("- Session-scoped metadata MAY be returned via headers (for example, session id)." );
  lines.push("- Notifications (`notifications/initialized`) mark client readiness and have no response body.");
  lines.push("");

  lines.push("## Transports");
  lines.push("");
  lines.push("- `stdio`: local process transport for CLI/desktop integrations.");
  lines.push("- `Streamable HTTP`: primary deployed transport at `POST /mcp`.");
  lines.push("- `WebSockets`: optional bidirectional transport when low-latency push/event streams are required.");
  lines.push("");
  lines.push("Transport behavior must preserve JSON-RPC 2.0 semantics regardless of channel.");
  lines.push("");

  lines.push("## Error Model");
  lines.push("");
  lines.push("- Parse and invalid request failures return JSON-RPC errors.");
  lines.push("- Tool execution failures return tool-level errors with actionable messages.");
  lines.push("- Authentication failures return explicit guidance: `Authorization: Bearer <api_key>`.");
  lines.push("");

  lines.push("## Pagination");
  lines.push("");
  lines.push("List-style operations SHOULD support bounded page sizes and continuation tokens or cursor offsets.");
  lines.push("Pagination state SHOULD be stable for a consistent snapshot of the underlying data.");
  lines.push("");

  lines.push("## Cancellation");
  lines.push("");
  lines.push("Long-running operations SHOULD support cancellation via client abort or protocol-level cancel requests where applicable.");
  lines.push("Servers SHOULD release resources quickly after cancellation.");
  lines.push("");

  lines.push("## Progress Reporting");
  lines.push("");
  lines.push("For long-running tasks, servers SHOULD emit progress notifications (percent, stage, or milestone markers)." );
  lines.push("Progress messages should be monotonic and end with a terminal success/failure outcome.");
  lines.push("");

  lines.push("## Security Model");
  lines.push("");
  lines.push("### OAuth");
  lines.push("");
  lines.push("- OAuth 2.1 style flows are RECOMMENDED for third-party delegated access.");
  lines.push("- Access tokens should be short-lived and scoped to least privilege.");
  lines.push("- Refresh token issuance should be policy-controlled and revocable.");
  lines.push("- Bearer tokens must be sent over TLS-only transports.");
  lines.push("");

  lines.push("### Sandboxing");
  lines.push("");
  lines.push("- Tool execution should run with explicit resource boundaries (CPU, memory, timeouts)." );
  lines.push("- Filesystem and network access should default-deny, then allowlist required targets.");
  lines.push("- Execution environments should isolate tenant data and prevent cross-session data leakage.");
  lines.push("");

  lines.push("### Consent");
  lines.push("");
  lines.push("- High-impact tool calls should require explicit user consent prior to execution.");
  lines.push("- Consent prompts should clearly state action, scope, and expected side effects.");
  lines.push("- Consent decisions should be auditable and revocable.");
  lines.push("");

  lines.push("## Idempotency and Determinism");
  lines.push("");
  lines.push("- Read/list operations should be deterministic for the same inputs.");
  lines.push("- Generation outputs are deterministic for the same snapshot and requested outputs.");
  lines.push("");

  lines.push("## Security and Operational Notes");
  lines.push("");
  lines.push("- Do not expose raw credentials in artifacts.");
  lines.push("- Log request identifiers for traceability.");
  lines.push("- Use least-privilege API keys for automation.");
  lines.push("");

  lines.push("## Change Log Policy");
  lines.push("");
  lines.push("- Update this document when transport/auth/error behavior changes.");
  lines.push("- For breaking changes, bump version and provide migration notes.");

  return {
    path: "protocol-spec.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "mcp",
    description: "Living protocol specification document for MCP transport, auth, errors, and capability discovery",
  };
}

// ─── spec.types.ts ───────────────────────────────────────────

export function generateSpecTypes(ctx: ContextMap): GeneratedFile {
  const projectName = ctx.project_identity.name;
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * spec.types.ts`);
  lines.push(` * Generated protocol contract types for ${cssComment(projectName)}.`);
  lines.push(` *`);
  lines.push(` * Scope:`);
  lines.push(` * - JSON-RPC envelopes`);
  lines.push(` * - Session and handshake messages`);
  lines.push(` * - Tools, resources, prompts contracts`);
  lines.push(` * - Pagination, cancellation, progress`);
  lines.push(` */`);
  lines.push("");
  lines.push("export type JsonRpcVersion = \"2.0\";");
  lines.push("export type JsonRpcId = string | number | null;");
  lines.push("");
  lines.push("export interface JsonRpcRequest<TParams = Record<string, unknown>> {");
  lines.push("  jsonrpc: JsonRpcVersion;");
  lines.push("  id: JsonRpcId;");
  lines.push("  method: string;");
  lines.push("  params?: TParams;");
  lines.push("}");
  lines.push("");
  lines.push("export interface JsonRpcNotification<TParams = Record<string, unknown>> {");
  lines.push("  jsonrpc: JsonRpcVersion;");
  lines.push("  method: string;");
  lines.push("  params?: TParams;");
  lines.push("}");
  lines.push("");
  lines.push("export interface JsonRpcSuccess<TResult = unknown> {");
  lines.push("  jsonrpc: JsonRpcVersion;");
  lines.push("  id: JsonRpcId;");
  lines.push("  result: TResult;");
  lines.push("}");
  lines.push("");
  lines.push("export interface JsonRpcErrorObject {");
  lines.push("  code: number;");
  lines.push("  message: string;");
  lines.push("  data?: unknown;");
  lines.push("}");
  lines.push("");
  lines.push("export interface JsonRpcErrorResponse {");
  lines.push("  jsonrpc: JsonRpcVersion;");
  lines.push("  id: JsonRpcId;");
  lines.push("  error: JsonRpcErrorObject;");
  lines.push("}");
  lines.push("");
  lines.push("export type JsonRpcResponse<TResult = unknown> = JsonRpcSuccess<TResult> | JsonRpcErrorResponse;");
  lines.push("export type JsonRpcBatchRequest = Array<JsonRpcRequest | JsonRpcNotification>;");
  lines.push("export type JsonRpcBatchResponse<TResult = unknown> = Array<JsonRpcResponse<TResult>>;");
  lines.push("");
  lines.push("export type TransportKind = \"stdio\" | \"streamable-http\" | \"websocket\";");
  lines.push("");
  lines.push("export interface ClientInfo {");
  lines.push("  name: string;");
  lines.push("  version: string;");
  lines.push("}");
  lines.push("");
  lines.push("export interface ServerInfo {");
  lines.push("  name: string;");
  lines.push("  version: string;");
  lines.push("}");
  lines.push("");
  lines.push("export interface CapabilityAdvertisement {");
  lines.push("  tools?: boolean | Record<string, unknown>;");
  lines.push("  resources?: boolean | Record<string, unknown>;");
  lines.push("  prompts?: boolean | Record<string, unknown>;");
  lines.push("  experimental?: Record<string, unknown>;");
  lines.push("  supportedSeps?: string[];");
  lines.push("}");
  lines.push("");
  lines.push("export interface InitializeParams {");
  lines.push("  protocolVersion: string;");
  lines.push("  capabilities: CapabilityAdvertisement;");
  lines.push("  clientInfo?: ClientInfo;");
  lines.push("}");
  lines.push("");
  lines.push("export interface InitializeResult {");
  lines.push("  protocolVersion: string;");
  lines.push("  capabilities: CapabilityAdvertisement;");
  lines.push("  serverInfo: ServerInfo;");
  lines.push("}");
  lines.push("");
  lines.push("export type InitializeRequest = JsonRpcRequest<InitializeParams> & { method: \"initialize\" };");
  lines.push("export type InitializedNotification = JsonRpcNotification<Record<string, never>> & {");
  lines.push("  method: \"notifications/initialized\";");
  lines.push("};");
  lines.push("");
  lines.push("export interface SessionContext {");
  lines.push("  sessionId?: string;");
  lines.push("  accountId?: string;");
  lines.push("  transport: TransportKind;");
  lines.push("  protocolVersion: string;");
  lines.push("}");
  lines.push("");
  lines.push("export interface ToolSchema {");
  lines.push("  type: string;");
  lines.push("  required?: string[];");
  lines.push("  properties?: Record<string, unknown>;");
  lines.push("  additionalProperties?: boolean;");
  lines.push("}");
  lines.push("");
  lines.push("export interface StandardSchemaV1 extends ToolSchema {");
  lines.push("  $schema: string;");
  lines.push("  $id?: string;");
  lines.push("  version?: string;");
  lines.push("}");
  lines.push("");
  lines.push("export type ZodCompatibleSchema = StandardSchemaV1;");
  lines.push("");
  lines.push("export interface ToolDefinition {");
  lines.push("  name: string;");
  lines.push("  description?: string;");
  lines.push("  inputSchema: StandardSchemaV1 | ZodCompatibleSchema;");
  lines.push("  outputSchema?: StandardSchemaV1 | ZodCompatibleSchema;");
  lines.push("}");
  lines.push("");
  lines.push("export interface ToolCallParams<TArgs = Record<string, unknown>> {");
  lines.push("  name: string;");
  lines.push("  arguments?: TArgs;");
  lines.push("}");
  lines.push("");
  lines.push("export interface ToolContentBlock {");
  lines.push("  type: \"text\" | \"json\" | \"image\" | string;");
  lines.push("  text?: string;");
  lines.push("  data?: unknown;");
  lines.push("  mimeType?: string;");
  lines.push("}");
  lines.push("");
  lines.push("export interface ToolCallResult {");
  lines.push("  content: ToolContentBlock[];");
  lines.push("  isError?: boolean;");
  lines.push("  structuredContent?: Record<string, unknown>;");
  lines.push("}");
  lines.push("");
  lines.push("export type ToolsListRequest = JsonRpcRequest<Record<string, never>> & { method: \"tools/list\" };");
  lines.push("export interface ToolsListResult {");
  lines.push("  tools: ToolDefinition[];");
  lines.push("}");
  lines.push("");
  lines.push("export type ToolCallRequest<TArgs = Record<string, unknown>> = JsonRpcRequest<ToolCallParams<TArgs>> & {");
  lines.push("  method: \"tools/call\";");
  lines.push("};");
  lines.push("");
  lines.push("export interface ResourceTemplate {");
  lines.push("  uriTemplate: string;");
  lines.push("  name: string;");
  lines.push("  description?: string;");
  lines.push("  mimeType?: string;");
  lines.push("}");
  lines.push("");
  lines.push("export interface ResourceDefinition {");
  lines.push("  uri: string;");
  lines.push("  name: string;");
  lines.push("  description?: string;");
  lines.push("  mimeType?: string;");
  lines.push("}");
  lines.push("");
  lines.push("export interface ResourceContent {");
  lines.push("  uri: string;");
  lines.push("  mimeType?: string;");
  lines.push("  text?: string;");
  lines.push("  blob?: string;");
  lines.push("}");
  lines.push("");
  lines.push("export interface ResourcesListResult {");
  lines.push("  resources: ResourceDefinition[];");
  lines.push("  templates?: ResourceTemplate[];");
  lines.push("}");
  lines.push("");
  lines.push("export interface ResourceReadParams {");
  lines.push("  uri: string;");
  lines.push("}");
  lines.push("");
  lines.push("export interface ResourceReadResult {");
  lines.push("  contents: ResourceContent[];");
  lines.push("}");
  lines.push("");
  lines.push("export type ResourcesListRequest = JsonRpcRequest<Record<string, never>> & { method: \"resources/list\" };");
  lines.push("export type ResourceReadRequest = JsonRpcRequest<ResourceReadParams> & { method: \"resources/read\" };");
  lines.push("");
  lines.push("export interface PromptArgument {");
  lines.push("  name: string;");
  lines.push("  description?: string;");
  lines.push("  required?: boolean;");
  lines.push("}");
  lines.push("");
  lines.push("export interface PromptDefinition {");
  lines.push("  name: string;");
  lines.push("  description?: string;");
  lines.push("  arguments?: PromptArgument[];");
  lines.push("}");
  lines.push("");
  lines.push("export interface PromptMessage {");
  lines.push("  role: \"system\" | \"user\" | \"assistant\";");
  lines.push("  content: ToolContentBlock;");
  lines.push("}");
  lines.push("");
  lines.push("export interface PromptGetParams {");
  lines.push("  name: string;");
  lines.push("  arguments?: Record<string, unknown>;");
  lines.push("}");
  lines.push("");
  lines.push("export interface PromptGetResult {");
  lines.push("  messages: PromptMessage[];");
  lines.push("}");
  lines.push("");
  lines.push("export type PromptsListRequest = JsonRpcRequest<Record<string, never>> & { method: \"prompts/list\" };");
  lines.push("export type PromptGetRequest = JsonRpcRequest<PromptGetParams> & { method: \"prompts/get\" };");
  lines.push("");
  lines.push("export interface PaginationEnvelope<T> {");
  lines.push("  items: T[];");
  lines.push("  nextCursor?: string;");
  lines.push("  totalCount?: number;");
  lines.push("}");
  lines.push("");
  lines.push("export interface CancelParams {");
  lines.push("  requestId: JsonRpcId;");
  lines.push("}");
  lines.push("");
  lines.push("export type CancelNotification = JsonRpcNotification<CancelParams> & {");
  lines.push("  method: \"notifications/cancel\";");
  lines.push("};");
  lines.push("");
  lines.push("export interface ProgressParams {");
  lines.push("  requestId: JsonRpcId;");
  lines.push("  progress: number;");
  lines.push("  message?: string;");
  lines.push("}");
  lines.push("");
  lines.push("export type ProgressNotification = JsonRpcNotification<ProgressParams> & {");
  lines.push("  method: \"notifications/progress\";");
  lines.push("};");

  return {
    path: "spec.types.ts",
    content: lines.join("\n"),
    content_type: "text/typescript",
    program: "mcp",
    description: "TypeScript protocol contracts for MCP message envelopes, tool/resource/prompt interfaces, and runtime notifications",
  };
}

// ─── mcp/README.md ───────────────────────────────────────────

export function generateMcpReadme(ctx: ContextMap, profile: RepoProfile): GeneratedFile {
  const projectName = ctx.project_identity.name;
  const primaryLanguage = ctx.project_identity.primary_language || "TypeScript";
  const packageManagers = ctx.detection.package_managers;
  const preferredPackageManager = packageManagers.includes("pnpm")
    ? "pnpm"
    : packageManagers.includes("yarn")
      ? "yarn"
      : "npm";

  const lines: string[] = [];

  lines.push(`# ${mdText(projectName)} MCP Server`);
  lines.push("");
  lines.push("## Project Overview");
  lines.push("");
  lines.push(`${mdText(projectName)} exposes a Model Context Protocol (MCP) server for repository analysis, generation workflows, and agentic automation.`);
  lines.push("");
  lines.push("This package README documents the MCP surface area, local setup, runtime compatibility, and contribution process.");
  lines.push("");

  lines.push("## Installation");
  lines.push("");
  lines.push("### Prerequisites");
  lines.push("");
  lines.push("- Git");
  lines.push("- A supported runtime (Node.js, Bun, or Deno)");
  lines.push(`- Package manager: ${mdText(preferredPackageManager)}`);
  lines.push("");
  lines.push("### Install Dependencies");
  lines.push("");
  if (preferredPackageManager === "pnpm") {
    lines.push("```bash");
    lines.push("pnpm install");
    lines.push("pnpm build");
    lines.push("```");
  } else if (preferredPackageManager === "yarn") {
    lines.push("```bash");
    lines.push("yarn install");
    lines.push("yarn build");
    lines.push("```");
  } else {
    lines.push("```bash");
    lines.push("npm install");
    lines.push("npm run build");
    lines.push("```");
  }
  lines.push("");

  lines.push("## Quickstart");
  lines.push("");
  lines.push("### 1) Start the API server");
  lines.push("");
  lines.push("```bash");
  lines.push("node apps/api/dist/server.js");
  lines.push("```");
  lines.push("");
  lines.push("### 2) Verify MCP endpoint");
  lines.push("");
  lines.push("```bash");
  lines.push("curl http://localhost:4000/.well-known/mcp.json");
  lines.push("```");
  lines.push("");
  lines.push("### 3) Call MCP initialize");
  lines.push("");
  lines.push("```bash");
  lines.push("curl -X POST http://localhost:4000/mcp \\");
  lines.push("  -H \"Content-Type: application/json\" \\");
  lines.push("  -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-03-26\",\"capabilities\":{}}}'");
  lines.push("```");
  lines.push("");
  lines.push("### 4) List available tools");
  lines.push("");
  lines.push("```bash");
  lines.push("curl -X POST http://localhost:4000/mcp \\");
  lines.push("  -H \"Content-Type: application/json\" \\");
  lines.push("  -d '{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\",\"params\":{}}'");
  lines.push("```");
  lines.push("");

  lines.push("## Supported Runtimes");
  lines.push("");
  lines.push("- Node.js: primary and production-supported runtime.");
  lines.push("- Bun: supported for local development and script execution where Node compatibility is sufficient.");
  lines.push("- Deno: supported via HTTP interface consumption and generated TypeScript contracts.");
  lines.push("");
  lines.push("Cross-runtime interoperability is enabled through JSON-RPC and Standard Schema-compatible contracts in `spec.types.ts` and `protocol-spec.md`.");
  lines.push("");

  lines.push("## Contribution Guidelines");
  lines.push("");
  lines.push("1. Read the repository `CONTRIBUTING.md` before opening a pull request.");
  lines.push("2. Keep protocol changes additive-first and update `protocol-spec.md` when behavior changes.");
  lines.push("3. Keep type contracts synchronized in `spec.types.ts` for new methods, params, and responses.");
  lines.push("4. Run tests before pushing:");
  lines.push("");
  lines.push("```bash");
  lines.push("npx vitest run");
  lines.push("```");
  lines.push("");
  lines.push("5. Include migration notes for any breaking protocol change.");
  lines.push("");

  lines.push("## Implementation Notes");
  lines.push("");
  lines.push(`- Primary language: ${mdText(primaryLanguage)}`);
  lines.push(`- Package manager(s): ${packageManagers.length > 0 ? mdText(packageManagers.join(", ")) : "unknown"}`);
  const detectedFrameworks = ctx.detection.frameworks.map(f => (f.version ? `${f.name}@${f.version}` : f.name));
  lines.push(`- Detected frameworks: ${detectedFrameworks.length > 0 ? mdText(detectedFrameworks.join(", ")) : "none"}`);

  return {
    path: "mcp/README.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "mcp",
    description: "MCP package README with project overview, installation, quickstart, runtime compatibility, and contribution guidelines",
  };
}

// ─── mcp/project-setup.md ───────────────────────────────────

export function generateProjectSetupGuide(ctx: ContextMap): GeneratedFile {
  const projectName = ctx.project_identity.name;
  const packageManagers = ctx.detection.package_managers;
  const preferredPackageManager = packageManagers.includes("pnpm")
    ? "pnpm"
    : packageManagers.includes("yarn")
      ? "yarn"
      : "npm";

  const lines: string[] = [];
  lines.push(`# Project Setup Guide — ${mdText(projectName)}`);
  lines.push("");
  lines.push("## Goal");
  lines.push("");
  lines.push("Establish a reproducible local setup for developing and validating this MCP server.");
  lines.push("");
  lines.push("## Environment Prerequisites");
  lines.push("");
  lines.push("- Git");
  lines.push("- Node.js 20+");
  lines.push("- One runtime adapter (Node.js, Bun, or Deno)");
  lines.push(`- Preferred package manager: ${mdText(preferredPackageManager)}`);
  lines.push("");
  lines.push("## Bootstrap");
  lines.push("");
  lines.push("```bash");
  lines.push("git clone <repo-url>");
  lines.push(`cd ${mdCode(projectName)}`);
  if (preferredPackageManager === "pnpm") {
    lines.push("pnpm install");
    lines.push("pnpm build");
  } else if (preferredPackageManager === "yarn") {
    lines.push("yarn install");
    lines.push("yarn build");
  } else {
    lines.push("npm install");
    lines.push("npm run build");
  }
  lines.push("```");
  lines.push("");
  lines.push("## Local Verification");
  lines.push("");
  lines.push("```bash");
  lines.push("node apps/api/dist/server.js");
  lines.push("curl http://localhost:4000/v1/health");
  lines.push("curl http://localhost:4000/.well-known/mcp.json");
  lines.push("```");
  lines.push("");
  lines.push("## Recommended Workspace Structure");
  lines.push("");
  lines.push("- `apps/api`: transport and JSON-RPC handling");
  lines.push("- `packages/generator-core`: artifact generation contracts");
  lines.push("- `mcp/`: protocol-facing assets (`README.md`, schemas, setup guides)");
  lines.push("");
  lines.push("## Setup Checklist");
  lines.push("");
  lines.push("- [ ] Dependencies installed");
  lines.push("- [ ] Build completes without type errors");
  lines.push("- [ ] MCP discovery endpoint responds");
  lines.push("- [ ] `tools/list` returns expected tool inventory");

  return {
    path: "mcp/project-setup.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "mcp",
    description: "Project setup playbook for bootstrapping and validating the MCP server locally",
  };
}

// ─── mcp/build-artifacts.md ─────────────────────────────────

export function generateBuildArtifactsGuide(ctx: ContextMap): GeneratedFile {
  const projectName = ctx.project_identity.name;
  const lines: string[] = [];

  lines.push(`# Build Artifacts Guide — ${mdText(projectName)}`);
  lines.push("");
  lines.push("## Purpose");
  lines.push("");
  lines.push("Describe required build outputs and verification gates for MCP publishing and deployment.");
  lines.push("");
  lines.push("## Core Build Outputs");
  lines.push("");
  lines.push("- `apps/api/dist/**`: compiled API server output");
  lines.push("- `mcp/README.md`: package-level setup and integration entrypoint");
  lines.push("- `protocol-spec.md`: canonical protocol behavior document");
  lines.push("- `spec.types.ts`: TypeScript contracts for protocol messages");
  lines.push("- `mcp/schemas/output-contract.schema.json`: machine-readable output contract");
  lines.push("");
  lines.push("## Build Commands");
  lines.push("");
  lines.push("```bash");
  lines.push("pnpm build");
  lines.push("npx vitest run");
  lines.push("```");
  lines.push("");
  lines.push("## Artifact Integrity Checks");
  lines.push("");
  lines.push("- Confirm generated MCP outputs are present in program registry.");
  lines.push("- Confirm output counts are synchronized in API, tests, and docs.");
  lines.push("- Confirm schema enum list matches available MCP files.");
  lines.push("- Confirm protocol and type documents are updated when message formats change.");
  lines.push("");
  lines.push("## CI/CD Packaging Notes");
  lines.push("");
  lines.push("- Publish generated artifacts alongside server build outputs.");
  lines.push("- Keep deterministic generation enabled to avoid drift between runs.");
  lines.push("- Fail CI on missing or stale MCP artifacts.");

  return {
    path: "mcp/build-artifacts.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "mcp",
    description: "Build artifact checklist and verification guidance for MCP packaging and release workflows",
  };
}

// ─── mcp/package-json.root.template.json ─────────────────────

export function generateRootPackageJsonTemplate(ctx: ContextMap): GeneratedFile {
  const projectName = ctx.project_identity.name.toLowerCase().replace(/\s+/g, "-");
  const packageManagers = ctx.detection.package_managers;
  const pm: "pnpm" | "yarn" | "bun" | "npm" =
    packageManagers.includes("pnpm") ? "pnpm" :
    packageManagers.includes("yarn") ? "yarn" :
    packageManagers.includes("bun") ? "bun" :
    "npm";

  const packageManagerField =
    pm === "pnpm" ? "pnpm@9" :
    pm === "yarn" ? "yarn@4" :
    pm === "bun" ? "bun@1" :
    "npm@10";

  // Detect actual workspace dirs from the analyzed repo. If apps/ or packages/
  // exist in the top-level layout, glob them; otherwise omit workspaces entirely.
  const layoutNames = new Set(ctx.structure.top_level_layout.map(l => l.name));
  const workspaces: string[] = [];
  if (layoutNames.has("apps")) workspaces.push("apps/*");
  if (layoutNames.has("packages")) workspaces.push("packages/*");

  // Compose package-manager-appropriate run commands. pnpm/yarn/bun support
  // workspace-recursive runs; npm 7+ uses --workspaces.
  const recursive =
    pm === "pnpm" ? "pnpm -r" :
    pm === "yarn" ? "yarn workspaces foreach -A run" :
    pm === "bun"  ? "bun run --filter='*'" :
    "npm run --workspaces --if-present";

  // The dev script needs a concrete first workspace to target. Pick a sensible
  // default: prefer apps/<first detected app>, otherwise the first package.
  const firstApp = ctx.structure.top_level_layout
    .find(l => l.name === "apps" && l.file_count > 0);
  const devScript = firstApp
    ? (pm === "pnpm" ? `pnpm --filter "./apps/*" --parallel dev`
       : pm === "yarn" ? `yarn workspaces foreach -A --include "apps/*" run dev`
       : pm === "bun"  ? `bun --filter "./apps/*" dev`
       : `npm run dev --workspaces --if-present`)
    : `${pm === "npm" ? "npm run" : pm} dev`;

  const template: Record<string, unknown> = {
    name: projectName,
    private: true,
    version: "0.1.0",
    type: "module",
    packageManager: packageManagerField,
    scripts: {
      build: `${recursive} build`,
      dev: devScript,
      test: `${recursive} test`,
      lint: `${recursive} lint`,
      typecheck: `${recursive} typecheck`,
      format: `${recursive} format`,
      clean: `${recursive} clean`,
    },
    engines: {
      node: ">=20",
    },
    devDependencies: {
      typescript: "^5.7.3",
    },
  };
  if (workspaces.length > 0) {
    // npm uses `workspaces`; pnpm uses `pnpm-workspace.yaml` (separate file).
    // For pnpm we still emit `workspaces` for tooling-compat, but the canonical
    // source on pnpm is the workspace yaml shipped alongside.
    template.workspaces = workspaces;
  }

  return {
    path: "mcp/package-json.root.template.json",
    content: JSON.stringify(template, null, 2),
    content_type: "application/json",
    program: "mcp",
    description: `Root package.json template tuned for ${pm}; workspaces inferred from the detected top-level layout (${workspaces.length > 0 ? workspaces.join(", ") : "no workspaces detected"}).`,
  };
}

// ─── mcp/package-json.package.template.json ──────────────────

export function generatePackagePackageJsonTemplate(ctx: ContextMap): GeneratedFile {
  const slug = ctx.project_identity.name.toLowerCase().replace(/\s+/g, "-");
  const scopedName = `@${slug}/sample-package`;
  // Use ESM `exports` instead of legacy `main`/`types`. ESM with type:module
  // and a top-level `main` causes resolver edge cases for downstream consumers.
  const template: Record<string, unknown> = {
    name: scopedName,
    private: true,
    version: "0.1.0",
    type: "module",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
    },
    files: [
      "dist",
      "README.md",
      "LICENSE",
    ],
    scripts: {
      build: "tsc -p tsconfig.json",
      dev: "tsc -p tsconfig.json --watch",
      test: "vitest run",
      lint: "eslint .",
      typecheck: "tsc --noEmit",
      clean: "rm -rf dist .turbo",
      prepublishOnly: "npm run build && npm run test",
    },
    dependencies: {},
    devDependencies: {
      typescript: "^5.7.3",
    },
  };

  return {
    path: "mcp/package-json.package.template.json",
    content: JSON.stringify(template, null, 2),
    content_type: "application/json",
    program: "mcp",
    description: "Per-package package.json template — ESM-correct exports map, no main/types legacy fields, build/dev/test/lint/typecheck/clean scripts plus prepublishOnly gate.",
  };
}

// ─── mcp/tsconfig.root.template.json ─────────────────────────

export function generateRootTsconfigTemplate(ctx?: ContextMap): GeneratedFile {
  // Derive include/paths/references from the actual top-level layout so the
  // template doesn't carry axis-iliad-specific directory names. Fall back to
  // the generic apps/+packages/ shape if no layout info is available.
  const layout = ctx?.structure.top_level_layout ?? [];
  const hasApps = layout.some(l => l.name === "apps" && l.file_count > 0);
  const hasPackages = layout.some(l => l.name === "packages" && l.file_count > 0);
  const hasSrc = layout.some(l => l.name === "src" && l.file_count > 0);

  const include: string[] = [];
  const paths: Record<string, string[]> = {};
  if (hasApps) {
    include.push("apps");
    paths["@apps/*"] = ["apps/*/src"];
  }
  if (hasPackages) {
    include.push("packages");
    paths["@packages/*"] = ["packages/*/src"];
  }
  if (hasSrc) {
    include.push("src");
  }
  if (include.length === 0) {
    // Conservative default for projects that don't use a workspace layout.
    include.push("src");
  }

  // References: discover candidate composite-project roots from the detected
  // entry points. Each unique top-level directory under apps/ or packages/
  // becomes a reference. This avoids hardcoding axis-specific paths.
  const refDirs = new Set<string>();
  const entryPaths = ctx?.entry_points.map(e => e.path) ?? [];
  for (const p of entryPaths) {
    const parts = p.split("/");
    if ((parts[0] === "apps" || parts[0] === "packages") && parts[1]) {
      refDirs.add(`./${parts[0]}/${parts[1]}`);
    }
  }
  const references = Array.from(refDirs).sort().map(path => ({ path }));

  const template: Record<string, unknown> = {
    $schema: "https://json.schemastore.org/tsconfig",
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      lib: ["ES2022"],
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      forceConsistentCasingInFileNames: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      resolveJsonModule: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      composite: true,
      incremental: true,
      baseUrl: ".",
      ...(Object.keys(paths).length > 0 ? { paths } : {}),
    },
    include,
    exclude: ["**/dist", "**/node_modules", "**/*.test.ts"],
    ...(references.length > 0 ? { references } : {}),
  };

  return {
    path: "mcp/tsconfig.root.template.json",
    content: JSON.stringify(template, null, 2),
    content_type: "application/json",
    program: "mcp",
    description: `Root tsconfig.json template derived from the detected layout (${include.join(", ") || "src"}). References discovered from entry points: ${references.length === 0 ? "none" : references.length + " composite project(s)"}.`,
  };
}

// ─── mcp/tsconfig.package.template.json ──────────────────────

export function generatePackageTsconfigTemplate(ctx?: ContextMap): GeneratedFile {
  // Only `extends: "../../tsconfig.base.json"` when a base config actually
  // exists in the analyzed repo. Otherwise inline all the strict settings so
  // a fresh package compiles without a missing-file error.
  const layout = ctx?.structure.top_level_layout ?? [];
  const hasPackages = layout.some(l => l.name === "packages" && l.file_count > 0);
  const hasBaseConfig = layout.some(l => l.name === "tsconfig.base.json");

  const compilerOptions: Record<string, unknown> = hasBaseConfig
    ? {
        rootDir: "src",
        outDir: "dist",
        tsBuildInfoFile: "dist/.tsbuildinfo",
        composite: true,
        incremental: true,
        ...(hasPackages ? { baseUrl: ".", paths: { "@packages/*": ["../*/src"] } } : {}),
      }
    : {
        rootDir: "src",
        outDir: "dist",
        tsBuildInfoFile: "dist/.tsbuildinfo",
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2022"],
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        forceConsistentCasingInFileNames: true,
        skipLibCheck: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        composite: true,
        incremental: true,
        ...(hasPackages ? { baseUrl: ".", paths: { "@packages/*": ["../*/src"] } } : {}),
      };

  const template: Record<string, unknown> = {
    $schema: "https://json.schemastore.org/tsconfig",
    ...(hasBaseConfig ? { extends: "../../tsconfig.base.json" } : {}),
    compilerOptions,
    include: ["src"],
    exclude: ["dist", "node_modules", "**/*.test.ts", "**/*.spec.ts"],
  };

  return {
    path: "mcp/tsconfig.package.template.json",
    content: JSON.stringify(template, null, 2),
    content_type: "application/json",
    program: "mcp",
    description: `Per-package tsconfig.json template ${hasBaseConfig ? "extending the repo's tsconfig.base.json" : "with inline strict settings (no base config detected)"}. ESM-focused, composite + incremental enabled.`,
  };
}

// ─── mcp/monorepo-structure.md ───────────────────────────────

export function generateMonorepoStructureGuide(ctx: ContextMap): GeneratedFile {
  const projectName = ctx.project_identity.name;
  const lines: string[] = [];

  lines.push(`# Monorepo Structure Template — ${mdText(projectName)}`);
  lines.push("");
  lines.push(`Generated: ${ctx.generated_at}`);
  lines.push("");
  lines.push("## Recommended Folder Layout");
  lines.push("");
  lines.push("```text");
  lines.push(".");
  lines.push("|- apps/");
  lines.push("|  |- api/");
  lines.push("|  |  |- src/");
  lines.push("|  |  |- test/");
  lines.push("|  |  `- package.json");
  lines.push("|  `- web/");
  lines.push("|     |- src/");
  lines.push("|     |- public/");
  lines.push("|     `- package.json");
  lines.push("|- packages/");
  lines.push("|  |- client/");
  lines.push("|  |  |- src/");
  lines.push("|  |  |  |- discovery/");
  lines.push("|  |  |  `- invocation/");
  lines.push("|  |  `- package.json");
  lines.push("|  |- sdk/");
  lines.push("|  |  |- src/");
  lines.push("|  |  |  `- index.ts");
  lines.push("|  |  `- package.json");
  lines.push("|  |- middleware/");
  lines.push("|  |  |- src/");
  lines.push("|  |  |  |- express/");
  lines.push("|  |  |  |- hono/");
  lines.push("|  |  |  `- node-http/");
  lines.push("|  |  `- package.json");
  lines.push("|  |- server/");
  lines.push("|  |  |- src/");
  lines.push("|  |  |  |- McpServer.ts");
  lines.push("|  |  |  |- tools/");
  lines.push("|  |  |  `- transports/");
  lines.push("|  |  `- package.json");
  lines.push("|  |- context-engine/");
  lines.push("|  |- generator-core/");
  lines.push("|  |- repo-parser/");
  lines.push("|  `- snapshots/");
  lines.push("|- mcp/");
  lines.push("|  |- schemas/");
  lines.push("|  `- templates/");
  lines.push("|- scripts/");
  lines.push("|- tsconfig.base.json");
  lines.push("|- pnpm-workspace.yaml");
  lines.push("`- package.json");
  lines.push("```");
  lines.push("");
  lines.push("## Folder Roles");
  lines.push("");
  lines.push("- `apps/`: deployable services and frontends.");
  lines.push("- `packages/`: shared libraries and buildable modules.");
  lines.push("- `packages/client/`: MCP client SDK for discovery and tool invocation.");
  lines.push("- `packages/sdk/`: umbrella SDK package that re-exports client and server public APIs.");
  lines.push("- `packages/middleware/`: optional framework adapters for HTTP runtimes.");
  lines.push("- `packages/server/`: MCP server implementation package.");
  lines.push("- `mcp/`: MCP-specific specs, schema contracts, and integration templates.");
  lines.push("- `scripts/`: repository automation tasks for CI/CD and local workflows.");
  lines.push("");
  lines.push("## packages/middleware Responsibilities");
  lines.push("");
  lines.push("- Express helpers: request auth, error mapping, and MCP route wiring.");
  lines.push("- Hono helpers: context adapters and typed handler wrappers.");
  lines.push("- Node HTTP helpers: bare-metal request/response adapters.");
  lines.push("- Keep middleware optional and thin; core protocol logic stays in server/client packages.");
  lines.push("");
  lines.push("## packages/sdk Responsibilities");
  lines.push("");
  lines.push("- Re-export stable APIs from `packages/client` and `packages/server`.");
  lines.push("- Provide a single import surface for external integrators.");
  lines.push("- Keep only composition and export wiring here  -  no transport-specific logic.");
  lines.push("");
  lines.push("## packages/client Responsibilities");
  lines.push("");
  lines.push("- Discovery: resolve server manifests, capabilities, and tool schemas.");
  lines.push("- Invocation: call tools with typed arguments and normalize responses.");
  lines.push("- Transport clients: support `http`, `stdio`, or `websocket` connectors.");
  lines.push("- Keep client retry/auth logic isolated from product UI code.");
  lines.push("");
  lines.push("## packages/server Responsibilities");
  lines.push("");
  lines.push("- `McpServer` class: central server lifecycle, capability declaration, and request dispatch.");
  lines.push("- Tool registration: define and register tools in `src/tools/*` with typed schemas.");
  lines.push("- Transports: implement `stdio`, `http`, or `websocket` adapters in `src/transports/*`.");
  lines.push("- Keep transport concerns separate from tool logic and business handlers.");
  lines.push("");
  lines.push("## Naming and Boundaries");
  lines.push("");
  lines.push("- Keep package names scoped (`@org/name`) and mirror folder names.");
  lines.push("- Avoid cross-app imports; share through `packages/*` only.");
  lines.push("- Keep runtime code in `src/`, generated output in `dist/`.");
  lines.push("- Co-locate tests in `test/` or as `*.test.ts` under `src/`.");
  lines.push("");
  lines.push("## Monorepo Bootstrap Checklist");
  lines.push("");
  lines.push("- Create root `package.json` with workspace and pipeline scripts.");
  lines.push("- Create root and per-package `tsconfig` files with strict ESM settings.");
  lines.push("- Configure workspace manager (`pnpm-workspace.yaml` or equivalent).");
  lines.push("- Add CI checks for build, test, lint, and typecheck across all packages.");

  return {
    path: "mcp/monorepo-structure.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "mcp",
    description: "Monorepo folder structure template with recommended app/package boundaries",
  };
}

// ─── mcp/core-implementation-artifacts.md ─────────────────────

export function generateCoreImplementationArtifactsGuide(ctx: ContextMap): GeneratedFile {
  const projectName = ctx.project_identity.name;
  const lines: string[] = [];

  lines.push(`# Core Implementation Artifacts — ${mdText(projectName)}`);
  lines.push("");
  lines.push(`Generated: ${ctx.generated_at}`);
  lines.push("");
  lines.push("## Purpose");
  lines.push("");
  lines.push("Define the implementation contracts for core MCP packages so server, client, and framework adapters evolve safely.");
  lines.push("");

  lines.push("## packages/server");
  lines.push("");
  lines.push("- Own the `McpServer` class and lifecycle hooks.");
  lines.push("- Register tools/resources/prompts with typed schemas.");
  lines.push("- Provide transport adapters under `src/transports/*` (`stdio`, `http`, `websocket`).");
  lines.push("- Keep business logic in service modules, not transport handlers.");
  lines.push("");

  lines.push("## 7. Server Implementation (packages/server/src/index.ts or McpServer.ts)");
  lines.push("");
  lines.push("- Export a stable `McpServer` entrypoint from `packages/server/src/index.ts`.");
  lines.push("- Keep request validation, tool registration, and dispatch inside `McpServer.ts`.");
  lines.push("- Wire transports via adapters and avoid transport-specific branches in core server logic.");
  lines.push("- Surface typed registration APIs so downstream packages can add tools safely.");
  lines.push("- Implement capability negotiation during `initialize` and clean teardown on `shutdown`.");
  lines.push("");
  lines.push("```ts");
  lines.push("// packages/server/src/index.ts");
  lines.push("export { McpServer } from \"./McpServer.js\";");
  lines.push("export type { ServerConfig, RegisteredTool } from \"./types.js\";");
  lines.push("```");
  lines.push("");
  lines.push("```ts");
  lines.push("// packages/server/src/McpServer.ts");
  lines.push("export class McpServer {");
  lines.push("  initialize(clientCapabilities: unknown) {");
  lines.push("    // Negotiate protocol version and feature flags from client/server capabilities.");
  lines.push("  }");
  lines.push("  tool(name: string, description: string, schema: unknown, handler: (input: unknown) => Promise<unknown>) {");
  lines.push("    // Register typed tool metadata and handler in an internal registry.");
  lines.push("  }");
  lines.push("  resource(name: string, description: string, uriTemplate: string, handler: (params: unknown) => Promise<unknown>) {");
  lines.push("    // Register a resource resolver that maps URI params to typed data.");
  lines.push("  }");
  lines.push("  prompt(name: string, description: string, schema: unknown, handler: (input: unknown) => Promise<string>) {");
  lines.push("    // Register reusable prompt builders with validated input schemas.");
  lines.push("  }");
  lines.push("  shutdown() {");
  lines.push("    // Flush pending work and release transport resources before exit.");
  lines.push("  }");
  lines.push("}");
  lines.push("```");
  lines.push("");

  lines.push("## 8. Transport Implementations");
  lines.push("");
  lines.push("- Implement transport adapters in `packages/server/src/transports/*` and keep them protocol-focused.");
  lines.push("- Standard adapters: `stdio`, `http`, and `websocket`.");
  lines.push("- Each adapter should expose consistent lifecycle hooks (`start`, `stop`) and delegate request handling to `McpServer`.");
  lines.push("- Keep auth, framing, and connection concerns inside adapters, not in tool/resource/prompt handlers.");
  lines.push("");
  lines.push("```ts");
  lines.push("// packages/server/src/transports/types.ts");
  lines.push("export interface TransportAdapter {");
  lines.push("  start(): Promise<void>;");
  lines.push("  stop(): Promise<void>;");
  lines.push("}");
  lines.push("```");
  lines.push("");
  lines.push("```text");
  lines.push("packages/server/src/transports/");
  lines.push("|- stdio.ts");
  lines.push("|- http.ts");
  lines.push("`- websocket.ts");
  lines.push("```");
  lines.push("");
  lines.push("### StdioServerTransport (most common for local use)");
  lines.push("");
  lines.push("- Use `StdioServerTransport` for local IDE integrations and CLI-hosted MCP servers.");
  lines.push("- Read framed JSON-RPC messages from `stdin` and write responses/events to `stdout`.");
  lines.push("- Keep transport startup deterministic so local tooling can connect immediately.");
  lines.push("");
  lines.push("```ts");
  lines.push("// packages/server/src/transports/stdio.ts");
  lines.push("export class StdioServerTransport implements TransportAdapter {");
  lines.push("  async start(): Promise<void> {");
  lines.push("    // Attach stdin/stdout handlers and forward parsed requests to McpServer.");
  lines.push("  }");
  lines.push("  async stop(): Promise<void> {");
  lines.push("    // Remove listeners and flush any buffered outbound messages.");
  lines.push("  }");
  lines.push("}");
  lines.push("```");
  lines.push("");
  lines.push("### Streamable HTTP transport");
  lines.push("");
  lines.push("- Use streamable HTTP when clients need request/response plus incremental server events over HTTP.");
  lines.push("- Expose an endpoint that accepts JSON-RPC messages and streams chunked responses back to the client.");
  lines.push("- Keep connection/session state in the transport layer and route protocol work to `McpServer`.");
  lines.push("");
  lines.push("```ts");
  lines.push("// packages/server/src/transports/http.ts");
  lines.push("export class StreamableHttpServerTransport implements TransportAdapter {");
  lines.push("  async start(): Promise<void> {");
  lines.push("    // Start HTTP listener and bind streaming JSON-RPC handlers.");
  lines.push("  }");
  lines.push("  async stop(): Promise<void> {");
  lines.push("    // Drain active streams and close open HTTP connections.");
  lines.push("  }");
  lines.push("}");
  lines.push("```");
  lines.push("");
  lines.push("### WebSocket support (extensible base)");
  lines.push("");
  lines.push("- Implement a shared base transport for connection/session handling, then extend it for WebSocket specifics.");
  lines.push("- Keep ping/pong, reconnect, and subscription fan-out in the WebSocket adapter layer.");
  lines.push("- Route normalized JSON-RPC payloads through `McpServer` so tool/resource/prompt logic stays transport-agnostic.");
  lines.push("");
  lines.push("```ts");
  lines.push("// packages/server/src/transports/websocket.ts");
  lines.push("abstract class BaseSocketTransport implements TransportAdapter {");
  lines.push("  abstract start(): Promise<void>;");
  lines.push("  abstract stop(): Promise<void>;");
  lines.push("}");
  lines.push("");
  lines.push("export class WebSocketServerTransport extends BaseSocketTransport {");
  lines.push("  async start(): Promise<void> {");
  lines.push("    // Accept ws connections and forward framed messages to McpServer.");
  lines.push("  }");
  lines.push("  async stop(): Promise<void> {");
  lines.push("    // Close live sockets and release heartbeat/subscription resources.");
  lines.push("  }");
  lines.push("}");
  lines.push("```");
  lines.push("");

  lines.push("## 9. Schema & Validation Layer");
  lines.push("");
  lines.push("- Centralize tool/resource/prompt schemas under `packages/server/src/schema/*`.");
  lines.push("- Validate inbound payloads before invoking handlers; return protocol-safe validation errors.");
  lines.push("- Keep runtime validators and exported schema metadata aligned to prevent drift between server and clients.");
  lines.push("- Reuse a shared validator interface so all registration paths (`tool`, `resource`, `prompt`) apply consistent rules.");
  lines.push("- Prefer Standard Schema-compatible validators and `zod` schemas so client/server types stay aligned.");
  lines.push("");
  lines.push("```ts");
  lines.push("// packages/server/src/schema/types.ts");
  lines.push("export interface SchemaValidator<TInput> {");
  lines.push("  parse(input: unknown): TInput;");
  lines.push("}");
  lines.push("");
  lines.push("export interface RegisteredSchema {");
  lines.push("  name: string;");
  lines.push("  kind: \"tool\" | \"resource\" | \"prompt\";");
  lines.push("  validator: SchemaValidator<unknown>;");
  lines.push("}");
  lines.push("```");
  lines.push("");
  lines.push("```ts");
  lines.push("// packages/server/src/McpServer.ts");
  lines.push("private validateOrThrow<T>(validator: SchemaValidator<T>, input: unknown): T {");
  lines.push("  return validator.parse(input);");
  lines.push("}");
  lines.push("```");
  lines.push("");
  lines.push("```ts");
  lines.push("// packages/server/src/schema/tool-schemas.ts");
  lines.push("import { z } from \"zod\";");
  lines.push("");
  lines.push("export const createTaskInputSchema = z.object({");
  lines.push("  title: z.string().min(1),");
  lines.push("  priority: z.enum([\"low\", \"medium\", \"high\"]),");
  lines.push("});");
  lines.push("");
  lines.push("export const createTaskOutputSchema = z.object({");
  lines.push("  taskId: z.string(),");
  lines.push("  accepted: z.boolean(),");
  lines.push("});");
  lines.push("");
  lines.push("export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;");
  lines.push("export type CreateTaskOutput = z.infer<typeof createTaskOutputSchema>;");
  lines.push("```");
  lines.push("");
  lines.push("```ts");
  lines.push("// packages/server/src/McpServer.ts");
  lines.push("server.tool(\"tasks.create\", \"Create a task\", createTaskInputSchema, async (input) => {");
  lines.push("  const typedInput = createTaskInputSchema.parse(input);");
  lines.push("  const result = { taskId: \"task_123\", accepted: true };");
  lines.push("  return createTaskOutputSchema.parse(result);");
  lines.push("});");
  lines.push("```");
  lines.push("");
  lines.push("### Runtime validation + TypeScript inference");
  lines.push("");
  lines.push("- Validate all unknown payloads at runtime before business logic executes.");
  lines.push("- Infer handler input/output types directly from schemas to remove duplicate type declarations.");
  lines.push("- Keep parsing at the boundary and pass strongly typed values through internal services.");
  lines.push("");
  lines.push("```ts");
  lines.push("const runReportInputSchema = z.object({");
  lines.push("  reportId: z.string().min(1),");
  lines.push("  includeDrafts: z.boolean().default(false),");
  lines.push("});");
  lines.push("");
  lines.push("const runReportOutputSchema = z.object({");
  lines.push("  status: z.enum([\"queued\", \"running\", \"complete\"]),");
  lines.push("  runId: z.string(),");
  lines.push("});");
  lines.push("");
  lines.push("type RunReportInput = z.infer<typeof runReportInputSchema>;");
  lines.push("type RunReportOutput = z.infer<typeof runReportOutputSchema>;");
  lines.push("");
  lines.push("const handleRunReport = async (input: unknown): Promise<RunReportOutput> => {");
  lines.push("  const typedInput: RunReportInput = runReportInputSchema.parse(input);");
  lines.push("  const result = await reportService.run(typedInput);");
  lines.push("  return runReportOutputSchema.parse(result);");
  lines.push("};");
  lines.push("```");
  lines.push("");

  lines.push("## 10. Middleware & Runtime Helpers");
  lines.push("");
  lines.push("- Keep framework glue code in `packages/middleware/src/*` so server and client packages stay runtime-agnostic.");
  lines.push("- Provide thin helpers for Express, Hono, Node HTTP, and other popular runtimes (for example Fastify) that adapt request/response objects to MCP transports.");
  lines.push("- Keep auth extraction, request context wiring, and error mapping in middleware helpers.");
  lines.push("- Avoid business logic in runtime adapters; delegate to `McpServer` and shared service modules.");
  lines.push("");
  lines.push("```ts");
  lines.push("// packages/middleware/src/express/createMcpExpressHandler.ts");
  lines.push("export function createMcpExpressHandler(server: McpServer) {");
  lines.push("  return async function mcpExpressHandler(req: unknown, res: unknown) {");
  lines.push("    // Adapt Express req/res into transport calls and send protocol-safe responses.");
  lines.push("  };\n}");
  lines.push("```");
  lines.push("");
  lines.push("```ts");
  lines.push("// packages/middleware/src/hono/createMcpHonoHandler.ts");
  lines.push("export function createMcpHonoHandler(server: McpServer) {");
  lines.push("  return async function mcpHonoHandler(ctx: unknown) {");
  lines.push("    // Map Hono context to MCP request/response semantics.");
  lines.push("  };\n}");
  lines.push("```");
  lines.push("");
  lines.push("```ts");
  lines.push("// packages/middleware/src/node-http/createMcpNodeHandler.ts");
  lines.push("import type { IncomingMessage, ServerResponse } from \"node:http\";");
  lines.push("");
  lines.push("function wrapIncomingMessage(req: IncomingMessage, res: ServerResponse) {");
  lines.push("  return {");
  lines.push("    method: req.method ?? \"GET\",");
  lines.push("    url: req.url ?? \"/\",");
  lines.push("    headers: req.headers,");
  lines.push("    res,");
  lines.push("  };\n}");
  lines.push("");
  lines.push("export function createMcpNodeHandler(server: McpServer) {");
  lines.push("  return async function mcpNodeHandler(req: IncomingMessage, res: ServerResponse) {");
  lines.push("    const httpCtx = wrapIncomingMessage(req, res);");
  lines.push("    // Normalize Node HTTP streams and delegate to the server transport boundary.");
  lines.push("  };\n}");
  lines.push("```");
  lines.push("");

  lines.push("## 11. Tests & Conformance Suite");
  lines.push("");
  lines.push("- Build a protocol conformance suite that runs the same JSON-RPC vectors across `stdio`, streamable `http`, and `websocket` transports.");
  lines.push("- Run conformance tests directly against the protocol spec so wire-level behavior stays interoperable across independent MCP clients/servers.");
  lines.push("- Add spec-trace fixtures for initialize, capabilities negotiation, tool call envelopes, resource reads, prompt rendering, and shutdown sequencing.");
  lines.push("- Verify interoperability by replaying canonical protocol transcripts and asserting identical outcomes across transport adapters.");
  lines.push("- Standardize on Vitest (or equivalent) with colocated test files near implementation modules for faster navigation and ownership clarity.");
  lines.push("- Follow colocated naming such as `tools/myTool.test.ts`, `transports/http.test.ts`, and `middleware/node-http.test.ts`.");
  lines.push("- Add unit tests for tool calling that verify argument validation, handler dispatch, and response envelope correctness.");
  lines.push("- Add message reconciliation tests that assert request/response IDs, ordering, and partial-event correlation remain consistent.");
  lines.push("- Add error-case unit tests for invalid params, unknown methods, transport disconnects, and timeout propagation.");
  lines.push("- Add contract tests for `initialize`, tool invocation, resource reads, prompt rendering, and `shutdown` semantics.");
  lines.push("- Validate schema behavior for success and failure paths, including malformed envelopes and unsupported capabilities.");
  lines.push("- Enforce deterministic responses: stable error codes, message shapes, and capability metadata across transports.");
  lines.push("- Gate release on matrix CI (Node LTS versions + runtime adapters) with per-transport pass/fail reporting.");
  lines.push("");
  lines.push("```text");
  lines.push("packages/server/test/conformance/");
  lines.push("|- json-rpc-vectors.test.ts");
  lines.push("|- tool-calling.unit.test.ts");
  lines.push("|- message-reconciliation.unit.test.ts");
  lines.push("|- error-cases.unit.test.ts");
  lines.push("|- lifecycle-contract.test.ts");
  lines.push("|- tool-resource-prompt-contract.test.ts");
  lines.push("`- transport-parity.test.ts");
  lines.push("```");
  lines.push("");

  lines.push("## 12. Documentation Files");
  lines.push("");
  lines.push("- Maintain `protocol-spec.md` as the canonical wire contract for request/response envelopes, lifecycle events, and error codes.");
  lines.push("- Keep `spec.types.ts` synchronized with runtime schemas so generated and handwritten clients share one source of truth.");
  lines.push("- Add `docs/server.md` as the detailed implementation guide for building MCP servers, transport adapters, and tool/resource/prompt registration flows.");
  lines.push("- Add `docs/client.md` as the usage guide for discovery, capability negotiation, transport configuration, and typed tool invocation from MCP clients.");
  lines.push("- Add `docs/protocol.md` for low-level protocol details including framing, message envelopes, lifecycle sequencing, and transport invariants.");
  lines.push("- Add `docs/capabilities.md` for advanced features such as sampling, elicitation, and capability-scoped behavior flags.");
  lines.push("- Publish package-level READMEs (`packages/server`, `packages/client`, `packages/sdk`, `packages/middleware`) with quickstart, transport setup, and troubleshooting sections.");
  lines.push("- Document versioning and compatibility policy for MCP protocol versions, transport support, and breaking changes.");
  lines.push("- Include migration notes and change summaries for every release that alters tool/resource/prompt contracts.");
  lines.push("");
  lines.push("```text");
  lines.push("docs/mcp/");
  lines.push("|- server.md");
  lines.push("|- client.md");
  lines.push("|- protocol.md");
  lines.push("|- capabilities.md");
  lines.push("|- protocol-spec.md");
  lines.push("|- spec.types.ts");
  lines.push("|- migration-notes.md");
  lines.push("`- compatibility-matrix.md");
  lines.push("```");
  lines.push("");

  lines.push("## 13. Examples Folder");
  lines.push("");
  lines.push("- Maintain an `examples/` folder with runnable reference projects for each supported transport (`stdio`, streamable `http`, `websocket`).");
  lines.push("- Include runnable minimal servers such as an `echo` tool and a `filesystem` tool so integrators can verify setup in minutes.");
  lines.push("- Provide real-world examples that show tool registration, resource serving, and client connections across common deployment patterns.");
  lines.push("- Include server and client examples that demonstrate tool, resource, and prompt flows end-to-end with typed schemas.");
  lines.push("- Keep examples minimal but production-realistic: auth wiring, error handling, lifecycle startup/shutdown, and logging.");
  lines.push("- Ensure every example has README setup/run steps and a deterministic verification command for CI checks.");
  lines.push("- Add matrix smoke tests to confirm examples stay compatible with current protocol and package versions.");
  lines.push("");
  lines.push("```text");
  lines.push("examples/");
  lines.push("|- server-stdio/");
  lines.push("|- server-http/");
  lines.push("|- server-websocket/");
  lines.push("|- server-echo-minimal/");
  lines.push("|- server-filesystem-minimal/");
  lines.push("|- realworld-tool-registration/");
  lines.push("|- realworld-resource-serving/");
  lines.push("|- realworld-client-connections/");
  lines.push("|- client-basic/");
  lines.push("`- tool-resource-prompt-e2e/");
  lines.push("```");
  lines.push("");

  lines.push("## 14. CI/CD & Release Artifacts");
  lines.push("");
  lines.push("- Add CI pipelines that run lint, typecheck, unit tests, conformance tests, and example smoke tests on every pull request.");
  lines.push("- Define `.github/workflows/` automation for lint, test, and build so every merge candidate passes the same deterministic quality gates.");
  lines.push("- Add npm publish workflows that use OIDC trusted publishing (no long-lived npm tokens) with environment protections and provenance attestations.");
  lines.push("- Use `.changeset/` with the Changesets tool for versioning so release notes, semver bumps, and package publish intent are captured in-repo.");
  lines.push("- Include release hygiene artifacts: `LICENSE`, `.gitignore`, and publish configuration (`publishConfig` in package manifests or equivalent) before any public publish.");
  lines.push("- Publish release artifacts for server/client/sdk/middleware packages with reproducible build metadata and checksums.");
  lines.push("- Generate protocol compatibility reports that compare current outputs against the previous stable release.");
  lines.push("- Enforce release gates for changelog completeness, migration notes, semantic version validation, and signed package provenance.");
  lines.push("- Include rollback playbooks and post-release verification steps for transport health and tool/resource/prompt contract integrity.");
  lines.push("");
  lines.push("```text");
  lines.push(".github/workflows/");
  lines.push("|- lint.yml");
  lines.push("|- test.yml");
  lines.push("|- build.yml");
  lines.push("|- mcp-ci.yml");
  lines.push("|- mcp-release.yml");
  lines.push("`- npm-publish.yml");
  lines.push(".changeset/");
  lines.push("`- <change>.md");
  lines.push("package.json (publishConfig)");
  lines.push("LICENSE");
  lines.push(".gitignore");
  lines.push("artifacts/releases/");
  lines.push("|- checksums.txt");
  lines.push("|- compatibility-report.md");
  lines.push("`- provenance.json");
  lines.push("```");
  lines.push("");

  lines.push("## 15. Registry & Discovery Support (Optional Early)");
  lines.push("");
  lines.push("- Add early MCP registry metadata so clients can discover server identity, version, capabilities, and transport endpoints before deep integration.");
  lines.push("- Provide a discovery endpoint and static manifest artifacts that advertise tools/resources/prompts with stable schema references.");
  lines.push("- Keep discovery payloads deterministic and cache-friendly so IDEs and agents can bootstrap quickly.");
  lines.push("- Include optional public/private registry publication guidance with auth boundaries and rollout strategy.");
  lines.push("- Validate registry and discovery contracts in CI to prevent drift between runtime behavior and published manifests.");
  lines.push("");
  lines.push("```text");
  lines.push("mcp/");
  lines.push("|- mcp-registry-metadata.json");
  lines.push("|- server-manifest.yaml");
  lines.push("|- capability-registry.json");
  lines.push("`- connector-map.yaml");
  lines.push("discovery/");
  lines.push("|- .well-known/mcp.json");
  lines.push("`- .well-known/agent.json");
  lines.push("```");
  lines.push("");

  lines.push("## packages/client");
  lines.push("");
  lines.push("- Discovery: resolve capabilities, tool lists, and schema metadata.");
  lines.push("- Invocation: execute tool calls with typed inputs and normalized outputs.");
  lines.push("- Support retry, timeout, and auth strategies per transport.");
  lines.push("- Expose a stable interface for app and SDK consumers.");
  lines.push("");

  lines.push("## packages/sdk");
  lines.push("");
  lines.push("- Re-export stable APIs from `packages/client` and `packages/server`.");
  lines.push("- Provide a single integration surface for external developers.");
  lines.push("- Avoid embedding transport-specific logic in the umbrella package.");
  lines.push("");

  lines.push("## packages/middleware");
  lines.push("");
  lines.push("- Optional adapters for `Express`, `Hono`, and Node `http` runtimes.");
  lines.push("- Map framework request/response objects to core server/client contracts.");
  lines.push("- Keep middleware thin and stateless; delegate protocol logic to server/client packages.");
  lines.push("");

  lines.push("## Recommended Artifact Layout");
  lines.push("");
  lines.push("```text");
  lines.push("packages/");
  lines.push("|- server/src/{McpServer.ts,tools/,transports/}");
  lines.push("|- client/src/{discovery/,invocation/}");
  lines.push("|- sdk/src/index.ts");
  lines.push("`- middleware/src/{express/,hono/,node-http/}");
  lines.push("```");

  return {
    path: "mcp/core-implementation-artifacts.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "mcp",
    description: "Core implementation package contracts for MCP server, client, sdk, and middleware modules",
  };
}

// ─── mcp/testing-documentation-polish-artifacts.md ────────────

export function generateTestingDocumentationPolishArtifactsGuide(ctx: ContextMap): GeneratedFile {
  const projectName = ctx.project_identity.name;
  const lines: string[] = [];

  lines.push(`# Testing, Documentation & Polish Artifacts — ${mdText(projectName)}`);
  lines.push("");
  lines.push(`Generated: ${ctx.generated_at}`);
  lines.push("");
  lines.push("## Phase Goal");
  lines.push("");
  lines.push("Harden MCP packages for release quality through automated tests, operator documentation, and production polish checks.");
  lines.push("");
  lines.push("## 1. Testing Artifacts");
  lines.push("");
  lines.push("- Add unit tests for `McpServer` registration paths (`tool`, `resource`, `prompt`) and lifecycle (`initialize`, `shutdown`).");
  lines.push("- Add transport integration tests for `stdio`, streamable `http`, and `websocket` adapters.");
  lines.push("- Add schema-contract tests that assert runtime validation and typed inference stay aligned.");
  lines.push("- Add negative-path tests for malformed JSON-RPC envelopes, auth failures, and capability mismatches.");
  lines.push("");
  lines.push("```text");
  lines.push("packages/");
  lines.push("|- server/test/{mcp-server.test.ts,lifecycle.test.ts}");
  lines.push("|- server/test/transports/{stdio.test.ts,http.test.ts,websocket.test.ts}");
  lines.push("`- middleware/test/{express.test.ts,hono.test.ts,node-http.test.ts}");
  lines.push("```");
  lines.push("");
  lines.push("## 2. Documentation Artifacts");
  lines.push("");
  lines.push("- Publish package-level READMEs with install, quickstart, and transport-specific setup guidance.");
  lines.push("- Document compatibility matrix across runtimes (Node, Bun, Deno) and transport modes.");
  lines.push("- Include failure-mode and troubleshooting sections for handshake, schema, and transport errors.");
  lines.push("- Keep generated protocol docs and exported type contracts version-locked per release.");
  lines.push("");
  lines.push("## 3. Polish Artifacts");
  lines.push("");
  lines.push("- Enforce lint, typecheck, and test gates in CI before publish.");
  lines.push("- Add release checklist entries for breaking-change review and migration notes.");
  lines.push("- Validate examples compile/run for each supported transport and framework adapter.");
  lines.push("- Ensure log output and error payloads are deterministic and safe for agent consumption.");
  lines.push("");
  lines.push("## 4. Release Readiness Checklist");
  lines.push("");
  lines.push("- [ ] Unit and integration tests pass across server/client/middleware packages");
  lines.push("- [ ] Runtime validation and inferred TypeScript types verified against live examples");
  lines.push("- [ ] README, API docs, and protocol spec updated for current release");
  lines.push("- [ ] CI quality gates (lint/typecheck/test) required on main branch");
  lines.push("- [ ] Transport adapters validated: stdio, streamable HTTP, websocket");

  return {
    path: "mcp/testing-documentation-polish-artifacts.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "mcp",
    description: "Phase 4 release hardening guide for MCP testing, documentation, and polish artifacts",
  };
}

// ─── connector-map.yaml ─────────────────────────────────────────

export function generateConnectorMap(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const routes = displayRoutes(ctx.routes);
  const models = ctx.domain_models;
  const deps = ctx.dependency_graph.external_dependencies;
  const lines: string[] = [];

  lines.push("# Connector Map");
  lines.push(`# Project: ${yamlFlowScalar(id.name)}`);
  lines.push(`# Generated: ${ctx.generated_at}`);
  if (ctx.ai_context.project_summary) {
    lines.push(`# Summary: ${yamlFlowScalar(ctx.ai_context.project_summary.split("\n")[0])}`);
  }
  lines.push("");
  lines.push("connectors:");

  // IDE connectors
  lines.push("  - id: vscode");
  lines.push("    name: VS Code");
  lines.push("    type: ide");
  lines.push("    protocol: mcp");
  lines.push("    status: available");
  lines.push("    capabilities:");
  lines.push("      - file_editing");
  lines.push("      - terminal_execution");
  lines.push("      - diagnostics");
  lines.push("      - code_actions");

  lines.push("  - id: cursor");
  lines.push("    name: Cursor");
  lines.push("    type: ide");
  lines.push("    protocol: mcp");
  lines.push("    status: available");
  lines.push("    capabilities:");
  lines.push("      - file_editing");
  lines.push("      - terminal_execution");
  lines.push("      - ai_chat");

  // CI/CD connectors
  if (ctx.detection.ci_platform) {
    lines.push(`  - id: ci_${ctx.detection.ci_platform.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`);
    lines.push(`    name: ${yamlFlowScalar(ctx.detection.ci_platform)}`);
    lines.push("    type: ci_cd");
    lines.push("    protocol: webhook");
    lines.push("    status: detected");
    lines.push("    capabilities:");
    lines.push("      - build_trigger");
    lines.push("      - test_execution");
    lines.push("      - deployment");
  }

  // Package registry connectors
  const pkgManagers = ctx.detection.package_managers;
  if (pkgManagers.includes("npm") || pkgManagers.includes("pnpm") || pkgManagers.includes("yarn")) {
    lines.push("  - id: npm_registry");
    lines.push("    name: npm Registry");
    lines.push("    type: package_registry");
    lines.push("    protocol: https");
    lines.push("    status: available");
    lines.push("    capabilities:");
    lines.push("      - package_publish");
    lines.push("      - version_check");
    lines.push("      - audit");
  }

  if (pkgManagers.includes("pip")) {
    lines.push("  - id: pypi");
    lines.push("    name: PyPI");
    lines.push("    type: package_registry");
    lines.push("    protocol: https");
    lines.push("    status: available");
    lines.push("    capabilities:");
    lines.push("      - package_publish");
    lines.push("      - version_check");
  }

  // Database connectors (detected from dependencies)
  if (hasFw(ctx, "Prisma")) {
    lines.push("  - id: prisma_db");
    lines.push("    name: Prisma Database");
    lines.push("    type: database");
    lines.push("    protocol: prisma");
    lines.push("    status: detected");
    lines.push("    capabilities:");
    lines.push("      - schema_management");
    lines.push("      - migrations");
    lines.push("      - studio");
  }

  // Detect external service connectors from dependencies
  const serviceMap: Record<string, { name: string; type: string; protocol: string; caps: string[] }> = {
    "better-sqlite3": { name: "SQLite", type: "database", protocol: "sqlite", caps: ["read", "write", "wal_mode"] },
    pg: { name: "PostgreSQL", type: "database", protocol: "tcp", caps: ["read", "write", "migrations"] },
    mysql2: { name: "MySQL", type: "database", protocol: "tcp", caps: ["read", "write", "migrations"] },
    redis: { name: "Redis", type: "cache", protocol: "tcp", caps: ["get", "set", "pub_sub"] },
    ioredis: { name: "Redis", type: "cache", protocol: "tcp", caps: ["get", "set", "pub_sub", "cluster"] },
    mongoose: { name: "MongoDB", type: "database", protocol: "tcp", caps: ["read", "write", "aggregation"] },
    "@aws-sdk/client-s3": { name: "AWS S3", type: "object_storage", protocol: "https", caps: ["upload", "download", "list"] },
    stripe: { name: "Stripe", type: "payment", protocol: "https", caps: ["charges", "subscriptions", "webhooks"] },
    "@sendgrid/mail": { name: "SendGrid", type: "email", protocol: "https", caps: ["send_email", "templates"] },
    amqplib: { name: "RabbitMQ", type: "message_queue", protocol: "amqp", caps: ["publish", "subscribe", "ack"] },
    kafkajs: { name: "Kafka", type: "message_queue", protocol: "tcp", caps: ["produce", "consume", "admin"] },
    "socket.io": { name: "Socket.IO", type: "realtime", protocol: "websocket", caps: ["emit", "on", "rooms"] },
  };

  for (const dep of deps) {
    const svc = serviceMap[dep.name];
    if (svc) {
      const svcId = svc.name.toLowerCase().replace(/[\s.]/g, "_");
      lines.push(`  - id: ${svcId}`);
      lines.push(`    name: ${svc.name}`);
      lines.push(`    type: ${svc.type}`);
      lines.push(`    protocol: ${svc.protocol}`);
      lines.push("    status: detected");
      lines.push(`    version: ${JSON.stringify(dep.version)}`);
      lines.push("    capabilities:");
      for (const cap of svc.caps) {
        lines.push(`      - ${cap}`);
      }
    }
  }

  // Git connector
  lines.push("  - id: git");
  lines.push("    name: Git");
  lines.push("    type: version_control");
  lines.push("    protocol: git");
  lines.push("    status: available");
  lines.push("    capabilities:");
  lines.push("      - commit");
  lines.push("      - branch");
  lines.push("      - merge");
  lines.push("      - push");
  lines.push("");

  // ─── MCP Resources (from domain models) ─────────────────────
  if (models.length > 0) {
    lines.push("resources:");
    const resNote = capNote(models.length, 15, "domain models");
    if (resNote) lines.push(`  # ${resNote}`);
    for (const m of models.slice(0, 15)) {
      const resId = m.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
      lines.push(`  - id: ${resId}`);
      lines.push(`    name: ${yamlFlowScalar(m.name)}`);
      lines.push(`    type: domain_model`);
      lines.push(`    kind: ${yamlFlowScalar(m.kind)}`);
      lines.push(`    fields: ${m.field_count}`);
      lines.push(`    source: ${yamlFlowScalar(m.source_file)}`);
    }
    lines.push("");
  }

  // ─── MCP Tools (from API routes) ────────────────────────────
  if (routes.length > 0) {
    lines.push("tools:");
    const toolNote = capNote(routes.length, 20, "routes");
    if (toolNote) lines.push(`  # ${toolNote}`);
    for (const r of routes.slice(0, 20)) {
      const toolId = r.path.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
      lines.push(`  - id: ${toolId}`);
      lines.push(`    name: ${yamlFlowScalar(`${r.method} ${r.path}`)}`);
      lines.push(`    method: ${yamlFlowScalar(r.method)}`);
      lines.push(`    path: ${yamlFlowScalar(r.path)}`);
      lines.push(`    source: ${yamlFlowScalar(r.source_file)}`);
    }
    lines.push("");
  }

  lines.push("integration_flows:");
  lines.push("  - name: development_loop");
  lines.push("    description: Standard development workflow");
  lines.push("    steps:");
  lines.push("      - connector: vscode");
  lines.push("        action: edit_files");
  lines.push("      - connector: vscode");
  lines.push("        action: run_tests");
  lines.push("      - connector: git");
  lines.push("        action: commit");
  if (ctx.detection.ci_platform) {
    lines.push(`      - connector: ci_${ctx.detection.ci_platform.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`);
    lines.push("        action: build_and_test");
  }
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const ciFiles = findFiles(files, ["**/.github/workflows/*", "**/Dockerfile*", "**/docker-compose*", "**/.gitlab-ci*", "**/Jenkinsfile*"]);
    if (ciFiles.length > 0) {
      lines.push("# Detected CI/Deployment Files");
      lines.push("detected_configs:");
      for (const f of ciFiles.slice(0, 8)) {
        lines.push(`  - path: ${JSON.stringify(f.path)}`);
        lines.push(`    size: ${f.size}`);
      }
      lines.push("");
    }
  }

  return {
    path: "connector-map.yaml",
    content: lines.join("\n"),
    content_type: "text/yaml",
    program: "mcp",
    description: "Map of available connectors, integration protocols, and workflow flows",
  };
}

// ─── capability-registry.json ───────────────────────────────────

export function generateCapabilityRegistry(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const testFws = ctx.detection.test_frameworks;
  const buildTools = ctx.detection.build_tools;
  const pkgManagers = ctx.detection.package_managers;
  const pkgMgr = pkgManagers.includes("pnpm") ? "pnpm" : pkgManagers.includes("yarn") ? "yarn" : "npm";
  // Honesty gate: only claim npm-style build/dev/install when this is actually a
  // JS/Node project — a detected JS package manager OR a JS/TS primary language.
  // A Python/Rust/Go repo (even one with a Makefile) reports these unavailable
  // rather than fabricating `npm run build`. `buildTools` is NOT a reliable
  // signal: detectBuildTools emits go_modules/make for non-JS repos, and never
  // emits tsc for a lockfile-less TS repo — so keying off it both false-positives
  // Go/Make and false-negatives tsc-only JS.
  const hasJsPkgMgr = pkgManagers.some((p) => ["npm", "pnpm", "yarn", "bun"].includes(p));
  const isJsProject = id.primary_language === "TypeScript" || id.primary_language === "JavaScript";
  const hasJsToolchain = hasJsPkgMgr || isJsProject;

  const capabilities: Array<{
    id: string;
    name: string;
    category: string;
    provider: string;
    command: string;
    available: boolean;
  }> = [];

  // Build capabilities
  capabilities.push({
    id: "build",
    name: "Build Project",
    category: "build",
    provider: buildTools[0] ?? pkgMgr,
    command: `${pkgMgr} run build`,
    available: hasJsToolchain,
  });

  capabilities.push({
    id: "dev",
    name: "Start Dev Server",
    category: "build",
    provider: buildTools.includes("vite") ? "vite" : pkgMgr,
    command: `${pkgMgr} run dev`,
    available: hasJsToolchain,
  });

  // Test capabilities
  if (testFws.length > 0) {
    capabilities.push({
      id: "test",
      name: "Run Tests",
      category: "testing",
      provider: testFws[0],
      command: testFws.includes("vitest") ? "npx vitest run" : testFws.includes("jest") ? "npx jest" : `${pkgMgr} test`,
      available: true,
    });

    capabilities.push({
      id: "test_watch",
      name: "Run Tests (Watch)",
      category: "testing",
      provider: testFws[0],
      command: testFws.includes("vitest") ? "npx vitest" : testFws.includes("jest") ? "npx jest --watch" : `${pkgMgr} test -- --watch`,
      available: true,
    });
  }

  // Type checking
  if (id.primary_language === "TypeScript" || buildTools.includes("tsc")) {
    capabilities.push({
      id: "typecheck",
      name: "Type Check",
      category: "analysis",
      provider: "tsc",
      command: "npx tsc --noEmit",
      available: true,
    });
  }

  // Linting
  capabilities.push({
    id: "lint",
    name: "Lint Code",
    category: "analysis",
    provider: "eslint",
    command: `${pkgMgr} run lint`,
    available: buildTools.includes("eslint"),
  });

  // Format
  capabilities.push({
    id: "format",
    name: "Format Code",
    category: "analysis",
    provider: "prettier",
    command: `${pkgMgr} run format`,
    available: buildTools.includes("prettier"),
  });

  // Install
  capabilities.push({
    id: "install",
    name: "Install Dependencies",
    category: "setup",
    provider: pkgMgr,
    command: `${pkgMgr} install`,
    available: hasJsToolchain,
  });

  // Git capabilities
  capabilities.push({
    id: "git_status",
    name: "Git Status",
    category: "version_control",
    provider: "git",
    command: "git status",
    available: true,
  });

  capabilities.push({
    id: "git_commit",
    name: "Git Commit",
    category: "version_control",
    provider: "git",
    command: "git add -A && git commit -m \"<message>\"",
    available: true,
  });

  const registry = {
    project: id.name,
    generated_at: ctx.generated_at,
    project_summary: ctx.ai_context.project_summary || null,
    detected_stack: ctx.detection.frameworks.map(fw => ({
      name: fw.name,
      version: fw.version ?? null,
      confidence: fw.confidence,
    })),
    total_capabilities: capabilities.length,
    categories: [...new Set(capabilities.map(c => c.category))],
    capabilities,
    // ─── Source File Analysis ──────────────────────────────────
    source_scripts: files && files.length > 0 ? (() => {
      const pkgJson = findFile(files, "package.json");
      if (!pkgJson) return null;
      const match = pkgJson.content.match(/"scripts"\s*:\s*\{([^}]+)\}/);
      if (!match) return null;
      const scriptLines = match[1].split("\n").map(l => l.trim()).filter(l => l.length > 0);
      return scriptLines.slice(0, 15).map(l => l.replace(/,$/, ""));
    })() : null,
  };

  return {
    path: "capability-registry.json",
    content: JSON.stringify(registry, null, 2),
    content_type: "application/json",
    program: "mcp",
    description: "Registry of available project capabilities with commands and providers",
  };
}

// ─── server-manifest.yaml ───────────────────────────────────────

export function generateServerManifest(ctx: ContextMap, profile: RepoProfile, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks;
  const routes = displayRoutes(ctx.routes);
  const deps = ctx.dependency_graph.external_dependencies;

  const lines: string[] = [];
  lines.push("# MCP Server Manifest");
  lines.push(`# Project: ${yamlFlowScalar(id.name)}`);
  lines.push(`# Generated: ${ctx.generated_at}`);
  if (ctx.ai_context.project_summary) {
    lines.push(`# Summary: ${yamlFlowScalar(ctx.ai_context.project_summary.split("\n")[0])}`);
  }
  lines.push("");

  lines.push("server:");
  lines.push(`  name: ${JSON.stringify(id.name + "-mcp-server")}`);
  lines.push("  version: \"1.0.0\"");
  lines.push(`  description: ${JSON.stringify("MCP server for " + id.name + " project integration")}`);
  lines.push("  protocol: \"mcp\"");
  lines.push("  transport: \"stdio\"");
  lines.push("");

  lines.push("  capabilities:");
  lines.push("    tools: true");
  lines.push("    resources: true");
  lines.push("    prompts: true");
  lines.push("");

  // Tools from project context
  lines.push("  tools:");

  lines.push("    - name: analyze_project");
  lines.push("      description: Run full project analysis and return context map");
  lines.push("      input_schema:");
  lines.push("        type: object");
  lines.push("        properties:");
  lines.push("          depth:");
  lines.push("            type: string");
  lines.push("            enum: [quick, standard, deep]");
  lines.push("            default: standard");
  lines.push("");

  lines.push("    - name: search_code");
  lines.push("      description: Search project codebase by pattern or semantic query");
  lines.push("      input_schema:");
  lines.push("        type: object");
  lines.push("        required: [query]");
  lines.push("        properties:");
  lines.push("          query:");
  lines.push("            type: string");
  lines.push("          file_pattern:");
  lines.push("            type: string");
  lines.push("");

  lines.push("    - name: generate_files");
  lines.push("      description: Generate output files for a specific program");
  lines.push("      input_schema:");
  lines.push("        type: object");
  lines.push("        required: [program]");
  lines.push("        properties:");
  lines.push("          program:");
  lines.push("            type: string");
  lines.push("            enum: [search, debug, skills, frontend, seo, optimization, theme, brand, superpowers, marketing, notebook, obsidian, mcp, artifacts, remotion, canvas, algorithmic]");
  lines.push("");

  if (routes.length > 0) {
    lines.push("    - name: list_routes");
    lines.push(`      description: List all ${routes.length} detected routes`);
    lines.push("      input_schema:");
    lines.push("        type: object");
    lines.push("        properties:");
    lines.push("          method:");
    lines.push("            type: string");
    lines.push("            enum: [GET, POST, PUT, DELETE, PATCH]");
    lines.push("");
  }

  const models = ctx.domain_models;
  if (models.length > 0) {
    const qNote = capNote(models.length, 12, "domain-model query tools");
    if (qNote) lines.push(`    # ${qNote}`);
    for (const m of models.slice(0, 12)) {
      const toolName = `query_${m.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      lines.push(`    - name: ${toolName}`);
      lines.push(`      description: ${yamlFlowScalar(`Query ${m.name} records (${m.kind}, ${m.field_count} fields)`)}`);
      lines.push("      input_schema:");
      lines.push("        type: object");
      lines.push("        properties:");
      lines.push(`          id:`);
      lines.push(`            type: string`);
      lines.push(`            description: ${yamlFlowScalar(`Primary key or identifier for ${m.name}`)}`);
      lines.push(`          filter:`);
      lines.push(`            type: object`);
      lines.push(`            description: Optional filter criteria`);
      lines.push("");
    }
  }

  // Resources
  lines.push("  resources:");
  lines.push("    - uri: project://context-map");
  lines.push("      name: Project Context Map");
  lines.push("      mime_type: application/json");
  lines.push("      description: Full project context including structure, detection, and architecture signals");
  lines.push("");
  lines.push("    - uri: project://repo-profile");
  lines.push("      name: Repository Profile");
  lines.push("      mime_type: application/yaml");
  lines.push("      description: Repository health, structure summary, and detection results");
  lines.push("");
  lines.push("    - uri: project://architecture-summary");
  lines.push("      name: Architecture Summary");
  lines.push("      mime_type: text/markdown");
  lines.push("      description: Human-readable architecture overview");
  lines.push("");

  const serverModels = ctx.domain_models;
  if (serverModels.length > 0) {
    const resNote2 = capNote(serverModels.length, 15, "domain-model resources");
    if (resNote2) lines.push(`    # ${resNote2}`);
    for (const m of serverModels.slice(0, 15)) {
      lines.push(`    - uri: ${yamlFlowScalar(`model://${m.name}`)}`);
      lines.push(`      name: ${yamlFlowScalar(m.name)}`);
      lines.push("      mime_type: application/json");
      lines.push(`      description: ${yamlFlowScalar(`${m.kind} with ${m.field_count} field${m.field_count === 1 ? "" : "s"} (${m.source_file})`)}`);
      lines.push("");
    }
  }

  // Prompts
  lines.push("  prompts:");
  lines.push("    - name: review_code");
  lines.push(`      description: ${yamlFlowScalar(`Review code following ${id.name} conventions`)}`);
  lines.push("      arguments:");
  lines.push("        - name: file_path");
  lines.push("          type: string");
  lines.push("          required: true");
  lines.push("");
  lines.push("    - name: debug_issue");
  lines.push("      description: Debug an issue using project-specific playbooks");
  lines.push("      arguments:");
  lines.push("        - name: error_message");
  lines.push("          type: string");
  lines.push("          required: true");
  lines.push("        - name: stack_trace");
  lines.push("          type: string");
  lines.push("");

  // Runtime config
  lines.push("  runtime:");
  lines.push(`    language: ${yamlFlowScalar(id.primary_language)}`);
  lines.push(`    entry: ${JSON.stringify(ctx.entry_points[0]?.path ?? "src/index.ts")}`);
  lines.push("    env:");
  lines.push("      - name: AXIS_PROJECT_ID");
  lines.push("        required: true");
  lines.push("      - name: AXIS_API_URL");
  lines.push("        default: \"http://localhost:4000\"");
  lines.push("");

  if (deps.length === 0) {
    lines.push("  dependencies: []");
  } else {
    lines.push("  dependencies:");
    const depNote = capNote(deps.length, 8, "dependencies");
    if (depNote) lines.push(`    # ${depNote}`);
    for (const d of deps.slice(0, 8)) {
      lines.push(`    - name: ${yamlFlowScalar(d.name)}`);
      lines.push(`      version: ${JSON.stringify(d.version)}`);
    }
  }
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const serverFiles = findFiles(files, ["**/server.*", "**/handler.*", "**/tool.*", "**/mcp*"]);
    if (serverFiles.length > 0) {
      lines.push("  # Detected Server/Tool Files");
      lines.push("  source_files:");
      for (const f of serverFiles.slice(0, 8)) {
        const exports = extractExports(f.content);
        lines.push(`    - path: ${JSON.stringify(f.path)}`);
        lines.push(`      exports: [${exports.slice(0, 5).map(e => JSON.stringify(e)).join(", ")}]`);
      }
      lines.push("");
    }
  }

  return {
    path: "server-manifest.yaml",
    content: lines.join("\n"),
    content_type: "text/yaml",
    program: "mcp",
    description: "MCP server manifest with tools, resources, prompts, and runtime configuration",
  };
}

// ─── mcp/fintech-mcp-surface-package.md ───────────────────────

function detectFintechDependencies(ctx: ContextMap): string[] {
  // Distinctive brand names + real package ids. `checkout-sdk`/`unit-finance`
  // catch the unscoped Checkout.com SDK (checkout-sdk-node) and Unit
  // (@unit-finance/*) without the bare "checkout"/"unit"/"treasury" substrings
  // that false-positived cart-checkouts, unit-test libs, and aws-treasury.
  const fintechDeps = ["stripe", "dwolla", "plaid", "adyen", "marqeta", "finicity", "modern-treasury", "moderntreasury", "checkout.com", "checkout-sdk", "unit-finance"];
  return ctx.dependency_graph.external_dependencies
    .map((dep) => dep.name)
    .filter((name) => fintechDeps.some((keyword) => name.toLowerCase().includes(keyword)));
}

function hasTrustFabric(files?: SourceFile[]): boolean {
  return (files ?? []).some((file) => file.path.toLowerCase().includes("trust-fabric"));
}

export function generateFintechMcpSurfacePackage(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const id = ctx.project_identity;
  const deps = detectFintechDependencies(ctx);
  const lines: string[] = [];

  lines.push(`# Fintech MCP Surface Package — ${mdText(id.name)}`);
  lines.push("");
  lines.push(`Generated: ${ctx.generated_at}`);
  lines.push("");
  lines.push("## Objective");
  lines.push("");
  lines.push("This package defines the initial MCP surface for an agent that does more than audit integrations: it hardens malformed or partially finished fintech repositories into regulator-aware, API-callable software for institutional deployment.");
  lines.push("");
  lines.push("## Why This Repo Qualifies");
  lines.push("");
  lines.push(`- Routes detected: ${displayRoutes(ctx.routes).length}`);
  lines.push(`- Domain models detected: ${ctx.domain_models.length}`);
  lines.push(`- SQL tables detected: ${ctx.sql_schema?.length ?? 0}`);
  lines.push(`- Trust Fabric detected: ${hasTrustFabric(files) ? "yes" : "no"}`);
  lines.push(`- Fintech dependency hints: ${deps.length > 0 ? mdText(deps.join(", ")) : "none directly detected"}`);
  lines.push("");
  lines.push("## Target Package Structure");
  lines.push("");
  lines.push("```text");
  lines.push("mcp/");
  lines.push("  server/");
  lines.push("    index.ts");
  lines.push("    transport/http.ts");
  lines.push("    auth/bearer.ts");
  lines.push("    tools/harden-partial-repo.ts");
  lines.push("    tools/generate-regulatory-controls.ts");
  lines.push("    tools/derive-domain-schema.ts");
  lines.push("    tools/build-api-surface.ts");
  lines.push("    tools/assemble-evidence-pack.ts");
  lines.push("    resources/compliance-controls.ts");
  lines.push("    resources/domain-models.ts");
  lines.push("    resources/ledger-invariants.ts");
  lines.push("    prompts/repair-fintech-repo.ts");
  lines.push("    prompts/ship-bank-grade-api.ts");
  lines.push("  contracts/");
  lines.push("    tool-schemas.ts");
  lines.push("    control-matrix.ts");
  lines.push("    evidence-package.ts");
  lines.push("```");
  lines.push("");
  lines.push("## Core Tool Contracts");
  lines.push("");
  lines.push("| Tool | Purpose | Output |");
  lines.push("|------|---------|--------|");
  lines.push("| `harden_partial_repo` | Normalize malformed project structure, fill missing layers, and reconcile partial implementations | patch plan + generated file set |");
  lines.push("| `derive_domain_schema` | Infer payment, ledger, mandate, dispute, and evidence entities from routes, models, and docs | typed domain schema |");
  lines.push("| `generate_regulatory_controls` | Create control matrix for KYC, AML, sanctions, PCI, auditability, and data retention | control bundle |");
  lines.push("| `build_api_surface` | Produce institution-facing API endpoints, handlers, validators, and contracts | callable API surface |");
  lines.push("| `assemble_evidence_pack` | Generate dispute/compliance evidence package definitions and audit output | evidence package manifest |");
  lines.push("| `validate_ledger_invariants` | Check debit/credit balance, settlement status, and event lineage rules | invariant report |");
  lines.push("");
  lines.push("## Compliance-Aware Resources");
  lines.push("");
  lines.push("This section defines the compliance-aware runtime contracts required for regulator-facing fintech operations.");
  lines.push("- `fintech://controls/matrix` — control definitions for onboarding, transaction monitoring, disputes, and evidence retention.");
  lines.push("- `fintech://schema/domain` — canonical domain schema for ledger accounts, transactions, mandates, settlements, and cases.");
  lines.push("- `fintech://audit/trail` — event lineage and immutable audit requirements.");
  lines.push("- `fintech://evidence/packages` — evidence package definitions for disputes, onboarding reviews, and regulator responses.");
  lines.push("");
  lines.push("## Prompt Surface");
  lines.push("");
  lines.push("- `repair_partial_fintech_repo` — map incomplete folders and replace gaps with compliant implementation scaffolding.");
  lines.push("- `implement_compliant_payment_api` — generate handlers, validators, and audit hooks for institution-facing payment endpoints.");
  lines.push("- `upgrade_third_party_connector` — wrap existing fintech vendors in bank-grade internal contracts rather than treating them as the system of record.");
  lines.push("");
  lines.push("## Compliance Domains To Encode In The Server");
  lines.push("");
  lines.push("1. Identity and onboarding controls: KYC, KYB, sanctions, beneficial ownership, missing-document recovery.");
  lines.push("2. Payment execution controls: auth, capture, returns, settlement states, webhook authenticity, idempotency.");
  lines.push("3. Ledger controls: double-entry integrity, reversal lineage, suspense handling, balance snapshots, reconciliation evidence.");
  lines.push("4. Mandate controls: AP2/PSD2-style mandate lifecycle, exemptions, recurring fixed payment provenance.");
  lines.push("5. Audit and evidence controls: immutable audit logs, case timelines, dispute artifacts, regulator-ready evidence packaging.");
  lines.push("");
  lines.push("## Server Skeleton");
  lines.push("");
  lines.push("```ts");
  lines.push("export function registerFintechTools(server: McpServer) {");
  lines.push("  server.tool(\"harden_partial_repo\", hardenPartialRepoSchema, hardenPartialRepo);");
  lines.push("  server.tool(\"derive_domain_schema\", deriveDomainSchemaSchema, deriveDomainSchema);");
  lines.push("  server.tool(\"generate_regulatory_controls\", controlSchema, generateRegulatoryControls);");
  lines.push("  server.tool(\"build_api_surface\", apiSurfaceSchema, buildApiSurface);");
  lines.push("  server.tool(\"assemble_evidence_pack\", evidenceSchema, assembleEvidencePack);");
  lines.push("  server.resource(\"fintech://schema/domain\", readFintechDomainSchema);");
  lines.push("  server.resource(\"fintech://controls/matrix\", readControlMatrix);");
  lines.push("}");
  lines.push("```");
  lines.push("");
  lines.push("## Buildout Phases");
  lines.push("");
  lines.push("1. Detect missing fintech layers and generate internal contracts before touching provider adapters.");
  lines.push("2. Establish domain schema and audit trail model as the source of truth.");
  lines.push("3. Generate compliant API endpoints and validation logic for institution-facing usage.");
  lines.push("4. Attach dispute/evidence generation, mandate controls, and reconciliation invariants.");
  lines.push("5. Only then map third-party fintech vendors behind internal abstractions.");
  lines.push("");

  if (files && files.length > 0) {
    const candidateFiles = findFiles(files, ["**/*trust-fabric*", "**/*ledger*", "**/*payment*", "**/*settlement*", "**/*mandate*"]);
    if (candidateFiles.length > 0) {
      lines.push(...renderExcerpts("Fintech Source Signals", candidateFiles.slice(0, 6), 20));
    }
  }

  return {
    path: "mcp/fintech-mcp-surface-package.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "mcp",
    description: "Initial fintech-focused MCP surface package with server structure, repair tools, and compliance-aware contracts",
  };
}

// ─── mcp/fintech-domain-schema.yaml ───────────────────────────

export function generateFintechDomainSchema(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const providers = detectFintechDependencies(ctx);
  const lines: string[] = [];

  lines.push("schema_version: \"1.0\"");
  lines.push(`generated_at: ${JSON.stringify(ctx.generated_at)}`);
  lines.push("domain: fintech_mcp_buildout");
  lines.push("project:");
  lines.push(`  name: ${JSON.stringify(ctx.project_identity.name)}`);
  lines.push(`  primary_language: ${JSON.stringify(ctx.project_identity.primary_language)}`);
  lines.push(`  trust_fabric_detected: ${hasTrustFabric(files)}`);
  lines.push(`  detected_provider_hints: [${providers.map((provider) => JSON.stringify(provider)).join(", ")}]`);
  lines.push("bounded_contexts:");
  lines.push("  - onboarding");
  lines.push("  - ledger");
  lines.push("  - payments");
  lines.push("  - settlements");
  lines.push("  - disputes");
  lines.push("  - compliance_evidence");
  lines.push("tables:");
  lines.push("  ledger_accounts:");
  lines.push("    primary_key: ledger_account_id");
  lines.push("    columns: [tenant_id, account_code, currency, balance_minor, status, opened_at, closed_at]");
  lines.push("    invariants: [double_entry_only, currency_locked, non_destructive_closure]");
  lines.push("  ledger_entries:");
  lines.push("    primary_key: ledger_entry_id");
  lines.push("    columns: [ledger_account_id, transaction_id, direction, amount_minor, event_time, reversal_of]");
  lines.push("    invariants: [balanced_by_transaction, immutable_after_posting]");
  lines.push("  payment_intents:");
  lines.push("    primary_key: payment_intent_id");
  lines.push("    columns: [customer_id, amount_minor, currency, payment_rail, status, idempotency_key, created_at]");
  lines.push("    invariants: [idempotent_create, amount_currency_required]");
  lines.push("  settlement_events:");
  lines.push("    primary_key: settlement_event_id");
  lines.push("    columns: [payment_intent_id, clearing_system, settlement_status, value_date, settled_amount_minor, reference]");
  lines.push("    invariants: [status_transition_controlled, event_lineage_preserved]");
  lines.push("  mandates:");
  lines.push("    primary_key: mandate_id");
  lines.push("    columns: [customer_id, mandate_type, status, authorized_at, sca_reference, exemption_reason, revoked_at]");
  lines.push("    invariants: [sca_before_active, revocation_terminal]");
  lines.push("  dispute_cases:");
  lines.push("    primary_key: dispute_case_id");
  lines.push("    columns: [payment_intent_id, network, reason_code, stage, opened_at, response_deadline_at]");
  lines.push("    invariants: [deadline_present, stage_machine_enforced]");
  lines.push("  dispute_evidence:");
  lines.push("    primary_key: evidence_id");
  lines.push("    columns: [dispute_case_id, evidence_type, collected_at, hash, source_uri, admissibility_status]");
  lines.push("    invariants: [tamper_evident_hash, linked_to_case]");
  lines.push("  audit_log:");
  lines.push("    primary_key: audit_event_id");
  lines.push("    columns: [actor_type, actor_id, action, entity_type, entity_id, occurred_at, trace_id, payload_hash]");
  lines.push("    invariants: [append_only, payload_hash_required, trace_id_required]");
  lines.push("  compliance_evidence_packages:");
  lines.push("    primary_key: package_id");
  lines.push("    columns: [package_type, subject_entity, created_at, jurisdiction, status, manifest_hash]");
  lines.push("    invariants: [manifest_hash_required, exportable_bundle]");
  lines.push("resources:");
  lines.push("  institution_api:");
  lines.push("    required_endpoints: [create_payment_intent, capture_payment, list_settlements, create_mandate, open_dispute_case, export_evidence_package]");
  lines.push("  compliance_controls:");
  lines.push("    required: [kyc_kyb, sanctions_screening, webhook_signature_validation, audit_trail, dispute_evidence_retention]");
  lines.push("  evidence_packaging:");
  lines.push("    package_types: [regulator_exam, dispute_representment, onboarding_review, reconciliation_exception]");
  lines.push("    required_artifacts: [timeline, source_hashes, operator_actions, linked_records]");
  lines.push("implementation_targets:");
  lines.push(`  route_count_hint: ${displayRoutes(ctx.routes).length}`);
  lines.push(`  domain_model_count_hint: ${ctx.domain_models.length}`);
  lines.push(`  sql_schema_count_hint: ${ctx.sql_schema?.length ?? 0}`);
  lines.push("  objective: Build institution-grade API-callable fintech software, not just provider wrappers");

  return {
    path: "mcp/fintech-domain-schema.yaml",
    content: lines.join("\n"),
    content_type: "text/yaml",
    program: "mcp",
    description: "Machine-readable fintech domain schema covering ledger, settlements, mandates, disputes, audit logs, and evidence packaging",
  };
}
