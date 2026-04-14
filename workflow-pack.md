# AXIS Toolbox — Workflow Pack

## Development Workflows

### Workflow 1: Add a New Generator

```
1. Check axis_all_tools.yaml for the program's output spec
2. Create generator file: packages/generator-core/src/generators/{program}/{output-name}.ts
3. Generator must be a pure function: (context: SnapshotContext) => string
4. Template variables resolve from context-map + repo-profile
5. Add export to program module index
6. Write vitest test in packages/generator-core/src/generators/{program}/__tests__/
7. Add determinism test: same input fixture → byte-identical output
8. Run: npx vitest run
9. Verify total generator count incremented (currently 80)
10. Update capability_inventory.yaml if new capability added
```

### Workflow 2: Add a New API Endpoint

```
1. Define endpoint in apps/api/src/handlers.ts
2. Add route registration in apps/api/src/router.ts
3. Add input validation (apps/api/src/validation.ts)
4. If authenticated: add to middleware chain
5. If metered: add usage tracking call
6. Add error code if new failure mode (22 existing codes)
7. Write vitest test in apps/api/src/__tests__/
8. Update OpenAPI spec (/v1/docs output)
9. Run: npx vitest run
10. Verify 102 endpoint count updated
```

### Workflow 3: Add Language Detection

```
1. Open packages/repo-parser/src/language-detector.ts
2. Add file extension mapping (60+ existing)
3. Add language-specific parsing rules if needed
4. Write test in packages/repo-parser/src/__tests__/
5. Ensure deterministic: same file set → same detection result
6. Run: npx vitest run
7. Verify parseRepo() includes new language in output
```

### Workflow 4: Add Framework Detection

```
1. Open packages/repo-parser/src/framework-detector.ts
2. Add detection rule: import pattern + usage pattern
3. Set confidence levels: 0.9 (high), 0.7 (medium), 0.3 (low)
4. Follow static_analysis_phase.yaml spec for deterministic output
5. Write test cases (import found, import + usage, import only)
6. Run: npx vitest run
7. Verify framework appears in repo-profile output
```

### Workflow 5: Add a New Program (17 → 18)

```
1. Define program in axis_all_tools.yaml:
   - slug, name, category, promise, description
   - acquisition_role, free features, paid features
   - meters, outputs, endpoints
2. Create generator module: packages/generator-core/src/generators/{slug}/
3. Implement N generators (one per output)
4. Add API endpoints in apps/api/src/handlers.ts
5. Add to capability_inventory.yaml with initial grades
6. Add to billing model (separate SKU)
7. Write tests for all generators + endpoints
8. Update continuation.yaml active_verticals
9. Run full test suite: npx vitest run
10. Update AGENTS.md program count
```

### Workflow 6: Run Full Test Suite

```bash
# All tests
npx vitest run

# With coverage
npx vitest run --coverage

# Specific package
npx vitest run --project snapshots
npx vitest run --project repo-parser
npx vitest run --project context-engine
npx vitest run --project generator-core

# Determinism tests only
npx vitest run -t "determinism"

# Watch mode (development)
npx vitest --watch
```

### Workflow 7: Local Development Setup

```bash
# Prerequisites: Node.js >= 20, pnpm >= 9

# Clone
git clone git@github.com:lastmanupinc-hub/AXIS-Scalpel.git
cd AXIS-Scalpel

# Install
pnpm install

# Build packages
pnpm -r build

# Start API (terminal 1)
cd apps/api && pnpm dev          # http://localhost:4000

# Start web (terminal 2)
cd apps/web && pnpm dev          # http://localhost:5173

# Verify health
curl http://localhost:4000/v1/health
```

### Workflow 8: Deploy to Production

```bash
# CI handles deployment automatically on push to main:
# 1. GitHub Actions runs tests (Node 20/22 matrix)
# 2. Coverage reported (must be >= 91.5%)
# 3. Docker build validated
# 4. Render auto-deploys from main (render.yaml)
# 5. Cloudflare Pages builds web SPA

# Manual deploy (if needed):
# Render: Push to main → auto-deploy
# Cloudflare: Push to main → auto-build
# Verify: curl https://api.domain.com/v1/health
```

### Workflow 9: Session Start (for AI Agents)

```
1. Read begin.yaml (session gate + optimization policy)
2. Read continuation.yaml (live state, active verticals, execution queue)
3. Check session gate (all 8 conditions must be true)
4. Identify highest-value active vertical
5. Select highest-ROI candidate from that vertical
6. Execute candidate
7. After completion: update continuation.yaml
8. Re-read automated_remedial_action.yaml
9. Repeat from step 4
```

---

## Policy Pack

### Policy 1: Zero External HTTP Dependencies
No Express, Fastify, Koa, Hapi, or any HTTP framework. The custom router in `apps/api/` is the canonical HTTP layer. This keeps the supply chain minimal and gives full control over routing, middleware, and error handling.

### Policy 2: Deterministic Generators
Every generator is a pure function: `(context: SnapshotContext) => string`. No external API calls, no timestamps, no random values, no runtime state. The 6 determinism tests enforce byte-identical output.

### Policy 3: SQLite Only
better-sqlite3 with WAL mode. No PostgreSQL, no MySQL, no MongoDB. Single-file database at `/data/axis.db`. Maintenance via POST /v1/db/maintenance (VACUUM, WAL checkpoint, integrity check).

### Policy 4: Vanilla CSS
No Tailwind, no CSS-in-JS, no styled-components. The web app uses vanilla CSS with a dark theme. Component styles are colocated. Design tokens are in CSS custom properties.

### Policy 5: Monolithic Vertical Saturation
Work style from begin.yaml: finish one vertical completely before opening new ones. No parallel vertical work. Active vertical gets all attention until promotion criteria met.

### Policy 6: Evidence-Required Promotion
No capability can be graded A without evidence: code reference, passing tests, exported artifact, and integration proof. Claims without evidence are refused.

### Policy 7: Per-Program Billing
Each of the 18 programs is a separate SKU. Users can buy individual programs. Suite bundle pricing is optional, not required. Usage is metered per program independently.

### Policy 8: Snapshot as Single Source
All 87 generators consume the snapshot output (context-map + repo-profile). No generator re-parses the repo. No generator calls external APIs. Snapshot is read-only input.

### Policy 9: Session Gate (8 Conditions)
Every work item must pass 8 conditions (begin.yaml). If any condition fails, the work is refused. No exceptions. The gate exists to prevent entropy.

### Policy 10: Continuous Self-Audit
automated_remedial_action.yaml defines a continuous loop: grade all subsystems (9 categories), calculate focus scores, fix the single highest-ROI item, then re-read the file. Loop terminates when all focus_scores ≤ 35.

### Policy 11: MEMORY.yaml as Constitutional Memory
Every folder gets a MEMORY.yaml (per memory_generator.yaml). Read on entry. Update on exit. Grade short-term files (1/2/3). Clean before expanding. Cross-folder sync required.

### Policy 12: Freemium Doctrine
Free tier: Search, Skills, Debug (diagnosis). Paid tier: 14 programs (execution). Free gives you the map. Paid gives you the tools. This is the acquisition engine.
