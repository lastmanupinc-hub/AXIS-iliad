# Protocol Specification — axis-iliad

Generated: 2026-05-22T20:41:26.763Z

## Purpose

Living specification for this MCP server protocol surface, covering transport, versioning, authentication, errors, and capability discovery.

## Versioning

- JSON-RPC: `2.0`
- MCP protocol target: `2025-03-26`
- Server implementation version: semantic versioning (`MAJOR.MINOR.PATCH`).
- Breaking changes require MAJOR increments and migration notes.
- Additive fields/capabilities should prefer MINOR increments.
- Backward-compatibility policy: additive-first; avoid breaking existing tool names and required fields.

## Transport

- Primary endpoint: `POST /mcp`
- Discovery endpoints: `GET /.well-known/mcp.json`, `GET /v1/mcp/server.json`
- Content-Type: `application/json`
- Request envelope: JSON-RPC request object
- Response envelope: JSON-RPC success or error object

## JSON-RPC 2.0 Message Formats

### Request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_programs",
    "arguments": {}
  }
}
```

### Success Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "..." }]
  }
}
```

### Error Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Invalid params"
  }
}
```

### Notification (no id)

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized",
  "params": {}
}
```

Notifications do not produce a response body.

### Batch Request

```json
[
  { "jsonrpc": "2.0", "id": 1, "method": "ping" },
  { "jsonrpc": "2.0", "id": 2, "method": "tools/list" },
  { "jsonrpc": "2.0", "method": "notifications/initialized", "params": {} }
]
```

Batch response must include one entry per request that has an `id`.

## Core Primitives

### Tools

Callable functions exposed by the server. Each tool MUST define an input schema so callers can validate arguments before execution.

Example:
```json
{
  "name": "analyze_repo",
  "description": "Analyze a GitHub repository",
  "inputSchema": {
    "type": "object",
    "required": ["github_url"],
    "properties": {
      "github_url": { "type": "string" }
    }
  }
}
```

## Type Definitions / Core Types

Canonical protocol types used across transports and handlers.

### JsonRpcRequest

```ts
type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};
```

### JsonRpcSuccess | JsonRpcError

```ts
type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
};

type JsonRpcError = {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
};
```

### InitializeRequest / InitializeResult

```ts
type InitializeRequest = JsonRpcRequest & {
  method: "initialize";
  params: {
    protocolVersion: string;
    capabilities: Record<string, unknown>;
    clientInfo?: { name: string; version: string };
  };
};

type InitializeResult = {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo: { name: string; version: string };
};
```

### ToolDefinition / ToolCall

```ts
type StandardSchemaV1 = {
  $schema: string;
  version?: string;
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

type ToolDefinition = {
  name: string;
  description?: string;
  inputSchema: StandardSchemaV1;
  outputSchema?: StandardSchemaV1;
};

type ToolCall = {
  name: string;
  arguments?: Record<string, unknown>;
};
```

### PaginationEnvelope

```ts
type PaginationEnvelope<T> = {
  items: T[];
  nextCursor?: string;
  totalCount?: number;
};
```

### CancelRequest / ProgressNotification

```ts
type CancelRequest = {
  method: "notifications/cancel";
  params: { requestId: string | number };
};

type ProgressNotification = {
  method: "notifications/progress";
  params: { requestId: string | number; progress: number; message?: string };
};
```

### Resources

Readable data endpoints identified by URIs. Resources are fetched (not executed) and return structured or text content.

Example:
```json
{
  "uri": "project://context-map",
  "name": "Context Map",
  "mimeType": "application/json"
}
```

### Prompts

Reusable templates that guide client behavior and can accept typed arguments.

Example:
```json
{
  "name": "code-review",
  "description": "Review code using project conventions",
  "arguments": [
    { "name": "file_path", "required": true }
  ]
}
```

## Authentication

- Primary: `Authorization: Bearer <api_key>`
- Alternate: `x-axis-key: <api_key>`
- Free tools may be called anonymously; paid tools require auth.

## Capability Discovery

- `tools/list` is the authoritative runtime capability listing.
- `mcp-registry-metadata.json` describes publishing metadata for registries.
- `capability-registry.json` exposes project-scoped generated capabilities.

## Extensibility (SEPs)

SEPs (Spec Extension Proposals) define forward-compatible protocol extensions.

- Each SEP should include: id, title, status, motivation, wire format changes, and compatibility impact.
- Capability negotiation should advertise supported SEP ids during handshake.
- Experimental extensions should be opt-in and safely ignorable by unaware clients.
- Accepted SEPs must include migration guidance and deprecation timelines.
- Rejected or superseded SEPs should remain documented for implementer traceability.

## Validation Schema Strategy

- Tool input/output contracts SHOULD use Standard Schema-compatible JSON Schema representations.
- Zod-authored schemas are acceptable when exported as JSON Schema-equivalent contracts for non-TypeScript clients.
- Every tool should define at least an `inputSchema`; `outputSchema` is strongly recommended for typed clients.
- Validation errors should map to JSON-RPC `-32602` (invalid params) with field-level details in `error.data`.
- Schema identifiers should be stable (`$id`) to support caching and cross-language code generation.

## Capabilities Advertisement (Handshake)

Clients SHOULD call `initialize` first. Server responses SHOULD advertise supported primitives and protocol compatibility.

Expected advertised capabilities:
- `tools` (callable operations)
- `resources` (readable context)
- `prompts` (reusable templates)

Server identity SHOULD include name and version for compatibility diagnostics.

## Session Model

- Session bootstraps at `initialize` and remains valid for subsequent calls.
- Session-scoped metadata MAY be returned via headers (for example, session id).
- Notifications (`notifications/initialized`) mark client readiness and have no response body.

## Transports

- `stdio`: local process transport for CLI/desktop integrations.
- `Streamable HTTP`: primary deployed transport at `POST /mcp`.
- `WebSockets`: optional bidirectional transport when low-latency push/event streams are required.

Transport behavior must preserve JSON-RPC 2.0 semantics regardless of channel.

## Error Model

- Parse and invalid request failures return JSON-RPC errors.
- Tool execution failures return tool-level errors with actionable messages.
- Authentication failures return explicit guidance: `Authorization: Bearer <api_key>`.

## Pagination

List-style operations SHOULD support bounded page sizes and continuation tokens or cursor offsets.
Pagination state SHOULD be stable for a consistent snapshot of the underlying data.

## Cancellation

Long-running operations SHOULD support cancellation via client abort or protocol-level cancel requests where applicable.
Servers SHOULD release resources quickly after cancellation.

## Progress Reporting

For long-running tasks, servers SHOULD emit progress notifications (percent, stage, or milestone markers).
Progress messages should be monotonic and end with a terminal success/failure outcome.

## Security Model

### OAuth

- OAuth 2.1 style flows are RECOMMENDED for third-party delegated access.
- Access tokens should be short-lived and scoped to least privilege.
- Refresh token issuance should be policy-controlled and revocable.
- Bearer tokens must be sent over TLS-only transports.

### Sandboxing

- Tool execution should run with explicit resource boundaries (CPU, memory, timeouts).
- Filesystem and network access should default-deny, then allowlist required targets.
- Execution environments should isolate tenant data and prevent cross-session data leakage.

### Consent

- High-impact tool calls should require explicit user consent prior to execution.
- Consent prompts should clearly state action, scope, and expected side effects.
- Consent decisions should be auditable and revocable.

## Idempotency and Determinism

- Read/list operations should be deterministic for the same inputs.
- Generation outputs are deterministic for the same snapshot and requested outputs.

## Security and Operational Notes

- Do not expose raw credentials in artifacts.
- Log request identifiers for traceability.
- Use least-privilege API keys for automation.

## Change Log Policy

- Update this document when transport/auth/error behavior changes.
- For breaking changes, bump version and provide migration notes.