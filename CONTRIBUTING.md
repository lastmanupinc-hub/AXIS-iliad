# Contributing to Axis' Iliad

## Dev Setup

**Ensure you meet the [System Requirements](#system-requirements) first.**

```bash
git clone https://github.com/lastmanupinc-hub/axis-iliad.git
cd axis-iliad
pnpm install

# Build all packages (order matters — packages before apps)
pnpm build

# Run tests (local, zero AI rate limit cost)
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
| `packages/snapshots/` | Snapshot intake, Postgres (Neon) store, billing, funnel types |
| `packages/repo-parser/` | Language/framework detection, import graph |
| `packages/context-engine/` | Context map and repo profile builders |
| `packages/generator-core/` | 142 generators across 20 programs |
| `apps/api/` | HTTP server (port 4000) |
| `apps/cli/` | CLI tool (`axis analyze`, `axis github`) |
| `apps/web/` | React SPA (Vite, port 5173) |

## Coding Standards

- **TypeScript strict mode** — no `any`, no implicit returns, no unused variables
- **Lean dependencies** in the HTTP server — persistence on Neon Postgres via `pg`
- **No external test frameworks** beyond vitest
- **File naming**: `kebab-case.ts` for source, `kebab-case.test.ts` for tests
- **Imports**: use `.js` extensions in import paths (Node ESM resolution)
- **Error handling**: validate at system boundaries (request bodies, file I/O), not interior functions

## System Requirements

### Minimum Requirements
- **Node.js**: ≥ 20.x (LTS recommended)
- **pnpm**: ≥ 9.x
- **OS**: macOS 11+, Linux (any modern distro), Windows 10+
- **RAM**: 4 GB minimum (8 GB recommended for full build + tests)
- **Disk space**: 2 GB for dependencies + build output
- **Package manager**: pnpm (workspace support required)

### For Development
- TypeScript 5.x (installed via dependencies)
- vitest (test runner, installed via dependencies)
- tsx (for TypeScript execution, installed via dependencies)

### For Docker
- Docker 20.10+ or Docker Desktop
- For ARM64 (M1/M2 Mac): native support, no additional setup needed

### Important Notes
- **Postgres required** — set `DATABASE_URL` to a Neon (or local) Postgres instance
- **No external services required for local development** — API runs standalone
- **AI rate limits**: Running tests locally (via `npx vitest run`) consumes **zero** AI rate limits. Tests run purely on your CPU using Python/Node.js. No API calls, no LLM usage, zero impact on Claude/Cursor token limits.

## Testing Strategy

### Test Levels by Stage

| Stage / Situation | Recommended Test Level | Frequency | Why |
|---|---|---|---|
| Small change (e.g., tweak one tool) | Smoke / relevant tests only | Every commit / after change | Fast feedback |
| Medium change (new feature or refactor) | Partial regression (core + affected area) | Before push / PR | Balance speed & safety |
| Major change or before merge | Full regression | Before major PRs / merges | Catch side effects |
| Before shipping / tagging a release | Full regression | Every release | High confidence |
| Nightly / CI integration | Full regression | Daily (automated) | Catch issues early |

### Running Tests

```bash
# Run all tests
npx vitest run

# Run with coverage (produces coverage report)
npx vitest --coverage

# Run in watch mode (great for active development)
npx vitest

# Run a specific file
npx vitest run packages/repo-parser/src/language-detector.test.ts

# Run tests matching a pattern
npx vitest run --grep "snapshot"

# Run benchmarks
npx vitest bench
```

### Test Conventions

- Test files live next to source: `engine.ts` → `engine.test.ts`
- Use `describe` blocks per function/module, `it` blocks per behavior
- Helper functions (e.g., `makeSnapshot()`, `makeFiles()`) at top of test file
- Shared vitest config in root `vitest.config.ts`

### Best Practices for Solo / Small-Team Development

1. **Run full regression before every significant commit or PR** — Don't skip this gate for shared work.
2. **Always run full regression before any release or schema changes** — Especially when you update tool registry or domain models.
3. **Automate in CI/CD** — Use GitHub Actions (or equivalent) to run full regression on every push to `main`. You don't have to do it manually every time once it's wired.
4. **Keep your test suite fast** — The current 58 passing tests are very manageable. Aim to keep full runs under 2 minutes.
5. **Don't run full suite after every tiny edit during active development** — That kills velocity. Use smoke tests / focused runs, then full regression before sharing.

### Cost of Testing

- **Local tests**: Zero cost. `npx vitest run` uses only your CPU. No AI rate limit consumption, no API calls, no external services.
- **CI tests**: Only cloud resource costs (GitHub Actions free tier covers most indie/small-team usage). No AI rate limits.
- **Scaling**: At 58 tests, you're well under the performance ceiling. Adding more tests scales linearly.

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
