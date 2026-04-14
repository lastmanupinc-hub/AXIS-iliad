# AXIS Toolbox

AI-native development operating system. Upload or point at any codebase — get 87 generated artifacts across 18 specialized programs: context maps, debug playbooks, governance files, design tokens, SEO analysis, brand systems, and more.

## Quickstart

```bash
# Prerequisites: Node.js ≥ 20, pnpm ≥ 9
pnpm install
pnpm build

# Start the API server (port 4000)
node apps/api/dist/server.js

# Start the web UI (port 5173)
cd apps/web && npx vite

# Or use the CLI directly
node apps/cli/dist/cli.js analyze .
node apps/cli/dist/cli.js github https://github.com/owner/repo
```

## Architecture

```
axis-toolbox/
├── apps/
│   ├── api/          → Zero-dependency HTTP server (port 4000, 102 endpoints)
│   ├── cli/          → CLI tool: axis analyze <dir> | axis github <url>
│   └── web/          → Vite + React 19 SPA (dark theme, toast, command palette)
├── packages/
│   ├── snapshots/    → Snapshot intake, SQLite persistence, billing, funnel
│   ├── repo-parser/  → Language detection (60+), framework detection (10), import graph
│   ├── context-engine/ → Context map builder, repo profile, route/architecture analysis
    └── generator-core/ → 87 generators across 18 programs
└── vitest.config.ts  → Shared test config
```

## Programs (18)

| Program | Outputs | Tier |
|---------|---------|------|
| **Search** | context-map.json, repo-profile.yaml, architecture-summary.md, dependency-hotspots.md | Free |
| **Skills** | AGENTS.md, CLAUDE.md, .cursorrules, workflow-pack.md, policy-pack.md | Free |
| **Debug** | debug-playbook.md, incident-template.md, tracing-rules.md, root-cause-checklist.md | Free |
| **Frontend** | frontend-rules.md, component-guidelines.md, layout-patterns.md, ui-audit.md | Pro |
| **SEO** | seo-rules.md, schema-recommendations.json, route-priority-map.md, content-audit.md, meta-tag-audit.json | Pro |
| **Optimization** | optimization-rules.md, prompt-diff-report.md, cost-estimate.json, token-budget-plan.md | Pro |
| **Theme** | design-tokens.json, theme.css, theme-guidelines.md, component-theme-map.json, dark-mode-tokens.json | Pro |
| **Brand** | brand-guidelines.md, voice-and-tone.md, content-constraints.md, messaging-system.yaml, channel-rulebook.md | Pro |
| **Superpowers** | superpower-pack.md, workflow-registry.json, test-generation-rules.md, refactor-checklist.md, automation-pipeline.yaml | Pro |
| **Marketing** | campaign-brief.md, funnel-map.md, sequence-pack.md, cro-playbook.md, ab-test-plan.md | Pro |
| **Notebook** | notebook-summary.md, source-map.json, study-brief.md, research-threads.md, citation-index.json | Pro |
| **Obsidian** | obsidian-skill-pack.md, vault-rules.md, graph-prompt-map.json, linking-policy.md, template-pack.md | Pro |
| **MCP** | mcp-config.json, connector-map.yaml, capability-registry.json, server-manifest.yaml | Pro |
| **Artifacts** | generated-component.tsx, dashboard-widget.tsx, embed-snippet.ts, artifact-spec.md, component-library.json | Pro |
| **Remotion** | remotion-script.ts, scene-plan.md, render-config.json, asset-checklist.md, storyboard.md | Pro |
| **Canvas** | canvas-spec.json, social-pack.md, poster-layouts.md, asset-guidelines.md, brand-board.md | Pro |
| **Algorithmic** | generative-sketch.ts, parameter-pack.json, collection-map.md, export-manifest.yaml, variation-matrix.json | Pro |
| **Agentic Purchasing** | agent-purchasing-playbook.md, product-schema.json, checkout-flow.md, negotiation-rules.md, commerce-registry.json | Pro |

## API Endpoints

### Core Pipeline
| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/snapshots` | Upload repo snapshot (multipart file upload) |
| POST | `/v1/github/analyze` | Analyze repo from GitHub URL |
| GET | `/v1/snapshots/:id` | Get snapshot metadata |
| GET | `/v1/projects/:project_id/snapshots` | List snapshots for project |
| POST | `/v1/search/export` | Run search program |
| POST | `/v1/skills/generate` | Run skills program |
| POST | `/v1/debug/analyze` | Run debug program |
| POST | `/v1/frontend/audit` | Run frontend program |
| POST | `/v1/seo/analyze` | Run SEO program |
| POST | `/v1/optimization/analyze` | Run optimization program |
| POST | `/v1/theme/generate` | Run theme program |
| POST | `/v1/brand/generate` | Run brand program |
| POST | `/v1/superpowers/generate` | Run superpowers program |
| POST | `/v1/marketing/generate` | Run marketing program |
| POST | `/v1/notebook/generate` | Run notebook program |
| POST | `/v1/obsidian/analyze` | Run obsidian program |
| POST | `/v1/mcp/provision` | Run MCP program |
| POST | `/v1/artifacts/generate` | Run artifacts program |
| POST | `/v1/remotion/generate` | Run remotion program |
| POST | `/v1/canvas/generate` | Run canvas program |
| POST | `/v1/algorithmic/generate` | Run algorithmic program |
| POST | `/v1/agentic-purchasing/generate` | Run agentic purchasing program |
| GET | `/v1/programs` | List all programs with generator counts |
| GET | `/v1/projects/:id/generated-files/:path` | Download individual generated file |
| GET | `/v1/projects/:id/export` | Download ZIP of generated files |

### Billing & Account
| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/accounts` | Create account |
| GET | `/v1/account` | Get account info |
| POST | `/v1/account/keys` | Create API key |
| GET | `/v1/account/keys` | List API keys |
| POST | `/v1/account/keys/:id/revoke` | Revoke API key |
| GET | `/v1/account/usage` | Get usage stats |
| GET | `/v1/account/quota` | Get quota info |
| POST | `/v1/account/tier` | Update billing tier |
| POST | `/v1/account/programs` | Update program entitlements |
| POST | `/v1/account/github-token` | Save encrypted GitHub token |
| GET | `/v1/account/github-token` | List GitHub tokens |
| DELETE | `/v1/account/github-token/:token_id` | Delete GitHub token |
| GET | `/v1/billing/history` | Billing tier change audit trail |
| GET | `/v1/billing/proration` | Proration preview for tier changes |

### Funnel & Plans
| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/plans` | Get plan catalog |
| POST | `/v1/account/seats` | Invite team member |
| GET | `/v1/account/seats` | List team seats |
| POST | `/v1/account/seats/:id/revoke` | Revoke seat |
| GET | `/v1/account/upgrade-prompts` | Get contextual upgrade prompts |
| GET | `/v1/account/funnel-status` | Get funnel stage |
| GET | `/v1/admin/funnel-metrics` | Aggregate funnel analytics |

### Search & Versions
| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/search/index` | Index snapshot content for FTS5 search |
| POST | `/v1/search/query` | Full-text search across indexed content |
| GET | `/v1/search/:id/stats` | Search index statistics |
| GET | `/v1/snapshots/:id/versions` | List generation versions |
| GET | `/v1/snapshots/:id/versions/:num` | Get specific version with files |
| GET | `/v1/snapshots/:id/diff?old=N&new=M` | Diff between two versions |

### Webhooks
| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/account/webhooks` | Create webhook |
| GET | `/v1/account/webhooks` | List webhooks |
| DELETE | `/v1/account/webhooks/:id` | Delete webhook |
| POST | `/v1/account/webhooks/:id/toggle` | Toggle webhook active/disabled |
| GET | `/v1/account/webhooks/:id/deliveries` | List delivery attempts |

### Infrastructure
| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/health` | Health check |
| GET | `/v1/health/live` | Liveness probe |
| GET | `/v1/health/ready` | Readiness probe (DB connectivity) |
| GET | `/v1/metrics` | Prometheus-style metrics |
| GET | `/v1/db/stats` | Database statistics |
| POST | `/v1/db/maintenance` | Database maintenance (vacuum, WAL checkpoint) |
| GET | `/v1/docs` | OpenAPI 3.1 specification |
| GET | `/v1/admin/stats` | System-wide statistics |
| GET | `/v1/admin/accounts` | Admin: list all accounts |
| GET | `/v1/admin/activity` | Admin: recent activity feed |

## Input Methods

1. **File Upload** — POST `/v1/snapshots` with multipart body
2. **GitHub URL** — POST `/v1/github/analyze` with `{ "url": "https://github.com/..." }`
3. **CLI (local)** — `axis analyze <directory>` scans local files
4. **CLI (remote)** — `axis github <url>` fetches from GitHub

## Tech Stack

- **Runtime**: Node.js 20+, TypeScript 5.7 strict
- **Backend**: Zero-dependency custom HTTP router, SQLite (better-sqlite3, WAL mode)
- **Frontend**: Vite 6 + React 19, CSS design system (dark theme)
- **Testing**: Vitest 4, 1485 tests across 68 files, 91.5% statement coverage
- **Benchmarks**: Vitest bench — parseRepo 200 files in 21ms, FTS5 search <0.2ms
- **Build**: pnpm workspaces, tsc per package
- **CI**: GitHub Actions (Node 20/22 matrix, coverage, dep audit, Docker build)

## Development

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages + apps
pnpm test             # Run all tests
npx vitest run        # Run tests directly
npx vitest bench      # Run performance benchmarks
npx vitest --coverage # Run tests with coverage report
```

## License

Private. All rights reserved.