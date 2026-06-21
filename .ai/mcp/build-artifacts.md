# Build Artifacts Guide — axis-iliad

## Purpose

Describe required build outputs and verification gates for MCP publishing and deployment.

## Core Build Outputs

- `apps/api/dist/**`: compiled API server output
- `mcp/README.md`: package-level setup and integration entrypoint
- `protocol-spec.md`: canonical protocol behavior document
- `spec.types.ts`: TypeScript contracts for protocol messages
- `mcp/schemas/output-contract.schema.json`: machine-readable output contract

## Build Commands

```bash
pnpm build
npx vitest run
```

## Artifact Integrity Checks

- Confirm generated MCP outputs are present in program registry.
- Confirm output counts are synchronized in API, tests, and docs.
- Confirm schema enum list matches available MCP files.
- Confirm protocol and type documents are updated when message formats change.

## CI/CD Packaging Notes

- Publish generated artifacts alongside server build outputs.
- Keep deterministic generation enabled to avoid drift between runs.
- Fail CI on missing or stale MCP artifacts.