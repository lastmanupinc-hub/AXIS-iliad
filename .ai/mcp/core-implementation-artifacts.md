# Core Implementation Artifacts — axis-iliad

Generated: 2026-05-22T21:39:10.649Z

## Purpose

Define the implementation contracts for core MCP packages so server, client, and framework adapters evolve safely.

## packages/server

- Own the `McpServer` class and lifecycle hooks.
- Register tools/resources/prompts with typed schemas.
- Provide transport adapters under `src/transports/*` (`stdio`, `http`, `websocket`).
- Keep business logic in service modules, not transport handlers.

## 7. Server Implementation (packages/server/src/index.ts or McpServer.ts)

- Export a stable `McpServer` entrypoint from `packages/server/src/index.ts`.
- Keep request validation, tool registration, and dispatch inside `McpServer.ts`.
- Wire transports via adapters and avoid transport-specific branches in core server logic.
- Surface typed registration APIs so downstream packages can add tools safely.
- Implement capability negotiation during `initialize` and clean teardown on `shutdown`.

```ts
// packages/server/src/index.ts
export { McpServer } from "./McpServer.js";
export type { ServerConfig, RegisteredTool } from "./types.js";
```

```ts
// packages/server/src/McpServer.ts
export class McpServer {
  initialize(clientCapabilities: unknown) {
    // Negotiate protocol version and feature flags from client/server capabilities.
  }
  tool(name: string, description: string, schema: unknown, handler: (input: unknown) => Promise<unknown>) {
    // Register typed tool metadata and handler in an internal registry.
  }
  resource(name: string, description: string, uriTemplate: string, handler: (params: unknown) => Promise<unknown>) {
    // Register a resource resolver that maps URI params to typed data.
  }
  prompt(name: string, description: string, schema: unknown, handler: (input: unknown) => Promise<string>) {
    // Register reusable prompt builders with validated input schemas.
  }
  shutdown() {
    // Flush pending work and release transport resources before exit.
  }
}
```

## 8. Transport Implementations

- Implement transport adapters in `packages/server/src/transports/*` and keep them protocol-focused.
- Standard adapters: `stdio`, `http`, and `websocket`.
- Each adapter should expose consistent lifecycle hooks (`start`, `stop`) and delegate request handling to `McpServer`.
- Keep auth, framing, and connection concerns inside adapters, not in tool/resource/prompt handlers.

```ts
// packages/server/src/transports/types.ts
export interface TransportAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

```text
packages/server/src/transports/
|- stdio.ts
|- http.ts
`- websocket.ts
```

### StdioServerTransport (most common for local use)

- Use `StdioServerTransport` for local IDE integrations and CLI-hosted MCP servers.
- Read framed JSON-RPC messages from `stdin` and write responses/events to `stdout`.
- Keep transport startup deterministic so local tooling can connect immediately.

```ts
// packages/server/src/transports/stdio.ts
export class StdioServerTransport implements TransportAdapter {
  async start(): Promise<void> {
    // Attach stdin/stdout handlers and forward parsed requests to McpServer.
  }
  async stop(): Promise<void> {
    // Remove listeners and flush any buffered outbound messages.
  }
}
```

### Streamable HTTP transport

- Use streamable HTTP when clients need request/response plus incremental server events over HTTP.
- Expose an endpoint that accepts JSON-RPC messages and streams chunked responses back to the client.
- Keep connection/session state in the transport layer and route protocol work to `McpServer`.

```ts
// packages/server/src/transports/http.ts
export class StreamableHttpServerTransport implements TransportAdapter {
  async start(): Promise<void> {
    // Start HTTP listener and bind streaming JSON-RPC handlers.
  }
  async stop(): Promise<void> {
    // Drain active streams and close open HTTP connections.
  }
}
```

### WebSocket support (extensible base)

- Implement a shared base transport for connection/session handling, then extend it for WebSocket specifics.
- Keep ping/pong, reconnect, and subscription fan-out in the WebSocket adapter layer.
- Route normalized JSON-RPC payloads through `McpServer` so tool/resource/prompt logic stays transport-agnostic.

```ts
// packages/server/src/transports/websocket.ts
abstract class BaseSocketTransport implements TransportAdapter {
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
}

export class WebSocketServerTransport extends BaseSocketTransport {
  async start(): Promise<void> {
    // Accept ws connections and forward framed messages to McpServer.
  }
  async stop(): Promise<void> {
    // Close live sockets and release heartbeat/subscription resources.
  }
}
```

## 9. Schema & Validation Layer

- Centralize tool/resource/prompt schemas under `packages/server/src/schema/*`.
- Validate inbound payloads before invoking handlers; return protocol-safe validation errors.
- Keep runtime validators and exported schema metadata aligned to prevent drift between server and clients.
- Reuse a shared validator interface so all registration paths (`tool`, `resource`, `prompt`) apply consistent rules.
- Prefer Standard Schema-compatible validators and `zod` schemas so client/server types stay aligned.

```ts
// packages/server/src/schema/types.ts
export interface SchemaValidator<TInput> {
  parse(input: unknown): TInput;
}

export interface RegisteredSchema {
  name: string;
  kind: "tool" | "resource" | "prompt";
  validator: SchemaValidator<unknown>;
}
```

```ts
// packages/server/src/McpServer.ts
private validateOrThrow<T>(validator: SchemaValidator<T>, input: unknown): T {
  return validator.parse(input);
}
```

```ts
// packages/server/src/schema/tool-schemas.ts
import { z } from "zod";

export const createTaskInputSchema = z.object({
  title: z.string().min(1),
  priority: z.enum(["low", "medium", "high"]),
});

export const createTaskOutputSchema = z.object({
  taskId: z.string(),
  accepted: z.boolean(),
});

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type CreateTaskOutput = z.infer<typeof createTaskOutputSchema>;
```

```ts
// packages/server/src/McpServer.ts
server.tool("tasks.create", "Create a task", createTaskInputSchema, async (input) => {
  const typedInput = createTaskInputSchema.parse(input);
  const result = { taskId: "task_123", accepted: true };
  return createTaskOutputSchema.parse(result);
});
```

### Runtime validation + TypeScript inference

- Validate all unknown payloads at runtime before business logic executes.
- Infer handler input/output types directly from schemas to remove duplicate type declarations.
- Keep parsing at the boundary and pass strongly typed values through internal services.

```ts
const runReportInputSchema = z.object({
  reportId: z.string().min(1),
  includeDrafts: z.boolean().default(false),
});

const runReportOutputSchema = z.object({
  status: z.enum(["queued", "running", "complete"]),
  runId: z.string(),
});

type RunReportInput = z.infer<typeof runReportInputSchema>;
type RunReportOutput = z.infer<typeof runReportOutputSchema>;

const handleRunReport = async (input: unknown): Promise<RunReportOutput> => {
  const typedInput: RunReportInput = runReportInputSchema.parse(input);
  const result = await reportService.run(typedInput);
  return runReportOutputSchema.parse(result);
};
```

## 10. Middleware & Runtime Helpers

- Keep framework glue code in `packages/middleware/src/*` so server and client packages stay runtime-agnostic.
- Provide thin helpers for Express, Hono, Node HTTP, and other popular runtimes (for example Fastify) that adapt request/response objects to MCP transports.
- Keep auth extraction, request context wiring, and error mapping in middleware helpers.
- Avoid business logic in runtime adapters; delegate to `McpServer` and shared service modules.

```ts
// packages/middleware/src/express/createMcpExpressHandler.ts
export function createMcpExpressHandler(server: McpServer) {
  return async function mcpExpressHandler(req: unknown, res: unknown) {
    // Adapt Express req/res into transport calls and send protocol-safe responses.
  };
}
```

```ts
// packages/middleware/src/hono/createMcpHonoHandler.ts
export function createMcpHonoHandler(server: McpServer) {
  return async function mcpHonoHandler(ctx: unknown) {
    // Map Hono context to MCP request/response semantics.
  };
}
```

```ts
// packages/middleware/src/node-http/createMcpNodeHandler.ts
import type { IncomingMessage, ServerResponse } from "node:http";

function wrapIncomingMessage(req: IncomingMessage, res: ServerResponse) {
  return {
    method: req.method ?? "GET",
    url: req.url ?? "/",
    headers: req.headers,
    res,
  };
}

export function createMcpNodeHandler(server: McpServer) {
  return async function mcpNodeHandler(req: IncomingMessage, res: ServerResponse) {
    const httpCtx = wrapIncomingMessage(req, res);
    // Normalize Node HTTP streams and delegate to the server transport boundary.
  };
}
```

## 11. Tests & Conformance Suite

- Build a protocol conformance suite that runs the same JSON-RPC vectors across `stdio`, streamable `http`, and `websocket` transports.
- Run conformance tests directly against the protocol spec so wire-level behavior stays interoperable across independent MCP clients/servers.
- Add spec-trace fixtures for initialize, capabilities negotiation, tool call envelopes, resource reads, prompt rendering, and shutdown sequencing.
- Verify interoperability by replaying canonical protocol transcripts and asserting identical outcomes across transport adapters.
- Standardize on Vitest (or equivalent) with colocated test files near implementation modules for faster navigation and ownership clarity.
- Follow colocated naming such as `tools/myTool.test.ts`, `transports/http.test.ts`, and `middleware/node-http.test.ts`.
- Add unit tests for tool calling that verify argument validation, handler dispatch, and response envelope correctness.
- Add message reconciliation tests that assert request/response IDs, ordering, and partial-event correlation remain consistent.
- Add error-case unit tests for invalid params, unknown methods, transport disconnects, and timeout propagation.
- Add contract tests for `initialize`, tool invocation, resource reads, prompt rendering, and `shutdown` semantics.
- Validate schema behavior for success and failure paths, including malformed envelopes and unsupported capabilities.
- Enforce deterministic responses: stable error codes, message shapes, and capability metadata across transports.
- Gate release on matrix CI (Node LTS versions + runtime adapters) with per-transport pass/fail reporting.

```text
packages/server/test/conformance/
|- json-rpc-vectors.test.ts
|- tool-calling.unit.test.ts
|- message-reconciliation.unit.test.ts
|- error-cases.unit.test.ts
|- lifecycle-contract.test.ts
|- tool-resource-prompt-contract.test.ts
`- transport-parity.test.ts
```

## 12. Documentation Files

- Maintain `protocol-spec.md` as the canonical wire contract for request/response envelopes, lifecycle events, and error codes.
- Keep `spec.types.ts` synchronized with runtime schemas so generated and handwritten clients share one source of truth.
- Add `docs/server.md` as the detailed implementation guide for building MCP servers, transport adapters, and tool/resource/prompt registration flows.
- Add `docs/client.md` as the usage guide for discovery, capability negotiation, transport configuration, and typed tool invocation from MCP clients.
- Add `docs/protocol.md` for low-level protocol details including framing, message envelopes, lifecycle sequencing, and transport invariants.
- Add `docs/capabilities.md` for advanced features such as sampling, elicitation, and capability-scoped behavior flags.
- Publish package-level READMEs (`packages/server`, `packages/client`, `packages/sdk`, `packages/middleware`) with quickstart, transport setup, and troubleshooting sections.
- Document versioning and compatibility policy for MCP protocol versions, transport support, and breaking changes.
- Include migration notes and change summaries for every release that alters tool/resource/prompt contracts.

```text
docs/mcp/
|- server.md
|- client.md
|- protocol.md
|- capabilities.md
|- protocol-spec.md
|- spec.types.ts
|- migration-notes.md
`- compatibility-matrix.md
```

## 13. Examples Folder

- Maintain an `examples/` folder with runnable reference projects for each supported transport (`stdio`, streamable `http`, `websocket`).
- Include runnable minimal servers such as an `echo` tool and a `filesystem` tool so integrators can verify setup in minutes.
- Provide real-world examples that show tool registration, resource serving, and client connections across common deployment patterns.
- Include server and client examples that demonstrate tool, resource, and prompt flows end-to-end with typed schemas.
- Keep examples minimal but production-realistic: auth wiring, error handling, lifecycle startup/shutdown, and logging.
- Ensure every example has README setup/run steps and a deterministic verification command for CI checks.
- Add matrix smoke tests to confirm examples stay compatible with current protocol and package versions.

```text
examples/
|- server-stdio/
|- server-http/
|- server-websocket/
|- server-echo-minimal/
|- server-filesystem-minimal/
|- realworld-tool-registration/
|- realworld-resource-serving/
|- realworld-client-connections/
|- client-basic/
`- tool-resource-prompt-e2e/
```

## 14. CI/CD & Release Artifacts

- Add CI pipelines that run lint, typecheck, unit tests, conformance tests, and example smoke tests on every pull request.
- Define `.github/workflows/` automation for lint, test, and build so every merge candidate passes the same deterministic quality gates.
- Add npm publish workflows that use OIDC trusted publishing (no long-lived npm tokens) with environment protections and provenance attestations.
- Use `.changeset/` with the Changesets tool for versioning so release notes, semver bumps, and package publish intent are captured in-repo.
- Include release hygiene artifacts: `LICENSE`, `.gitignore`, and publish configuration (`publishConfig` in package manifests or equivalent) before any public publish.
- Publish release artifacts for server/client/sdk/middleware packages with reproducible build metadata and checksums.
- Generate protocol compatibility reports that compare current outputs against the previous stable release.
- Enforce release gates for changelog completeness, migration notes, semantic version validation, and signed package provenance.
- Include rollback playbooks and post-release verification steps for transport health and tool/resource/prompt contract integrity.

```text
.github/workflows/
|- lint.yml
|- test.yml
|- build.yml
|- mcp-ci.yml
|- mcp-release.yml
`- npm-publish.yml
.changeset/
`- <change>.md
package.json (publishConfig)
LICENSE
.gitignore
artifacts/releases/
|- checksums.txt
|- compatibility-report.md
`- provenance.json
```

## 15. Registry & Discovery Support (Optional Early)

- Add early MCP registry metadata so clients can discover server identity, version, capabilities, and transport endpoints before deep integration.
- Provide a discovery endpoint and static manifest artifacts that advertise tools/resources/prompts with stable schema references.
- Keep discovery payloads deterministic and cache-friendly so IDEs and agents can bootstrap quickly.
- Include optional public/private registry publication guidance with auth boundaries and rollout strategy.
- Validate registry and discovery contracts in CI to prevent drift between runtime behavior and published manifests.

```text
mcp/
|- mcp-registry-metadata.json
|- server-manifest.yaml
|- capability-registry.json
`- connector-map.yaml
discovery/
|- .well-known/mcp.json
`- .well-known/agent.json
```

## packages/client

- Discovery: resolve capabilities, tool lists, and schema metadata.
- Invocation: execute tool calls with typed inputs and normalized outputs.
- Support retry, timeout, and auth strategies per transport.
- Expose a stable interface for app and SDK consumers.

## packages/sdk

- Re-export stable APIs from `packages/client` and `packages/server`.
- Provide a single integration surface for external developers.
- Avoid embedding transport-specific logic in the umbrella package.

## packages/middleware

- Optional adapters for `Express`, `Hono`, and Node `http` runtimes.
- Map framework request/response objects to core server/client contracts.
- Keep middleware thin and stateless; delegate protocol logic to server/client packages.

## Recommended Artifact Layout

```text
packages/
|- server/src/{McpServer.ts,tools/,transports/}
|- client/src/{discovery/,invocation/}
|- sdk/src/index.ts
`- middleware/src/{express/,hono/,node-http/}
```