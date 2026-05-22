# Testing, Documentation & Polish Artifacts — axis-iliad

Generated: 2026-05-22T17:16:19.421Z

## Phase Goal

Harden MCP packages for release quality through automated tests, operator documentation, and production polish checks.

## 1. Testing Artifacts

- Add unit tests for `McpServer` registration paths (`tool`, `resource`, `prompt`) and lifecycle (`initialize`, `shutdown`).
- Add transport integration tests for `stdio`, streamable `http`, and `websocket` adapters.
- Add schema-contract tests that assert runtime validation and typed inference stay aligned.
- Add negative-path tests for malformed JSON-RPC envelopes, auth failures, and capability mismatches.

```text
packages/
|- server/test/{mcp-server.test.ts,lifecycle.test.ts}
|- server/test/transports/{stdio.test.ts,http.test.ts,websocket.test.ts}
`- middleware/test/{express.test.ts,hono.test.ts,node-http.test.ts}
```

## 2. Documentation Artifacts

- Publish package-level READMEs with install, quickstart, and transport-specific setup guidance.
- Document compatibility matrix across runtimes (Node, Bun, Deno) and transport modes.
- Include failure-mode and troubleshooting sections for handshake, schema, and transport errors.
- Keep generated protocol docs and exported type contracts version-locked per release.

## 3. Polish Artifacts

- Enforce lint, typecheck, and test gates in CI before publish.
- Add release checklist entries for breaking-change review and migration notes.
- Validate examples compile/run for each supported transport and framework adapter.
- Ensure log output and error payloads are deterministic and safe for agent consumption.

## 4. Release Readiness Checklist

- [ ] Unit and integration tests pass across server/client/middleware packages
- [ ] Runtime validation and inferred TypeScript types verified against live examples
- [ ] README, API docs, and protocol spec updated for current release
- [ ] CI quality gates (lint/typecheck/test) required on main branch
- [ ] Transport adapters validated: stdio, streamable HTTP, websocket