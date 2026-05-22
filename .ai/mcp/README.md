# axis-iliad MCP Server

## Project Overview

axis-iliad exposes a Model Context Protocol (MCP) server for repository analysis, generation workflows, and agentic automation.

This package README documents the MCP surface area, local setup, runtime compatibility, and contribution process.

## Installation

### Prerequisites

- Git
- A supported runtime (Node.js, Bun, or Deno)
- Package manager: npm

### Install Dependencies

```bash
npm install
npm run build
```

## Quickstart

### 1) Start the API server

```bash
node apps/api/dist/server.js
```

### 2) Verify MCP endpoint

```bash
curl http://localhost:4000/.well-known/mcp.json
```

### 3) Call MCP initialize

```bash
curl -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{}}}'
```

### 4) List available tools

```bash
curl -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

## Supported Runtimes

- Node.js: primary and production-supported runtime.
- Bun: supported for local development and script execution where Node compatibility is sufficient.
- Deno: supported via HTTP interface consumption and generated TypeScript contracts.

Cross-runtime interoperability is enabled through JSON-RPC and Standard Schema-compatible contracts in `spec.types.ts` and `protocol-spec.md`.

## Contribution Guidelines

1. Read the repository `CONTRIBUTING.md` before opening a pull request.
2. Keep protocol changes additive-first and update `protocol-spec.md` when behavior changes.
3. Keep type contracts synchronized in `spec.types.ts` for new methods, params, and responses.
4. Run tests before pushing:

```bash
npx vitest run
```

5. Include migration notes for any breaking protocol change.

## Implementation Notes

- Primary language: TypeScript
- Package manager(s): unknown
- Detected frameworks: React