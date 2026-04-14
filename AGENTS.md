# AXIS Toolbox — Agent Instructions

> Auto-loaded by GitHub Copilot, Cursor, Claude Code, and compatible AI tools.

## Project Identity

| Field | Value |
|-------|-------|
| Name | AXIS Toolbox |
| Version | 0.4.0 |
| Tagline | The operating system for AI-native development |
| Owner | Last Man Up Inc. |
| License | Private — All rights reserved |
| Runtime | Node.js >= 20, TypeScript 5.7 strict |
| Build | pnpm workspaces (monorepo) |
| Repos | lastmanupinc-hub/AXIS-Scalpel, lastmanupinc-hub/Toolbox |

## What This Project Is

AXIS Toolbox analyzes codebases and generates 87 structured artifacts across 18 specialized programs. Users upload a repo (ZIP, GitHub URL, CLI), the system detects languages/frameworks, builds a context graph, fires 87 generators, and produces governance files that make AI coding tools measurably more effective.

**It is NOT**: a code generator, a linter, a framework, or a SaaS dashboard. It is the meta-layer that produces structured context for AI agents.

## Architecture (7 Layers)

1. **YAML Governance** (12 files): Constitutional control — program specs, session gate, state ledger, self-audit, memory hygiene
2. **repo-parser** (`packages/repo-parser/`): Language detection (60+), framework detection (10+), import resolution
3. **context-engine** (`packages/context-engine/`): Context map builder, repo-profile builder, route extraction
4. **snapshots** (`packages/snapshots/`): SQLite (5 tables, WAL mode), intake, billing state, funnel tracking
5. **generator-core** (`packages/generator-core/`): Template engine + 87 generators across 18 program modules
6. **API** (`apps/api/`): Zero-dep HTTP router, 102 endpoints, API keys, rate limiting, Prometheus metrics
7. **Web** (`apps/web/`): React 19 + Vite 6 SPA, dark theme, upload + dashboard
8. **CLI** (`apps/cli/`): `axis analyze <dir>`, `axis github <url>`

## Critical Invariants (DO NOT VIOLATE)

1. **Canonical coherence > speed** — No shallow wins over integrated capability
2. **One vertical at a time** — Monolithic vertical saturation work style
3. **Evidence required for promotion** — Code reference + validation + export artifact
4. **Snapshot is single source** — All programs read snapshot context. No re-parsing.
5. **continuation.yaml is ground truth** — Read on session entry, update after every completed work
6. **Same input → byte-identical output** — Generators must be deterministic (6 determinism tests)
7. **Per-program billing** — Each program is a separate SKU
8. **Free gives diagnosis, paid gives execution**
9. **Select single highest-ROI per cycle** — One remedial action at a time
10. **MEMORY.yaml is constitutional** — Read on folder entry, update on exit

## Code Organization

```
apps/
├── api/           → Zero-dep HTTP server, 102 endpoints, port 4000
├── cli/           → Command-line tool (axis analyze, axis github)
└── web/           → React 19 + Vite 6 SPA, port 5173

packages/
├── snapshots/     → SQLite persistence, intake, billing
├── repo-parser/   → Language/framework detection, imports
├── context-engine/→ Context-map + repo-profile generation
└── generator-core/→ 87 generators across 18 programs
```

## Style Rules

- **Language**: TypeScript 5.7 strict mode everywhere
- **HTTP**: Custom zero-dep router — never add Express/Fastify
- **CSS**: Vanilla CSS (dark theme) — never add Tailwind
- **Database**: SQLite via better-sqlite3 (WAL mode)
- **Testing**: Vitest 4.1 — every new function gets a test
- **Determinism**: Same input must produce byte-identical output
- **Coverage**: Maintain >= 100% branch coverage, >= 99.99% statement coverage (3,906 tests, 131 files)
- **Naming**: `camelCase` for functions/variables, `PascalCase` for types/classes
- **Imports**: Explicit, no barrel files, no circular imports

## Banned Patterns

- `express`, `fastify`, `koa`, `hapi` — custom router only
- `tailwindcss`, `styled-components` — vanilla CSS only
- `prisma`, `drizzle`, `typeorm` — better-sqlite3 directly
- `axios`, `node-fetch` — stdlib `fetch` or `http`
- Stubs that return `[]` or `""` when data is available (see priority_weights)
- Generators that depend on runtime state (must be pure)
- YAML file edits without reading the full file first
- Parallel vertical work (one vertical at a time)
- Promotion without evidence

## Quick Start

```bash
# Install
pnpm install

# Run tests
npx vitest run

# Start API
cd apps/api && pnpm dev    # http://localhost:4000

# Start web
cd apps/web && pnpm dev    # http://localhost:5173

# CLI usage
axis analyze ./my-project
axis github https://github.com/user/repo
```

## Deployment

| Target | Platform | Config |
|--------|----------|--------|
| API | Render (Docker) | render.yaml — starter plan, Oregon, /data volume |
| Web | Cloudflare Pages | Static React build |
| CI | GitHub Actions | Node 20/22 matrix, coverage, Docker build |

## YAML Governance (Read Order)

1. `begin.yaml` — Session gate, optimization policy (read FIRST)
2. `continuation.yaml` — Live state ledger (read SECOND)
3. `axis_all_tools.yaml` — 18 program specs (canonical source of truth)
4. Other files as needed for specific tasks

## The 18 Programs

| Tier | Programs |
|------|----------|
| Free | Search (5 outputs), Skills (5), Debug (4) |
| Pro | Frontend (4), SEO (5), Optimization (4), Theme (5), Brand (5), Superpowers (5), Marketing (5), Notebook (5), Obsidian (5), MCP (4), Artifacts (5), Remotion (5), Canvas (5), Algorithmic (5), Agentic Purchasing (5) |
