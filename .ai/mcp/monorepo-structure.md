# Monorepo Structure Template — axis-iliad

Generated: 2026-05-22T18:24:23.999Z

## Recommended Folder Layout

```text
.
|- apps/
|  |- api/
|  |  |- src/
|  |  |- test/
|  |  `- package.json
|  `- web/
|     |- src/
|     |- public/
|     `- package.json
|- packages/
|  |- client/
|  |  |- src/
|  |  |  |- discovery/
|  |  |  `- invocation/
|  |  `- package.json
|  |- sdk/
|  |  |- src/
|  |  |  `- index.ts
|  |  `- package.json
|  |- middleware/
|  |  |- src/
|  |  |  |- express/
|  |  |  |- hono/
|  |  |  `- node-http/
|  |  `- package.json
|  |- server/
|  |  |- src/
|  |  |  |- McpServer.ts
|  |  |  |- tools/
|  |  |  `- transports/
|  |  `- package.json
|  |- context-engine/
|  |- generator-core/
|  |- repo-parser/
|  `- snapshots/
|- mcp/
|  |- schemas/
|  `- templates/
|- scripts/
|- tsconfig.base.json
|- pnpm-workspace.yaml
`- package.json
```

## Folder Roles

- `apps/`: deployable services and frontends.
- `packages/`: shared libraries and buildable modules.
- `packages/client/`: MCP client SDK for discovery and tool invocation.
- `packages/sdk/`: umbrella SDK package that re-exports client and server public APIs.
- `packages/middleware/`: optional framework adapters for HTTP runtimes.
- `packages/server/`: MCP server implementation package.
- `mcp/`: MCP-specific specs, schema contracts, and integration templates.
- `scripts/`: repository automation tasks for CI/CD and local workflows.

## packages/middleware Responsibilities

- Express helpers: request auth, error mapping, and MCP route wiring.
- Hono helpers: context adapters and typed handler wrappers.
- Node HTTP helpers: bare-metal request/response adapters.
- Keep middleware optional and thin; core protocol logic stays in server/client packages.

## packages/sdk Responsibilities

- Re-export stable APIs from `packages/client` and `packages/server`.
- Provide a single import surface for external integrators.
- Keep only composition and export wiring here  -  no transport-specific logic.

## packages/client Responsibilities

- Discovery: resolve server manifests, capabilities, and tool schemas.
- Invocation: call tools with typed arguments and normalize responses.
- Transport clients: support `http`, `stdio`, or `websocket` connectors.
- Keep client retry/auth logic isolated from product UI code.

## packages/server Responsibilities

- `McpServer` class: central server lifecycle, capability declaration, and request dispatch.
- Tool registration: define and register tools in `src/tools/*` with typed schemas.
- Transports: implement `stdio`, `http`, or `websocket` adapters in `src/transports/*`.
- Keep transport concerns separate from tool logic and business handlers.

## Naming and Boundaries

- Keep package names scoped (`@org/name`) and mirror folder names.
- Avoid cross-app imports; share through `packages/*` only.
- Keep runtime code in `src/`, generated output in `dist/`.
- Co-locate tests in `test/` or as `*.test.ts` under `src/`.

## Monorepo Bootstrap Checklist

- Create root `package.json` with workspace and pipeline scripts.
- Create root and per-package `tsconfig` files with strict ESM settings.
- Configure workspace manager (`pnpm-workspace.yaml` or equivalent).
- Add CI checks for build, test, lint, and typecheck across all packages.