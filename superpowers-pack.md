# AXIS Toolbox — Superpowers Pack

## Superpower Index

17 distinct superpowers identified from codebase analysis. Ranked by rarity (how few other tools possess this capability) and impact (measurable improvement for users).

| # | Superpower | Rarity | Impact | Category |
|---|-----------|--------|--------|----------|
| 1 | YAML Constitutional Governance | ★★★★★ | ★★★★★ | Architecture |
| 2 | Deterministic Multi-Format Generation | ★★★★★ | ★★★★☆ | Core Engine |
| 3 | Self-Auditing Quality Loop | ★★★★★ | ★★★★★ | Governance |
| 4 | 80 Generators Across 17 Programs | ★★★★☆ | ★★★★★ | Breadth |
| 5 | Zero External HTTP Dependencies | ★★★★★ | ★★★★☆ | Security |
| 6 | AI Agent Context Generation | ★★★★☆ | ★★★★★ | Interop |
| 7 | 60+ Language Detection | ★★★☆☆ | ★★★★☆ | Detection |
| 8 | Constitutional Memory System | ★★★★★ | ★★★☆☆ | Governance |
| 9 | Session Gate Protocol | ★★★★★ | ★★★★☆ | Governance |
| 10 | Snapshot-as-Truth Architecture | ★★★★☆ | ★★★★☆ | Architecture |
| 11 | Per-Program Billing Granularity | ★★★☆☆ | ★★★☆☆ | Business |
| 12 | Evidence-Required Promotion | ★★★★★ | ★★★★★ | Quality |
| 13 | Monorepo Package Isolation | ★★☆☆☆ | ★★★☆☆ | Architecture |
| 14 | Custom Template Engine | ★★★★☆ | ★★★☆☆ | Core Engine |
| 15 | Full-Stack Self-Analysis | ★★★★★ | ★★★★☆ | Meta |

---

## Detailed Superpower Profiles

### 1. YAML Constitutional Governance
**Rarity**: ★★★★★ (Unique — no other known tool uses YAML as a constitutional control layer for AI behavior)

12 YAML files form a hierarchical constitution that governs every aspect of system behavior:
- **begin.yaml**: 8 gate conditions — session cannot start without clearing all gates
- **continuation.yaml**: Live state ledger (2000+ lines) — single source of truth
- **axis_all_tools.yaml**: Canonical program definitions — supersedes all other descriptions
- **automated_remedial_action.yaml**: Self-audit loop with focus scoring formula

This isn't configuration. It's legislation. The YAML files don't describe what the system *should* do — they constrain what it *can* do.

**Evidence**: 12 YAML files in governance/, each enforced by the execution model.

---

### 2. Deterministic Multi-Format Generation
**Rarity**: ★★★★★ (Most generators use randomness, timestamps, or non-deterministic ordering)

80 generators produce byte-identical output for the same input. Verified by 6 dedicated determinism tests. Output formats span: Markdown, JSON, YAML, TypeScript, JavaScript, CSS.

**Why it matters**: Determinism enables CI validation. If a generator changes output without input changing, it's a regression — caught automatically.

**Evidence**: 6 determinism test cases in vitest suite. Zero random() calls in generator-core.

---

### 3. Self-Auditing Quality Loop
**Rarity**: ★★★★★ (No other known dev tool continuously audits its own capabilities with a formal grading system)

`automated_remedial_action.yaml` defines:
- 9 grading categories
- Focus scoring formula per category
- Single highest-ROI execution per audit cycle
- Termination condition: `focus_scores ≤ 35` (all categories healthy)

The system grades itself on every capability (A/B/F), identifies the weakest point, addresses it, re-grades, and repeats. Currently: 81/82 at Grade A.

**Evidence**: capability_inventory.yaml with grades, automated_remedial_action.yaml with formula.

---

### 4. 80 Generators Across 17 Programs
**Rarity**: ★★★★☆ (Most tools generate 1-5 artifact types. 80 is an order of magnitude more.)

From a single snapshot (ZIP, GitHub URL, or local dir), the system generates 80 distinct artifacts spanning:
- Developer context (AGENTS.md, CLAUDE.md, .cursorrules)
- Architecture analysis (context maps, dependency hotspots)
- Debug intelligence (playbooks, tracing rules)
- Design system (tokens, color schemes)
- Marketing materials (brand guidelines, competitive landscape, email sequences)
- Video production (storyboards, scene configs)
- Knowledge management (Obsidian vault structure, Dataview queries)

**Evidence**: axis_all_tools.yaml lists every program and generator with output specs.

---

### 5. Zero External HTTP Dependencies
**Rarity**: ★★★★★ (Almost every Node.js HTTP server uses Express, Fastify, Koa, or Hono)

The API server uses Node.js native `http.createServer()` with a custom routing table. 102 endpoints, middleware chain, auth, rate limiting, CORS, Prometheus metrics — all without a single HTTP framework dependency.

**Why it matters**: Zero supply chain risk from HTTP framework CVEs. No dependency drift. No breaking changes from upstream.

**Evidence**: package.json has zero HTTP framework entries. apps/api/src/ contains custom router.

---

### 6. AI Agent Context Generation
**Rarity**: ★★★★☆ (Some tools generate .cursorrules. None generate AGENTS.md + CLAUDE.md + .cursorrules + workflow instructions from analysis.)

The Skills program generates files that AI coding assistants consume as context:
- `AGENTS.md` — Comprehensive project context for any AI agent
- `CLAUDE.md` — Concise 10-rule context for Claude
- `.cursorrules` — Editor rules for Cursor
- `workflow-pack.md` — Step-by-step workflows for 9 common tasks
- `.copilot-instructions.md` — GitHub Copilot instructions

These aren't generic templates. They're generated from actual codebase analysis — the invariants, architecture, banned patterns, and style rules are all real.

**Evidence**: Generated files contain project-specific data (test counts, package names, file paths).

---

### 7. 60+ Language Detection
**Rarity**: ★★★☆☆ (GitHub Linguist does similar. But AXIS combines it with framework detection and feeds it into generators.)

repo-parser maps 60+ file extensions to language categories, then detects 10+ frameworks (including Go-specific: Chi, Gin, Echo, Fiber). Results flow directly into context-engine and generator-core.

**Evidence**: packages/repo-parser/src/ language maps and framework detection modules.

---

### 8. Constitutional Memory System
**Rarity**: ★★★★★ (No other tool uses a MEMORY.yaml standard with 6 typed layers)

`memory_generator.yaml` defines MEMORY.yaml v2.0:
- **Semantic memory**: Factual knowledge about the codebase
- **Episodic memory**: Session-specific events and decisions
- **Procedural memory**: How-to patterns and workflows
- **Prospective memory**: Planned future actions
- **Creative memory**: Architectural insights and ideas
- **Provenance memory**: Source tracking for all knowledge

**Evidence**: memory_generator.yaml specification.

---

### 9. Session Gate Protocol
**Rarity**: ★★★★★ (Most tools have no concept of "session" for AI interactions)

`begin.yaml` enforces 8 conditions before any work begins. This prevents AI agents from starting work without proper context, avoiding wasted tokens and incorrect assumptions.

**Evidence**: begin.yaml with 8 gate conditions and optimization policy.

---

### 10. Snapshot-as-Truth Architecture
**Rarity**: ★★★★☆

Every analysis starts from a snapshot — a point-in-time capture of the repository. All generators operate on the snapshot, not the live filesystem. This ensures consistency: every artifact is generated from the same state.

**Evidence**: packages/snapshots/ intake pipeline, snapshot_protocol.yaml.

---

### 11. Per-Program Billing Granularity
**Rarity**: ★★★☆☆

Instead of "free vs. pro" binary, AXIS allows per-program unlock. Users buy exactly the generators they need. Each program is a separate billing SKU.

**Evidence**: Billing schema in packages/snapshots/, tier assignments in axis_all_tools.yaml.

---

### 12. Evidence-Required Promotion
**Rarity**: ★★★★★ (Most projects self-assess quality subjectively)

No capability can be promoted from Grade B to Grade A without disk evidence: test results, coverage reports, or verified command output. This is enforced by capability_inventory.yaml and the verification discipline.

**Evidence**: capability_inventory.yaml grade requirements with evidence fields.

---

### 13. Monorepo Package Isolation
**Rarity**: ★★☆☆☆ (Common pattern, well-executed here)

4 packages + 3 apps with strictly one-directional dependencies. No circular imports. Each package has independent tests, exports, and tsconfig.

**Evidence**: pnpm-workspace.yaml, package.json files, TypeScript project references.

---

### 14. Custom Template Engine
**Rarity**: ★★★★☆

generator-core uses a built-in template engine — no Handlebars, EJS, or Mustache dependency. Produces Markdown, JSON, YAML, TypeScript, JavaScript, CSS from structured data.

**Evidence**: packages/generator-core/ implementation, zero template engine in dependencies.

---

### 15. Full-Stack Self-Analysis
**Rarity**: ★★★★★ (Running AXIS Toolbox on itself demonstrates every capability recursively)

This document exists because AXIS Toolbox can analyze its own codebase and generate all 17 programs worth of artifacts. The self-referential demo proves the system works at every layer.

**Evidence**: This file. All 17 program outputs generated for the Toolbox itself.

---

## Rarity Distribution

```
★★★★★ (Unique)     : 9 superpowers (60%)
★★★★☆ (Very Rare)  : 3 superpowers (20%)
★★★☆☆ (Rare)       : 2 superpowers (13%)
★★☆☆☆ (Uncommon)   : 1 superpower  (7%)
★☆☆☆☆ (Common)     : 0 superpowers (0%)
```

**9 of 15 superpowers are unique** — not possessed by any other known tool in the category.
