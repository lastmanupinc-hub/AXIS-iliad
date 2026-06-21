# Project Setup Guide — axis-iliad

## Goal

Establish a reproducible local setup for developing and validating this MCP server.

## Environment Prerequisites

- Git
- Node.js 20+
- One runtime adapter (Node.js, Bun, or Deno)
- Preferred package manager: npm

## Bootstrap

```bash
git clone <repo-url>
cd axis-iliad
npm install
npm run build
```

## Local Verification

```bash
node apps/api/dist/server.js
curl http://localhost:4000/v1/health
curl http://localhost:4000/.well-known/mcp.json
```

## Recommended Workspace Structure

- `apps/api`: transport and JSON-RPC handling
- `packages/generator-core`: artifact generation contracts
- `mcp/`: protocol-facing assets (`README.md`, schemas, setup guides)

## Setup Checklist

- [ ] Dependencies installed
- [ ] Build completes without type errors
- [ ] MCP discovery endpoint responds
- [ ] `tools/list` returns expected tool inventory