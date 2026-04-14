# Optimization Rules — axis-toolbox

> Prompt and context efficiency guidelines for a monorepo (TypeScript)

## Context Window Budget

| Metric | Value |
|--------|-------|
| Total files | 500 |
| Total LOC | 114,670 |
| Average LOC / file | 229 |
| Estimated token count | ~516,015 |

**Warning:** This project exceeds most context windows. Use selective context loading.

## High-Value Files

Include these files first when constructing prompts — they carry the most architectural signal:

### Dependency Hotspots

| File | Inbound | Outbound | Risk |
|------|---------|----------|------|
| `apps/web/src/App.tsx` | 1 | 17 | 0.9 |
| `apps/web/src/api.ts` | 16 | 0 | 0.8 |
| `apps/web/src/pages/DashboardPage.tsx` | 1 | 9 | 0.5 |
| `apps/web/src/components/Toast.tsx` | 3 | 0 | 0.1 |
| `apps/web/src/components/AxisIcons.tsx` | 3 | 0 | 0.1 |
| `apps/web/src/upload-utils.ts` | 3 | 0 | 0.1 |

## Low-Value Files (Exclude from Prompts)

These file types add noise without architectural value:

- *.lock, *.lockb (dependency lockfiles)
- *.min.js, *.min.css (minified bundles)
- *.map (source maps)
- dist/, build/, .next/, out/ (build artifacts)
- node_modules/ (dependencies)
- .git/ (version control)
- *.svg, *.png, *.jpg (binary assets)
- coverage/ (test coverage reports)

## Prompt Strategy

### React Projects

1. Include component files and their direct imports (1 hop)
2. Include shared type definitions and utility modules
3. Include CSS/styling config (tailwind.config, theme files) for style-aware generation

## Conventions to Embed in Prompts

Include these as system-level constraints when generating code:

- TypeScript strict mode
- pnpm workspaces

## Architecture Patterns

Reference these patterns in prompts for architectural consistency:

- monorepo
- containerized

## Configuration Files (Include in Prompts)

### `apps/api/package.json`

```json
{
  "name": "@axis/api",
  "version": "0.4.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "node --test dist/**/*.test.js"
  },
  "dependencies": {
    "@axis/context-engine": "workspace:*",
    "@axis/generator-core": "workspace:*",
    "@axis/repo-parser": "workspace:*",
    "@axis/snapshots": "workspace:*",
    "mppx": "^0.5.12"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
... (6 more lines)
```

### `apps/api/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}

```

### `apps/cli/package.json`

```json
{
  "name": "@axis/cli",
  "version": "0.4.0",
  "private": true,
  "type": "module",
  "bin": {
    "axis": "./bin/axis.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/cli.js"
  },
  "dependencies": {
    "@axis/snapshots": "workspace:*",
    "@axis/repo-parser": "workspace:*",
    "@axis/context-engine": "workspace:*",
    "@axis/generator-core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
... (3 more lines)
```

### `apps/cli/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}

```

## File Tree

```
.github/workflows/ci.yml (4.4 KB)
.gitignore (0.2 KB)
ab-test-plan.md (2.8 KB)
agent-purchasing-playbook.md (16.9 KB)
AGENTS.md (14.2 KB)
algorithmic-pack.json (7.9 KB)
algorithmic/begin.yaml (1.8 KB)
algorithmic/continuation.yaml (2.4 KB)
algorithmic/MEMORY.yaml (2.9 KB)
algorithmic/schemas/output-contract.schema.json (1.8 KB)
apps/api/mcp-server.json (8.1 KB)
apps/api/package.json (0.6 KB)
apps/api/src/admin.test.ts (10.0 KB)
apps/api/src/admin.ts (2.8 KB)
apps/api/src/agent-discovery.test.ts (18.6 KB)
apps/api/src/analyze.test.ts (16.2 KB)
apps/api/src/api-branches.test.ts (22.0 KB)
apps/api/src/api-layer5.test.ts (10.6 KB)
apps/api/src/api.test.ts (20.7 KB)
apps/api/src/b-grade-upgrade.test.ts (8.6 KB)
apps/api/src/billing-flow.test.ts (24.6 KB)
apps/api/src/billing.ts (21.2 KB)
apps/api/src/budget-probe.test.ts (33.2 KB)
apps/api/src/checkout-email.test.ts (11.7 KB)
apps/api/src/crash-resilience.test.ts (6.3 KB)
apps/api/src/credits-api.test.ts (10.9 KB)
apps/api/src/db-endpoints.test.ts (4.1 KB)
apps/api/src/deletion.test.ts (5.6 KB)
apps/api/src/deployment.test.ts (6.9 KB)
apps/api/src/e2e-flows.test.ts (22.5 KB)
apps/api/src/env.test.ts (8.3 KB)
apps/api/src/env.ts (5.7 KB)
apps/api/src/export-edge-cases.test.ts (9.9 KB)
apps/api/src/export.test.ts (13.4 KB)
apps/api/src/export.ts (6.7 KB)
apps/api/src/funnel-api.test.ts (28.0 KB)
apps/api/src/funnel.ts (8.9 KB)
apps/api/src/github.test.ts (6.0 KB)
apps/api/src/github.ts (0.2 KB)
apps/api/src/handler-edge-cases.test.ts (11.8 KB)
apps/api/src/handler-validation.test.ts (11.4 KB)
apps/api/src/handlers-deep.test.ts (18.7 KB)
apps/api/src/handlers.ts (121.8 KB)
apps/api/src/latency-histogram.test.ts (9.1 KB)
apps/api/src/logger.test.ts (3.5 KB)
apps/api/src/logger.ts (2.9 KB)
apps/api/src/logging.test.ts (8.5 KB)
apps/api/src/mcp-server.test.ts (56.7 KB)
apps/api/src/mcp-server.ts (88.1 KB)
apps/api/src/metrics-branches.test.ts (2.5 KB)
apps/api/src/metrics.test.ts (4.3 KB)
apps/api/src/metrics.ts (6.4 KB)
apps/api/src/mpp.test.ts (8.5 KB)
apps/api/src/mpp.ts (13.5 KB)
apps/api/src/multi-tenancy.test.ts (20.0 KB)
apps/api/src/oauth.test.ts (8.0 KB)
apps/api/src/oauth.ts (3.4 KB)
apps/api/src/openapi.test.ts (15.0 KB)
apps/api/src/openapi.ts (59.1 KB)
apps/api/src/prepare-purchasing.test.ts (19.1 KB)
apps/api/src/production-startup.test.ts (8.5 KB)
apps/api/src/programs-billing.test.ts (12.8 KB)
apps/api/src/quota.test.ts (4.5 KB)
apps/api/src/rate-limiter.test.ts (13.8 KB)
apps/api/src/rate-limiter.ts (6.5 KB)
apps/api/src/request-limits.test.ts (3.9 KB)
apps/api/src/router-branches.test.ts (12.5 KB)
apps/api/src/router.test.ts (15.0 KB)
apps/api/src/router.ts (13.5 KB)
apps/api/src/search-api.test.ts (13.8 KB)
apps/api/src/security.test.ts (7.1 KB)
apps/api/src/server-lifecycle.test.ts (7.0 KB)
apps/api/src/server-routes.test.ts (5.2 KB)
apps/api/src/server.ts (11.8 KB)
apps/api/src/snapshot-auth.test.ts (12.4 KB)
apps/api/src/stripe-branches.test.ts (38.6 KB)
apps/api/src/stripe.test.ts (10.1 KB)
apps/api/src/stripe.ts (15.8 KB)
apps/api/src/validation.test.ts (8.1 KB)
apps/api/src/versions.test.ts (8.1 KB)
apps/api/src/versions.ts (2.5 KB)
apps/api/src/webhook-branches.test.ts (16.3 KB)
apps/api/src/webhooks.test.ts (13.6 KB)
apps/api/src/webhooks.ts (5.4 KB)
apps/api/tsconfig.json (0.2 KB)
apps/cli/package.json (0.5 KB)
apps/cli/src/cli-auth.test.ts (7.6 KB)
apps/cli/src/cli-commands.test.ts (8.7 KB)
apps/cli/src/cli-edge-cases.test.ts (14.4 KB)
apps/cli/src/cli-pipeline.test.ts (9.3 KB)
apps/cli/src/cli.test.ts (13.9 KB)
apps/cli/src/cli.ts (9.7 KB)
apps/cli/src/credential-store.test.ts (8.2 KB)
apps/cli/src/credential-store.ts (3.2 KB)
apps/cli/src/determinism.test.ts (5.0 KB)
apps/cli/src/runner.test.ts (6.5 KB)
apps/cli/src/runner.ts (11.2 KB)
apps/cli/src/scanner.ts (4.3 KB)
apps/cli/src/writer.ts (0.9 KB)
apps/cli/tsconfig.json (0.4 KB)
apps/web/index.html (6.9 KB)
apps/web/package.json (0.5 KB)
apps/web/public/robots.txt (0.8 KB)
apps/web/src/api.test.ts (23.7 KB)
apps/web/src/api.ts (16.1 KB)
apps/web/src/App.tsx (16.1 KB)
apps/web/src/components/AxisIcons.tsx (8.9 KB)
apps/web/src/components/CommandPalette.tsx (6.6 KB)
apps/web/src/components/FilesTab.tsx (4.7 KB)
apps/web/src/components/GeneratedTab.tsx (4.1 KB)
apps/web/src/components/GraphTab.tsx (4.8 KB)
apps/web/src/components/OverviewTab.tsx (8.8 KB)
apps/web/src/components/ProgramLauncher.tsx (7.2 KB)
apps/web/src/components/SearchTab.tsx (11.1 KB)
apps/web/src/components/SignUpModal.tsx (3.9 KB)
apps/web/src/components/StatusBar.tsx (2.3 KB)
apps/web/src/components/Toast.tsx (3.8 KB)
apps/web/src/index.css (18.5 KB)
apps/web/src/main.tsx (0.2 KB)
apps/web/src/pages/AccountPage.tsx (23.8 KB)
apps/web/src/pages/DashboardPage.tsx (7.5 KB)
apps/web/src/pages/DocsPage.tsx (71.2 KB)
apps/web/src/pages/ExamplesPage.tsx (24.1 KB)
apps/web/src/pages/ForAgentsPage.tsx (49.8 KB)
apps/web/src/pages/HelpPage.tsx (41.9 KB)
apps/web/src/pages/InstallPage.tsx (8.4 KB)
apps/web/src/pages/PlansPage.tsx (9.3 KB)
apps/web/src/pages/ProgramsPage.tsx (13.9 KB)
apps/web/src/pages/QAPage.tsx (23.7 KB)
apps/web/src/pages/TermsPage.tsx (19.4 KB)
apps/web/src/pages/UploadPage.tsx (23.6 KB)
apps/web/src/upload-utils-zip.test.ts (9.0 KB)
apps/web/src/upload-utils.test.ts (5.7 KB)
apps/web/src/upload-utils.ts (4.1 KB)
apps/web/src/vite-env.d.ts (0.2 KB)
apps/web/tsconfig.json (0.5 KB)
apps/web/vite.config.ts (0.2 KB)
architecture-summary.md (69.0 KB)
artifact-spec.md (7.4 KB)
artifacts/begin.yaml (1.8 KB)
artifacts/continuation.yaml (2.4 KB)
artifacts/MEMORY.yaml (3.1 KB)
artifacts/schemas/output-contract.schema.json (1.8 KB)
asset-checklist.md (1.3 KB)
asset-guidelines.md (1.7 KB)
automated remedial action.yaml (7.5 KB)
automation-pipeline.yaml (3.1 KB)
axis_all_tools.yaml (22.6 KB)
AXIS_Board_Pitch.md (30.7 KB)
AXIS_DEMO_REPORT.md (12.3 KB)
axis_master_blueprint.yaml (9.6 KB)
begin.yaml (12.9 KB)
brand-board.md (5.0 KB)
brand-guidelines.md (3.3 KB)
brand/begin.yaml (1.8 KB)
brand/continuation.yaml (2.4 KB)
brand/MEMORY.yaml (3.0 KB)
brand/schemas/output-contract.schema.json (1.8 KB)
campaign-brief.md (2.5 KB)
canvas-pack.md (9.7 KB)
canvas-spec.json (4.2 KB)
canvas/begin.yaml (1.8 KB)
canvas/continuation.yaml (2.4 KB)
canvas/MEMORY.yaml (2.8 KB)
canvas/schemas/output-contract.schema.json (1.8 KB)
capability_inventory.yaml (31.7 KB)
capability-registry.json (2.5 KB)
CHANGELOG.md (6.6 KB)
channel-rulebook.md (3.6 KB)
checkout-flow.md (10.5 KB)
citation-index.json (6.1 KB)
CLAUDE.md (9.9 KB)
cloudflare-pages.md (1.5 KB)
collection-map.md (2.4 KB)
commerce-registry.json (6.3 KB)
component-guidelines.md (3.3 KB)
component-library.json (7.9 KB)
component-theme-map.json (9.2 KB)
connector-map.yaml (6.7 KB)
content-audit.md (3.8 KB)
content-constraints.md (2.9 KB)
CONTRIBUTING.md (3.1 KB)
cost-estimate.json (6.0 KB)
cov3.txt (19.3 KB)
cov5.txt (218.4 KB)
cro-playbook.md (33.1 KB)
dark-mode-tokens.json (3.3 KB)
dashboard-widget.tsx (3.3 KB)
debug/begin.yaml (3.6 KB)
debug/continuation.yaml (2.4 KB)
debug/MEMORY.yaml (5.5 KB)
debug/schemas/output-contract.schema.json (1.8 KB)
dependency-hotspots.md (7.9 KB)
docker-compose.yml (2.0 KB)
Dockerfile (4.1 KB)
e2e_round2.mjs (15.1 KB)
e2e_ui_audit.yaml (39.3 KB)
embed-snippet.ts (2.2 KB)
examples/01-paid-platform/generated/AGENTS.md (1.9 KB)
examples/01-paid-platform/generated/CLAUDE.md (0.9 KB)
examples/01-paid-platform/README.md (0.9 KB)
examples/02-axis-scalpel/generated/AGENTS.md (1.4 KB)
examples/02-axis-scalpel/generated/CLAUDE.md (0.8 KB)
examples/02-axis-scalpel/README.md (0.7 KB)
examples/03-spacey/generated/AGENTS.md (1.4 KB)
examples/03-spacey/generated/CLAUDE.md (0.8 KB)
examples/03-spacey/README.md (0.7 KB)
examples/04-slate-certification/generated/AGENTS.md (1.7 KB)
examples/04-slate-certification/generated/CLAUDE.md (0.7 KB)
examples/04-slate-certification/README.md (0.7 KB)
examples/05-ruuuun/generated/AGENTS.md (1.8 KB)
examples/05-ruuuun/generated/CLAUDE.md (0.8 KB)
examples/05-ruuuun/README.md (0.8 KB)
examples/README.json (5.6 KB)
examples/README.md (3.9 KB)
export-manifest.yaml (2.2 KB)
frontend/begin.yaml (3.6 KB)
frontend/continuation.yaml (2.4 KB)
frontend/MEMORY.yaml (5.8 KB)
frontend/schemas/output-contract.schema.json (1.8 KB)
funnel-map.md (2.9 KB)
generated-component.tsx (1.6 KB)
generative-sketch.js (8.3 KB)
generative-sketch.ts (4.1 KB)
graph-prompt-map.json (44.7 KB)
human user audt.yaml (24.9 KB)
hygiene and memory.yaml (8.7 KB)
incident-template.md (19.2 KB)
layout-patterns.md (2.5 KB)
linking-policy.md (3.6 KB)
marketing-pack.md (9.7 KB)
marketing/begin.yaml (1.8 KB)
marketing/continuation.yaml (2.4 KB)
marketing/MEMORY.yaml (2.8 KB)
marketing/schemas/output-contract.schema.json (1.8 KB)
mcp-config.json (11.7 KB)
mcp/begin.yaml (1.8 KB)
mcp/continuation.yaml (2.4 KB)
mcp/MEMORY.yaml (2.7 KB)
mcp/schemas/output-contract.schema.json (1.8 KB)
memory generator.yaml (7.6 KB)
messaging-system.yaml (2.5 KB)
meta-tag-audit.json (26.5 KB)
negotiation-rules.md (7.6 KB)
notebook-summary.md (3.6 KB)
notebook/begin.yaml (1.8 KB)
notebook/continuation.yaml (2.4 KB)
notebook/MEMORY.yaml (2.9 KB)
notebook/schemas/output-contract.schema.json (1.8 KB)
obsidian-skill-pack.md (3.2 KB)
obsidian-vault-pack.md (9.3 KB)
obsidian/begin.yaml (1.8 KB)
obsidian/continuation.yaml (2.4 KB)
obsidian/MEMORY.yaml (2.8 KB)
obsidian/schemas/output-contract.schema.json (1.8 KB)
optimization-rules.md (6.3 KB)
optimization/begin.yaml (2.5 KB)
optimization/continuation.yaml (2.4 KB)
optimization/MEMORY.yaml (3.7 KB)
optimization/schemas/output-contract.schema.json (1.8 KB)
package.json (0.6 KB)
packages/context-engine/package.json (0.4 KB)
packages/context-engine/src/engine-branches.test.ts (27.5 KB)
packages/context-engine/src/engine-branches2.test.ts (7.6 KB)
packages/context-engine/src/engine-branches3.test.ts (7.5 KB)
packages/context-engine/src/engine-edge.test.ts (8.7 KB)
packages/context-engine/src/engine.test.ts (13.8 KB)
packages/context-engine/src/engine.ts (19.0 KB)
packages/context-engine/src/index.ts (0.1 KB)
packages/context-engine/src/types.ts (2.7 KB)
packages/context-engine/tsconfig.json (0.2 KB)
packages/generator-core/package.json (0.4 KB)
packages/generator-core/src/file-excerpt-utils.ts (5.4 KB)
packages/generator-core/src/fw-helpers.ts (0.5 KB)
packages/generator-core/src/generate-programs.test.ts (11.8 KB)
packages/generator-core/src/generate-symbol-index.test.ts (10.0 KB)
packages/generator-core/src/generate-validation.test.ts (10.9 KB)
packages/generator-core/src/generate.test.ts (42.2 KB)
packages/generator-core/src/generate.ts (17.2 KB)
packages/generator-core/src/generator-alt-profiles.test.ts (17.0 KB)
packages/generator-core/src/generator-branches.test.ts (217.7 KB)
packages/generator-core/src/generator-sourcefile-branches.test.ts (20.9 KB)
packages/generator-core/src/generator-sourcefile-branches10.test.ts (34.2 KB)
packages/generator-core/src/generator-sourcefile-branches11.test.ts (21.4 KB)
packages/generator-core/src/generator-sourcefile-branches12.test.ts (16.3 KB)
packages/generator-core/src/generator-sourcefile-branches13.test.ts (10.5 KB)
packages/generator-core/src/generator-sourcefile-branches14.test.ts (13.8 KB)
packages/generator-core/src/generator-sourcefile-branches15.test.ts (9.2 KB)
packages/generator-core/src/generator-sourcefile-branches16.test.ts (22.5 KB)
packages/generator-core/src/generator-sourcefile-branches17.test.ts (15.9 KB)
packages/generator-core/src/generator-sourcefile-branches18.test.ts (28.8 KB)
packages/generator-core/src/generator-sourcefile-branches19.test.ts (12.6 KB)
packages/generator-core/src/generator-sourcefile-branches2.test.ts (23.9 KB)
packages/generator-core/src/generator-sourcefile-branches20.test.ts (9.5 KB)
packages/generator-core/src/generator-sourcefile-branches3.test.ts (31.0 KB)
packages/generator-core/src/generator-sourcefile-branches4.test.ts (24.7 KB)
packages/generator-core/src/generator-sourcefile-branches5.test.ts (29.0 KB)
packages/generator-core/src/generator-sourcefile-branches6.test.ts (26.0 KB)
packages/generator-core/src/generator-sourcefile-branches7.test.ts (36.7 KB)
packages/generator-core/src/generator-sourcefile-branches8.test.ts (49.1 KB)
packages/generator-core/src/generator-sourcefile-branches9.test.ts (33.5 KB)
packages/generator-core/src/generators-agentic-purchasing.test.ts (52.9 KB)
packages/generator-core/src/generators-agentic-purchasing.ts (59.8 KB)
packages/generator-core/src/generators-algorithmic.ts (26.2 KB)
packages/generator-core/src/generators-artifacts.ts (28.2 KB)
packages/generator-core/src/generators-brand.ts (32.2 KB)
packages/generator-core/src/generators-canvas.ts (27.1 KB)
packages/generator-core/src/generators-debug.ts (42.0 KB)
packages/generator-core/src/generators-frontend.ts (27.6 KB)
packages/generator-core/src/generators-marketing.ts (35.4 KB)
packages/generator-core/src/generators-mcp.ts (26.7 KB)
packages/generator-core/src/generators-notebook.ts (24.9 KB)
packages/generator-core/src/generators-obsidian.ts (28.5 KB)
packages/generator-core/src/generators-optimization.ts (26.1 KB)
packages/generator-core/src/generators-remotion.ts (32.1 KB)
packages/generator-core/src/generators-search-funcs.test.ts (11.8 KB)
packages/generator-core/src/generators-search.ts (17.9 KB)
packages/generator-core/src/generators-seo.ts (35.8 KB)
packages/generator-core/src/generators-skills.ts (42.5 KB)
packages/generator-core/src/generators-superpowers.ts (37.4 KB)
packages/generator-core/src/generators-theme.ts (45.9 KB)
packages/generator-core/src/index.ts (2.9 KB)
packages/generator-core/src/pipeline.test.ts (9.7 KB)
packages/generator-core/src/types.ts (0.6 KB)
packages/generator-core/tsconfig.json (0.2 KB)
packages/repo-parser/package.json (0.4 KB)
packages/repo-parser/src/domain-extractor.test.ts (7.7 KB)
packages/repo-parser/src/domain-extractor.ts (6.7 KB)
packages/repo-parser/src/framework-detector.test.ts (13.7 KB)
packages/repo-parser/src/framework-detector.ts (7.7 KB)
packages/repo-parser/src/import-resolver.test.ts (8.6 KB)
packages/repo-parser/src/import-resolver.ts (3.8 KB)
packages/repo-parser/src/index.ts (0.6 KB)
packages/repo-parser/src/language-detector.test.ts (3.7 KB)
packages/repo-parser/src/language-detector.ts (1.7 KB)
packages/repo-parser/src/parser-branches.test.ts (13.2 KB)
packages/repo-parser/src/parser-branches2.test.ts (7.1 KB)
packages/repo-parser/src/parser-branches3.test.ts (10.1 KB)
packages/repo-parser/src/parser.test.ts (9.1 KB)
packages/repo-parser/src/parser.ts (14.5 KB)
packages/repo-parser/src/perf.bench.ts (6.1 KB)
packages/repo-parser/src/sql-extractor.test.ts (8.9 KB)
packages/repo-parser/src/sql-extractor.ts (4.3 KB)
packages/repo-parser/src/types.ts (2.0 KB)
packages/repo-parser/tsconfig.json (0.2 KB)
packages/snapshots/package.json (0.4 KB)
packages/snapshots/src/b-grade-upgrade.test.ts (8.4 KB)
packages/snapshots/src/billing-edge-cases.test.ts (14.5 KB)
packages/snapshots/src/billing-store.ts (13.1 KB)
packages/snapshots/src/billing-types.ts (3.9 KB)
packages/snapshots/src/billing.test.ts (12.2 KB)
packages/snapshots/src/coverage-gaps.test.ts (22.8 KB)
packages/snapshots/src/db-maintenance.test.ts (6.7 KB)
packages/snapshots/src/db.test.ts (15.8 KB)
packages/snapshots/src/db.ts (20.7 KB)
packages/snapshots/src/email-store.test.ts (10.7 KB)
packages/snapshots/src/email-store.ts (9.0 KB)
packages/snapshots/src/funnel-edge-cases.test.ts (10.7 KB)
packages/snapshots/src/funnel-store.test.ts (3.8 KB)
packages/snapshots/src/funnel-store.ts (15.1 KB)
packages/snapshots/src/funnel-types.ts (7.0 KB)
packages/snapshots/src/funnel.test.ts (17.4 KB)
packages/snapshots/src/github-http.test.ts (12.7 KB)
packages/snapshots/src/github-tarball.test.ts (13.2 KB)
packages/snapshots/src/github-token-branches.test.ts (3.8 KB)
packages/snapshots/src/github-token-store.ts (5.1 KB)
packages/snapshots/src/github.ts (7.7 KB)
packages/snapshots/src/index.ts (5.8 KB)
packages/snapshots/src/oauth-store.test.ts (8.5 KB)
packages/snapshots/src/oauth-store.ts (4.6 KB)
packages/snapshots/src/perf.bench.ts (6.9 KB)
packages/snapshots/src/persistence-metering.test.ts (9.9 KB)
packages/snapshots/src/persistence-metering.ts (4.9 KB)
packages/snapshots/src/referral-e2e.test.ts (10.2 KB)
packages/snapshots/src/referral-store.test.ts (9.8 KB)
packages/snapshots/src/referral-store.ts (9.8 KB)
packages/snapshots/src/search-store.test.ts (6.8 KB)
packages/snapshots/src/search-store.ts (9.7 KB)
packages/snapshots/src/search-symbols.test.ts (9.3 KB)
packages/snapshots/src/store-layer5.test.ts (4.0 KB)
packages/snapshots/src/store-validation.test.ts (15.6 KB)
packages/snapshots/src/store.test.ts (10.8 KB)
packages/snapshots/src/store.ts (9.3 KB)
packages/snapshots/src/stripe-store.test.ts (8.5 KB)
packages/snapshots/src/stripe-store.ts (5.1 KB)
packages/snapshots/src/tier-audit.ts (3.8 KB)
packages/snapshots/src/types.ts (1.1 KB)
packages/snapshots/src/version-store.ts (5.1 KB)
packages/snapshots/src/webhook-http.test.ts (13.3 KB)
packages/snapshots/src/webhook-retry.test.ts (16.6 KB)
packages/snapshots/src/webhook-store.ts (14.2 KB)
packages/snapshots/tsconfig.json (0.2 KB)
parameter-pack.json (2.2 KB)
payment-processing-output/ab-test-plan.md (2.4 KB)
payment-processing-output/AGENTS.md (2.0 KB)
payment-processing-output/architecture-summary.md (3.2 KB)
payment-processing-output/artifact-spec.md (2.2 KB)
payment-processing-output/asset-checklist.md (1.2 KB)
payment-processing-output/asset-guidelines.md (1.7 KB)
payment-processing-output/automation-pipeline.yaml (2.1 KB)
payment-processing-output/brand-board.md (4.0 KB)
payment-processing-output/brand-guidelines.md (2.5 KB)
payment-processing-output/campaign-brief.md (1.6 KB)
payment-processing-output/canvas-spec.json (3.5 KB)
payment-processing-output/capability-registry.json (1.8 KB)
payment-processing-output/channel-rulebook.md (2.6 KB)
payment-processing-output/citation-index.json (2.6 KB)
payment-processing-output/CLAUDE.md (0.9 KB)
payment-processing-output/collection-map.md (2.2 KB)
payment-processing-output/component-guidelines.md (0.8 KB)
payment-processing-output/component-library.json (5.6 KB)
payment-processing-output/component-theme-map.json (58.8 KB)
payment-processing-output/connector-map.yaml (0.9 KB)
payment-processing-output/content-audit.md (4.4 KB)
payment-processing-output/content-constraints.md (2.4 KB)
payment-processing-output/cost-estimate.json (6.5 KB)
payment-processing-output/cro-playbook.md (3.0 KB)
payment-processing-output/dark-mode-tokens.json (2.8 KB)
payment-processing-output/dashboard-widget.tsx (0.2 KB)
payment-processing-output/dependency-hotspots.md (2.3 KB)
payment-processing-output/embed-snippet.ts (1.4 KB)
payment-processing-output/export-manifest.yaml (2.2 KB)
payment-processing-output/funnel-map.md (2.2 KB)
payment-processing-output/generated-component.tsx (0.5 KB)
payment-processing-output/generative-sketch.ts (3.9 KB)
payment-processing-output/graph-prompt-map.json (4.2 KB)
payment-processing-output/incident-template.md (1.1 KB)
payment-processing-output/layout-patterns.md (1.8 KB)
payment-processing-output/linking-policy.md (3.0 KB)
payment-processing-output/mcp-config.json (2.7 KB)
payment-processing-output/messaging-system.yaml (1.5 KB)
payment-processing-output/meta-tag-audit.json (7.3 KB)
payment-processing-output/notebook-summary.md (1.2 KB)
payment-processing-output/obsidian-skill-pack.md (2.0 KB)
payment-processing-output/parameter-pack.json (2.2 KB)
payment-processing-output/policy-pack.md (1.4 KB)
payment-processing-output/poster-layouts.md (2.8 KB)
payment-processing-output/prompt-diff-report.md (1.4 KB)
payment-processing-output/refactor-checklist.md (2.0 KB)
payment-processing-output/remotion-script.ts (3.5 KB)
payment-processing-output/render-config.json (1.2 KB)
payment-processing-output/research-threads.md (2.3 KB)
payment-processing-output/root-cause-checklist.md (2.9 KB)
payment-processing-output/route-priority-map.md (1.0 KB)
payment-processing-output/scene-plan.md (2.1 KB)
payment-processing-output/schema-recommendations.json (0.5 KB)
payment-processing-output/sequence-pack.md (1.7 KB)
payment-processing-output/server-manifest.yaml (2.8 KB)
payment-processing-output/social-pack.md (1.6 KB)
payment-processing-output/source-map.json (4.8 KB)
payment-processing-output/storyboard.md (4.5 KB)
payment-processing-output/study-brief.md (2.4 KB)
payment-processing-output/superpower-pack.md (1.9 KB)
payment-processing-output/template-pack.md (2.1 KB)
payment-processing-output/test-generation-rules.md (2.0 KB)
payment-processing-output/theme-guidelines.md (5.6 KB)
payment-processing-output/theme.css (6.4 KB)
payment-processing-output/token-budget-plan.md (2.3 KB)
payment-processing-output/tracing-rules.md (1.4 KB)
payment-processing-output/ui-audit.md (2.2 KB)
payment-processing-output/variation-matrix.json (6.9 KB)
payment-processing-output/vault-rules.md (2.1 KB)
payment-processing-output/voice-and-tone.md (2.5 KB)
payment-processing-output/workflow-pack.md (2.0 KB)
payment-processing-output/workflow-registry.json (1.8 KB)
pnpm-lock.yaml (0.0 KB)
pnpm-workspace.yaml (0.1 KB)
policy-pack.md (2.6 KB)
poster-layouts.md (3.1 KB)
product-schema.json (7.7 KB)
ProgramPipeline.js (11.3 KB)
prompt-diff-report.md (2.3 KB)
README.md (9.2 KB)
refactor-checklist.md (4.0 KB)
remotion-pack.md (9.2 KB)
remotion-script.ts (3.7 KB)
remotion/begin.yaml (1.8 KB)
remotion/continuation.yaml (2.4 KB)
remotion/MEMORY.yaml (2.8 KB)
remotion/schemas/output-contract.schema.json (1.8 KB)
render-config.json (8.4 KB)
render.yaml (1.2 KB)
repo_snapshot.yaml (80.7 KB)
research-threads.md (3.7 KB)
root-cause-checklist.md (22.2 KB)
route-priority-map.md (28.0 KB)
rules to compile snapshot.yaml (19.4 KB)
scene-plan.md (2.8 KB)
schema-recommendations.json (6.3 KB)
scripts/regenerate.ps1 (1.4 KB)
scripts/regenerate.sh (0.8 KB)
search/begin.yaml (3.7 KB)
search/continuation.yaml (2.4 KB)
search/MEMORY.yaml (5.9 KB)
search/schemas/context-map.schema.json (10.9 KB)
search/schemas/output-contract.schema.json (1.8 KB)
search/schemas/repo-profile.schema.yaml (6.7 KB)
seo/begin.yaml (3.6 KB)
seo/continuation.yaml (2.4 KB)
seo/MEMORY.yaml (5.8 KB)
```

## Hotspot File Excerpts

### `apps/web/src/api.ts`

```typescript
const API_BASE = import.meta.env.VITE_API_URL ?? "";

// ─── Snapshot types ─────────────────────────────────────────────

export interface SnapshotPayload {
  input_method: string;
  manifest: {
    project_name: string;
    project_type: string;
    frameworks: string[];
    goals: string[];
    requested_outputs: string[];
  };
  files: Array<{ path: string; content: string; size: number }>;
}

export interface SnapshotResponse {
  snapshot_id: string;
  project_id: string;
  status: string;
  context_map: ContextMap;
  repo_profile: RepoProfile;
  generated_files: Array<{ path: string; program: string; description: string }>;
}

... (461 more lines)
```

### `apps/web/src/App.tsx`

```tsx
import { useState, useCallback, useEffect, useRef, useMemo, Component, type ReactNode } from "react";
import { UploadPage } from "./pages/UploadPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { PlansPage } from "./pages/PlansPage.tsx";
import { AccountPage } from "./pages/AccountPage.tsx";
import { DocsPage } from "./pages/DocsPage.tsx";
import { HelpPage } from "./pages/HelpPage.tsx";
import { QAPage } from "./pages/QAPage.tsx";
import { ProgramsPage } from "./pages/ProgramsPage.tsx";
import { TermsPage } from "./pages/TermsPage.tsx";
import { ForAgentsPage } from "./pages/ForAgentsPage.tsx";
import { ExamplesPage } from "./pages/ExamplesPage.tsx";
import { InstallPage } from "./pages/InstallPage.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import type { SnapshotResponse } from "./api.ts";

// ─── Error Boundary ─────────────────────────────────────────────
// React requires a class for getDerivedStateFromError; this thin wrapper
// keeps the rest of the codebase class-free per .cursorrules.

class ErrorCatcher extends Component<{ children: ReactNode; fallback: (error: Error, reset: () => void) => ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
... (301 more lines)
```

### `apps/web/src/pages/DashboardPage.tsx`

```tsx
import { useState, useEffect } from "react";
import type { SnapshotResponse, GeneratedFile } from "../api.ts";
import { getGeneratedFiles, runProgram, downloadExport } from "../api.ts";
import { OverviewTab } from "../components/OverviewTab.tsx";
import { FilesTab } from "../components/FilesTab.tsx";
import { GraphTab } from "../components/GraphTab.tsx";
import { GeneratedTab } from "../components/GeneratedTab.tsx";
import { ProgramLauncher } from "../components/ProgramLauncher.tsx";
import { SearchTab } from "../components/SearchTab.tsx";
import { useToast } from "../components/Toast.tsx";

interface Props {
  result: SnapshotResponse;
  onGeneratedCountChange?: (count: number) => void;
}

const TABS = ["Overview", "Structure", "Dependencies", "Generated Files", "Programs", "Search"] as const;
type Tab = (typeof TABS)[number];

function NextStepsCard({ fileCount, onDownload, downloading }: { fileCount: number; onDownload: () => void; downloading: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || fileCount === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: "3px solid var(--accent)", padding: "16px 20px" }}>
... (155 more lines)
```
