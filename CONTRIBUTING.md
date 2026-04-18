# Contributing to Axis' Iliad

## Dev Setup

```bash
git clone https://github.com/lastmanupinc-hub/axis-iliad.git
cd axis-iliad
pnpm install

# Build all packages (order matters — packages before apps)
pnpm build

# Run tests
npx vitest run

# Run with coverage
npx vitest --coverage

# Run benchmarks
npx vitest bench

# Start API server
node apps/api/dist/server.js

# Start web UI (separate terminal)
cd apps/web && npx vite
```

## Project Structure

| Path | Purpose |
|------|---------|
| `packages/snapshots/` | Snapshot intake, SQLite store, billing, funnel types |
| `packages/repo-parser/` | Language/framework detection, import graph |
| `packages/context-engine/` | Context map and repo profile builders |
| `packages/generator-core/` | 97 generators across 18 programs |
| `apps/api/` | HTTP server (port 4000) |
| `apps/cli/` | CLI tool (`axis analyze`, `axis github`) |
| `apps/web/` | React SPA (Vite, port 5173) |

## Coding Standards

- **TypeScript strict mode** — no `any`, no implicit returns, no unused variables
- **Zero runtime dependencies** in the HTTP server — only `better-sqlite3` for persistence
- **No external test frameworks** beyond vitest
- **File naming**: `kebab-case.ts` for source, `kebab-case.test.ts` for tests
- **Imports**: use `.js` extensions in import paths (Node ESM resolution)
- **Error handling**: validate at system boundaries (request bodies, file I/O), not interior functions

## Test Conventions

- Test files live next to source: `engine.ts` → `engine.test.ts`
- Use `describe` blocks per function/module, `it` blocks per behavior
- Helper functions (e.g., `makeSnapshot()`, `makeFiles()`) at top of test file
- Shared vitest config in root `vitest.config.ts`
- Run all: `npx vitest run`
- Run one file: `npx vitest run packages/repo-parser/src/language-detector.test.ts`

## Adding a New Generator

1. Create `packages/generator-core/src/generators-<program>.ts`
2. Export generator functions: `export function generate<Name>(ctx: ContextMap): GeneratedFile`
3. Register in `generate.ts` REGISTRY with the output path as key
4. Add to `GENERATOR_PROGRAMS` map with the correct program name
5. Add tests in `generate.test.ts` or a program-specific test file
6. Add the output path to `PROGRAM_OUTPUTS` in `apps/api/src/handlers.ts`
7. Build and verify: `pnpm build && npx vitest run`

## Adding a New API Endpoint

1. Write handler in `apps/api/src/handlers.ts` or a dedicated module
2. Register route in `apps/api/src/server.ts` via `router.get/post(...)`
3. Add test case in `apps/api/src/api.test.ts`
4. Update README.md endpoint table

## PR Process

1. Create a feature branch from `main`
2. Make changes, ensure `pnpm build` and `npx vitest run` pass
3. Commit with descriptive message: `eq_NNN: <summary>`
4. Push and open PR against `main`

## Build Order

Packages must build before apps due to workspace dependencies:

```
packages/snapshots → packages/repo-parser → packages/context-engine → packages/generator-core → apps/*
```

Running `pnpm -r build` handles this automatically via workspace dependency resolution.
