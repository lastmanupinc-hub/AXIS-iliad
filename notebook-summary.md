# AXIS Toolbox — Notebook Summary (Source Map)

## Project Source Map

### Repository Structure
```
axis-toolbox/
├── apps/
│   ├── api/          → HTTP server, 102 endpoints, zero-dep router
│   ├── cli/          → axis analyze / axis github commands
│   └── web/          → React 19 + Vite 6 SPA dashboard
├── packages/
│   ├── snapshots/    → SQLite WAL, 5 tables, intake pipeline
│   ├── repo-parser/  → 60+ languages, 10+ frameworks, import resolution
│   ├── context-engine/ → Context map builder, repo profile, route extraction
│   └── generator-core/ → 87 generators, 18 program modules
├── governance/       → 12 YAML constitutional files
├── .github/          → Actions CI (Node 20/22 matrix)
└── Dockerfile        → Render deployment
```

### File Census

| Location | File Count | Primary Language | Purpose |
|----------|-----------|-----------------|---------|
| apps/api | ~15 | TypeScript | HTTP router, handlers, middleware, auth |
| apps/cli | ~5 | TypeScript | CLI entry, GitHub integration |
| apps/web | ~20 | TypeScript/TSX | React components, CSS, Vite config |
| packages/snapshots | ~10 | TypeScript | SQLite schema, intake, billing |
| packages/repo-parser | ~15 | TypeScript | Language maps, framework detectors, AST |
| packages/context-engine | ~10 | TypeScript | Context map, repo profile, analysis |
| `packages/generator-core/` | ~25 | TypeScript | 87 generator implementations |
| governance | 12 | YAML | Constitutional control layer |
| tests | 131 files | TypeScript | 3,906 test cases |
| config | ~5 | JSON/YAML/TOML | tsconfig, vitest, pnpm-workspace |

**Estimated Total**: ~120 source files + 101 test files + 12 YAML governance files

### Critical Path Files (Highest Impact)

| File | Centrality | Why It Matters |
|------|-----------|---------------|
| `packages/generator-core/src/index.ts` | 9.5/10 | All 87 generators route through here |
| `apps/api/src/handlers.ts` | 9.0/10 | All 102 endpoints defined here |
| `packages/snapshots/src/store.ts` | 8.5/10 | Database access layer, every read/write |
| `continuation.yaml` | 8.0/10 | Live state truth — 2000+ lines |
| `axis_all_tools.yaml` | 7.5/10 | Canonical program definitions |
| `packages/repo-parser/src/detect.ts` | 7.0/10 | Language + framework detection entry |
| `packages/context-engine/src/context-map.ts` | 7.0/10 | Context graph construction |
| `apps/web/src/App.tsx` | 6.5/10 | SPA root, dashboard routing |
| `apps/api/src/middleware/auth.ts` | 6.0/10 | API key validation, rate limiting |
| `packages/snapshots/src/intake.ts` | 6.0/10 | Snapshot processing pipeline |

---

## Research Threads

### Thread 1: YAML Governance Architecture
**Question**: How do 12 YAML files create a self-governing AI system?

**Findings**:
- The 12 YAML files form a constitutional hierarchy: `begin.yaml` gates session entry (8 conditions), `continuation.yaml` maintains live state (ground truth), `axis_all_tools.yaml` defines canonical program specs (supersedes all other sources), `automated_remedial_action.yaml` runs self-audit loops
- Governance is not advisory — it's enforced by the execution model. The session cannot proceed without clearing begin.yaml gates. Capabilities cannot be promoted without evidence matching `capability_inventory.yaml` criteria
- `hygiene_and_memory.yaml` routes behavior through 4 phases: hygiene arbitration → canonical reassertion → memory implementation → state update
- Self-audit termination condition: `focus_scores ≤ 35` across all categories
- This pattern is novel: no other open-source project uses YAML as a constitutional control layer for AI behavior

**Open Questions**: How does the governance scale with additional programs beyond 18? What happens when YAML files conflict (e.g., begin.yaml gates vs. continuation.yaml state)?

---

### Thread 2: Deterministic Generation
**Question**: How does generator-core guarantee byte-identical output?

**Findings**:
- 6 dedicated determinism tests verify that the same input produces identical output bytes
- Generators are pure functions: `(snapshot: Snapshot, config: GeneratorConfig) => string`
- No randomness, no timestamps in output (unless explicitly part of the generator contract)
- Template engine is custom-built — no Handlebars/EJS/Mustache dependency
- Output format is determined by program spec in axis_all_tools.yaml (markdown, JSON, YAML, TypeScript, JavaScript, CSS)
- Determinism enables CI validation: if a generator changes output, tests catch it immediately

**Open Questions**: How are edge cases handled (e.g., OS-specific line endings, locale-dependent sorting)? What's the performance profile for large repos with 1000+ files?

---

### Thread 3: Zero-Dependency HTTP Router
**Question**: Why build a custom HTTP server instead of using Express/Fastify?

**Findings**:
- Core invariant: "Zero external runtime HTTP dependencies"
- The router uses Node.js native `http.createServer()` with a custom routing table
- Pattern matching for routes, middleware chain for auth/rate-limiting/CORS
- 102 endpoints across: snapshots CRUD, projects, accounts, billing, webhooks, generated files, health, metrics
- Rate limiting: 60 req/min standard, 120 req/min for auth endpoints
- Prometheus metrics endpoint for observability
- OpenAPI 3.1 spec generated from route definitions
- Benefit: zero supply chain risk from HTTP framework vulnerabilities (no Express CVEs apply)

**Open Questions**: What's the performance baseline vs. Fastify for equivalent route count? How is WebSocket support planned (for live generation progress)?

---

### Thread 4: Snapshot Pipeline Architecture
**Question**: How does a repo go from upload to 87 generated artifacts?

**Findings**:
- **5 input methods**: ZIP upload, GitHub URL, local directory (CLI), API POST, webhook trigger
- **Pipeline**: Input → Validation → Extraction → repo-parser (language/framework detection) → context-engine (context map + repo profile) → generator-core (87 generators) → Output (individual files or ZIP export)
- **Storage**: SQLite WAL mode, 5 tables: snapshots, projects, accounts, billings, webhooks
- **Billing**: Per-program SKU. Free tier: Search + Skills + Debug (14 generators). Pro: all 87
- **Output contract**: Each generator produces a specific file at a specific path with a specific format
- The pipeline is synchronous per snapshot — no job queue. This is a design choice, not a limitation (keeps complexity low)

**Open Questions**: What's the processing time distribution for repos of different sizes? Is there a cache layer for repeated analysis of the same repo at the same commit?

---

### Thread 5: Testing Strategy (2,910 Tests)
**Question**: How is 91.5% coverage achieved and maintained?

**Findings**:
- Framework: Vitest 4.1 (not Jest — faster, ESM-native)
- 101 test files across all packages and apps
- Test types: unit (generators, parsers, detectors), integration (API endpoints, full pipeline), determinism (byte-identical output), snapshot tests (expected output comparison)
- CI matrix: Node 20 + Node 22, ensuring forward compatibility
- Coverage enforcement: statement coverage tracked, likely with threshold in vitest config
- 6 determinism tests are a unique innovation — most projects don't test for output stability

**Open Questions**: What's the test execution time? Are there flaky tests? Is there mutation testing?

---

### Thread 6: Monorepo Package Architecture
**Question**: How do the 4 packages + 3 apps interact?

**Findings**:
- **Dependency flow** (strictly one-directional):
  ```
  apps/api → packages/snapshots + packages/context-engine + packages/generator-core
  apps/cli → packages/repo-parser + packages/context-engine + packages/generator-core
  apps/web → (API client only, no direct package imports)
  packages/generator-core → packages/context-engine (for context data types)
  packages/context-engine → packages/repo-parser (for detection results)
  packages/snapshots → (standalone, no package deps)
  packages/repo-parser → (standalone, no package deps)
  ```
- pnpm workspaces for package management
- TypeScript project references for build order
- Each package has its own tsconfig.json, test suite, and export boundary
- No circular dependencies (invariant #6 in the system)

**Open Questions**: Is there a shared types package, or are types duplicated? How are package versions managed (independent or lockstep)?

---

## Key Metrics Dashboard

| Metric | Value | Source |
|--------|-------|--------|
| Total tests | 2,910 | vitest |
| Test files | 131 | vitest |
| Statement coverage | 99.99% | vitest --coverage |
| Capabilities Grade A | 83/83 | capability_inventory.yaml |
| Programs | 18 | axis_all_tools.yaml |
| Generators | 87 | generator-core |
| API endpoints | 102 | apps/api handlers |
| Languages detected | 60+ | repo-parser |
| Frameworks detected | 10+ | repo-parser |
| YAML governance files | 12 | governance/ |
| Determinism tests | 6 | vitest |
| External HTTP deps | 0 | package.json |

---

## Cross-References

| Output | Path | Program |
|--------|------|---------|
| Context Map | `.ai/context-map.json` | Search |
| Repo Profile | `.ai/repo-profile.yaml` | Search |
| Architecture Summary | `architecture-summary.md` | Search |
| Dependency Hotspots | `dependency-hotspots.md` | Search |
| Debug Playbook | `.ai/debug-playbook.md` | Debug |
| Tracing Rules | `.ai/tracing-rules.md` | Debug |
| Agent Instructions | `AGENTS.md` | Skills |
| Claude Context | `CLAUDE.md` | Skills |
| Cursor Rules | `.cursorrules` | Skills |
| Workflow Pack | `workflow-pack.md` | Skills |
| Frontend + SEO | `.ai/frontend-rules.md` | Frontend + SEO |
| Design Tokens | `.ai/design-tokens.json` | Theme |
| Brand Guidelines | `brand-guidelines.md` | Brand |
| This Notebook | `notebook-summary.md` | Notebook |
